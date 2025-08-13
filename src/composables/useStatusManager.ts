import { reactive } from "vue";
// import { followStatus } from "./follow/useFollowStatus";
import { FuncMode } from "@/types/config";

const monitorStatus = reactive({});

function emptyStatus() {
  Object.keys(monitorStatus as Record<string, unknown>).forEach(k => delete (monitorStatus as Record<string, unknown>)[k]);
}

function updateStatus(funcMode: FuncMode) {
  switch (funcMode) {
    case FuncMode.Follow:
      emptyStatus();
      // Object.assign(monitorStatus, followStatus);
      break;
    case FuncMode.Tree:
      emptyStatus();
      break;
    case FuncMode.Gnss:
      emptyStatus();
      break;
    case FuncMode.Imu:
      emptyStatus();
      break;
    case FuncMode.Vision:
      emptyStatus();
      break;
    default:
      emptyStatus();
      break;
  }
}

export { monitorStatus, updateStatus };
