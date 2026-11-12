import type { Language } from '@/lib/languages'

/**
 * Archivos que cada runtime descarga la primera vez que se usa.
 *
 * Se descargan con seguimiento de progreso y quedan en la caché del
 * navegador: la segunda ejecución arranca al instante.
 *
 * Este archivo es la lista única: añadir un runtime es añadir su entrada y
 * nada más.
 */

export interface RuntimeAsset {
  /** Ruta dentro de la carpeta de runtimes del servidor. */
  path: string
  /** Nombre que se muestra en la barra de carga. */
  label: string
  /** URL completa, para lo que no vive en el servidor. */
  external?: string
}

/** Carpeta del servidor donde se sirven los archivos de los runtimes. */
export const RUNTIME_BASE = '/runtimes'

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

/**
 * La cadena de herramientas de Rust son tres trozos de la imagen del
 * compilador: los nombres llevan la huella de la versión instalada.
 */
const RUST_ASSETS: RuntimeAsset[] = [
  { path: '@kreijstal/rubrc/vfs.core-G3YEEGQv.wasm.br.part-000', label: 'rustc' },
  { path: '@kreijstal/rubrc/vfs.core-G3YEEGQv.wasm.br.part-001', label: 'rustc' },
  { path: '@kreijstal/rubrc/vfs.core-G3YEEGQv.wasm.br.part-002', label: 'rustc' },
  { path: '@kreijstal/rubrc/brotli_dec_wasm_bg-Dn-Szc7i.wasm', label: 'descompresor' },
  {
    path: '',
    label: 'biblioteca estándar de Rust',
    external: 'https://oligamiq.github.io/rust_wasm/v0.2.0/wasm32-wasip1.tar.br',
  },
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
  rust: RUST_ASSETS,
}

/**
 * URLs absolutas de los archivos de un runtime.
 *
 * El worker se crea con una URL de blob, así que necesita direcciones
 * completas: el origen del sitio más la carpeta de runtimes.
 */
export function runtimeAssetUrls(
  origin: string,
  language: Language,
): { url: string; label: string }[] {
  return (RUNTIME_ASSETS[language] ?? []).map((asset) => ({
    url: asset.external ?? `${origin}${RUNTIME_BASE}/${asset.path}`,
    label: asset.label,
  }))
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

/**
 * Descarga un archivo avisando del progreso y lo suelta: sirve para calentar
 * la caché del navegador antes de que otro motor lo pida.
 */
const warmFile = async (url, label) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('No se pudo cargar ' + label)
  const total = Number(response.headers.get('content-length') || 0)
  const reader = response.body.getReader()
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    loaded += value.byteLength
    send({ type: 'progress', label, loaded, total })
  }
  return true
}

const warmFiles = async (assets) => {
  for (const asset of assets) {
    try {
      await warmFile(asset.url, asset.label)
    } catch (error) {
      // Si un archivo no está, el motor lo volverá a pedir por su cuenta.
    }
  }
}

const warmAssets = warmFiles
`
