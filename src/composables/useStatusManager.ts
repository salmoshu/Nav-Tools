import { ref } from "vue";
import { useGnssStore } from "@/stores/gnss";
import { useFollowStore as useFollowsimStore } from "@/stores/followsim";
import { useUltrasonicStore } from "@/stores/ultrasonic";
import { navMode } from "@/settings/config";
// import { useDemo1Store } from "@/stores/demo1";
import { useFlowStore } from "@/stores/flow";

/**
 * 1. 状态管理
 */
const isEditMode = ref(false);
const showStatusBar = ref<boolean | null>(null);
const editStatusConfig = ref<any>(null);
const newStatusConfig = ref({
  fieldName: '',
  decimalPlaces: 2,
  color: '#2c3e50',
  code: ''
});

function getMonitorStatus() {
  const funcMode = navMode.funcMode
  const result = ref<Record<string, any>>({})
  switch (funcMode) {
    case 'flow':
      const flowStore = useFlowStore();
      result.value = flowStore.status
      break;
    case 'ultrasonic':
      const ultrasonicStore = useUltrasonicStore()
      result.value = ultrasonicStore.status
      break;
    case 'gnss':
      const gnssStore = useGnssStore()
      result.value = gnssStore.status
      break;
    case 'followsim':
      const followsimStore = useFollowsimStore();
      result.value = followsimStore.status
      break;
    case 'motor':
      result.value = useFlowStore().status
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

/**
 * 2. 公式编辑
 */
import * as monaco from 'monaco-editor'
import { nextTick } from "vue";

const editorRef = ref<HTMLDivElement>()   // 容器
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let disposeListener: monaco.IDisposable | null = null

const Function = monaco.languages.CompletionItemKind.Function
const Constant = monaco.languages.CompletionItemKind.Constant
const SAFE_FUNC_SNIPPETS = [
  { label: 'divide_s', insertText: 'divide_s', kind: Constant, doc: '安全除法' },
]

const MATHJS_FUNC_SNIPPETS = [
  { label: 'abs',    insertText: 'abs', kind: Function, doc: '绝对值' },
  { label: 'acos',   insertText: 'acos', kind: Function, doc: '反余弦（弧度）' },
  { label: 'acosh',  insertText: 'acosh', kind: Function, doc: '反双曲余弦' },
  { label: 'asin',   insertText: 'asin', kind: Function, doc: '反正弦（弧度）' },
  { label: 'asinh',  insertText: 'asinh', kind: Function, doc: '反双曲正弦' },
  { label: 'atan',   insertText: 'atan', kind: Function, doc: '反正切（弧度）' },
  { label: 'atan2',  insertText: 'atan2', kind: Function, doc: '双参反正切' },
  { label: 'atanh',  insertText: 'atanh', kind: Function, doc: '反双曲正切' },
  { label: 'ceil',   insertText: 'ceil', kind: Function, doc: '向上取整' },
  { label: 'cos',    insertText: 'cos', kind: Function, doc: '余弦' },
  { label: 'cosh',   insertText: 'cosh', kind: Function, doc: '双曲余弦' },
  { label: 'cube',   insertText: 'cube', kind: Function, doc: 'x³' },
  { label: 'exp',    insertText: 'exp', kind: Function, doc: 'e^x' },
  { label: 'floor',  insertText: 'floor', kind: Function, doc: '向下取整' },
  { label: 'gcd',    insertText: 'gcd', kind: Function, doc: '最大公约数' },
  { label: 'lcm',    insertText: 'lcm', kind: Function, doc: '最小公倍数' },
  { label: 'log',    insertText: 'log', kind: Function, doc: '自然对数' },
  { label: 'log10',  insertText: 'log10', kind: Function, doc: '10 为底对数' },
  { label: 'log2',   insertText: 'log2', kind: Function, doc: '2 为底对数' },
  { label: 'mean',   insertText: 'mean', kind: Function, doc: '算术平均' },
  { label: 'median', insertText: 'median', kind: Function, doc: '中位数' },
  { label: 'min',    insertText: 'min', kind: Function, doc: '最小值' },
  { label: 'max',    insertText: 'max', kind: Function, doc: '最大值' },
  { label: 'pow',    insertText: 'pow', kind: Function, doc: '幂运算' },
  { label: 'random', insertText: 'random', kind: Function, doc: '随机数' },
  { label: 'round',  insertText: 'round', kind: Function, doc: '四舍五入' },
  { label: 'sign',   insertText: 'sign', kind: Function, doc: '符号函数' },
  { label: 'sin',    insertText: 'sin', kind: Function, doc: '正弦' },
  { label: 'sinh',   insertText: 'sinh', kind: Function, doc: '双曲正弦' },
  { label: 'sqrt',   insertText: 'sqrt', kind: Function, doc: '平方根' },
  { label: 'square', insertText: 'square', kind: Function, doc: 'x²' },
  { label: 'tan',    insertText: 'tan', kind: Function, doc: '正切' },
  { label: 'tanh',   insertText: 'tanh', kind: Function, doc: '双曲正切' },
  { label: 'sum',    insertText: 'sum', kind: Function, doc: '求和' },
  { label: 'prod',   insertText: 'prod', kind: Function, doc: '连乘' },
  { label: 'std',    insertText: 'std', kind: Function, doc: '标准差' },
  { label: 'var',    insertText: 'var', kind: Function, doc: '方差' },
  { label: 'det',    insertText: 'det', kind: Function, doc: '矩阵行列式' },
  { label: 'transpose', insertText: 'transpose', kind: Function, doc: '矩阵转置' },
  { label: 'inv',    insertText: 'inv', kind: Function, doc: '矩阵求逆' }
]

const MATHJS_CONSTANTS = [
  { label: 'PI',  insertText: 'PI',  kind: Constant, doc: '圆周率 π' },
  { label: 'E',   insertText: 'E',   kind: Constant, doc: '自然底数 e' },
  { label: 'LN2', insertText: 'LN2', kind: Constant, doc: 'ln(2)' },
  { label: 'LN10',insertText: 'LN10',kind: Constant, doc: 'ln(10)' },
  { label: 'LOG2E',insertText:'LOG2E',kind:Constant, doc: 'log2(e)' },
  { label: 'LOG10E',insertText:'LOG10E',kind:Constant, doc: 'log10(e)' },
  { label: 'SQRT1_2',insertText:'SQRT1_2',kind:Constant, doc: '√0.5' },
  { label: 'SQRT2',insertText:'SQRT2',kind:Constant, doc: '√2' }
]

const customHints = ref([
  ...SAFE_FUNC_SNIPPETS,
  ...MATHJS_FUNC_SNIPPETS,
  ...MATHJS_CONSTANTS,
])  

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

function addMonacoWords(label: string) {
  // 检查是否已存在相同标签的项
  if (customHints.value.some(item => item.label === label)) {
    return; // 如果已存在，直接返回
  }

  customHints.value.push({
    label,
    kind: monaco.languages.CompletionItemKind.Text,
    insertText: label,
    doc: label
  })
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

export { 
  editorRef,
  isEditMode,
  showStatusBar,
  editStatusConfig,
  newStatusConfig,
  getMonitorStatus,
  addMonacoWords,
  createCodeEditor,
};
