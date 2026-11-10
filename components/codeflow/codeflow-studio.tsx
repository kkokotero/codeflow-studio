'use client'

import dynamic from 'next/dynamic'
import type { OnMount } from '@monaco-editor/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Braces, Check,
  ChevronDown, CircleDot, Clock3, Code2, Copy, FileCode2, FilePlus2, Folder,
  GitBranch, History, Import, Keyboard, ListTree, LoaderCircle, PanelRight,
  Play, Plus, RotateCcw, Search, SkipBack, SkipForward, SlidersHorizontal,
  Square, Terminal, Trash2, Variable, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FlowCanvas } from '@/components/codeflow/flow-canvas'
import { ColorThemeControls, useMaterialTheme } from '@/components/codeflow/color-theme-controls'
import { HelpDialog } from '@/components/codeflow/help-dialog'
import { analyzeCode } from '@/lib/diagram'
import { starterFiles } from '@/lib/codeflow-examples'
import { EXECUTION_LIMIT_NOTICE, EXECUTION_READY_NOTICE, MAX_EXECUTION_OUTPUT_BYTES, MAX_EXECUTION_SOURCE_BYTES, MAX_EXECUTION_TIME_MS } from '@/lib/runtime-safety'
import type { CodeFile, ExecutionOutput, Language, RunSnapshot, RunStatus, SafeValue, SandboxExecutionResult, TraceEntry } from '@/lib/codeflow-types'

const CodeEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="editor-loading"><LoaderCircle className="spin" aria-hidden="true" /> Preparando el editor</div>,
})

const languageNames: Record<Language, string> = { javascript: 'JavaScript', python: 'Python' }
const runtimeNames: Record<Language, string> = { javascript: 'Node 24 · aislado', python: 'Python 3.14 · aislado' }

type InspectorTab = 'variables' | 'stack' | 'history'
type BottomTab = 'console' | 'trace'

function formatValue(value: SafeValue): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}

function valueKind(value: SafeValue): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return typeof value
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

function getExtension(name: string): Language {
  return name.toLowerCase().endsWith('.py') ? 'python' : 'javascript'
}

export function CodeflowStudio() {
  const { mode, setMode, seed, setSeed, isDark } = useMaterialTheme()
  const [files, setFiles] = useState<CodeFile[]>(starterFiles)
  const [activeFileId, setActiveFileId] = useState(starterFiles[0].id)
  const [status, setStatus] = useState<RunStatus>('idle')
  const [trace, setTrace] = useState<TraceEntry[]>([])
  const [activeStep, setActiveStep] = useState(-1)
  const [logs, setLogs] = useState<ExecutionOutput[]>([])
  const [snapshots, setSnapshots] = useState<RunSnapshot[]>([])
  const [historicalView, setHistoricalView] = useState<RunSnapshot | null>(null)
  const [selectedSnapshots, setSelectedSnapshots] = useState<string[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [manualEdges, setManualEdges] = useState<import('@/lib/codeflow-types').FlowCardEdge[]>([])
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('variables')
  const [bottomTab, setBottomTab] = useState<BottomTab>('console')
  const [variableQuery, setVariableQuery] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [sourceEdit, setSourceEdit] = useState('')
  const [sourceLineOriginal, setSourceLineOriginal] = useState('')
  const [mobilePane, setMobilePane] = useState<'editor' | 'diagram' | 'inspector'>('editor')
  const [isImporting, setIsImporting] = useState(false)
  const [fileFilter, setFileFilter] = useState('')
  const [notice, setNotice] = useState(EXECUTION_READY_NOTICE)
  const [showHelp, setShowHelp] = useState(false)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const executionAbortRef = useRef<AbortController | null>(null)
  const decorationIdsRef = useRef<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileSearchRef = useRef<HTMLInputElement>(null)

  const activeFile = files.find((file) => file.id === activeFileId) ?? files[0]
  const displayCode = historicalView?.code ?? activeFile.code
  const displayLanguage = historicalView?.language ?? activeFile.language
  const displayFileName = historicalView?.fileName ?? activeFile.name
  const graph = useMemo(() => analyzeCode(displayCode, displayLanguage), [displayCode, displayLanguage])
  const currentStep = trace[activeStep] ?? null
  const isRuntimeBusy = status === 'running' || status === 'loading'
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null
  const activeOperation = currentStep?.operationId ? graph.nodes.find((node) => node.data.operationId === currentStep.operationId) ?? null : null
  const visibleTrace = useMemo(() => {
    const start = Math.max(0, Math.min(activeStep - 50, trace.length - 100))
    return trace.slice(start, start + 100).map((step, index) => ({ step, index: start + index }))
  }, [activeStep, trace])
  const sortedVariables = useMemo(() => Object.entries(currentStep?.locals ?? {}).sort(([left], [right]) => left.localeCompare(right)), [currentStep])
  const visibleVariables = useMemo(() => sortedVariables.filter(([name]) => name.toLowerCase().includes(variableQuery.trim().toLowerCase())), [sortedVariables, variableQuery])
  const comparedSnapshots = snapshots.filter((snapshot) => selectedSnapshots.includes(snapshot.id))

  useEffect(() => {
    if (status !== 'complete' || !isPlaying || trace.length < 2) return
    const interval = window.setInterval(() => {
      setActiveStep((current) => {
        const next = Math.min(current + 1, trace.length - 1)
        if (next >= trace.length - 1) setIsPlaying(false)
        return next
      })
    }, Math.max(160, 720 / speed))
    return () => window.clearInterval(interval)
  }, [isPlaying, speed, status, trace])

  useEffect(() => {
    if (activeStep >= 0 && trace[activeStep]) {
      const line = trace[activeStep].line
      editorRef.current?.revealLineInCenter(line)
      editorRef.current?.setPosition({ lineNumber: line, column: 1 })
    }
  }, [activeStep, trace])

  useEffect(() => {
    if (!editorRef.current) return
    const decorations: Parameters<Parameters<OnMount>[0]['deltaDecorations']>[1] = currentStep
      ? [{ range: { startLineNumber: currentStep.line, endLineNumber: currentStep.line, startColumn: 1, endColumn: 1 }, options: { isWholeLine: true, className: 'codeflow-active-line' } }]
      : []
    decorationIdsRef.current = editorRef.current.deltaDecorations(decorationIdsRef.current, decorations)
  }, [activeFileId, currentStep])

  const updateActiveCode = useCallback((code: string) => {
    setHistoricalView(null)
    setFiles((current) => current.map((file) => file.id === activeFileId ? { ...file, code } : file))
  }, [activeFileId])

  const openLine = useCallback((nodeId: string) => {
    const node = graph.nodes.find((item) => item.id === nodeId)
    if (!node) return
    setSelectedNodeId(nodeId)
    const sourceLine = displayCode.split('\n')[node.data.line - 1] ?? ''
    setSourceLineOriginal(sourceLine)
    setSourceEdit(sourceLine)
    setMobilePane('editor')
    editorRef.current?.revealLineInCenter(node.data.line)
    editorRef.current?.setPosition({ lineNumber: node.data.line, column: 1 })
    editorRef.current?.focus()
  }, [displayCode, graph.nodes])

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    monaco.editor.defineTheme('codeflow-graphite', {
      base: 'vs-dark', inherit: true, rules: [
        { token: 'keyword', foreground: 'C5A6FF' },
        { token: 'string', foreground: 'B6D68A' },
        { token: 'number', foreground: 'E7B56B' },
        { token: 'comment', foreground: '66736E', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': '#0d1114',
        'editorLineNumber.foreground': '#424b4a',
        'editorLineNumber.activeForeground': '#b4c0bb',
        'editorCursor.foreground': '#bdff82',
        'editor.selectionBackground': '#5a744f66',
        'editor.lineHighlightBackground': '#131b1a',
        'editorGutter.background': '#0d1114',
        'editorIndentGuide.background1': '#202826',
      },
    })
      monaco.editor.setTheme(isDark ? 'codeflow-graphite' : 'vs')
      editor.updateOptions({ glyphMargin: false, fontSize: 13, lineHeight: 23, fontFamily: 'Geist Mono, ui-monospace, monospace', padding: { top: 15, bottom: 14 }, minimap: { enabled: false }, scrollBeyondLastLine: false, smoothScrolling: true, renderLineHighlight: 'line', roundedSelection: false, contextmenu: true, bracketPairColorization: { enabled: true } })
  }, [isDark])

  const runCode = useCallback(async () => {
    if (historicalView) return

    const sourceBytes = new TextEncoder().encode(activeFile.code).byteLength
    if (sourceBytes > MAX_EXECUTION_SOURCE_BYTES) {
      const message = `El código supera el límite de ${Math.round(MAX_EXECUTION_SOURCE_BYTES / 1_000)} KB.`
      setStatus('error')
      setLogs([{ stream: 'stderr', text: message }])
      setNotice(message)
      setBottomTab('console')
      return
    }

    const controller = new AbortController()
    executionAbortRef.current = controller
    setIsPlaying(false)
    setBottomTab('console')
    setStatus('loading')
    setTrace([])
    setActiveStep(-1)
    setLogs([])
    setNotice('Creando una microVM desechable…')

    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: activeFile.language, code: activeFile.code }),
        signal: controller.signal,
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const errorMessage = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'No se pudo ejecutar el programa.'
        throw new Error(errorMessage)
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Respuesta de ejecución no válida.')

      const result = payload as SandboxExecutionResult
      if (!Array.isArray(result.output) || typeof result.exitCode !== 'number') throw new Error('Respuesta de ejecución no válida.')

      const output = result.output.length ? result.output : result.timedOut
        ? [{ stream: 'stderr' as const, text: `Tiempo límite de ${MAX_EXECUTION_TIME_MS / 1_000} s alcanzado.` }]
        : result.outputTruncated
          ? [{ stream: 'stderr' as const, text: 'La salida superó el límite y el proceso fue detenido.' }]
          : result.exitCode !== 0
            ? [{ stream: 'stderr' as const, text: `El proceso terminó con código ${result.exitCode}.` }]
            : []
      setLogs(output)
      setTrace([])
      setActiveStep(-1)
      const snapshot: RunSnapshot = {
        id: crypto.randomUUID(),
        fileId: activeFile.id,
        fileName: activeFile.name,
        language: activeFile.language,
        code: activeFile.code,
        createdAt: Date.now(),
        steps: [],
        output,
      }
      setSnapshots((current) => [snapshot, ...current].slice(0, 8))
      setSelectedSnapshots([])

      const failed = result.exitCode !== 0 || result.timedOut || result.outputTruncated
      setStatus(failed ? 'error' : 'complete')
      if (result.timedOut) setNotice(`Tiempo límite alcanzado · ${MAX_EXECUTION_TIME_MS / 1_000} s · proceso detenido.`)
      else if (result.outputTruncated) setNotice(`Salida limitada a ${Math.round(MAX_EXECUTION_OUTPUT_BYTES / 1_024)} KB · proceso detenido.`)
      else if (result.exitCode !== 0) setNotice(`El proceso terminó con código ${result.exitCode} · revisa stderr.`)
      else setNotice(`Ejecución completada en ${(result.durationMs / 1_000).toFixed(2)} s.`)
    } catch (error) {
      const cancelled = controller.signal.aborted
      const message = cancelled
        ? 'Ejecución detenida · cerrando el entorno aislado.'
        : error instanceof Error ? error.message : 'No se pudo ejecutar el programa.'
      setStatus(cancelled ? 'stopped' : 'error')
      if (!cancelled) setLogs([{ stream: 'stderr', text: message }])
      setNotice(message)
    } finally {
      if (executionAbortRef.current === controller) executionAbortRef.current = null
    }
  }, [activeFile, historicalView])

  const cancelExecution = useCallback(() => {
    executionAbortRef.current?.abort()
  }, [])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key === 'Enter') {
        event.preventDefault()
        runCode()
      } else if (event.key.toLowerCase() === 'p') {
        event.preventDefault()
        fileSearchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [runCode])

  useEffect(() => {
    if (!showHelp) return
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowHelp(false) }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [showHelp])

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false)
      setStatus('paused')
      setNotice('Reproducción pausada · inspecciona las variables del paso actual.')
    } else if (trace.length) {
      setIsPlaying(true)
      setStatus('complete')
      if (activeStep >= trace.length - 1) setActiveStep(0)
      setNotice('Reproduciendo el registro capturado.')
    }
  }, [activeStep, isPlaying, trace.length])

  const stepBy = useCallback((delta: number) => {
    setIsPlaying(false)
    setStatus('paused')
    setActiveStep((current) => Math.min(Math.max(current + delta, 0), Math.max(trace.length - 1, 0)))
    setNotice('Paso seleccionado · variables tomadas de la ejecución original.')
  }, [trace.length])

  const addFile = useCallback(() => {
    const language = activeFile.language
    const number = files.length + 1
    const extension = language === 'python' ? 'py' : 'js'
    const name = `src/nuevo-${number}.${extension}`
    const id = `file-${Date.now()}`
    setHistoricalView(null)
    setFiles((current) => [...current, { id, name, language, code: '' }])
    setActiveFileId(id)
    setTrace([])
    setLogs([])
    setActiveStep(-1)
    setStatus('idle')
    setNotice(`Archivo ${name} creado.`)
  }, [activeFile.language, files.length])

  const importFiles = useCallback(async (items: FileList | null) => {
    if (!items?.length) return
    setIsImporting(true)
    try {
      const selectedFiles = Array.from(items)
      if (selectedFiles.length > 50 || selectedFiles.some((item) => item.size > (item.name.endsWith('.codeflow.json') ? 25_000_000 : 2_000_000))) throw new Error('El límite es de 50 archivos; código hasta 2 MB y proyectos CodeFlow hasta 25 MB.')
      const imported: CodeFile[] = []
      const createId = () => `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const cleanName = (name: string) => name.split('/').filter((part) => part && part !== '.' && part !== '..').map((part) => part.replace(/[^\w.-]/g, '-')).join('/') || 'archivo.js'
      for (const item of selectedFiles) {
        const text = await item.text()
        if (/\.codeflow\.json$/i.test(item.name)) {
          const bundle = JSON.parse(text) as { format?: string; version?: number; files?: Array<{ name?: unknown; language?: unknown; code?: unknown }> }
          if (bundle.format !== 'codeflow-project' || bundle.version !== 1 || !Array.isArray(bundle.files)) throw new Error('El archivo no es un proyecto CodeFlow válido.')
          if (bundle.files.length > 50) throw new Error('El proyecto contiene más de 50 archivos.')
          for (const entry of bundle.files) {
            if (typeof entry.name !== 'string' || typeof entry.code !== 'string' || (entry.language !== 'javascript' && entry.language !== 'python')) throw new Error('El proyecto contiene un archivo no válido.')
            const name = cleanName(entry.name)
            if (entry.language === 'python' ? !name.toLowerCase().endsWith('.py') : !/\.(js|jsx|mjs)$/i.test(name)) throw new Error(`La extensión de ${name} no coincide con su runtime.`)
            imported.push({ id: createId(), name, language: entry.language, code: entry.code })
          }
        } else if (/\.(js|jsx|mjs|py)$/i.test(item.name)) {
          imported.push({ id: createId(), name: `imports/${cleanName(item.name)}`, language: getExtension(item.name), code: text })
        }
      }
      if (!imported.length) {
        setNotice('Importa archivos .js, .jsx, .mjs, .py o un proyecto .codeflow.json.')
        return
      }
      if (imported.length > 50) throw new Error('El proyecto contiene más de 50 archivos.')
      setHistoricalView(null)
      setFiles((current) => [...current, ...imported])
      setActiveFileId(imported[0].id)
      setTrace([])
      setLogs([])
      setActiveStep(-1)
      setStatus('idle')
      setNotice(`${imported.length} archivo${imported.length === 1 ? '' : 's'} importado${imported.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudieron leer los archivos seleccionados.')
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [])

  const exportActiveFile = useCallback(() => {
    const blob = new Blob([displayCode], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = displayFileName.split('/').at(-1) ?? 'codigo.js'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice(`Se exportó ${link.download}.`)
  }, [displayCode, displayFileName])

  const applySourceEdit = useCallback(() => {
    if (!selectedNode || historicalView) return
    const lines = activeFile.code.split('\n')
    const index = selectedNode.data.line - 1
    if (lines[index] !== sourceLineOriginal) {
      setNotice('Conflicto de edición: la línea cambió en el editor. Recarga la versión actual antes de aplicar.')
      return
    }
    lines[index] = sourceEdit
    updateActiveCode(lines.join('\n'))
    setSourceLineOriginal(sourceEdit)
    setNotice(`Línea ${selectedNode.data.line} sincronizada con el diagrama.`)
  }, [activeFile.code, historicalView, selectedNode, sourceEdit, sourceLineOriginal, updateActiveCode])

  const exportProject = useCallback(() => {
    const bundle = { format: 'codeflow-project', version: 1, name: 'algoritmos-visuales', files: files.map(({ name, language, code }) => ({ name, language, code })) }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'algoritmos-visuales.codeflow.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice(`${files.length} archivos exportados como proyecto CodeFlow.`)
  }, [files])

  const exportDiagram = useCallback(() => {
    const diagram = { format: 'codeflow-diagram', version: 1, file: displayFileName, language: displayLanguage, nodes: graph.nodes.map(({ id, position, data }) => ({ id, position, ...data })), edges: [...graph.edges, ...manualEdges] }
    const blob = new Blob([JSON.stringify(diagram, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${displayFileName.split('/').at(-1)?.replace(/\.[^.]+$/, '') ?? 'diagrama'}.diagram.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice(`Diagrama de ${displayFileName} exportado como JSON.`)
  }, [displayFileName, displayLanguage, graph, manualEdges])

  const clearConsole = useCallback(() => {
    setLogs([])
  }, [])

  const toggleSnapshotSelection = useCallback((id: string) => {
    setSelectedSnapshots((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 2 ? [...current, id] : [current[1], id])
  }, [])

  const selectSnapshot = useCallback((snapshot: RunSnapshot) => {
    setHistoricalView(snapshot)
    if (files.some((file) => file.id === snapshot.fileId)) setActiveFileId(snapshot.fileId)
    setTrace(snapshot.steps)
    setLogs(snapshot.output)
    setActiveStep(snapshot.steps.length ? snapshot.steps.length - 1 : -1)
    setIsPlaying(false)
    setStatus('paused')
    setInspectorTab('variables')
    setNotice(`Vista de historial · ${new Date(snapshot.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`)
  }, [files])

  const filteredFiles = files.filter((file) => file.name.toLowerCase().includes(fileFilter.toLowerCase()))

  return (
    <main className="codeflow-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="CodeFlow Studio, inicio">
          <span className="brand-mark"><Code2 aria-hidden="true" /></span>
          <span className="brand-name">codeflow<span className="brand-dot">.</span><span className="brand-studio">studio</span></span>
        </a>
        <div className="topbar-divider" />
        <div className="project-crumb"><Folder aria-hidden="true" /><span>proyectos</span><ChevronDown aria-hidden="true" /><span className="crumb-separator">/</span><strong>algoritmos-visuales</strong><ChevronDown aria-hidden="true" /></div>
        <div className="topbar-spacer" />
        <ColorThemeControls mode={mode} seed={seed} onModeChange={setMode} onSeedChange={setSeed} />
        <div className="session-indicator"><span className="connection-dot" /> Sesión local</div>
        <Button variant="ghost" size="icon-sm" aria-label="Ayuda y atajos de teclado" title="Ayuda y atajos de teclado" onClick={() => setShowHelp(true)}><Keyboard aria-hidden="true" /></Button>
        <button className="avatar-button" type="button" aria-label="Perfil local">CF</button>
      </header>

      <section className="toolbar" aria-label="Controles del proyecto">
        <div className="toolbar-left">
          <div className="runtime-select-wrap">
            <span className={`language-mark language-mark--${displayLanguage}`}>{displayLanguage === 'python' ? 'Py' : 'JS'}</span>
            <select aria-label="Lenguaje del archivo" value={displayLanguage} disabled={isRuntimeBusy || Boolean(historicalView)} onChange={(event) => {
              const language = event.target.value as Language
              setHistoricalView(null)
              const extension = language === 'python' ? '.py' : '.js'
              setFiles((current) => current.map((file) => file.id === activeFileId ? { ...file, language, name: file.name.replace(/\.(js|jsx|mjs|py)$/i, extension) } : file))
            }}>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <optgroup label="Próximamente · sin runtime">
                <option value="typescript" disabled>TypeScript</option>
                <option value="lua" disabled>Lua</option>
                <option value="java" disabled>Java</option>
                <option value="c" disabled>C / C++</option>
                <option value="csharp" disabled>C#</option>
                <option value="go" disabled>Go</option>
                <option value="rust" disabled>Rust</option>
              </optgroup>
            </select>
            <ChevronDown aria-hidden="true" />
          </div>
          <span className="runtime-pill"><span className="runtime-dot" />{runtimeNames[displayLanguage]}</span>
          <span className="toolbar-divider" />
          <span className="file-title"><FileCode2 aria-hidden="true" />{displayFileName}</span>
        </div>
        <div className="toolbar-right">
          {isRuntimeBusy ? <Button size="sm" className="run-button run-button--busy" onClick={cancelExecution} aria-label="Detener ejecución" title="Detener ejecución">
            <Square data-icon="inline-start" aria-hidden="true" />Detener
          </Button> : <Button size="sm" className="run-button" onClick={() => void runCode()} disabled={Boolean(historicalView)} aria-describedby="execution-limit-note" title={EXECUTION_LIMIT_NOTICE}>
            <Play data-icon="inline-start" aria-hidden="true" />Ejecutar <kbd>⌘ Enter</kbd>
          </Button>}
          <span id="execution-limit-note" className="sr-only">{EXECUTION_LIMIT_NOTICE}</span>
          <span className="toolbar-divider" />
          <Button variant="ghost" size="icon-sm" aria-label="Exportar archivo" title="Exportar archivo" onClick={exportActiveFile}><ArrowDownToLine aria-hidden="true" /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Exportar proyecto" title="Exportar proyecto CodeFlow" onClick={exportProject}><Folder aria-hidden="true" /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Importar código" title="Importar archivos o proyecto" onClick={() => fileInputRef.current?.click()} disabled={isImporting}><Import aria-hidden="true" /></Button>
          <input ref={fileInputRef} type="file" accept=".js,.jsx,.mjs,.py,.codeflow.json" multiple className="visually-hidden" onChange={(event) => void importFiles(event.target.files)} aria-label="Seleccionar archivos para importar" />
        </div>
      </section>

      <div className="workspace">
        <aside className="files-pane" aria-label="Archivos del proyecto">
          <div className="pane-heading"><span>EXPLORADOR</span><Button variant="ghost" size="icon-xs" onClick={addFile} aria-label="Crear archivo" title="Crear archivo" disabled={isRuntimeBusy || Boolean(historicalView)}><FilePlus2 aria-hidden="true" /></Button></div>
          <div className="project-folder"><ChevronDown aria-hidden="true" /><Folder aria-hidden="true" /><span>ALGORITMOS-VISUALES</span><span className="folder-count">{files.length}</span></div>
          <label className="file-search"><Search aria-hidden="true" /><input ref={fileSearchRef} value={fileFilter} onChange={(event) => setFileFilter(event.target.value)} placeholder="Filtrar archivos" aria-label="Filtrar archivos" /><kbd>⌘ P</kbd></label>
          <div className="file-list" role="list" aria-label="Archivos">
            {filteredFiles.map((file) => (
              <button className={`file-row ${activeFileId === file.id ? 'is-active' : ''}`} type="button" role="listitem" key={file.id} onClick={() => { setHistoricalView(null); setActiveFileId(file.id); setSelectedNodeId(null); setManualEdges([]); setTrace([]); setLogs([]); setActiveStep(-1); setStatus('idle') }} disabled={isRuntimeBusy}>
                <span className={`file-language file-language--${file.language}`}>{file.language === 'python' ? 'Py' : 'JS'}</span><span className="file-name">{file.name.split('/').at(-1)}</span>{activeFileId === file.id && <span className="file-edited-dot" aria-label="Archivo abierto" />}
              </button>
            ))}
            {filteredFiles.length === 0 && <div className="file-empty">No se encontraron archivos</div>}
          </div>
          <div className="files-actions"><Button variant="ghost" size="sm" onClick={addFile} disabled={isRuntimeBusy || Boolean(historicalView)}><Plus data-icon="inline-start" aria-hidden="true" />Nuevo archivo</Button><Button variant="ghost" size="icon-sm" onClick={() => fileInputRef.current?.click()} aria-label="Importar archivos" title="Importar archivos" disabled={isRuntimeBusy}><Import aria-hidden="true" /></Button></div>
          <div className="sidebar-bottom"><div className="sidebar-bottom__row"><GitBranch aria-hidden="true" /><span>main</span><span className="sidebar-bottom__status">sin guardar</span></div><div className="sidebar-bottom__row"><Activity aria-hidden="true" /><span>Análisis estático</span><span className="sidebar-bottom__status">activo</span></div></div>
        </aside>

        <section className={`editor-pane workspace-panel ${mobilePane === 'editor' ? 'mobile-active' : ''}`} aria-label="Editor de código">
          <div className="panel-titlebar">
            <div className="panel-title"><Code2 aria-hidden="true" /><span>CÓDIGO</span><span className="panel-title__muted">·</span><span className="panel-title__file">{displayFileName.split('/').at(-1)}</span>{historicalView && <span className="history-mode-tag">SNAPSHOT · SOLO LECTURA</span>}</div>
            <div className="editor-actions"><span className="editor-language-tag">{languageNames[displayLanguage]}</span>{historicalView ? <Button variant="ghost" size="sm" onClick={() => setHistoricalView(null)}>Volver al archivo</Button> : <Button variant="ghost" size="icon-xs" aria-label="Restablecer ejemplo" title="Restablecer archivo actual" onClick={() => { const original = starterFiles.find((file) => file.id === activeFile.id); if (original) updateActiveCode(original.code); else updateActiveCode('') }}><RotateCcw aria-hidden="true" /></Button>}</div>
          </div>
          <div className="editor-wrap">
            <CodeEditor
              key={`${activeFile.id}-${displayLanguage}-${historicalView?.id ?? 'current'}`}
              height="100%"
              language={displayLanguage === 'python' ? 'python' : 'javascript'}
              value={displayCode}
              onChange={(value) => updateActiveCode(value ?? '')}
              onMount={handleEditorMount}
              theme={isDark ? 'codeflow-graphite' : 'vs'}
              options={{ automaticLayout: true, glyphMargin: false, lineNumbers: 'on', lineNumbersMinChars: 3, folding: true, scrollBeyondLastLine: false, wordWrap: 'off', tabSize: displayLanguage === 'python' ? 4 : 2, insertSpaces: true, suggestOnTriggerCharacters: true, quickSuggestions: true, accessibilitySupport: 'auto', readOnly: isRuntimeBusy || Boolean(historicalView) }}
            />
          </div>
          <div className="editor-footer"><span><CircleDot aria-hidden="true" />{displayCode.split('\n').length} líneas</span><span>Sin traza por línea</span><span>UTF-8</span><span>{displayLanguage === 'python' ? 'Spaces: 4' : 'Spaces: 2'}</span></div>
        </section>

        <section className={`diagram-pane workspace-panel ${mobilePane === 'diagram' ? 'mobile-active' : ''}`} aria-label="Diagrama del código">
          <div className="panel-titlebar diagram-titlebar">
            <div className="panel-title"><GitBranch aria-hidden="true" /><span>FLUJO</span><span className="node-count">{graph.nodes.length} nodos</span></div>
            <div className="diagram-actions"><span className="live-indicator"><span />ANÁLISIS ESTÁTICO</span><Button variant="ghost" size="icon-xs" aria-label="Exportar diagrama JSON" title="Exportar diagrama JSON" onClick={exportDiagram}><ArrowDownToLine aria-hidden="true" /></Button></div>
          </div>
          <div className="diagram-body">
            <FlowCanvas graph={graph} manualEdges={manualEdges} activeLine={currentStep?.line ?? null} activeOperationId={currentStep?.operationId ?? null} onSelectNode={openLine} onManualEdgesChange={setManualEdges} onConnectNodes={(count) => setNotice(`Conexiones visuales: ${count}. Las flechas son anotaciones del diagrama.`)} />
          </div>
          <div className="diagram-footer"><span><span className="legend-shape legend-shape--terminator" />Inicio / fin</span><span><span className="legend-shape legend-shape--process" />Proceso</span><span><span className="legend-shape legend-shape--decision" />Decisión</span><span><span className="legend-shape legend-shape--io" />Entrada / salida</span><span><span className="legend-shape legend-shape--connector" />Conector</span><span className="diagram-footer__hint">Arrastra para recorrer</span></div>
        </section>

        <aside className={`inspector-pane workspace-panel ${mobilePane === 'inspector' ? 'mobile-active' : ''}`} aria-label="Inspector">
          <div className="panel-titlebar"><div className="panel-title"><PanelRight aria-hidden="true" /><span>INSPECTOR</span></div><Button variant="ghost" size="icon-xs" aria-label="Limpiar filtro" title="Limpiar filtro" onClick={() => setVariableQuery('')}><X aria-hidden="true" /></Button></div>
          <div className="inspector-tabs" role="tablist" aria-label="Panel del inspector">
            <button role="tab" aria-selected={inspectorTab === 'variables'} className={inspectorTab === 'variables' ? 'is-active' : ''} onClick={() => setInspectorTab('variables')}><Variable aria-hidden="true" /><span>Estado</span></button>
            <button role="tab" aria-selected={inspectorTab === 'stack'} className={inspectorTab === 'stack' ? 'is-active' : ''} onClick={() => setInspectorTab('stack')}><ListTree aria-hidden="true" /><span>Pila</span></button>
            <button role="tab" aria-selected={inspectorTab === 'history'} className={inspectorTab === 'history' ? 'is-active' : ''} onClick={() => setInspectorTab('history')}><History aria-hidden="true" /><span>Historial</span></button>
          </div>
          <div className="inspector-content">
            {inspectorTab === 'variables' && <>
              <div className="inspect-context"><span className={`status-badge status-badge--${status}`}>{status === 'running' ? 'EN EJECUCIÓN' : status === 'loading' ? 'CREANDO VM' : status === 'error' ? 'ERROR' : status === 'stopped' ? 'DETENIDO' : status === 'paused' ? 'PAUSADO' : status === 'complete' ? 'COMPLETADO' : 'EN ESPERA'}</span><span>{currentStep ? `Línea ${currentStep.line}` : 'Sin paso activo'}</span></div>
              {currentStep?.operationId && currentStep.operationValue !== undefined && <div className="operation-value-card"><span>RESULTADO DE OPERACIÓN</span>{activeOperation?.data.expression && <code>{activeOperation.data.expression}</code>}<pre>{formatValue(currentStep.operationValue)}</pre></div>}
              <label className="variable-search"><Search aria-hidden="true" /><input value={variableQuery} onChange={(event) => setVariableQuery(event.target.value)} placeholder="Buscar variable..." aria-label="Buscar variables" /></label>
              {visibleVariables.length ? <div className="variable-list" role="list" aria-label="Variables del paso actual">
                {visibleVariables.map(([name, value]) => <div className="variable-card" role="listitem" key={name}><div className="variable-card__top"><span className="variable-name">{name}</span><span className={`value-type value-type--${valueKind(value)}`}>{valueKind(value)}</span></div><pre className="variable-value">{formatValue(value)}</pre></div>)}
              </div> : <div className="inspector-empty"><Variable aria-hidden="true" /><strong>{trace.length ? 'Sin variables visibles' : 'Estado vacío'}</strong><span>{trace.length ? 'Este paso no tiene variables locales.' : 'La salida aparece en Consola; esta versión no captura variables ni pila de llamadas.'}</span></div>}
              {currentStep?.returnValue !== undefined && <div className="return-value-card"><span>VALOR DE RETORNO</span><pre>{formatValue(currentStep.returnValue)}</pre></div>}
              {currentStep && <div className="memory-estimate"><span>Huella lógica del snapshot</span><strong>{formatBytes(new TextEncoder().encode(JSON.stringify(currentStep.locals)).length)}</strong><small>Estimación serializada, no uso real del heap.</small></div>}
              <div className="inspector-footnote"><span className="inspector-pulse" />Sin valores dinámicos · análisis estático</div>
            </>}
            {inspectorTab === 'stack' && <>
              <div className="inspect-section-title">Pila de llamadas <span>{currentStep?.stack.length ?? 0}</span></div>
              {currentStep?.stack.length ? <div className="call-stack" role="list">{[...currentStep.stack].reverse().map((name, index) => <div className={`stack-row ${index === 0 ? 'is-current' : ''}`} role="listitem" key={`${name}-${index}`}><span className="stack-index">{String(index + 1).padStart(2, '0')}</span><Braces aria-hidden="true" /><span>{name}</span>{index === 0 && <span className="stack-current">actual</span>}</div>)}</div> : <div className="inspector-empty"><ListTree aria-hidden="true" /><strong>Sin traza de llamadas</strong><span>El runner ejecuta el archivo completo sin instrumentar la pila.</span></div>}
              <div className="runtime-note"><strong>Entorno:</strong> Vercel Sandbox<br /><strong>Red:</strong> bloqueada</div>
            </>}
            {inspectorTab === 'history' && <>
              <div className="history-heading"><span>Últimas ejecuciones</span><span>{snapshots.length}/8</span></div>
              <p className="history-instructions">Se guardan hasta ocho salidas en esta pestaña. No se capturan variables ni snapshots de pasos.</p>
              <div className="history-list">
                {snapshots.length ? snapshots.map((snapshot, index) => <div className={`history-card ${selectedSnapshots.includes(snapshot.id) ? 'is-compared' : ''}`} key={snapshot.id}>
                  <button type="button" className="history-card__open" onClick={() => selectSnapshot(snapshot)} aria-label={`Abrir ejecución ${index + 1}`} disabled={isRuntimeBusy}>
                    <span className="history-card__index">{String(snapshots.length - index).padStart(2, '0')}</span><span className="history-card__details"><strong>{snapshot.fileName.split('/').at(-1)}</strong><span>{new Date(snapshot.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })} · {snapshot.output.length} bloques de salida</span></span><ArrowRight aria-hidden="true" />
                  </button>
                  <button type="button" className="history-compare" onClick={() => toggleSnapshotSelection(snapshot.id)} aria-label={`${selectedSnapshots.includes(snapshot.id) ? 'Quitar' : 'Comparar'} ejecución ${index + 1}`} aria-pressed={selectedSnapshots.includes(snapshot.id)}><Check aria-hidden="true" /></button>
                </div>) : <div className="inspector-empty"><Clock3 aria-hidden="true" /><strong>Sin ejecuciones todavía</strong><span>Ejecuta el archivo para guardar su salida en este historial local.</span></div>}
              </div>
              {comparedSnapshots.length === 2 && <SnapshotComparison snapshots={comparedSnapshots} />}
            </>}
          </div>
          {selectedNode && <div className="node-inspector"><div className="node-inspector__title"><span>NODO SELECCIONADO</span><button type="button" aria-label="Cerrar inspector de nodo" onClick={() => setSelectedNodeId(null)}><X aria-hidden="true" /></button></div><div className="node-inspector__name">{selectedNode.data.label}</div><div className="node-inspector__meta">Línea {selectedNode.data.line} · {selectedNode.data.detail.split(' · ')[0]}</div><textarea aria-label="Editar línea de origen" value={sourceEdit} onChange={(event) => setSourceEdit(event.target.value)} rows={2} />{historicalView ? <p className="historical-source-note">Este snapshot es de solo lectura.</p> : (activeFile.code.split('\n')[selectedNode.data.line - 1] ?? '') !== sourceLineOriginal && <div className="source-conflict" role="alert"><span>El editor modificó esta línea desde que abriste el nodo.</span><Button variant="ghost" size="sm" onClick={() => { const currentLine = activeFile.code.split('\n')[selectedNode.data.line - 1] ?? ''; setSourceLineOriginal(currentLine); setSourceEdit(currentLine) }}>Cargar línea actual</Button></div>}<Button variant="secondary" size="sm" onClick={applySourceEdit} disabled={Boolean(historicalView)}><Check data-icon="inline-start" aria-hidden="true" />Aplicar al código</Button></div>}
        </aside>
      </div>

      <section className="bottom-dock" aria-label="Consola y reproducción">
        <div className="dock-topline">
          <div className="dock-tabs" role="tablist" aria-label="Salida del programa">
            <button role="tab" aria-selected={bottomTab === 'console'} className={bottomTab === 'console' ? 'is-active' : ''} onClick={() => setBottomTab('console')}><Terminal aria-hidden="true" />Consola<span className="dock-count">{logs.length}</span></button>
            <button role="tab" aria-selected={bottomTab === 'trace'} className={bottomTab === 'trace' ? 'is-active' : ''} onClick={() => setBottomTab('trace')}><Activity aria-hidden="true" />Reproducción<span className="dock-count">{trace.length}</span></button>
          </div>
          <div className="dock-actions">
            {notice && <span className="run-notice" title={notice}><span className={`notice-dot notice-dot--${status}`} />{notice}</span>}
            {bottomTab === 'console' ? <Button variant="ghost" size="icon-xs" aria-label="Limpiar consola" title="Limpiar consola" onClick={clearConsole}><Trash2 aria-hidden="true" /></Button> : <>
              <label className="speed-control"><span>Velocidad</span><input type="range" min="0.5" max="2.5" step="0.5" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="Velocidad de reproducción" disabled={!trace.length} /><span>{speed}×</span></label>
              <div className="step-controls">
                <Button variant="ghost" size="icon-xs" aria-label="Primer paso" title="Primer paso" disabled={!trace.length} onClick={() => { setIsPlaying(false); setStatus('paused'); setActiveStep(0) }}><SkipBack aria-hidden="true" /></Button>
                <Button variant="ghost" size="icon-xs" aria-label="Paso anterior" title="Paso anterior" disabled={!trace.length || activeStep <= 0} onClick={() => stepBy(-1)}><ArrowLeft aria-hidden="true" /></Button>
                <Button variant="ghost" size="icon-xs" className="playback-toggle" aria-label={isPlaying ? 'Pausar reproducción' : 'Reproducir pasos'} title={isPlaying ? 'Pausar' : 'Reproducir'} disabled={!trace.length || status === 'running' || status === 'loading'} onClick={togglePlayback}>{isPlaying ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}</Button>
                <Button variant="ghost" size="icon-xs" aria-label="Paso siguiente" title="Paso siguiente" disabled={!trace.length || activeStep >= trace.length - 1} onClick={() => stepBy(1)}><ArrowRight aria-hidden="true" /></Button>
                <Button variant="ghost" size="icon-xs" aria-label="Último paso" title="Último paso" disabled={!trace.length} onClick={() => { setIsPlaying(false); setStatus('paused'); setActiveStep(trace.length - 1) }}><SkipForward aria-hidden="true" /></Button>
              </div>
            </>}
          </div>
        </div>
        {bottomTab === 'console' ? <div className="console-body" role="log" aria-live="polite" aria-label="Salida de consola">
          {logs.length ? logs.map((entry, index) => <div className={`console-line ${entry.stream === 'stderr' ? 'console-line--error' : ''}`} key={`${index}-${entry.stream}`}><span className="console-prompt">{entry.stream === 'stderr' ? '!' : '›'}</span><span>{entry.text}</span></div>) : status === 'complete' ? <div className="console-empty"><Terminal aria-hidden="true" /> Ejecución completada sin salida.</div> : <div className="console-empty"><Terminal aria-hidden="true" /> Ejecuta con <kbd>⌘ Enter</kbd> o el botón. Cada proceso corre en una microVM efímera, sin acceso a red.</div>}
        </div> : <div className="trace-body">
          <input className="trace-scrubber" type="range" min={0} max={Math.max(trace.length - 1, 0)} step={1} value={Math.max(activeStep, 0)} disabled={!trace.length || isRuntimeBusy} aria-label="Buscar paso de ejecución" aria-valuetext={currentStep ? `Paso ${activeStep + 1} de ${trace.length} · línea ${currentStep.line}` : 'Sin pasos registrados'} onChange={(event) => { setIsPlaying(false); setStatus('paused'); setActiveStep(Number(event.currentTarget.value)) }} />
          <div className="trace-summary"><span className="trace-summary__step">{trace.length ? `PASO ${String(Math.max(activeStep + 1, 1)).padStart(2, '0')} / ${String(trace.length).padStart(2, '0')}` : 'SIN REGISTRO'}</span><span className="trace-summary__line">{currentStep ? `Línea ${currentStep.line} · ${displayFileName}` : 'El runner no captura pasos por línea'}</span><span className="trace-summary__origin">{currentStep?.operationId ? 'resultado de operación' : 'sin instrumentación de línea'}</span></div>
          {visibleTrace.length > 0 && <div className="trace-ticks" aria-label="Pasos capturados">{visibleTrace.map(({ step, index }) => <button key={step.id} type="button" aria-label={step.operationId ? `Ir a la operación ${step.id}, línea ${step.line}` : `Ir al paso ${step.id}, línea ${step.line}`} title={step.operationId ? `Operación ${step.id} · línea ${step.line}` : `Paso ${step.id} · línea ${step.line}`} className={`trace-tick ${index === activeStep ? 'is-active' : ''}`} onClick={() => { setIsPlaying(false); setStatus('paused'); setActiveStep(index) }} />)}</div>}
        </div>}
      </section>

      <nav className="mobile-nav" aria-label="Vistas del editor">
        <button type="button" className={mobilePane === 'editor' ? 'is-active' : ''} onClick={() => setMobilePane('editor')}><Code2 aria-hidden="true" />Código</button>
        <button type="button" className={mobilePane === 'diagram' ? 'is-active' : ''} onClick={() => setMobilePane('diagram')}><GitBranch aria-hidden="true" />Flujo</button>
        <button type="button" className={mobilePane === 'inspector' ? 'is-active' : ''} onClick={() => setMobilePane('inspector')}><PanelRight aria-hidden="true" />Inspector</button>
      </nav>

      <footer className="statusbar"><span><span className={`statusbar-dot statusbar-dot--${status}`} />{status === 'loading' || status === 'running' ? 'Ejecutando en microVM' : status === 'error' ? 'Error de ejecución' : status === 'stopped' ? 'Ejecución detenida' : status === 'complete' ? 'Ejecución completada' : 'Runtime aislado'}</span><span>Sin red · 8 s · salida 16 KB máx.</span><span>{graph.nodes.length} símbolos de flujo</span><span className="statusbar-right">{displayLanguage === 'python' ? 'Python · Lezer' : 'JavaScript · Babel AST'}<span>·</span> UTF-8</span></footer>
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
    </main>
  )
}

function SnapshotComparison({ snapshots }: { snapshots: RunSnapshot[] }) {
  const [left, right] = snapshots
  const formatOutput = (snapshot: RunSnapshot) => snapshot.output.map((entry) => `[${entry.stream}] ${entry.text}`).join('')

  return <div className="snapshot-comparison">
    <div className="snapshot-comparison__heading"><Copy aria-hidden="true" />Comparación de salidas</div>
    <div className="snapshot-comparison__files"><span>{left.fileName.split('/').at(-1)}</span><ArrowRight aria-hidden="true" /><span>{right.fileName.split('/').at(-1)}</span></div>
    <div className="execution-output-comparison">
      <pre>{formatOutput(left) || 'Sin salida'}</pre>
      <ArrowRight aria-hidden="true" />
      <pre>{formatOutput(right) || 'Sin salida'}</pre>
    </div>
  </div>
}
