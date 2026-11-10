import { describe, expect, it } from 'vitest'
import {
  createEmptyState,
  createProject,
  createFile,
  createFolder,
  addProject,
  deleteProject,
  updateProjectName,
  deleteFolder,
  deleteFile,
  updateFileCode,
  renameFile,
  setActiveProject,
  setActiveFile,
  setActiveFolder,
  getProject,
  getActiveProject,
  getFolder,
  getFoldersInFolder,
  getFilesInFolder,
  getFile,
  loadStorage,
  saveStorage,
  type Project,
} from './storage'

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => {
      data.clear()
    },
    key: (index: number) => {
      const entry = [...data.entries()][index]
      return entry ? entry[0] : null
    },
  } as Storage
}

function sampleProject(name = 'Proyecto A'): Project {
  return createProject(name)
}

const STORAGE_KEY = 'codeflow-storage-v1'
const LEGACY_KEY = 'codeflow-workspace-v1'

describe('storage', () => {
  it('createEmptyState devuelve un estado sin proyectos', () => {
    const state = createEmptyState()
    expect(state.version).toBe(1)
    expect(state.projects).toEqual([])
    expect(state.activeProjectId).toBeNull()
  })

  it('createProject crea un proyecto con carpeta raíz', () => {
    const project = createProject('Mi proyecto')
    expect(project.name).toBe('Mi proyecto')
    expect(project.files).toEqual([])
    expect(project.folders).toHaveLength(1)
    expect(project.folders[0].parentId).toBeNull()
    expect(project.activeFolderId).toBe(project.folders[0].id)
    expect(project.activeFileId).toBeNull()
  })

  it('addProject agrega el proyecto y lo activa si no hay ninguno', () => {
    const state = createEmptyState()
    const project = createProject('Uno')
    const next = addProject(state, project)
    expect(next.projects).toHaveLength(1)
    expect(next.activeProjectId).toBe(project.id)
  })

  it('getProject / getActiveProject / getFolder / getFile leen correctamente', () => {
    const state = addProject(createEmptyState(), createProject('P'))
    const project = getProject(state, state.activeProjectId!)!
    const folder = getFolder(state, project.id, project.folders[0].id)!
    expect(getActiveProject(state)?.id).toBe(project.id)
    expect(getFolder(state, project.id, 'no-existe')).toBeUndefined()
    const next = createFile(state, project.id, null, 'main.js', 'javascript', 'const a = 1')
    const saved = getFile(next, project.id, next.projects[0].files[0].id)!
    expect(saved.name).toBe('main.js')
  })

  it('getFilesInFolder filtra por carpeta', () => {
    let state = addProject(createEmptyState(), createProject('P'))
    const project = getProject(state, state.activeProjectId!)!
    const root = project.folders[0]

    const withSub = createFolder(state, project.id, 'src', root.id)
    const subFolder = getFolder(withSub, project.id, withSub.projects[0].folders.find((f) => f.name === 'src')!.id)!

    state = createFile(state, project.id, null, 'root.js', 'javascript', '1')
    state = createFile(state, project.id, subFolder.id, 'index.js', 'javascript', '2')

    expect(getFilesInFolder(state, project.id, null)).toHaveLength(1)
    expect(getFilesInFolder(state, project.id, subFolder.id)).toHaveLength(1)
  })

  it('createFolder construye rutas anidadas', () => {
    let state = addProject(createEmptyState(), createProject('P'))
    const project = getProject(state, state.activeProjectId!)!
    const root = project.folders[0]

    state = createFolder(state, project.id, 'src', root.id)
    const src = getFoldersInFolder(state, project.id, root.id)[0]
    state = createFolder(state, project.id, 'components', src.id)
    const components = getFoldersInFolder(state, project.id, src.id)[0]

    expect(src.path).toBe('P/src')
    expect(components.path).toBe('P/src/components')
  })

  it('createFile asigna carpeta, archivo activo y carpeta activa', () => {
    let state = addProject(createEmptyState(), createProject('P'))
    const project = getProject(state, state.activeProjectId!)!
    const root = project.folders[0]

    state = createFile(state, project.id, root.id, 'main.js', 'javascript', 'const x = 1')
    const updated = getProject(state, project.id)!
    expect(updated.files).toHaveLength(1)
    expect(updated.files[0].folderId).toBe(root.id)
    expect(updated.activeFileId).toBe(updated.files[0].id)
    expect(updated.activeFolderId).toBe(root.id)
  })

  it('updateFileCode actualiza código y marca updatedAt', () => {
    let state = addProject(createEmptyState(), createProject('P'))
    const project = getProject(state, state.activeProjectId!)!
    state = createFile(state, project.id, null, 'main.js', 'javascript', 'const a = 1')
    const current = getProject(state, project.id)!
    const fileId = current.files[0].id
    const before = current.files[0].updatedAt!

    state = updateFileCode(state, project.id, fileId, 'const a = 2')
    const after = getProject(state, project.id)!.files.find((f) => f.id === fileId)!
    expect(after.code).toBe('const a = 2')
    expect(after.updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('renameFile cambia el nombre', () => {
    let state = addProject(createEmptyState(), createProject('P'))
    const project = getProject(state, state.activeProjectId!)!
    state = createFile(state, project.id, null, 'viejo.js', 'javascript', '1')
    const current = getProject(state, project.id)!
    const fileId = current.files[0].id
    state = renameFile(state, project.id, fileId, 'nuevo.js')
    const renamed = getProject(state, project.id)!.files.find((f) => f.id === fileId)!
    expect(renamed.name).toBe('nuevo.js')
  })

  it('deleteFile remueve el archivo y selecciona otro activo', () => {
    let state = addProject(createEmptyState(), createProject('P'))
    state = createFile(state, state.activeProjectId!, null, 'a.js', 'javascript', '1')
    state = createFile(state, state.activeProjectId!, null, 'b.js', 'javascript', '2')
    const project = getProject(state, state.activeProjectId!)!
    const idA = project.files[0].id
    state = deleteFile(state, project.id, idA)
    const remaining = getProject(state, project.id)!
    expect(remaining.files).toHaveLength(1)
    expect(remaining.files[0].name).toBe('b.js')
    expect(remaining.activeFileId).toBe(remaining.files[0].id)
  })


  it('deleteFolder elimina carpetas anidadas y sus archivos en cascada', () => {
    let state = addProject(createEmptyState(), createProject('P'))
    const project = getProject(state, state.activeProjectId!)!
    const root = project.folders[0]

    state = createFolder(state, project.id, 'src', root.id)
    const src = getFoldersInFolder(state, project.id, root.id)[0]
    state = createFolder(state, project.id, 'components', src.id)
    const components = getFoldersInFolder(state, project.id, src.id)[0]

    state = createFile(state, project.id, root.id, 'root.js', 'javascript', '1')
    state = createFile(state, project.id, src.id, 'index.js', 'javascript', '2')
    state = createFile(state, project.id, components.id, 'button.js', 'javascript', '3')

    state = deleteFolder(state, project.id, src.id)

    const updated = getProject(state, project.id)!
    expect(updated.folders.map((f) => f.name)).not.toContain('src')
    expect(updated.folders.map((f) => f.name)).not.toContain('components')
    expect(updated.files.map((f) => f.name)).not.toContain('index.js')
    expect(updated.files.map((f) => f.name)).not.toContain('button.js')
    expect(updated.files.map((f) => f.name)).toContain('root.js')
  })

  it('setActiveProject / setActiveFile / setActiveFolder cambian la selección', () => {
    let state = addProject(createEmptyState(), createProject('Uno'))
    state = addProject(state, createProject('Dos'))

    state = setActiveProject(state, state.projects[1].id)
    expect(getActiveProject(state)?.name).toBe('Dos')

    const project = getProject(state, state.projects[1].id)!
    state = createFile(state, project.id, null, 'a.js', 'javascript', '1')
    const current = getProject(state, project.id)!
    const fileId = current.files[0].id
    state = setActiveFile(state, project.id, fileId)
    expect(getProject(state, project.id)?.activeFileId).toBe(fileId)

    state = setActiveFolder(state, project.id, null)
    expect(getProject(state, project.id)?.activeFolderId).toBeNull()
  })

  it('loadStorage lee un estado válido y devuelve null si no hay nada', () => {
    const storage = makeStorage()
    const state = addProject(createEmptyState(), createProject('Guardado'))
    saveStorage(state, storage)

    const loaded = loadStorage(storage)
    expect(loaded).not.toBeNull()
    expect(loaded?.projects).toHaveLength(1)
    expect(loaded?.activeProjectId).toBe(state.projects[0].id)

    const empty = loadStorage(makeStorage())
    expect(empty).toBeNull()
  })

  it('loadStorage ignora datos corruptos y migra el formato legacy', () => {
    const corrupt = makeStorage()
    corrupt.setItem(STORAGE_KEY, 'no es json')
    expect(loadStorage(corrupt)).toBeNull()

    const legacy = makeStorage()
    legacy.setItem(
      LEGACY_KEY,
      JSON.stringify({
        version: 1,
        files: [{ id: 'f1', name: 'main.js', language: 'javascript', code: 'const a = 1' }],
        activeFileId: 'f1',
      }),
    )
    const migrated = loadStorage(legacy)
    expect(migrated).not.toBeNull()
    expect(migrated?.projects).toHaveLength(1)
    expect(migrated?.projects[0].files).toHaveLength(1)
    expect(migrated?.projects[0].files[0].name).toBe('main.js')
    expect(migrated?.activeProjectId).toBe(migrated?.projects[0].id)
  })

  it('saveStorage devuelve false sin almacenamiento', () => {
    expect(saveStorage(createEmptyState(), null as unknown as Storage)).toBe(false)
  })
})

