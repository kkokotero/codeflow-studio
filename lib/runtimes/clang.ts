import type { BrowserRuntime, RuntimeOptions, RuntimeSession } from '@/lib/runtimes/types'
import { PROGRESS_HELPER } from '@/lib/runtimes/assets'

/**
 * Runtime de C y C++ en el navegador.
 *
 * Clang 22 compilado a WebAssembly: el fuente se compila a un módulo WASI y
 * se ejecuta en el mismo worker. La cadena de herramientas son 28 MB que se
 * descargan la primera vez, con barra de progreso.
 */

const CLANG_IIFE = '/runtimes/@live-codes/clang-wasm/dist/clang-wasm.global.js'
const CLANG_ASSETS = '/runtimes/@live-codes/clang-wasm/assets/'

const workerSource = (origin: string, language: 'c' | 'cpp') => `
const send = (message) => self.postMessage(message)
const emit = (stream, text) => send({ type: 'output', stream, text: text.endsWith('\\n') ? text : text + '\\n' })

${PROGRESS_HELPER}

let compiler = null

const loadCompiler = async () => {
  if (compiler) return compiler
  importScripts('${origin}${CLANG_IIFE}')
  const assets = [
    { url: '${origin}${CLANG_ASSETS}bin/clang.wasm.gz', label: 'clang' },
    { url: '${origin}${CLANG_ASSETS}bin/lld.wasm.gz', label: 'enlazador' },
    { url: '${origin}${CLANG_ASSETS}bin/memfs.wasm.gz', label: 'sistema de archivos' },
    { url: '${origin}${CLANG_ASSETS}bin/sysroot.tar.gz', label: 'biblioteca estándar' },
  ]
  await warmAssets(assets)
  compiler = await self.clangWasm.createCompiler('${language}', { baseUrl: '${origin}${CLANG_ASSETS}' })
  return compiler
}

self.onmessage = async (event) => {
  const data = event.data
  if (!data || data.type !== 'run') return

  try {
    const instance = await loadCompiler()
    const result = await instance.run(data.code)
    const stdout = String(result.stdout || '')
    const stderr = String(result.stderr || '')
    if (stdout) emit('stdout', stdout)
    if (stderr) emit('stderr', stderr)
    for (const error of result.errors || []) emit('stderr', String(error) + '\\n')
    send({ type: 'done', exitCode: Number(result.exitCode || 0) })
  } catch (error) {
    emit('stderr', String(error && error.message ? error.message : error) + '\\n')
    send({ type: 'done', exitCode: 1 })
  }
}
`

function createClangRuntime(language: 'c' | 'cpp', id: 'c' | 'cpp'): BrowserRuntime {
  return {
    id,
    label: language === 'c' ? 'C (Clang 22 · WebAssembly)' : 'C++ (Clang 22 · WebAssembly)',
    place: 'Clang · WebAssembly',
    run: (options: RuntimeOptions): RuntimeSession => {
      const origin = typeof location === 'undefined' ? '' : location.origin
      const timeoutMs = options.timeoutMs ?? 60_000
      const maxOutputBytes = options.maxOutputBytes ?? 16_384
      const startedAt = Date.now()
      const output: { stream: 'stdout' | 'stderr'; text: string }[] = []
      let bytes = 0
      let finished = false
      let timedOut = false
      let truncated = false

      const blobUrl = URL.createObjectURL(new Blob([workerSource(origin, language)], { type: 'text/javascript' }))
      const worker = new Worker(blobUrl)
      let watchdog: ReturnType<typeof setTimeout> | undefined

      const report = (exitCode: number) => {
        if (finished) return
        finished = true
        if (watchdog) clearTimeout(watchdog)
        options.onExit({
          exitCode,
          durationMs: Date.now() - startedAt,
          timedOut,
          outputTruncated: truncated,
          output,
        })
      }

      const stop = (exitCode: number) => {
        report(exitCode)
        worker.terminate()
        URL.revokeObjectURL(blobUrl)
      }

      watchdog = setTimeout(() => {
        timedOut = true
        stop(124)
      }, timeoutMs)

      worker.onmessage = (event: MessageEvent) => {
        const data = event.data as
          | { type: 'output'; stream: 'stdout' | 'stderr'; text: string }
          | { type: 'progress'; label: string; loaded: number; total: number }
          | { type: 'done'; exitCode: number }
          | undefined
        if (!data) return

        if (data.type === 'progress') {
          options.onProgress?.({ label: data.label, loaded: data.loaded, total: data.total })
          return
        }

        if (data.type === 'output') {
          bytes += data.text.length
          if (bytes > maxOutputBytes) {
            truncated = true
            stop(1)
            return
          }
          output.push({ stream: data.stream, text: data.text })
          options.onOutput({ stream: data.stream, text: data.text })
          return
        }

        if (data.type === 'done') report(data.exitCode)
      }

      worker.onerror = (event) => {
        options.onOutput({
          stream: 'stderr',
          text: `${event.message || 'No se pudo cargar el compilador de C.'}\n`,
        })
        stop(1)
      }

      worker.postMessage({ type: 'run', code: options.code })

      return {
        write: () => undefined,
        closeInput: () => undefined,
        terminate: () => stop(130),
      }
    },
  }
}

export const cRuntime = createClangRuntime('c', 'c')
export const cppRuntime = createClangRuntime('cpp', 'cpp')
