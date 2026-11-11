'use client'

import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'
import type { FlowCardEdge } from '@/lib/codeflow-types'

export function FlowRoutedEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style, label, labelStyle, labelBgStyle, data }: EdgeProps<FlowCardEdge>) {
  const points = data?.routePoints?.length ? data.routePoints : [
    { x: sourceX, y: sourceY },
    { x: sourceX, y: targetY },
    { x: targetX, y: targetY },
  ]
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const labelSegment = points.slice(1).reduce((longest, point, index) => {
    const previous = points[index]
    const length = Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)
    return length > longest.length ? { start: previous, end: point, length } : longest
  }, { start: points[0], end: points[0], length: 0 })
  const labelX = (labelSegment.start.x + labelSegment.end.x) / 2
  const labelY = (labelSegment.start.y + labelSegment.end.y) / 2
  const color = typeof style?.stroke === 'string' ? style.stroke : 'var(--cf-text-subtle)'
  const labelColor = typeof labelStyle?.fill === 'string' ? labelStyle.fill : color

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={18} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="flow-loop-edge-label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              color: labelColor,
              background: typeof labelBgStyle?.fill === 'string' ? labelBgStyle.fill : 'var(--cf-surface-raised)',
              pointerEvents: 'none',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}