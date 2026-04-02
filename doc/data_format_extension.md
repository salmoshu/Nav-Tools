# Nav-Tools 数据格式支持与扩展方案

## 1. 当前支持的数据格式

### 1.1 格式概览

| 格式 | 类型 | 用途 | 实现位置 |
|------|------|------|----------|
| **MCAP** | 文件 | ROS1/ROS2 通用日志格式 | `mcap-support/`, `IterablePlayer/Mcap/` |
| **ROS1 Bag** | 文件 | ROS1 原生日志格式 | `IterablePlayer/BagIterableSource.ts` |
| **ROS2 DB3** | 文件 | ROS2 SQLite3 格式 | `IterablePlayer/rosdb3/` |
| **Rosbridge** | 连接 | ROS WebSocket 桥接 | `RosbridgePlayer.ts` |
| **Foxglove WebSocket** | 连接 | Foxglove 实时协议 | `FoxgloveWebSocketPlayer/` |
| **ULog** | 文件 | PX4 飞控日志 | `IterablePlayer/ulog/` |
| **Velodyne PCAP** | 文件 | Velodyne 激光雷达 | `VelodynePlayer.ts` |
| **nuScenes** | 示例 | 自动驾驶数据集 | `SampleNuscenesDataSourceFactory.ts` |

### 1.2 数据格式详解

#### 1.2.1 MCAP 格式

MCAP 是 Foxglove 推出的通用机器人日志格式，设计目标是统一 ROS1/ROS2 的数据存储。

**结构特点**：
```
MCAP File Structure:
├── Header
├── Channel Records      # 通道定义 (topic + schema)
├── Schema Records       # 消息模式定义 (protobuf, ros1msg, ros2msg, jsonschema)
├── Message Records      # 实际消息数据
├── Chunk Records        # 压缩数据块
├── Index Records        # 索引用于快速查找
└── Footer
```

**支持的序列化格式**：
- `ros1msg` - ROS1 消息定义
- `ros2msg` - ROS2 消息定义
- `protobuf` - Protocol Buffers
- `jsonschema` - JSON Schema
- `omgidl` - OMG IDL (ROS2 接口定义)

**代码实现**：
```typescript
// McapIterableSource.ts
export class McapIterableSource {
  constructor(args: McapSourceArgs) {
    // 支持文件、URL、多文件合并
  }
  
  async initialize(): Promise<void> {
    // 解析 MCAP 文件结构
    // 提取 channels、schemas、statistics
  }
  
  async *messageIterator(): AsyncIterableIterator<Readonly<IteratorResult>> {
    // 按时间顺序迭代消息
  }
}
```

#### 1.2.2 ROS1 Bag 格式

ROS1 原生日志格式，基于二进制块存储。

**消息结构**：
```
Bag File:
├── Header (Bag header with index position)
├── Chunk 1
│   ├── Chunk Header
│   └── Records (Connection, MessageData)
├── Chunk 2
│   └── ...
└── Index (Connection index, Chunk index)
```

**支持的 ROS 消息类型**：
- `sensor_msgs/Image` - 图像数据
- `sensor_msgs/PointCloud2` - 点云数据
- `nav_msgs/Odometry` - 里程计数据
- `geometry_msgs/PoseStamped` - 位姿数据
- `tf/tfMessage` - 坐标变换
- `visualization_msgs/Marker` - 可视化标记
- 自定义消息类型

#### 1.2.3 ULog 格式

PX4 飞控系统的日志格式，专为无人机设计。

**数据结构**：
```
ULog File:
├── Header (ULG 标识 + 版本)
├── Flag Bits (同步信息)
├── Format Definitions (消息格式定义)
├── Parameter Messages (参数设置)
├── Subscription Messages (订阅定义)
├── Data Messages (实际数据)
└── Dropout Messages (丢包记录)
```

**特点**：
- 专为嵌入式系统优化
- 支持消息订阅机制
- 包含参数变更历史

---

## 2. 数据解析架构

### 2.1 消息定义系统

Nav-Tools 使用 `MessageDefinition` 描述消息结构：

```typescript
// @lichtblick/message-definition
interface MessageDefinition {
  name?: string;           // 消息类型名称
  definitions: MessageDefinitionField[];
}

interface MessageDefinitionField {
  name: string;            // 字段名称
  type: string;            // 字段类型
  isComplex?: boolean;     // 是否为复杂类型
  isArray?: boolean;       // 是否为数组
  arrayLength?: number;    // 数组长度（固定长度）
  upperBound?: number;     // 数组上限（变长）
}
```

### 2.2 解析器链

```
原始数据
    │
    ▼
┌─────────────────┐
│  File Reader    │  (BlobReadable, RemoteFileReadable)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Format Parser  │  (McapReader, BagReader, ULogReader)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Schema Resolver │  (解析消息定义，构建类型映射)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Message Decoder │  (protobuf, rosmsg, json 解码)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ MessageEvent    │  { topic, receiveTime, message }
└─────────────────┘
```

### 2.3 反序列化实现

**MCAP 反序列化**：
```typescript
// DeserializingIterableSource.ts
export class DeserializingIterableSource {
  constructor(
    private source: IIterableSource,
    private parseChannel: ParseChannel,
  ) {}
  
  async *messageIterator(): AsyncIterableIterator<IteratorResult> {
    for await (const result of this.source.messageIterator()) {
      const parsedMessage = await this.parseMessage(
        result.topic,
        result.msg,
        receiveTime,
      );
      yield { ...result, msg: parsedMessage };
    }
  }
  
  private async parseMessage(
    topic: string,
    data: Uint8Array,
    receiveTime: Time,
  ): Promise<unknown> {
    // 根据 topic 获取对应的解析器
    const parser = this.getParserForTopic(topic);
    return parser(data);
  }
}
```

---

## 3. 非 ROS 数据接入方案

### 3.1 扩展架构设计

要实现非 ROS 数据格式（超声波原始数据、GNSS NMEA/RTCM、电机十六进制数据等）的接入，需要扩展以下组件：

```
┌─────────────────────────────────────────────────────────────┐
│                    数据源工厂 (DataSourceFactory)              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ CustomFile   │ │ SerialPort   │ │   TCP/UDP Socket     │ │
│  │ DataSource   │ │ DataSource   │ │   DataSource         │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    格式解析器 (Format Parser)                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │  NMEA Parser │ │ Binary Frame │ │   Custom Protocol    │ │
│  │  (GNSS)      │ │ Parser       │ │   Parser             │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    消息转换器 (Message Converter)              │
│                 转换为 ROS 兼容消息格式                        │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 具体实现方案

#### 3.2.1 超声波原始数据接入

**数据特点**：
- 通常通过串口 (UART) 或 CAN 总线传输
- 数据格式：原始十六进制帧，包含距离值、传感器ID、校验
- 帧结构示例：`[Header][SensorID][Distance_L][Distance_H][CRC]`

**实现方案**：

```typescript
// 1. 创建数据源工厂
// packages/suite-base/src/dataSources/UltrasonicDataSourceFactory.ts

import { IDataSourceFactory } from "@lichtblick/suite-base/context/PlayerSelectionContext";
import { UltrasonicSerialPlayer } from "@lichtblick/suite-base/players/UltrasonicSerialPlayer";

class UltrasonicDataSourceFactory implements IDataSourceFactory {
  public id = "ultrasonic-serial";
  public type = "connection" as const;
  public displayName = "Ultrasonic Sensor (Serial)";
  
  public formConfig = {
    fields: [
      {
        id: "port",
        label: "Serial Port",
        defaultValue: "/dev/ttyUSB0",
      },
      {
        id: "baudrate",
        label: "Baud Rate",
        defaultValue: "115200",
      },
      {
        id: "protocol",
        label: "Protocol",
        defaultValue: "standard", // standard, custom
      },
    ],
  };
  
  public initialize(args): Player | undefined {
    return new UltrasonicSerialPlayer({
      port: args.params?.port,
      baudrate: parseInt(args.params?.baudrate ?? "115200"),
      protocol: args.params?.protocol ?? "standard",
    });
  }
}

// 2. 实现播放器
// packages/suite-base/src/players/UltrasonicSerialPlayer.ts

export class UltrasonicSerialPlayer {
  private serialPort: SerialPort;
  private frameParser: UltrasonicFrameParser;
  
  constructor(config: UltrasonicConfig) {
    this.frameParser = new UltrasonicFrameParser(config.protocol);
  }
  
  async connect(): Promise<void> {
    this.serialPort = await navigator.serial.requestPort();
    await this.serialPort.open({ baudRate: this.config.baudrate });
    
    const reader = this.serialPort.readable.getReader();
    
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      // 解析二进制帧
      const messages = this.frameParser.parse(value);
      for (const msg of messages) {
        // 转换为 ROS 标准消息格式
        const rosMessage = this.toRosMessage(msg);
        this.emitMessage(rosMessage);
      }
    }
  }
  
  private toRosMessage(rawData: UltrasonicRawData): MessageEvent {
    // 转换为 sensor_msgs/Range 消息
    return {
      topic: `/ultrasonic/sensor_${rawData.sensorId}`,
      receiveTime: this.getCurrentTime(),
      message: {
        header: {
          frame_id: `ultrasonic_${rawData.sensorId}`,
          stamp: this.getCurrentTime(),
        },
        radiation_type: 0,  // ULTRASOUND
        field_of_view: 0.26, // ~15 degrees
        min_range: 0.02,
        max_range: 4.0,
        range: rawData.distance / 100.0, // cm to m
      },
    };
  }
}

// 3. 帧解析器
// packages/suite-base/src/players/parsers/UltrasonicFrameParser.ts

export class UltrasonicFrameParser {
  private buffer: Uint8Array = new Uint8Array();
  
  parse(data: Uint8Array): UltrasonicRawData[] {
    // 追加到缓冲区
    const newBuffer = new Uint8Array(this.buffer.length + data.length);
    newBuffer.set(this.buffer);
    newBuffer.set(data, this.buffer.length);
    this.buffer = newBuffer;
    
    const messages: UltrasonicRawData[] = [];
    
    // 查找帧头 (如 0xAA 0x55)
    let frameStart = this.findFrameHeader();
    
    while (frameStart !== -1 && this.buffer.length >= frameStart + 5) {
      const frameLength = 5; // 假设固定帧长
      const frame = this.buffer.slice(frameStart, frameStart + frameLength);
      
      if (this.validateCRC(frame)) {
        messages.push({
          sensorId: frame[2],
          distance: (frame[3] | (frame[4] << 8)), // Little-endian
          timestamp: Date.now(),
        });
        
        // 移除已处理的数据
        this.buffer = this.buffer.slice(frameStart + frameLength);
      } else {
        // CRC 错误，跳过帧头继续查找
        this.buffer = this.buffer.slice(frameStart + 1);
      }
      
      frameStart = this.findFrameHeader();
    }
    
    return messages;
  }
  
  private findFrameHeader(): number {
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i] === 0xAA && this.buffer[i + 1] === 0x55) {
        return i;
      }
    }
    return -1;
  }
  
  private validateCRC(frame: Uint8Array): boolean {
    // 实现校验逻辑
    const crc = frame.slice(0, -1).reduce((a, b) => a + b, 0) & 0xFF;
    return crc === frame[frame.length - 1];
  }
}
```

#### 3.2.2 GNSS NMEA/RTCM 数据接入

**数据特点**：
- NMEA：文本协议，以 `$` 开头，如 `$GPGGA, $GPRMC`
- RTCM：二进制差分修正数据，用于高精度定位
- 通常通过串口或网络传输

**实现方案**：

```typescript
// packages/suite-base/src/players/GnssPlayer.ts

export class GnssPlayer {
  private nmeaParser: NmeaParser;
  private rtcmParser: RtcmParser;
  
  constructor(config: GnssConfig) {
    this.nmeaParser = new NmeaParser();
    this.rtcmParser = new RtcmParser();
  }
  
  private handleData(data: string | Uint8Array): void {
    if (typeof data === 'string' || this.isNmeaData(data)) {
      // 解析 NMEA 语句
      const nmeaSentences = this.nmeaParser.parse(data.toString());
      for (const sentence of nmeaSentences) {
        const rosMsg = this.nmeaToRosMessage(sentence);
        this.emitMessage(rosMsg);
      }
    } else {
      // 解析 RTCM 数据
      const rtcmMessages = this.rtcmParser.parse(data);
      for (const msg of rtcmMessages) {
        // RTCM 通常用于内部差分解算，可发布为自定义消息
        this.emitMessage(this.rtcmToRosMessage(msg));
      }
    }
  }
  
  private nmeaToRosMessage(sentence: NmeaSentence): MessageEvent {
    switch (sentence.type) {
      case 'GGA':
        return {
          topic: '/gnss/fix',
          message: {
            header: { frame_id: 'gnss', stamp: this.getTimestamp() },
            status: { status: sentence.fixQuality > 0 ? 0 : -1, service: 1 },
            latitude: this.parseLat(sentence.lat, sentence.latDir),
            longitude: this.parseLon(sentence.lon, sentence.lonDir),
            altitude: parseFloat(sentence.altitude),
            position_covariance_type: 1, // APPROXIMATED
          },
        };
      case 'RMC':
        return {
          topic: '/gnss/vel',
          message: {
            header: { frame_id: 'gnss', stamp: this.getTimestamp() },
            twist: {
              linear: {
                x: parseFloat(sentence.speed) * 0.514444, // knots to m/s
                y: 0,
                z: 0,
              },
            },
          },
        };
    }
  }
}

// NMEA 解析器
class NmeaParser {
  parse(data: string): NmeaSentence[] {
    const sentences: NmeaSentence[] = [];
    const lines = data.split('\r\n');
    
    for (const line of lines) {
      if (!line.startsWith('$')) continue;
      
      const parts = line.split('*');
      const content = parts[0];
      const checksum = parts[1];
      
      if (this.validateChecksum(content, checksum)) {
        const fields = content.slice(1).split(',');
        const type = fields[0].slice(2); // 跳过 talker ID
        
        sentences.push(this.parseSentence(type, fields));
      }
    }
    
    return sentences;
  }
  
  private parseSentence(type: string, fields: string[]): NmeaSentence {
    switch (type) {
      case 'GGA':
        return {
          type: 'GGA',
          time: fields[1],
          lat: fields[2],
          latDir: fields[3],
          lon: fields[4],
          lonDir: fields[5],
          fixQuality: parseInt(fields[6]),
          numSatellites: parseInt(fields[7]),
          hdop: parseFloat(fields[8]),
          altitude: fields[9],
        };
      case 'RMC':
        return {
          type: 'RMC',
          time: fields[1],
          status: fields[2],
          lat: fields[3],
          latDir: fields[4],
          lon: fields[5],
          lonDir: fields[6],
          speed: fields[7],
          course: fields[8],
        };
      // ... 其他 NMEA 语句
    }
  }
}
```

#### 3.2.3 电机十六进制数据接入

**数据特点**：
- 通常是自定义二进制协议
- 包含电机状态（速度、电流、温度、编码器位置）
- 可能包含故障码和控制命令响应

**实现方案**：

```typescript
// packages/suite-base/src/players/MotorDataPlayer.ts

export class MotorDataPlayer {
  private protocol: MotorProtocol;
  
  constructor(config: MotorConfig) {
    // 支持多种电机协议
    switch (config.protocol) {
      case 'canopen':
        this.protocol = new CanOpenProtocol();
        break;
      case 'modbus':
        this.protocol = new ModbusProtocol();
        break;
      case 'custom':
        this.protocol = new CustomMotorProtocol(config.frameFormat);
        break;
    }
  }
  
  private handleFrame(frame: Uint8Array): void {
    const motorData = this.protocol.parse(frame);
    
    // 发布电机状态
    this.emitMessage({
      topic: `/motor/${motorData.motorId}/status`,
      message: {
        header: { frame_id: `motor_${motorData.motorId}`, stamp: this.getTimestamp() },
        motor_id: motorData.motorId,
        velocity: motorData.velocity,        // rad/s or rpm
        current: motorData.current,          // A
        temperature: motorData.temperature,  // °C
        position: motorData.position,        // rad or encoder ticks
        fault_code: motorData.faultCode,
      },
    });
    
    // 如果有故障，发布诊断消息
    if (motorData.faultCode !== 0) {
      this.emitMessage({
        topic: '/diagnostics',
        message: {
          header: { stamp: this.getTimestamp() },
          status: [{
            name: `Motor ${motorData.motorId}`,
            level: motorData.faultCode > 0 ? 2 : 0, // ERROR : OK
            message: this.getFaultMessage(motorData.faultCode),
          }],
        },
      });
    }
  }
}

// 自定义电机协议解析器
class CustomMotorProtocol {
  constructor(private frameFormat: FrameFormat) {}
  
  parse(frame: Uint8Array): MotorData {
    const data: MotorData = { motorId: 0, velocity: 0, current: 0 };
    
    for (const field of this.frameFormat.fields) {
      const rawValue = this.extractField(frame, field);
      
      // 应用转换公式
      data[field.name] = rawValue * field.scale + field.offset;
    }
    
    return data;
  }
  
  private extractField(frame: Uint8Array, field: FieldDef): number {
    let value = 0;
    
    if (field.byteOrder === 'little') {
      for (let i = 0; i < field.length; i++) {
        value |= frame[field.offset + i] << (i * 8);
      }
    } else {
      for (let i = 0; i < field.length; i++) {
        value |= frame[field.offset + i] << ((field.length - 1 - i) * 8);
      }
    }
    
    // 处理有符号数
    if (field.signed) {
      const maxVal = Math.pow(2, field.length * 8);
      if (value >= maxVal / 2) {
        value -= maxVal;
      }
    }
    
    return value;
  }
}
```

---

## 4. 通用扩展架构

### 4.1 配置文件驱动的协议解析

为了支持灵活的非 ROS 数据接入，可以设计一个配置驱动的解析框架：

```typescript
// 协议配置示例 (motor_protocol.yaml)
protocol:
  name: "CustomMotorV1"
  frame:
    header: [0xAA, 0x55]  # 帧头
    length: 16             # 帧长度（固定）
    checksum: 
      type: "crc16"
      range: [0, 14]       # CRC 计算范围
      position: [14, 15]   # CRC 存储位置
  
  fields:
    - name: "motor_id"
      offset: 2
      length: 1
      type: "uint8"
      
    - name: "velocity"
      offset: 3
      length: 2
      type: "int16"
      scale: 0.01          # 原始值 * 0.01 = rad/s
      unit: "rad/s"
      
    - name: "current"
      offset: 5
      length: 2
      type: "int16"
      scale: 0.001         # 原始值 * 0.001 = A
      unit: "A"
      
    - name: "temperature"
      offset: 7
      length: 1
      type: "int8"
      unit: "celsius"
      
    - name: "position"
      offset: 8
      length: 4
      type: "int32"
      scale: 0.001         # 编码器 ticks 转弧度
      unit: "rad"
      
    - name: "fault_code"
      offset: 12
      length: 2
      type: "uint16"
      mapping:             # 故障码映射
        0x0001: "OVERCURRENT"
        0x0002: "OVERTEMPERATURE"
        0x0004: "ENCODER_ERROR"
```

### 4.2 动态消息转换器

```typescript
// MessageConverter.ts
export class ConfigurableMessageConverter {
  constructor(private config: ProtocolConfig) {}
  
  convert(frame: Uint8Array): MessageEvent[] {
    const messages: MessageEvent[] = [];
    
    // 解析原始数据
    const rawData = this.parseFrame(frame);
    
    // 根据配置生成 ROS 消息
    for (const output of this.config.outputs) {
      const msg = this.buildRosMessage(output, rawData);
      messages.push(msg);
    }
    
    return messages;
  }
  
  private buildRosMessage(
    output: OutputConfig,
    rawData: Record<string, number>,
  ): MessageEvent {
    const message: Record<string, unknown> = {};
    
    // 构建消息结构
    for (const [key, mapping] of Object.entries(output.mappings)) {
      if (typeof mapping === 'string') {
        // 直接映射
        message[key] = rawData[mapping];
      } else if (mapping.type === 'expression') {
        // 表达式计算
        message[key] = this.evaluateExpression(mapping.formula, rawData);
      } else if (mapping.type === 'conditional') {
        // 条件映射
        message[key] = rawData[mapping.field] > mapping.threshold 
          ? mapping.trueValue 
          : mapping.falseValue;
      }
    }
    
    return {
      topic: output.topic,
      receiveTime: this.getTimestamp(),
      message,
    };
  }
}
```

---

## 5. 实施建议

### 5.1 开发优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | 串口数据源支持 | Web Serial API 或 Node SerialPort |
| P1 | 配置文件驱动解析 | YAML/JSON 协议定义 |
| P1 | NMEA 解析器 | GNSS 数据标准化 |
| P2 | 二进制帧解析器 | 通用十六进制协议支持 |
| P2 | 网络数据源 | TCP/UDP Socket 支持 |
| P3 | RTCM 解析 | 高精度定位差分数据 |

### 5.2 技术选型

| 组件 | 推荐方案 | 理由 |
|------|----------|------|
| **串口通信** | `serialport` (Node/Electron) | 成熟稳定，跨平台 |
| **Web 串口** | Web Serial API | 浏览器原生支持 |
| **协议配置** | YAML + JSON Schema | 易读易维护，可验证 |
| **数据缓存** | Ring Buffer | 实时数据流处理 |
| **时间同步** | 系统时间 + NTP | 多传感器时间对齐 |

### 5.3 代码组织建议

```
packages/suite-base/src/
├── players/
│   ├── custom/                 # 自定义数据源播放器
│   │   ├── SerialPlayer.ts     # 串口播放器基类
│   │   ├── TcpPlayer.ts        # TCP 播放器
│   │   └── UdpPlayer.ts        # UDP 播放器
│   └── parsers/                # 协议解析器
│       ├── BinaryFrameParser.ts # 二进制帧解析
│       ├── NmeaParser.ts       # NMEA 解析
│       ├── RtcmParser.ts       # RTCM 解析
│       └── ConfigurableParser.ts # 配置驱动解析
├── dataSources/
│   ├── SerialDataSourceFactory.ts
│   ├── TcpDataSourceFactory.ts
│   └── UdpDataSourceFactory.ts
└── util/protocols/             # 协议配置
    ├── ultrasonic.yaml
    ├── motor.yaml
    └── gnss.yaml
```

---

## 6. 总结

Nav-Tools 当前已支持 ROS 生态的主流数据格式（MCAP、Bag、Rosbridge）。要扩展支持非 ROS 数据格式（超声波、GNSS、电机数据等），需要：

1. **实现新的数据源工厂**：串口、TCP/UDP Socket 数据源
2. **开发协议解析器**：二进制帧、NMEA、RTCM 等
3. **设计消息转换层**：将原始数据转换为 ROS 标准消息格式
4. **配置文件驱动**：通过 YAML/JSON 定义协议格式，提高灵活性

通过这种架构，Nav-Tools 可以从 ROS 专用工具扩展为通用的机器人传感器调试平台。
