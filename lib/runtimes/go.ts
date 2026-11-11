import type { BrowserRuntime, RuntimeOptions, RuntimeSession } from '@/lib/runtimes/types'
import { PROGRESS_HELPER } from '@/lib/runtimes/assets'

/**
 * Runtime de Go en el navegador.
 *
 * Yaegi es un intérprete de Go compilado a WebAssembly: el fuente se ejecuta
 * tal cual, con la biblioteca estándar. Son 39 MB que se descargan la primera
 * vez, con barra de progreso.
 */

const GO_SHIM = '/runtimes/yaegi-wasm/src/wasm_exec.js'
const GO_BINARY = '/runtimes/yaegi-wasm/src/yaegi-browser.wasm'

const workerSource = (origin: string) => `
const send = (message) => self.postMessage(message)
const emit = (stream, text) => send({ type: 'output', stream, text: text.endsWith('\\n') ? text : text + '\\n' })

${PROGRESS_HELPER}

let ready = false

const loadRuntime = async () => {
  if (ready) return
  importScripts('${origin}${GO_SHIM}')
  const go = new self.Go()
  const bytes = await fetchWithProgress('${origin}${GO_BINARY}', 'Yaegi')
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject)
  void go.run(instance)
  // El intérprete publica su función cuando termina de arrancar.
  for (let attempt = 0; attempt < 1200 && typeof self.executeGoCode !== 'function'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  ready = true
}

self.onmessage = async (event) => {
  const data = event.data
  if (!data || data.type !== 'run') return

  try {
    await loadRuntime()
    if (typeof self.executeGoCode !== 'function') throw new Error('El intérprete de Go no arrancó.')
    const result = self.executeGoCode(data.code, '')
    const output = String(result.output || '')
    const error = String(result.error || '')
    if (output) emit('stdout', output)
    if (error) emit('stderr', error)
    send({ type: 'done', exitCode: Number(result.exitCode || 0) })
  } catch (error) {
    emit('stderr', String(error && error.message ? error.message : error) + '\\n')
    send({ type: 'done', exitCode: 1 })
  }
}
`

export const goRuntime: BrowserRuntime = {
  id: 'go',
  label: 'Go (Yaegi)',
  place: 'Yaegi · WebAssembly',
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
        text: `${event.message || 'No se pudo cargar el intérprete de Go.'}\n`,
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
