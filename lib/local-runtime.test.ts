import { describe, expect, it } from 'vitest'

import { prepareLocalCode, stripTypeScript } from './local-runtime'

describe('preparación del código local', () => {
  it('quita las anotaciones de TypeScript', () => {
    const code = 'function suma(a: number, b: number): number {\n  const total: number = a + b\n  return total\n}\n'
    const stripped = stripTypeScript(code)
    expect(stripped).not.toContain(': number')
    expect(stripped).toContain('function suma')
    expect(stripped).toContain('const total')
  })

  it('deja el JavaScript intacto', () => {
    expect(prepareLocalCode('javascript', 'const a = 1\n')).toBe('const a = 1\n')
  })

  it('acepta el ejemplo de TypeScript del proyecto', () => {
    const code = 'function fibonacci(count: number): number[] {\n  const sequence: number[] = [0, 1]\n\n  for (let index = 2; index < count; index += 1) {\n    sequence.push(sequence[index - 1] + sequence[index - 2])\n    console.log(`F(${index}) = ${sequence[index]}`)\n  }\n\n  return sequence.slice(0, count)\n}\n'
    const stripped = stripTypeScript(code)
    expect(stripped).not.toContain(': number')
    expect(stripped).not.toContain(': number[]')
  })
})
