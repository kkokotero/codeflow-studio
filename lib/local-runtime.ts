'use client'

import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import generate from '@babel/generator'
import type { Language } from '@/lib/languages'

/**
 * Ejecución local del código en el navegador.
 *
 * El programa corre dentro de un Web Worker: no tiene DOM ni acceso a la
 * página, así que es un aislamiento real. La consola del worker se sustituye
 * por un puente que envía cada línea al panel de la aplicación, y la entrada
 * estándar se resuelve con lo que el usuario escriba en la consola.
 */

export interface LocalExecutionChunk {
  stream: 'stdout' | 'stderr'
  text: string
}

export interface LocalExecutionResult {
  exitCode: number
  durationMs: number
  timedOut: boolean
  outputTruncated: boolean
  output: LocalExecutionChunk[]
}

export interface LocalRuntimeOptions {
  code: string
  language: Language
  timeoutMs?: number
  maxOutputBytes?: number
  /** Recibe la salida a medida que se produce. */
  onOutput: (chunk: LocalExecutionChunk) => void
  /** El programa pide una línea por la entrada estándar. */
  onInputRequest?: (prompt: string) => void
  /** Avisa de que la ejecución ha terminado. */
  onExit: (result: LocalExecutionResult) => void
}

export interface LocalRuntimeHandle {
  /** Escribe una línea en la entrada estándar del programa. */
  write: (line: string) => void
  /** Cierra la entrada estándar: el programa recibe el fin de la entrada. */
  closeInput: () => void
  /** Detiene la ejecución. */
  terminate: () => void
}

/** El programa que corre dentro del worker. */
const WORKER_SOURCE = `
const stringify = (value) => {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.stack || value.message
  if (typeof value === 'function') return value.toString()
  try {
    const json = JSON.stringify(value)
    return json === undefined ? String(value) : json
  } catch {
    return String(value)
  }
}

const pending = new Map()
let nextId = 0

const send = (message) => self.postMessage(message)
const emit = (stream, args) => send({ type: 'output', stream, text: args.map(stringify).join(' ') + '\\n' })

const consoleShim = {
  log: (...args) => emit('stdout', args),
  info: (...args) => emit('stdout', args),
  debug: (...args) => emit('stdout', args),
  dir: (...args) => emit('stdout', args),
  table: (...args) => emit('stdout', args),
  warn: (...args) => emit('stderr', args),
  error: (...args) => emit('stderr', args),
  trace: (...args) => emit('stderr', args),
}

// Entrada estándar: el programa pide una línea y la consola responde.
const readLine = (prompt = '') => new Promise((resolve) => {
  const id = ++nextId
  pending.set(id, resolve)
  send({ type: 'input-request', id, prompt: String(prompt) })
})

self.console = consoleShim
self.read = readLine
self.prompt = readLine

self.addEventListener('error', (event) => {
  emit('stderr', [event.message || 'Error inesperado en la ejecución'])
})

self.onmessage = (event) => {
  const data = event.data
  if (!data) return

  if (data.type === 'answer') {
    const resolve = pending.get(data.id)
    if (resolve) {
      pending.delete(data.id)
      resolve(data.value === undefined ? null : data.value)
    }
    return
  }

  if (data.type !== 'run') return

  try {
    // El programa va dentro de una función asíncrona: así la espera de nivel
    // superior funciona igual que en un módulo.
    const run = new Function(
      'console',
      'read',
      'prompt',
      '"use strict";\\nreturn (async () => {\\n' + data.code + '\\n})()',
    )
    const result = run(consoleShim, readLine, readLine)
    if (result && typeof result.then === 'function') {
      result
        .then(() => send({ type: 'done', exitCode: 0 }))
        .catch((error) => {
          emit('stderr', [error])
          send({ type: 'done', exitCode: 1 })
        })
    } else {
      send({ type: 'done', exitCode: 0 })
    }
  } catch (error) {
    emit('stderr', [error])
    send({ type: 'done', exitCode: 1 })
  }
}
`

/**
 * Quita las anotaciones de TypeScript para poder ejecutar el archivo en el
 * navegador. Se apoya en el mismo analizador de Babel que usa el diagrama.
 */
export function stripTypeScript(code: string): string {
  const ast = parse(code, {
    sourceType: 'unambiguous',
    plugins: ['typescript'],
    errorRecovery: false,
  })

  const remove = (path: { remove: () => void }) => path.remove()
  const unwrap = (path: { node: { expression: unknown }; replaceWith: (node: unknown) => void }) => {
    path.replaceWith(path.node.expression)
  }

  traverse(ast, {
    TSTypeAnnotation: remove,
    TSTypeParameterDeclaration: remove,
    TSTypeParameterInstantiation: remove,
    TSAsExpression: unwrap,
    TSSatisfiesExpression: unwrap,
    TSNonNullExpression: unwrap,
    TSInstantiationExpression: unwrap,
    TSTypeAliasDeclaration: remove,
    TSInterfaceDeclaration: remove,
    TSDeclareFunction: remove,
    TSModuleDeclaration: remove,
    TSImportEqualsDeclaration: remove,
    TSExportAssignment: remove,
  })

  return generate(ast, { comments: true }).code
}

/** Prepara el código que se ejecutará en el navegador. */
export function prepareLocalCode(language: Language, code: string): string {
  if (language === 'typescript') return stripTypeScript(code)
  return code
}

/**
 * Arranca el programa en un worker y devuelve el mando para escribir en él.
 *
 * La salida llega en dos partes: `onOutput` en vivo y `onExit` al terminar.
 */
export function runLocally(options: LocalRuntimeOptions): LocalRuntimeHandle {
  const timeoutMs = options.timeoutMs ?? 8_000
  const maxOutputBytes = options.maxOutputBytes ?? 16_384
  const startedAt = Date.now()
  const output: LocalExecutionChunk[] = []
  let bytes = 0
  let finished = false
  let timedOut = false
  let truncated = false
  let waitingFor: number | null = null

  const blobUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }))
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
      | { type: 'input-request'; id: number; prompt: string }
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

    if (data.type === 'input-request') {
      waitingFor = data.id
      options.onInputRequest?.(data.prompt)
      return
    }

    if (data.type === 'done') {
      report(data.exitCode)
      // Se cierra después de un respiro: el programa puede tener tareas
      // pendientes que todavía escriben en la salida.
      setTimeout(() => {
        worker.terminate()
        URL.revokeObjectURL(blobUrl)
      }, 250)
    }
  }

  worker.onerror = (event) => {
    options.onOutput({
      stream: 'stderr',
      text: `${event.message || 'No se pudo ejecutar el programa en el navegador.'}\n`,
    })
    stop(1)
  }

  worker.postMessage({ type: 'run', code: options.code })

  return {
    write: (line: string) => {
      if (waitingFor === null) return
      const id = waitingFor
      waitingFor = null
      worker.postMessage({ type: 'answer', id, value: line })
    },
    closeInput: () => {
      if (waitingFor === null) return
      const id = waitingFor
      waitingFor = null
      worker.postMessage({ type: 'answer', id, value: null })
    },
    terminate: () => stop(130),
  }
}
