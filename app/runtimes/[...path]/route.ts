import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const runtime = 'nodejs'

/**
 * Sirve los archivos de los runtimes del navegador.
 *
 * Los runtimes (Pyodide para Python, el módulo de Lua) viven en
 * `node_modules`; esta ruta los entrega tal cual para que el navegador pueda
 * cargarlos. No ejecuta nada: el código del usuario nunca pasa por el
 * servidor.
 */

const ALLOWED_ROOTS = ['pyodide/', 'wasmoon/dist/']
const ALLOWED_EXTENSIONS = ['.js', '.mjs', '.wasm', '.zip', '.json']

const MIME_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.json': 'application/json; charset=utf-8',
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await params
  const segments = (path ?? []).filter((segment) => segment && segment !== '.' && segment !== '..')
  const relative = segments.join('/')
  if (!relative || !ALLOWED_ROOTS.some((root) => relative.startsWith(root))) {
    return new Response('No encontrado', { status: 404 })
  }
  const extension = relative.slice(relative.lastIndexOf('.'))
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return new Response('No encontrado', { status: 404 })
  }

  try {
    const data = await readFile(join(process.cwd(), 'node_modules', relative))
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new Response('No encontrado', { status: 404 })
  }
}
