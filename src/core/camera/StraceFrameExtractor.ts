/**
 * 从相机 SSH 测量通道的 strace 输出中还原 ttyS6 写入的原始文本流。
 *
 * strace 输出行形如（-f 时可能带 [pid N] 前缀，-y 解码出设备路径）：
 *   [pid  761] write(13</dev/ttyS6>, "$ESTAR,INSSEG,...*49\r\n", 84) = 84
 * 负载内是 strace 标准转义：\r \n \t \" \\ 和八进制 \NNN。
 * 单次 write 可携带多帧（\r\n 分隔）；流式输入需跨块缓冲，只输出完整记录。
 * 还原后的文本直接交给 InssegParser 做行切分、格式与校验和验证。
 */

const WRITE_RECORD = /(?:\[pid\s+\d+\]\s+)?write\(\d+<[^>]*\/dev\/ttyS6>, "((?:[^"\\]|\\.)*)", \d+\) = -?\d+/g;

const MAX_BUFFER = 1_000_000;

function decodeEscapes(payload: string): string {
  let out = '';
  let i = 0;
  while (i < payload.length) {
    const ch = payload[i];
    if (ch !== '\\') {
      out += ch;
      i++;
      continue;
    }
    const next = payload[i + 1];
    if (next === 'r') { out += '\r'; i += 2; continue; }
    if (next === 'n') { out += '\n'; i += 2; continue; }
    if (next === 't') { out += '\t'; i += 2; continue; }
    if (next === '"') { out += '"'; i += 2; continue; }
    if (next === '\\') { out += '\\'; i += 2; continue; }
    const octal = /^\\([0-3]?[0-7]{1,2})/.exec(payload.slice(i, i + 5));
    if (octal) {
      out += String.fromCharCode(Number.parseInt(octal[1], 8));
      i += octal[0].length;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

export class StraceFrameExtractor {
  private buffer = '';

  public reset(): void {
    this.buffer = '';
  }

  /** 喂入 strace 输出块，返回其中 ttyS6 写负载还原出的原始文本（可能包含 0 到多条报文） */
  public push(chunk: string): string {
    this.buffer = (this.buffer + chunk).slice(-MAX_BUFFER);
    let text = '';
    let cut = 0;
    WRITE_RECORD.lastIndex = 0;
    for (const match of this.buffer.matchAll(WRITE_RECORD)) {
      text += decodeEscapes(match[1]);
      cut = match.index + match[0].length;
    }
    if (cut > 0) this.buffer = this.buffer.slice(cut);
    return text;
  }
}
