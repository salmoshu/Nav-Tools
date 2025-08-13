import { reactive } from "vue";
// import { followStatus } from "./follow/useFollowStatus";
import { FuncMode } from "@/types/config";
import { useDemo1Store } from "@/stores/demo1";
import { monitorStatus, emptyMonitorStatus } from "@/stores/monitorStatus"

function getMonitorStatus() {
  return monitorStatus;
}

function updateStatus(funcMode: FuncMode) {
  switch (funcMode) {
    case FuncMode.Follow:
      emptyMonitorStatus();
      // Object.assign(monitorStatus, followStatus);
      break;
    case FuncMode.Tree:
      emptyMonitorStatus();
      break;
    case FuncMode.Gnss:
      emptyMonitorStatus();
      break;
    case FuncMode.Imu:
      emptyMonitorStatus();
      break;
    case FuncMode.Vision:
      emptyMonitorStatus();
      break;
    case FuncMode.Demo1:
      const demo1Store = useDemo1Store();
      demo1Store.updateMonitorStatus();
      break;
    case FuncMode.Demo2:
      emptyMonitorStatus();
      break;
    default:
      emptyMonitorStatus();
      break;
  }
}

export { monitorStatus, updateStatus, getMonitorStatus };
