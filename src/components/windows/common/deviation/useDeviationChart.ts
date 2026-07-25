import * as echarts from 'echarts';
import { ScatterChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { nextTick, ref } from 'vue';

echarts.use([ScatterChart, GridComponent, CanvasRenderer] as any);

type WheelHandler = (event: WheelEvent) => void;

interface UseDeviationChartOptions {
  initialTracking?: boolean;
  initialPadding?: number;
  initialPointSize?: number;
}

export function useDeviationChart(options: UseDeviationChartOptions = {}) {
  const chartRef = ref<HTMLElement | null>(null);
  const chartInstance = ref<any>(null);
  const chartContainerRef = ref<HTMLElement | null>(null);
  const isTracking = ref(options.initialTracking ?? false);
  const padding = ref(options.initialPadding ?? 10000);
  const pointSize = ref(options.initialPointSize ?? 10);
  const chartDom = ref<HTMLElement | null>(null);

  let resizeObserver: ResizeObserver | null = null;
  let resizeFrame: number | null = null;

  function createChart() {
    if (!chartRef.value) return null;
    if (chartInstance.value) {
      chartInstance.value.dispose();
    }

    chartInstance.value = echarts.init(chartRef.value, null, {
      renderer: 'canvas',
      antialias: false,
    } as any);

    return chartInstance.value;
  }

  function disconnectResizeObserver() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (resizeFrame !== null) {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
    }
  }

  function setupResizeObserver(onResize: () => void) {
    if (!chartRef.value) return;

    disconnectResizeObserver();
    resizeObserver = new ResizeObserver(() => {
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        const chart = chartInstance.value;
        if (!chart || !chart.getDom()) return;

        chart.resize();
        nextTick(onResize);
      });
    });

    const parentElement = chartRef.value.parentElement;
    if (parentElement) {
      resizeObserver.observe(parentElement);
    }
    if (chartContainerRef.value) {
      resizeObserver.observe(chartContainerRef.value);
    }
  }

  function getDataZoomConfig(xStart?: number, xEnd?: number, yStart?: number, yEnd?: number) {
    const initXConfig = {
      type: 'inside',
      xAxisIndex: 0,
      zoomOnMouseWheel: false,
      moveOnMouseWheel: !isTracking.value,
      moveOnMouseMove: true,
    };

    const initYConfig = {
      type: 'inside',
      yAxisIndex: 0,
      zoomOnMouseWheel: false,
      moveOnMouseWheel: !isTracking.value,
      moveOnMouseMove: true,
    };

    if (xStart !== undefined && xEnd !== undefined && yStart !== undefined && yEnd !== undefined) {
      return [
        {
          ...initXConfig,
          startValue: xStart,
          endValue: xEnd,
        },
        {
          ...initYConfig,
          startValue: yStart,
          endValue: yEnd,
        },
      ];
    }

    return [initXConfig, initYConfig];
  }

  function maintainEqualAxisScale() {
    if (!chartInstance.value || !chartContainerRef.value) return;

    const chartOption = chartInstance.value.getOption();
    const containerWidth = chartContainerRef.value.clientWidth;
    const containerHeight = chartContainerRef.value.clientHeight;

    const grid = chartOption.grid[0];
    const gridLeft = typeof grid.left === 'string' ? parseInt(grid.left) : grid.left;
    const gridRight = typeof grid.right === 'string' ? parseInt(grid.right) : grid.right;
    const gridTop = typeof grid.top === 'string' ? parseInt(grid.top) : grid.top;
    const gridBottom = typeof grid.bottom === 'string' ? parseInt(grid.bottom) : grid.bottom;

    const plotWidth = containerWidth - gridLeft - gridRight;
    const plotHeight = containerHeight - gridTop - gridBottom;

    const xMin = chartOption.xAxis[0].min || -padding.value;
    const xMax = chartOption.xAxis[0].max || padding.value;
    const yMin = chartOption.yAxis[0].min || -padding.value;
    const yMax = chartOption.yAxis[0].max || padding.value;

    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    const xPixelPerUnit = plotWidth / xRange;
    const yPixelPerUnit = plotHeight / yRange;
    const minPixelPerUnit = Math.min(xPixelPerUnit, yPixelPerUnit);

    const xCenter = (xMin + xMax) / 2;
    const yCenter = (yMin + yMax) / 2;
    const newXRange = plotWidth / minPixelPerUnit;
    const newYRange = plotHeight / minPixelPerUnit;

    chartInstance.value.setOption({
      xAxis: {
        min: xCenter - newXRange / 2,
        max: xCenter + newXRange / 2,
      },
      yAxis: {
        min: yCenter - newYRange / 2,
        max: yCenter + newYRange / 2,
      },
    });
  }

  function bindWheelHandler(handler: WheelHandler) {
    unbindWheelHandler(handler);
    chartDom.value = chartInstance.value?.getDom() ?? null;
    if (!chartDom.value) return;

    const listener = handler as unknown as (event: Event) => void;
    chartDom.value.addEventListener('mousewheel', listener, { passive: false, capture: true });
    chartDom.value.addEventListener('wheel', listener, { passive: false, capture: true });
  }

  function unbindWheelHandler(handler: WheelHandler) {
    if (!chartDom.value) return;

    const listener = handler as unknown as (event: Event) => void;
    chartDom.value.removeEventListener('mousewheel', listener, { capture: true });
    chartDom.value.removeEventListener('wheel', listener, { capture: true });
    chartDom.value = null;
  }

  return {
    chartRef,
    chartInstance,
    chartContainerRef,
    isTracking,
    padding,
    pointSize,
    createChart,
    setupResizeObserver,
    disconnectResizeObserver,
    getDataZoomConfig,
    maintainEqualAxisScale,
    bindWheelHandler,
    unbindWheelHandler,
  };
}
