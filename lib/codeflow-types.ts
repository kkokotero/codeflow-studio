import type { Edge, Node } from '@xyflow/react'
import type { Language } from '@/lib/languages'

export type { Language }
export type NodeKind = 'start' | 'end' | 'connector' | 'io' | 'function' | 'variable' | 'object' | 'event' | 'condition' | 'loop' | 'class' | 'call' | 'return' | 'import' | 'statement' | 'operation' | 'phase'
export type FlowShape = 'terminator' | 'process' | 'decision' | 'input-output' | 'connector'
export type OperationCategory = 'read' | 'write' | 'literal' | 'arithmetic' | 'comparison' | 'logical' | 'assignment' | 'call' | 'access' | 'collection' | 'conditional' | 'unary' | 'template'
export type FlowEdgeRole = 'control' | 'data' | 'true' | 'false' | 'repeat' | 'exit' | 'body' | 'operand' | 'case' | 'exception' | 'merge' | 'unreachable'
export type RunStatus = 'idle' | 'loading' | 'running' | 'paused' | 'complete' | 'stopped' | 'error'

export interface CodeFile {
  id: string
  name: string
  language: Language
  code: string
  /** Carpeta contenedora (null = carpeta raíz del proyecto). */
  folderId?: string | null
  /** Marca de tiempo de la última modificación del código. */
  updatedAt?: number
  /** Plantilla de origen (ejemplo incluido) para poder restaurar el contenido. */
  templateId?: string
}

/**
 * Formas de instrucción del pseudo-código común a todos los lenguajes.
 *
 * Cada nodo del diagrama guarda su forma y sus operandos: con eso el
 * inspector puede editarlos como un formulario y reconstruir la instrucción
 * en el lenguaje del archivo.
 */
export type PseudoForm =
  | 'assign'
  | 'call'
  | 'print'
  | 'read'
  | 'return'
  | 'throw'
  | 'import'
  | 'define'
  | 'class'
  | 'condition'
  | 'loop'
  | 'break'
  | 'continue'
  | 'statement'

export interface PseudoInstruction {
  form: PseudoForm
  /** Expresión principal: el valor, la condición o los argumentos. */
  value?: string
  /** Destino de una asignación o de una lectura. */
  target?: string
  /** Tipo declarado del destino, cuando el lenguaje lo escribe delante. */
  type?: string
  /** Nombre de la función, del módulo o del tipo. */
  name?: string
  /** Operador original de una asignación compuesta. */
  operator?: string
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
  /** La instrucción con el vocabulario común, para editar el flujo. */
  pseudo?: PseudoInstruction
  /**
   * Punto de convergencia: solo une flechas, no es un paso del programa.
   * Se dibuja como un punto y no aparece con etiqueta.
   */
  junction?: boolean
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
  output: ExecutionOutput[]
}
