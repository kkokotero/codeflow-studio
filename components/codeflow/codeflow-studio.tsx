'use client'

import dynamic from 'next/dynamic'
import type { OnMount } from '@monaco-editor/react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { LoaderCircle, Search, X, type LucideIcon } from 'lucide-react'

import { APP_ICONS, NODE_ICONS } from '@/components/codeflow/app-icons'
import { AchievementsView } from '@/components/codeflow/achievements-view'
import { AppearancePanel, useMaterialTheme } from '@/components/codeflow/appearance-menu'
import { ConsolePanel } from '@/components/codeflow/console-panel'
import { DiagramExportDialog, ProjectExportDialog } from '@/components/codeflow/export-dialogs'
import { FileTree, type FileTreeActions } from '@/components/codeflow/file-tree'
import { FlowCanvas } from '@/components/codeflow/flow-canvas'
import { FlowNodeEditor } from '@/components/codeflow/flow-node-editor'
import { HelpDialog } from '@/components/codeflow/help-dialog'
import { HomeView } from '@/components/codeflow/home-view'
import { NODE_LABELS, OPERATION_LABELS } from '@/components/codeflow/node-kinds'
import {
  ConfirmDialog,
  FolderPickerDialog,
  NewFileDialog,
  NameDialog,
  type FolderOption,
} from '@/components/codeflow/prompt-dialog'
import { ResizeHandle, usePersistentState } from '@/components/codeflow/resize-handle'
import { Button } from '@/components/ui/button'
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import {
  ACHIEVEMENTS,
  createAchievementProfile,
  isAchievementProfile,
  migrateAchievementProfile,
  recordAchievementActivity,
  type AchievementActivity,
  type AchievementDefinition,
} from '@/lib/achievements'
import { starterFiles } from '@/lib/codeflow-examples'
import type { CodeFile, ExecutionOutput, FlowCardEdge, Language, RunSnapshot, RunStatus } from '@/lib/codeflow-types'
import { analyzeCode } from '@/lib/diagram'
import {
  LANGUAGE_DEFINITIONS,
  SUPPORTED_LANGUAGES,
  acceptedFileExtensions,
  getLanguageDefinition,
  isLanguage,
  languageFromFileName,
} from '@/lib/languages'
import { EXECUTION_LIMIT_NOTICE, MAX_EXECUTION_OUTPUT_BYTES, MAX_EXECUTION_SOURCE_BYTES, MAX_EXECUTION_TIME_MS } from '@/lib/runtime-safety'
import {
  createEmptyState,
  createFile,
  createFolder,
  createProject,
  deleteFile as deleteStoredFile,
  deleteFolder as deleteStoredFolder,
  getActiveProject,
  loadStorage,
  moveFile as moveStoredFile,
  removeProject,
  renameFile as renameStoredFile,
  renameFolder as renameStoredFolder,
  saveStorage,
  setActiveFile,
  setActiveProject,
  updateFileCode,
  updateFileMeta,
  updateProjectName,
  type Folder,
  type Project,
  type StorageState,
} from '@/lib/storage'

const CodeEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="cf-editor__loading"><LoaderCircle className="cf-spin" aria-hidden="true" /> Preparando el editor</div>,
})

const achievementStorageKey = 'codeflow-achievements-v1'
const layoutStorageKey = 'codeflow-layout-v1'

type MonacoInstance = Parameters<OnMount>[1]
type InspectorTab = 'symbols' | 'history'
type MobilePane = 'files' | 'editor' | 'diagram' | 'inspector'
type View = 'home' | 'studio' | 'achievements'
/** Secciones del estudio que se pueden plegar por completo. */
type SectionId = 'files' | 'editor' | 'diagram' | 'inspector' | 'console'

const SECTION_LABELS: Record<SectionId, string> = {
  files: 'el explorador',
  editor: 'el editor',
  diagram: 'el diagrama',
  inspector: 'el inspector',
  console: 'la consola',
}

const SECTION_ICONS: Record<SectionId, LucideIcon> = {
  files: APP_ICONS.files,
  editor: APP_ICONS.code,
  diagram: APP_ICONS.flow,
  inspector: APP_ICONS.inspector,
  console: APP_ICONS.console,
}

const SECTION_ORDER: SectionId[] = ['files', 'editor', 'diagram', 'inspector', 'console']

interface LayoutState {
  files: number
  editor: number
  inspector: number
  console: number
  expanded: string[]
  consoleCollapsed: boolean
  inspectorTab: InspectorTab
  view: View
  /** Secciones plegadas por completo: su icono queda en la barra para volver a abrirlas. */
  closedSections: SectionId[]
}

const DEFAULT_LAYOUT: LayoutState = {
  files: 240,
  editor: 520,
  inspector: 268,
  console: 158,
  expanded: [],
  consoleCollapsed: false,
  inspectorTab: 'symbols',
  view: 'home',
  closedSections: [],
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'new-file'; folderId: string | null }
  | { kind: 'new-folder'; parentId: string | null }
  | { kind: 'new-project' }
  | { kind: 'rename-file'; file: CodeFile }
  | { kind: 'rename-folder'; folder: Folder }
  | { kind: 'rename-project'; project: Project }
  | { kind: 'move-file'; file: CodeFile }
  | { kind: 'delete-file'; file: CodeFile }
  | { kind: 'delete-folder'; folder: Folder }
  | { kind: 'delete-project'; project: Project }
  | { kind: 'export-diagram' }
  | { kind: 'export-project'; project: Project | null }

function getExtension(name: string): Language {
  return languageFromFileName(name) ?? 'javascript'
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'proyecto'
}

function baseName(path: string): string {
  return path.split('/').at(-1) ?? path
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Publica los temas de Monaco a partir de los roles de color activos, de modo
 * que el editor y la interfaz compartan la misma paleta.
 */
function defineEditorThemes(monaco: MonacoInstance, isDark: boolean) {
  const styles = getComputedStyle(document.documentElement)
  // Monaco exige el color de los tokens sin almohadilla y el de los fondos con ella.
  const token = (name: string, fallback: string) => {
    const value = styles.getPropertyValue(name).trim().replace(/^#/, '')
    return /^[0-9a-f]{6}$/i.test(value) ? value : fallback
  }
  const color = (name: string, fallback: string) => {
    const value = styles.getPropertyValue(name).trim()
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
  }
  const rules = [
    { token: 'keyword', foreground: token('--md-sys-color-tertiary', 'c5a6ff') },
    { token: 'string', foreground: token('--md-sys-color-secondary', 'b6d68a') },
    { token: 'number', foreground: token('--md-sys-color-primary', 'e7b56b') },
    { token: 'comment', foreground: token('--md-sys-color-on-surface-variant', '66736e'), fontStyle: 'italic' },
    { token: 'type', foreground: token('--md-sys-color-primary-container', 'a5c99a') },
    { token: 'function', foreground: token('--md-sys-color-primary', 'e7b56b') },
  ]
  const canvas = color('--md-sys-color-surface-container-lowest', '#0e1212')
  const raised = color('--md-sys-color-surface-container-low', '#141a1a')

  monaco.editor.defineTheme('codeflow-graphite', {
    base: 'vs-dark',
    inherit: true,
    rules,
    colors: {
      'editor.background': canvas,
      'editor.foreground': color('--md-sys-color-on-surface', '#dde4e0'),
      'editorLineNumber.foreground': color('--md-sys-color-outline', '#6d7976'),
      'editorLineNumber.activeForeground': color('--md-sys-color-on-surface-variant', '#b4c0bb'),
      'editorCursor.foreground': color('--md-sys-color-primary', '#bdff82'),
      'editor.selectionBackground': `${color('--md-sys-color-primary', '#bdff82')}44`,
      'editor.lineHighlightBackground': raised,
      'editorGutter.background': canvas,
      'editorIndentGuide.background1': color('--md-sys-color-outline-variant', '#202826'),
    },
  })

  monaco.editor.defineTheme('codeflow-paper', {
    base: 'vs',
    inherit: true,
    rules,
    colors: {
      'editor.background': canvas,
      'editor.foreground': color('--md-sys-color-on-surface', '#1a211c'),
      'editorLineNumber.foreground': color('--md-sys-color-outline', '#727970'),
      'editorLineNumber.activeForeground': color('--md-sys-color-on-surface-variant', '#424a43'),
      'editorCursor.foreground': color('--md-sys-color-primary', '#386b4f'),
      'editor.lineHighlightBackground': raised,
      'editorGutter.background': canvas,
      'editorIndentGuide.background1': color('--md-sys-color-outline-variant', '#c4cbc4'),
    },
  })

  monaco.editor.setTheme(isDark ? 'codeflow-graphite' : 'codeflow-paper')
}

export function CodeflowStudio() {
  const { mode, setMode, seed, setSeed, isDark } = useMaterialTheme()
  const [layout, setLayout] = usePersistentState<LayoutState>(layoutStorageKey, DEFAULT_LAYOUT)
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [storageLoaded, setStorageLoaded] = useState(false)
  const [status, setStatus] = useState<RunStatus>('idle')
  const [logs, setLogs] = useState<ExecutionOutput[]>([])
  const [snapshots, setSnapshots] = useState<RunSnapshot[]>([])
  const [selectedSnapshots, setSelectedSnapshots] = useState<string[]>([])
  const [historicalView, setHistoricalView] = useState<RunSnapshot | null>(null)
  const [manualEdges, setManualEdges] = useState<FlowCardEdge[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [sourceLineOriginal, setSourceLineOriginal] = useState('')
  const [mobilePane, setMobilePane] = useState<MobilePane>('editor')
  const [isImporting, setIsImporting] = useState(false)
  const [fileFilter, setFileFilter] = useState('')
  const [notice, setNotice] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' })
  const [profile, setProfile] = useState<ReturnType<typeof createAchievementProfile> | null>(null)
  const [progressLoaded, setProgressLoaded] = useState(false)
  const [achievementToasts, setAchievementToasts] = useState<AchievementDefinition[]>([])
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<MonacoInstance | null>(null)
  const executionAbortRef = useRef<AbortController | null>(null)
  const decorationIdsRef = useRef<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const fileSearchRef = useRef<HTMLInputElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const previousUnlocksRef = useRef<{ profileId: string; ids: Set<string> } | null>(null)
  const activeProjectIdRef = useRef<string | null>(null)
  const pendingFolderRef = useRef<string | null>(null)
  const pendingProjectRef = useRef<string | null>(null)

  const view = layout.view
  const inspectorTab = layout.inspectorTab
  const consoleCollapsed = layout.consoleCollapsed

  useEffect(() => { activeProjectIdRef.current = activeProjectId }, [activeProjectId])

  const storageState: StorageState = { version: 1, projects, activeProjectId }
  const activeProject = getActiveProject(storageState)
  const files = activeProject?.files ?? []
  const folders = activeProject?.folders ?? []
  const activeFileId = activeProject?.activeFileId ?? null
  const activeFile = files.find((file) => file.id === activeFileId) ?? files[0] ?? null
  const projectName = activeProject?.name ?? 'Proyecto'
  const displayCode = historicalView?.code ?? activeFile?.code ?? ''
  const displayLanguage = historicalView?.language ?? activeFile?.language ?? 'javascript'
  const displayFileName = historicalView?.fileName ?? activeFile?.name ?? ''
  const graph = useMemo(() => analyzeCode(displayCode, displayLanguage), [displayCode, displayLanguage])
  const isRuntimeBusy = status === 'running' || status === 'loading'
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null
  const comparedSnapshots = snapshots.filter((snapshot) => selectedSnapshots.includes(snapshot.id))
  const starterTemplate = activeFile?.templateId
    ? starterFiles.find((file) => file.id === activeFile.templateId) ?? null
    : null
  const unlockedCount = profile ? Object.keys(profile.unlocked).length : 0

  const folderOptions = useMemo<FolderOption[]>(() => {
    const root = folders.find((folder) => folder.parentId === null)
    if (!root) return []
    const options: FolderOption[] = [{ id: root.id, label: root.name, depth: 0 }]
    const walk = (parentId: string, depth: number) => {
      for (const folder of folders.filter((candidate) => candidate.parentId === parentId)) {
        options.push({ id: folder.id, label: folder.name, depth })
        walk(folder.id, depth + 1)
      }
    }
    walk(root.id, 1)
    return options
  }, [folders])

  useEffect(() => {
    let restored: StorageState | null = null
    try {
      restored = loadStorage()
    } catch {
      restored = null
    }
    if (restored?.projects.length) {
      setProjects(restored.projects)
      setActiveProjectId(restored.activeProjectId ?? restored.projects[0].id)
    } else {
      const starter = createProject('Proyecto de ejemplo')
      const rootFolder = starter.folders[0]
      let next: StorageState = { ...createEmptyState(), projects: [starter], activeProjectId: starter.id }
      for (const file of starterFiles) {
        next = createFile(next, starter.id, rootFolder.id, file.name, file.language, file.code, file.id)
      }
      next = setActiveFile(next, starter.id, starterFiles[0].id)
      setProjects(next.projects)
      setActiveProjectId(starter.id)
    }
    setStorageLoaded(true)
  }, [])

  useEffect(() => {
    if (!storageLoaded) return
    const ok = saveStorage(storageState)
    if (!ok) {
      setNotice('No se pudo guardar el proyecto local. Revisa el espacio disponible del navegador.')
    }
  }, [projects, activeProjectId, storageLoaded])

  useEffect(() => {
    let restored: ReturnType<typeof createAchievementProfile> | null = null
    try {
      const saved = window.localStorage.getItem(achievementStorageKey)
      if (saved) {
        const parsed: unknown = JSON.parse(saved)
        if (parsed && typeof parsed === 'object') {
          if ('profile' in parsed && isAchievementProfile(parsed.profile)) {
            restored = migrateAchievementProfile(parsed.profile)
          } else if ('profiles' in parsed && Array.isArray(parsed.profiles)) {
            const candidates = parsed.profiles.filter(isAchievementProfile)
            const activeId = 'activeProfileId' in parsed && typeof parsed.activeProfileId === 'string' ? parsed.activeProfileId : ''
            const chosen = candidates.find((candidate) => candidate.id === activeId) ?? candidates[0]
            if (chosen) restored = migrateAchievementProfile(chosen)
          }
        }
      }
    } catch {
      restored = null
    }
    setProfile(restored ?? createAchievementProfile('Integrante'))
    setProgressLoaded(true)
  }, [])

  useEffect(() => {
    if (!progressLoaded || !profile) return
    try {
      window.localStorage.setItem(achievementStorageKey, JSON.stringify({ version: 2, profile }))
    } catch {
      setNotice('No se pudo guardar el progreso local. Revisa el espacio disponible del navegador.')
    }
  }, [profile, progressLoaded])

  useEffect(() => {
    if (!profile || !progressLoaded) return
    const ids = new Set(Object.keys(profile.unlocked))
    const previous = previousUnlocksRef.current
    if (previous?.profileId === profile.id) {
      const newAchievements = [...ids]
        .filter((id) => !previous.ids.has(id))
        .map((id) => ACHIEVEMENTS.find((item) => item.id === id))
        .filter((achievement): achievement is AchievementDefinition => Boolean(achievement))
      if (newAchievements.length) setAchievementToasts((current) => [...current, ...newAchievements])
    }
    previousUnlocksRef.current = { profileId: profile.id, ids }
  }, [profile, progressLoaded])

  useEffect(() => {
    if (!achievementToasts.length) return
    const timeout = window.setTimeout(() => setAchievementToasts((current) => current.slice(1)), 4_000)
    return () => window.clearTimeout(timeout)
  }, [achievementToasts])

  const recordProgress = useCallback((activity: AchievementActivity) => {
    setProfile((current) => current ? recordAchievementActivity(current, activity).profile : current)
  }, [])

  /** La carpeta recién creada se despliega en cuanto el árbol se vuelve a pintar. */
  useEffect(() => {
    const folderId = pendingFolderRef.current
    if (!folderId) return
    pendingFolderRef.current = null
    setLayout((current) => current.expanded.includes(folderId)
      ? current
      : { ...current, expanded: [...current.expanded, folderId] })
  }, [folders, setLayout])

  const mutateProject = useCallback((mutate: (state: StorageState) => StorageState) => {
    setProjects((current) => {
      const state: StorageState = { version: 1, projects: current, activeProjectId: activeProjectIdRef.current }
      return mutate(state).projects
    })
  }, [])

  const updateLayout = useCallback((patch: Partial<LayoutState>) => {
    setLayout((current) => ({ ...current, ...patch }))
  }, [setLayout])

  const closedSections = useMemo(
    () => (Array.isArray(layout.closedSections) ? layout.closedSections.filter((id): id is SectionId => SECTION_ORDER.includes(id as SectionId)) : []),
    [layout.closedSections],
  )

  const isSectionClosed = useCallback((id: SectionId) => closedSections.includes(id), [closedSections])

  const setSectionClosed = useCallback((id: SectionId, closed: boolean) => {
    setLayout((current) => {
      const currentClosed = Array.isArray(current.closedSections) ? current.closedSections : []
      return {
        ...current,
        closedSections: closed
          ? [...new Set([...currentClosed, id])] as SectionId[]
          : currentClosed.filter((section) => section !== id) as SectionId[],
      }
    })
  }, [setLayout])

  /** Redimensiona una sección y la pliega si se squeeza demasiado. */
  const resizeSection = useCallback((id: 'files' | 'editor' | 'inspector', delta: number, min: number, max: number) => {
    const next = layout[id] + delta
    if (next < min) {
      setSectionClosed(id, true)
      return
    }
    updateLayout({ [id]: clamp(next, min, max) })
  }, [layout, setSectionClosed, updateLayout])

  const resetLayout = useCallback(() => {
    setLayout((current) => ({ ...DEFAULT_LAYOUT, view: current.view, expanded: current.expanded }))
    setNotice('Layout restablecido.')
  }, [setLayout])

  const updateActiveCode = useCallback((code: string) => {
    setHistoricalView(null)
    mutateProject((state) => {
      const project = getActiveProject(state)
      if (!project || project.activeFileId == null) return state
      return updateFileCode(state, project.id, project.activeFileId, code)
    })
    recordProgress({ type: 'edit', code })
  }, [mutateProject, recordProgress])

  /**
   * El tema del editor se deriva de los mismos roles que la interfaz, así que
   * la paleta activa también tiñe el código.
   */
  const applyEditorTheme = useCallback((monaco: MonacoInstance) => {
    try {
      defineEditorThemes(monaco, isDark)
    } catch (error) {
      console.error('[codeflow] no se pudo aplicar el tema del editor', error)
    }
  }, [isDark])

  const openLine = useCallback((nodeId: string) => {
    const node = graph.nodes.find((item) => item.id === nodeId)
    if (!node) return
    setSelectedNodeId(nodeId)
    const sourceLine = displayCode.split('\n')[node.data.line - 1] ?? ''
    setSourceLineOriginal(sourceLine)
    setMobilePane('editor')
    editorRef.current?.revealLineInCenter(node.data.line)
    editorRef.current?.setPosition({ lineNumber: node.data.line, column: 1 })
    editorRef.current?.focus()
  }, [displayCode, graph.nodes])

  const openSymbol = useCallback((nodeId: string) => {
    recordProgress({ type: 'symbol', action: 'navigated' })
    openLine(nodeId)
  }, [openLine, recordProgress])

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    applyEditorTheme(monaco)
    editor.updateOptions({ glyphMargin: false, fontSize: 13, lineHeight: 23, fontFamily: 'Geist Mono, ui-monospace, monospace', padding: { top: 15, bottom: 14 }, minimap: { enabled: false }, scrollBeyondLastLine: false, smoothScrolling: true, renderLineHighlight: 'line', roundedSelection: false, contextmenu: true, bracketPairColorization: { enabled: true } })
  }, [applyEditorTheme])

  useEffect(() => {
    if (monacoRef.current) applyEditorTheme(monacoRef.current)
  }, [applyEditorTheme])

  const runCode = useCallback(async () => {
    if (historicalView || !activeFile) return

    const sourceBytes = new TextEncoder().encode(activeFile.code).byteLength
    if (sourceBytes > MAX_EXECUTION_SOURCE_BYTES) {
      const message = `El código supera el límite de ${Math.round(MAX_EXECUTION_SOURCE_BYTES / 1_000)} KB.`
      setStatus('error')
      setLogs([{ stream: 'stderr', text: message }])
      setNotice(message)
      return
    }

    const controller = new AbortController()
    executionAbortRef.current = controller
    setStatus('loading')
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

      const result = payload as {
        output: ExecutionOutput[]
        exitCode: number
        durationMs: number
        timedOut: boolean
        outputTruncated: boolean
      }
      if (!Array.isArray(result.output) || typeof result.exitCode !== 'number') throw new Error('Respuesta de ejecución no válida.')

      const output = result.output.length ? result.output : result.timedOut
        ? [{ stream: 'stderr' as const, text: `Tiempo límite de ${MAX_EXECUTION_TIME_MS / 1_000} s alcanzado.` }]
        : result.outputTruncated
          ? [{ stream: 'stderr' as const, text: 'La salida superó el límite y el proceso fue detenido.' }]
          : result.exitCode !== 0
            ? [{ stream: 'stderr' as const, text: `El proceso terminó con código ${result.exitCode}.` }]
            : []
      setLogs(output)
      const snapshot: RunSnapshot = {
        id: crypto.randomUUID(),
        fileId: activeFile.id,
        fileName: activeFile.name,
        language: activeFile.language,
        code: activeFile.code,
        createdAt: Date.now(),
        output,
      }
      setSnapshots((current) => [snapshot, ...current].slice(0, 8))
      setSelectedSnapshots([])

      const failed = result.exitCode !== 0 || result.timedOut || result.outputTruncated
      setStatus(failed ? 'error' : 'complete')
      if (failed) recordProgress({ type: 'run-failure' })
      else {
        const executionGraph = analyzeCode(activeFile.code, activeFile.language)
        recordProgress({
          type: 'run-success',
          language: activeFile.language,
          output: output.filter((entry) => entry.stream === 'stdout').map((entry) => entry.text).join('\n'),
          nodeCount: executionGraph.nodes.length,
          nodeKinds: executionGraph.nodes.map((node) => node.data.kind),
          code: activeFile.code,
        })
      }
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
  }, [activeFile, historicalView, recordProgress])

  const cancelExecution = useCallback(() => {
    executionAbortRef.current?.abort()
  }, [])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key === 'Enter') {
        event.preventDefault()
        void runCode()
      } else if (event.key.toLowerCase() === 'p') {
        event.preventDefault()
        fileSearchRef.current?.focus()
      } else if (event.key === '?' || event.key === '/') {
        event.preventDefault()
        setShowHelp(true)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [runCode])

  const openFile = useCallback((fileId: string) => {
    setHistoricalView(null)
    setSelectedNodeId(null)
    setManualEdges([])
    setStatus('idle')
    setLogs([])
    setNotice('')
    mutateProject((state) => {
      const project = getActiveProject(state)
      if (!project) return state
      return setActiveFile(state, project.id, fileId)
    })
    setMobilePane('editor')
  }, [mutateProject])

  const openProject = useCallback((projectId: string) => {
    setProjects((current) => {
      const state: StorageState = { version: 1, projects: current, activeProjectId: projectId }
      return setActiveProject(state, projectId).projects
    })
    setActiveProjectId(projectId)
    setHistoricalView(null)
    setSelectedNodeId(null)
    setManualEdges([])
    setStatus('idle')
    setLogs([])
    setSnapshots([])
    setSelectedSnapshots([])
    setNotice('')
    updateLayout({ view: 'studio' })
  }, [updateLayout])

  /** Quedarse sin proyectos también es una forma válida de trabajar. */
  useEffect(() => {
    if (view !== 'home' || !storageLoaded || projects.length > 0) return
    recordProgress({ type: 'project', action: 'empty' })
  }, [projects.length, recordProgress, storageLoaded, view])

  /** El proyecto recién creado se abre en cuanto la lista se vuelve a pintar. */
  useEffect(() => {
    const projectId = pendingProjectRef.current
    if (!projectId) return
    pendingProjectRef.current = null
    openProject(projectId)
  }, [openProject, projects])

  const changeLanguage = useCallback((language: Language) => {
    if (!activeFile || language === activeFile.language) return
    recordProgress({ type: 'explore', feature: 'language' })
    setHistoricalView(null)
    const extension = getLanguageDefinition(language).extension
    const name = /\.[^./]+$/.test(activeFile.name)
      ? activeFile.name.replace(/\.[^./]+$/, `.${extension}`)
      : `${activeFile.name}.${extension}`
    mutateProject((state) => {
      const project = getActiveProject(state)
      if (!project) return state
      return updateFileMeta(state, project.id, activeFile.id, { language, name })
    })
    setNotice(`Lenguaje cambiado a ${LANGUAGE_DEFINITIONS[language].label}.`)
  }, [activeFile, mutateProject, recordProgress])

  const createNewFile = useCallback((name: string, language: Language, folderId: string | null) => {
    mutateProject((state) => {
      const project = getActiveProject(state)
      if (!project) return state
      const target = folderId ?? project.folders.find((folder) => folder.parentId === null)?.id ?? project.activeFolderId
      return createFile(state, project.id, target, name, language, '')
    })
    setDialog({ kind: 'none' })
    setNotice(`Archivo ${name} creado.`)
    recordProgress({ type: 'explore', feature: 'file' })
  }, [mutateProject, recordProgress])

  const createNewFolder = useCallback((name: string, parentId: string | null) => {
    mutateProject((state) => {
      const project = getActiveProject(state)
      if (!project) return state
      const parent = parentId ?? project.folders.find((folder) => folder.parentId === null)?.id ?? null
      const next = createFolder(state, project.id, name, parent)
      pendingFolderRef.current = next.projects
        .flatMap((item) => item.folders)
        .find((folder) => folder.name === name && folder.parentId === parent)?.id ?? null
      return next
    })
    setDialog({ kind: 'none' })
    setNotice(`Carpeta ${name} creada.`)
    recordProgress({ type: 'organize', action: 'folder-created' })
  }, [mutateProject, recordProgress])

  const renameFile = useCallback((fileId: string, name: string) => {
    mutateProject((state) => {
      const project = getActiveProject(state)
      if (!project) return state
      return renameStoredFile(state, project.id, fileId, name)
    })
    setDialog({ kind: 'none' })
    setNotice(`Archivo renombrado a ${name}.`)
    recordProgress({ type: 'organize', action: 'file-renamed' })
  }, [mutateProject, recordProgress])

  const renameFolder = useCallback((folderId: string, name: string) => {
    mutateProject((state) => {
      const project = getActiveProject(state)
      if (!project) return state
      return renameStoredFolder(state, project.id, folderId, name)
    })
    setDialog({ kind: 'none' })
    setNotice(`Carpeta renombrada a ${name}.`)
    recordProgress({ type: 'organize', action: 'file-renamed' })
  }, [mutateProject, recordProgress])

  const duplicateFile = useCallback((file: CodeFile) => {
    const copyName = file.name.replace(/(\.[^./]+)$/, '-copia$1')
    mutateProject((state) => {
      const project = getActiveProject(state)
      if (!project) return state
      return createFile(state, project.id, file.folderId ?? project.activeFolderId, copyName, file.language, file.code)
    })
    setNotice(`${copyName} duplicado.`)
    recordProgress({ type: 'organize', action: 'file-duplicated' })
  }, [mutateProject, recordProgress])

  const moveFileTo = useCallback((fileId: string, folderId: string | null) => {
    mutateProject((state) => {
      const project = getActiveProject(state)
      if (!project) return state
      return moveStoredFile(state, project.id, fileId, folderId)
    })
    setDialog({ kind: 'none' })
    setNotice('Archivo movido.')
    recordProgress({ type: 'organize', action: 'file-moved' })
  }, [mutateProject, recordProgress])

  const removeFile = useCallback((fileId: string) => {
    if (files.length <= 1) {
      setNotice('Debe quedar al menos un archivo en el proyecto.')
      return
    }
    const removed = files.find((file) => file.id === fileId)
    if (!removed) return
    mutateProject((state) => {
      const project = getActiveProject(state)
      if (!project) return state
      return deleteStoredFile(state, project.id, fileId)
    })
    setHistoricalView(null)
    setSelectedNodeId(null)
    setManualEdges([])
    setStatus('idle')
    setLogs([])
    setNotice(`Archivo ${removed.name} eliminado.`)
  }, [files, mutateProject])

  const removeFolder = useCallback((folderId: string) => {
    mutateProject((state) => {
      const project = getActiveProject(state)
      if (!project) return state
      return deleteStoredFolder(state, project.id, folderId)
    })
    setDialog({ kind: 'none' })
    setNotice('Carpeta eliminada.')
  }, [mutateProject])

  const createProjectNamed = useCallback((name: string) => {
    const project = createProject(name.trim() || 'Proyecto sin título')
    setProjects((current) => [...current, project])
    setActiveProjectId(project.id)
    activeProjectIdRef.current = project.id
    pendingProjectRef.current = project.id
    setDialog({ kind: 'none' })
    setNotice(`Proyecto ${project.name} creado.`)
    recordProgress({ type: 'project', action: 'created' })
  }, [recordProgress])

  const renameProject = useCallback((projectId: string, name: string) => {
    setProjects((current) => {
      const state: StorageState = { version: 1, projects: current, activeProjectId: activeProjectIdRef.current }
      return updateProjectName(state, projectId, name).projects
    })
    setDialog({ kind: 'none' })
    setNotice(`Proyecto renombrado a ${name}.`)
  }, [])

  const removeProjectById = useCallback((projectId: string) => {
    setProjects((current) => {
      const state: StorageState = { version: 1, projects: current, activeProjectId: activeProjectIdRef.current }
      const next = removeProject(state, projectId)
      activeProjectIdRef.current = next.activeProjectId
      setActiveProjectId(next.activeProjectId)
      return next.projects
    })
    setDialog({ kind: 'none' })
    setNotice('Proyecto eliminado.')
    updateLayout({ view: 'home' })
    recordProgress({ type: 'project', action: 'deleted' })
  }, [recordProgress, updateLayout])

  const importFiles = useCallback(async (items: FileList | null) => {
    if (!items?.length) return
    setIsImporting(true)
    try {
      const selectedFiles = Array.from(items)
      if (selectedFiles.length > 50 || selectedFiles.some((item) => item.size > (item.name.endsWith('.codeflow.json') ? 25_000_000 : 2_000_000))) {
        throw new Error('El límite es de 50 archivos; código hasta 2 MB y proyectos CodeFlow hasta 25 MB.')
      }
      const imported: CodeFile[] = []
      const createId = () => `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const cleanName = (name: string) => name.split('/').filter((part) => part && part !== '.' && part !== '..').map((part) => part.replace(/[^\w.-]/g, '-')).join('/') || 'archivo.js'
      for (const item of selectedFiles) {
        const text = await item.text()
        if (/\.codeflow\.json$/i.test(item.name)) {
          const bundle = JSON.parse(text) as { format?: string; version?: number; name?: string; files?: Array<{ name?: unknown; language?: unknown; code?: unknown }> }
          if (bundle.format !== 'codeflow-project' || bundle.version !== 1 || !Array.isArray(bundle.files)) throw new Error('El archivo no es un proyecto CodeFlow válido.')
          if (bundle.files.length > 50) throw new Error('El proyecto contiene más de 50 archivos.')
          for (const entry of bundle.files) {
            if (typeof entry.name !== 'string' || typeof entry.code !== 'string' || !isLanguage(entry.language)) throw new Error('El proyecto contiene un archivo no válido.')
            const name = cleanName(entry.name)
            const detected = languageFromFileName(name)
            const compatible = detected === entry.language
              || (entry.language === 'cpp' && /\.(h|hh|hpp|hxx)$/i.test(name))
              || (entry.language === 'c' && /\.h$/i.test(name))
            if (!compatible) throw new Error(`La extensión de ${name} no coincide con su runtime.`)
            imported.push({ id: createId(), name, language: entry.language, code: entry.code })
          }
        } else if (languageFromFileName(item.name)) {
          imported.push({ id: createId(), name: `imports/${cleanName(item.name)}`, language: getExtension(item.name), code: text })
        }
      }
      if (!imported.length) {
        setNotice('Importa archivos de código compatibles o un proyecto .codeflow.json.')
        return
      }
      if (imported.length > 50) throw new Error('El proyecto contiene más de 50 archivos.')
      setHistoricalView(null)
      mutateProject((state) => {
        const project = getActiveProject(state)
        if (!project) return state
        let next = state
        const target = project.folders.find((folder) => folder.parentId === null)?.id ?? project.activeFolderId
        for (const file of imported) {
          next = createFile(next, project.id, target, file.name, file.language, file.code)
        }
        return next
      })
      setStatus('idle')
      setLogs([])
      setNotice(`${imported.length} archivo${imported.length === 1 ? '' : 's'} importado${imported.length === 1 ? '' : 's'}.`)
      recordProgress({ type: 'explore', feature: 'import' })
    } catch (error) {
      setStatus('error')
      setNotice(error instanceof Error ? error.message : 'No se pudieron importar los archivos.')
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [mutateProject, recordProgress])

  const importProject = useCallback(async (items: FileList | null) => {
    const item = items?.[0]
    if (!item) return
    try {
      const text = await item.text()
      const bundle = JSON.parse(text) as { format?: string; version?: number; name?: string; files?: Array<{ name?: unknown; language?: unknown; code?: unknown }> }
      if (bundle.format !== 'codeflow-project' || bundle.version !== 1 || !Array.isArray(bundle.files)) throw new Error('El archivo no es un proyecto CodeFlow válido.')
      if (bundle.files.length > 50) throw new Error('El proyecto contiene más de 50 archivos.')
      const name = typeof bundle.name === 'string' && bundle.name.trim() ? bundle.name.trim() : item.name.replace(/\.codeflow\.json$/i, '')
      const project = createProject(name)
      let next: StorageState = { ...createEmptyState(), projects: [project], activeProjectId: project.id }
      const rootFolder = project.folders[0]
      for (const entry of bundle.files) {
        if (typeof entry.name !== 'string' || typeof entry.code !== 'string' || !isLanguage(entry.language)) throw new Error('El proyecto contiene un archivo no válido.')
        next = createFile(next, project.id, rootFolder.id, entry.name, entry.language, entry.code)
      }
      setProjects(next.projects)
      setActiveProjectId(project.id)
      activeProjectIdRef.current = project.id
      updateLayout({ view: 'studio' })
      setNotice(`Proyecto ${name} importado.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo importar el proyecto.')
    } finally {
      if (projectInputRef.current) projectInputRef.current.value = ''
    }
  }, [updateLayout])

  const importFolder = useCallback(async (items: FileList | null) => {
    const selected = Array.from(items ?? [])
    if (!selected.length) return
    try {
      const readable = selected.filter((item) => languageFromFileName(item.name))
      if (!readable.length) throw new Error('La carpeta no contiene archivos de código compatibles.')
      if (readable.length > 200) throw new Error('El límite es de 200 archivos por carpeta.')
      const folderName = (readable[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/')[0] || 'Proyecto importado'
      const project = createProject(folderName)
      let next: StorageState = { ...createEmptyState(), projects: [project], activeProjectId: project.id }
      const rootFolder = project.folders[0]
      const folders = new Map<string, string>([[rootFolder.id, rootFolder.id]])
      const ensureFolder = (path: string): string => {
        if (!path) return rootFolder.id
        const existing = folders.get(path)
        if (existing) return existing
        const parentPath = path.split('/').slice(0, -1).join('/')
        const parentId = ensureFolder(parentPath)
        const name = path.split('/').at(-1) ?? path
        const before = next.projects.flatMap((item) => item.folders).length
        next = createFolder(next, project.id, name, parentId)
        const created = next.projects.flatMap((item) => item.folders)
        const id = created[before]?.id ?? rootFolder.id
        folders.set(path, id)
        return id
      }
      for (const item of readable) {
        const relative = (item as File & { webkitRelativePath?: string }).webkitRelativePath ?? item.name
        const segments = relative.split('/')
        const folderPath = segments.slice(1, -1).join('/')
        const folderId = ensureFolder(folderPath)
        const text = await item.text()
        next = createFile(next, project.id, folderId, segments.slice(1).join('/') || item.name, getExtension(item.name), text)
      }
      setProjects(next.projects)
      setActiveProjectId(project.id)
      activeProjectIdRef.current = project.id
      pendingProjectRef.current = project.id
      setNotice(`Carpeta ${folderName} importada: ${readable.length} archivos.`)
      recordProgress({ type: 'explore', feature: 'import' })
      recordProgress({ type: 'organize', action: 'folder-imported' })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo importar la carpeta.')
    } finally {
      if (folderInputRef.current) folderInputRef.current.value = ''
    }
  }, [recordProgress])

  const downloadFile = useCallback((contents: string, filename: string, mime: string) => {
    const blob = new Blob([contents], { type: mime })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [])

  const exportActiveFile = useCallback(() => {
    downloadFile(displayCode, baseName(displayFileName) || 'codigo.js', 'text/plain;charset=utf-8')
    setNotice(`Se exportó ${baseName(displayFileName)}.`)
    recordProgress({ type: 'export', target: 'file' })
  }, [displayCode, displayFileName, downloadFile, recordProgress])

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayCode)
      setNotice('Código copiado al portapapeles.')
    } catch {
      setNotice('No se pudo copiar el código.')
    }
  }, [displayCode])

  const restoreStarter = useCallback(() => {
    if (!starterTemplate || !activeFile) return
    updateActiveCode(starterTemplate.code)
    setNotice(`Se restauró el ejemplo original de ${baseName(activeFile.name)}.`)
    recordProgress({ type: 'reset' })
  }, [activeFile, recordProgress, starterTemplate, updateActiveCode])

  const applySourceEdit = useCallback((nextLine: string) => {
    if (!selectedNode || historicalView || !activeFile) return
    const lines = activeFile.code.split('\n')
    const index = selectedNode.data.line - 1
    if (lines[index] !== sourceLineOriginal) {
      setNotice('Conflicto de edición: la línea cambió en el editor. Recarga la versión actual antes de aplicar.')
      return
    }
    lines[index] = nextLine
    updateActiveCode(lines.join('\n'))
    setSourceLineOriginal(nextLine)
    recordProgress({ type: 'apply-edit' })
    setNotice(`${selectedNode.data.label} → línea ${selectedNode.data.line} sincronizada con el diagrama.`)
  }, [activeFile, historicalView, recordProgress, selectedNode, sourceLineOriginal, updateActiveCode])

  const clearConsole = useCallback(() => {
    setLogs([])
    recordProgress({ type: 'clear-console' })
  }, [recordProgress])

  const copyConsole = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(logs.map((entry) => entry.text).join('\n'))
      setNotice('Salida copiada al portapapeles.')
      recordProgress({ type: 'console', action: 'copied' })
    } catch {
      setNotice('No se pudo copiar la salida.')
    }
  }, [logs, recordProgress])

  const toggleSnapshotSelection = useCallback((id: string) => {
    setSelectedSnapshots((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : current.length < 2 ? [...current, id] : [current[1], id]
      if (next.length === 2) recordProgress({ type: 'console', action: 'compared' })
      return next
    })
  }, [recordProgress])

  const selectSnapshot = useCallback((snapshot: RunSnapshot) => {
    setHistoricalView(snapshot)
    if (files.some((file) => file.id === snapshot.fileId)) {
      mutateProject((state) => {
        const project = getActiveProject(state)
        if (!project) return state
        return setActiveFile(state, project.id, snapshot.fileId)
      })
    }
    setStatus('paused')
    updateLayout({ inspectorTab: 'history' })
    recordProgress({ type: 'snapshot' })
    setNotice(`Vista de historial · ${new Date(snapshot.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`)
  }, [files, mutateProject, recordProgress, updateLayout])

  const toggleFolder = useCallback((folderId: string) => {
    setLayout((current) => ({
      ...current,
      expanded: current.expanded.includes(folderId)
        ? current.expanded.filter((id) => id !== folderId)
        : [...current.expanded, folderId],
    }))
  }, [setLayout])

  const moveInspectorTab = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next: InspectorTab = inspectorTab === 'symbols' ? 'history' : 'symbols'
    updateLayout({ inspectorTab: next })
    recordProgress({ type: 'inspector', tab: next })
    document.getElementById(next === 'symbols' ? 'cf-tab-symbols' : 'cf-tab-history')?.focus()
  }, [inspectorTab, recordProgress, updateLayout])

  const treeActions = useMemo<FileTreeActions>(() => ({
    onOpenFile: openFile,
    onToggleFolder: toggleFolder,
    onNewFile: (folderId) => setDialog({ kind: 'new-file', folderId }),
    onNewFolder: (parentId) => setDialog({ kind: 'new-folder', parentId }),
    onRenameFile: (file) => setDialog({ kind: 'rename-file', file }),
    onDuplicateFile: duplicateFile,
    onMoveFile: (file) => setDialog({ kind: 'move-file', file }),
    onDeleteFile: (file) => setDialog({ kind: 'delete-file', file }),
    onRenameFolder: (folder) => setDialog({ kind: 'rename-folder', folder }),
    onDeleteFolder: (folder) => setDialog({ kind: 'delete-folder', folder }),
  }), [duplicateFile, openFile, toggleFolder])

  const filteredFiles = useMemo(
    () => files.filter((file) => file.name.toLowerCase().includes(fileFilter.trim().toLowerCase())),
    [fileFilter, files],
  )
  const lineCount = displayCode ? displayCode.split('\n').length : 0
  const isStudio = view === 'studio'

  return (
    <>
      <div className={`cf-app ${isStudio ? '' : 'cf-app--page'}`}>
        <header className="cf-toolbar">
          <div className="cf-toolbar__leading">
            <button
              type="button"
              className="cf-brand"
              onClick={() => { updateLayout({ view: 'home' }); recordProgress({ type: 'project', action: 'visited' }) }}
              aria-label="Ir a los proyectos"
              title="Proyectos"
            >
              <span className="cf-brand__mark"><APP_ICONS.code aria-hidden="true" /></span>
              <span className="cf-brand__name">codeflow<span className="cf-brand__accent">.</span>studio</span>
            </button>
            {isStudio && (
              <>
                <span className="cf-divider" aria-hidden="true" />
                <Menu>
                  <MenuTrigger
                    render={<Button variant="ghost" size="sm" />}
                    className="cf-project-trigger"
                    aria-label={`Proyecto ${projectName}. Acciones del proyecto`}
                  >
                    <APP_ICONS.folder aria-hidden="true" />
                    <span className="cf-project-trigger__name">{projectName}</span>
                    <APP_ICONS.chevronDown aria-hidden="true" />
                  </MenuTrigger>
                  <MenuContent align="start">
                    <MenuGroup>
                      <MenuGroupLabel>Proyecto</MenuGroupLabel>
                      <MenuItem icon={APP_ICONS.home} onClick={() => updateLayout({ view: 'home' })}>Ver los proyectos</MenuItem>
                      <MenuItem icon={APP_ICONS.rename} onClick={() => activeProject && setDialog({ kind: 'rename-project', project: activeProject })}>Renombrar proyecto…</MenuItem>
                      <MenuItem icon={APP_ICONS.exportProject} onClick={() => activeProject && setDialog({ kind: 'export-project', project: activeProject })}>Exportar proyecto…</MenuItem>
                    </MenuGroup>
                  </MenuContent>
                </Menu>
              </>
            )}
          </div>

          <div className="cf-toolbar__trailing">
            {isStudio && closedSections.length > 0 && (
              <div className="cf-toolbar__sections" role="group" aria-label="Secciones cerradas">
                {SECTION_ORDER.filter((id) => isSectionClosed(id)).map((id) => {
                  const Icon = SECTION_ICONS[id]
                  return (
                    <Button
                      key={id}
                      variant="ghost"
                      size="icon-sm"
                      className="cf-icon-button cf-icon-button--section"
                      aria-label={`Abrir ${SECTION_LABELS[id]}`}
                      title={`Abrir ${SECTION_LABELS[id]}`}
                      onClick={() => setSectionClosed(id, false)}
                    >
                      <Icon aria-hidden="true" />
                    </Button>
                  )
                })}
              </div>
            )}
            {isStudio && (
              <>
                {isRuntimeBusy ? (
                  <Button size="default" className="cf-run-button cf-run-button--busy" onClick={cancelExecution} aria-label="Detener ejecución" title="Detener ejecución">
                    <APP_ICONS.stop aria-hidden="true" />
                    <span className="cf-run-button__label">Detener</span>
                  </Button>
                ) : (
                  <Button
                    size="default"
                    className="cf-run-button"
                    onClick={() => void runCode()}
                    disabled={Boolean(historicalView) || !activeFile}
                    aria-describedby="execution-limit-note"
                    title={EXECUTION_LIMIT_NOTICE}
                  >
                    <APP_ICONS.run aria-hidden="true" />
                    <span className="cf-run-button__label">Ejecutar</span>
                    <kbd className="cf-run-button__kbd">⌘↵</kbd>
                  </Button>
                )}
                <span id="execution-limit-note" className="visually-hidden">{EXECUTION_LIMIT_NOTICE}</span>
                <span className="cf-divider" aria-hidden="true" />
              </>
            )}

            <AppearancePanel
              mode={mode}
              seed={seed}
              isDark={isDark}
              onModeChange={setMode}
              onSeedChange={setSeed}
              onResetLayout={resetLayout}
            />

            <Button
              variant="ghost"
              size="icon-sm"
              className={`cf-icon-button ${view === 'achievements' ? 'is-active' : ''}`}
              aria-label="Logros y progresión"
              title="Logros y progresión"
              aria-pressed={view === 'achievements'}
              onClick={() => updateLayout({ view: 'achievements' })}
            >
              <APP_ICONS.trophy aria-hidden="true" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              className="cf-icon-button"
              aria-label="Ayuda y atajos de teclado"
              title="Ayuda y atajos de teclado"
              onClick={() => { recordProgress({ type: 'explore', feature: 'help' }); setShowHelp(true) }}
            >
              <APP_ICONS.help aria-hidden="true" />
            </Button>

            <Menu>
              <MenuTrigger
                render={<Button variant="ghost" size="icon-sm" />}
                className="cf-icon-button cf-icon-button--last"
                aria-label="Más acciones"
                title="Más acciones"
              >
                <APP_ICONS.more aria-hidden="true" />
              </MenuTrigger>
              <MenuContent align="end">
                {isStudio ? (
                  <>
                    <MenuGroup>
                      <MenuGroupLabel>Archivo</MenuGroupLabel>
                      <MenuItem icon={APP_ICONS.newFile} onClick={() => setDialog({ kind: 'new-file', folderId: null })}>Nuevo archivo…</MenuItem>
                      <MenuItem icon={APP_ICONS.newFolder} onClick={() => setDialog({ kind: 'new-folder', parentId: null })}>Nueva carpeta…</MenuItem>
                      <MenuItem icon={APP_ICONS.import} onClick={() => fileInputRef.current?.click()} disabled={isImporting}>Importar archivos…</MenuItem>
                    </MenuGroup>
                    <MenuSeparator />
                    <MenuGroup>
                      <MenuGroupLabel>Exportar</MenuGroupLabel>
                      <MenuItem icon={APP_ICONS.exportFile} onClick={exportActiveFile}>Exportar archivo</MenuItem>
                      <MenuItem icon={APP_ICONS.exportProject} onClick={() => activeProject && setDialog({ kind: 'export-project', project: activeProject })}>Exportar proyecto…</MenuItem>
                      <MenuItem icon={APP_ICONS.exportDiagram} onClick={() => setDialog({ kind: 'export-diagram' })}>Exportar diagrama…</MenuItem>
                    </MenuGroup>
                    <MenuSeparator />
                    <MenuGroup>
                      <MenuGroupLabel>Vista</MenuGroupLabel>
                      <MenuItem icon={APP_ICONS.copy} onClick={() => void copyCode()}>Copiar código</MenuItem>
                      <MenuItem icon={APP_ICONS.delete} onClick={restoreStarter} disabled={!starterTemplate}>Restaurar ejemplo</MenuItem>
                      <MenuItem icon={APP_ICONS.layout} onClick={resetLayout}>Restablecer el layout</MenuItem>
                    </MenuGroup>
                  </>
                ) : (
                  <>
                    <MenuGroup>
                      <MenuGroupLabel>Proyectos</MenuGroupLabel>
                      <MenuItem icon={APP_ICONS.newFile} onClick={() => setDialog({ kind: 'new-project' })}>Nuevo proyecto…</MenuItem>
                      <MenuItem icon={APP_ICONS.import} onClick={() => projectInputRef.current?.click()}>Importar proyecto…</MenuItem>
                      <MenuItem icon={APP_ICONS.newFolder} onClick={() => folderInputRef.current?.click()}>Importar carpeta…</MenuItem>
                    </MenuGroup>
                    <MenuSeparator />
                    <MenuGroup>
                      <MenuGroupLabel>Sesión</MenuGroupLabel>
                      <MenuItem icon={APP_ICONS.exportProject} onClick={() => activeProject && setDialog({ kind: 'export-project', project: activeProject })} disabled={!activeProject}>Exportar el proyecto activo…</MenuItem>
                      <MenuItem icon={APP_ICONS.help} shortcut="⌘?" onClick={() => { recordProgress({ type: 'explore', feature: 'help' }); setShowHelp(true) }}>Ayuda y atajos</MenuItem>
                    </MenuGroup>
                  </>
                )}
              </MenuContent>
            </Menu>
          </div>
        </header>

        {isStudio ? (
          <>
            <div
              className="cf-workspace"
              ref={workspaceRef}
              style={{
                '--cf-w-files': `${layout.files}px`,
                '--cf-w-editor': `${layout.editor}px`,
                '--cf-w-inspector': `${layout.inspector}px`,
              } as React.CSSProperties}
            >
{!isSectionClosed('files') && (
<>
                <aside className={`cf-files ${mobilePane === 'files' ? 'is-mobile-active' : ''}`} aria-label="Archivos del proyecto">
                  <div className="cf-pane-header">
                    <h2 className="cf-pane-title">Explorador</h2>
                    <div className="cf-pane-header__actions">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setSectionClosed('files', true)}
                        aria-label="Cerrar el explorador"
                        title="Cerrar el explorador"
                      >
                        <APP_ICONS.close aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setDialog({ kind: 'new-folder', parentId: null })}
                        aria-label="Nueva carpeta"
                        title="Nueva carpeta"
                        disabled={isRuntimeBusy}
                      >
                        <APP_ICONS.newFolder aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setDialog({ kind: 'new-file', folderId: null })}
                        aria-label="Nuevo archivo"
                        title="Nuevo archivo"
                        disabled={isRuntimeBusy}
                      >
                        <APP_ICONS.newFile aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <label className="cf-search">
                    <Search aria-hidden="true" />
                    <input
                      ref={fileSearchRef}
                      value={fileFilter}
                      onChange={(event) => setFileFilter(event.target.value)}
                      placeholder="Filtrar archivos"
                      aria-label="Filtrar archivos"
                    />
                    <kbd>⌘P</kbd>
                  </label>
                  <div className="cf-file-list">
                    {fileFilter.trim() ? (
                      filteredFiles.map((file) => (
                        <button
                          key={file.id}
                          className={`cf-file-row ${activeFileId === file.id ? 'is-active' : ''}`}
                          type="button"
                          onClick={() => openFile(file.id)}
                          disabled={isRuntimeBusy}
                        >
                          <span className={`cf-language-mark cf-language-mark--${file.language}`} aria-hidden="true">
                            {LANGUAGE_DEFINITIONS[file.language].mark}
                          </span>
                          <span className="cf-file-row__name">{file.name}</span>
                        </button>
                      ))
                    ) : activeProject ? (
                      <FileTree
                        project={activeProject}
                        expanded={Array.isArray(layout.expanded) ? layout.expanded : []}
                        activeFileId={activeFileId}
                        disabled={isRuntimeBusy}
                        actions={treeActions}
                      />
                    ) : null}
                    {fileFilter.trim() && filteredFiles.length === 0 && (
                      <p className="cf-empty-inline">No se encontraron archivos</p>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={`${acceptedFileExtensions()},.codeflow.json`}
                    multiple
                    className="visually-hidden"
                    onChange={(event) => void importFiles(event.target.files)}
                    aria-label="Seleccionar archivos para importar"
                  />
                </aside>

                <ResizeHandle
                  orientation="vertical"
                  label="Ajustar el ancho del explorador"
                  onResize={(delta) => resizeSection('files', delta, 160, 460)}
                  onNudge={(delta) => updateLayout({ files: delta === 0 ? DEFAULT_LAYOUT.files : clamp(layout.files + delta, 160, 460) })}
                  onCommit={() => recordProgress({ type: 'layout', action: 'adjusted' })}
                />
</>
)}

{!isSectionClosed('editor') && (
<>
                <section className={`cf-panel cf-editor ${mobilePane === 'editor' ? 'is-mobile-active' : ''}`} aria-label="Editor de código">
                  <div className="cf-pane-header">
                    <div className="cf-pane-title">
                      <APP_ICONS.code aria-hidden="true" />
                      <span className="cf-pane-title__file">{baseName(displayFileName) || 'Sin archivo'}</span>
                      {historicalView && <span className="cf-chip cf-chip--warning">Solo lectura</span>}
                    </div>
                    <div className="cf-pane-header__actions">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setSectionClosed('editor', true)}
                        aria-label="Cerrar el editor"
                        title="Cerrar el editor"
                      >
                        <APP_ICONS.close aria-hidden="true" />
                      </Button>
                      {historicalView ? (
                        <Button variant="ghost" size="sm" onClick={() => setHistoricalView(null)}>Volver al archivo</Button>
                      ) : (
                        <Menu>
                          <MenuTrigger
                            render={<Button variant="ghost" size="sm" />}
                            className="cf-language-trigger"
                            aria-label={`Lenguaje: ${LANGUAGE_DEFINITIONS[displayLanguage].label}. Cambiar lenguaje`}
                            title="Lenguaje del archivo"
                          >
                            <span className={`cf-language-mark cf-language-mark--${displayLanguage}`} aria-hidden="true">
                              {LANGUAGE_DEFINITIONS[displayLanguage].mark}
                            </span>
                            <span className="cf-language-trigger__label">{LANGUAGE_DEFINITIONS[displayLanguage].label}</span>
                            <APP_ICONS.chevronDown aria-hidden="true" />
                          </MenuTrigger>
                          <MenuContent align="end" className="cf-menu--languages">
                            <MenuRadioGroup value={displayLanguage} onValueChange={(value) => changeLanguage(value as Language)}>
                              <MenuGroupLabel>Lenguaje del archivo</MenuGroupLabel>
                              {SUPPORTED_LANGUAGES.map((language) => (
                                <MenuRadioItem
                                  key={language}
                                  value={language}
                                  leading={<span className={`cf-language-mark cf-language-mark--${language}`} aria-hidden="true">{LANGUAGE_DEFINITIONS[language].mark}</span>}
                                >
                                  <span className="cf-menu__stack">
                                    <span className="cf-menu__label">{LANGUAGE_DEFINITIONS[language].label}</span>
                                    <span className="cf-menu__hint">{LANGUAGE_DEFINITIONS[language].runtimeName}</span>
                                  </span>
                                </MenuRadioItem>
                              ))}
                            </MenuRadioGroup>
                          </MenuContent>
                        </Menu>
                      )}
                    </div>
                  </div>
                  <div className="cf-editor__surface">
                    {activeFile ? (
                      <CodeEditor
                        key={`${activeFile.id}-${displayLanguage}-${historicalView?.id ?? 'current'}`}
                        height="100%"
                        language={LANGUAGE_DEFINITIONS[displayLanguage].monacoLanguage}
                        value={displayCode}
                        onChange={(value) => updateActiveCode(value ?? '')}
                        onMount={handleEditorMount}
                        theme={isDark ? 'codeflow-graphite' : 'codeflow-paper'}
                        options={{
                          automaticLayout: true,
                          glyphMargin: false,
                          lineNumbers: 'on',
                          lineNumbersMinChars: 3,
                          folding: true,
                          scrollBeyondLastLine: false,
                          wordWrap: 'off',
                          tabSize: LANGUAGE_DEFINITIONS[displayLanguage].tabSize,
                          insertSpaces: true,
                          suggestOnTriggerCharacters: true,
                          quickSuggestions: true,
                          accessibilitySupport: 'auto',
                          readOnly: isRuntimeBusy || Boolean(historicalView),
                        }}
                      />
                    ) : (
                      <p className="cf-empty-inline cf-empty-inline--center">No hay archivos en este proyecto.</p>
                    )}
                  </div>
                  <footer className="cf-editor__footer">
                    <span>{lineCount} líneas</span>
                    <span>{LANGUAGE_DEFINITIONS[displayLanguage].label}</span>
                    <span>UTF-8</span>
                    <span>Espacios: {LANGUAGE_DEFINITIONS[displayLanguage].tabSize}</span>
                  </footer>
                </section>

                <ResizeHandle
                  orientation="vertical"
                  label="Ajustar el ancho del editor"
                  onResize={(delta) => resizeSection('editor', delta, 260, 1400)}
                  onNudge={(delta) => updateLayout({ editor: delta === 0 ? DEFAULT_LAYOUT.editor : clamp(layout.editor + delta, 260, 1400) })}
                  onCommit={() => recordProgress({ type: 'layout', action: 'adjusted' })}
                />
</>
)}

{!isSectionClosed('diagram') && (
<>
                <section className={`cf-panel cf-diagram ${mobilePane === 'diagram' ? 'is-mobile-active' : ''}`} aria-label="Diagrama del código">
                  <div className="cf-pane-header">
                    <div className="cf-pane-title">
                      <APP_ICONS.flow aria-hidden="true" />
                      <span>Flujo</span>
                      <span className="cf-count">{graph.nodes.length} nodos</span>
                    </div>
                    <div className="cf-pane-header__actions">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setSectionClosed('diagram', true)}
                        aria-label="Cerrar el diagrama"
                        title="Cerrar el diagrama"
                      >
                        <APP_ICONS.close aria-hidden="true" />
                      </Button>
                      <Menu>
                        <MenuTrigger
                          render={<Button variant="ghost" size="icon-xs" />}
                          className="cf-icon-button"
                          aria-label="Acciones del diagrama"
                          title="Acciones del diagrama"
                        >
                          <APP_ICONS.more aria-hidden="true" />
                        </MenuTrigger>
                        <MenuContent align="end">
                          <MenuItem icon={APP_ICONS.exportDiagram} onClick={() => setDialog({ kind: 'export-diagram' })}>Exportar diagrama…</MenuItem>
                          <MenuItem icon={APP_ICONS.delete} onClick={() => { setManualEdges([]); setNotice('Conexiones visuales eliminadas.') }} disabled={!manualEdges.length}>
                            Quitar conexiones visuales
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    </div>
                  </div>
                  <div className="cf-diagram__surface">
                    <FlowCanvas
                      graph={graph}
                      manualEdges={manualEdges}
                      activeLine={null}
                      activeOperationId={null}
                      onSelectNode={(nodeId) => { recordProgress({ type: 'explore', feature: 'diagram' }); openLine(nodeId) }}
                      onManualEdgesChange={setManualEdges}
                      onConnectNodes={(count) => setNotice(`Conexiones visuales: ${count}. Las flechas son anotaciones del diagrama.`)}
                    />
                  </div>
                  <footer className="cf-legend">
                    <span><span className="cf-legend__shape cf-legend__shape--terminator" />Inicio / fin</span>
                    <span><span className="cf-legend__shape cf-legend__shape--process" />Proceso</span>
                    <span><span className="cf-legend__shape cf-legend__shape--decision" />Decisión</span>
                    <span><span className="cf-legend__shape cf-legend__shape--io" />Entrada / salida</span>
                    <span><span className="cf-legend__shape cf-legend__shape--connector" />Conector</span>
                  </footer>
                </section>

                <ResizeHandle
                  orientation="vertical"
                  label="Ajustar el ancho del inspector"
                  onResize={(delta) => resizeSection('inspector', -delta, 200, 520)}
                  onNudge={(delta) => updateLayout({ inspector: delta === 0 ? DEFAULT_LAYOUT.inspector : clamp(layout.inspector - delta, 200, 520) })}
                  onCommit={() => recordProgress({ type: 'layout', action: 'adjusted' })}
                />
</>
)}

{!isSectionClosed('inspector') && (
<>
                <aside className={`cf-panel cf-inspector ${mobilePane === 'inspector' ? 'is-mobile-active' : ''}`} aria-label="Inspector">
                  {selectedNode ? (
                    <FlowNodeEditor
                      pseudo={selectedNode.data.pseudo}
                      label={selectedNode.data.label}
                      kindLabel={selectedNode.data.kind === 'operation' && selectedNode.data.operationCategory
                        ? OPERATION_LABELS[selectedNode.data.operationCategory]
                        : NODE_LABELS[selectedNode.data.kind]}
                      language={displayLanguage}
                      line={selectedNode.data.line}
                      detail={selectedNode.data.detail.split(' · ')[0]}
                      originalLine={activeFile?.code.split('\n')[selectedNode.data.line - 1] ?? ''}
                      readOnly={Boolean(historicalView)}
                      conflicted={Boolean(activeFile) && (activeFile!.code.split('\n')[selectedNode.data.line - 1] ?? '') !== sourceLineOriginal}
                      onApply={applySourceEdit}
                      onClose={() => setSelectedNodeId(null)}
                      onReloadLine={() => {
                        const currentLine = activeFile?.code.split('\n')[selectedNode.data.line - 1] ?? ''
                        setSourceLineOriginal(currentLine)
                      }}
                    />
                  ) : (
                    <>
                      <div className="cf-pane-header">
                        <h2 className="cf-pane-title"><APP_ICONS.inspector aria-hidden="true" />Inspector</h2>
                        <div className="cf-pane-header__actions">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setSectionClosed('inspector', true)}
                            aria-label="Cerrar el inspector"
                            title="Cerrar el inspector"
                          >
                            <APP_ICONS.close aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                      <div className="cf-tabs" role="tablist" aria-label="Panel del inspector">
                        <button
                          type="button"
                          role="tab"
                          id="cf-tab-symbols"
                          aria-selected={inspectorTab === 'symbols'}
                          aria-controls="cf-panel-inspector"
                          className={inspectorTab === 'symbols' ? 'is-active' : ''}
                          onClick={() => { updateLayout({ inspectorTab: 'symbols' }); recordProgress({ type: 'inspector', tab: 'symbols' }) }}
                          onKeyDown={moveInspectorTab}
                        >
                          <APP_ICONS.symbols aria-hidden="true" />
                          Símbolos
                          <span className="cf-count">{graph.nodes.length}</span>
                        </button>
                        <button
                          type="button"
                          role="tab"
                          id="cf-tab-history"
                          aria-selected={inspectorTab === 'history'}
                          aria-controls="cf-panel-inspector"
                          className={inspectorTab === 'history' ? 'is-active' : ''}
                          onClick={() => { updateLayout({ inspectorTab: 'history' }); recordProgress({ type: 'inspector', tab: 'history' }) }}
                          onKeyDown={moveInspectorTab}
                        >
                          <APP_ICONS.history aria-hidden="true" />
                          Historial
                          <span className="cf-count">{snapshots.length}</span>
                        </button>
                      </div>
                      <div className="cf-panel__body" role="tabpanel" id="cf-panel-inspector" aria-labelledby={inspectorTab === 'symbols' ? 'cf-tab-symbols' : 'cf-tab-history'}>
                        {inspectorTab === 'symbols' ? (
                          <SymbolList graph={graph} onSelect={openSymbol} />
                        ) : (
                          <HistoryList
                            snapshots={snapshots}
                            selectedSnapshots={selectedSnapshots}
                            onOpen={selectSnapshot}
                            onToggleCompare={toggleSnapshotSelection}
                            compared={comparedSnapshots}
                          />
                        )}
                      </div>
                    </>
                  )}
                </aside>
</>
)}
            </div>

            {!isSectionClosed('console') && (
            <>
              <ResizeHandle
                orientation="horizontal"
                label="Ajustar el alto de la consola"
                onResize={(delta) => {
                  const next = layout.console - delta
                  if (next < 80) {
                    setSectionClosed('console', true)
                    return
                  }
                  updateLayout({ console: clamp(next, 80, 520) })
                }}
                onNudge={(delta) => updateLayout({ console: delta === 0 ? DEFAULT_LAYOUT.console : clamp(layout.console - delta, 80, 520) })}
                onCommit={() => recordProgress({ type: 'layout', action: 'adjusted' })}
              />

              <ConsolePanel
                logs={logs}
                status={status}
                runNotice={notice}
                onClose={() => setSectionClosed('console', true)}
                collapsed={consoleCollapsed}
                onToggleCollapsed={() => updateLayout({ consoleCollapsed: !consoleCollapsed })}
                onClear={clearConsole}
                onCopy={() => void copyConsole()}
                height={consoleCollapsed ? undefined : layout.console}
              />
            </>
            )}

            <nav className="cf-mobile-nav" aria-label="Vistas del editor">
              <button type="button" className={mobilePane === 'files' ? 'is-active' : ''} aria-current={mobilePane === 'files' ? 'page' : undefined} onClick={() => { setMobilePane('files'); setSectionClosed('files', false) }}>
                <APP_ICONS.folder aria-hidden="true" />Archivos
              </button>
              <button type="button" className={mobilePane === 'editor' ? 'is-active' : ''} aria-current={mobilePane === 'editor' ? 'page' : undefined} onClick={() => { setMobilePane('editor'); setSectionClosed('editor', false) }}>
                <APP_ICONS.code aria-hidden="true" />Código
              </button>
              <button type="button" className={mobilePane === 'diagram' ? 'is-active' : ''} aria-current={mobilePane === 'diagram' ? 'page' : undefined} onClick={() => { setMobilePane('diagram'); setSectionClosed('diagram', false) }}>
                <APP_ICONS.flow aria-hidden="true" />Flujo
              </button>
              <button type="button" className={mobilePane === 'inspector' ? 'is-active' : ''} aria-current={mobilePane === 'inspector' ? 'page' : undefined} onClick={() => { setMobilePane('inspector'); setSectionClosed('inspector', false) }}>
                <APP_ICONS.inspector aria-hidden="true" />Inspector
              </button>
            </nav>

            <footer className="cf-statusbar">
              <span className="cf-statusbar__status">
                <span className={`cf-status-dot cf-status-dot--${status}`} aria-hidden="true" />
                {status === 'loading' || status === 'running'
                  ? 'Ejecutando en microVM'
                  : status === 'error'
                    ? 'Error de ejecución'
                    : status === 'stopped'
                      ? 'Ejecución detenida'
                      : status === 'complete'
                        ? 'Ejecución completada'
                        : 'Runtime aislado'}
              </span>
              <span className="cf-statusbar__right">
                {LANGUAGE_DEFINITIONS[displayLanguage].analyzerName}
                <span aria-hidden="true">·</span>
                {graph.nodes.length} símbolos de flujo
              </span>
            </footer>
          </>
        ) : view === 'home' ? (
          <HomeView
            projects={projects}
            activeProjectId={activeProjectId}
            profile={profile}
            onOpenProject={openProject}
            onCreateProject={() => setDialog({ kind: 'new-project' })}
            onImportProject={() => projectInputRef.current?.click()}
            onImportFolder={() => folderInputRef.current?.click()}
            onRenameProject={(project) => setDialog({ kind: 'rename-project', project })}
            onDeleteProject={(project) => setDialog({ kind: 'delete-project', project })}
            onExportProject={(project) => setDialog({ kind: 'export-project', project })}
            onOpenAchievements={() => { updateLayout({ view: 'achievements' }); recordProgress({ type: 'project', action: 'visited' }) }}
          />
        ) : (
          <AchievementsView
            profile={profile ?? createAchievementProfile('Integrante')}
            onBack={() => updateLayout({ view: 'home' })}
            onRename={(name) => setProfile((current) => current ? { ...current, name } : current)}
          />
        )}

        <input
          ref={projectInputRef}
          type="file"
          accept=".codeflow.json"
          className="visually-hidden"
          onChange={(event) => void importProject(event.target.files)}
          aria-label="Seleccionar un proyecto CodeFlow para importar"
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="visually-hidden"
          {...{ webkitdirectory: '', directory: '' }}
          onChange={(event) => void importFolder(event.target.files)}
          aria-label="Seleccionar una carpeta con el código del proyecto"
        />
      </div>

      {achievementToasts[0] && (
        <div className="cf-toast" role="status" aria-live="polite">
          <span className="cf-toast__icon"><APP_ICONS.trophy aria-hidden="true" /></span>
          <span className="cf-toast__body">
            <small>LOGRO DESBLOQUEADO · +{achievementToasts[0].xp} XP</small>
            <strong>{achievementToasts[0].name}</strong>
          </span>
          <button type="button" aria-label="Cerrar notificación" onClick={() => setAchievementToasts((current) => current.slice(1))}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      <HelpDialog open={showHelp} onClose={() => setShowHelp(false)} />

      <NewFileDialog
        open={dialog.kind === 'new-file'}
        initialLanguage={activeFile?.language ?? 'javascript'}
        folders={folderOptions}
        initialFolderId={dialog.kind === 'new-file' ? dialog.folderId : null}
        onClose={() => setDialog({ kind: 'none' })}
        onConfirm={createNewFile}
      />
      <NameDialog
        open={dialog.kind === 'new-folder'}
        title="Nueva carpeta"
        description="La carpeta cuelga de la carpeta que elijas en el explorador."
        label="Nombre de la carpeta"
        initialValue=""
        confirmLabel="Crear carpeta"
        onClose={() => setDialog({ kind: 'none' })}
        onConfirm={(name) => createNewFolder(name, dialog.kind === 'new-folder' ? dialog.parentId : null)}
      />
      <NameDialog
        open={dialog.kind === 'new-project'}
        title="Nuevo proyecto"
        description="El proyecto se guarda en esta sesión y se puede exportar cuando quieras."
        label="Nombre del proyecto"
        initialValue=""
        confirmLabel="Crear proyecto"
        onClose={() => setDialog({ kind: 'none' })}
        onConfirm={createProjectNamed}
      />
      <NameDialog
        open={dialog.kind === 'rename-file'}
        title="Renombrar archivo"
        description="El nombre incluye la carpeta y la extensión del archivo."
        label="Nombre"
        initialValue={dialog.kind === 'rename-file' ? dialog.file.name : ''}
        confirmLabel="Renombrar"
        onClose={() => setDialog({ kind: 'none' })}
        onConfirm={(name) => { if (dialog.kind === 'rename-file') renameFile(dialog.file.id, name) }}
      />
      <NameDialog
        open={dialog.kind === 'rename-folder'}
        title="Renombrar carpeta"
        description="Las rutas de las carpetas hijas se actualizan solas."
        label="Nombre de la carpeta"
        initialValue={dialog.kind === 'rename-folder' ? dialog.folder.name : ''}
        confirmLabel="Renombrar"
        onClose={() => setDialog({ kind: 'none' })}
        onConfirm={(name) => { if (dialog.kind === 'rename-folder') renameFolder(dialog.folder.id, name) }}
      />
      <NameDialog
        open={dialog.kind === 'rename-project'}
        title="Renombrar proyecto"
        description="El nombre se usa al exportar el proyecto CodeFlow."
        label="Nombre del proyecto"
        initialValue={dialog.kind === 'rename-project' ? dialog.project.name : ''}
        confirmLabel="Renombrar"
        onClose={() => setDialog({ kind: 'none' })}
        onConfirm={(name) => { if (dialog.kind === 'rename-project') renameProject(dialog.project.id, name) }}
      />
      <FolderPickerDialog
        open={dialog.kind === 'move-file'}
        title="Mover archivo"
        description="Elige la carpeta de destino del archivo."
        folders={folderOptions}
        onClose={() => setDialog({ kind: 'none' })}
        onConfirm={(folderId) => { if (dialog.kind === 'move-file') moveFileTo(dialog.file.id, folderId) }}
      />
      <ConfirmDialog
        open={dialog.kind === 'delete-file'}
        title="Eliminar archivo"
        description={`Se eliminará ${dialog.kind === 'delete-file' ? dialog.file.name : ''} del proyecto. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onClose={() => setDialog({ kind: 'none' })}
        onConfirm={() => { if (dialog.kind === 'delete-file') { removeFile(dialog.file.id); setDialog({ kind: 'none' }) } }}
      />
      <ConfirmDialog
        open={dialog.kind === 'delete-folder'}
        title="Eliminar carpeta"
        description="Se eliminarán la carpeta, sus subcarpetas y todos los archivos que contienen. Esta acción no se puede deshacer."
        confirmLabel="Eliminar carpeta"
        onClose={() => setDialog({ kind: 'none' })}
        onConfirm={() => { if (dialog.kind === 'delete-folder') removeFolder(dialog.folder.id) }}
      />
      <ConfirmDialog
        open={dialog.kind === 'delete-project'}
        title="Eliminar proyecto"
        description="Se eliminarán el proyecto y todos sus archivos de esta sesión. Esta acción no se puede deshacer."
        confirmLabel="Eliminar proyecto"
        onClose={() => setDialog({ kind: 'none' })}
        onConfirm={() => { if (dialog.kind === 'delete-project') removeProjectById(dialog.project.id) }}
      />

      <DiagramExportDialog
        open={dialog.kind === 'export-diagram'}
        graph={graph}
        manualEdges={manualEdges}
        fileName={displayFileName}
        onClose={() => setDialog({ kind: 'none' })}
        onExported={(format) => {
          setNotice(`Diagrama exportado como ${format.toUpperCase()}.`)
          recordProgress({ type: 'export', target: 'diagram' })
          if (format !== 'json') recordProgress({ type: 'export-diagram-image', format })
        }}
      />

      <ProjectExportDialog
        open={dialog.kind === 'export-project'}
        project={dialog.kind === 'export-project' ? dialog.project : (activeProject ?? null)}
        onClose={() => setDialog({ kind: 'none' })}
        onExported={(format) => {
          const project = dialog.kind === 'export-project' ? dialog.project : activeProject
          setNotice(`${project?.name ?? 'Proyecto'} exportado como ${format === 'zip' ? 'ZIP' : '.codeflow.json'}.`)
          recordProgress({ type: 'export', target: 'project' })
          recordProgress({ type: 'export-project-archive', format })
        }}
      />
    </>
  )
}

interface SymbolListProps {
  graph: ReturnType<typeof analyzeCode>
  onSelect: (nodeId: string) => void
}

/** Lista de símbolos del archivo actual. Cada fila salta a su línea en el editor. */
function SymbolList({ graph, onSelect }: SymbolListProps) {
  const nodes = [...graph.nodes].sort((left, right) => left.data.line - right.data.line)
  if (!nodes.length) {
    return (
      <div className="cf-empty">
        <APP_ICONS.symbols aria-hidden="true" />
        <strong>Sin símbolos</strong>
        <span>El analizador no encontró funciones, condiciones ni bloques en este archivo.</span>
      </div>
    )
  }
  return (
    <ul className="cf-symbol-list">
      {nodes.map((node) => {
        const Icon = NODE_ICONS[node.data.kind]
        const typeLabel = node.data.kind === 'operation' && node.data.operationCategory
          ? OPERATION_LABELS[node.data.operationCategory]
          : NODE_LABELS[node.data.kind]
        return (
          <li key={node.id}>
            <button type="button" className="cf-symbol" onClick={() => onSelect(node.id)}>
              <span className={`cf-symbol__icon cf-symbol__icon--${node.data.kind}`} aria-hidden="true"><Icon /></span>
              <span className="cf-symbol__body">
                <span className="cf-symbol__label">{node.data.label}</span>
                <span className="cf-symbol__type">{typeLabel}</span>
              </span>
              <span className="cf-symbol__line">L{node.data.line}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

interface HistoryListProps {
  snapshots: RunSnapshot[]
  selectedSnapshots: string[]
  onOpen: (snapshot: RunSnapshot) => void
  onToggleCompare: (id: string) => void
  compared: RunSnapshot[]
}

/** Historial de ejecuciones guardadas en esta sesión, con comparación de salida. */
function HistoryList({ snapshots, selectedSnapshots, onOpen, onToggleCompare, compared }: HistoryListProps) {
  if (!snapshots.length) {
    return (
      <div className="cf-empty">
        <APP_ICONS.history aria-hidden="true" />
        <strong>Sin ejecuciones todavía</strong>
        <span>Ejecuta el archivo para guardar aquí su salida, hasta ocho veces.</span>
      </div>
    )
  }
  return (
    <>
      <ul className="cf-history-list">
        {snapshots.map((snapshot, index) => (
          <li key={snapshot.id} className={`cf-history-row ${selectedSnapshots.includes(snapshot.id) ? 'is-compared' : ''}`}>
            <button type="button" className="cf-history-row__open" onClick={() => onOpen(snapshot)}>
              <span className="cf-history-row__index">{String(snapshots.length - index).padStart(2, '0')}</span>
              <span className="cf-history-row__body">
                <strong>{baseName(snapshot.fileName)}</strong>
                <span>
                  {new Date(snapshot.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  {snapshot.output.length} bloques de salida
                </span>
              </span>
            </button>
            <button
              type="button"
              className="cf-history-row__compare"
              onClick={() => onToggleCompare(snapshot.id)}
              aria-label={`${selectedSnapshots.includes(snapshot.id) ? 'Quitar de' : 'Añadir a'} la comparación`}
              aria-pressed={selectedSnapshots.includes(snapshot.id)}
              title="Comparar salidas"
            >
              <APP_ICONS.copy aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {compared.length === 2 && <SnapshotComparison snapshots={compared} />}
    </>
  )
}

function SnapshotComparison({ snapshots }: { snapshots: RunSnapshot[] }) {
  const [left, right] = snapshots
  const formatOutput = (snapshot: RunSnapshot) => snapshot.output.map((entry) => `[${entry.stream}] ${entry.text}`).join('')

  return (
    <div className="cf-comparison">
      <div className="cf-comparison__heading"><APP_ICONS.copy aria-hidden="true" />Comparación de salidas</div>
      <div className="cf-comparison__files">
        <span>{baseName(left.fileName)}</span>
        <span aria-hidden="true">→</span>
        <span>{baseName(right.fileName)}</span>
      </div>
      <div className="cf-comparison__grid">
        <pre>{formatOutput(left) || 'Sin salida'}</pre>
        <pre>{formatOutput(right) || 'Sin salida'}</pre>
      </div>
    </div>
  )
}
