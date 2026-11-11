import { describe, expect, it } from 'vitest'

import { starterFiles } from './codeflow-examples'
import { analyzeCode } from './diagram'
import { buildDiagramSvg, type DiagramPalette } from './diagram-svg'

const palette: DiagramPalette = {
  background: '#0e1212',
  surface: '#181f1e',
  surfaceAlt: '#1e2625',
  border: '#5c6866',
  text: '#dde4e0',
  muted: '#9aa7a1',
  accent: '#a6d68a',
  node: {
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
  },
  edge: {
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
  },
  font: 'sans-serif',
  mono: 'monospace',
}

describe('exportación del diagrama', () => {
  it('genera un SVG autónomo con nodos y flechas', () => {
    const file = starterFiles[0]
    const graph = analyzeCode(file.code, file.language)
    const svg = buildDiagramSvg(graph.nodes, graph.edges, { palette, title: 'Diagrama de prueba' })

    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg).toContain('<title>Diagrama de prueba</title>')
    expect(svg).toContain('<rect')
    expect(svg).toContain('<path')
    expect(svg.length).toBeGreaterThan(800)
  })

  it('incluye el tamaño y la vista del lienzo', () => {
    const file = starterFiles[0]
    const graph = analyzeCode(file.code, file.language)
    const svg = buildDiagramSvg(graph.nodes, graph.edges, { palette, title: 'Diagrama' })

    expect(svg).toMatch(/viewBox="-?\d+ -?\d+ \d+ \d+"/)
    expect(svg).toMatch(/width="\d+" height="\d+"/)
  })

  it('escapa los textos que vienen del código', () => {
    const graph = analyzeCode('const a = "<b>&</b>"\n', 'javascript')
    const svg = buildDiagramSvg(graph.nodes, graph.edges, { palette, title: 'Diagrama' })

    expect(svg).not.toContain('<b>')
    expect(svg).toContain('&lt;b&gt;')
  })

  it('dibuja la silueta de las decisiones y de las entradas', () => {
    const graph = analyzeCode('if (a < b) { print(a) } else { print(b) }\n', 'javascript')
    const svg = buildDiagramSvg(graph.nodes, graph.edges, { palette, title: 'Diagrama' })

    // La silueta es un trazado: una lista de puntos inválida deja el nodo invisible.
    expect(svg).not.toContain('points="M')
    expect(svg).toMatch(/<path d="M [\d.]+ 0 L [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L 0 [\d.]+ Z"/)
    expect(svg).toContain('CONDICIÓN')
  })

  it('no deja formas ni textos a medias', () => {
    const graph = analyzeCode('function total(a) {\n  let sum = 0\n  for (const item of a) sum += item\n  return sum\n}\n', 'javascript')
    const svg = buildDiagramSvg(graph.nodes, graph.edges, { palette, title: 'Diagrama' })

    expect(svg).not.toMatch(/<(path|rect|circle|text|polygon)\b[^>]*\s(d|points)=""/)
    expect(svg).not.toMatch(/<text[^>]*><\/text>/)
    expect(svg).toContain('BUCLE')
  })

  it('no deja bucles vacíos en el archivo exportado', () => {
    const graph = analyzeCode('for (let index = 0; index < 3; index += 1) {\n  work(index)\n}\n', 'javascript')
    const svg = buildDiagramSvg(graph.nodes, graph.edges, { palette, title: 'Diagrama' })

    // Las convergencias no llegan al archivo: no hay círculos con letras.
    expect(graph.nodes.filter((node) => node.data.junction)).toHaveLength(0)
    expect(svg).not.toContain('CONECTOR')
  })

  it('omite los metadatos que el lienzo tampoco muestra', () => {
    const graph = analyzeCode('switch (kind) {\n  case "a": run()\n  default: stop()\n}\n', 'javascript')
    const svg = buildDiagramSvg(graph.nodes, graph.edges, { palette, title: 'Diagrama' })
    const marker = graph.nodes.find((node) => node.data.kind === 'connector')

    // El marcador de caso solo enseña su letra: sin tipo ni número de línea.
    expect(marker).toBeDefined()
    expect(svg).not.toContain('CONECTOR')
  })
})
