import type { Language } from '@/lib/languages'
import { cRuntime, cppRuntime } from '@/lib/runtimes/clang'
import { csharpRuntime } from '@/lib/runtimes/csharp'
import { goRuntime } from '@/lib/runtimes/go'
import { javaRuntime } from '@/lib/runtimes/java'
import { javascriptRuntime } from '@/lib/runtimes/javascript'
import { luaRuntime } from '@/lib/runtimes/lua'
import { pythonRuntime } from '@/lib/runtimes/python'
import { rustRuntime } from '@/lib/runtimes/rust'
import type { BrowserRuntime } from '@/lib/runtimes/types'

/**
 * Registro de runtimes del navegador.
 *
 * Un runtime es un archivo: el resto de la aplicación no sabe nada de cómo
 * se ejecuta cada lenguaje. Añadir uno nuevo es añadirlo aquí.
 */

export const BROWSER_RUNTIMES: Partial<Record<Language, BrowserRuntime>> = {
  javascript: javascriptRuntime,
  typescript: javascriptRuntime,
  python: pythonRuntime,
  lua: luaRuntime,
  go: goRuntime,
  c: cRuntime,
  cpp: cppRuntime,
  java: javaRuntime,
  csharp: csharpRuntime,
  rust: rustRuntime,
}

/** Devuelve el runtime del lenguaje, si existe en el navegador. */
export function getBrowserRuntime(language: Language): BrowserRuntime | undefined {
  return BROWSER_RUNTIMES[language]
}

/** Idiomas que se pueden ejecutar en el navegador. */
export function isRunnableInBrowser(language: Language): boolean {
  return Boolean(BROWSER_RUNTIMES[language])
}

export type { BrowserRuntime } from '@/lib/runtimes/types'
export { missingRuntimeMessage } from '@/lib/runtimes/types'
