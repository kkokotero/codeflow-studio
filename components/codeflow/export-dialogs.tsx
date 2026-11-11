'use client'

import { useCallback, useMemo, useState } from 'react'

import { APP_ICONS } from '@/components/codeflow/app-icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { buildDiagramSvg, readDiagramPalette, svgToPng } from '@/lib/diagram-svg'
import { archivePrefix, buildArchive, type ArchiveFile } from '@/lib/project-archive'
import { analyzeCode } from '@/lib/diagram'
import type { DiagramGraph, FlowCardEdge, FlowCardNode } from '@/lib/codeflow-types'
import type { Project } from '@/lib/storage'

type DiagramFormat = 'svg' | 'png' | 'json'
type ProjectFormat = 'codeflow' | 'zip'
type DiagramBundle = 'none' | 'svg' | 'png' | 'json'

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function baseName(path: string): string {
  return path.split('/').at(-1) ?? path
}

function slug(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'proyecto'
}

interface DiagramExportDialogProps {
  open: boolean
  graph: DiagramGraph
  manualEdges: FlowCardEdge[]
  fileName: string
  onClose: () => void
  onExported: (format: DiagramFormat) => void
}

/**
 * Exportación del diagrama en SVG, PNG o JSON.
 *
 * El SVG se genera desde los datos del grafo, no desde una captura del lienzo:
 * así el archivo es vectorial, conserva el estilo del tema y se puede editar.
 */
export function DiagramExportDialog({ open, graph, manualEdges, fileName, onClose, onExported }: DiagramExportDialogProps) {
  const [format, setFormat] = useState<DiagramFormat>('svg')
  const [scale, setScale] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const name = baseName(fileName).replace(/\.[^.]+$/, '') || 'diagrama'

  const exportDiagram = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const edges = [...graph.edges, ...manualEdges]
      if (format === 'json') {
        const diagram = {
          format: 'codeflow-diagram',
          version: 1,
          file: fileName,
          nodes: graph.nodes.map(({ id, position, data }) => ({ id, position, ...data })),
          edges: [...graph.edges, ...manualEdges],
        }
        download(new Blob([JSON.stringify(diagram, null, 2)], { type: 'application/json;charset=utf-8' }), `${name}.diagram.json`)
      } else {
        const svg = buildDiagramSvg(graph.nodes as FlowCardNode[], edges, {
          palette: readDiagramPalette(),
          title: `Diagrama de ${fileName}`,
        })
        if (format === 'svg') {
          download(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${name}.diagram.svg`)
        } else {
          const blob = await svgToPng(svg, scale)
          download(blob, `${name}.diagram.png`)
        }
      }
      onExported(format)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo exportar el diagrama.')
    } finally {
      setBusy(false)
    }
  }, [fileName, format, graph, manualEdges, name, onClose, onExported, scale])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="cf-dialog--prompt">
        <DialogTitle className="cf-dialog__title">Exportar diagrama</DialogTitle>
        <DialogDescription className="cf-dialog__description">
          El diagrama se genera desde el grafo del archivo, con el estilo del tema activo.
        </DialogDescription>
        <div className="cf-dialog__form">
          <fieldset className="cf-field">
            <legend className="cf-field__label">Formato</legend>
            <div className="cf-choice-grid">
              {([
                { id: 'svg', label: 'SVG', hint: 'Vectorial, escalable' },
                { id: 'png', label: 'PNG', hint: 'Imagen ráster' },
                { id: 'json', label: 'JSON', hint: 'Datos del grafo' },
              ] as const).map((option) => (
                <label key={option.id} className={`cf-choice ${format === option.id ? 'is-active' : ''}`}>
                  <input type="radio" name="cf-diagram-format" checked={format === option.id} onChange={() => setFormat(option.id)} className="visually-hidden" />
                  <strong>{option.label}</strong>
                  <span>{option.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {format === 'png' && (
            <label className="cf-field">
              <span className="cf-field__label">Resolución</span>
              <div className="cf-choice-grid cf-choice-grid--inline">
                {[1, 2, 3].map((value) => (
                  <label key={value} className={`cf-choice cf-choice--compact ${scale === value ? 'is-active' : ''}`}>
                    <input type="radio" name="cf-diagram-scale" checked={scale === value} onChange={() => setScale(value)} className="visually-hidden" />
                    <strong>{value}×</strong>
                  </label>
                ))}
              </div>
            </label>
          )}
          {error && <p className="cf-field__error" role="alert">{error}</p>}
          <div className="cf-dialog__actions">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="button" variant="default" size="sm" onClick={() => void exportDiagram()} disabled={busy}>
              <APP_ICONS.exportDiagram aria-hidden="true" />
              {busy ? 'Generando…' : 'Exportar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface ProjectExportDialogProps {
  open: boolean
  project: Project | null
  onClose: () => void
  onExported: (format: ProjectFormat) => void
}

/**
 * Exportación del proyecto: el paquete nativo de CodeFlow o un ZIP que además
 * puede llevar los diagramas de cada archivo.
 */
export function ProjectExportDialog({ open, project, onClose, onExported }: ProjectExportDialogProps) {
  const [format, setFormat] = useState<ProjectFormat>('codeflow')
  const [diagrams, setDiagrams] = useState<DiagramBundle>('svg')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const files = project?.files ?? []

  const exportProject = useCallback(async () => {
    if (!project) return
    setBusy(true)
    setError('')
    try {
      const bundle = {
        format: 'codeflow-project',
        version: 1,
        name: project.name,
        files: project.files.map(({ name, language, code }) => ({ name, language, code })),
      }
      const payload = JSON.stringify(bundle, null, 2)

      if (format === 'codeflow') {
        download(new Blob([payload], { type: 'application/json;charset=utf-8' }), `${archivePrefix(project.name)}.codeflow.json`)
        onExported('codeflow')
        onClose()
        return
      }

      const prefix = archivePrefix(project.name)
      const entries: ArchiveFile[] = [
        { path: `${prefix}/proyecto.codeflow.json`, content: payload },
      ]
      for (const file of project.files) {
        entries.push({ path: `${prefix}/${file.name}`, content: file.code })
      }

      if (diagrams !== 'none') {
        for (const file of project.files) {
          const graph = analyzeCode(file.code, file.language)
          if (!graph.nodes.length) continue
          const title = `Diagrama de ${file.name}`
          if (diagrams === 'json') {
            const diagram = {
              format: 'codeflow-diagram',
              version: 1,
              file: file.name,
              nodes: graph.nodes.map(({ id, position, data }) => ({ id, position, ...data })),
              edges: graph.edges,
            }
            entries.push({ path: `${prefix}/diagramas/${baseName(file.name)}.diagram.json`, content: JSON.stringify(diagram, null, 2) })
          } else {
            const svg = buildDiagramSvg(graph.nodes as FlowCardNode[], graph.edges, { palette: readDiagramPalette(), title })
            if (diagrams === 'svg') {
              entries.push({ path: `${prefix}/diagramas/${baseName(file.name)}.diagram.svg`, content: svg })
            } else {
              const png = await svgToPng(svg, 2)
              entries.push({ path: `${prefix}/diagramas/${baseName(file.name)}.diagram.png`, content: new Uint8Array(await png.arrayBuffer()) })
            }
          }
        }
      }

      const zipped = buildArchive(entries)
      download(new Blob([zipped], { type: 'application/zip' }), `${prefix}.zip`)
      onExported('zip')
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo exportar el proyecto.')
    } finally {
      setBusy(false)
    }
  }, [diagrams, format, onClose, onExported, project])

  const entries = useMemo(() => files.length, [files])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="cf-dialog--prompt">
        <DialogTitle className="cf-dialog__title">Exportar proyecto</DialogTitle>
        <DialogDescription className="cf-dialog__description">
          {project ? `${project.name} · ${entries} archivos` : 'Selecciona un proyecto para exportarlo.'}
        </DialogDescription>
        <div className="cf-dialog__form">
          <fieldset className="cf-field">
            <legend className="cf-field__label">Formato</legend>
            <div className="cf-choice-grid">
              <label className={`cf-choice ${format === 'codeflow' ? 'is-active' : ''}`}>
                <input type="radio" name="cf-project-format" checked={format === 'codeflow'} onChange={() => setFormat('codeflow')} className="visually-hidden" />
                <strong>.codeflow.json</strong>
                <span>Paquete nativo, reimportable</span>
              </label>
              <label className={`cf-choice ${format === 'zip' ? 'is-active' : ''}`}>
                <input type="radio" name="cf-project-format" checked={format === 'zip'} onChange={() => setFormat('zip')} className="visually-hidden" />
                <strong>ZIP</strong>
                <span>Código y diagramas juntos</span>
              </label>
            </div>
          </fieldset>
          {format === 'zip' && (
            <fieldset className="cf-field">
              <legend className="cf-field__label">Diagramas incluidos</legend>
              <div className="cf-choice-grid cf-choice-grid--inline">
                {([
                  { id: 'none', label: 'Ninguno' },
                  { id: 'svg', label: 'SVG' },
                  { id: 'png', label: 'PNG' },
                  { id: 'json', label: 'JSON' },
                ] as const).map((option) => (
                  <label key={option.id} className={`cf-choice cf-choice--compact ${diagrams === option.id ? 'is-active' : ''}`}>
                    <input type="radio" name="cf-project-diagrams" checked={diagrams === option.id} onChange={() => setDiagrams(option.id)} className="visually-hidden" />
                    <strong>{option.label}</strong>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {error && <p className="cf-field__error" role="alert">{error}</p>}
          <div className="cf-dialog__actions">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="button" variant="default" size="sm" onClick={() => void exportProject()} disabled={busy || !project}>
              <APP_ICONS.exportProject aria-hidden="true" />
              {busy ? 'Empaquetando…' : 'Exportar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
