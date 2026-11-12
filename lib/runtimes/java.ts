import type { BrowserRuntime, RuntimeOptions, RuntimeSession } from '@/lib/runtimes/types'
import { PROGRESS_HELPER, runtimeAssetUrls } from '@/lib/runtimes/assets'
import { MAX_COMPILER_TIME_MS } from '@/lib/runtime-safety'

/**
 * Runtime de Java en el navegador.
 *
 * El paquete de Live Codes trae `javac` y TeaVM dentro de un único módulo de
 * WebAssembly: el fuente se compila a clases y se ejecuta en JavaScript. Son
 * 8 MB de herramientas que se descargan la primera vez, con barra de progreso.
 */

const JAVA_IIFE = '/runtimes/@live-codes/java-wasm/dist/java-wasm.iife.js'
const JAVA_DIST = '/runtimes/@live-codes/java-wasm/dist/'
const JAVA_TEAVM = '/runtimes/@live-codes/java-wasm/dist/teavm/'

const workerSource = (origin: string) => `
// El paquete busca el script que lo carga: en un worker hay que simularlo.
self.document = { currentScript: null, baseURI: self.location.href }

const send = (message) => self.postMessage(message)
const emit = (stream, text) => send({ type: 'output', stream, text: text.endsWith('\\n') ? text : text + '\\n' })

${PROGRESS_HELPER}

let runtime = null

const loadRuntime = async () => {
  if (runtime) return runtime
  importScripts('${origin}${JAVA_IIFE}')
  await warmAssets(${JSON.stringify(runtimeAssetUrls(origin, 'java'))})
  runtime = await self.JavaWasm.createRuntime({
    baseUrl: '${origin}${JAVA_DIST}',
    teavmBaseUrl: '${origin}${JAVA_TEAVM}',
  })
  return runtime
}

self.onmessage = async (event) => {
  const data = event.data
  if (!data || data.type !== 'run') return

  try {
    const instance = await loadRuntime()
    const result = await instance.run(data.code, { input: '' })
    const stdout = String(result.stdout || '')
    const stderr = String(result.stderr || result.error || '')
    if (stdout) emit('stdout', stdout)
    if (stderr) emit('stderr', stderr)
    send({ type: 'done', exitCode: Number(result.exitCode || 0) })
  } catch (error) {
    emit('stderr', String(error && error.message ? error.message : error) + '\\n')
    send({ type: 'done', exitCode: 1 })
  }
}
`

export const javaRuntime: BrowserRuntime = {
  id: 'java',
  label: 'Java (javac + TeaVM)',
  place: 'javac · WebAssembly',
  run: (options: RuntimeOptions): RuntimeSession => {
    const origin = typeof location === 'undefined' ? '' : location.origin
    const timeoutMs = options.timeoutMs ?? MAX_COMPILER_TIME_MS
    const maxOutputBytes = options.maxOutputBytes ?? 16_384
    const startedAt = Date.now()
    const output: { stream: 'stdout' | 'stderr'; text: string }[] = []
    let bytes = 0
    let finished = false
    let timedOut = false
    let truncated = false

    const blobUrl = URL.createObjectURL(new Blob([workerSource(origin)], { type: 'text/javascript' }))
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
        text: `${event.message || 'No se pudo cargar el compilador de Java.'}\n`,
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
