import type { BrowserRuntime, RuntimeOptions, RuntimeSession } from '@/lib/runtimes/types'
import { PROGRESS_HELPER, runtimeAssetUrls } from '@/lib/runtimes/assets'
import { MAX_RUNTIME_BOOT_TIME_MS } from '@/lib/runtime-safety'

/**
 * Runtime de Python en el navegador.
 *
 * Pyodide es CPython compilado a WebAssembly: el programa se ejecuta tal cual,
 * con su biblioteca estándar, dentro de un Web Worker.
 *
 * La entrada estándar de Python es bloqueante, así que cuando el programa pide
 * un dato el worker pide ayuda y vuelve a lanzar el programa con la respuesta
 * ya recogida: la salida se reinicia en cada intento, de modo que no se repite.
 */

const PYODIDE_PATH = '/runtimes/pyodide/pyodide.mjs'
const PYODIDE_INDEX_PATH = '/runtimes/pyodide/'

const workerSource = (origin: string) => `
const inputs = []
let pyodide = null
let needsInput = false

const send = (message) => self.postMessage(message)
const emit = (stream, text) => send({ type: 'output', stream, text: text.endsWith('\\n') ? text : text + '\\n' })

${PROGRESS_HELPER}

const loadRuntime = async () => {
  if (pyodide) return pyodide
  await warmAssets(${JSON.stringify(runtimeAssetUrls(origin, 'python'))})
  const { loadPyodide } = await import('${origin}${PYODIDE_PATH}')
  pyodide = await loadPyodide({ indexURL: '${origin}${PYODIDE_INDEX_PATH}' })
  return pyodide
}

const runProgram = async (code) => {
  const runtime = await loadRuntime()
  needsInput = false
  send({ type: 'reset' })
  runtime.setStdout({ batched: (text) => emit('stdout', text) })
  runtime.setStderr({ batched: (text) => emit('stderr', text) })
  runtime.setStdin({
    stdin: () => {
      if (inputs.length) return inputs.shift()
      needsInput = true
      throw new Error('__codeflow_need_input__')
    },
  })

  try {
    await runtime.runPythonAsync(code)
    send({ type: 'done', exitCode: 0 })
  } catch (error) {
    if (needsInput) {
      send({ type: 'needs-input' })
      return
    }
    emit('stderr', String(error && error.message ? error.message : error))
    send({ type: 'done', exitCode: 1 })
  }
}

self.onmessage = async (event) => {
  const data = event.data
  if (!data) return

  if (data.type === 'input') {
    inputs.push(data.value)
    await runProgram(data.code)
    return
  }

  if (data.type === 'run') {
    await runProgram(data.code)
  }
}
`

export const pythonRuntime: BrowserRuntime = {
  id: 'python',
  label: 'Python (Pyodide)',
  place: 'Pyodide · WebAssembly',
  run: (options: RuntimeOptions): RuntimeSession => {
    const origin = typeof location === 'undefined' ? '' : location.origin
    const timeoutMs = options.timeoutMs ?? MAX_RUNTIME_BOOT_TIME_MS
    const maxOutputBytes = options.maxOutputBytes ?? 16_384
    const startedAt = Date.now()
    const output: { stream: 'stdout' | 'stderr'; text: string }[] = []
    let bytes = 0
    let finished = false
    let timedOut = false
    let truncated = false

    const blobUrl = URL.createObjectURL(new Blob([workerSource(origin)], { type: 'text/javascript' }))
    const worker = new Worker(blobUrl, { type: 'module' })
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
        | { type: 'reset' }
        | { type: 'needs-input' }
        | { type: 'done'; exitCode: number }
        | undefined
      if (!data) return

      if (data.type === 'reset') {
        output.length = 0
        bytes = 0
        options.onReset?.()
        return
      }

      if (data.type === 'progress') {
        options.onProgress?.({ label: data.label, loaded: data.loaded, total: data.total })
        return
      }

      if (data.type === 'needs-input') {
        options.onInputRequest?.('')
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
        text: `${event.message || 'No se pudo cargar el runtime de Python.'}\n`,
      })
      stop(1)
    }

    worker.postMessage({ type: 'run', code: options.code })

    return {
      write: (line: string) => {
        worker.postMessage({ type: 'input', value: line, code: options.code })
        options.onInputRequest?.('')
      },
      closeInput: () => worker.postMessage({ type: 'input', value: '', code: options.code }),
      terminate: () => stop(130),
    }
  },
}
