'use client'

import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  MoreHorizontal,
} from 'lucide-react'

import { APP_ICONS } from '@/components/codeflow/app-icons'
import { Button } from '@/components/ui/button'
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import { LANGUAGE_DEFINITIONS } from '@/lib/languages'
import type { CodeFile } from '@/lib/codeflow-types'
import type { Folder, Project } from '@/lib/storage'

export interface FileTreeActions {
  onOpenFile: (fileId: string) => void
  onToggleFolder: (folderId: string) => void
  onNewFile: (folderId: string | null) => void
  onNewFolder: (parentId: string | null) => void
  onRenameFile: (file: CodeFile) => void
  onDuplicateFile: (file: CodeFile) => void
  onMoveFile: (file: CodeFile) => void
  onDeleteFile: (file: CodeFile) => void
  onRenameFolder: (folder: Folder) => void
  onDeleteFolder: (folder: Folder) => void
}

interface FileTreeProps {
  project: Project
  expanded: string[]
  activeFileId: string | null
  disabled: boolean
  actions: FileTreeActions
}

/**
 * Árbol de archivos y carpetas del proyecto.
 *
 * Las carpetas se muestran con su contenido real, así que la estructura del
 * proyecto es la que se ve, no una lista plana con rutas.
 */
export function FileTree({ project, expanded, activeFileId, disabled, actions }: FileTreeProps) {
  const rootFolder = project.folders.find((folder) => folder.parentId === null) ?? null
  // Los archivos sin carpeta cuelgan de la raíz; los demás son contenido de la carpeta raíz.
  const orphanFiles = project.files.filter((file) => !file.folderId)

  return (
    <div className="cf-tree" role="tree" aria-label="Archivos y carpetas">
      {rootFolder && (
        <FolderNode
          folder={rootFolder}
          depth={0}
          project={project}
          expanded={expanded}
          activeFileId={activeFileId}
          disabled={disabled}
          actions={actions}
        />
      )}
      {orphanFiles.map((file) => (
        <FileRow key={file.id} file={file} depth={0} active={activeFileId === file.id} disabled={disabled} actions={actions} />
      ))}
      {project.files.length === 0 && (
        <p className="cf-tree__empty">Este proyecto todavía no tiene archivos.</p>
      )}
    </div>
  )
}

interface FolderNodeProps {
  folder: Folder
  depth: number
  project: Project
  expanded: string[]
  activeFileId: string | null
  disabled: boolean
  actions: FileTreeActions
}

function FolderNode({ folder, depth, project, expanded, activeFileId, disabled, actions }: FolderNodeProps) {
  const childFolders = project.folders.filter((candidate) => candidate.parentId === folder.id)
  const childFiles = project.files.filter((file) => file.folderId === folder.id)
  const isRoot = folder.parentId === null
  const open = isRoot || expanded.includes(folder.id)
  const count = childFolders.length + childFiles.length

  return (
    <div role="treeitem" aria-expanded={isRoot ? undefined : open} aria-selected={false}>
      <div className={`cf-tree__row cf-tree__row--folder ${isRoot ? 'is-root' : ''}`} style={{ paddingLeft: 6 + depth * 14 }}>
        {isRoot ? (
          <span className="cf-tree__chevron" aria-hidden="true" />
        ) : (
          <button
            type="button"
            className="cf-tree__chevron"
            aria-label={open ? `Contraer ${folder.name}` : `Expandir ${folder.name}`}
            aria-expanded={open}
            onClick={() => actions.onToggleFolder(folder.id)}
          >
            {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          </button>
        )}
        <APP_ICONS.folder className="cf-tree__icon" aria-hidden="true" />
        <span className="cf-tree__name">{folder.name}</span>
        {count > 0 && <span className="cf-tree__count">{count}</span>}
        <Menu>
          <MenuTrigger
            render={<Button variant="ghost" size="icon-xs" />}
            className="cf-tree__menu"
            aria-label={`Acciones de la carpeta ${folder.name}`}
            title="Acciones"
          >
            <MoreHorizontal aria-hidden="true" />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuGroup>
              <MenuGroupLabel>Carpeta</MenuGroupLabel>
              <MenuItem icon={APP_ICONS.newFile} onClick={() => actions.onNewFile(folder.id)}>Nuevo archivo…</MenuItem>
              <MenuItem icon={FolderPlus} onClick={() => actions.onNewFolder(folder.id)}>Nueva carpeta…</MenuItem>
              <MenuItem icon={APP_ICONS.rename} onClick={() => actions.onRenameFolder(folder)}>Renombrar…</MenuItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuGroup>
              <MenuItem icon={APP_ICONS.delete} destructive onClick={() => actions.onDeleteFolder(folder)} disabled={isRoot}>
                Eliminar carpeta
              </MenuItem>
            </MenuGroup>
          </MenuContent>
        </Menu>
      </div>

      {open && (
        <div role="group">
          {childFolders.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              project={project}
              expanded={expanded}
              activeFileId={activeFileId}
              disabled={disabled}
              actions={actions}
            />
          ))}
          {childFiles.map((file) => (
            <FileRow key={file.id} file={file} depth={depth + 1} active={activeFileId === file.id} disabled={disabled} actions={actions} />
          ))}
          {count === 0 && <p className="cf-tree__empty" style={{ paddingLeft: 44 + (depth + 1) * 14 }}>Vacía</p>}
        </div>
      )}
    </div>
  )
}

interface FileRowProps {
  file: CodeFile
  depth: number
  active: boolean
  disabled: boolean
  actions: FileTreeActions
}

function FileRow({ file, depth, active, disabled, actions }: FileRowProps) {
  return (
    <div className={`cf-tree__row cf-tree__row--file ${active ? 'is-active' : ''}`} style={{ paddingLeft: 6 + depth * 14 + 18 }}>
      <button
        type="button"
        className="cf-tree__name-button"
        onClick={() => actions.onOpenFile(file.id)}
        aria-current={active ? 'true' : undefined}
        disabled={disabled}
        title={file.name}
      >
        <span className={`cf-language-mark cf-language-mark--${file.language}`} aria-hidden="true">
          {LANGUAGE_DEFINITIONS[file.language].mark}
        </span>
        <span className="cf-tree__name">{file.name.split('/').at(-1)}</span>
      </button>
      <Menu>
        <MenuTrigger
          render={<Button variant="ghost" size="icon-xs" />}
          className="cf-tree__menu"
          aria-label={`Acciones de ${file.name}`}
          title="Acciones"
        >
          <MoreHorizontal aria-hidden="true" />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuGroup>
            <MenuGroupLabel>Archivo</MenuGroupLabel>
            <MenuItem icon={APP_ICONS.rename} onClick={() => actions.onRenameFile(file)}>Renombrar…</MenuItem>
            <MenuItem icon={APP_ICONS.duplicate} onClick={() => actions.onDuplicateFile(file)}>Duplicar</MenuItem>
            <MenuItem icon={APP_ICONS.move} onClick={() => actions.onMoveFile(file)}>Mover a…</MenuItem>
          </MenuGroup>
          <MenuSeparator />
          <MenuGroup>
            <MenuItem icon={APP_ICONS.delete} destructive onClick={() => actions.onDeleteFile(file)}>Eliminar</MenuItem>
          </MenuGroup>
        </MenuContent>
      </Menu>
    </div>
  )
}
