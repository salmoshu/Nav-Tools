import { ref } from "vue";
import { useGnssStore } from "@/stores/gnss";
import { useFollowStore } from "@/stores/follow";
import { FuncMode, navMode } from "@/types/config";
import { useDemo1Store } from "@/stores/demo1";

function getMonitorStatus() {
  const funcMode = navMode.funcMode
  const result = ref<Record<string, any>>({})
  switch (funcMode) {
    case FuncMode.Follow:
      const followStore = useFollowStore();
      result.value = followStore.status
      break;
    case FuncMode.Tree:
      result.value = {}
      break;
    case FuncMode.Gnss:
      const gnssStore = useGnssStore()
      result.value = gnssStore.status
      break;
    case FuncMode.Imu:
      result.value = {}
      break;
    case FuncMode.Vision:
      result.value = {}
      break;
    case FuncMode.Demo1:
      const demo1Store = useDemo1Store();
      result.value = demo1Store.status
      break;
    case FuncMode.Demo2:
      result.value = {}
      break;
    default:
      result.value = {}
      break;
  }
  return result.value
}

export { getMonitorStatus };
