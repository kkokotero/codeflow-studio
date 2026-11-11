import { describe, expect, it } from 'vitest'

import {
  buildSourceLine,
  pseudoAssignment,
  pseudoCall,
  pseudoExpression,
  pseudoStatement,
  pseudoText,
  replaceHeaderExpression,
} from './pseudo-code'

describe('pseudo-código común', () => {
  it('normaliza los operadores al mismo idioma', () => {
    expect(pseudoExpression('a === b && c !== d')).toBe('a = b y c ≠ d')
    expect(pseudoExpression('x % 2 === 0')).toBe('x mod 2 = 0')
    expect(pseudoExpression('!ready')).toBe('no ready')
    expect(pseudoExpression('a and b or c')).toBe('a y b o c')
    expect(pseudoExpression('total := 0')).toBe('total ← 0')
  })

  it('respeta las cadenas de texto', () => {
    expect(pseudoExpression('printf("%d: %s", a, b)')).toBe('printf("%d: %s", a, b)')
    expect(pseudoExpression('log("a && b")')).toBe('log("a && b")')
  })

  it('lee una asignación con su destino y su valor', () => {
    const assignment = pseudoAssignment('let total = 0')
    expect(assignment?.target).toBe('total')
    expect(assignment?.value).toBe('0')
    expect(pseudoText(assignment!)).toBe('total ← 0')
  })

  it('no confunde una comparación con una asignación', () => {
    expect(pseudoAssignment('a == b')).toBeNull()
    expect(pseudoAssignment('a != b')).toBeNull()
  })

  it('guarda el tipo declarado del destino', () => {
    expect(pseudoAssignment('int total = 0')?.target).toBe('total')
    expect(pseudoAssignment('int total = 0')?.type).toBe('int')
    expect(pseudoAssignment('total: int = 0')?.type).toBe('int')
  })

  it('describe la salida y la lectura con el mismo verbo', () => {
    expect(pseudoCall('console.log(total)')?.form).toBe('print')
    expect(pseudoCall('fmt.Println(total)')?.form).toBe('print')
    expect(pseudoCall('print(total)')?.form).toBe('print')
    expect(pseudoCall('input()')?.form).toBe('read')
    expect(pseudoCall('compute(total)')?.form).toBe('call')
    expect(pseudoCall('compute(total)')?.name).toBe('compute')
  })

  it('clasifica una instrucción suelta con el vocabulario común', () => {
    expect(pseudoStatement('return total').form).toBe('return')
    expect(pseudoStatement('raise ValueError("x")').form).toBe('throw')
    expect(pseudoStatement('import "fmt"').form).toBe('import')
    expect(pseudoStatement('total += index').form).toBe('assign')
    expect(pseudoStatement('total += index').value).toBe('total + index')
  })

  it('reconstruye la instrucción en el lenguaje del archivo', () => {
    expect(buildSourceLine('javascript', { form: 'print', value: 'total' })).toBe('console.log(total)')
    expect(buildSourceLine('python', { form: 'print', value: 'total' })).toBe('print(total)')
    expect(buildSourceLine('go', { form: 'print', value: 'total' })).toBe('fmt.Println(total)')
    expect(buildSourceLine('python', { form: 'assign', target: 'total', value: '0' })).toBe('total = 0')
    expect(buildSourceLine('javascript', { form: 'return', value: 'total' })).toBe('return total')
  })

  it('conserva la declaración al reescribir una asignación', () => {
    expect(buildSourceLine('javascript', { form: 'assign', target: 'total', value: '0' }, 'const total = 0')).toBe('const total = 0')
    expect(buildSourceLine('c', { form: 'assign', target: 'total', value: '0', type: 'int' }, 'int total = 0;')).toBe('int total = 0')
  })

  it('sustituye la condición de una cabecera sin tocar el bloque', () => {
    expect(replaceHeaderExpression('javascript', 'if (value < min) {', 'value <= min')).toBe('if (value <= min) {')
    expect(replaceHeaderExpression('python', 'if value < min:', 'value <= min')).toBe('if value <= min:')
    expect(replaceHeaderExpression('lua', 'if value < min then', 'value <= min')).toBe('if value <= min then')
  })
})
