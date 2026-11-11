import { describe, expect, it } from 'vitest'
import { analyzeCode } from './diagram'
import { getFlowNodeSize, routeFlowEdges } from './flow-routing'
import type { FlowCardEdge, FlowCardNode } from './codeflow-types'

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
    // Las ramas se unen directamente: sin punto de convergencia en el diagrama.
    expect(nodesOfKind(graph, 'connector')).toHaveLength(0)
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
    expect(repeatEdges.every((edge) => edge.type === 'flowRouted' && (edge.data?.routePoints?.length ?? 0) >= 2)).toBe(true)
    expect(repeatEdges.every((edge) => edge.sourceHandle?.startsWith('source-') && edge.targetHandle?.startsWith('target-'))).toBe(true)
    expect(edgesWithRole(graph, 'exit').length).toBeGreaterThan(0)
    expect(loop.position.y).toBeLessThan(Math.max(...graph.nodes.map((node) => node.position.y)))
  })

  it('routes nested loop returns around blocks and recalculates after movement', () => {
    const graph = analyzeCode('for (let outer = 0; outer < 3; outer += 1) {\n  for (let inner = 0; inner < 4; inner += 1) {\n    if (inner === 1) continue\n    if (inner === 3) break\n    process(outer, inner)\n  }\n}', 'javascript')
    const repeatEdges = edgesWithRole(graph, 'repeat')

    expect(graph.error).toBeUndefined()
    expect(nodesOfKind(graph, 'loop').length).toBeGreaterThanOrEqual(2)
    expect(repeatEdges.length).toBeGreaterThanOrEqual(2)
    expect(graph.edges.every((edge) => edge.type === 'flowRouted' && (edge.data?.routePoints?.length ?? 0) >= 2)).toBe(true)
    for (const edge of graph.edges) {
      const points = edge.data?.routePoints
      expect(edge.type).toBe('flowRouted')
      expect(points?.length ?? 0).toBeGreaterThanOrEqual(2)
      for (let index = 1; index < (points?.length ?? 0); index += 1) {
        const start = points![index - 1]
        const end = points![index]
        expect(start.x === end.x || start.y === end.y).toBe(true)
        for (const obstacle of graph.nodes.filter((node) => node.id !== edge.source && node.id !== edge.target)) {
          const size = getFlowNodeSize(obstacle)
          const crosses = start.y === end.y
            ? start.y > obstacle.position.y && start.y < obstacle.position.y + size.height && Math.max(Math.min(start.x, end.x), obstacle.position.x) < Math.min(Math.max(start.x, end.x), obstacle.position.x + size.width)
            : start.x > obstacle.position.x && start.x < obstacle.position.x + size.width && Math.max(Math.min(start.y, end.y), obstacle.position.y) < Math.min(Math.max(start.y, end.y), obstacle.position.y + size.height)
          expect(crosses, `edge ${edge.id} crosses ${obstacle.id}`).toBe(false)
        }
      }
    }

    const edgeToMove = repeatEdges[0]
    const movedNodes = graph.nodes.map((node) => node.id === edgeToMove.source
      ? { ...node, position: { x: node.position.x + 120, y: node.position.y + 40 } }
      : node)
    const reroutedEdges = routeFlowEdges(movedNodes, graph.edges)
    const rerouted = reroutedEdges.find((edge) => edge.id === edgeToMove.id)
    expect(rerouted?.data?.routePoints).not.toEqual(edgeToMove.data?.routePoints)
  })

  it('routes a simple pair of intersecting flows around each other', () => {
    const makeNode = (id: string, x: number, y: number): FlowCardNode => ({
      id,
      type: 'flowCard',
      position: { x, y },
      data: { label: id, kind: 'statement', line: 1, detail: 'test', active: false, shape: 'process' },
    })
    const nodes = [makeNode('left', 0, 0), makeNode('right', 500, 0), makeNode('top', 250, -260), makeNode('bottom', 250, 260)]
    const edges: FlowCardEdge[] = [
      { id: 'horizontal', source: 'left', target: 'right', data: { role: 'control' } },
      { id: 'vertical', source: 'top', target: 'bottom', data: { role: 'control' } },
    ]
    const routed = routeFlowEdges(nodes, edges)
    const crossingEdge = routed[0].data?.routePoints ?? []
    const otherEdge = routed[1].data?.routePoints ?? []

    expect(routed.every((edge) => edge.type === 'flowRouted')).toBe(true)
    let hasCrossing = false
    for (let firstIndex = 1; firstIndex < crossingEdge.length; firstIndex += 1) {
      const firstStart = crossingEdge[firstIndex - 1]
      const firstEnd = crossingEdge[firstIndex]
      for (let secondIndex = 1; secondIndex < otherEdge.length; secondIndex += 1) {
        const secondStart = otherEdge[secondIndex - 1]
        const secondEnd = otherEdge[secondIndex]
        const horizontalStart = firstStart.y === firstEnd.y ? firstStart : secondStart
        const horizontalEnd = firstStart.y === firstEnd.y ? firstEnd : secondEnd
        const verticalStart = firstStart.x === firstEnd.x ? firstStart : secondStart
        const verticalEnd = firstStart.x === firstEnd.x ? firstEnd : secondEnd
        const perpendicular = (firstStart.y === firstEnd.y && secondStart.x === secondEnd.x)
          || (secondStart.y === secondEnd.y && firstStart.x === firstEnd.x)
        if (perpendicular && verticalStart.x > Math.min(horizontalStart.x, horizontalEnd.x) && verticalStart.x < Math.max(horizontalStart.x, horizontalEnd.x)
          && horizontalStart.y > Math.min(verticalStart.y, verticalEnd.y) && horizontalStart.y < Math.max(verticalStart.y, verticalEnd.y)) hasCrossing = true
      }
    }
    expect(hasCrossing).toBe(false)
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

  it('speaks the same pseudo-code in every language', () => {
    const javascript = analyzeCode('const total = 0\nconsole.log(total)\n', 'javascript')
    const python = analyzeCode('total = 0\nprint(total)\n', 'python')
    const go = analyzeCode('package main\n\nimport "fmt"\n\nfunc main() {\n\ttotal := 0\n\tfmt.Println(total)\n}\n', 'go')
    const labels = (graph: ReturnType<typeof analyzeCode>) => graph.nodes.map((node) => node.data.label)

    for (const graph of [javascript, python, go]) {
      expect(graph.error).toBeUndefined()
      expect(labels(graph)).toContain('total ← 0')
      expect(labels(graph)).toContain('imprimir(total)')
    }
  })

  it('connects the branches directly, without intermediate points', () => {
    const graph = analyzeCode('for (let index = 0; index < 3; index += 1) {\n  work(index)\n}\nafter()\n', 'javascript')
    const loop = nodesOfKind(graph, 'loop')[0]
    const after = graph.nodes.find((node) => node.data.label === 'after()')
    const junctions = graph.nodes.filter((node) => node.data.junction)

    expect(graph.error).toBeUndefined()
    // Las convergencias se sustituyen por conexiones directas.
    expect(junctions).toHaveLength(0)
    expect(nodesOfKind(graph, 'connector')).toHaveLength(0)
    expect(graph.edges.some((edge) => edge.source === loop.id && edge.target === after?.id)).toBe(true)
    // La flecha directa conserva el motivo por el que se sale del bucle.
    expect(graph.edges.find((edge) => edge.source === loop.id && edge.target === after?.id)?.label).toBe('falso · salir')
  })

  it('keeps the operands of every node so the flow can be edited', () => {
    const graph = analyzeCode('const total = 0\nif (total > 0) { console.log(total) }\n', 'javascript')
    const assignment = nodesOfKind(graph, 'variable')[0]
    const condition = nodesOfKind(graph, 'condition')[0]

    expect(assignment.data.pseudo?.form).toBe('assign')
    expect(assignment.data.pseudo?.target).toBe('total')
    expect(assignment.data.pseudo?.value).toBe('0')
    expect(condition.data.pseudo?.form).toBe('condition')
    expect(condition.data.pseudo?.value).toBe('total > 0')
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
    const init = nodesOfKind(graph, 'function').find((node) => node.data.label === 'definir __init__()')
    const getter = nodesOfKind(graph, 'function').find((node) => node.data.label === 'definir value_now()')
    const assignment = nodesOfKind(graph, 'variable').find((node) => node.data.label.includes('self.value ← start'))
    const update = nodesOfKind(graph, 'variable').find((node) => node.data.label.includes('self.value ← self.value + 1'))
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
    const loop = nodesOfKind(graph, 'loop')[0]
    const continueNode = nodesOfKind(graph, 'phase').find((node) => node.data.label === 'siguiente iteración')

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
    const continueNode = nodesOfKind(graph, 'phase').find((node) => node.data.label === 'siguiente iteración')
    const breakNode = nodesOfKind(graph, 'phase').find((node) => node.data.label === 'salir del bucle')
    const loopExitEdge = graph.edges.find((edge) => edge.source === loop.id && edge.data?.role === 'false')
    const breakEdge = graph.edges.find((edge) => edge.source === breakNode?.id && edge.data?.role === 'exit')

    expect(graph.error).toBeUndefined()
    expect(graph.edges.some((edge) => edge.source === continueNode?.id && edge.target === loop.id && edge.data?.role === 'repeat')).toBe(true)
    expect(breakEdge?.target).toBe(loopExitEdge?.target)
    // El break va directo al nodo siguiente al bucle, sin punto intermedio.
    expect(nodesOfKind(graph, 'connector')).toHaveLength(0)
    expect(nodesOfKind(graph, 'return').some((node) => node.id === breakEdge?.target)).toBe(true)
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

  it('picks new connector sides when a node moves instead of locking the previous route', () => {
    const makeNode = (id: string, x: number, y: number): FlowCardNode => ({
      id,
      type: 'flowCard',
      position: { x, y },
      data: { label: id, kind: 'statement', line: 1, detail: 'test', active: false, shape: 'process' },
    })
    const routeLength = (edge: FlowCardEdge) => {
      const points = edge.data?.routePoints ?? []
      return points.slice(1).reduce((total, point, index) => total
        + Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y), 0)
    }

    const edge: FlowCardEdge = { id: 'connector', source: 'source', target: 'target', data: { role: 'control' } }
    const source = makeNode('source', 0, 0)
    const below = routeFlowEdges([source, makeNode('target', 0, 320)], [edge])
    expect(below[0].sourceHandle).toBe('source-bottom')
    expect(below[0].targetHandle).toBe('target-top')

    // Re-route using the previously routed edge, exactly like the canvas does while dragging.
    const beside = routeFlowEdges([source, makeNode('target', 480, 0)], below)
    expect(beside[0].sourceHandle).toBe('source-right')
    expect(beside[0].targetHandle).toBe('target-left')
    expect(beside[0].data?.preferredSourceSide).toBeUndefined()
    expect(beside[0].data?.preferredTargetSide).toBeUndefined()
    expect(routeLength(beside[0])).toBeLessThan(340)
  })

  it('keeps routing stable and local when a node is dragged around', () => {
    const graph = analyzeCode('function sumTo(limit) {\n  let total = 0\n  for (let index = 1; index <= limit; index += 1) {\n    total += index\n  }\n  return total\n}', 'javascript')
    const source = graph.nodes.find((node) => node.data.label === 'Inicio · sumTo()')!
    const bodyEdge = graph.edges.find((edge) => edge.source === source.id && edge.data?.role === 'body')!
    const originalLength = bodyEdge.data?.routePoints?.slice(1).reduce((total, point, index) => {
      const previous = bodyEdge.data!.routePoints![index]
      return total + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)
    }, 0) ?? 0

    for (const offset of [{ x: 150, y: 60 }, { x: -120, y: 40 }, { x: 0, y: 90 }]) {
      const moved = graph.nodes.map((node) => node.id === source.id
        ? { ...node, position: { x: node.position.x + offset.x, y: node.position.y + offset.y } }
        : node)
      const rerouted = routeFlowEdges(moved, graph.edges)
      const movedEdge = rerouted.find((edge) => edge.id === bodyEdge.id)!
      const movedLength = movedEdge.data?.routePoints?.slice(1).reduce((total, point, index) => {
        const previous = movedEdge.data!.routePoints![index]
        return total + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)
      }, 0) ?? 0

      expect(movedLength).toBeLessThan(originalLength + 260)
      expect(routeFlowEdges(moved, rerouted).map((edge) => edge.data?.routePoints)).toEqual(rerouted.map((edge) => edge.data?.routePoints))
    }
  })
})
