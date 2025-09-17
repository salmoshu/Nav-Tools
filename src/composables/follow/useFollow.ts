import { ref } from "vue";
import { useFollowStore } from '@/stores/follow';

const dt = 1/10;
const timestamp = ref(0);
const timestamps = ref([] as number[]);
const cameraDistance = ref([] as any[]);
const cameraAngle = ref([] as any[]);
const pidLeftSpeed = ref([] as any[]);
const pidRightSpeed = ref([] as any[]);
const motorLeftSpeed = ref([] as any[]);
const motorRightSpeed = ref([] as any[]);
const isBatchData = ref(false);

const updateFollowStatus = () => {
  const followStore = useFollowStore()
  
  // 获取各个数组的最后一个元素作为status内容
  followStore.status = {
    timestamp: timestamps.value.length > 0 ? timestamps.value[timestamps.value.length - 1] : null,
    cameraDistance: cameraDistance.value.length > 0 ? cameraDistance.value[cameraDistance.value.length - 1] : null,
    cameraAngle: cameraAngle.value.length > 0 ? cameraAngle.value[cameraAngle.value.length - 1] : null,
    pidLeftSpeed: pidLeftSpeed.value.length > 0 ? pidLeftSpeed.value[pidLeftSpeed.value.length - 1] : null,
    pidRightSpeed: pidRightSpeed.value.length > 0 ? pidRightSpeed.value[pidRightSpeed.value.length - 1] : null,
    motorLeftSpeed: motorLeftSpeed.value.length > 0 ? motorLeftSpeed.value[motorLeftSpeed.value.length - 1] : null,
    motorRightSpeed: motorRightSpeed.value.length > 0 ? motorRightSpeed.value[motorRightSpeed.value.length - 1] : null
  }
}

export function useFollow() {
  const clearRawData = () => {
    timestamp.value = 0
    timestamps.value = []
    cameraDistance.value = []
    cameraAngle.value = []
    pidLeftSpeed.value = []
    pidRightSpeed.value = []
    motorLeftSpeed.value = []
    motorRightSpeed.value = []
  }

  const initRawData = (data: string, startTime: number=0) => {
    isBatchData.value = true
    timestamp.value = startTime
    const lines = data.split("\n")
    for (const line of lines) {
      if (line.trim() !== "") {
        try {
          const json = JSON.parse(line)
          const camera_distance = json.camera_distance
          const camera_angle = json.camera_angle
          const pid_left_speed = json.pid_left_speed
          const pid_right_speed = json.pid_right_speed
          if (typeof json.time === 'number') {
            if (timestamp.value == 0) {
              // 增加一个极小量 0.0005，以处理为0的情况
              timestamp.value = Number(json.time) - 0.0005
            }
            timestamps.value.push(Number(json.time) - timestamp.value)
          } else {
            // 如果没有time属性，则假设数据为20Hz
            timestamps.value.push(timestamp.value)
            timestamp.value += dt
          }
          if (pid_left_speed !== null && pid_right_speed !== null) {
            cameraDistance.value.push(camera_distance) // null || number
            cameraAngle.value.push(camera_angle) // null || number
            pidLeftSpeed.value.push(Number(pid_left_speed))
            pidRightSpeed.value.push(Number(pid_right_speed))
            motorLeftSpeed.value.push(json.motor_left_speed)
            motorRightSpeed.value.push(json.motor_right_speed)
          } else {
            cameraDistance.value.push(null)
            cameraAngle.value.push(null)
            pidLeftSpeed.value.push(null)
            pidRightSpeed.value.push(null)
            motorLeftSpeed.value.push(null)
            motorRightSpeed.value.push(null)
          }
        } catch (error) {
          console.log('json解析失败', error)
        }
      }
    }
    updateFollowStatus()
  }

  const addNullData = () => {
    // 数据间隔超过1s则存储null作为分隔
    const now = Date.now() / 1000
    timestamps.value.push(now - timestamp.value - 0.5)
    cameraDistance.value.push(null)
    cameraAngle.value.push(null)
    pidLeftSpeed.value.push(null)
    pidRightSpeed.value.push(null)
    motorLeftSpeed.value.push(null)
    motorRightSpeed.value.push(null)
  }

  let rawString = ''
  const addRawData = (data: string) => {
    if (isBatchData.value) {
      clearRawData()
      isBatchData.value = false
    }
    rawString += data

    if (rawString.indexOf('\n') == -1) {
      return
    }
    const lines = rawString.split("\n")
    rawString = lines[lines.length - 1]

    for (const line of lines) {
      if (line.trim() !== "") {
        try {
          if (line.indexOf('{') === -1 || line.indexOf('}') === -1) {
            continue
          }
          const json = JSON.parse(line)
          const camera_distance = json.camera_distance
          const camera_angle = json.camera_angle
          const pid_left_speed = json.pid_left_speed
          const pid_right_speed = json.pid_right_speed
          const motor_left_speed = json.motor_left_speed
          const motor_right_speed = json.motor_right_speed
          if (pid_left_speed !== null && pid_right_speed !== null) {
            if (typeof json.time === 'number') {
              if (timestamp.value == 0) {
                // 增加一个极小量 0.0005，以处理为0的情况
                timestamp.value = Number(json.time) - 0.0005
              }
              timestamps.value.push(Number(json.time) - timestamp.value)
            } else {
              const now = Date.now() / 1000
              if (timestamp.value == 0) {
                timestamp.value = now
              }
              const lastTimestamp = timestamp.value + timestamps.value[timestamps.value.length - 1]
              if (lastTimestamp && now - lastTimestamp > 1) {
                addNullData()
              }
              timestamps.value.push(now - timestamp.value)
            }
            cameraDistance.value.push(camera_distance) // null || number
            cameraAngle.value.push(camera_angle) // null || number
            pidLeftSpeed.value.push(Number(pid_left_speed))
            pidRightSpeed.value.push(Number(pid_right_speed))
            motorLeftSpeed.value.push(motor_left_speed)
            motorRightSpeed.value.push(motor_right_speed)
          }
        } catch (error) {
          // console.log('json解析失败', error)
        }
      }
    }
    updateFollowStatus()
  }
  
  const saveData = () => {
    // 创建符合要求的格式数据
    const formattedData = cameraDistance.value.map((_, index) => {
      return {
        time: timestamps.value[index], // 使用已有的时间戳或计算时间
        camera_distance: cameraDistance.value[index],
        camera_angle: cameraAngle.value[index],
        pid_left_speed: pidLeftSpeed.value[index],
        pid_right_speed: pidRightSpeed.value[index],
        motor_left_speed: motorLeftSpeed.value[index],
        motor_right_speed: motorRightSpeed.value[index],
      };
    });
    
    // 生成每行一个JSON对象的文件内容
    const fileContent = formattedData.map(item => JSON.stringify(item)).join('\n');
    
    // 创建Blob并下载文件
    const blob = new Blob([fileContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const now = new Date();
    // 格式化为：YYYY-MM-DDTHH-mm-ssZ，不含毫秒
    const timestamp = now.getUTCFullYear() + '-' +
      String(now.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(now.getUTCDate()).padStart(2, '0') + 'T' +
      String(now.getUTCHours()).padStart(2, '0') + '-' +
      String(now.getUTCMinutes()).padStart(2, '0') + '-' +
      String(now.getUTCSeconds()).padStart(2, '0') + 'Z';
    a.download = `Nav-Tools_${timestamp}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  
  return {
    timestamps,
    cameraDistance,
    cameraAngle,
    pidLeftSpeed,
    pidRightSpeed,
    motorLeftSpeed,
    motorRightSpeed,
    addRawData,
    initRawData,
    clearRawData,
    saveData,
  }
}
