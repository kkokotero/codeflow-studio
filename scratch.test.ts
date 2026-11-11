import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyzeCode } from './lib/diagram'
import { starterFiles } from './lib/codeflow-examples'
import { routeFlowEdges, getFlowNodeSize } from './lib/flow-routing'
import type { FlowCardEdge, FlowCardNode } from './lib/codeflow-types'

const length = (e: FlowCardEdge) => {
  const pts = e.data?.routePoints ?? []
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y)
  return Math.round(len)
}
const nodeCrossings = (nodes: FlowCardNode[], e: FlowCardEdge) => {
  const pts = e.data?.routePoints ?? []
  const hits: string[] = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    for (const n of nodes) {
      if (n.id === e.source || n.id === e.target) continue
      const { width, height } = getFlowNodeSize(n)
      const crosses = a.y === b.y
        ? a.y > n.position.y && a.y < n.position.y + height && Math.max(Math.min(a.x, b.x), n.position.x) < Math.min(Math.max(a.x, b.x), n.position.x + width)
        : a.x > n.position.x && a.x < n.position.x + width && Math.max(Math.min(a.y, b.y), n.position.y) < Math.min(Math.max(a.y, b.y), n.position.y + height)
      if (crosses) hits.push(n.id)
    }
  }
  return [...new Set(hits)]
}

it('screenshot', () => {
  const graph = analyzeCode(starterFiles[0].code, 'javascript')
  const moves: Record<string, { x: number; y: number }> = {
    'node-1': { x: 63, y: 0 },
    'node-3': { x: 165, y: -52 },
    'node-5': { x: 105, y: -52 },
    'node-6': { x: 136, y: -57 },
    'node-13': { x: 94, y: 41 },
    'node-14': { x: 19, y: 16 },
  }
  const moved = graph.nodes.map((n) => moves[n.id] ? { ...n, position: { x: n.position.x + moves[n.id].x, y: n.position.y + moves[n.id].y } } : n)
  const rerouted = routeFlowEdges(moved, graph.edges)
  const byId = new Map(moved.map((n) => [n.id, n]))
  const log = rerouted.map((e) => `${e.id} ${e.data?.role} ${byId.get(e.source)?.data.label.slice(0, 16)} -> ${byId.get(e.target)?.data.label.slice(0, 16)} len ${length(e)} hits ${nodeCrossings(moved, e).join(',')} pts ${JSON.stringify(e.data?.routePoints)}`)
  writeFileSync(join(tmpdir(), 'codeflow-routing-scratch.txt'), log.join('\n'))
})
