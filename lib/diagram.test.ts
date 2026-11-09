import { describe, expect, it } from 'vitest'
import { analyzeCode } from './diagram'

describe('analyzeCode', () => {
  it('builds source-mapped JavaScript nodes and structural connections', () => {
    const graph = analyzeCode('function total(items) {\n  let sum = 0\n  for (const item of items) {\n    sum += item\n  }\n  return sum\n}', 'javascript')

    expect(graph.error).toBeUndefined()
    expect(graph.nodes.map((node) => node.data.kind)).toEqual(['function', 'variable', 'loop', 'return'])
    expect(graph.nodes.map((node) => node.data.line)).toEqual([1, 2, 3, 6])
    expect(graph.edges.length).toBeGreaterThan(0)
  })

  it('analyzes Python functions, branches, assignments, and calls', () => {
    const graph = analyzeCode('def classify(value):\n    if value > 0:\n        result = "positive"\n    print(result)', 'python')

    expect(graph.error).toBeUndefined()
    expect(graph.nodes.map((node) => node.data.kind)).toEqual(['function', 'condition', 'variable', 'call'])
    expect(graph.nodes[1].data.line).toBe(2)
  })

  it('surfaces malformed JavaScript instead of producing a misleading graph', () => {
    const graph = analyzeCode('function {', 'javascript')

    expect(graph.nodes).toHaveLength(0)
    expect(graph.error).toBeTruthy()
  })
})
