import type { DiagramGraph, Language } from '@/lib/codeflow-types'
import { getLanguageDefinition } from '@/lib/languages'
import { analyzeJavaScript } from '@/lib/javascript-flow'
import { analyzePython } from '@/lib/python-flow'
import { analyzeGenericLanguage } from '@/lib/generic-flow'
import { MAX_SOURCE_CHARACTERS } from '@/lib/flow-graph-builder'

const emptyGraph = (): DiagramGraph => ({ nodes: [], edges: [] })

export function analyzeCode(source: string, language: Language): DiagramGraph {
  if (!source.trim()) return emptyGraph()
  if (source.length > MAX_SOURCE_CHARACTERS) {
    return { ...emptyGraph(), error: `El código supera el límite de análisis de ${MAX_SOURCE_CHARACTERS.toLocaleString('es')} caracteres.` }
  }

  try {
    const analyzer = getLanguageDefinition(language).diagram
    if (analyzer === 'javascript') return analyzeJavaScript(source)
    if (analyzer === 'python') return analyzePython(source)
    return analyzeGenericLanguage(source, language)
  } catch (error) {
    return { ...emptyGraph(), error: error instanceof Error ? error.message : 'No se pudo analizar el código.' }
  }
}
