import type { FlowCardEdge, FlowCardNode, FlowShape } from './codeflow-types'

export interface FlowRoutePoint {
  x: number
  y: number
}

interface Rect {
  left: number
  right: number
  top: number
  bottom: number
  nodeId: string
}

type Side = 'top' | 'right' | 'bottom' | 'left'
type Direction = 0 | 1 | 2

interface Endpoint {
  side: Side
  port: FlowRoutePoint
  stub: FlowRoutePoint
  bias: number
}

interface QueueItem {
  state: number
  priority: number
}

class MinHeap {
  private items: QueueItem[] = []

  push(item: QueueItem) {
    this.items.push(item)
    let index = this.items.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.items[parent].priority <= item.priority) break
      this.items[index] = this.items[parent]
      index = parent
    }
    this.items[index] = item
  }

  pop(): QueueItem | undefined {
    const first = this.items[0]
    const last = this.items.pop()
    if (!first || !last || !this.items.length) return first
    let index = 0
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      if (left >= this.items.length) break
      const child = right < this.items.length && this.items[right].priority < this.items[left].priority ? right : left
      if (this.items[child].priority >= last.priority) break
      this.items[index] = this.items[child]
      index = child
    }
    this.items[index] = last
    return first
  }

  get size() {
    return this.items.length
  }
}

const fallbackSizes: Record<FlowShape, { width: number; height: number }> = {
  connector: { width: 62, height: 62 },
  terminator: { width: 190, height: 86 },
  decision: { width: 220, height: 140 },
  'input-output': { width: 220, height: 92 },
  process: { width: 196, height: 98 },
}

export function getFlowNodeSize(node: FlowCardNode) {
  const fallback = fallbackSizes[node.data.shape ?? 'process']
  return {
    width: node.measured?.width ?? node.width ?? fallback.width,
    height: node.measured?.height ?? node.height ?? (node.data.expression ? 110 : fallback.height),
  }
}

function uniqueSorted(values: number[]) {
  return [...new Set(values.map((value) => Math.round(value * 100) / 100))].sort((left, right) => left - right)
}

function pointInside(point: FlowRoutePoint, rect: Rect) {
  return point.x > rect.left + 0.1 && point.x < rect.right - 0.1 && point.y > rect.top + 0.1 && point.y < rect.bottom - 0.1
}

function segmentClear(start: FlowRoutePoint, end: FlowRoutePoint, obstacles: Rect[]) {
  for (const rect of obstacles) {
    if (start.y === end.y) {
      if (start.y <= rect.top + 0.1 || start.y >= rect.bottom - 0.1) continue
      if (Math.max(Math.min(start.x, end.x), rect.left + 0.1) < Math.min(Math.max(start.x, end.x), rect.right - 0.1)) return false
    } else if (start.x === end.x) {
      if (start.x <= rect.left + 0.1 || start.x >= rect.right - 0.1) continue
      if (Math.max(Math.min(start.y, end.y), rect.top + 0.1) < Math.min(Math.max(start.y, end.y), rect.bottom - 0.1)) return false
    } else {
      return false
    }
  }
  return true
}

function sideHandle(side: Side, endpoint: 'source' | 'target') {
  return `${endpoint}-${side}`
}

function makeEndpoints(node: FlowCardNode, toward: FlowRoutePoint, endpoint: 'source' | 'target', forcedSide: Side | null, clearance: number, preferredSide: Side | null = null): Endpoint[] {
  const { width, height } = getFlowNodeSize(node)
  const centerX = node.position.x + width / 2
  const centerY = node.position.y + height / 2
  const dx = toward.x - centerX
  const dy = toward.y - centerY
  const sides: Side[] = forcedSide ? [forcedSide] : ['top', 'right', 'bottom', 'left']
  return sides.map((side) => {
    const port = side === 'top' ? { x: centerX, y: node.position.y }
      : side === 'bottom' ? { x: centerX, y: node.position.y + height }
        : side === 'left' ? { x: node.position.x, y: centerY }
          : { x: node.position.x + width, y: centerY }
    const vector = side === 'top' ? { x: 0, y: -1 }
      : side === 'bottom' ? { x: 0, y: 1 }
        : side === 'left' ? { x: -1, y: 0 }
          : { x: 1, y: 0 }
    const facing = vector.x * dx + vector.y * dy
    const dominant = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top')
    const sideBias = side === dominant ? 0 : facing > 0 ? 14 : 42
    const bias = side === preferredSide ? 0 : sideBias + (preferredSide ? 12 : 0)
    return { side, port, stub: { x: port.x + vector.x * clearance, y: port.y + vector.y * clearance }, bias }
  })
}

function segmentPenalty(start: FlowRoutePoint, end: FlowRoutePoint, routes: FlowRoutePoint[][]) {
  let penalty = 0
  for (const route of routes) {
    for (let index = 1; index < route.length; index += 1) {
      const left = route[index - 1]
      const right = route[index]
      if (start.y === end.y && left.y === right.y && start.y === left.y) {
        const overlap = Math.min(Math.max(start.x, end.x), Math.max(left.x, right.x)) - Math.max(Math.min(start.x, end.x), Math.min(left.x, right.x))
        if (overlap > 0) penalty += 500 + overlap * 8
      } else if (start.x === end.x && left.x === right.x && start.x === left.x) {
        const overlap = Math.min(Math.max(start.y, end.y), Math.max(left.y, right.y)) - Math.max(Math.min(start.y, end.y), Math.min(left.y, right.y))
        if (overlap > 0) penalty += 500 + overlap * 8
      } else if (start.y === end.y && left.x === right.x) {
        const crossing = { x: left.x, y: start.y }
        const isRouteEndpoint = (crossing.x === route[0].x && crossing.y === route[0].y)
          || (crossing.x === route.at(-1)?.x && crossing.y === route.at(-1)?.y)
        if (!isRouteEndpoint && left.x >= Math.min(start.x, end.x) && left.x <= Math.max(start.x, end.x) && start.y >= Math.min(left.y, right.y) && start.y <= Math.max(left.y, right.y)) penalty += 900
      } else if (start.x === end.x && left.y === right.y) {
        const crossing = { x: start.x, y: left.y }
        const isRouteEndpoint = (crossing.x === route[0].x && crossing.y === route[0].y)
          || (crossing.x === route.at(-1)?.x && crossing.y === route.at(-1)?.y)
        if (!isRouteEndpoint && left.y >= Math.min(start.y, end.y) && left.y <= Math.max(start.y, end.y) && start.x >= Math.min(left.x, right.x) && start.x <= Math.max(left.x, right.x)) penalty += 900
      }
    }
  }
  return penalty
}

function routeEdge(edge: FlowCardEdge, nodes: FlowCardNode[], obstacles: Rect[], routes: FlowRoutePoint[][]): FlowRoutePoint[] | null {
  const source = nodes.find((node) => node.id === edge.source)
  const target = nodes.find((node) => node.id === edge.target)
  if (!source || !target) return null

  const clearance = 15
  const sourceCenter = { x: source.position.x + getFlowNodeSize(source).width / 2, y: source.position.y + getFlowNodeSize(source).height / 2 }
  const targetCenter = { x: target.position.x + getFlowNodeSize(target).width / 2, y: target.position.y + getFlowNodeSize(target).height / 2 }
  const branchSide = source.data.kind === 'condition'
    && (edge.data?.role === 'true' || edge.data?.role === 'false' || edge.data?.role === 'case')
    && Math.abs(targetCenter.x - sourceCenter.x) >= getFlowNodeSize(source).width * 0.2
    ? targetCenter.x < sourceCenter.x ? 'left' : 'right'
    : null
  const starts = makeEndpoints(source, targetCenter, 'source', edge.data?.preferredSourceSide ?? null, clearance, branchSide)
  const goals = makeEndpoints(target, sourceCenter, 'target', edge.data?.preferredTargetSide ?? null, clearance)
  const routeWindow = {
    left: Math.min(source.position.x, target.position.x) - 120,
    right: Math.max(source.position.x + getFlowNodeSize(source).width, target.position.x + getFlowNodeSize(target).width) + 120,
    top: Math.min(source.position.y, target.position.y) - 120,
    bottom: Math.max(source.position.y + getFlowNodeSize(source).height, target.position.y + getFlowNodeSize(target).height) + 120,
  }
  const routeLaneCoordinates = { x: [] as number[], y: [] as number[] }
  for (const route of routes) {
    for (let index = 1; index < route.length; index += 1) {
      const start = route[index - 1]
      const end = route[index]
      const overlapsWindow = Math.max(Math.min(start.x, end.x), routeWindow.left) <= Math.min(Math.max(start.x, end.x), routeWindow.right)
        && Math.max(Math.min(start.y, end.y), routeWindow.top) <= Math.min(Math.max(start.y, end.y), routeWindow.bottom)
      if (!overlapsWindow) continue
      if (start.x === end.x) routeLaneCoordinates.x.push(start.x - 12, start.x + 12)
      if (start.y === end.y) routeLaneCoordinates.y.push(start.y - 12, start.y + 12)
      routeLaneCoordinates.x.push(start.x - 12, start.x + 12, end.x - 12, end.x + 12)
      routeLaneCoordinates.y.push(start.y - 12, start.y + 12, end.y - 12, end.y + 12)
    }
  }
  const windowObstacles = obstacles.filter((rect) => rect.right >= routeWindow.left
    && rect.left <= routeWindow.right
    && rect.bottom >= routeWindow.top
    && rect.top <= routeWindow.bottom)
  const withinWindow = (value: number, min: number, max: number) => value >= min && value <= max
  const xs = uniqueSorted([
    ...starts.map(({ stub }) => stub.x),
    ...goals.map(({ stub }) => stub.x),
    ...routes.flatMap((route) => route.map(({ x }) => x)).filter((x) => withinWindow(x, routeWindow.left, routeWindow.right)),
    ...routeLaneCoordinates.x.filter((x) => withinWindow(x, routeWindow.left, routeWindow.right)),
    ...windowObstacles.flatMap((rect) => [rect.left, rect.right]),
  ])
  const ys = uniqueSorted([
    ...starts.map(({ stub }) => stub.y),
    ...goals.map(({ stub }) => stub.y),
    ...routes.flatMap((route) => route.map(({ y }) => y)).filter((y) => withinWindow(y, routeWindow.top, routeWindow.bottom)),
    ...routeLaneCoordinates.y.filter((y) => withinWindow(y, routeWindow.top, routeWindow.bottom)),
    ...windowObstacles.flatMap((rect) => [rect.top, rect.bottom]),
  ])
  const xIndexes = new Map(xs.map((value, index) => [value, index]))
  const yIndexes = new Map(ys.map((value, index) => [value, index]))
  const xCount = xs.length
  const stateCount = xCount * ys.length * 3
  const distances = new Float64Array(stateCount).fill(Number.POSITIVE_INFINITY)
  const previous = new Int32Array(stateCount).fill(-1)
  const heap = new MinHeap()
  const goalByCell = new Map<number, Endpoint>()
  const clearanceObstacles = obstacles
  const stateId = (xIndex: number, yIndex: number, direction: Direction) => (yIndex * xCount + xIndex) * 3 + direction
  const cellId = (xIndex: number, yIndex: number) => yIndex * xCount + xIndex
  const heuristics = goals.map(({ stub }) => stub)
  const heuristic = (x: number, y: number) => Math.min(...heuristics.map((point) => Math.abs(point.x - x) + Math.abs(point.y - y)))

  for (const goal of goals) {
    const xIndex = xIndexes.get(goal.stub.x)
    const yIndex = yIndexes.get(goal.stub.y)
    if (xIndex !== undefined && yIndex !== undefined) goalByCell.set(cellId(xIndex, yIndex), goal)
  }

  for (const start of starts) {
    const xIndex = xIndexes.get(start.stub.x)
    const yIndex = yIndexes.get(start.stub.y)
    if (xIndex === undefined || yIndex === undefined || clearanceObstacles.some((rect) => pointInside(start.stub, rect))) continue
    const direction: Direction = start.side === 'left' || start.side === 'right' ? 1 : 2
    const state = stateId(xIndex, yIndex, direction)
    const distance = start.bias + segmentPenalty(start.port, start.stub, routes)
    if (distance < distances[state]) {
      distances[state] = distance
      heap.push({ state, priority: distance + heuristic(start.stub.x, start.stub.y) })
    }
  }

  let destination = -1
  let destinationCost = Number.POSITIVE_INFINITY
  while (heap.size) {
    const current = heap.pop()!
    if (current.priority > destinationCost) break
    const currentCost = distances[current.state]
    const direction = (current.state % 3) as Direction
    const cell = Math.floor(current.state / 3)
    const xIndex = cell % xCount
    const yIndex = Math.floor(cell / xCount)
    const goal = goalByCell.get(cell)
    if (goal) {
      const total = currentCost + goal.bias + segmentPenalty(goal.stub, goal.port, routes)
      if (total < destinationCost) {
        destinationCost = total
        destination = current.state
      }
    }

    const neighbors: Array<[number, number, Direction]> = []
    if (xIndex > 0) neighbors.push([xIndex - 1, yIndex, 1])
    if (xIndex + 1 < xs.length) neighbors.push([xIndex + 1, yIndex, 1])
    if (yIndex > 0) neighbors.push([xIndex, yIndex - 1, 2])
    if (yIndex + 1 < ys.length) neighbors.push([xIndex, yIndex + 1, 2])

    const from = { x: xs[xIndex], y: ys[yIndex] }
    for (const [nextX, nextY, nextDirection] of neighbors) {
      const to = { x: xs[nextX], y: ys[nextY] }
      if (!segmentClear(from, to, clearanceObstacles)) continue
      const step = Math.abs(from.x - to.x) + Math.abs(from.y - to.y)
      const bend = direction !== 0 && direction !== nextDirection ? 22 : 0
      const nextState = stateId(nextX, nextY, nextDirection)
      const nextCost = currentCost + step + bend + segmentPenalty(from, to, routes)
      if (nextCost >= distances[nextState]) continue
      distances[nextState] = nextCost
      previous[nextState] = current.state
      heap.push({ state: nextState, priority: nextCost + heuristic(to.x, to.y) })
    }
  }

  debugInfo.push(`destination ${destination} cost ${destinationCost} xs ${JSON.stringify(xs)} ys ${JSON.stringify(ys)}`)
  if (destination < 0) return null
  const cells: FlowRoutePoint[] = []
  for (let state = destination; state >= 0; state = previous[state]) {
    const cell = Math.floor(state / 3)
    cells.push({ x: xs[cell % xCount], y: ys[Math.floor(cell / xCount)] })
  }
  cells.reverse()
  const sourceSide = starts.find(({ stub }) => stub.x === cells[0]?.x && stub.y === cells[0]?.y)
  const targetSide = goalByCell.get(Math.floor(destination / 3))
  if (!sourceSide || !targetSide) return null
  const simplified = simplifyRoute([sourceSide.port, sourceSide.stub, ...cells.slice(1, -1), targetSide.stub, targetSide.port])
  debugInfo.push(`edge ${edge.id} cells ${JSON.stringify(cells)} simplified ${JSON.stringify(simplified)}`)
  return simplified
}

function simplifyRoute(points: FlowRoutePoint[]) {
  const result: FlowRoutePoint[] = []
  for (const point of points) {
    const last = result[result.length - 1]
    if (last && last.x === point.x && last.y === point.y) continue
    const before = result[result.length - 2]
    if (before && last && ((before.x === last.x && last.x === point.x) || (before.y === last.y && last.y === point.y))) result[result.length - 1] = point
    else result.push(point)
  }
  return result
}

const edgePriority: Record<string, number> = { repeat: -1, control: 0, false: 1, true: 2, case: 2, body: 3, exit: 3, merge: 3 }

function fallbackEndpoint(node: FlowCardNode, toward: FlowCardNode, endpoint: 'source' | 'target'): Endpoint {
  const { width, height } = getFlowNodeSize(node)
  const target = getFlowNodeSize(toward)
  const centerX = node.position.x + width / 2
  const centerY = node.position.y + height / 2
  const targetCenter = { x: toward.position.x + target.width / 2, y: toward.position.y + target.height / 2 }
  const dx = targetCenter.x - centerX
  const dy = targetCenter.y - centerY
  const side: Side = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top')
  return makeEndpoints(node, targetCenter, endpoint, side, 15)[0]
}

function fallbackRoutePoints(source: FlowCardNode, target: FlowCardNode): FlowRoutePoint[] {
  const start = fallbackEndpoint(source, target, 'source')
  const goal = fallbackEndpoint(target, source, 'target')
  const sourceVertical = start.side === 'top' || start.side === 'bottom'
  const targetVertical = goal.side === 'top' || goal.side === 'bottom'
  if (sourceVertical && targetVertical) {
    const midY = (start.stub.y + goal.stub.y) / 2
    return simplifyRoute([
      start.port,
      start.stub,
      { x: start.stub.x, y: midY },
      { x: goal.stub.x, y: midY },
      goal.stub,
      goal.port,
    ])
  }
  if (!sourceVertical && !targetVertical) {
    const midX = (start.stub.x + goal.stub.x) / 2
    return simplifyRoute([
      start.port,
      start.stub,
      { x: midX, y: start.stub.y },
      { x: midX, y: goal.stub.y },
      goal.stub,
      goal.port,
    ])
  }
  return simplifyRoute([
    start.port,
    start.stub,
    sourceVertical ? { x: start.stub.x, y: goal.stub.y } : { x: goal.stub.x, y: start.stub.y },
    goal.stub,
    goal.port,
  ])
}

function buildRoutedEdge(edge: FlowCardEdge, routePoints: FlowRoutePoint[]): FlowCardEdge | null {
  const sourcePort = routePoints[0]
  const sourceStub = routePoints[1]
  const targetStub = routePoints[routePoints.length - 2]
  const targetPort = routePoints[routePoints.length - 1]
  if (!sourcePort || !sourceStub || !targetStub || !targetPort) return null
  const sourceSide = sourceStub.x < sourcePort.x ? 'left' : sourceStub.x > sourcePort.x ? 'right' : sourceStub.y < sourcePort.y ? 'top' : 'bottom'
  const targetSide = targetStub.x < targetPort.x ? 'left' : targetStub.x > targetPort.x ? 'right' : targetStub.y < targetPort.y ? 'top' : 'bottom'
  return {
    ...edge,
    type: 'flowRouted',
    sourceHandle: sideHandle(sourceSide, 'source'),
    targetHandle: sideHandle(targetSide, 'target'),
    data: {
      ...edge.data,
      routePoints,
    },
  }
}

export const debugInfo: string[] = []
export function routeFlowEdges(nodes: FlowCardNode[], edges: FlowCardEdge[]): FlowCardEdge[] {
  const clearance = 8
  const obstacles = nodes.map((node) => {
    const { width, height } = getFlowNodeSize(node)
    return {
      left: node.position.x - clearance,
      right: node.position.x + width + clearance,
      top: node.position.y - clearance,
      bottom: node.position.y + height + clearance,
      nodeId: node.id,
    }
  })
  const routed = new Map<string, FlowCardEdge>()
  const routes: FlowRoutePoint[][] = []
  const orderedEdges = [...edges].sort((left, right) => (edgePriority[left.data?.role ?? ''] ?? 2) - (edgePriority[right.data?.role ?? ''] ?? 2))

  for (const edge of orderedEdges) {
    const source = nodes.find((node) => node.id === edge.source)
    const target = nodes.find((node) => node.id === edge.target)
    const routePoints = routeEdge(edge, nodes, obstacles, routes)
      ?? (source && target ? fallbackRoutePoints(source, target) : null)
    if (!routePoints) {
      routed.set(edge.id, edge)
      continue
    }
    const routedEdge = buildRoutedEdge(edge, routePoints)
    if (!routedEdge) {
      routed.set(edge.id, edge)
      continue
    }
    routes.push(routePoints)
    routed.set(edge.id, routedEdge)
  }

  return edges.map((edge) => routed.get(edge.id) ?? edge)
}