'use client'

import { memo, useCallback, useEffect, useMemo } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { FlowNode } from '@/components/codeflow/flow-node'
import type { DiagramGraph, FlowCardData, FlowCardEdge } from '@/lib/codeflow-types'

const nodeTypes = { flowCard: FlowNode }

function AutoFit({ nodeKey }: { nodeKey: string }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => fitView({ padding: 0.22, maxZoom: 1.1 }))
    return () => window.cancelAnimationFrame(frame)
  }, [fitView, nodeKey])
  return null
}

interface FlowCanvasProps {
  graph: DiagramGraph
  activeLine: number | null
  activeOperationId: string | null
  onSelectNode: (nodeId: string) => void
  manualEdges: FlowCardEdge[]
  onManualEdgesChange: (edges: FlowCardEdge[]) => void
  onConnectNodes: (edgeCount: number) => void
}

export const FlowCanvas = memo(function FlowCanvas({ graph, manualEdges, activeLine, activeOperationId, onSelectNode, onManualEdgesChange, onConnectNodes }: FlowCanvasProps) {
  const activeNodes = useMemo(() => graph.nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      active: node.data.kind === 'operation' && activeOperationId
        ? node.data.operationId === activeOperationId
        : node.data.line === activeLine,
    },
  })), [activeLine, activeOperationId, graph.nodes])
  const [nodes, setNodes, onNodesChange] = useNodesState(activeNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState([...graph.edges, ...manualEdges])

  useEffect(() => {
    setNodes((current) => activeNodes.map((next) => {
      const existing = current.find((node) => node.id === next.id)
      return existing ? { ...next, position: existing.position, selected: existing.selected } : next
    }))
  }, [activeNodes, setNodes])

  useEffect(() => {
    const validNodeIds = new Set(graph.nodes.map((node) => node.id))
    setEdges((current) => {
      const existingManual = current.filter((edge) => edge.id.startsWith('edge-user-') && validNodeIds.has(edge.source) && validNodeIds.has(edge.target))
      const manual = manualEdges.length ? manualEdges.filter((edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target)) : existingManual
      const next = [...graph.edges, ...manual]
      const currentIds = current.map((edge) => edge.id)
      const nextIds = next.map((edge) => edge.id)
      return currentIds.length === nextIds.length && currentIds.every((id, index) => id === nextIds[index]) ? current : next
    })
  }, [graph.edges, graph.nodes, manualEdges, setEdges])

  useEffect(() => {
    onManualEdgesChange(edges.filter((edge) => edge.id.startsWith('edge-user-')))
  }, [edges, onManualEdgesChange])

  const connect = useCallback((connection: Connection) => {
    setEdges((current) => {
      if (!connection.source || !connection.target) return current
      const isDuplicate = current.some((edge) => edge.source === connection.source && edge.target === connection.target)
      if (isDuplicate) return current
      const next: FlowCardEdge[] = [...current, {
        id: `edge-user-${Date.now()}-${current.length}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        animated: false,
        style: { stroke: '#7a8b82' },
        data: { role: 'control' },
      }]
      onConnectNodes(next.filter((edge) => edge.id.startsWith('edge-user-')).length)
      return next
    })
  }, [onConnectNodes, setEdges])

  return (
    <div className="flow-canvas" role="region" aria-label="Diagrama de flujo interactivo">
      {graph.error ? (
        <div className="diagram-error"><span className="error-dot" /> {graph.error}</div>
      ) : graph.nodes.length === 0 ? (
        <div className="canvas-empty">
          <div className="canvas-empty__glyph">{'{ }'}</div>
          <strong>El diagrama aparecerá aquí</strong>
          <span>Escribe una función, variable o condición para comenzar.</span>
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={connect}
          onNodeClick={(_, node) => onSelectNode(node.id)}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          minZoom={0.25}
          maxZoom={1.6}
          nodesConnectable
          nodesDraggable
        >
          <AutoFit nodeKey={graph.nodes.map((node) => node.id).join(',')} />
          <Background color="#26302d" gap={20} size={1} />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap position="top-right" style={{ width: 118, height: 82 }} nodeColor={(node) => `var(--node-${(node.data as FlowCardData).kind}, #72807b)`} maskColor="rgba(7, 10, 13, 0.72)" />
        </ReactFlow>
      )}
    </div>
  )
})
