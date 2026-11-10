'use client'

import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'
import type { FlowCardEdge } from '@/lib/codeflow-types'

export function FlowLoopEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style, label, data }: EdgeProps<FlowCardEdge>) {
  const routeX = data?.routeX ?? Math.min(sourceX, targetX) - 32
  const middleY = (sourceY + targetY) / 2
  const path = `M ${sourceX} ${sourceY} H ${routeX} V ${targetY} H ${targetX}`
  const color = typeof style?.stroke === 'string' ? style.stroke : '#b49be8'

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="flow-loop-edge-label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${routeX}px, ${middleY}px)`,
              color,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
