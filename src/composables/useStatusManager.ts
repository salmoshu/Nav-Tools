import { ref } from "vue";
import { useGnssStore } from "@/stores/gnss";
import { useFollowStore } from "@/stores/follow";
import { navMode } from "@/settings/config";
import { useDemo1Store } from "@/stores/demo1";

const showStatusBar = ref(true)

function getMonitorStatus() {
  const funcMode = navMode.funcMode
  const result = ref<Record<string, any>>({})
  switch (funcMode) {
    case 'followsim':
      const followStore = useFollowStore();
      result.value = followStore.status
      break;
    case 'tree':
      result.value = {}
      break;
    case 'gnss':
      const gnssStore = useGnssStore()
      result.value = gnssStore.status
      break;
    case 'imu':
      result.value = {}
      break;
    case 'vision':
      result.value = {}
      break;
    case 'demo1':
      const demo1Store = useDemo1Store();
      result.value = demo1Store.status
      break;
    case 'demo2':
      result.value = {}
      break;
    default:
      result.value = {}
      break;
  }
  return result.value
}

export { 
  showStatusBar,
  getMonitorStatus 
};
