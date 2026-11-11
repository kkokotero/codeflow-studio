import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'

import { archivePrefix, buildArchive } from './project-archive'

describe('archivo de proyecto', () => {
  it('empaqueta el código con la estructura de carpetas', () => {
    const zipped = buildArchive([
      { path: 'demo/proyecto.codeflow.json', content: '{"format":"codeflow-project"}' },
      { path: 'demo/src/main.js', content: 'console.log(1)' },
      { path: 'demo/src/lib/util.js', content: 'export const a = 1' },
    ])

    const entries = unzipSync(zipped)
    expect(Object.keys(entries).sort()).toEqual([
      'demo/proyecto.codeflow.json',
      'demo/src/lib/util.js',
      'demo/src/main.js',
    ])
    expect(new TextDecoder().decode(entries['demo/src/main.js'])).toBe('console.log(1)')
  })

  it('acepta contenido binario junto al texto', () => {
    const zipped = buildArchive([
      { path: 'demo/diagrama.png', content: new Uint8Array([137, 80, 78, 71]) },
    ])

    const entries = unzipSync(zipped)
    expect(Array.from(entries['demo/diagrama.png'])).toEqual([137, 80, 78, 71])
  })

  it('normaliza el nombre del proyecto para usarlo como carpeta', () => {
    expect(archivePrefix('Taller de algoritmos')).toBe('taller-de-algoritmos')
    expect(archivePrefix('  ')).toBe('proyecto')
    expect(archivePrefix('Añadir Ñandú')).toBe('anadir-nandu')
  })
})
