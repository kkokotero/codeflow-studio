/**
 * Límites de la ejecución local.
 *
 * Todo corre en el navegador, dentro de un Web Worker: no hay peticiones al
 * servidor ni cupo compartido. Los límites solo acotan lo que puede hacer
 * un programa en la pestaña del usuario.
 */

export const MAX_EXECUTION_SOURCE_BYTES = 50_000
export const MAX_EXECUTION_OUTPUT_BYTES = 16_384
export const MAX_EXECUTION_TIME_MS = 8_000

/** Tope de tiempo para los runtimes que arrancan una máquina (Python, Lua). */
export const MAX_RUNTIME_BOOT_TIME_MS = 20_000

export const EXECUTION_LIMIT_NOTICE =
  'El programa corre en una pestaña del navegador: 8 s de ejecución, 16 KB de salida y sin acceso a la red.'
