import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

interface PackageJson {
  scripts?: Record<string, string>
}

interface TypeScriptConfig {
  compilerOptions?: Record<string, unknown>
  include?: string[]
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')) as T
}

describe('Electron 类型检查配置', () => {
  it('严格检查 main 与 preload 源码', () => {
    const config = readJson<TypeScriptConfig>('tsconfig.node.json')

    expect(config.compilerOptions).toMatchObject({
      target: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noEmit: true,
    })
    expect(config.include).toEqual(
      expect.arrayContaining(['electron/main/**/*.ts', 'electron/preload/**/*.ts']),
    )
  })

  it('统一 typecheck 与目录构建都会执行 Electron 检查', () => {
    const { scripts = {} } = readJson<PackageJson>('package.json')

    expect(scripts['typecheck:electron']).toBe('tsc -p tsconfig.node.json --noEmit')
    expect(scripts.typecheck).toContain(scripts['typecheck:electron'])
    expect(scripts['build:dir']).toContain(scripts['typecheck:electron'])
  })

  it('限制开发依赖扫描只使用应用根入口', () => {
    const config = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8')
    expect(config).toMatch(/optimizeDeps:\s*\{[\s\S]*?entries:\s*\['index\.html'\]/)
  })
})
