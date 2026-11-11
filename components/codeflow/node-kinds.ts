import type { FlowCardData, FlowShape, NodeKind, OperationCategory } from '@/lib/codeflow-types'

/** Forma con la que se dibuja un nodo cuando el analizador no la indica. */
export function resolveNodeShape(data: Pick<FlowCardData, 'kind' | 'shape'>): FlowShape {
  if (data.shape) return data.shape
  if (data.kind === 'condition' || data.kind === 'loop') return 'decision'
  if (data.kind === 'start' || data.kind === 'end' || data.kind === 'return') return 'terminator'
  if (data.kind === 'io') return 'input-output'
  if (data.kind === 'connector') return 'connector'
  return 'process'
}

/** Etiqueta corta de cada tipo de nodo. Se usa igual en el diagrama y en el inspector. */
export const NODE_LABELS: Record<NodeKind, string> = {
  function: 'función',
  variable: 'variable',
  object: 'objeto',
  event: 'evento',
  condition: 'condición',
  loop: 'bucle',
  class: 'clase',
  call: 'llamada',
  return: 'retorno',
  import: 'importación',
  statement: 'instrucción',
  operation: 'operación',
  phase: 'fase de flujo',
  start: 'inicio',
  end: 'fin',
  connector: 'conector',
  io: 'entrada / salida',
}

export const OPERATION_LABELS: Record<OperationCategory, string> = {
  read: 'lectura',
  write: 'escritura',
  literal: 'literal',
  arithmetic: 'aritmética',
  comparison: 'comparación',
  logical: 'lógica',
  assignment: 'asignación',
  call: 'llamada',
  access: 'acceso',
  collection: 'colección',
  conditional: 'condicional',
  unary: 'unaria',
  template: 'plantilla',
}

/** Orden de aparición de los tipos de nodo en las listas del inspector. */
export const NODE_KIND_ORDER: NodeKind[] = [
  'start',
  'end',
  'function',
  'class',
  'condition',
  'loop',
  'io',
  'variable',
  'object',
  'call',
  'return',
  'event',
  'operation',
  'phase',
  'import',
  'statement',
  'connector',
]
