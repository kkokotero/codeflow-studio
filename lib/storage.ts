import type { CodeFile, Language } from '@/lib/codeflow-types'
import { isLanguage } from '@/lib/languages'

/**
 * Capa de almacenamiento local (localStorage) para CodeFlow Studio.
 *
 * Organiza la información en:
 *  - Proyectos: contenedores de nivel superior con nombre.
 *  - Carpetas: jerárquicas dentro de un proyecto (pueden anidarse).
 *  - Archivos: código fuente asociado a un proyecto y una carpeta.
 *
 * Todas las funciones de transición de estado son puras (reciben y devuelven
 * un nuevo estado). Solo `loadStorage` / `saveStorage` tocan `localStorage`,
 * lo que hace que el resto sea fácil de probar sin el navegador.
 */

export const STORAGE_VERSION = 1
export const STORAGE_KEY = 'codeflow-storage-v1'
const LEGACY_WORKSPACE_KEY = 'codeflow-workspace-v1'

export interface Folder {
  id: string
  name: string
  projectId: string
  parentId: string | null
  path: string
  createdAt: number
}

export interface Project {
  id: string
  name: string
  files: CodeFile[]
  folders: Folder[]
  activeFileId: string | null
  activeFolderId: string | null
  createdAt: number
  updatedAt: number
}

export interface StorageState {
  version: number
  projects: Project[]
  activeProjectId: string | null
}

function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function createEmptyState(): StorageState {
  return { version: STORAGE_VERSION, projects: [], activeProjectId: null }
}

export function createProject(name: string): Project {
  const id = generateId('project')
  const now = Date.now()
  const rootFolder: Folder = {
    id: generateId('folder'),
    name: name.trim() || 'Proyecto',
    projectId: id,
    parentId: null,
    path: name.trim() || 'Proyecto',
    createdAt: now,
  }
  return {
    id,
    name: rootFolder.name,
    files: [],
    folders: [rootFolder],
    activeFileId: null,
    activeFolderId: rootFolder.id,
    createdAt: now,
    updatedAt: now,
  }
}

export function getProject(state: StorageState, projectId: string): Project | undefined {
  return state.projects.find((project) => project.id === projectId)
}

export function getActiveProject(state: StorageState): Project | undefined {
  if (!state.activeProjectId) return undefined
  return getProject(state, state.activeProjectId)
}

export function getFolder(state: StorageState, projectId: string, folderId: string): Folder | undefined {
  return getProject(state, projectId)?.folders.find((folder) => folder.id === folderId)
}

export function getFoldersInFolder(state: StorageState, projectId: string, parentId: string | null): Folder[] {
  return getProject(state, projectId)?.folders.filter((folder) => folder.parentId === parentId) ?? []
}

export function getFilesInFolder(state: StorageState, projectId: string, folderId: string | null): CodeFile[] {
  return getProject(state, projectId)?.files.filter((file) => (file.folderId ?? null) === folderId) ?? []
}

export function getFile(state: StorageState, projectId: string, fileId: string): CodeFile | undefined {
  return getProject(state, projectId)?.files.find((file) => file.id === fileId)
}

export function resolveFolderPath(project: Project, folderId: string | null): string {
  if (!folderId) return ''
  const folder = project.folders.find((f) => f.id === folderId)
  return folder ? folder.path : ''
}

/* ------------------------------------------------------------------ */
/* Transiciones de estado puras                                       */
/* ------------------------------------------------------------------ */

function findProjectIndex(state: StorageState, projectId: string): number {
  return state.projects.findIndex((project) => project.id === projectId)
}

function findFileIndex(project: Project, fileId: string): number {
  return project.files.findIndex((file) => file.id === fileId)
}

export function setActiveProject(state: StorageState, projectId: string | null): StorageState {
  return { ...state, activeProjectId: projectId }
}

export function addProject(state: StorageState, project: Project): StorageState {
  const nextProjects = [...state.projects, project]
  return {
    ...state,
    projects: nextProjects,
    activeProjectId: state.activeProjectId ?? project.id,
  }
}

export function updateProjectName(state: StorageState, projectId: string, name: string): StorageState {
  const index = findProjectIndex(state, projectId)
  if (index < 0) return state
  const project = state.projects[index]
  const nextProject = { ...project, name: name.trim() || project.name, updatedAt: Date.now() }
  const nextProjects = [...state.projects]
  nextProjects[index] = nextProject
  return { ...state, projects: nextProjects }
}

export function deleteProject(state: StorageState, projectId: string): StorageState {
  const index = findProjectIndex(state, projectId)
  if (index < 0) return state
  const nextProjects = state.projects.filter((_, i) => i !== index)
  let nextActive = state.activeProjectId
  if (nextActive === projectId) {
    nextActive = nextProjects.length ? nextProjects[0].id : null
  }
  return { ...state, projects: nextProjects, activeProjectId: nextActive }
}

function collectDescendantFolderIds(folders: Folder[], folderId: string): string[] {
  const ids: string[] = []
  const collect = (id: string) => {
    const children = folders.filter((folder) => folder.parentId === id)
    for (const child of children) {
      ids.push(child.id)
      collect(child.id)
    }
  }
  collect(folderId)
  return ids
}

export function createFolder(
  state: StorageState,
  projectId: string,
  name: string,
  parentId: string | null,
): StorageState {
  const index = findProjectIndex(state, projectId)
  if (index < 0) return state
  const project = state.projects[index]
  const parent = parentId ? project.folders.find((folder) => folder.id === parentId) : null
  const parentPath = parent ? parent.path : project.name
  const path = `${parentPath}/${name}`
  const now = Date.now()
  const folder: Folder = {
    id: generateId('folder'),
    name: name.trim() || 'Carpeta',
    projectId,
    parentId,
    path,
    createdAt: now,
  }
  const nextProject = {
    ...project,
    folders: [...project.folders, folder],
    updatedAt: now,
  }
  const nextProjects = [...state.projects]
  nextProjects[index] = nextProject
  return {
    ...state,
    projects: nextProjects,
    activeProjectId: state.activeProjectId ?? projectId,
  }
}

/**
 * Renombra una carpeta y reescribe la ruta de sus descendientes.
 */
export function renameFolder(state: StorageState, projectId: string, folderId: string, name: string): StorageState {
  const index = findProjectIndex(state, projectId)
  if (index < 0) return state
  const project = state.projects[index]
  const folder = project.folders.find((f) => f.id === folderId)
  if (!folder) return state

  const trimmed = name.trim() || folder.name
  const parentPath = folder.parentId
    ? project.folders.find((f) => f.id === folder.parentId)?.path ?? project.name
    : project.name
  const nextPath = `${parentPath}/${trimmed}`

  const affected = new Set(collectDescendantFolderIds(project.folders, folderId))
  affected.add(folderId)

  const nextFolders = project.folders.map((candidate) => {
    if (candidate.id === folderId) return { ...candidate, name: trimmed, path: nextPath }
    if (affected.has(candidate.id)) {
      const suffix = candidate.path.slice(folder.path.length)
      return { ...candidate, path: `${nextPath}${suffix}` }
    }
    return candidate
  })

  const nextProject: Project = { ...project, folders: nextFolders, updatedAt: Date.now() }
  const nextProjects = [...state.projects]
  nextProjects[index] = nextProject
  return { ...state, projects: nextProjects }
}

/**
 * Mueve un archivo a otra carpeta del proyecto.
 */
export function moveFile(state: StorageState, projectId: string, fileId: string, folderId: string | null): StorageState {
  const index = findProjectIndex(state, projectId)
  if (index < 0) return state
  const project = state.projects[index]
  const fileIndex = findFileIndex(project, fileId)
  if (fileIndex < 0) return state
  const now = Date.now()
  const file = { ...project.files[fileIndex], folderId, updatedAt: now }
  const nextProject: Project = {
    ...project,
    files: [...project.files.slice(0, fileIndex), file, ...project.files.slice(fileIndex + 1)],
    updatedAt: now,
  }
  const nextProjects = [...state.projects]
  nextProjects[index] = nextProject
  return { ...state, projects: nextProjects }
}

/**
 * Crea un proyecto vacío, listo para recibir archivos.
 */
export function addEmptyProject(state: StorageState, name: string): StorageState {
  const project = createProject(name.trim() || 'Proyecto sin título')
  return {
    ...state,
    projects: [...state.projects, project],
    activeProjectId: project.id,
  }
}

/**
 * Elimina un proyecto y devuelve el estado con el primer proyecto restante activo.
 */
export function removeProject(state: StorageState, projectId: string): StorageState {
  const next = deleteProject(state, projectId)
  return { ...next, activeProjectId: next.projects[0]?.id ?? null }
}

export function deleteFolder(state: StorageState, projectId: string, folderId: string): StorageState {
  const index = findProjectIndex(state, projectId)
  if (index < 0) return state
  const project = state.projects[index]
  const folder = project.folders.find((f) => f.id === folderId)
  if (!folder) return state

  const toDelete = new Set<string>(collectDescendantFolderIds(project.folders, folderId))
  toDelete.add(folderId)

  const nextFolders = project.folders.filter((f) => !toDelete.has(f.id))
  const nextFiles = project.files.filter((file) => {
    const fileFolder = file.folderId ?? null
    return fileFolder === null || !toDelete.has(fileFolder)
  })

  const now = Date.now()
  const nextProject: Project = {
    ...project,
    folders: nextFolders,
    files: nextFiles,
    activeFolderId: nextFolders.find((f) => f.parentId === null)?.id ?? null,
    activeFileId: nextFiles.length ? nextFiles[0].id : null,
    updatedAt: now,
  }
  const nextProjects = [...state.projects]
  nextProjects[index] = nextProject
  return { ...state, projects: nextProjects }
}


export function createFile(
  state: StorageState,
  projectId: string,
  folderId: string | null,
  name: string,
  language: Language,
  code: string,
  templateId?: string,
): StorageState {
  const index = findProjectIndex(state, projectId)
  if (index < 0) return state
  const project = state.projects[index]
  const now = Date.now()
  const file: CodeFile = {
    id: generateId('file'),
    name,
    language,
    code,
    folderId,
    updatedAt: now,
    ...(templateId ? { templateId } : {}),
  }
  const nextProject: Project = {
    ...project,
    files: [...project.files, file],
    activeFileId: file.id,
    activeFolderId: folderId ?? project.activeFolderId,
    updatedAt: now,
  }
  const nextProjects = [...state.projects]
  nextProjects[index] = nextProject
  return {
    ...state,
    projects: nextProjects,
    activeProjectId: state.activeProjectId ?? projectId,
  }
}

export function updateFileCode(
  state: StorageState,
  projectId: string,
  fileId: string,
  code: string,
): StorageState {
  const index = findProjectIndex(state, projectId)
  if (index < 0) return state
  const project = state.projects[index]
  const fileIndex = findFileIndex(project, fileId)
  if (fileIndex < 0) return state
  const now = Date.now()
  const file = { ...project.files[fileIndex], code, updatedAt: now }
  const nextProject: Project = {
    ...project,
    files: [...project.files.slice(0, fileIndex), file, ...project.files.slice(fileIndex + 1)],
    updatedAt: now,
  }
  const nextProjects = [...state.projects]
  nextProjects[index] = nextProject
  return { ...state, projects: nextProjects }
}

export function renameFile(
  state: StorageState,
  projectId: string,
  fileId: string,
  name: string,
): StorageState {
  const index = findProjectIndex(state, projectId)
  if (index < 0) return state
  const project = state.projects[index]
  const fileIndex = findFileIndex(project, fileId)
  if (fileIndex < 0) return state
  const now = Date.now()
  const file = { ...project.files[fileIndex], name, updatedAt: now }
  const nextProject: Project = {
    ...project,
    files: [...project.files.slice(0, fileIndex), file, ...project.files.slice(fileIndex + 1)],
    updatedAt: now,
  }
  const nextProjects = [...state.projects]
  nextProjects[index] = nextProject
  return { ...state, projects: nextProjects }
}

/**
 * Actualiza los metadatos de un archivo (nombre y lenguaje) sin tocar su código.
 */
export function updateFileMeta(
  state: StorageState,
  projectId: string,
  fileId: string,
  patch: { name?: string; language?: Language },
): StorageState {
  const index = findProjectIndex(state, projectId)
  if (index < 0) return state
  const project = state.projects[index]
  const fileIndex = findFileIndex(project, fileId)
  if (fileIndex < 0) return state
  const now = Date.now()
  const current = project.files[fileIndex]
  const file: CodeFile = {
    ...current,
    name: patch.name ?? current.name,
    language: patch.language ?? current.language,
    updatedAt: now,
  }
  const nextProject: Project = {
    ...project,
    files: [...project.files.slice(0, fileIndex), file, ...project.files.slice(fileIndex + 1)],
    updatedAt: now,
  }
  const nextProjects = [...state.projects]
  nextProjects[index] = nextProject
  return { ...state, projects: nextProjects }
}

export function deleteFile(state: StorageState, projectId: string, fileId: string): StorageState {
  const index = findProjectIndex(state, projectId)
  if (index < 0) return state
  const project = state.projects[index]
  const fileIndex = findFileIndex(project, fileId)
  if (fileIndex < 0) return state
  const now = Date.now()
  const nextFiles = [...project.files.slice(0, fileIndex), ...project.files.slice(fileIndex + 1)]
  let nextActiveFileId = project.activeFileId
  if (nextActiveFileId === fileId) {
    nextActiveFileId = nextFiles.length ? nextFiles[Math.min(fileIndex, nextFiles.length - 1)].id : null
  }
  const nextProject: Project = {
    ...project,
    files: nextFiles,
    activeFileId: nextActiveFileId,
    updatedAt: now,
  }
  const nextProjects = [...state.projects]
  nextProjects[index] = nextProject
  return { ...state, projects: nextProjects }
}

export function setActiveFile(state: StorageState, projectId: string, fileId: string | null): StorageState {
  const index = findProjectIndex(state, projectId)
  if (index < 0) return state
  const project = state.projects[index]
  if (fileId !== null && !project.files.find((file) => file.id === fileId)) return state
  const nextProject = { ...project, activeFileId: fileId, updatedAt: Date.now() }
  const nextProjects = [...state.projects]
  nextProjects[index] = nextProject
  return { ...state, projects: nextProjects }
}

export function setActiveFolder(state: StorageState, projectId: string, folderId: string | null): StorageState {
  const index = findProjectIndex(state, projectId)
  if (index < 0) return state
  const project = state.projects[index]
  if (folderId !== null && !project.folders.find((folder) => folder.id === folderId)) return state
  const nextProject = { ...project, activeFolderId: folderId, updatedAt: Date.now() }
  const nextProjects = [...state.projects]
  nextProjects[index] = nextProject
  return { ...state, projects: nextProjects }
}


/* ------------------------------------------------------------------ */
/* Validación y migración                                             */
/* ------------------------------------------------------------------ */

function isCodeFile(value: unknown): value is CodeFile {
  if (!value || typeof value !== 'object') return false
  const file = value as Partial<CodeFile>
  return typeof file.id === 'string'
    && typeof file.name === 'string'
    && typeof file.code === 'string'
    && isLanguage(file.language)
}

function isFolder(value: unknown): value is Folder {
  if (!value || typeof value !== 'object') return false
  const f = value as Partial<Folder>
  return typeof f.id === 'string'
    && typeof f.name === 'string'
    && typeof f.projectId === 'string'
    && (f.parentId === null || typeof f.parentId === 'string')
    && typeof f.path === 'string'
    && typeof f.createdAt === 'number'
}

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<Project>
  return typeof p.id === 'string'
    && typeof p.name === 'string'
    && Array.isArray(p.files)
    && p.files.every(isCodeFile)
    && Array.isArray(p.folders)
    && p.folders.every(isFolder)
    && (p.activeFileId === null || typeof p.activeFileId === 'string')
    && (p.activeFolderId === null || typeof p.activeFolderId === 'string')
    && typeof p.createdAt === 'number'
    && typeof p.updatedAt === 'number'
}

function isStorageState(value: unknown): value is StorageState {
  if (!value || typeof value !== 'object') return false
  const s = value as Partial<StorageState>
  return s.version === STORAGE_VERSION && Array.isArray(s.projects) && s.projects.every(isProject)
}

function migrateLegacyWorkspace(parsed: unknown): StorageState | null {
  if (!parsed || typeof parsed !== 'object') return null
  const legacy = parsed as Partial<{ version: number; files: unknown; activeFileId: unknown }>
  if (!Array.isArray(legacy.files)) return null
  const files = legacy.files.filter(isCodeFile)
  if (!files.length) return null

  const state = createEmptyState()
  const project = createProject('Proyecto importado')
  const stateWithProject = addProject(state, project)
  const rootFolder = project.folders[0]

  let next = stateWithProject
  for (const file of files) {
    next = createFile(next, project.id, rootFolder.id, file.name, file.language as Language, file.code)
  }
  next = setActiveProject(next, project.id)
  const activeId = typeof legacy.activeFileId === 'string' ? files.find((f) => f.id === legacy.activeFileId) : null
  if (activeId) next = setActiveFile(next, project.id, activeId.id)
  return next
}

/* ------------------------------------------------------------------ */
/* Persistencia en localStorage                                       */
/* ------------------------------------------------------------------ */

function getDefaultStorage(): Storage | null {
  return typeof window !== 'undefined' ? window.localStorage : null
}

export function loadStorage(storage: Storage | null = getDefaultStorage()): StorageState | null {
  if (!storage) return null
  try {
    const saved = storage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (isStorageState(parsed)) return parsed
    }

    const legacy = storage.getItem(LEGACY_WORKSPACE_KEY)
    if (legacy) {
      const parsed: unknown = JSON.parse(legacy)
      const migrated = migrateLegacyWorkspace(parsed)
      if (migrated) return migrated
    }
  } catch {
    return null
  }
  return null
}

export function saveStorage(state: StorageState, storage: Storage | null = getDefaultStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

