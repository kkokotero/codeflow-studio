import type { Edge, Node } from '@xyflow/react'

export type Language = 'javascript' | 'python'
export type NodeKind = 'function' | 'variable' | 'object' | 'event' | 'condition' | 'loop' | 'class' | 'call' | 'return' | 'import' | 'statement' | 'operation' | 'phase'
export type OperationCategory = 'read' | 'write' | 'literal' | 'arithmetic' | 'comparison' | 'logical' | 'assignment' | 'call' | 'access' | 'collection' | 'conditional' | 'unary' | 'template'
export type FlowEdgeRole = 'control' | 'data' | 'true' | 'false' | 'repeat' | 'exit' | 'body' | 'operand' | 'case' | 'exception' | 'merge'
export type RunStatus = 'idle' | 'loading' | 'running' | 'paused' | 'complete' | 'stopped' | 'error'
export type SafeValue = null | boolean | number | string | SafeValue[] | { [key: string]: SafeValue }

export interface CodeFile {
  id: string
  name: string
  language: Language
  code: string
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
  expression?: string
  operationId?: string
  operationCategory?: OperationCategory
  phase?: 'initialization' | 'condition' | 'body' | 'update' | 'exit' | 'merge' | 'branch'
}

export type FlowCardNode = Node<FlowCardData, 'flowCard'>
export type FlowCardEdge = Edge<{ role?: FlowEdgeRole }>

export interface DiagramGraph {
  nodes: FlowCardNode[]
  edges: FlowCardEdge[]
  error?: string
}

export interface RunSnapshot {
  id: string
  fileId: string
  fileName: string
  language: Language
  code: string
  createdAt: number
  steps: TraceEntry[]
  output: string[]
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
