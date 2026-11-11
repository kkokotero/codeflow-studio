import type { BrowserRuntime, RuntimeOptions, RuntimeSession } from '@/lib/runtimes/types'

/**
 * Runtime de Lua en el navegador.
 *
 * Wasmoon trae Lua 5.4 compilado a WebAssembly. El motor corre dentro de un
 * Web Worker y su `print` se sustituye por el puente de la consola.
 */

const WASMOON_PATH = '/runtimes/wasmoon/dist/index.js'
const LUA_WASM_PATH = '/runtimes/wasmoon/dist/glue.wasm'

const workerSource = (origin: string) => `
const pending = []

const send = (message) => self.postMessage(message)
const emit = (stream, text) => send({ type: 'output', stream, text: text.endsWith('\\n') ? text : text + '\\n' })

self.onmessage = async (event) => {
  const data = event.data
  if (!data) return

  if (data.type === 'input') {
    pending.push(data.value)
    return
  }

  if (data.type !== 'run') return

  try {
    importScripts('${origin}${WASMOON_PATH}')
    const factory = new self.wasmoon.LuaFactory('${origin}${LUA_WASM_PATH}')
    const engine = await factory.createEngine()
    engine.global.set('print', (...args) => {
      emit('stdout', args.map((value) => String(value)).join('\\t') + '\\n')
    })
    engine.global.set('leer', () => (pending.length ? pending.shift() : ''))
    await engine.doString(data.code)
    send({ type: 'done', exitCode: 0 })
  } catch (error) {
    emit('stderr', String(error && error.message ? error.message : error))
    send({ type: 'done', exitCode: 1 })
  }
}
`

export const luaRuntime: BrowserRuntime = {
  id: 'lua',
  label: 'Lua (Wasmoon)',
  place: 'Wasmoon · WebAssembly',
  run: (options: RuntimeOptions): RuntimeSession => {
    const origin = typeof location === 'undefined' ? '' : location.origin
    const timeoutMs = options.timeoutMs ?? 12_000
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
        | { type: 'done'; exitCode: number }
        | undefined
      if (!data) return

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
        text: `${event.message || 'No se pudo cargar el runtime de Lua.'}\n`,
      })
      stop(1)
    }

    worker.postMessage({ type: 'run', code: options.code })

    return {
      write: (line: string) => {
        worker.postMessage({ type: 'input', value: line })
        options.onInputRequest?.('')
      },
      closeInput: () => undefined,
      terminate: () => stop(130),
    }
  },
}
