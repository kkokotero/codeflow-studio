export const MAX_EXECUTION_SOURCE_BYTES = 50_000
export const MAX_EXECUTION_OUTPUT_BYTES = 16_384
export const MAX_EXECUTION_TIME_MS = 8_000
export const MAX_EXECUTIONS_PER_MINUTE = 5

export const EXECUTION_LIMIT_NOTICE =
  'Cada ejecución usa una microVM efímera: 1 vCPU, 2 GB de memoria, red bloqueada, máximo 8 s y 16 KB de salida.'

export const EXECUTION_READY_NOTICE =
  'MicroVM aislada lista · sin acceso a red · salida limitada.'
