import { ref } from "vue";
import { useGnssStore } from "@/stores/gnss";
import { useFollowStore as useFollowsimStore } from "@/stores/followsim";
import { useFollowStore } from "@/stores/follow";
import { navMode } from "@/settings/config";
// import { useDemo1Store } from "@/stores/demo1";
import { useFlowStore } from "@/stores/flow";

const showStatusBar = ref(true)

function getMonitorStatus() {
  const funcMode = navMode.funcMode
  const result = ref<Record<string, any>>({})
  switch (funcMode) {
    case 'flow':
      const flowStore = useFlowStore();
      result.value = flowStore.status
      break;
    case 'follow':
      const followStore = useFollowStore();
      result.value = followStore.status
      break;
    case 'followsim':
      const followsimStore = useFollowsimStore();
      result.value = followsimStore.status
      break;
    case 'gnss':
      const gnssStore = useGnssStore()
      result.value = gnssStore.status
      break;
    // case 'demo1':
    //   const demo1Store = useDemo1Store();
    //   result.value = demo1Store.status
    //   break;
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
