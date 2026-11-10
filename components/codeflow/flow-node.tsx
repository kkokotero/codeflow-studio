'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ArrowLeftRight, Braces, Circle, GitBranch, Layers3, Play, Repeat2, Variable, CornerDownRight, Box, Activity } from 'lucide-react'
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
  start: Play,
  end: Circle,
  connector: Circle,
  io: ArrowLeftRight,
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
  start: 'inicio',
  end: 'fin',
  connector: 'conector',
  io: 'entrada / salida',
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
  const shape = data.shape ?? (data.kind === 'condition' || data.kind === 'loop' ? 'decision' : data.kind === 'start' || data.kind === 'end' || data.kind === 'return' ? 'terminator' : data.kind === 'io' ? 'input-output' : data.kind === 'connector' ? 'connector' : 'process')
  const lineLabel = data.lineEnd && data.lineEnd > data.line ? `L${data.line}–${data.lineEnd}` : `L${data.line}`
  return (
    <div className={`flow-node flow-node--${data.kind} flow-node--shape-${shape} ${data.active ? 'is-active' : ''} ${selected ? 'is-selected' : ''}`} title={data.source ?? data.expression ?? data.label} role="group" aria-label={`${typeLabel}: ${data.label}. ${lineLabel}. ${data.detail}`}>
      <div className="flow-node__shape" aria-hidden="true" />
      <Handle type="target" position={Position.Top} id="target-top" className="flow-handle flow-handle--route" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" className="flow-handle flow-handle--route" />
      <Handle type="target" position={Position.Left} id="target-left" className="flow-handle flow-handle--route" />
      <Handle type="target" position={Position.Right} id="target-right" className="flow-handle flow-handle--route" />
      <Handle type="source" position={Position.Top} id="source-top" className="flow-handle flow-handle--route" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" className="flow-handle flow-handle--route" />
      <Handle type="source" position={Position.Left} id="source-left" className="flow-handle flow-handle--route" />
      <Handle type="source" position={Position.Right} id="source-right" className="flow-handle flow-handle--route" />
      <div className="flow-node__content">
        <div className="flow-node__meta">
          <span className="flow-node__type"><Icon aria-hidden="true" /> {typeLabel}</span>
          <span className="flow-node__line">{lineLabel}</span>
        </div>
        <div className="flow-node__label">{data.label}</div>
        <div className="flow-node__detail">{data.detail}</div>
        {data.expression && <div className="flow-node__expression">{data.expression}</div>}
      </div>
    </div>
  )
})
