import type { Language } from '@/lib/languages'

/**
 * Archivos que cada runtime descarga la primera vez que se usa.
 *
 * Se descargan con seguimiento de progreso y quedan en la caché del
 * navegador: la segunda ejecución arranca al instante.
 */

export interface RuntimeAsset {
  /** Ruta dentro de la carpeta de runtimes del servidor. */
  path: string
  /** Nombre que se muestra en la barra de carga. */
  label: string
}

const CLANG_ASSETS: RuntimeAsset[] = [
  { path: '@live-codes/clang-wasm/assets/bin/clang.wasm.gz', label: 'clang' },
  { path: '@live-codes/clang-wasm/assets/bin/lld.wasm.gz', label: 'enlazador' },
  { path: '@live-codes/clang-wasm/assets/bin/memfs.wasm.gz', label: 'sistema de archivos' },
  { path: '@live-codes/clang-wasm/assets/bin/sysroot.tar.gz', label: 'biblioteca estándar' },
]

const JAVA_ASSETS: RuntimeAsset[] = [
  { path: '@live-codes/java-wasm/dist/teavm/compiler.wasm', label: 'javac' },
  { path: '@live-codes/java-wasm/dist/teavm/compile-classlib-teavm.bin', label: 'biblioteca de clases' },
  { path: '@live-codes/java-wasm/dist/teavm/runtime-classlib-teavm.bin', label: 'tiempo de ejecución' },
]

export const RUNTIME_ASSETS: Partial<Record<Language, RuntimeAsset[]>> = {
  javascript: [],
  typescript: [],
  python: [
    { path: 'pyodide/pyodide.asm.wasm', label: 'Pyodide' },
    { path: 'pyodide/python_stdlib.zip', label: 'biblioteca estándar' },
  ],
  lua: [{ path: 'wasmoon/dist/glue.wasm', label: 'Lua' }],
  go: [{ path: 'yaegi-wasm/src/yaegi-browser.wasm', label: 'Yaegi' }],
  c: CLANG_ASSETS,
  cpp: CLANG_ASSETS,
  java: JAVA_ASSETS,
}

/**
 * Descarga los archivos de un runtime avisando del progreso.
 *
 * El código va dentro del worker, así que es una función de JavaScript plano
 * que se inyecta en su código fuente.
 */
export const PROGRESS_HELPER = `
const fetchWithProgress = async (url, label) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('No se pudo cargar ' + label)
  const total = Number(response.headers.get('content-length') || 0)
  const reader = response.body.getReader()
  const chunks = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    send({ type: 'progress', label, loaded, total })
  }
  const buffer = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return buffer
}

const warmAssets = async (assets) => {
  for (const asset of assets) {
    await fetchWithProgress(asset.url, asset.label)
  }
}
`
