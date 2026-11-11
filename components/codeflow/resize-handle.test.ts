import { describe, expect, it } from 'vitest'

import { mergePersistentValue } from '@/components/codeflow/resize-handle'

interface Layout {
  files: number
  expanded: string[]
  consoleCollapsed: boolean
}

const defaults: Layout = { files: 240, expanded: [], consoleCollapsed: false }

describe('estado persistente', () => {
  it('añade los campos que falten en un valor guardado', () => {
    const stored = { files: 320 }
    const merged = mergePersistentValue(defaults, stored)

    expect(merged.files).toBe(320)
    expect(merged.expanded).toEqual([])
    expect(merged.consoleCollapsed).toBe(false)
  })

  it('conserva los arrays guardados', () => {
    const merged = mergePersistentValue(defaults, { expanded: ['a'], consoleCollapsed: true })

    expect(merged.expanded).toEqual(['a'])
    expect(merged.consoleCollapsed).toBe(true)
  })

  it('sustituye el valor cuando no es un objeto', () => {
    expect(mergePersistentValue(defaults, 'basura')).toBe('basura')
    expect(mergePersistentValue(defaults, null)).toBe(null)
    expect(mergePersistentValue(defaults, [1, 2])).toEqual([1, 2])
  })
})
