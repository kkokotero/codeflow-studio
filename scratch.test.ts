import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { analyzeCode } from './lib/diagram'
import { starterFiles } from './lib/codeflow-examples'
import { routeFlowEdges, debugInfo } from './lib/flow-routing.debug'

it('diagnose3', () => {
  const graph = analyzeCode(starterFiles[0].code, 'javascript')
  const seed = 12
  const seedX = Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1
  const seedY = Math.abs(Math.sin(seed * 78.233) * 12345.6789) % 1
  const targetId = [3, 5, 7, 10, 11].map((i) => graph.nodes[i]?.id).filter(Boolean)[seed % 5]
  const moved = graph.nodes.map((n) => n.id === targetId
    ? { ...n, position: { x: n.position.x + (seedX - 0.5) * 600, y: n.position.y + (seedY - 0.5) * 500 } }
    : n)
  debugInfo.length = 0
  routeFlowEdges(moved, graph.edges)
  writeFileSync('/tmp/opencode/diagnose3.txt', debugInfo.join('\n'))
})
