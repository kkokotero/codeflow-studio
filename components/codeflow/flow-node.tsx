'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

import { NODE_ICONS } from '@/components/codeflow/app-icons'
import { NODE_LABELS, OPERATION_LABELS } from '@/components/codeflow/node-kinds'
import type { FlowCardNode } from '@/lib/codeflow-types'

/**
 * Puntos de anclaje de un nodo.
 *
 * React Flow usa estos puntos para saber dónde empieza y termina cada flecha.
 * Un nodo de convergencia también los necesita: sin ellos, las flechas que
 * entran y salen de la convergencia se quedan sin sitio al que sujetarse.
 */
function FlowHandles() {
  return (
    <>
      <Handle type="target" position={Position.Top} id="target-top" className="flow-handle flow-handle--route" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" className="flow-handle flow-handle--route" />
      <Handle type="target" position={Position.Left} id="target-left" className="flow-handle flow-handle--route" />
      <Handle type="target" position={Position.Right} id="target-right" className="flow-handle flow-handle--route" />
      <Handle type="source" position={Position.Top} id="source-top" className="flow-handle flow-handle--route" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" className="flow-handle flow-handle--route" />
      <Handle type="source" position={Position.Left} id="source-left" className="flow-handle flow-handle--route" />
      <Handle type="source" position={Position.Right} id="source-right" className="flow-handle flow-handle--route" />
    </>
  )
}

export const FlowNode = memo(function FlowNode({ data, selected }: NodeProps<FlowCardNode>) {
  const Icon = NODE_ICONS[data.kind]
  const typeLabel = data.kind === 'operation' && data.operationCategory ? OPERATION_LABELS[data.operationCategory] : NODE_LABELS[data.kind]
  const shape = data.shape ?? (data.kind === 'condition' || data.kind === 'loop' ? 'decision' : data.kind === 'start' || data.kind === 'end' || data.kind === 'return' ? 'terminator' : data.kind === 'io' ? 'input-output' : data.kind === 'connector' ? 'connector' : 'process')
  const lineLabel = data.lineEnd && data.lineEnd > data.line ? `L${data.line}–${data.lineEnd}` : `L${data.line}`

  // Un punto de convergencia solo une flechas: se dibuja como un punto.
  if (data.junction) {
    return (
      <div className="flow-node flow-node--junction" title={data.detail} role="group" aria-label={`Convergencia de flujo, línea ${data.line}`}>
        <div className="flow-node__shape" aria-hidden="true" />
        <FlowHandles />
      </div>
    )
  }

  return (
    <div className={`flow-node flow-node--${data.kind} flow-node--shape-${shape} ${data.active ? 'is-active' : ''} ${selected ? 'is-selected' : ''}`} title={data.source ?? data.expression ?? data.label} role="group" aria-label={`${typeLabel}: ${data.label}. ${lineLabel}. ${data.detail}`}>
      <div className="flow-node__shape" aria-hidden="true" />
      <FlowHandles />
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
