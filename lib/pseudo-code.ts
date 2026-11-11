import type { Language } from '@/lib/languages'
import type { PseudoForm, PseudoInstruction } from '@/lib/codeflow-types'
import { compactSource } from '@/lib/flow-graph-builder'

export type { PseudoForm, PseudoInstruction }

/**
 * Pseudo-código común a todos los lenguajes.
 *
 * Un diagrama se lee mejor cuando todos los lenguajes hablan el mismo
 * idioma: `total ← 0`, `imprimir(total)`, `devolver(total)`. Aquí vive ese
 * idioma: el vocabulario, la normalización de expresiones y las reglas para
 * reconstruir una instrucción en el lenguaje del archivo.
 */

/** Etiquetas legibles de cada forma, para los botones del editor. */
export const PSEUDO_FORM_LABELS: Record<PseudoForm, string> = {
  assign: 'Asignación',
  call: 'Llamada',
  print: 'Salida',
  read: 'Lectura',
  return: 'Devolver',
  throw: 'Error',
  import: 'Importar',
  define: 'Definir',
  class: 'Tipo',
  condition: 'Condición',
  loop: 'Bucle',
  break: 'Salir',
  continue: 'Continuar',
  statement: 'Instrucción',
}

/** Silueta del diagrama que corresponde a cada forma. */
export const PSEUDO_FORM_SHAPES: Record<PseudoForm, 'process' | 'decision' | 'input-output' | 'terminator'> = {
  assign: 'process',
  call: 'process',
  print: 'input-output',
  read: 'input-output',
  return: 'terminator',
  throw: 'terminator',
  import: 'process',
  define: 'process',
  class: 'process',
  condition: 'decision',
  loop: 'decision',
  break: 'terminator',
  continue: 'terminator',
  statement: 'process',
}

/** Verbo de cada forma: el idioma compartido del diagrama. */
export const PSEUDO = {
  assign: (target: string, value: string) => `${target} ← ${value}`,
  call: (name: string, args = '') => `${name}(${args})`,
  print: (value = '') => `imprimir(${value})`,
  read: (target = '') => `leer(${target})`,
  return: (value = '') => `devolver(${value})`,
  throw: (value = '') => `lanzar(${value})`,
  import: (name: string) => `importar(${name})`,
  define: (name: string) => `definir ${name}()`,
  class: (name: string) => `definir clase ${name}`,
  condition: (value: string) => `¿${value}?`,
  loop: (value: string) => `¿${value}?`,
  break: () => 'salir del bucle',
  continue: () => 'siguiente iteración',
  statement: (value: string) => value,
}

const OUTPUT_FUNCTIONS = new Set([
  'console.log', 'console.info', 'console.warn', 'console.error', 'alert',
  'print', 'println', 'printf', 'puts', 'putchar', 'writeln', 'write', 'echo',
  'fmt.print', 'fmt.printf', 'fmt.println', 'io.write', 'io.writeln',
  'system.out.print', 'system.out.println', 'system.err.print', 'system.err.println',
  'std::cout', 'std::cerr', 'cout', 'cerr', 'console.writeline',
])

const INPUT_FUNCTIONS = new Set([
  'input', 'readline', 'readln', 'scanf', 'gets', 'cin', 'read', 'stdin.read', 'console.readline',
])

/** Normaliza el nombre de una función: sin módulo, sin macro y en minúsculas. */
function bareFunctionName(name: string): string {
  const withoutMacro = name.replace(/!$/, '')
  const segments = withoutMacro.split(/[.:]{1,2}|->/)
  const last = segments.at(-1) ?? withoutMacro
  return last.toLowerCase()
}

/** ¿La función escribe en la salida estándar? */
export function isOutputFunction(name: string): boolean {
  const bare = bareFunctionName(name)
  if (OUTPUT_FUNCTIONS.has(bare)) return true
  return OUTPUT_FUNCTIONS.has(name.toLowerCase())
}

/** ¿La función lee de la entrada estándar? */
export function isInputFunction(name: string): boolean {
  const bare = bareFunctionName(name)
  if (INPUT_FUNCTIONS.has(bare)) return true
  return INPUT_FUNCTIONS.has(name.toLowerCase())
}

const OPERATOR_PATTERN = /===|!==|==|!=|<=|>=|&&|\|\||!|%|\*\*|->|=>|:=|=/g
const LITERAL_PATTERN = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g

/**
 * Normaliza una expresión al operadores comunes.
 *
 * `a === b` se lee `a = b`, `a && b` se lee `a y b` y `x % 2` se lee `x mod 2`:
 * el mismo concepto escrito igual en los diez lenguajes. Las cadenas de
 * texto se respetan tal cual: un `%d` de un formato no es un módulo.
 */
export function pseudoExpression(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  const literals: string[] = []
  const masked = compact.replace(LITERAL_PATTERN, (match) => {
    literals.push(match)
    return `\u0000${literals.length - 1}\u0000`
  })
  const words = masked
    .replace(/\bTrue\b/g, 'verdadero')
    .replace(/\bFalse\b/g, 'falso')
    .replace(/\bNone\b/g, 'nulo')
    .replace(/\bundefined\b/g, 'sin definir')
    .replace(/\bnull\b/g, 'nulo')
    .replace(/\bnot\b/g, 'no ')
    .replace(/\band\b/g, ' y ')
    .replace(/\bor\b/g, ' o ')
  const result = words.replace(OPERATOR_PATTERN, (match) => {
    switch (match) {
      case '===':
      case '==':
        return '='
      case '!==':
      case '!=':
        return '≠'
      case '&&':
        return ' y '
      case '||':
        return ' o '
      case '!':
        return 'no '
      case '%':
        return ' mod '
      case '**':
        return '^'
      case '->':
      case '=>':
        return '→'
      case ':=':
        return '←'
      default:
        return match
    }
  })
  return result.replace(/\u0000(\d+)\u0000/g, (_match, index) => literals[Number(index)] ?? '').replace(/\s+/g, ' ').trim()
}

/** Separa el destino de una asignación de su tipo declarado. */
export function pseudoTarget(raw: string): { name: string; type?: string } {
  let target = raw.trim().replace(/\s+/g, ' ')
  target = target.replace(/^(?:(?:const|let|var|val|final|static|public|private|protected|internal|readonly|auto|mut|pub|inline|extern)\s+)+/i, '')
  const typed = target.match(/^([A-Za-z_][\w<>\[\],.]*)\s+([A-Za-z_]\w*)$/)
  if (typed) return { name: typed[2], type: typed[1] }
  const annotated = target.match(/^([A-Za-z_]\w*)\s*:\s*([A-Za-z_][\w<>\[\],.]*)$/)
  if (annotated) return { name: annotated[1], type: annotated[2] }
  const luaLocal = target.match(/^([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)$/)
  if (luaLocal) return { name: luaLocal[2], type: luaLocal[1] }
  return { name: target.replace(/->/g, '.').trim() }
}

const ASSIGNMENT_PATTERN = /^(.+?)\s*(:=|(?<![=!<>])=(?!=)|\+=|-=|\*=|\/=|%=|&=|\|=|\^=)\s*(.+)$/

/** Operadores que suman al valor que ya tenía el destino. */
const COMPOUND_OPERATORS: Record<string, string> = {
  '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': 'mod', '&=': 'y', '|=': 'o', '^=': '^',
}

/** Lee una asignación y la devuelve con el vocabulario común. */
export function pseudoAssignment(text: string): PseudoInstruction | null {
  const match = text.trim().match(ASSIGNMENT_PATTERN)
  if (!match) return null
  const target = pseudoTarget(match[1])
  const operator = match[2]
  const compound = COMPOUND_OPERATORS[operator]
  const value = pseudoExpression(match[3])
  return {
    form: 'assign',
    target: target.name,
    type: target.type,
    operator: compound ? '=' : operator,
    value: compound ? `${target.name} ${compound} ${value}` : value,
  }
}

/** Lee una llamada y la devuelve con el vocabulario común. */
export function pseudoCall(text: string): PseudoInstruction | null {
  const match = text.trim().match(/^([A-Za-z_][\w]*(?:(?:\.|::|->)[A-Za-z_]\w*)*)\s*\(([\s\S]*)\)\s*;?\s*$/)
  if (!match) return null
  const name = match[1]
  const args = pseudoExpression(match[2])
  if (isOutputFunction(name)) return { form: 'print', name, value: args }
  if (isInputFunction(name)) return { form: 'read', name, value: args }
  return { form: 'call', name, value: args }
}

/** Nombres de los módulos que se pueden importar, según el lenguaje. */
export function pseudoImportName(text: string): string {
  const quoted = text.match(/["']([^"']+)["']/)
  if (quoted) return quoted[1].trim()
  const packageName = text.match(/^package\s+([\w.:/-]+)/i)
  if (packageName) return packageName[1].trim()
  const keyword = text.match(/(?:import|using|use|require|include|from)\s+([\w.:/-]+)/)
  if (keyword) return keyword[1].trim()
  return text.trim()
}

/**
 * Describe una instrucción suelta con el vocabulario común.
 *
 * Es la puerta de entrada de los analizadores que работа con texto plano:
 * decide la forma y extrae los operandos sin conocer el lenguaje.
 */
export function pseudoStatement(text: string): PseudoInstruction {
  const compact = text.trim().replace(/\s+/g, ' ')
  if (/^return\b/i.test(compact)) {
    return { form: 'return', value: pseudoExpression(compact.replace(/^return\b/i, '').trim()) }
  }
  if (/^break\b/i.test(compact)) return { form: 'break' }
  if (/^continue\b/i.test(compact)) return { form: 'continue' }
  if (/^(?:throw|raise|panic)\b/i.test(compact)) {
    return { form: 'throw', value: pseudoExpression(compact.replace(/^(?:throw|raise|panic)\b/i, '').trim()) }
  }
  if (/^(?:import|package|include|using|use|mod|require|extern\s+crate)\b/i.test(compact)) {
    return { form: 'import', name: pseudoImportName(compact) }
  }
  const assignment = pseudoAssignment(compact)
  if (assignment) return assignment
  const call = pseudoCall(compact)
  if (call) return call
  return { form: 'statement', value: pseudoExpression(compact) }
}

/** Escribe la instrucción con el vocabulario común, para el diagrama. */
export function pseudoText(instruction: PseudoInstruction): string {  switch (instruction.form) {
    case 'assign':
      return PSEUDO.assign(instruction.target ?? '?', instruction.value ?? '')
    case 'call':
      return PSEUDO.call(instruction.name ?? 'llamar', instruction.value ?? '')
    case 'print':
      return PSEUDO.print(instruction.value ?? '')
    case 'read':
      return PSEUDO.read(instruction.target ?? instruction.value ?? '')
    case 'return':
      return PSEUDO.return(instruction.value ?? '')
    case 'throw':
      return PSEUDO.throw(instruction.value ?? '')
    case 'import':
      return PSEUDO.import(instruction.name ?? 'módulo')
    case 'define':
      return PSEUDO.define(instruction.name ?? 'función')
    case 'class':
      return PSEUDO.class(instruction.name ?? 'tipo')
    case 'condition':
      return PSEUDO.condition(instruction.value ?? 'condición')
    case 'loop':
      return PSEUDO.loop(instruction.value ?? 'condición')
    case 'break':
      return PSEUDO.break()
    case 'continue':
      return PSEUDO.continue()
    default:
      return compactSource(instruction.value ?? '', 46)
  }
}

/** Instrucciones que el editor visual puede reconstruir en el código. */
export function isEditableForm(form: PseudoForm): boolean {
  return !['break', 'continue'].includes(form)
}

/** Etiqueta corta del diagrama para una instrucción del pseudo-código. */
export function pseudoLabel(instruction: PseudoInstruction, maxLength = 46): string {
  return compactSource(pseudoText(instruction), maxLength)
}

const OUTPUT_TEMPLATES: Record<Language, (value: string) => string> = {
  javascript: (value) => `console.log(${value})`,
  typescript: (value) => `console.log(${value})`,
  python: (value) => `print(${value})`,
  lua: (value) => `print(${value})`,
  java: (value) => `System.out.println(${value})`,
  c: (value) => `printf("%s\\n", ${value})`,
  cpp: (value) => `std::cout << ${value} << std::endl;`,
  csharp: (value) => `Console.WriteLine(${value})`,
  go: (value) => `fmt.Println(${value})`,
  rust: (value) => `println!("{}", ${value})`,
}

const THROW_TEMPLATES: Record<Language, (value: string) => string> = {
  javascript: (value) => `throw new Error(${value})`,
  typescript: (value) => `throw new Error(${value})`,
  python: (value) => `raise ${value}`,
  lua: (value) => `error(${value})`,
  java: (value) => `throw new Exception(${value})`,
  c: (value) => `return ${value}`,
  cpp: (value) => `throw ${value}`,
  csharp: (value) => `throw new Exception(${value})`,
  go: (value) => `panic(${value})`,
  rust: (value) => `panic!("{}", ${value})`,
}

const IMPORT_TEMPLATES: Record<Language, (name: string) => string> = {
  javascript: (name) => `import '${name}'`,
  typescript: (name) => `import '${name}'`,
  python: (name) => `import ${name}`,
  lua: (name) => `local ${name} = require('${name}')`,
  java: (name) => `import ${name};`,
  c: (name) => `#include <${name}.h>`,
  cpp: (name) => `#include <${name}>`,
  csharp: (name) => `using ${name};`,
  go: (name) => `import "${name}"`,
  rust: (name) => `use ${name};`,
}

/**
 * Reconstruye la instrucción en el lenguaje del archivo.
 *
 * Devuelve `null` cuando no hay una traducción segura: en ese caso el
 * inspector mantiene la edición manual de la línea.
 */
export function buildSourceLine(
  language: Language,
  instruction: PseudoInstruction,
  originalLine = '',
): string | null {
  const value = instruction.value ?? ''
  switch (instruction.form) {
    case 'assign': {
      const target = instruction.target?.trim()
      if (!target) return null
      const type = instruction.type ? `${instruction.type} ` : ''
      const operator = instruction.operator === ':=' ? ':=' : '='
      const declaration = originalLine.match(/^\s*((?:const|let|var|final|val)\s+)/i)?.[1] ?? ''
      return `${declaration}${type}${target} ${operator} ${value}`
    }
    case 'call': {
      const name = instruction.name?.trim()
      if (!name) return null
      return `${name}(${value})`
    }
    case 'print':
      return OUTPUT_TEMPLATES[language](value)
    case 'read':
      return null
    case 'return':
      return value ? `return ${value}` : 'return'
    case 'throw':
      return THROW_TEMPLATES[language](value)
    case 'import': {
      const name = instruction.name?.trim()
      if (!name) return null
      return IMPORT_TEMPLATES[language](name)
    }
    case 'define':
    case 'class':
    case 'condition':
    case 'loop':
    case 'break':
    case 'continue':
      return replaceHeaderExpression(language, originalLine, value)
    default:
      return null
  }
}

/**
 * Sustituye la expresión de una cabecera (`if`, `while`, `for`) por otra.
 *
 * Solo se toca la condición: el resto de la línea se conserva tal cual para
 * no romper la estructura del bloque.
 */
export function replaceHeaderExpression(language: Language, line: string, value: string): string | null {
  if (!line.trim()) return null
  if (language === 'python') {
    return line.replace(/^(\s*(?:if|elif|while)\b\s*)(.*?)(:\s*(?:#.*)?)$/, (_match, head, _condition, tail) => `${head}${value}${tail}`)
  }
  if (language === 'lua') {
    return line.replace(/^(\s*(?:if|elseif|while)\b\s*)(.*?)(\s+then\b.*)$/, (_match, head, _condition, tail) => `${head}${value}${tail}`)
  }
  // Cabecera clásica: `for (inicio; condición; avance)`. Solo se toca la condición.
  const forHeader = line.match(/^(\s*for\s*\()(.+?)(\)\s*\{?\s*(?:\/\/.*|\/\*.*)?)$/)
  if (forHeader) {
    const parts = forHeader[2].split(';')
    if (parts.length === 3) {
      parts[1] = ` ${value}`
      return `${forHeader[1]}${parts.join(';')}${forHeader[3]}`
    }
  }
  return line.replace(/^(\s*(?:if|else\s+if|while)\s*\()(.+?)(\)\s*\{?\s*(?:\/\/.*|\/\*.*)?)$/, (_match, head, _condition, tail) => `${head}${value}${tail}`)
}
