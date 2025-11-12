import fs from "fs";
import { dialog, IpcMainEvent } from "electron";
import { SerialPort } from "serialport";
import { navMode } from "../../src/settings/config";
import { ipcMain } from "electron";

let serialDataFormat = 'ascii';

// 监听渲染进程的模式同步
ipcMain.on('sync-nav-mode', (event, { appMode, funcMode }) => {
  console.log('主进程收到模式同步:', { appMode, funcMode });
  navMode.appMode = appMode;
  navMode.funcMode = funcMode;
});

const eventsMap = {
  /**
   * 调试
   */
  "console-to-node": consoleToNode,

  /**
   * IO操作
   */
  // 1. 串口
  "search-serial-ports": searchSerialPorts, // 搜索串口设备
  "open-serial-port": openSerialPort, // 打开串口设备
  "close-serial-port": closeSerialPort, // 关闭串口设备
  "serial-data-to-renderer": serialDataToRenderer, // 串口数据发送到渲染进程
  "send-serial-hex-data": sendSerialHexData, // 发送数据到串口设备
  "send-serial-ascii-data": sendSerialAsciiData, // 发送数据到串口设备
  "serial-data-format": changeSerialDataFormat, // 串口数据格式

  // 2. 文件
  // 使用 HTML 自身的文件对话框，不需要额外处理
  "open-file-dialog": openFileDialog, // 打开文件对话框
  "read-file-event": readFileEvent, // 读取文件事件
};

function consoleToNode(event: IpcMainEvent, message: string) {
  console.log("From Renderer:", message);
}

// 搜索串口设备
async function searchSerialPorts(_: IpcMainEvent) {
  const ports = await SerialPort.list();
  const result = [];

  // // 用于存储临时打开的端口实例，从而判断哪些端口被占用
  // const tempPorts: SerialPort[] = [];

  // // 尝试打开每个端口以检查是否被占用
  // for (const port of ports) {
  //   const portInfo = {
  //     path: port.path,
  //     friendlyName: port.friendlyName,
  //     isOccupied: true, // 默认为被占用
  //     manufacturer: port.manufacturer,
  //     serialNumber: port.serialNumber
  //   };

  //   try {
  //     // 尝试使用默认参数打开端口
  //     const tempPort = new SerialPort({
  //       path: port.path,
  //       baudRate: 9600,
  //       autoOpen: false
  //     });

  //     tempPorts.push(tempPort);

  //     await new Promise<void>((resolve, reject) => {
  //       tempPort.open((err) => {
  //         if (err) {
  //           reject(err);
  //         } else {
  //           portInfo.isOccupied = false;
  //           result.push(portInfo.friendlyName);
  //           resolve();
  //         }
  //       });
  //     });
  //   } catch (error) {
  //     // 打开失败，端口被占用
  //     console.log(`端口 ${port.path} 被占用:`, error);
  //     portInfo.isOccupied = true;
  //   }
  // }

  // // 关闭所有临时打开的端口
  // tempPorts.forEach(port => {
  //   if (port.isOpen) {
  //     port.close((err) => {
  //       if (err) {
  //         console.error(`关闭临时端口失败:`, err);
  //       }
  //     });
  //   }
  // });

  for (const port of ports) {
    if (port.friendlyName) {
      result.push(port.friendlyName);
    }
  }
  
  return result;
}

// 存储当前打开的串口实例
let currentPort: SerialPort | null = null;

function openSerialPort(
  event: IpcMainEvent,
  serial: {
    path: string;
    baudRate: number;
    dataBits: number;
    stopBits: number;
    parity: string;
  }
) {
  // 返回一个 Promise
  return new Promise((resolve, reject) => {
    if (currentPort && currentPort.path === serial.path) {
      reject("当前串口已打开");
      return;
    }

    // 如果已有打开的串口，且不是相同串口，先关闭它
    if (currentPort && currentPort.isOpen) {
      const oldPort = currentPort.path;
      currentPort.close((err) => {
        if (err) {
          console.error("关闭旧串口失败:", err);
        } else {
          console.log(`旧串口${oldPort}已关闭`);
        }
      });
    }

    // 创建新的串口实例
    currentPort = new SerialPort(
      {
        path: serial.path,
        baudRate: serial.baudRate,
        dataBits: serial.dataBits as 5 | 6 | 7 | 8,
        stopBits: serial.stopBits as 1 | 1.5 | 2,
        parity: serial.parity as "none" | "even" | "odd",
      },
      (err) => {
        // 初始化回调，处理立即发生的错误
        if (err) {
          console.error(`串口${serial.path}初始化失败:`, err);
          currentPort = null;
          reject(err); // 拒绝 Promise，传递错误
        }
      }
    );

    currentPort.on("open", () => {
      console.log(`串口${serial.path}打开成功`);
      resolve(`串口${serial.path}打开成功`); // 解析 Promise
    });

    currentPort.on("error", (err) => {
      console.error(`串口${serial.path}错误:`, err);
      if (currentPort?.path === serial.path) {
        currentPort = null;
      }
      reject(err); // 拒绝 Promise，传递错误
    });

    // 监听关闭事件
    currentPort.on("close", () => {
      console.log(`串口${serial.path}已关闭`);
      if (currentPort?.path === serial.path) {
        currentPort = null;
        // 发送断开连接事件到渲染进程
        event.sender.send("serial-disconnected", { path: serial.path });
      }
    });

    const serial_decoder = new TextDecoder('utf-8', { stream: true } as any);
    currentPort.on("data", (chunk) => {
      if (serialDataFormat === 'hex') {
        const hexString = Array.from(chunk as Uint8Array)
          .map(byte => (byte as number).toString(16).padStart(2, '0').toUpperCase())
          .join('');
        serialDataToRenderer(event, hexString);
      } else {
        const str = serial_decoder.decode(chunk, { stream: true });
        serialDataToRenderer(event, str);
      }
    });
  });
}

// 关闭串口设备（保持原有功能，但更新currentPort）
function closeSerialPort(
  _: IpcMainEvent,
  serial: {
    path: string;
    baudRate: number;
    dataBits: number;
    stopBits: number;
    parity: string;
  }
) {
  if (currentPort && currentPort.isOpen && currentPort.path === serial.path) {
    currentPort.close((err) => {
      if (err) {
        console.error("关闭串口失败:", err);
      } else {
        console.log(`串口${serial.path}关闭成功`);
        currentPort = null;
      }
    });
  }
}

// 串口数据发送到渲染进程
function serialDataToRenderer(event: IpcMainEvent, data: string) {
  event.sender.send("serial-data-to-renderer", data);
}

// 发送数据到串口设备
function sendSerialHexData(event: IpcMainEvent, data: string) {
  if (currentPort && currentPort.isOpen) {
    // 将十六进制字符串转换为Buffer
    const buffer = Buffer.from(data, 'hex');
    currentPort.write(buffer, (err) => {
      if (err) {
        console.error('串口发送数据失败:', err);
        event.sender.send('serial-send-error', { error: err.message });
      } else {
        console.log('串口数据发送成功:', data);
        event.sender.send('serial-send-success', { data: data });
      }
    });
  } else {
    const errorMsg = '串口未打开或不可用';
    console.error(errorMsg);
    event.sender.send('serial-send-error', { error: errorMsg });
  }
}

function sendSerialAsciiData(event: IpcMainEvent, data: string) {
  if (currentPort && currentPort.isOpen) {
    // 将ASCII字符串转换为Buffer
    const buffer = Buffer.from(data);
    currentPort.write(buffer, (err) => {
      if (err) {
        console.error('串口发送数据失败:', err);
        event.sender.send('serial-send-error', { error: err.message });
      } else {
        console.log('串口数据发送成功:', data);
        event.sender.send('serial-send-success', { data: data });
      }
    });
  } else {
    const errorMsg = '串口未打开或不可用';
    console.error(errorMsg);
    event.sender.send('serial-send-error', { error: errorMsg });
  }
}

function changeSerialDataFormat(event: IpcMainEvent, format: string) {
  if (format === 'hex') {
    serialDataFormat = 'hex';
  } else {
    serialDataFormat = 'ascii';
  }
}

// 定义事件处理函数前先声明 openFileDialog 函数，避免引用错误
async function openFileDialog() {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "所有文件", extensions: ["*"] },
      // 可以添加特定文件类型的过滤器
      // { name: '文本文件', extensions: ['txt'] },
      // { name: '数据文件', extensions: ['csv', 'json'] }
    ],
  });
  return result;
}

async function readFileEvent(event: IpcMainEvent, filePath: string) {
  try {
    const fileContent = await fs.promises.readFile(filePath, "utf8");
    event.sender.send("read-file-success", fileContent);
  } catch (error) {
    event.sender.send("read-file-error", error.message);
  }
}

export { eventsMap };
