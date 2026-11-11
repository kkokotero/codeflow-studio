import { strToU8, zipSync } from 'fflate'

export interface ArchiveFile {
  /** Ruta dentro del archivo, con barras normales. */
  path: string
  content: string | Uint8Array
}

/**
 * Empaqueta un conjunto de archivos en un ZIP.
 *
 * Se usa el formato nativo de CodeFlow con el código fuente y, si se pide, los
 * diagramas de cada archivo, para poder seguir trabajando fuera del editor.
 */
export function buildArchive(files: ArchiveFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {}
  for (const file of files) {
    entries[file.path] = typeof file.content === 'string' ? strToU8(file.content) : file.content
  }
  return zipSync(entries, { level: 6 })
}

/** Convierte un nombre de proyecto en un prefijo de rutas seguro. */
export function archivePrefix(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'proyecto'
}
