import { describe, expect, it } from 'vitest'
import { analyzeCode } from './diagram'

const isStructuralKind = (kind: string) => ['function', 'variable', 'loop', 'return', 'condition', 'call'].includes(kind)

describe('analyzeCode', () => {
  it('builds source-mapped JavaScript nodes, loop phases, and data-flow operations', () => {
    const graph = analyzeCode('function total(items) {\n  let sum = 0\n  for (const item of items) {\n    sum += item\n  }\n  return sum\n}', 'javascript')

    expect(graph.error).toBeUndefined()
    expect(graph.nodes.filter((node) => ['function', 'variable', 'loop', 'return'].includes(node.data.kind)).map((node) => node.data.kind)).toEqual(['function', 'variable', 'loop', 'variable', 'return'])
    expect(graph.nodes.filter((node) => node.data.phase).map((node) => node.data.phase)).toEqual(['initialization', 'condition', 'update', 'exit'])
    expect(graph.nodes.some((node) => node.data.kind === 'operation' && node.data.expression === 'items')).toBe(true)
    expect(graph.edges.some((edge) => edge.data?.role === 'repeat')).toBe(true)
    expect(graph.edges.some((edge) => edge.data?.role === 'data')).toBe(true)
  })

  it('preserves operator precedence and explicit true/false control paths', () => {
    const graph = analyzeCode(`const total = (a + b) * scale - offset\nif (total > 10 && ready) {\n  const half = total / 2\n}`, 'javascript')
    const operations = graph.nodes.filter((node) => node.data.kind === 'operation')

    expect(graph.error).toBeUndefined()
    expect(operations.some((node) => node.data.expression === 'a + b')).toBe(true)
    expect(operations.every((node) => node.data.operationId?.startsWith('js-'))).toBe(true)
    expect(operations.some((node) => node.data.operationCategory === 'comparison')).toBe(true)
    expect(operations.some((node) => node.data.operationCategory === 'logical')).toBe(true)
    expect(graph.edges.some((edge) => edge.data?.role === 'true')).toBe(true)
    expect(graph.edges.some((edge) => edge.data?.role === 'false')).toBe(true)
  })

  it('analyzes Python functions, operations, assignments, and calls', () => {
    const graph = analyzeCode('def classify(value):\n    if value > 0:\n        result = "positive"\n    print(result)', 'python')

    expect(graph.error).toBeUndefined()
    expect(graph.nodes.filter((node) => isStructuralKind(node.data.kind)).map((node) => node.data.kind)).toEqual(['function', 'condition', 'variable', 'call'])
    expect(graph.nodes.some((node) => node.data.kind === 'operation' && node.data.operationCategory === 'comparison')).toBe(true)
    expect(graph.nodes.find((node) => node.data.kind === 'operation' && node.data.expression === 'value > 0')?.data.operationId).toBe('py-2-7-Compare')
    expect(graph.nodes.some((node) => node.data.kind === 'operation' && node.data.operationId?.startsWith('py-'))).toBe(true)
    expect(graph.edges.some((edge) => edge.data?.role === 'true')).toBe(true)
    expect(graph.edges.some((edge) => edge.data?.role === 'false')).toBe(true)
  })

  it('builds Python iterator phases and expression trees', () => {
    const graph = analyzeCode('def total(values):\n    result = 0\n    for value in values:\n        result += value\n    return result', 'python')

    expect(graph.error).toBeUndefined()
    expect(graph.nodes.filter((node) => node.data.phase).map((node) => node.data.phase)).toEqual(['initialization', 'condition', 'update', 'exit'])
    expect(graph.nodes.some((node) => node.data.kind === 'operation' && node.data.expression === 'values')).toBe(true)
    expect(graph.edges.some((edge) => edge.data?.role === 'repeat')).toBe(true)
  })

  it('surfaces malformed JavaScript instead of producing a misleading graph', () => {
    const graph = analyzeCode('function {', 'javascript')

    expect(graph.nodes).toHaveLength(0)
    expect(graph.error).toBeTruthy()
  })
})
