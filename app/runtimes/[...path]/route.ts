import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, normalize, sep } from 'node:path'
import { Readable } from 'node:stream'

export const runtime = 'nodejs'

/**
 * Sirve los archivos de los runtimes del navegador.
 *
 * Los runtimes (Pyodide para Python, el módulo de Lua, Clang para C y C++,
 * el compilador de Java, Blazor para C# y la cadena de Rust) viven en
 * `node_modules`; esta ruta los entrega tal cual para que el navegador pueda
 * cargarlos. No ejecuta nada: el código del usuario nunca pasa por el
 * servidor.
 */

const ALLOWED_ROOTS = [
  'pyodide/',
  'wasmoon/dist/',
  'yaegi-wasm/src/',
  '@live-codes/clang-wasm/dist/',
  '@live-codes/clang-wasm/assets/',
  '@live-codes/java-wasm/dist/',
  '@live-codes/blazor-wasm/',
  '@kreijstal/rubrc/',
]

const MIME_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.json': 'application/json; charset=utf-8',
  '.gz': 'application/gzip',
  '.br': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.dat': 'application/octet-stream',
  '.part-000': 'application/octet-stream',
  '.part-001': 'application/octet-stream',
  '.part-002': 'application/octet-stream',
}

function contentType(relative: string): string {
  const extension = relative.slice(relative.lastIndexOf('.')).toLowerCase()
  return MIME_TYPES[extension] ?? 'application/octet-stream'
}

/** Mensaje para cuando el motor no está en el despliegue. */
const NOT_FOUND = 'Este motor no está incluido en el despliegue.'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await params
  const segments = (path ?? []).filter((segment) => segment && segment !== '.' && segment !== '..')
  const relative = segments.join('/')
  if (!relative || !ALLOWED_ROOTS.some((root) => relative.startsWith(root))) {
    return new Response(NOT_FOUND, { status: 404 })
  }

  // La carpeta de módulos es la única fuente: nada fuera de ella se sirve.
  const modulesRoot = join(process.cwd(), 'node_modules')
  const target = normalize(join(modulesRoot, relative))
  if (target !== modulesRoot && !target.startsWith(modulesRoot + sep)) {
    return new Response(NOT_FOUND, { status: 404 })
  }

  try {
    const info = await stat(target)
    if (!info.isFile()) return new Response(NOT_FOUND, { status: 404 })
    const stream = Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>
    return new Response(stream, {
      headers: {
        'Content-Type': contentType(relative),
        'Content-Length': String(info.size),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new Response(NOT_FOUND, { status: 404 })
  }
}
