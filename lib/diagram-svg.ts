import type { FlowCardData, FlowCardEdge, FlowCardNode, FlowEdgeRole, NodeKind } from '@/lib/codeflow-types'
import { getFlowNodeSize } from '@/lib/flow-routing'
import { NODE_LABELS, OPERATION_LABELS, resolveNodeShape } from '@/components/codeflow/node-kinds'

/**
 * Paleta con la que se dibuja un diagrama exportado. Se resuelve desde los
 * tokens activos para que el archivo guardado tenga el mismo aspecto que el
 * lienzo, pero con valores definitivos: no depende del CSS donde se abra.
 */
export interface DiagramPalette {
  background: string
  surface: string
  surfaceAlt: string
  border: string
  text: string
  muted: string
  accent: string
  node: Record<NodeKind, string>
  edge: Record<FlowEdgeRole, string>
  font: string
  mono: string
}

const NODE_FALLBACK: Record<NodeKind, string> = {
  start: '#a6d68a',
  end: '#a6d68a',
  connector: '#8e9b98',
  io: '#a5c99a',
  function: '#a6d68a',
  variable: '#9fc6b2',
  object: '#9fc6b2',
  event: '#a5c99a',
  condition: '#e0c08a',
  loop: '#cfc0e8',
  class: '#a5c99a',
  call: '#a9c4b8',
  return: '#e8a9a4',
  import: '#8e9b98',
  statement: '#9aa7a1',
  operation: '#9fc6b2',
  phase: '#e0c08a',
}

const EDGE_FALLBACK: Record<FlowEdgeRole, string> = {
  control: '#9aa7a1',
  data: '#9fc6b2',
  true: '#a6d68a',
  false: '#e8a9a4',
  repeat: '#cfc0e8',
  exit: '#e0c08a',
  body: '#9aa7a1',
  operand: '#9fc6b2',
  case: '#e0c08a',
  exception: '#e8a9a4',
  merge: '#9aa7a1',
  unreachable: '#5c6866',
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[char] as string)
}

function shorten(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/** Lee la paleta activa del documento para el diagrama exportado. */
export function readDiagramPalette(): DiagramPalette {
  const styles = getComputedStyle(document.documentElement)
  const read = (token: string, fallback: string) => {
    const value = styles.getPropertyValue(token).trim()
    return value.startsWith('#') ? value : fallback
  }
  const node = { ...NODE_FALLBACK }
  const edge = { ...EDGE_FALLBACK }
  for (const kind of Object.keys(node) as NodeKind[]) {
    node[kind] = read(`--node-${kind}`, node[kind])
  }
  for (const role of Object.keys(edge) as FlowEdgeRole[]) {
    edge[role] = read(`--cf-edge-${role}`, edge[role])
  }
  return {
    background: read('--md-sys-color-surface-container-lowest', '#0e1212'),
    surface: read('--md-sys-color-surface-container', '#181f1e'),
    surfaceAlt: read('--md-sys-color-surface-container-high', '#1e2625'),
    border: read('--md-sys-color-outline', '#5c6866'),
    text: read('--md-sys-color-on-surface', '#dde4e0'),
    muted: read('--md-sys-color-on-surface-variant', '#9aa7a1'),
    accent: read('--md-sys-color-primary', '#a6d68a'),
    node,
    edge,
    font: 'Geist, Inter, system-ui, sans-serif',
    mono: 'Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
  }
}

interface DiagramSvgOptions {
  palette: DiagramPalette
  title: string
  padding?: number
}

function nodeOutline(shape: string, width: number, height: number): string {
  if (shape === 'decision') {
    return `M ${width / 2} 0 L ${width} ${height / 2} L ${width / 2} ${height} L 0 ${height / 2} Z`
  }
  if (shape === 'input-output') {
    const skew = Math.min(28, width * 0.12)
    return `M ${skew} 0 L ${width} 0 L ${width - skew} ${height} L 0 ${height} Z`
  }
  if (shape === 'connector') {
    return `M ${width / 2} 0 A ${width / 2} ${height / 2} 0 1 1 ${width / 2 - 0.01} 0 Z`
  }
  return ''
}

/** Nombre legible del tipo de nodo, el mismo que usa el lienzo. */
function nodeTypeLabel(data: FlowCardData): string {
  if (data.kind === 'operation' && data.operationCategory) return OPERATION_LABELS[data.operationCategory]
  return NODE_LABELS[data.kind]
}

/** Rango de líneas que ocupa el nodo, como en el inspector. */
function nodeLineLabel(data: FlowCardData): string {
  return data.lineEnd && data.lineEnd > data.line ? `L${data.line}–${data.lineEnd}` : `L${data.line}`
}

/**
 * Dibuja un nodo con la misma silueta que en el lienzo: rombo y paralelogramo
 * con anillo de acento, cápsula para los finales, círculo para los conectores
 * y rectángulo redondeado para el resto.
 */
function drawNode(node: FlowCardNode, palette: DiagramPalette): string {
  const data = node.data as FlowCardData
  const { width, height } = getFlowNodeSize(node)
  const shape = resolveNodeShape(data)
  const accent = palette.node[data.kind] ?? palette.accent
  const x = node.position.x
  const y = node.position.y
  const parts: string[] = []

  if (shape === 'decision' || shape === 'input-output') {
    // Anillo de acento con relleno de superficie, igual que en el lienzo.
    parts.push(`<path d="${nodeOutline(shape, width, height)}" transform="translate(${x} ${y})" fill="${accent}" />`)
    parts.push(`<path d="${nodeOutline(shape, width - 2, height - 2)}" transform="translate(${x + 1} ${y + 1})" fill="${palette.surface}" />`)
  } else if (shape === 'connector') {
    parts.push(`<circle cx="${x + width / 2}" cy="${y + height / 2}" r="${Math.min(width, height) / 2 - 1}" fill="${palette.surface}" stroke="${accent}" stroke-width="1.5" />`)
  } else {
    const radius = shape === 'terminator' ? height / 2 : 6
    parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${palette.surface}" stroke="${palette.border}" stroke-width="1.2" />`)
  }

  const label = typeof data.label === 'string' ? data.label : String(data.label ?? '')
  const detail = typeof data.detail === 'string' ? data.detail : ''
  const expression = typeof data.expression === 'string' ? data.expression : ''

  // El conector solo enseña su letra: el resto de metadatos estorba.
  if (shape === 'connector') {
    parts.push(`<text x="${x + width / 2}" y="${y + height / 2 + 4}" text-anchor="middle" font-family="${palette.mono}" font-size="12" fill="${accent}">${escapeXml(shorten(label, Math.floor(width / 7)))}</text>`)
    return parts.join('')
  }

  const centered = shape === 'decision' || shape === 'terminator' || shape === 'input-output'
  const anchor = centered ? 'middle' : 'start'
  const textX = centered ? x + width / 2 : x + 14
  const lineLabel = nodeLineLabel(data)
  const typeLabel = nodeTypeLabel(data).toUpperCase()

  if (centered) {
    const typeBaseline = y + height / 2 - (detail ? 20 : 12)
    parts.push(`<text x="${textX}" y="${typeBaseline}" text-anchor="${anchor}" font-family="${palette.mono}" font-size="9.5" fill="${accent}" letter-spacing="0.4">${escapeXml(`${typeLabel} ${lineLabel}`)}</text>`)
  } else {
    parts.push(`<text x="${textX}" y="${y + 22}" text-anchor="start" font-family="${palette.mono}" font-size="9.5" fill="${accent}" letter-spacing="0.4">${escapeXml(typeLabel)}</text>`)
    parts.push(`<text x="${x + width - 12}" y="${y + 22}" text-anchor="end" font-family="${palette.mono}" font-size="9" fill="${palette.muted}">${escapeXml(lineLabel)}</text>`)
  }

  const labelBaseline = centered ? y + height / 2 : y + 40
  // El rombo se estrecha hacia arriba y abajo: su texto necesita más margen.
  const narrow = shape === 'decision'
  const maxChars = centered ? Math.floor(width / (narrow ? 9 : shape === 'input-output' ? 7 : 6.4)) : Math.floor((width - 28) / 6.4)
  const labelSize = narrow || shape === 'input-output' ? 11 : 12
  parts.push(`<text x="${textX}" y="${labelBaseline}" text-anchor="${anchor}" font-family="${palette.mono}" font-size="${labelSize}" fill="${palette.text}">${escapeXml(shorten(label, maxChars))}</text>`)

  if (detail) {
    parts.push(`<text x="${textX}" y="${labelBaseline + 16}" text-anchor="${anchor}" font-family="${palette.font}" font-size="9.5" fill="${palette.muted}">${escapeXml(shorten(detail, Math.floor(maxChars * 0.85)))}</text>`)
  }

  if (expression && !centered) {
    parts.push(`<text x="${textX}" y="${labelBaseline + 30}" text-anchor="start" font-family="${palette.mono}" font-size="9" fill="${palette.muted}">${escapeXml(shorten(expression, Math.floor(maxChars * 0.85)))}</text>`)
  }

  return parts.join('')
}

/** Punto donde se coloca la etiqueta de una flecha: el tramo más largo. */
function edgeLabelAnchor(points: Array<{ x: number; y: number }>) {
  const segment = points.slice(1).reduce((longest, point, index) => {
    const previous = points[index]
    const length = Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)
    return length > longest.length ? { start: previous, end: point, length } : longest
  }, { start: points[0], end: points[0], length: 0 })
  return { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 }
}

function drawEdge(edge: FlowCardEdge, palette: DiagramPalette): string {
  const points = edge.data?.routePoints?.length
    ? edge.data.routePoints
    : [{ x: 0, y: 0 }]
  if (points.length < 2) return ''
  const role = edge.data?.role ?? 'control'
  const color = palette.edge[role] ?? palette.muted
  const dash = role === 'repeat' ? '5 4' : role === 'unreachable' ? '2 4' : ''
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${Math.round(point.x)} ${Math.round(point.y)}`).join(' ')
  const parts: string[] = [`<path d="${path}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''} />`]

  const last = points[points.length - 1]
  const previous = points[points.length - 2]
  const angle = Math.atan2(last.y - previous.y, last.x - previous.x) * 180 / Math.PI
  parts.push(`<g transform="translate(${last.x} ${last.y}) rotate(${angle})"><path d="M 0 0 L -9 4.5 L -9 -4.5 Z" fill="${color}" /></g>`)

  const edgeLabel = typeof edge.label === 'string' ? edge.label : ''
  if (edgeLabel) {
    const middle = edgeLabelAnchor(points)
    const width = edgeLabel.length * 6 + 12
    parts.push(`<rect x="${middle.x - width / 2}" y="${middle.y - 11}" width="${width}" height="18" rx="5" fill="${palette.surfaceAlt}" stroke="${palette.border}" stroke-width="0.8" />`)
    parts.push(`<text x="${middle.x}" y="${middle.y + 2}" text-anchor="middle" font-family="${palette.mono}" font-size="10" fill="${palette.muted}">${escapeXml(edgeLabel)}</text>`)
  }
  return parts.join('')
}

/**
 * Construye un SVG autónomo del diagrama: nodos, flechas y etiquetas con las
 * formas del propio editor. No depende del DOM del lienzo, así que el archivo
 * exportado se puede abrir en cualquier visor.
 */
export function buildDiagramSvg(nodes: FlowCardNode[], edges: FlowCardEdge[], options: DiagramSvgOptions): string {
  const { palette, title } = options
  const padding = options.padding ?? 48
  const sizes = nodes.map((node) => ({ node, size: getFlowNodeSize(node) }))
  const minX = Math.min(...sizes.map(({ node }) => node.position.x), 0) - padding
  const minY = Math.min(...sizes.map(({ node }) => node.position.y), 0) - padding
  const maxX = Math.max(...sizes.map(({ node, size }) => node.position.x + size.width), 0) + padding
  const maxY = Math.max(...sizes.map(({ node, size }) => node.position.y + size.height), 0) + padding
  const width = Math.max(Math.round(maxX - minX), 320)
  const height = Math.max(Math.round(maxY - minY), 240)

  const body = [
    ...edges.map((edge) => drawEdge(edge, palette)),
    ...nodes.map((node) => drawNode(node, palette)),
  ].join('')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-label="${escapeXml(title)}">`,
    `<title>${escapeXml(title)}</title>`,
    `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${palette.background}" />`,
    body,
    '</svg>',
  ].join('')
}

/** Convierte el SVG del diagrama en un PNG a la escala indicada. */
export async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  // El SVG viaja como Blob y no como URL de datos: los diagramas grandes
  // superan el límite de longitud de una URL de datos en varios navegadores.
  const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('No se pudo rasterizar el diagrama.'))
      image.src = objectUrl
    })
  } catch (cause) {
    URL.revokeObjectURL(objectUrl)
    throw cause
  }
  const width = image.naturalWidth || 1200
  const height = image.naturalHeight || 800
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext('2d')
  if (!context) {
    URL.revokeObjectURL(objectUrl)
    throw new Error('El navegador no permite rasterizar el diagrama.')
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(objectUrl)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar el PNG.'))), 'image/png')
  })
}
