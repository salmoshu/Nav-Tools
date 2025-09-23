import { ref, nextTick} from "vue";

const consoleContent = ref<HTMLDivElement | null>(null);
const autoScroll = ref(true);
const msgCount = ref(0);
const msgNmeaCount = ref(0);
const msgJsonCount = ref(0);
const dataFormat = ref<"json" | "nmea">("json");
const rawMessages = ref<
  {
    timestamp: string;
    raw: string;
    dataType: "nmea" | "json";
    isValid: boolean;
  }[]
>([]);

export function useConsole() {
  const calculateNmeaChecksum = (sentence: string): string => {
    let checksum = 0;
    for (let i = 0; i < sentence.length; i++) {
      checksum ^= sentence.charCodeAt(i);
    }
    // 转换为2位十六进制字符串
    return checksum.toString(16).toUpperCase().padStart(2, "0");
  };

  const isValidNmea = (str: string) => {
    // 基本格式检查
    if (!str.startsWith("$")) {
      return false;
    }

    // 移除结尾的换行符以便处理
    const cleanStr = str.trimEnd();

    // 检查是否包含星号(校验和分隔符)
    const asteriskIndex = cleanStr.indexOf("*");
    if (asteriskIndex === -1 || asteriskIndex < 6) {
      // 至少需要$xxxx,格式
      return false;
    }

    // 检查校验和是否为2位十六进制字符
    const checksumPart = cleanStr.substring(asteriskIndex + 1);
    if (!/^[0-9A-Fa-f]{2}$/.test(checksumPart)) {
      return false;
    }

    // 可选：验证校验和
    const dataPart = cleanStr.substring(1, asteriskIndex); // 不包含$和校验和部分
    const calculatedChecksum = calculateNmeaChecksum(dataPart);
    return calculatedChecksum === checksumPart.toUpperCase();
  };

  const isValidJson = (str: string) => {
    if (str.endsWith("\n")) {
      str = str.slice(0, -1);
    }
    if (str.endsWith("\r")) {
      str = str.slice(0, -1);
    }
    // 目前仅考虑大括号起始的JSON格式
    if (!str.startsWith("{") || !str.endsWith("}")) {
      return false;
    }
    try {
      JSON.parse(str, (_, value) => {
        // 需要以大括号起始
        return value;
      });
      return true;
    } catch (error) {
      return false;
    }
  };
  const handleRawDataBatch = (rawData: string) => {
    const now = new Date();
    const timestamp =
      now.toLocaleTimeString() +
      "." +
      now.getMilliseconds().toString().padStart(3, "0");
    const lines = rawData.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      //
      if (line.trim() !== "") {
        // 检测是否为JSON格式
        let isValid = true;

        if (dataFormat.value === "nmea") {
          isValid = isValidNmea(line);
          if (isValid) {
            msgNmeaCount.value++;
          }
          rawMessages.value.push({
            timestamp,
            raw: line,
            dataType: "nmea",
            isValid,
          });
          msgCount.value = msgNmeaCount.value;
        } else {
          isValid = isValidJson(line);
          if (isValid) {
            msgJsonCount.value++;
          }
          rawMessages.value.push({
            timestamp,
            raw: line,
            dataType: "json",
            isValid,
          });
          msgCount.value = msgJsonCount.value;
        }
      }
    }

    // 限制消息数量
    if (rawMessages.value.length > 100000) {
      rawMessages.value.shift();
    }

    // 优化自动滚动
    if (autoScroll.value) {
      nextTick(() => {
        if (consoleContent.value) {
          consoleContent.value.scrollTop = consoleContent.value.scrollHeight;
        }
      });
    }
  };

  return {
    consoleContent,
    autoScroll,
    msgCount,
    msgNmeaCount,
    msgJsonCount,
    dataFormat,
    rawMessages,
    isValidNmea,
    isValidJson,
    handleRawDataBatch,
  };
}
