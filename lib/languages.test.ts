import { describe, expect, it } from 'vitest'
import { analyzeCode } from './diagram'
import { starterFiles } from './codeflow-examples'
import { getRuntimePlan, isLanguage, languageFromFileName, SUPPORTED_LANGUAGES } from './languages'

const kinds = (language: Parameters<typeof analyzeCode>[1], source: string) => {
  const graph = analyzeCode(source, language)
  return { graph, kinds: graph.nodes.map((node) => node.data.kind) }
}

describe('multi-language support', () => {
  it('recognizes every supported language and its file extension', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(isLanguage(language)).toBe(true)
    }
    expect(languageFromFileName('Main.java')).toBe('java')
    expect(languageFromFileName('main.rs')).toBe('rust')
    expect(languageFromFileName('program.cs')).toBe('csharp')
    expect(languageFromFileName('main.tsx')).toBe('typescript')
    expect(languageFromFileName('main.unknown')).toBeNull()
  })

  it('builds an execution plan for every language', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const plan = getRuntimePlan(language, '')
      expect(plan.filename.length).toBeGreaterThan(0)
      expect(plan.run.cmd.length).toBeGreaterThan(0)
    }
  })

  it('analyzes every starter file without returning a partial graph', () => {
    for (const file of starterFiles) {
      const graph = analyzeCode(file.code, file.language)
      expect(graph.error, `${file.name}: ${graph.error}`).toBeUndefined()
      expect(graph.nodes.length).toBeGreaterThan(2)
    }
  })

  it('finds control flow in brace languages', () => {
    const java = kinds('java', 'class Main {\n  static int sum(int limit) {\n    int total = 0;\n    for (int i = 1; i <= limit; i++) {\n      if (i % 2 == 0) continue;\n      total += i;\n    }\n    return total;\n  }\n}')
    expect(java.graph.error).toBeUndefined()
    expect(java.kinds).toContain('function')
    expect(java.kinds).toContain('loop')
    expect(java.kinds).toContain('condition')
    expect(java.kinds).toContain('return')

    const rust = kinds('rust', 'fn sum(limit: i32) -> i32 {\n  let mut total = 0;\n  for index in 1..=limit {\n    total += index;\n  }\n  total\n}')
    expect(rust.graph.error).toBeUndefined()
    expect(rust.kinds).toContain('function')
    expect(rust.kinds).toContain('loop')
  })

  it('finds control flow in Lua blocks', () => {
    const lua = kinds('lua', 'local function sum(limit)\n  local total = 0\n  for index = 1, limit do\n    total = total + index\n  end\n  return total\nend\nprint(sum(5))')
    expect(lua.graph.error).toBeUndefined()
    expect(lua.kinds).toContain('function')
    expect(lua.kinds).toContain('loop')
    expect(lua.kinds).toContain('io')
  })
})
