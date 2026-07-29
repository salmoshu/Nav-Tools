import { nextTick, ref, watch } from "vue";
import { useGnssStore } from "@/stores/gnss";
import { useFlowStore } from "@/stores/flow";
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { useTheme } from '@/composables/useTheme'
import { JsonStorage } from '@/core/storage/JsonStorage'
import { filterDisplayableStatusEntries } from '@/core/status/statusValue'
import { t } from '@/i18n'

const STATUS_ORDER_KEY = 'nav-tools:status-order'
const statusOrderStorage = new JsonStorage(localStorage)
const { activeDataModes } = useApplicationSelector()
const { resolvedTheme } = useTheme()

/**
 * 1. 状态管理
 */
const isEditMode = ref(false);
const showStatusBar = ref<boolean | null>(null);
const showToolBar = ref<boolean | null>(null);
/** 工具栏停靠位置；默认值与首次启动行为保持一致（底部）。 */
const toolbarPosition = ref<'top' | 'right' | 'bottom' | 'left'>('bottom');
/** 状态栏停靠位置；默认值与首次启动行为保持一致（右侧）。 */
const statusbarPosition = ref<'left' | 'right'>('right');
const editStatusConfig = ref<any>(null);
const newStatusConfig = ref({
  fieldName: '',
  decimalPlaces: 2,
  color: '#2c3e50',
  code: ''
});

const statusOrder = ref<string[]>(
  statusOrderStorage.read<string[]>(
    STATUS_ORDER_KEY,
    [],
    value => Array.isArray(value) && value.every(item => typeof item === 'string'),
  ),
)

watch(statusOrder, order => statusOrderStorage.write(STATUS_ORDER_KEY, order), { deep: true })

function orderEntries(entries: [string, any][]): [string, any][] {
  const orderMap = new Map(statusOrder.value.map((key, index) => [key, index]))
  return entries.sort((a, b) => {
    const indexA = orderMap.get(a[0])
    const indexB = orderMap.get(b[0])
    if (indexA !== undefined && indexB !== undefined) return indexA - indexB
    if (indexA !== undefined) return -1
    if (indexB !== undefined) return 1
    return 0
  })
}

function getMonitorStatus() {
  const modes = activeDataModes.value
  const uniqueStatusSources = [
    ...(modes.some(mode => mode === 'flow' || mode === 'motor')
      ? [{ label: 'Flow', status: useFlowStore().status }]
      : []),
    ...(modes.includes('gnss')
      ? [{ label: 'GNSS', status: useGnssStore().status }]
      : []),
  ]

  if (uniqueStatusSources.length === 1) {
    return Object.fromEntries(
      orderEntries(filterDisplayableStatusEntries(Object.entries(uniqueStatusSources[0].status))),
    )
  }

  return Object.fromEntries(
    orderEntries(
      uniqueStatusSources.flatMap(source =>
        filterDisplayableStatusEntries(Object.entries(source.status)).map(
          ([key, value]): [string, unknown] => [`${source.label}.${key}`, value],
        ),
      ),
    ),
  )
}

function setStatusOrder(order: string[]) {
  statusOrder.value = order
}

/**
 * 2. 公式编辑
 */
import * as monaco from 'monaco-editor'

const editorRef = ref<HTMLDivElement>()   // 容器
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let disposeListener: monaco.IDisposable | null = null

const Function = monaco.languages.CompletionItemKind.Function
const Constant = monaco.languages.CompletionItemKind.Constant
const SAFE_FUNC_SNIPPETS = [
  { label: 'divide_s', insertText: 'divide_s', kind: Constant, doc: t('data.funcSafeDivide') },
]

const MATHJS_FUNC_SNIPPETS = [
  { label: 'abs',    insertText: 'abs', kind: Function, doc: t('data.funcAbs') },
  { label: 'acos',   insertText: 'acos', kind: Function, doc: t('data.funcAcos') },
  { label: 'acosh',  insertText: 'acosh', kind: Function, doc: t('data.funcAcosh') },
  { label: 'asin',   insertText: 'asin', kind: Function, doc: t('data.funcAsin') },
  { label: 'asinh',  insertText: 'asinh', kind: Function, doc: t('data.funcAsinh') },
  { label: 'atan',   insertText: 'atan', kind: Function, doc: t('data.funcAtan') },
  { label: 'atan2',  insertText: 'atan2', kind: Function, doc: t('data.funcAtan2') },
  { label: 'atanh',  insertText: 'atanh', kind: Function, doc: t('data.funcAtanh') },
  { label: 'ceil',   insertText: 'ceil', kind: Function, doc: t('data.funcCeil') },
  { label: 'cos',    insertText: 'cos', kind: Function, doc: t('data.funcCos') },
  { label: 'cosh',   insertText: 'cosh', kind: Function, doc: t('data.funcCosh') },
  { label: 'cube',   insertText: 'cube', kind: Function, doc: t('data.funcCube') },
  { label: 'exp',    insertText: 'exp', kind: Function, doc: t('data.funcExp') },
  { label: 'floor',  insertText: 'floor', kind: Function, doc: t('data.funcFloor') },
  { label: 'gcd',    insertText: 'gcd', kind: Function, doc: t('data.funcGcd') },
  { label: 'lcm',    insertText: 'lcm', kind: Function, doc: t('data.funcLcm') },
  { label: 'log',    insertText: 'log', kind: Function, doc: t('data.funcLog') },
  { label: 'log10',  insertText: 'log10', kind: Function, doc: t('data.funcLog10') },
  { label: 'log2',   insertText: 'log2', kind: Function, doc: t('data.funcLog2') },
  { label: 'mean',   insertText: 'mean', kind: Function, doc: t('data.funcMean') },
  { label: 'median', insertText: 'median', kind: Function, doc: t('data.funcMedian') },
  { label: 'min',    insertText: 'min', kind: Function, doc: t('data.funcMin') },
  { label: 'max',    insertText: 'max', kind: Function, doc: t('data.funcMax') },
  { label: 'pow',    insertText: 'pow', kind: Function, doc: t('data.funcPow') },
  { label: 'random', insertText: 'random', kind: Function, doc: t('data.funcRandom') },
  { label: 'round',  insertText: 'round', kind: Function, doc: t('data.funcRound') },
  { label: 'sign',   insertText: 'sign', kind: Function, doc: t('data.funcSign') },
  { label: 'sin',    insertText: 'sin', kind: Function, doc: t('data.funcSin') },
  { label: 'sinh',   insertText: 'sinh', kind: Function, doc: t('data.funcSinh') },
  { label: 'sqrt',   insertText: 'sqrt', kind: Function, doc: t('data.funcSqrt') },
  { label: 'square', insertText: 'square', kind: Function, doc: t('data.funcSquare') },
  { label: 'tan',    insertText: 'tan', kind: Function, doc: t('data.funcTan') },
  { label: 'tanh',   insertText: 'tanh', kind: Function, doc: t('data.funcTanh') },
  { label: 'sum',    insertText: 'sum', kind: Function, doc: t('data.funcSum') },
  { label: 'prod',   insertText: 'prod', kind: Function, doc: t('data.funcProd') },
  { label: 'std',    insertText: 'std', kind: Function, doc: t('data.funcStd') },
  { label: 'var',    insertText: 'var', kind: Function, doc: t('data.funcVar') },
  { label: 'det',    insertText: 'det', kind: Function, doc: t('data.funcDet') },
  { label: 'transpose', insertText: 'transpose', kind: Function, doc: t('data.funcTranspose') },
  { label: 'inv',    insertText: 'inv', kind: Function, doc: t('data.funcInv') }
]

const MATHJS_CONSTANTS = [
  { label: 'PI',  insertText: 'PI',  kind: Constant, doc: t('data.constPi') },
  { label: 'E',   insertText: 'E',   kind: Constant, doc: t('data.constE') },
  { label: 'LN2', insertText: 'LN2', kind: Constant, doc: t('data.constLn2') },
  { label: 'LN10',insertText: 'LN10',kind: Constant, doc: t('data.constLn10') },
  { label: 'LOG2E',insertText:'LOG2E',kind:Constant, doc: t('data.constLog2e') },
  { label: 'LOG10E',insertText:'LOG10E',kind:Constant, doc: t('data.constLog10e') },
  { label: 'SQRT1_2',insertText:'SQRT1_2',kind:Constant, doc: t('data.constSqrt1_2') },
  { label: 'SQRT2',insertText:'SQRT2',kind:Constant, doc: t('data.constSqrt2') }
]

const BASE_COMPLETION_HINTS = [
  ...SAFE_FUNC_SNIPPETS,
  ...MATHJS_FUNC_SNIPPETS,
  ...MATHJS_CONSTANTS,
]
const customHints = ref([...BASE_COMPLETION_HINTS])

monaco.languages.register({ id: 'mathjs' })
monaco.languages.setLanguageConfiguration('mathjs', {
  brackets: [['(', ')']],
  autoClosingPairs: [{ open: '(', close: ')' }],
  surroundingPairs: [{ open: '(', close: ')' }]
})
monaco.languages.registerCompletionItemProvider('mathjs', {
  // 1. 加入字母触发器
  triggerCharacters: ['(', ',', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
                      'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'],

  provideCompletionItems(model, position) {
    const text = model.getValue()
    const offset = model.getOffsetAt(position)

    // 2. 向前找“合法前缀”：字母、数字、点
    let start = offset - 1
    while (start >= 0 && /[\w.]/.test(text[start])) start--
    const prefix = text.slice(start + 1, offset)

    // 3. 过滤你的词库
    const list = customHints.value.filter(it =>
      it.label.toLowerCase().startsWith(prefix.toLowerCase())
    )

    return {
      suggestions: list.map(it => ({
        ...it,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range: new monaco.Range(
          position.lineNumber, position.column - prefix.length,
          position.lineNumber, position.column
        )
      }))
    }
  }
})

function setMonacoFieldWords(labels: string[]) {
  const baseLabels = new Set(BASE_COMPLETION_HINTS.map(item => item.label))
  const fieldHints = [...new Set(labels.map(label => label.trim()).filter(Boolean))]
    .filter(label => !baseLabels.has(label))
    .map(label => ({
      label,
      kind: monaco.languages.CompletionItemKind.Field,
      insertText: label,
      doc: label,
    }))

  customHints.value = [...BASE_COMPLETION_HINTS, ...fieldHints]
}

async function createCodeEditor() {
  let initValue = ''
  if (isEditMode.value) {
    initValue = editStatusConfig.value.code || ''
  } else {
    initValue = newStatusConfig.value.code || ''
  }

  // 必须等 DOM 真正插入完成
  await nextTick()
  await new Promise(r => requestAnimationFrame(r))

  if(editor) {
    editor.dispose();
    disposeListener?.dispose();
  }

  // 2. 创建编辑器
  editor = monaco.editor.create(editorRef.value!, {
    value: '',
    language: 'mathjs',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    lineNumbers: 'on',
    lineNumbersMinChars: 1,
    theme: resolvedTheme.value === 'dark' ? 'vs-dark' : 'vs',
  })
  editor.setValue(initValue)

  disposeListener = editor.onDidChangeModelContent(() => {
    const newCode = editor!.getValue() // 最新全文

    if(isEditMode.value) {
      editStatusConfig.value.code = newCode;
    } else {
      newStatusConfig.value.code = newCode;
    }
  })
}

watch(resolvedTheme, theme => {
  monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs')
})

export { 
  editorRef,
  isEditMode,
  showStatusBar,
  showToolBar,
  toolbarPosition,
  statusbarPosition,
  editStatusConfig,
  newStatusConfig,
  statusOrder,
  getMonitorStatus,
  setStatusOrder,
  setMonacoFieldWords,
  createCodeEditor,
};
