import type { Language } from '@/lib/codeflow-types'

export interface RuntimeAdapter {
  language: Language
  label: string
  extension: string
  startupLimitMs: number
  executionLimitMs: number
  createWorker: () => Worker
}

export const runtimeAdapters: Record<Language, RuntimeAdapter> = {
  javascript: {
    language: 'javascript',
    label: 'Worker JS',
    extension: '.js',
    startupLimitMs: 10_000,
    executionLimitMs: 10_000,
    createWorker: () => new Worker(new URL('./javascript.worker.ts', import.meta.url), { type: 'module' }),
  },
  python: {
    language: 'python',
    label: 'Pyodide · WASM',
    extension: '.py',
    startupLimitMs: 90_000,
    executionLimitMs: 10_000,
    createWorker: () => new Worker('/workers/python-runtime.js'),
  },
}
