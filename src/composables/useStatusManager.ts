import { ref } from "vue";
// import { followStatus } from "./follow/useFollowStatus";
import { FuncMode, navMode } from "@/types/config";
import { useDemo1Store } from "@/stores/demo1";

function getMonitorStatus() {
  const funcMode = navMode.funcMode
  const result = ref<Record<string, any>>({})
  switch (funcMode) {
    case FuncMode.Follow:
      break;
    case FuncMode.Tree:
      break;
    case FuncMode.Gnss:
      break;
    case FuncMode.Imu:
      break;
    case FuncMode.Vision:
      break;
    case FuncMode.Demo1:
      const demo1Store = useDemo1Store();
      result.value = demo1Store.status
      break;
    case FuncMode.Demo2:
      break;
    default:
      break;
  }
  return result.value
}

export { getMonitorStatus };
