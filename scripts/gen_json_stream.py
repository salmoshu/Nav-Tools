#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# pip install pyserial
# python gen_json_stream.py --port COM21 --baudrate 115200 --delay 0.2

import json
import time
import random
import serial
import argparse
from typing import Dict, Any, Optional

class JSONStreamGenerator:
    def __init__(self, port: str = 'COM21', baudrate: int = 115200, 
                 delay: float = 0.2, runtime: Optional[float] = None):
        """
        初始化JSON数据流生成器
        
        Args:
            port: 串口端口号
            baudrate: 波特率
            delay: 发送间隔（秒）
            runtime: 运行时间（秒），None表示无限运行
        """
        self.port = port
        self.baudrate = baudrate
        self.delay = delay
        self.runtime = runtime
        self.ser = None
        self.start_time = 0
    
    def connect_serial(self) -> bool:
        """连接到串口"""
        try:
            self.ser = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=1
            )
            if self.ser.is_open:
                print(f"成功连接到串口 {self.port}")
                return True
            return False
        except Exception as e:
            print(f"连接串口失败: {e}")
            return False
    
    def generate_json_data(self) -> Dict[str, Any]:
        """生成符合example.txt格式的JSON数据"""
        # 计算当前时间戳
        current_time = time.time()
        delta_time = current_time - self.start_time
        
        # 根据时间模拟不同阶段的数据
        if delta_time < 6:
            # 初始阶段，所有值为0或null
            data = {
                "time": current_time,
                "camera_distance": None,
                "camera_angle": None,
                "pid_left_speed": 0,
                "pid_right_speed": 0,
                "motor_left_speed": 0,
                "motor_right_speed": 0
            }
        elif 6 <= delta_time < 8:
            # 过渡阶段，开始有摄像头数据
            data = {
                "time": current_time,
                "camera_distance": round(random.uniform(0.6, 0.7), 3) if random.random() > 0.3 else None,
                "camera_angle": round(random.uniform(-15, 0), 3) if random.random() > 0.3 else None,
                "pid_left_speed": 0,
                "pid_right_speed": 0,
                "motor_left_speed": 0,
                "motor_right_speed": 0
            }
        else:
            # 正常运行阶段，所有数据都有值
            camera_distance = round(random.uniform(0.6, 1.6), 3)
            camera_angle = round(random.uniform(-15, 5), 3)
            
            # 根据摄像头数据模拟PID和电机速度
            pid_left_speed = round(random.uniform(0, 0.6), 6) if camera_distance > 0.8 else 0
            pid_right_speed = round(random.uniform(0, 0.6), 6) if camera_distance > 0.8 else 0
            
            # 电机速度基于PID速度，但有一定的滞后
            motor_left_speed = round(random.uniform(0, pid_left_speed), 6) if pid_left_speed > 0 else 0
            motor_right_speed = round(random.uniform(0, pid_right_speed), 6) if pid_right_speed > 0 else 0
            
            data = {
                "time": current_time,
                "camera_distance": camera_distance,
                "camera_angle": camera_angle,
                "pid_left_speed": pid_left_speed,
                "pid_right_speed": pid_right_speed,
                "motor_left_speed": motor_left_speed,
                "motor_right_speed": motor_right_speed
            }
        
        return data
    
    def run(self):
        """运行数据流生成器"""
        # 连接串口
        if not self.connect_serial():
            print("无法继续执行，程序退出")
            return
        
        try:
            self.start_time = time.time()
            end_time = self.start_time + self.runtime if self.runtime else float('inf')
            
            print(f"开始发送数据到串口 {self.port}，按Ctrl+C停止")
            
            while time.time() < end_time:
                # 生成JSON数据
                json_data = self.generate_json_data()
                
                # 转换为JSON字符串并添加换行符
                json_str = json.dumps(json_data) + '\n'
                
                # 发送数据到串口
                try:
                    self.ser.write(json_str.encode('utf-8'))
                    print(f"发送: {json_str.strip()}")
                except Exception as e:
                    print(f"发送数据失败: {e}")
                    # 尝试重新连接
                    if not self.connect_serial():
                        break
                
                # 等待指定的延迟时间
                time.sleep(self.delay)
        except KeyboardInterrupt:
            print("用户中断程序")
        finally:
            # 关闭串口
            if self.ser and self.ser.is_open:
                self.ser.close()
                print("串口已关闭")

if __name__ == "__main__":
    # 解析命令行参数
    parser = argparse.ArgumentParser(description='JSON数据流生成器')
    parser.add_argument('--port', type=str, default='COM21', help='串口端口号')
    parser.add_argument('--baudrate', type=int, default=115200, help='波特率')
    parser.add_argument('--delay', type=float, default=0.2, help='发送间隔（秒）')
    parser.add_argument('--runtime', type=float, default=None, help='运行时间（秒），默认无限运行')
    
    args = parser.parse_args()
    
    # 创建并运行数据流生成器
    generator = JSONStreamGenerator(
        port=args.port,
        baudrate=args.baudrate,
        delay=args.delay,
        runtime=args.runtime
    )
    generator.run()