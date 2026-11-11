import type { Language } from '@/lib/languages'

/**
 * Contrato de los runtimes que se ejecutan en el navegador.
 *
 * Todos los runtimes son igual desde fuera: reciben el código, avisan de la
 * salida, aceptan datos por la entrada estándar y terminan avisando del
 * resultado. Añadir un lenguaje es escribir un archivo más en esta carpeta.
 */

export interface RuntimeOutput {
  stream: 'stdout' | 'stderr'
  text: string
}

export interface RuntimeResult {
  exitCode: number
  durationMs: number
  timedOut: boolean
  outputTruncated: boolean
  output: RuntimeOutput[]
}

export interface RuntimeOptions {
  code: string
  /** Avisa de la salida a medida que se produce. */
  onOutput: (chunk: RuntimeOutput) => void
  /** El runtime reinicia la salida: el programa vuelve a empezar. */
  onReset?: () => void
  /** Descarga de las herramientas del runtime: el usuario ve el avance. */
  onProgress?: (progress: { label: string; loaded: number; total: number }) => void
  /** El programa pide una línea por la entrada estándar. */
  onInputRequest?: (prompt: string) => void
  /** La ejecución ha terminado. */
  onExit: (result: RuntimeResult) => void
  timeoutMs?: number
  maxOutputBytes?: number
}

export interface RuntimeSession {
  /** Escribe una línea en la entrada estándar del programa. */
  write: (line: string) => void
  /** Cierra la entrada estándar: el programa recibe el fin de la entrada. */
  closeInput: () => void
  /** Detiene la ejecución. */
  terminate: () => void
}

export interface BrowserRuntime {
  /** Identificador del runtime, el mismo que el lenguaje que ejecuta. */
  id: Language
  /** Nombre visible del runtime. */
  label: string
  /** Descripción corta de dónde corre. */
  place: string
  /**
   * Prepara el entorno. Se llama una vez y puede descargar un runtime pesado
   * (por eso es asíncrono y se avisa antes de empezar).
   */
  prepare?: () => Promise<void>
  /** Arranca el programa. */
  run: (options: RuntimeOptions) => RuntimeSession
}

/** Mensaje que se muestra cuando el lenguaje no tiene runtime en el navegador. */
export function missingRuntimeMessage(language: Language): string {
  const label = LANGUAGE_LABELS[language] ?? language
  return `${label} se analiza y se dibuja, pero no tiene un runtime de navegador: sus programas no se pueden ejecutar aquí.`
}

const LANGUAGE_LABELS: Partial<Record<Language, string>> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  lua: 'Lua',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  go: 'Go',
  rust: 'Rust',
}
