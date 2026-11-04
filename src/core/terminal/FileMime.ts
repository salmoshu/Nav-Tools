/**
 * 文件名 → MIME 的映射,供路径预览与富内容渲染共用。
 *
 * 与 shell 注入里的 `nav-render` 保持一致:按扩展名猜 MIME,猜不出按 text/plain。
 * 这里同时提供「是否可预览」判定,主进程据此决定是回传内容还是回传一个兜底提示。
 */

const EXTENSION_MIME: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

/**
 * 路径检测用的扩展名白名单。
 *
 * 存在的意义是压掉误判:像 `1.5.0` 这种版本号在纯语法上像「文件名 + 扩展名」,
 * 但 `.0` 不在白名单里,因此不会被当成路径。列表偏向嵌入式/导航开发常见文件类型
 * (源码、日志、固件、地图、脚本、配置),不做穷举。
 */
const PATH_EXTENSIONS = new Set([
  // 文档
  'md',
  'markdown',
  'txt',
  'log',
  'rst',
  'pdf',
  // 数据
  'json',
  'csv',
  'tsv',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'conf',
  'cfg',
  'properties',
  // 源码
  'c',
  'h',
  'cc',
  'cpp',
  'hpp',
  'cxx',
  's',
  'asm',
  'py',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'vue',
  'jsx',
  'go',
  'rs',
  'java',
  'kt',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'bat',
  'cmd',
  'mk',
  'cmake',
  'gradle',
  // 嵌入式/固件
  'bin',
  'hex',
  'elf',
  'map',
  'dtb',
  'dts',
  'dtsi',
  'ld',
  's19',
  'srec',
  'fw',
  'img',
  // 媒体
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'bmp',
  'ico',
  // 归档
  'zip',
  'tar',
  'gz',
  'bz2',
  'xz',
  '7z',
])

const UNSUPPORTED_PREVIEW_EXTENSIONS = new Set([
  // 归档与安装包
  'zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'jar', 'war', 'iso',
  // 可执行文件、固件与其他二进制产物
  'exe', 'dll', 'com', 'msi', 'so', 'dylib', 'a', 'lib', 'o', 'obj', 'elf',
  'bin', 'fw', 'img', 'dtb', 'class', 'pyc', 'pyd',
  // 富内容渲染器不支持的二进制文档、数据库、记录与媒体
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'db', 'sqlite', 'sqlite3',
  'mcap', 'bag', 'pcap', 'mp3', 'wav', 'mp4', 'avi', 'mkv', 'mov',
  'woff', 'woff2', 'ttf', 'otf',
])

/** 取文件名的小写扩展名;无扩展名或隐藏文件返回空串 */
export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

/** 按扩展名猜 MIME;猜不出回退 text/plain */
export function mimeFromPath(path: string): string {
  return EXTENSION_MIME[fileExtension(path)] ?? 'text/plain'
}

/** 该扩展名是否可作为「路径候选」参与检测(用于压掉版本号之类的误判) */
export function isPathExtension(extension: string): boolean {
  return PATH_EXTENSIONS.has(extension.toLowerCase())
}

/** 已知无法由当前富内容渲染器展示的类型在读取前拒绝；未知类型仍按纯文本尝试。 */
export function isTerminalPreviewSupported(path: string): boolean {
  return !UNSUPPORTED_PREVIEW_EXTENSIONS.has(fileExtension(path))
}
