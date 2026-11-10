import type { Edge, Node } from '@xyflow/react'
import type { Language } from '@/lib/languages'

export type { Language }
export type NodeKind = 'start' | 'end' | 'connector' | 'io' | 'function' | 'variable' | 'object' | 'event' | 'condition' | 'loop' | 'class' | 'call' | 'return' | 'import' | 'statement' | 'operation' | 'phase'
export type FlowShape = 'terminator' | 'process' | 'decision' | 'input-output' | 'connector'
export type OperationCategory = 'read' | 'write' | 'literal' | 'arithmetic' | 'comparison' | 'logical' | 'assignment' | 'call' | 'access' | 'collection' | 'conditional' | 'unary' | 'template'
export type FlowEdgeRole = 'control' | 'data' | 'true' | 'false' | 'repeat' | 'exit' | 'body' | 'operand' | 'case' | 'exception' | 'merge' | 'unreachable'
export type RunStatus = 'idle' | 'loading' | 'running' | 'paused' | 'complete' | 'stopped' | 'error'
export type SafeValue = null | boolean | number | string | SafeValue[] | { [key: string]: SafeValue }

export interface CodeFile {
  id: string
  name: string
  language: Language
  code: string
  /** Carpeta contenedora (null = carpeta raíz del proyecto). */
  folderId?: string | null
  /** Marca de tiempo de la última modificación del código. */
  updatedAt?: number
}

export interface TraceEntry {
  id: number
  line: number
  locals: Record<string, SafeValue>
  stack: string[]
  returnValue?: SafeValue
  operationId?: string
  operationValue?: SafeValue
  output?: string
}

export interface FlowCardData extends Record<string, unknown> {
  label: string
  kind: NodeKind
  line: number
  detail: string
  active: boolean
  shape?: FlowShape
  source?: string
  lineEnd?: number
  expression?: string
  operationId?: string
  operationCategory?: OperationCategory
  phase?: 'initialization' | 'condition' | 'body' | 'update' | 'exit' | 'merge' | 'branch'
}

export type FlowCardNode = Node<FlowCardData, 'flowCard'>
export type FlowCardEdge = Edge<{
  role?: FlowEdgeRole
  routeX?: number
  routePoints?: Array<{ x: number; y: number }>
  // Optional side pins. Auto-routing never writes these, so they only capture deliberate caller intent.
  preferredSourceSide?: 'top' | 'right' | 'bottom' | 'left'
  preferredTargetSide?: 'top' | 'right' | 'bottom' | 'left'
}>

export interface DiagramGraph {
  nodes: FlowCardNode[]
  edges: FlowCardEdge[]
  error?: string
}

export interface ExecutionOutput {
  stream: 'stdout' | 'stderr'
  text: string
}

export interface SandboxExecutionResult {
  output: ExecutionOutput[]
  exitCode: number
  durationMs: number
  timedOut: boolean
  outputTruncated: boolean
}

export interface RunSnapshot {
  id: string
  fileId: string
  fileName: string
  language: Language
  code: string
  createdAt: number
  steps: TraceEntry[]
  output: ExecutionOutput[]
}

export interface RuntimeMessage {
  type: 'ready' | 'step' | 'operation' | 'console' | 'done' | 'error'
  line?: number
  locals?: Record<string, SafeValue>
  stack?: string[]
  value?: string
  returnValue?: SafeValue
  operationId?: string
  operationValue?: SafeValue
  error?: string
}
