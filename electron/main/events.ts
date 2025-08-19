import {  dialog, IpcMainEvent } from 'electron'
import { SerialPort } from 'serialport';

const eventsMap = {
    /**
     * 调试
     */
    'console-to-node': consoleToNode,

    /**
     * IO操作
     */
    // 1. 串口
    'search-serial-ports': searchSerialPorts, // 搜索串口设备
    'open-serial-port': openSerialPort,       // 打开串口设备
    'close-serial-port': closeSerialPort,     // 关闭串口设备
    'serial-data-to-renderer': serialDataToRenderer, // 串口数据发送到渲染进程

    // 2. 文件
    'open-file-dialog': openFileDialog,       // 打开文件对话框
}

function consoleToNode(event: IpcMainEvent, message: string) {
    console.log('From Renderer:', message)
}

// 搜索串口设备
async function searchSerialPorts(_: IpcMainEvent) {
    const ports = await SerialPort.list()
    const result = []
    ports.forEach((port) => {
        result.push(port.friendlyName)
    })
    return result
}

// 存储当前打开的串口实例
let currentPort: SerialPort | null = null

function openSerialPort(event: IpcMainEvent, serial: { path: string, baudRate: number, dataBits: number, stopBits: number, parity: string }) {
    // 返回一个 Promise
    return new Promise((resolve, reject) => {
        if (currentPort && currentPort.path === serial.path) {
            reject('当前串口已打开');
            return;
        }

        // 如果已有打开的串口，且不是相同串口，先关闭它
        if (currentPort && currentPort.isOpen) {
            const oldPort = currentPort.path;
            currentPort.close((err) => {
                if (err) {
                    console.error('关闭旧串口失败:', err);
                } else {
                    console.log(`旧串口${oldPort}已关闭`);
                }
            });
        }

        // 创建新的串口实例
        currentPort = new SerialPort({
            path: serial.path,
            baudRate: serial.baudRate,
            dataBits: serial.dataBits as 5 | 6 | 7 | 8,
            stopBits: serial.stopBits as 1 | 1.5 | 2,
            parity: serial.parity as "none" | "even" | "odd"
        }, (err) => {
            // 初始化回调，处理立即发生的错误
            if (err) {
                console.error(`串口${serial.path}初始化失败:`, err);
                currentPort = null;
                reject(err); // 拒绝 Promise，传递错误
            }
        });

        currentPort.on('open', () => {
            console.log(`串口${serial.path}打开成功`);
            resolve(`串口${serial.path}打开成功`); // 解析 Promise
        });

        currentPort.on('error', (err) => {
            console.error(`串口${serial.path}错误:`, err);
            if (currentPort?.path === serial.path) {
                currentPort = null;
            }
            reject(err); // 拒绝 Promise，传递错误
        });

        currentPort.on('data', (data) => {
            serialDataToRenderer(event, data.toString());
        });
    });
}

// 关闭串口设备（保持原有功能，但更新currentPort）
function closeSerialPort(_: IpcMainEvent, serial: { path: string, baudRate: number, dataBits: number, stopBits: number, parity: string }) {
    if (currentPort && currentPort.isOpen && currentPort.path === serial.path) {
        currentPort.close((err) => {
            if (err) {
                console.error('关闭串口失败:', err)
            } else {
                console.log(`串口${serial.path}关闭成功`)
                currentPort = null
            }
        })
    }
}

// 串口数据发送到渲染进程
function serialDataToRenderer(event: IpcMainEvent, data: string) {
    event.sender.send('serial-data-to-renderer', data)
}

// 定义事件处理函数前先声明 openFileDialog 函数，避免引用错误
async function openFileDialog() {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: '所有文件', extensions: ['*'] },
      // 可以添加特定文件类型的过滤器
      // { name: '文本文件', extensions: ['txt'] },
      // { name: '数据文件', extensions: ['csv', 'json'] }
    ]
  })
  return result
}

export {
    eventsMap
}
