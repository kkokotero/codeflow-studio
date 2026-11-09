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
import { runtimeAdapters } from '@/lib/runtime-adapters'
import type { CodeFile, Language, RunSnapshot, RunStatus, RuntimeMessage, SafeValue, TraceEntry } from '@/lib/codeflow-types'

const CodeEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="editor-loading"><LoaderCircle className="spin" aria-hidden="true" /> Preparando el editor</div>,
})

const languageNames: Record<Language, string> = { javascript: 'JavaScript', python: 'Python' }
const runtimeNames: Record<Language, string> = { javascript: runtimeAdapters.javascript.label, python: runtimeAdapters.python.label }

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
  const [logs, setLogs] = useState<string[]>([])
  const [snapshots, setSnapshots] = useState<RunSnapshot[]>([])
  const [historicalView, setHistoricalView] = useState<RunSnapshot | null>(null)
  const [selectedSnapshots, setSelectedSnapshots] = useState<string[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [breakpoints, setBreakpoints] = useState<number[]>([])
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
  const [notice, setNotice] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [runtimeReady, setRuntimeReady] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const decorationIdsRef = useRef<string[]>([])
  const traceBufferRef = useRef<TraceEntry[]>([])
  const logBufferRef = useRef<string[]>([])
  const runFailedRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileSearchRef = useRef<HTMLInputElement>(null)
  const statusRef = useRef(status)

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

  useEffect(() => { statusRef.current = status }, [status])

  useEffect(() => {
    if (status !== 'complete' || !isPlaying || trace.length < 2) return
    const interval = window.setInterval(() => {
      setActiveStep((current) => {
        const next = Math.min(current + 1, trace.length - 1)
        const upcoming = trace[next]
        if (upcoming && breakpoints.includes(upcoming.line)) {
          setIsPlaying(false)
          setStatus('paused')
          setNotice(`Reproducción detenida en el punto de pausa · línea ${upcoming.line}`)
        } else if (next >= trace.length - 1) {
          setIsPlaying(false)
        }
        return next
      })
    }, Math.max(160, 720 / speed))
    return () => window.clearInterval(interval)
  }, [breakpoints, isPlaying, speed, status, trace])

  useEffect(() => {
    if (activeStep >= 0 && trace[activeStep]) {
      const line = trace[activeStep].line
      editorRef.current?.revealLineInCenter(line)
      editorRef.current?.setPosition({ lineNumber: line, column: 1 })
    }
  }, [activeStep, trace])

  useEffect(() => {
    if (!editorRef.current) return
    const decorations: Parameters<Parameters<OnMount>[0]['deltaDecorations']>[1] = [
          
          ...breakpoints.map((line) => ({
            range: { startLineNumber: line, endLineNumber: line, startColumn: 1, endColumn: 1 },
            options: { isWholeLine: false, glyphMarginClassName: 'codeflow-breakpoint-glyph', glyphMarginHoverMessage: { value: 'Punto de pausa · detiene la reproducción del último registro' } },
          })),
          ...(currentStep ? [{ range: { startLineNumber: currentStep.line, endLineNumber: currentStep.line, startColumn: 1, endColumn: 1 }, options: { isWholeLine: true, className: 'codeflow-active-line' } }] : []),
        ]
    decorationIdsRef.current = editorRef.current.deltaDecorations(decorationIdsRef.current, decorations)
  }, [breakpoints, activeFileId, currentStep])

  useEffect(() => () => {
    workerRef.current?.terminate()
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
  }, [])

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
      editor.updateOptions({ theme: isDark ? 'codeflow-graphite' : 'vs', glyphMargin: true, fontSize: 13, lineHeight: 23, fontFamily: 'Geist Mono, ui-monospace, monospace', padding: { top: 15, bottom: 14 }, minimap: { enabled: false }, scrollBeyondLastLine: false, smoothScrolling: true, renderLineHighlight: 'line', roundedSelection: false, contextmenu: true, bracketPairColorization: { enabled: true } })
      const listener = editor.onMouseDown((event) => {
      if (event.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || !event.target.position) return
      const line = event.target.position.lineNumber
      setBreakpoints((current) => current.includes(line) ? current.filter((item) => item !== line) : [...current, line].sort((a, b) => a - b))
    })
  }, [isDark])

  const finishRun = useCallback((file: CodeFile) => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    workerRef.current?.terminate()
    workerRef.current = null
    const savedSteps = [...traceBufferRef.current]
    const savedLogs = [...logBufferRef.current]
    setTrace(savedSteps)
    setLogs(savedLogs)
    if (!runFailedRef.current && savedSteps.length > 0) {
      const snapshot: RunSnapshot = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, fileId: file.id, fileName: file.name, language: file.language, code: file.code, createdAt: Date.now(), steps: savedSteps, output: savedLogs }
      setSnapshots((current) => [snapshot, ...current].slice(0, 8))
      setActiveStep(0)
      setStatus('complete')
      setIsPlaying(savedSteps.length > 1)
      setNotice(`${savedSteps.length} pasos registrados · valores capturados durante la ejecución`)
    } else if (!runFailedRef.current) {
      setStatus('complete')
      setIsPlaying(false)
      setNotice('Ejecución finalizada · no se registraron instrucciones ejecutables')
    }
    setRuntimeReady(false)
  }, [])

  const runCode = useCallback(() => {
    if (historicalView) return
    if (!activeFile.code.trim()) {
      setStatus('error')
      setNotice('El archivo está vacío. Agrega una instrucción antes de ejecutar.')
      return
    }
    workerRef.current?.terminate()
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    traceBufferRef.current = []
    logBufferRef.current = []
    runFailedRef.current = false
    setTrace([])
    setLogs([])
    setActiveStep(-1)
    setSelectedNodeId(null)
    setIsPlaying(false)
    setRuntimeReady(false)
    setStatus(activeFile.language === 'python' ? 'loading' : 'running')
    setNotice(activeFile.language === 'python' ? 'Iniciando Python en WebAssembly…' : 'Ejecutando en un worker desechable…')

    let worker: Worker
    try {
      worker = runtimeAdapters[activeFile.language].createWorker()
    } catch (error) {
      setStatus('error')
      setNotice(error instanceof Error ? error.message : 'No se pudo iniciar el runtime.')
      return
    }
    workerRef.current = worker
    const adapter = runtimeAdapters[activeFile.language]
    const initialTimeout = adapter.startupLimitMs
    timeoutRef.current = window.setTimeout(() => {
      runFailedRef.current = true
      setStatus('error')
      setNotice('Se agotó el límite de ejecución. El worker se detuvo para mantener el editor receptivo.')
      worker.terminate()
      workerRef.current = null
      setRuntimeReady(false)
    }, initialTimeout)

    worker.onmessage = (event: MessageEvent<RuntimeMessage>) => {
      const message = event.data
      if (message.type === 'ready') {
        setRuntimeReady(true)
        setStatus('running')
        setNotice('Ejecutando y capturando el estado real de cada instrucción…')
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
        timeoutRef.current = window.setTimeout(() => {
          runFailedRef.current = true
          setStatus('error')
          setNotice('Tiempo límite alcanzado. El worker se detuvo; revisa si hay un bucle infinito.')
          worker.terminate()
          workerRef.current = null
          setRuntimeReady(false)
        }, adapter.executionLimitMs)
      } else if ((message.type === 'step' || message.type === 'operation') && typeof message.line === 'number') {
        const entry: TraceEntry = {
          id: traceBufferRef.current.length + 1,
          line: message.line,
          locals: message.locals ?? {},
          stack: message.stack ?? [],
          ...(message.returnValue !== undefined ? { returnValue: message.returnValue } : {}),
          ...(message.operationId ? { operationId: message.operationId } : {}),
          ...(message.operationValue !== undefined ? { operationValue: message.operationValue } : {}),
        }
        traceBufferRef.current.push(entry)
        if (traceBufferRef.current.length <= 2000) {
          setTrace([...traceBufferRef.current])
          setActiveStep(traceBufferRef.current.length - 1)
        }
      } else if (message.type === 'console' && typeof message.value === 'string') {
        logBufferRef.current.push(message.value)
        setLogs([...logBufferRef.current].slice(-500))
      } else if (message.type === 'error') {
        runFailedRef.current = true
        setStatus('error')
        setIsPlaying(false)
        setNotice(message.error ?? 'El programa terminó con un error.')
        logBufferRef.current.push(`Error: ${message.error ?? 'Error de ejecución'}`)
        setLogs([...logBufferRef.current].slice(-500))
      } else if (message.type === 'done') {
        finishRun(activeFile)
      }
    }
    worker.onerror = (event) => {
      runFailedRef.current = true
      setStatus('error')
      setNotice(event.message || 'El worker terminó inesperadamente.')
      finishRun(activeFile)
    }
    worker.postMessage({ code: activeFile.code })
  }, [activeFile, finishRun, historicalView])

  const stopRun = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    setStatus('stopped')
    setRuntimeReady(false)
    setIsPlaying(false)
    setNotice('Ejecución detenida por el usuario.')
  }, [])

  const resetExecution = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    traceBufferRef.current = []
    logBufferRef.current = []
    setTrace([])
    setLogs([])
    setActiveStep(-1)
    setStatus('idle')
    setRuntimeReady(false)
    setIsPlaying(false)
    setNotice('Traza y consola reiniciadas.')
  }, [])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key === 'Enter') {
        event.preventDefault()
        if (statusRef.current !== 'running' && statusRef.current !== 'loading') runCode()
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
    logBufferRef.current = []
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
          {status === 'running' || status === 'loading' ? (
            <Button variant="outline" size="sm" className="stop-button" onClick={stopRun}><Square data-icon="inline-start" aria-hidden="true" />Detener</Button>
          ) : (
            <Button size="sm" className="run-button" onClick={runCode} disabled={Boolean(historicalView)}><Play data-icon="inline-start" aria-hidden="true" />{historicalView ? 'Vista histórica' : 'Ejecutar'} <kbd>⌘ ↵</kbd></Button>
          )}
          {trace.length > 0 && !isRuntimeBusy && !historicalView && <Button variant="ghost" size="icon-sm" aria-label="Reiniciar ejecución" title="Reiniciar traza y consola" onClick={resetExecution}><RotateCcw aria-hidden="true" /></Button>}
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
              <button className={`file-row ${activeFileId === file.id ? 'is-active' : ''}`} type="button" role="listitem" key={file.id} onClick={() => { setHistoricalView(null); setActiveFileId(file.id); setSelectedNodeId(null); setManualEdges([]); setTrace([]); setLogs([]); setActiveStep(-1); setBreakpoints([]); setStatus('idle') }} disabled={isRuntimeBusy}>
                <span className={`file-language file-language--${file.language}`}>{file.language === 'python' ? 'Py' : 'JS'}</span><span className="file-name">{file.name.split('/').at(-1)}</span>{activeFileId === file.id && <span className="file-edited-dot" aria-label="Archivo abierto" />}
              </button>
            ))}
            {filteredFiles.length === 0 && <div className="file-empty">No se encontraron archivos</div>}
          </div>
          <div className="files-actions"><Button variant="ghost" size="sm" onClick={addFile} disabled={isRuntimeBusy || Boolean(historicalView)}><Plus data-icon="inline-start" aria-hidden="true" />Nuevo archivo</Button><Button variant="ghost" size="icon-sm" onClick={() => fileInputRef.current?.click()} aria-label="Importar archivos" title="Importar archivos" disabled={isRuntimeBusy}><Import aria-hidden="true" /></Button></div>
          <div className="sidebar-bottom"><div className="sidebar-bottom__row"><GitBranch aria-hidden="true" /><span>main</span><span className="sidebar-bottom__status">sin guardar</span></div><div className="sidebar-bottom__row"><Activity aria-hidden="true" /><span>Runtime aislado</span><span className="sidebar-bottom__status is-ready">listo</span></div></div>
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
              options={{ automaticLayout: true, glyphMargin: true, lineNumbers: 'on', lineNumbersMinChars: 3, folding: true, scrollBeyondLastLine: false, wordWrap: 'off', tabSize: displayLanguage === 'python' ? 4 : 2, insertSpaces: true, suggestOnTriggerCharacters: true, quickSuggestions: true, accessibilitySupport: 'auto', readOnly: isRuntimeBusy || Boolean(historicalView) }}
            />
          </div>
          <div className="editor-footer"><span><CircleDot aria-hidden="true" />{displayCode.split('\n').length} líneas</span><span>{breakpoints.length} puntos de pausa</span><span>UTF-8</span><span>{displayLanguage === 'python' ? 'Spaces: 4' : 'Spaces: 2'}</span></div>
        </section>

        <section className={`diagram-pane workspace-panel ${mobilePane === 'diagram' ? 'mobile-active' : ''}`} aria-label="Diagrama del código">
          <div className="panel-titlebar diagram-titlebar">
            <div className="panel-title"><GitBranch aria-hidden="true" /><span>FLUJO</span><span className="node-count">{graph.nodes.length} nodos</span></div>
            <div className="diagram-actions"><span className="live-indicator"><span />{trace.length ? 'TRAZA REAL' : 'ESTRUCTURA'}</span><Button variant="ghost" size="icon-xs" aria-label="Exportar diagrama JSON" title="Exportar diagrama JSON" onClick={exportDiagram}><ArrowDownToLine aria-hidden="true" /></Button></div>
          </div>
          <div className="diagram-body">
            <FlowCanvas graph={graph} manualEdges={manualEdges} activeLine={currentStep?.line ?? null} activeOperationId={currentStep?.operationId ?? null} onSelectNode={openLine} onManualEdgesChange={setManualEdges} onConnectNodes={(count) => setNotice(`Conexiones visuales: ${count}. Las flechas son anotaciones del diagrama.`)} />
          </div>
          <div className="diagram-footer"><span><span className="legend-swatch legend-swatch--function" />Función</span><span><span className="legend-swatch legend-swatch--condition" />Condición</span><span><span className="legend-swatch legend-swatch--variable" />Variable</span><span><span className="legend-swatch legend-swatch--operation" />Operación</span><span><span className="legend-swatch legend-swatch--phase" />Fase</span><span className="diagram-footer__hint">Datos y flujo de control</span></div>
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
              <div className="inspect-context"><span className={`status-badge status-badge--${status}`}>{status === 'running' ? 'EN EJECUCIÓN' : status === 'loading' ? 'INICIANDO' : status === 'error' ? 'ERROR' : status === 'paused' ? 'PAUSADO' : trace.length ? 'PASO REGISTRADO' : 'EN ESPERA'}</span><span>{currentStep ? `Línea ${currentStep.line}` : 'Sin paso activo'}</span></div>
              {currentStep?.operationId && currentStep.operationValue !== undefined && <div className="operation-value-card"><span>RESULTADO DE OPERACIÓN</span>{activeOperation?.data.expression && <code>{activeOperation.data.expression}</code>}<pre>{formatValue(currentStep.operationValue)}</pre></div>}
              <label className="variable-search"><Search aria-hidden="true" /><input value={variableQuery} onChange={(event) => setVariableQuery(event.target.value)} placeholder="Buscar variable..." aria-label="Buscar variables" /></label>
              {visibleVariables.length ? <div className="variable-list" role="list" aria-label="Variables del paso actual">
                {visibleVariables.map(([name, value]) => <div className="variable-card" role="listitem" key={name}><div className="variable-card__top"><span className="variable-name">{name}</span><span className={`value-type value-type--${valueKind(value)}`}>{valueKind(value)}</span></div><pre className="variable-value">{formatValue(value)}</pre></div>)}
              </div> : <div className="inspector-empty"><Variable aria-hidden="true" /><strong>{trace.length ? 'Sin variables visibles' : 'Estado vacío'}</strong><span>{trace.length ? 'Este paso no tiene variables locales.' : 'Ejecuta el código para inspeccionar valores reales.'}</span></div>}
              {currentStep?.returnValue !== undefined && <div className="return-value-card"><span>VALOR DE RETORNO</span><pre>{formatValue(currentStep.returnValue)}</pre></div>}
              {currentStep && <div className="memory-estimate"><span>Huella lógica del snapshot</span><strong>{formatBytes(new TextEncoder().encode(JSON.stringify(currentStep.locals)).length)}</strong><small>Estimación serializada, no uso real del heap.</small></div>}
              <div className="inspector-footnote"><span className="inspector-pulse" />Snapshots tomados durante la ejecución</div>
            </>}
            {inspectorTab === 'stack' && <>
              <div className="inspect-section-title">Pila de llamadas <span>{currentStep?.stack.length ?? 0}</span></div>
              {currentStep?.stack.length ? <div className="call-stack" role="list">{[...currentStep.stack].reverse().map((name, index) => <div className={`stack-row ${index === 0 ? 'is-current' : ''}`} role="listitem" key={`${name}-${index}`}><span className="stack-index">{String(index + 1).padStart(2, '0')}</span><Braces aria-hidden="true" /><span>{name}</span>{index === 0 && <span className="stack-current">actual</span>}</div>)}</div> : <div className="inspector-empty"><ListTree aria-hidden="true" /><strong>Sin llamadas activas</strong><span>La pila aparece en cada paso registrado.</span></div>}
              <div className="runtime-note"><strong>Runtime:</strong> {runtimeNames[displayLanguage]}<br /><strong>Sesión:</strong> aislada en el navegador</div>
            </>}
            {inspectorTab === 'history' && <>
              <div className="history-heading"><span>Últimas ejecuciones</span><span>{snapshots.length}/8</span></div>
              <p className="history-instructions">Selecciona una ejecución para restaurar su estado o marca dos para comparar escenarios.</p>
              <div className="history-list">
                {snapshots.length ? snapshots.map((snapshot, index) => <div className={`history-card ${selectedSnapshots.includes(snapshot.id) ? 'is-compared' : ''}`} key={snapshot.id}>
                  <button type="button" className="history-card__open" onClick={() => selectSnapshot(snapshot)} aria-label={`Abrir ejecución ${index + 1}`} disabled={isRuntimeBusy}>
                    <span className="history-card__index">{String(snapshots.length - index).padStart(2, '0')}</span><span className="history-card__details"><strong>{snapshot.fileName.split('/').at(-1)}</strong><span>{new Date(snapshot.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })} · {snapshot.steps.length} pasos</span></span><ArrowRight aria-hidden="true" />
                  </button>
                  <button type="button" className="history-compare" onClick={() => toggleSnapshotSelection(snapshot.id)} aria-label={`${selectedSnapshots.includes(snapshot.id) ? 'Quitar' : 'Comparar'} ejecución ${index + 1}`} aria-pressed={selectedSnapshots.includes(snapshot.id)}><Check aria-hidden="true" /></button>
                </div>) : <div className="inspector-empty"><Clock3 aria-hidden="true" /><strong>Aún no hay ejecuciones</strong><span>Ejecuta el programa para crear el primer snapshot.</span></div>}
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
              <label className="speed-control"><span>Velocidad</span><input type="range" min="0.5" max="2.5" step="0.5" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="Velocidad de reproducción" /><span>{speed}×</span></label>
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
          {logs.length ? logs.map((line, index) => <div className={`console-line ${line.startsWith('Error:') ? 'console-line--error' : ''}`} key={`${index}-${line}`}><span className="console-prompt">›</span><span>{line}</span></div>) : <div className="console-empty"><span>$</span> La salida de <code>console.log</code> y <code>print</code> aparecerá aquí.</div>}
        </div> : <div className="trace-body">
          <input className="trace-scrubber" type="range" min={0} max={Math.max(trace.length - 1, 0)} step={1} value={Math.max(activeStep, 0)} disabled={!trace.length || isRuntimeBusy} aria-label="Buscar paso de ejecución" aria-valuetext={currentStep ? `Paso ${activeStep + 1} de ${trace.length} · línea ${currentStep.line}` : 'Sin pasos registrados'} onChange={(event) => { setIsPlaying(false); setStatus('paused'); setActiveStep(Number(event.currentTarget.value)) }} />
          <div className="trace-summary"><span className="trace-summary__step">{trace.length ? `PASO ${String(Math.max(activeStep + 1, 1)).padStart(2, '0')} / ${String(trace.length).padStart(2, '0')}` : 'SIN REGISTRO'}</span><span className="trace-summary__line">{currentStep ? `Línea ${currentStep.line} · ${displayFileName}` : status === 'loading' ? 'Cargando runtime…' : 'Ejecuta el programa para registrar pasos'}</span><span className="trace-summary__origin">{currentStep?.operationId ? 'resultado de operación' : trace.length ? 'valores reales · captura instrumentada' : 'instrumentación AST'}</span></div>
          {visibleTrace.length > 0 && <div className="trace-ticks" aria-label="Pasos capturados">{visibleTrace.map(({ step, index }) => <button key={step.id} type="button" aria-label={step.operationId ? `Ir a la operación ${step.id}, línea ${step.line}` : `Ir al paso ${step.id}, línea ${step.line}`} title={step.operationId ? `Operación ${step.id} · línea ${step.line}` : `Paso ${step.id} · línea ${step.line}`} className={`trace-tick ${index === activeStep ? 'is-active' : ''} ${breakpoints.includes(step.line) ? 'has-breakpoint' : ''}`} onClick={() => { setIsPlaying(false); setStatus('paused'); setActiveStep(index) }} />)}</div>}
        </div>}
      </section>

      <nav className="mobile-nav" aria-label="Vistas del editor">
        <button type="button" className={mobilePane === 'editor' ? 'is-active' : ''} onClick={() => setMobilePane('editor')}><Code2 aria-hidden="true" />Código</button>
        <button type="button" className={mobilePane === 'diagram' ? 'is-active' : ''} onClick={() => setMobilePane('diagram')}><GitBranch aria-hidden="true" />Flujo</button>
        <button type="button" className={mobilePane === 'inspector' ? 'is-active' : ''} onClick={() => setMobilePane('inspector')}><PanelRight aria-hidden="true" />Inspector</button>
      </nav>

      <footer className="statusbar"><span><span className={`statusbar-dot statusbar-dot--${status}`} />{status === 'running' ? 'ejecutando' : status === 'loading' ? 'iniciando runtime' : status === 'error' ? 'ejecución fallida' : status === 'paused' ? 'reproducción pausada' : status === 'stopped' ? 'detenido' : 'listo'}</span><span>{runtimeReady ? 'worker activo' : 'worker aislado'}</span><span>{graph.nodes.length} elementos estructurales</span><span className="statusbar-right">{displayLanguage === 'python' ? 'Python 3 · Pyodide' : 'JavaScript · Babel AST'}<span>·</span> UTF-8</span></footer>
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
    </main>
  )
}

function SnapshotComparison({ snapshots }: { snapshots: RunSnapshot[] }) {
  const [left, right] = snapshots
  const leftLocals = left.steps.at(-1)?.locals ?? {}
  const rightLocals = right.steps.at(-1)?.locals ?? {}
  const allNames = [...new Set([...Object.keys(leftLocals), ...Object.keys(rightLocals)])].sort()
  const differences = allNames.filter((name) => JSON.stringify(leftLocals[name]) !== JSON.stringify(rightLocals[name]))
  return <div className="snapshot-comparison"><div className="snapshot-comparison__heading"><Copy aria-hidden="true" />Comparación de escenarios</div><div className="snapshot-comparison__files"><span>{left.fileName.split('/').at(-1)}</span><ArrowRight aria-hidden="true" /><span>{right.fileName.split('/').at(-1)}</span></div>{differences.length ? differences.map((name) => <div className="diff-row" key={name}><span>{name}</span><code>{formatValue(leftLocals[name] ?? null)}</code><ArrowRight aria-hidden="true" /><code>{formatValue(rightLocals[name] ?? null)}</code></div>) : <div className="comparison-empty">Los valores finales coinciden en las variables observadas.</div>}</div>
}
