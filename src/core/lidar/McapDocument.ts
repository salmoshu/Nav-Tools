// MCAP 文件索引与解码：把整个文件读入内存后建立“话题 → 按时间排序的消息”索引。
// 设计对齐 E-Wagon-Lidar 的录制形态（ros2 profile / cdr / ros2msg schema、
// 单调时钟 ns 时间戳、单分片 ≤10MiB）；schema 一律从文件内读取，不硬编码。
// 支持多分片会话（板端 part_N.mcap 轮转产物一次传入、按 logTime 归并）与
// 截断/无索引文件的流式回退（崩溃掉电的残缺分片尽量挽回）。
import { MCAP_MAGIC, McapIndexedReader, McapStreamReader, hasMcapPrefix } from '@mcap/core'
import { parse } from '@foxglove/rosmsg'
import type { MessageDefinition } from '@foxglove/message-definition'
import { MessageReader } from '@foxglove/rosmsg2-serialization'
import type { CurrentMessage, McapFileMeta, McapTopicInfo } from './types'

/** 内存 IReadable 适配器：整个文件已在 Uint8Array 里。 */
class BufferReadable {
  public constructor(private readonly bytes: Uint8Array) {}
  public async size(): Promise<bigint> {
    return BigInt(this.bytes.byteLength)
  }
  public async read(offset: bigint, size: bigint): Promise<Uint8Array> {
    const start = Number(offset)
    return this.bytes.subarray(start, start + Number(size))
  }
}

interface ChannelStorage {
  info: McapTopicInfo
  reader: MessageReader | undefined
  /** 装配阶段：到达序的时间与负载 */
  arrivalTimes: number[]
  arrivalPayloads: Uint8Array[]
  /** finalize 后：按 logTime 升序 */
  logTimes: Float64Array
  payloads: Uint8Array[]
}

/** 通道注册入参（schema 可能缺失或解析失败）。 */
interface ChannelRegistration {
  channelId: number
  topic: string
  messageEncoding: string
  hasSchema: boolean
  schemaName: string | undefined
  schemaEncoding: string | undefined
  definitions: MessageDefinition[] | undefined
  label: string
}

const MAX_MESSAGES_TOTAL = 5_000_000
/** problems 条数上限：解码失败在播放期每个 rAF 都可能触发，不能无界增长 */
const MAX_PROBLEMS = 100

type MetadataEntry = McapFileMeta['metadata'][number]

export class McapDocument {
  private readonly storages = new Map<string, ChannelStorage>()
  private readonly metadataList: MetadataEntry[] = []
  private readonly problemList: string[] = []
  private readonly problemSet = new Set<string>()
  private omittedProblems = 0
  private startNsValue: number | undefined
  private endNsValue: number | undefined
  private totalMessages = 0
  private truncatedValue = false
  private allTimesValue: Float64Array = new Float64Array(0)
  private metaValue: McapFileMeta
  private byteLengthValue: number

  private constructor(byteLength: number) {
    this.byteLengthValue = byteLength
    this.metaValue = {
      profile: '',
      library: '',
      startNs: undefined,
      endNs: undefined,
      truncated: false,
      metadata: this.metadataList,
      problems: this.problemList,
      topics: [],
    }
  }

  /**
   * 解析 MCAP 文件：单份字节，或多分片数组（板端 part_N.mcap 轮转产物，各分片
   * 时间互不重叠，消息按 logTime 归并进同一套索引；每分片各自完成 schema/channel
   * 自举）。抛出的异常只代表输入根本不是 MCAP；截断、缺索引、压缩不支持等
   * 其余问题进 problems。
   */
  public static async load(
    data: Uint8Array | ArrayBuffer | readonly (Uint8Array | ArrayBuffer)[],
  ): Promise<McapDocument> {
    const inputs = Array.isArray(data) ? data : [data]
    if (inputs.length === 0) throw new Error('MCAP 加载失败: 未提供任何文件字节')
    const parts = inputs.map((input) => (input instanceof Uint8Array ? input : new Uint8Array(input)))
    const doc = new McapDocument(parts.reduce((sum, part) => sum + part.byteLength, 0))
    const multi = parts.length > 1
    for (let index = 0; index < parts.length; index++) {
      await doc.loadPart(parts[index], multi ? `part_${index}` : '', multi ? index : undefined)
    }
    doc.finalize()
    return doc
  }

  /** 加载单个分片：优先索引读取；失败（截断/缺索引）回退流式扫描。 */
  private async loadPart(bytes: Uint8Array, label: string, partIndex: number | undefined): Promise<void> {
    const magicOk =
      bytes.byteLength >= MCAP_MAGIC.length &&
      hasMcapPrefix(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    if (!magicOk) {
      throw new Error(`${label ? `[${label}] ` : ''}不是有效的 MCAP 文件（缺少 magic 头），无法解析`)
    }
    try {
      const indexed = await McapIndexedReader.Initialize({ readable: new BufferReadable(bytes) })
      await this.ingestIndexed(indexed, label, partIndex)
      return
    } catch {
      // 缺 footer/索引（板端崩溃掉电的残缺分片）：落入流式扫描尽量挽回
    }
    this.ingestStream(bytes, label, partIndex)
  }

  /** 索引路径：schema 文本 → 消息定义 → 每通道一个 MessageReader，再顺序读全部消息。 */
  private async ingestIndexed(
    indexed: McapIndexedReader,
    label: string,
    partIndex: number | undefined,
  ): Promise<void> {
    if (!this.metaValue.profile) this.metaValue.profile = indexed.header.profile
    if (!this.metaValue.library) this.metaValue.library = indexed.header.library

    const definitionsBySchemaId = new Map<number, MessageDefinition[]>()
    for (const [schemaId, schema] of indexed.schemasById) {
      this.registerSchema(schemaId, schema.name, schema.encoding, schema.data, definitionsBySchemaId, label)
    }
    const channelStorage = new Map<number, ChannelStorage>()
    for (const [channelId, channel] of indexed.channelsById) {
      const schema = channel.schemaId !== 0 ? indexed.schemasById.get(channel.schemaId) : undefined
      channelStorage.set(
        channelId,
        this.registerChannel({
          channelId,
          topic: channel.topic,
          messageEncoding: channel.messageEncoding,
          hasSchema: channel.schemaId !== 0,
          schemaName: schema?.name,
          schemaEncoding: schema?.encoding,
          definitions: channel.schemaId !== 0 ? definitionsBySchemaId.get(channel.schemaId) : undefined,
          label,
        }),
      )
    }

    // 压缩 chunk 没有解压器时 readMessages 必然中途抛错，先给出可读提示
    const compressions = new Set<string>()
    for (const chunkIndex of indexed.chunkIndexes) {
      if (chunkIndex.compression !== '') compressions.add(chunkIndex.compression)
    }
    for (const compression of compressions) {
      this.addProblem(label, `chunk 使用 ${compression} 压缩但未注册解压器，相关消息无法加载`)
    }

    try {
      for await (const message of indexed.readMessages()) {
        const storage = channelStorage.get(message.channelId)
        if (!storage) continue
        if (!this.ingestMessage(storage, message.logTime, message.data)) break
      }
    } catch (error) {
      // 压缩不支持已提前提示过，不再重复记流水账
      if (!/Unsupported compression/.test(String(error))) {
        this.addProblem(label, `读取消息流中断: ${String(error)}`)
      }
    }

    try {
      for await (const metadata of indexed.readMetadata()) {
        this.metadataList.push(this.metadataEntry(metadata.name, metadata.metadata, partIndex))
      }
    } catch (error) {
      this.addProblem(label, `读取 Metadata 失败: ${String(error)}`)
    }
  }

  /** 流式回退：逐条扫描记录，能读多少算多少；结束时按是否读到 footer 判断完整性。 */
  private ingestStream(bytes: Uint8Array, label: string, partIndex: number | undefined): void {
    const schemasById = new Map<number, { name: string; encoding: string; data: Uint8Array }>()
    const definitionsBySchemaId = new Map<number, MessageDefinition[]>()
    const channelStorage = new Map<number, ChannelStorage>()
    const reader = new McapStreamReader()
    reader.append(bytes)
    const before = this.totalMessages
    let error: unknown
    let failed = false
    try {
      for (let record; (record = reader.nextRecord()); ) {
        switch (record.type) {
          case 'Header':
            if (!this.metaValue.profile) this.metaValue.profile = record.profile
            if (!this.metaValue.library) this.metaValue.library = record.library
            break
          case 'Schema':
            // 同一份记录会在 summary 段重复出现，按 id 去重
            if (!schemasById.has(record.id)) {
              schemasById.set(record.id, record)
              this.registerSchema(record.id, record.name, record.encoding, record.data, definitionsBySchemaId, label)
            }
            break
          case 'Channel': {
            if (channelStorage.has(record.id)) break
            const schema = record.schemaId !== 0 ? schemasById.get(record.schemaId) : undefined
            channelStorage.set(
              record.id,
              this.registerChannel({
                channelId: record.id,
                topic: record.topic,
                messageEncoding: record.messageEncoding,
                hasSchema: record.schemaId !== 0,
                schemaName: schema?.name,
                schemaEncoding: schema?.encoding,
                definitions: record.schemaId !== 0 ? definitionsBySchemaId.get(record.schemaId) : undefined,
                label,
              }),
            )
            break
          }
          case 'Message': {
            const storage = channelStorage.get(record.channelId)
            if (storage && !this.ingestMessage(storage, record.logTime, record.data)) return
            break
          }
          case 'Metadata':
            this.metadataList.push(this.metadataEntry(record.name, record.metadata, partIndex))
            break
        }
      }
    } catch (streamError) {
      failed = true
      error = streamError
    }

    const recovered = this.totalMessages - before
    if (failed) {
      const text = String(error)
      const compression = /Unsupported compression (\S+)/.exec(text)?.[1]
      if (compression !== undefined) {
        this.addProblem(label, `chunk 使用 ${compression} 压缩但未注册解压器，相关消息无法加载`)
      } else {
        this.truncatedValue = true
        this.addProblem(label, `文件数据损坏（${text}），仅加载前 ${recovered} 条消息`)
      }
      return
    }
    if (!reader.done()) {
      this.truncatedValue = true
      this.addProblem(label, `文件不完整（可能被截断），仅加载前 ${recovered} 条消息`)
    } else {
      this.addProblem(label, `文件索引不可用，已流式加载全部 ${recovered} 条消息`)
    }
  }

  /** schema 文本 → 消息定义（仅 ros2msg）；解析结果按分片内 schemaId 缓存。 */
  private registerSchema(
    schemaId: number,
    name: string,
    encoding: string,
    data: Uint8Array,
    definitionsBySchemaId: Map<number, MessageDefinition[]>,
    label: string,
  ): void {
    if (definitionsBySchemaId.has(schemaId)) return
    if (encoding !== 'ros2msg') {
      this.addProblem(label, `schema "${name}" 编码 ${encoding} 暂不支持，相关话题不可解码`)
      return
    }
    try {
      definitionsBySchemaId.set(schemaId, parse(new TextDecoder().decode(data), { ros2: true }))
    } catch (error) {
      this.addProblem(label, `schema "${name}" 解析失败: ${String(error)}`)
    }
  }

  /** 通道注册：同话题跨分片复用同一存储（各分片首开已补发 schema/channel）。 */
  private registerChannel(input: ChannelRegistration): ChannelStorage {
    const existing = this.storages.get(input.topic)
    if (existing) return existing
    const info: McapTopicInfo = {
      channelId: input.channelId,
      topic: input.topic,
      schemaName: input.schemaName ?? '(无 schema)',
      messageEncoding: input.messageEncoding,
      schemaEncoding: input.schemaEncoding ?? '',
      messageCount: 0,
      firstLogTimeNs: undefined,
      lastLogTimeNs: undefined,
      decodable: input.definitions !== undefined && input.messageEncoding === 'cdr',
    }
    if (input.hasSchema && input.messageEncoding !== 'cdr') {
      this.addProblem(input.label, `话题 ${input.topic} 消息编码 ${input.messageEncoding} 暂不支持`)
    }
    const storage: ChannelStorage = {
      info,
      reader: info.decodable && input.definitions ? new MessageReader(input.definitions) : undefined,
      arrivalTimes: [],
      arrivalPayloads: [],
      logTimes: new Float64Array(0),
      payloads: [],
    }
    this.storages.set(input.topic, storage)
    return storage
  }

  /** 收一条消息进通道存储；返回 false 表示达到全局上限、调用方应停止读取。 */
  private ingestMessage(storage: ChannelStorage, logTime: bigint, data: Uint8Array): boolean {
    if (this.totalMessages >= MAX_MESSAGES_TOTAL) {
      this.addProblem('', `消息总数超过 ${MAX_MESSAGES_TOTAL}，已截断`)
      return false
    }
    const logTimeNs = Number(logTime)
    // data 可能是 chunk 大缓冲上的视图，必须拷贝持有
    storage.arrivalTimes.push(logTimeNs)
    storage.arrivalPayloads.push(data.slice())
    storage.info.messageCount++
    if (this.startNsValue === undefined || logTimeNs < this.startNsValue) {
      this.startNsValue = logTimeNs
    }
    if (this.endNsValue === undefined || logTimeNs > this.endNsValue) {
      this.endNsValue = logTimeNs
    }
    this.totalMessages++
    return true
  }

  private metadataEntry(name: string, data: Map<string, string>, partIndex: number | undefined): MetadataEntry {
    const entry: MetadataEntry = { name, data: Object.fromEntries(data) }
    if (partIndex !== undefined) entry.partIndex = partIndex
    return entry
  }

  /** 记一条非致命问题：去重 + 上限（解码失败在播放期每个 rAF 都可能触发）。 */
  private addProblem(label: string, text: string): void {
    const entry = label ? `[${label}] ${text}` : text
    if (this.problemSet.has(entry)) return
    this.problemSet.add(entry)
    if (this.problemList.length < MAX_PROBLEMS) {
      this.problemList.push(entry)
      return
    }
    this.omittedProblems++
    const note = `更多问题已省略（共 ${this.omittedProblems} 条）`
    if (this.problemList.length === MAX_PROBLEMS) this.problemList.push(note)
    else this.problemList[MAX_PROBLEMS] = note
  }

  private finalize(): void {
    const merged: number[] = []
    for (const storage of this.storages.values()) {
      this.finalizeChannel(storage)
      for (let i = 0; i < storage.logTimes.length; i++) merged.push(storage.logTimes[i])
    }
    this.metaValue = {
      profile: this.metaValue.profile,
      library: this.metaValue.library,
      startNs: this.startNsValue,
      endNs: this.endNsValue,
      truncated: this.truncatedValue,
      metadata: this.metadataList,
      problems: this.problemList,
      topics: [...this.storages.values()].map((storage) => storage.info),
    }
    // 帧步进用的全局有序时间点（跨话题合并去重）
    merged.sort((a, b) => a - b)
    const unique: number[] = []
    for (const t of merged) {
      if (unique.length === 0 || unique[unique.length - 1] !== t) unique.push(t)
    }
    this.allTimesValue = Float64Array.from(unique)
  }

  /** 通道内按 logTime 升序整理（稳定排序，保持同刻消息的到达顺序）。 */
  private finalizeChannel(storage: ChannelStorage): void {
    const order = storage.arrivalTimes.map((time, index) => ({ time, index }))
    order.sort((a, b) => a.time - b.time || a.index - b.index)
    const times = new Float64Array(order.length)
    const payloads: Uint8Array[] = new Array(order.length)
    for (let i = 0; i < order.length; i++) {
      times[i] = order[i].time
      payloads[i] = storage.arrivalPayloads[order[i].index]
    }
    storage.logTimes = times
    storage.payloads = payloads
    storage.arrivalTimes = []
    storage.arrivalPayloads = []
    // 首末时间取排序后的极值：多分片归并时到达序不代表时间序
    storage.info.firstLogTimeNs = times.length > 0 ? times[0] : undefined
    storage.info.lastLogTimeNs = times.length > 0 ? times[times.length - 1] : undefined
  }

  public get meta(): McapFileMeta {
    return this.metaValue
  }

  public get startNs(): number | undefined {
    return this.startNsValue
  }

  public get endNs(): number | undefined {
    return this.endNsValue
  }

  public get durationNs(): number {
    if (this.startNsValue === undefined || this.endNsValue === undefined) return 0
    return this.endNsValue - this.startNsValue
  }

  public get bufferByteLength(): number {
    return this.byteLengthValue
  }

  /** 是否为不完整文件（截断/损坏）经流式回退挽回的文档，同 meta.truncated。 */
  public get truncated(): boolean {
    return this.truncatedValue
  }

  /** 跨话题合并去重的全局消息时间点（升序），供逐帧步进使用。 */
  public get allTimesNs(): Float64Array {
    return this.allTimesValue
  }

  public topicNames(): string[] {
    return [...this.storages.keys()].sort()
  }

  public topicInfo(topic: string): McapTopicInfo | undefined {
    return this.storages.get(topic)?.info
  }

  /** 指定话题第 index 条消息（logTime 升序）的时间戳；越界返回 NaN。 */
  public timeAt(topic: string, index: number): number {
    const storage = this.storages.get(topic)
    if (!storage || index < 0 || index >= storage.logTimes.length) return Number.NaN
    return storage.logTimes[index]
  }

  /** 二分查找：该话题在 timeNs 之前（含）最近一条消息的下标；没有则 -1。 */
  public lastIndexAtOrBefore(topic: string, timeNs: number): number {
    const storage = this.storages.get(topic)
    if (!storage || storage.logTimes.length === 0) return -1
    return upperBound(storage.logTimes, timeNs) - 1
  }

  /** 解码指定下标的消息；失败返回 undefined（不抛出，问题记入 problems）。 */
  public decodeByIndex(topic: string, index: number): unknown | undefined {
    const storage = this.storages.get(topic)
    if (!storage || !storage.reader) return undefined
    if (index < 0 || index >= storage.payloads.length) return undefined
    try {
      return storage.reader.readMessage(storage.payloads[index])
    } catch (error) {
      this.addProblem('', `话题 ${topic} 第 ${index} 条消息解码失败: ${String(error)}`)
      return undefined
    }
  }

  /** 播放头语义：取 timeNs 之前（含）最近一条并解码。 */
  public decodeAtOrBefore(topic: string, timeNs: number): CurrentMessage | undefined {
    const index = this.lastIndexAtOrBefore(topic, timeNs)
    if (index < 0) return undefined
    const storage = this.storages.get(topic)!
    const message = this.decodeByIndex(topic, index)
    if (message === undefined) return undefined
    return { topic, index, logTimeNs: storage.logTimes[index], message }
  }

  /**
   * 与 decodeAtOrBefore 类似，但返回“最后一个有效时刻”的全部消息。
   * 板端把一次规划的多条候选轨迹写成同戳多条消息（/traj_candidates），
   * 只取单条会丢掉其余候选。
   */
  public decodeAllAtOrBefore(topic: string, timeNs: number): CurrentMessage[] {
    const lastIndex = this.lastIndexAtOrBefore(topic, timeNs)
    if (lastIndex < 0) return []
    const storage = this.storages.get(topic)!
    const stamp = storage.logTimes[lastIndex]
    const firstIndex = lowerBound(storage.logTimes, stamp, true)
    const result: CurrentMessage[] = []
    for (let index = firstIndex; index <= lastIndex; index++) {
      const message = this.decodeByIndex(topic, index)
      if (message !== undefined) {
        result.push({ topic, index, logTimeNs: storage.logTimes[index], message })
      }
    }
    return result
  }

  /** 逐帧步进：timeNs 之后严格大于它的下一个全局时间点（没有则 undefined）。 */
  public nextTimeAfter(timeNs: number): number | undefined {
    const index = lowerBound(this.allTimesValue, timeNs, false)
    return index < this.allTimesValue.length ? this.allTimesValue[index] : undefined
  }

  /** 逐帧步进：timeNs 之前严格小于它的上一个全局时间点（没有则 undefined）。 */
  public prevTimeBefore(timeNs: number): number | undefined {
    const index = lowerBound(this.allTimesValue, timeNs, true) - 1
    return index >= 0 ? this.allTimesValue[index] : undefined
  }
}

// ——— 二分查找 ———

/** times 升序，返回第一个 > value 的下标（全 ≤ 则 length）。 */
function upperBound(times: ArrayLike<number>, value: number): number {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (times[mid] <= value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** times 升序；strict=true 返回第一个 ≥ value 的下标，否则第一个 > value 的下标。 */
function lowerBound(times: ArrayLike<number>, value: number, strict: boolean): number {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (strict ? times[mid] < value : times[mid] <= value) lo = mid + 1
    else hi = mid
  }
  return lo
}
