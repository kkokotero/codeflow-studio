import type { DiagramGraph, Language } from '@/lib/codeflow-types'
import { analyzeJavaScript } from '@/lib/javascript-flow'
import { analyzePython } from '@/lib/python-flow'
import { MAX_SOURCE_CHARACTERS } from '@/lib/flow-graph-builder'

const emptyGraph = (): DiagramGraph => ({ nodes: [], edges: [] })

export function analyzeCode(source: string, language: Language): DiagramGraph {
  if (!source.trim()) return emptyGraph()
  if (source.length > MAX_SOURCE_CHARACTERS) {
    return { ...emptyGraph(), error: `El código supera el límite de análisis de ${MAX_SOURCE_CHARACTERS.toLocaleString('es')} caracteres.` }
  }

  try {
    return language === 'javascript' ? analyzeJavaScript(source) : analyzePython(source)
  } catch (error) {
    return { ...emptyGraph(), error: error instanceof Error ? error.message : 'No se pudo analizar el código.' }
  }
}
