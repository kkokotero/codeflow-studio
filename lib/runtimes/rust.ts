import type { BrowserRuntime, RuntimeOptions, RuntimeSession } from '@/lib/runtimes/types'
import { PROGRESS_HELPER, runtimeAssetUrls } from '@/lib/runtimes/assets'
import { MAX_TOOLCHAIN_TIME_MS } from '@/lib/runtime-safety'

/**
 * Runtime de Rust en el navegador.
 *
 * Rubrc trae el propio `rustc` y `cargo` compilados a WebAssembly: el fuente
 * se compila dentro de la pestaña y el programa se ejecuta ahí mismo, sin
 * servidor. La cadena de herramientas son 56 MB que se descargan la primera
 * vez, con barra de progreso, y se quedan en memoria para las siguientes
 * ejecuciones.
 *
 * El compilador es el mismo que usa una terminal: `cargo` con un proyecto
 * mínimo en `/src/main.rs`, compilado para `wasm32-wasip1`.
 */

const RUBRC_PATH = '/runtimes/@kreijstal/rubrc/'

const workerSource = (origin: string) => `
const send = (message) => self.postMessage(message)
const emit = (stream, text) => send({ type: 'output', stream, text: text.endsWith('\\n') ? text : text + '\\n' })

${PROGRESS_HELPER}

let rubrc = null
let cola = Promise.resolve()

const decoder = new TextDecoder()

/** Ejecuta una orden en la terminal del compilador y devuelve su salida. */
const runCommand = async (command) => {
  const pieces = []
  const handle = rubrc.exec(command, (chunk) => {
    pieces.push(decoder.decode(chunk))
  })
  await handle.done
  return pieces.join('')
}

/** Los mensajes de depuración del propio compilador no son del programa. */
const clean = (text) => text
  .split('\\n')
  .filter((line) => !line.startsWith('DEBUG:'))
  .join('\\n')

const boot = async () => {
  const base = '${origin}${RUBRC_PATH}'

  // La cadena de herramientas se descarga con barra de progreso y queda en la
  // caché del navegador: el motor la vuelve a pedir y la recibe al instante.
  await warmFiles(${JSON.stringify(runtimeAssetUrls(origin, 'rust'))})

  const modulo = await import(base + 'host.js')
  rubrc = modulo.createRubrc({
    base,
    files: {
      'Cargo.toml': '[package]\\nname = "main"\\nversion = "0.1.0"\\nedition = "2021"\\n',
      '.cargo/config.toml': '',
    },
    onLog: () => {},
  })

  // La biblioteca estándar que necesita el compilador para enlazar.
  await runCommand('load_sysroot')
  send({ type: 'ready' })
}

const procesar = async (data) => {
  try {
    if (!rubrc) await boot()

    await rubrc.writeFile('/src/main.rs', data.code)

    const compilacion = clean(await runCommand('cargo build --offline --quiet'))
    if (compilacion.trim()) emit('stderr', compilacion)
    if (/error\\[E|error:/.test(compilacion)) {
      send({ type: 'done', exitCode: 1 })
      return
    }

    const salida = clean(await runCommand('cargo run --offline --quiet'))
    if (salida.trim()) emit('stdout', salida)
    send({ type: 'done', exitCode: 0 })
  } catch (error) {
    emit('stderr', String(error && error.message ? error.message : error) + '\\n')
    send({ type: 'done', exitCode: 1 })
  }
}

// Las ejecuciones van en fila: el compilador no admite dos a la vez.
self.onmessage = (event) => {
  const data = event.data
  if (!data || data.type !== 'run') return
  cola = cola.then(() => procesar(data))
}
`
/**
 * El compilador pesa 400 MB instantiated: el worker se queda vivo entre
 * ejecuciones para no pagar el arranque cada vez.
 */
let worker: Worker | null = null

function ensureWorker(origin: string): Worker {
  if (worker) return worker
  const blobUrl = URL.createObjectURL(new Blob([workerSource(origin)], { type: 'text/javascript' }))
  const instance = new Worker(blobUrl, { type: 'module' })
  worker = instance
  return instance
}

export const rustRuntime: BrowserRuntime = {
  id: 'rust',
  label: 'Rust (rustc · WebAssembly)',
  place: 'rustc · WebAssembly',
  run: (options: RuntimeOptions): RuntimeSession => {
    const origin = typeof location === 'undefined' ? '' : location.origin
    const timeoutMs = options.timeoutMs ?? MAX_TOOLCHAIN_TIME_MS
    const maxOutputBytes = options.maxOutputBytes ?? 16_384
    const startedAt = Date.now()
    const output: { stream: 'stdout' | 'stderr'; text: string }[] = []
    let bytes = 0
    let finished = false
    let timedOut = false
    let truncated = false
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

    const instance = ensureWorker(origin)

    watchdog = setTimeout(() => {
      timedOut = true
      report(124)
    }, timeoutMs)

    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type: 'output'; stream: 'stdout' | 'stderr'; text: string }
        | { type: 'progress'; label: string; loaded: number; total: number }
        | { type: 'ready' }
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
          report(1)
          return
        }
        output.push({ stream: data.stream, text: data.text })
        options.onOutput({ stream: data.stream, text: data.text })
        return
      }

      if (data.type === 'done') {
        instance.removeEventListener('message', onMessage)
        report(data.exitCode)
      }
    }

    instance.addEventListener('message', onMessage)
    instance.postMessage({ type: 'run', code: options.code })

    return {
      write: () => undefined,
      closeInput: () => undefined,
      terminate: () => {
        instance.removeEventListener('message', onMessage)
        report(130)
      },
    }
  },
}
