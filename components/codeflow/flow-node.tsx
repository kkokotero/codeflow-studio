'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Braces, GitBranch, Layers3, Play, Repeat2, Variable, CornerDownRight, Box, Activity } from 'lucide-react'
import type { FlowCardNode } from '@/lib/codeflow-types'

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
} as const

export const FlowNode = memo(function FlowNode({ data, selected }: NodeProps<FlowCardNode>) {
  const Icon = iconByKind[data.kind]
  return (
    <div className={`flow-node flow-node--${data.kind} ${data.active ? 'is-active' : ''} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} className="flow-handle" />
      <div className="flow-node__meta">
        <span className="flow-node__type"><Icon aria-hidden="true" /> {data.kind}</span>
        <span className="flow-node__line">L{data.line}</span>
      </div>
      <div className="flow-node__label" title={data.label}>{data.label}</div>
      <div className="flow-node__detail">{data.detail.split(' · ')[0]}</div>
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
    </div>
  )
})
