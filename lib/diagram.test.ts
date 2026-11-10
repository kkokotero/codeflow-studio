import { describe, expect, it } from 'vitest'
import { analyzeCode } from './diagram'

const nodesOfKind = (graph: ReturnType<typeof analyzeCode>, kind: string) => graph.nodes.filter((node) => node.data.kind === kind)
const edgesWithRole = (graph: ReturnType<typeof analyzeCode>, role: string) => graph.edges.filter((edge) => edge.data?.role === role)

describe('analyzeCode', () => {
  it('returns an empty graph for blank source', () => {
    expect(analyzeCode('  \n ', 'javascript')).toEqual({ nodes: [], edges: [] })
  })

  it('summarizes JavaScript expressions as one vertical process and uses standard flowchart shapes', () => {
    const graph = analyzeCode('const total = (a + b) * scale - offset\nconsole.log(total)', 'javascript')
    const assignment = nodesOfKind(graph, 'variable')[0]
    const output = nodesOfKind(graph, 'io')[0]

    expect(graph.error).toBeUndefined()
    expect(nodesOfKind(graph, 'operation')).toHaveLength(0)
    expect(nodesOfKind(graph, 'variable')).toHaveLength(1)
    expect(nodesOfKind(graph, 'io')).toHaveLength(1)
    expect(nodesOfKind(graph, 'start')[0].data.shape).toBe('terminator')
    expect(nodesOfKind(graph, 'end')[0].data.shape).toBe('terminator')
    expect(assignment.data.shape).toBe('process')
    expect(output.data.shape).toBe('input-output')
    expect(output.position.y).toBeGreaterThan(assignment.position.y)
    expect(graph.nodes.length).toBeLessThanOrEqual(5)
  })

  it('shows explicit vertical true and false branches for JavaScript decisions', () => {
    const graph = analyzeCode('if (ready) {\n  send()\n} else {\n  wait()\n}', 'javascript')
    const decision = nodesOfKind(graph, 'condition')[0]
    const branches = graph.edges.filter((edge) => edge.source === decision.id && (edge.data?.role === 'true' || edge.data?.role === 'false'))
    const targets = branches.map((edge) => graph.nodes.find((node) => node.id === edge.target)!)

    expect(graph.error).toBeUndefined()
    expect(decision.data.shape).toBe('decision')
    expect(edgesWithRole(graph, 'true')).toHaveLength(1)
    expect(edgesWithRole(graph, 'false')).toHaveLength(1)
    expect(nodesOfKind(graph, 'connector')).toHaveLength(1)
    expect(new Set(branches.map((edge) => edge.sourceHandle)).size).toBe(2)
    expect(new Set(targets.map((node) => node.position.x)).size).toBe(2)
    expect(targets.every((node) => node.position.y > decision.position.y)).toBe(true)
  })

  it('routes JavaScript loop returns outside the vertical sequence', () => {
    const graph = analyzeCode('for (const item of items) {\n  if (!item) continue\n  if (item.done) break\n  process(item)\n}', 'javascript')
    const loop = nodesOfKind(graph, 'loop')[0]
    const repeatEdges = edgesWithRole(graph, 'repeat')

    expect(graph.error).toBeUndefined()
    expect(nodesOfKind(graph, 'loop')).toHaveLength(1)
    expect(repeatEdges.length).toBeGreaterThan(0)
    expect(repeatEdges.every((edge) => edge.type === 'flowLoop' && Number.isFinite(edge.data?.routeX))).toBe(true)
    expect(repeatEdges.every((edge) => edge.targetHandle === 'target-left' || edge.targetHandle === 'target-right')).toBe(true)
    expect(edgesWithRole(graph, 'exit').length).toBeGreaterThan(0)
    expect(loop.position.y).toBeLessThan(Math.max(...graph.nodes.map((node) => node.position.y)))
  })

  it('creates an analyzable subflow for JavaScript arrow functions', () => {
    const graph = analyzeCode('const double = (value) => value * 2\ndouble(3)', 'javascript')
    const entry = graph.nodes.find((node) => node.data.label === 'Inicio · double()')
    const call = nodesOfKind(graph, 'call')[0]

    expect(graph.error).toBeUndefined()
    expect(entry).toBeDefined()
    expect(graph.edges.some((edge) => edge.source === call.id && edge.target === entry?.id && edge.data?.role === 'data')).toBe(true)
  })

  it('uses source lines and explicit branches for Python conditions', () => {
    const graph = analyzeCode('def classify(value):\n    if value > 0:\n        return "positive"\n    else:\n        return "negative"', 'python')
    const condition = nodesOfKind(graph, 'condition')[0]

    expect(graph.error).toBeUndefined()
    expect(condition.data.line).toBe(2)
    expect(edgesWithRole(graph, 'true')).toHaveLength(1)
    expect(edgesWithRole(graph, 'false')).toHaveLength(1)
    expect(nodesOfKind(graph, 'operation')).toHaveLength(0)
  })

  it('keeps Python for-else and break routes distinct', () => {
    const graph = analyzeCode('def search(items):\n    for item in items:\n        if item:\n            break\n    else:\n        print("empty")', 'python')

    expect(graph.error).toBeUndefined()
    expect(nodesOfKind(graph, 'loop')).toHaveLength(1)
    expect(edgesWithRole(graph, 'exit').length).toBeGreaterThan(0)
    expect(graph.edges.some((edge) => String(edge.label ?? '').includes('agotado') && edge.data?.role === 'body')).toBe(true)
    expect(nodesOfKind(graph, 'io')).toHaveLength(1)
  })

  it('preserves Python match case edges', () => {
    const graph = analyzeCode('def choose(value):\n    match value:\n        case 1:\n            return "one"\n        case _:\n            return "other"', 'python')

    expect(graph.error).toBeUndefined()
    expect(nodesOfKind(graph, 'condition')).toHaveLength(1)
    expect(edgesWithRole(graph, 'case')).toHaveLength(2)
  })

  it('produces equivalent decision and return routes for JavaScript and Python', () => {
    const javascript = analyzeCode('function choose(value) {\n  if (value > 0) {\n    return "positive"\n  }\n  return "non-positive"\n}', 'javascript')
    const python = analyzeCode('def choose(value):\n    if value > 0:\n        return "positive"\n    return "non-positive"', 'python')

    for (const graph of [javascript, python]) {
      expect(graph.error).toBeUndefined()
      expect(nodesOfKind(graph, 'condition')).toHaveLength(1)
      expect(nodesOfKind(graph, 'return')).toHaveLength(2)
      expect(nodesOfKind(graph, 'return').every((node) => node.data.shape === 'terminator')).toBe(true)
      expect(edgesWithRole(graph, 'true')).toHaveLength(1)
      expect(edgesWithRole(graph, 'false')).toHaveLength(1)
      for (const node of nodesOfKind(graph, 'return')) {
        expect(graph.edges.some((edge) => edge.source === node.id && edge.data?.role === 'exit')).toBe(true)
      }
    }
  })

  it('preserves sequential statements and return routes in Python class methods', () => {
    const graph = analyzeCode('class Counter:\n    def __init__(self, start):\n        self.value = start\n        self.value += 1\n        return\n    def value_now(self):\n        return self.value', 'python')
    const init = nodesOfKind(graph, 'function').find((node) => node.data.label === 'Definir __init__()')
    const getter = nodesOfKind(graph, 'function').find((node) => node.data.label === 'Definir value_now()')
    const assignment = nodesOfKind(graph, 'variable').find((node) => node.data.label.includes('self.value = start'))
    const update = nodesOfKind(graph, 'variable').find((node) => node.data.label.includes('self.value += 1'))
    const initReturn = nodesOfKind(graph, 'return').find((node) => node.data.line === 5)

    expect(graph.error).toBeUndefined()
    expect(nodesOfKind(graph, 'class')).toHaveLength(1)
    expect(init).toBeDefined()
    expect(getter).toBeDefined()
    expect(graph.edges.some((edge) => edge.source === init?.id && edge.target === getter?.id && edge.data?.role === 'control')).toBe(true)
    expect(graph.edges.some((edge) => edge.source === assignment?.id && edge.target === update?.id && edge.data?.role === 'control')).toBe(true)
    expect(graph.edges.some((edge) => edge.source === update?.id && edge.target === initReturn?.id && edge.data?.role === 'control')).toBe(true)
    expect(nodesOfKind(graph, 'return')).toHaveLength(2)
  })

  it('keeps Python dictionaries, comprehensions, and multiline expressions compact', () => {
    const graph = analyzeCode('lookup = {"one": 1, "two": 2}\ndoubled = [item * 2 for item in values if item > 0]\nmessage = (\n    "valid "\n    "multiline"\n)', 'python')

    expect(graph.error).toBeUndefined()
    expect(nodesOfKind(graph, 'variable')).toHaveLength(3)
    expect(nodesOfKind(graph, 'operation')).toHaveLength(0)
    expect(graph.nodes).toHaveLength(5)
  })

  it('routes JavaScript do-while entry, continue, repeat, and exit paths', () => {
    const graph = analyzeCode('let index = 0\ndo {\n  index++\n  if (index < limit) continue\n} while (index < limit)', 'javascript')
    const entry = nodesOfKind(graph, 'phase').find((node) => node.data.label === 'Ejecutar cuerpo primero')
    const loop = nodesOfKind(graph, 'loop').find((node) => node.data.detail === 'Decisión · do…while')
    const continueNode = nodesOfKind(graph, 'phase').find((node) => node.data.label === 'continue')

    expect(graph.error).toBeUndefined()
    expect(entry).toBeDefined()
    expect(loop).toBeDefined()
    expect(continueNode).toBeDefined()
    expect(graph.edges.some((edge) => edge.source === entry?.id && edge.data?.role === 'body')).toBe(true)
    expect(graph.edges.some((edge) => edge.source === loop?.id && edge.data?.role === 'true')).toBe(true)
    expect(graph.edges.some((edge) => edge.source === continueNode?.id && edge.target === loop?.id && edge.data?.role === 'repeat')).toBe(true)
    expect(graph.edges.some((edge) => edge.source === loop?.id && edge.data?.role === 'false')).toBe(true)
  })

  it('routes Python break and continue to their loop destinations', () => {
    const graph = analyzeCode('def iterate(items):\n    for item in items:\n        if item is None:\n            continue\n        if item == 0:\n            break\n        process(item)\n    return', 'python')
    const loop = nodesOfKind(graph, 'loop')[0]
    const continueNode = nodesOfKind(graph, 'phase').find((node) => node.data.label === 'continue')
    const breakNode = nodesOfKind(graph, 'phase').find((node) => node.data.label === 'break')
    const loopExitEdge = graph.edges.find((edge) => edge.source === loop.id && edge.data?.role === 'false')
    const breakEdge = graph.edges.find((edge) => edge.source === breakNode?.id && edge.data?.role === 'exit')

    expect(graph.error).toBeUndefined()
    expect(graph.edges.some((edge) => edge.source === continueNode?.id && edge.target === loop.id && edge.data?.role === 'repeat')).toBe(true)
    expect(breakEdge?.target).toBe(loopExitEdge?.target)
    expect(nodesOfKind(graph, 'connector').some((node) => node.id === breakEdge?.target)).toBe(true)
  })

  it('returns no partial graph for malformed or unsupported syntax', () => {
    const malformed = analyzeCode('function {', 'javascript')
    const unsupported = analyzeCode('try { work() } finally { cleanup() }', 'javascript')
    const unsupportedPython = analyzeCode('try:\n    work()\nfinally:\n    cleanup()', 'python')
    const malformedPython = analyzeCode('def broken(:\n    pass', 'python')

    for (const result of [malformed, unsupported, unsupportedPython, malformedPython]) {
      expect(result.nodes).toHaveLength(0)
      expect(result.edges).toHaveLength(0)
      expect(result.error).toBeTruthy()
    }
  })

  it('enforces source and graph complexity limits without returning partial results', () => {
    const oversizedSource = analyzeCode('x'.repeat(50_001), 'javascript')
    const oversizedGraph = analyzeCode(Array.from({ length: 200 }, (_, index) => `value${index} = ${index}`).join('\n'), 'javascript')

    for (const result of [oversizedSource, oversizedGraph]) {
      expect(result.nodes).toHaveLength(0)
      expect(result.edges).toHaveLength(0)
      expect(result.error).toBeTruthy()
    }
  })
})
