import dagre from '@dagrejs/dagre'
import type { DiagramGraph, FlowCardData, FlowCardEdge, FlowCardNode, FlowEdgeRole, FlowShape, NodeKind } from '@/lib/codeflow-types'
import { routeFlowEdges } from '@/lib/flow-routing'

/** Tamaño de los puntos de convergencia: apenas un punto en el diagrama. */
export const JUNCTION_SIZE = 18

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

/**
 * Color de cada tipo de flecha. Usa variables CSS para que las flechas sigan
 * a la paleta activa en lugar de fijar tonos que se contradicen con el tema.
 */
const edgeColors: Record<FlowEdgeRole, string> = {
  control: 'var(--cf-text-muted)',
  data: 'var(--node-variable)',
  true: 'var(--cf-accent)',
  false: 'var(--cf-danger)',
  repeat: 'var(--node-loop)',
  exit: 'var(--node-phase)',
  body: 'var(--cf-text-subtle)',
  operand: 'var(--node-operation)',
  case: 'var(--node-phase)',
  exception: 'var(--cf-danger)',
  merge: 'var(--cf-text-subtle)',
  unreachable: 'var(--cf-line-strong)',
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

/** Rótulos genéricos deunion: no aportan información al unir flechas. */
const MERGE_LABELS = new Set(['siguiente', 'unir', 'continuar'])

/**
 * Elige el rótulo de la flecha directa que sustituye a una convergencia.
 *
 * Gana el rótulo de la flecha que entraba (dice por qué se llega ahí); si es
 * genérico, se usa el de salida.
 */
function mergeLabels(incoming: unknown, outgoing: unknown): string {
  const inc = typeof incoming === 'string' ? incoming : ''
  const out = typeof outgoing === 'string' ? outgoing : ''
  if (inc && !MERGE_LABELS.has(inc)) return inc
  if (out && !MERGE_LABELS.has(out)) return out
  return inc || out
}

export class FlowGraphBuilder {
  nodes: FlowCardNode[] = []
  edges: FlowCardEdge[] = []
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

    const id = `node-${this.nextNodeId++}`
    const data: FlowCardData = { ...input, shape: input.shape ?? defaultShape(input.kind), active: false }
    this.nodes.push({ id, type: 'flowCard', position: { x: 0, y: 0 }, data })
    return id
  }

  /**
   * Punto de convergencia del flujo.
   *
   * Solo une flechas: no es un paso del programa, así que antes de dibujar el
   * diagrama se sustituye por conexiones directas entre origen y destino.
   */
  addConnector(line: number, depth: number, detail = 'Convergencia de flujo'): string {
    const index = this.nextConnectorId++
    const label = index < 26 ? String.fromCharCode(65 + index) : `C${index + 1}`
    return this.addNode({ kind: 'connector', label, line, detail, shape: 'connector', junction: true }, depth)
  }

  /**
   * Sustituye las convergencias por conexiones directas.
   *
   * Un punto de convergencia solo existe para poder unir flechas: al quitarlo,
   * cada flecha que entraba en él pasa a ir directamente a su destino, sin
   * intermediarios ni cajas vacías en el diagrama.
   */
  private inlineJunctions(): void {
    for (let guard = 0; guard < 64; guard += 1) {
      const junction = this.nodes.find((node) => node.data.junction)
      if (!junction) break
      const incoming = this.edges.filter((edge) => edge.target === junction.id)
      const outgoing = this.edges.filter((edge) => edge.source === junction.id)
      const rest = this.edges.filter((edge) => edge.source !== junction.id && edge.target !== junction.id)
      if (!incoming.length || !outgoing.length) {
        this.edges = rest
        this.nodes = this.nodes.filter((node) => node.id !== junction.id)
        continue
      }
      const merged: FlowCardEdge[] = []
      for (const out of outgoing) {
        for (const inc of incoming) {
          merged.push({
            ...out,
            id: `edge-${this.nextEdgeId++}`,
            source: inc.source,
            target: out.target,
            label: mergeLabels(inc.label, out.label),
            style: inc.style ?? out.style,
            markerEnd: inc.markerEnd ?? out.markerEnd,
            labelStyle: inc.labelStyle ?? out.labelStyle,
            labelBgStyle: inc.labelBgStyle ?? out.labelBgStyle,
            data: { ...out.data, ...inc.data, role: inc.data?.role ?? out.data?.role },
          })
        }
      }
      this.edges = [...rest, ...merged]
      this.nodes = this.nodes.filter((node) => node.id !== junction.id)
    }
  }

  addEdge(source: string | null | undefined, target: string | null | undefined, label: string, role: FlowEdgeRole = 'control'): void {
    if (!source || !target || source === target) return

    this.edges.push({
      id: `edge-${this.nextEdgeId++}`,
      source,
      target,
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
      labelBgStyle: { fill: 'var(--cf-surface-raised)', fillOpacity: 0.96, stroke: 'none' },
      labelBgPadding: [4, 3],
      labelBgBorderRadius: 3,
    })
  }

  toGraph(): DiagramGraph {
    if (!this.nodes.length) return { nodes: [], edges: [] }

    // Las convergencias desaparecen antes de calcular la distribución.
    this.inlineJunctions()

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
      const width = node.data.junction ? JUNCTION_SIZE : shape === 'connector' ? 62 : shape === 'terminator' ? 190 : shape === 'decision' || shape === 'input-output' ? 220 : 196
      const height = node.data.junction ? JUNCTION_SIZE : shape === 'connector' ? 62 : shape === 'decision' ? 140 : shape === 'terminator' ? 86 : shape === 'input-output' ? 92 : node.data.expression ? 110 : 98
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

    return { nodes: laidOutNodes, edges: routeFlowEdges(laidOutNodes, this.edges) }
  }
}
