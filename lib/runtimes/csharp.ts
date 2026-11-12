import type { BrowserRuntime, RuntimeOptions, RuntimeSession } from '@/lib/runtimes/types'
import { MAX_COMPILER_TIME_MS } from '@/lib/runtime-safety'

/**
 * Runtime de C# en el navegador.
 *
 * Blazor WebAssembly trae el runtime de .NET y el compilador de Roslyn
 * dentro de la página: el fuente se compila y se ejecuta sin servidor. Son
 * unos 45 MB que se descargan la primera vez, con barra de progreso.
 *
 * A diferencia de los demás motores, este necesita un DOM mínimo (Blazor
 * busca su punto de anclaje) y trabaja en el hilo principal: el worker se
 * queda con la interfaz libre mientras compila.
 */

const BLAZOR_PATH = '/runtimes/@live-codes/blazor-wasm/'

interface BlazorDiagnostic {
  message: string
  severity?: string
  line?: number
  column?: number
}

interface BlazorRunResult {
  success: boolean
  output: string
  errors: BlazorDiagnostic[]
}

interface BlazorRunner {
  ready: () => Promise<void>
  run: (source: string, stdin?: string) => Promise<BlazorRunResult>
}

interface BlazorRunnerApi {
  create: (options: {
    baseUrl: string
    root?: HTMLElement
    onProgress?: (count: number) => void
  }) => BlazorRunner
}

declare global {
  interface Window {
    BlazorRunner?: BlazorRunnerApi
  }
}

let runner: BlazorRunner | null = null
let boot: Promise<BlazorRunner> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar el runtime de C#.'))
    document.head.appendChild(script)
  })
}

/** Nombre corto del archivo que se está descargando. */
function assetLabel(url: string): string {
  const name = url.slice(url.lastIndexOf('/') + 1)
  const dot = name.indexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

/**
 * Sigue las descargas del runtime.
 *
 * Blazor pide las piezas por `fetch`, así que se mira lo que pasa por ahí
 * para poder mostrar el avance. La cadena de llamadas se deja intacta: al
 * terminar solo se apaga el seguimiento.
 */
function trackDownloads(
  baseUrl: string,
  onProgress: (progress: { label: string; loaded: number; total: number }) => void,
): () => void {
  const original = window.fetch.bind(window)
  let tracking = true

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
    if (!tracking || !url.startsWith(baseUrl)) return original(input, init)

    const response = await original(input, init)
    if (!response.body) return response

    const total = Number(response.headers.get('content-length') || 0)
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.byteLength
      onProgress({ label: assetLabel(url), loaded, total })
    }

    const buffer = new Uint8Array(loaded)
    let offset = 0
    for (const chunk of chunks) {
      buffer.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new Response(buffer, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }

  return () => {
    tracking = false
  }
}

/** Arranca el runtime de .NET una sola vez y lo reutiliza. */
function ensureRunner(onProgress: (progress: { label: string; loaded: number; total: number }) => void): Promise<BlazorRunner> {
  if (runner) return Promise.resolve(runner)
  if (boot) return boot

  boot = (async () => {
    const baseUrl = BLAZOR_PATH
    if (!window.BlazorRunner) {
      await loadScript(baseUrl + 'blazor-wasm.js')
    }
    const api = window.BlazorRunner
    if (!api) throw new Error('No se pudo cargar el runtime de C#.')

    // Blazor busca un punto de anclaje en la página: uno escondido basta.
    const container = document.createElement('div')
    container.style.display = 'none'
    document.body.appendChild(container)

    const stopTracking = trackDownloads(baseUrl, onProgress)
    const instance = api.create({ baseUrl, root: container })
    try {
      await instance.ready()
    } finally {
      stopTracking()
    }
    runner = instance
    return instance
  })()

  boot.catch(() => {
    boot = null
  })

  return boot
}

export const csharpRuntime: BrowserRuntime = {
  id: 'csharp',
  label: 'C# (.NET · WebAssembly)',
  place: '.NET · WebAssembly',
  run: (options: RuntimeOptions): RuntimeSession => {
    const timeoutMs = options.timeoutMs ?? MAX_COMPILER_TIME_MS
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

    const push = (stream: 'stdout' | 'stderr', text: string) => {
      if (!text) return
      bytes += text.length
      if (bytes > maxOutputBytes) {
        truncated = true
        report(1)
        return
      }
      output.push({ stream, text })
      options.onOutput({ stream, text })
    }

    watchdog = setTimeout(() => {
      timedOut = true
      report(124)
    }, timeoutMs)

    ensureRunner((progress) => options.onProgress?.(progress))
      .then((instance) => instance.run(options.code, ''))
      .then((result) => {
        push('stdout', result.output ?? '')
        for (const diagnostic of result.errors ?? []) {
          const where = diagnostic.line ? ` (línea ${diagnostic.line})` : ''
          push('stderr', `${diagnostic.message}${where}\n`)
        }
        report(result.success ? 0 : 1)
      })
      .catch((error: unknown) => {
        push('stderr', `${error instanceof Error ? error.message : String(error)}\n`)
        report(1)
      })

    return {
      write: () => undefined,
      closeInput: () => undefined,
      terminate: () => report(130),
    }
  },
}
