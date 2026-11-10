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
  private readonly rowsByDepth = new Map<number, number>()
  private nextNodeId = 0
  private nextEdgeId = 0
  private nextConnectorId = 0

  addNode(input: FlowNodeInput, depth = 0): string {
    if (depth > MAX_DIAGRAM_DEPTH) {
      throw new DiagramComplexityError(`El diagrama supera el nivel de anidación ${MAX_DIAGRAM_DEPTH}; reduce la profundidad del código.`)
    }
    if (this.nodes.length >= MAX_DIAGRAM_NODES) {
      throw new DiagramComplexityError(`El diagrama supera el límite de ${MAX_DIAGRAM_NODES} elementos. No se generó una vista parcial para evitar ocultar lógica.`)
    }

    const row = this.rowsByDepth.get(depth) ?? 0
    this.rowsByDepth.set(depth, row + 1)
    const id = `node-${this.nextNodeId++}`
    const data: FlowCardData = { ...input, shape: input.shape ?? defaultShape(input.kind), active: false }
    this.nodes.push({
      id,
      type: 'flowCard',
      position: { x: 72 + depth * 232, y: 58 + row * 112 },
      data,
    })
    return id
  }

  addConnector(line: number, depth: number, detail = 'Convergencia de flujo'): string {
    const index = this.nextConnectorId++
    const label = index < 26 ? String.fromCharCode(65 + index) : `C${index + 1}`
    return this.addNode({ kind: 'connector', label, line, detail, shape: 'connector' }, depth)
  }

  addEdge(source: string | null | undefined, target: string | null | undefined, label: string, role: FlowEdgeRole = 'control'): void {
    if (!source || !target || source === target) return
    this.edges.push({
      id: `edge-${this.nextEdgeId++}`,
      source,
      target,
      label,
      type: 'smoothstep',
      data: { role },
      style: {
        stroke: edgeColors[role],
        strokeWidth: role === 'data' || role === 'operand' ? 1.5 : 1.7,
        ...(role === 'repeat' || role === 'unreachable' ? { strokeDasharray: role === 'repeat' ? '5 4' : '2 4' } : {}),
      },
      labelStyle: { fill: edgeColors[role], fontSize: 10 },
    })
  }

  toGraph(): DiagramGraph {
    return { nodes: this.nodes, edges: this.edges }
  }
}
