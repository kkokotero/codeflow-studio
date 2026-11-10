import dagre from '@dagrejs/dagre'
import type { DiagramGraph, FlowCardData, FlowCardEdge, FlowCardNode, FlowEdgeRole, FlowShape, NodeKind } from '@/lib/codeflow-types'

export const MAX_SOURCE_CHARACTERS = 50_000
export const MAX_DIAGRAM_NODES = 180
export const MAX_DIAGRAM_DEPTH = 24

export interface FlowFragment {
  entryId: string | null
  exitIds: string[]
  breakIds: string[]
  continueIds: string[]
  returnIds: string[]
  throwIds: string[]
}

export interface FlowNodeInput {
  label: string
  kind: NodeKind
  line: number
  detail: string
  shape?: FlowShape
  source?: string
  lineEnd?: number
  phase?: FlowCardData['phase']
  [key: string]: unknown
}

const edgeColors: Record<FlowEdgeRole, string> = {
  control: '#64736b',
  data: '#72b8ca',
  true: '#75c797',
  false: '#e39a88',
  repeat: '#b49be8',
  exit: '#d7b773',
  body: '#88958d',
  operand: '#72b8ca',
  case: '#dfbd73',
  exception: '#e1847f',
  merge: '#82918a',
  unreachable: '#718079',
}

export function emptyFlowFragment(): FlowFragment {
  return { entryId: null, exitIds: [], breakIds: [], continueIds: [], returnIds: [], throwIds: [] }
}

export function compactSource(value: string, length = 42): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > length ? `${normalized.slice(0, length - 1)}…` : normalized
}

export function lineAt(source: string, offset: number): number {
  let line = 1
  for (let index = 0; index < Math.min(offset, source.length); index += 1) {
    if (source.charCodeAt(index) === 10) line += 1
  }
  return line
}

function defaultShape(kind: NodeKind): FlowShape {
  if (kind === 'start' || kind === 'end' || kind === 'return') return 'terminator'
  if (kind === 'condition' || kind === 'loop') return 'decision'
  if (kind === 'io') return 'input-output'
  if (kind === 'connector') return 'connector'
  return 'process'
}

export class DiagramComplexityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiagramComplexityError'
  }
}

export class FlowGraphBuilder {
  readonly nodes: FlowCardNode[] = []
  readonly edges: FlowCardEdge[] = []
  private nextNodeId = 0
  private nextEdgeId = 0
  private nextConnectorId = 0
  private readonly branchCountsBySource = new Map<string, number>()

  addNode(input: FlowNodeInput, depth = 0): string {
    if (depth > MAX_DIAGRAM_DEPTH) {
      throw new DiagramComplexityError(`El diagrama supera el nivel de anidación ${MAX_DIAGRAM_DEPTH}; reduce la profundidad del código.`)
    }
    if (this.nodes.length >= MAX_DIAGRAM_NODES) {
      throw new DiagramComplexityError(`El diagrama supera el límite de ${MAX_DIAGRAM_NODES} elementos. No se generó una vista parcial para evitar ocultar lógica.`)
    }

    const id = `node-${this.nextNodeId++}`
    const data: FlowCardData = { ...input, shape: input.shape ?? defaultShape(input.kind), active: false }
    this.nodes.push({ id, type: 'flowCard', position: { x: 0, y: 0 }, data })
    return id
  }

  addConnector(line: number, depth: number, detail = 'Convergencia de flujo'): string {
    const index = this.nextConnectorId++
    const label = index < 26 ? String.fromCharCode(65 + index) : `C${index + 1}`
    return this.addNode({ kind: 'connector', label, line, detail, shape: 'connector' }, depth)
  }

  addEdge(source: string | null | undefined, target: string | null | undefined, label: string, role: FlowEdgeRole = 'control'): void {
    if (!source || !target || source === target) return

    const sourceNode = this.nodes.find((node) => node.id === source)
    let sourceHandle: string | undefined
    if (sourceNode?.data.kind === 'condition') {
      if (role === 'true') sourceHandle = 'source-left'
      if (role === 'false') sourceHandle = 'source-right'
      if (role === 'case') {
        const branchIndex = this.branchCountsBySource.get(source) ?? 0
        sourceHandle = branchIndex % 2 === 0 ? 'source-left' : 'source-right'
        this.branchCountsBySource.set(source, branchIndex + 1)
      }
    } else if (sourceNode?.data.kind === 'loop' && role === 'false') {
      sourceHandle = 'source-right'
    }

    this.edges.push({
      id: `edge-${this.nextEdgeId++}`,
      source,
      target,
      ...(sourceHandle ? { sourceHandle } : {}),
      type: role === 'repeat' ? 'flowLoop' : 'smoothstep',
      data: { role },
      style: {
        stroke: edgeColors[role],
        strokeWidth: role === 'data' || role === 'operand' ? 1.5 : 1.7,
        ...(role === 'repeat' || role === 'unreachable' ? { strokeDasharray: role === 'repeat' ? '5 4' : '2 4' } : {}),
      },
      markerEnd: { type: 'arrowclosed', color: edgeColors[role] },
      label,
      labelStyle: { fill: edgeColors[role], fontSize: 10 },
      labelBgStyle: { fill: '#121a18', fillOpacity: 0.96, stroke: 'none' },
      labelBgPadding: [4, 3],
      labelBgBorderRadius: 3,
    })
  }

  toGraph(): DiagramGraph {
    if (!this.nodes.length) return { nodes: [], edges: [] }

    const layout = new dagre.graphlib.Graph({ multigraph: true })
    layout.setGraph({
      rankdir: 'TB',
      ranker: 'network-simplex',
      acyclicer: 'greedy',
      nodesep: 42,
      ranksep: 58,
      edgesep: 18,
      marginx: 42,
      marginy: 42,
    })
    layout.setDefaultEdgeLabel(() => ({}))

    const dimensions = new Map<string, { width: number; height: number }>()
    for (const node of this.nodes) {
      const shape = node.data.shape
      const width = shape === 'connector' ? 62 : shape === 'terminator' ? 190 : shape === 'decision' || shape === 'input-output' ? 220 : 196
      const height = shape === 'connector' ? 62 : shape === 'decision' ? 140 : shape === 'terminator' ? 86 : shape === 'input-output' ? 92 : node.data.expression ? 110 : 98
      dimensions.set(node.id, { width, height })
      layout.setNode(node.id, { width, height })
    }

    const edgeWeight: Record<FlowEdgeRole, number> = {
      control: 7,
      body: 5,
      true: 4,
      false: 4,
      exit: 3,
      merge: 3,
      case: 2,
      exception: 2,
      repeat: 0.5,
      data: 1,
      operand: 1,
      unreachable: 0.5,
    }

    for (const edge of this.edges) {
      const role = edge.data?.role ?? 'control'
      layout.setEdge(edge.source, edge.target, { weight: edgeWeight[role] }, edge.id)
    }

    dagre.layout(layout)

    const laidOutNodes = this.nodes.map((node) => {
      const size = dimensions.get(node.id)!
      const position = layout.node(node.id)
      return {
        ...node,
        position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
      }
    })

    const minX = Math.min(...laidOutNodes.map((node) => node.position.x))
    const maxX = Math.max(...laidOutNodes.map((node) => node.position.x + dimensions.get(node.id)!.width))
    const loops = this.nodes.filter((node) => node.data.kind === 'loop')
    const sideByLoop = new Map(loops.map((node, index) => [node.id, index % 2 === 0 ? 'left' : 'right'] as const))
    const laneCountBySide = new Map<'left' | 'right', number>([['left', 0], ['right', 0]])
    const laidOutEdges = this.edges.map((edge) => {
      if (edge.data?.role !== 'repeat') return edge
      const side = sideByLoop.get(edge.target) ?? 'left'
      const lane = laneCountBySide.get(side) ?? 0
      laneCountBySide.set(side, lane + 1)
      const routeX = side === 'left' ? minX - 24 - lane * 16 : maxX + 24 + lane * 16
      return {
        ...edge,
        sourceHandle: side === 'left' ? 'source-left' : 'source-right',
        targetHandle: side === 'left' ? 'target-left' : 'target-right',
        data: { ...edge.data, routeX },
      }
    })

    return { nodes: laidOutNodes, edges: laidOutEdges }
  }
}
