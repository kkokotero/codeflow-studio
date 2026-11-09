'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Braces, GitBranch, Layers3, Play, Repeat2, Variable, CornerDownRight, Box, Activity } from 'lucide-react'
import type { FlowCardNode, NodeKind, OperationCategory } from '@/lib/codeflow-types'

const iconByKind = {
  function: Braces,
  variable: Variable,
  object: Box,
  event: Activity,
  condition: GitBranch,
  loop: Repeat2,
  class: Layers3,
  call: Play,
  return: CornerDownRight,
  import: Box,
  statement: Box,
  operation: Braces,
  phase: GitBranch,
} as const

const kindLabels: Record<NodeKind, string> = {
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
}

const operationLabels: Record<OperationCategory, string> = {
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

export const FlowNode = memo(function FlowNode({ data, selected }: NodeProps<FlowCardNode>) {
  const Icon = iconByKind[data.kind]
  const typeLabel = data.kind === 'operation' && data.operationCategory ? operationLabels[data.operationCategory] : kindLabels[data.kind]
  return (
    <div className={`flow-node flow-node--${data.kind} ${data.active ? 'is-active' : ''} ${selected ? 'is-selected' : ''}`} title={data.expression ?? data.label}>
      <Handle type="target" position={Position.Top} className="flow-handle" />
      <div className="flow-node__meta">
        <span className="flow-node__type"><Icon aria-hidden="true" /> {typeLabel}</span>
        <span className="flow-node__line">L{data.line}</span>
      </div>
      <div className="flow-node__label">{data.label}</div>
      <div className="flow-node__detail">{data.detail}</div>
      {data.expression && <div className="flow-node__expression">{data.expression}</div>}
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
    </div>
  )
})
