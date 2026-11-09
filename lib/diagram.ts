import { parse } from '@babel/parser'
import * as t from '@babel/types'
import type { DiagramGraph, FlowCardNode, Language, NodeKind } from '@/lib/codeflow-types'

const palette: Record<NodeKind, string> = {
  function: 'mint',
  variable: 'blue',
  object: 'blue',
  event: 'pink',
  condition: 'amber',
  loop: 'violet',
  class: 'pink',
  call: 'slate',
  return: 'slate',
  import: 'slate',
  statement: 'slate',
}

function describeStatement(statement: t.Statement): { kind: NodeKind; label: string; detail: string } | null {
  if (t.isFunctionDeclaration(statement)) {
    const name = statement.id?.name ?? 'anonymous'
    return { kind: 'function', label: `${name}()`, detail: 'Declaración de función' }
  }
  if (t.isClassDeclaration(statement)) {
    return { kind: 'class', label: statement.id?.name ?? 'Clase anónima', detail: 'Declaración de clase' }
  }
  if (t.isVariableDeclaration(statement)) {
    const first = statement.declarations[0]
    const name = first && t.isIdentifier(first.id) ? first.id.name : 'desestructuración'
    const isObject = first?.init && (t.isObjectExpression(first.init) || t.isArrayExpression(first.init))
    return { kind: isObject ? 'object' : 'variable', label: `${statement.kind} ${name}`, detail: isObject ? 'Estructura de datos' : 'Declaración de variable' }
  }
  if (t.isIfStatement(statement)) {
    return { kind: 'condition', label: 'if / condición', detail: 'Rama condicional' }
  }
  if (t.isForStatement(statement) || t.isForInStatement(statement) || t.isForOfStatement(statement) || t.isWhileStatement(statement) || t.isDoWhileStatement(statement)) {
    return { kind: 'loop', label: t.isForStatement(statement) ? 'for' : t.isWhileStatement(statement) || t.isDoWhileStatement(statement) ? 'while' : 'for…of', detail: 'Bucle de iteración' }
  }
  if (t.isReturnStatement(statement)) {
    return { kind: 'return', label: 'return', detail: 'Valor de retorno' }
  }
  if (t.isImportDeclaration(statement)) {
    return { kind: 'import', label: `import ${statement.source.value}`, detail: 'Dependencia de módulo' }
  }
  if (t.isExpressionStatement(statement)) {
    const expression = statement.expression
    if (t.isCallExpression(expression) || t.isOptionalCallExpression(expression)) {
      const callee = expression.callee
      const label = t.isIdentifier(callee) ? callee.name : t.isMemberExpression(callee) && t.isIdentifier(callee.property) ? callee.property.name : 'llamada'
      const isEvent = label === 'addEventListener' || label === 'removeEventListener' || label === 'on'
      return { kind: isEvent ? 'event' : 'call', label: `${label}()`, detail: isEvent ? 'Registro de evento' : 'Llamada a función' }
    }
  }
  return null
}

function getChildren(statement: t.Statement): Array<{ statement: t.Statement; label?: string }> {
  if (t.isFunctionDeclaration(statement) || t.isClassMethod(statement) || t.isObjectMethod(statement)) {
    return t.isBlockStatement(statement.body) ? statement.body.body.map((child) => ({ statement: child })) : []
  }
  if (t.isIfStatement(statement)) {
    const branches: Array<{ statement: t.Statement; label?: string }> = []
    if (t.isBlockStatement(statement.consequent)) branches.push(...statement.consequent.body.map((child) => ({ statement: child, label: 'verdadero' })))
    else branches.push({ statement: statement.consequent, label: 'verdadero' })
    if (statement.alternate) {
      if (t.isBlockStatement(statement.alternate)) branches.push(...statement.alternate.body.map((child) => ({ statement: child, label: 'falso' })))
      else if (t.isIfStatement(statement.alternate)) branches.push({ statement: statement.alternate, label: 'falso' })
      else branches.push({ statement: statement.alternate, label: 'falso' })
    }
    return branches
  }
  if ((t.isForStatement(statement) || t.isForInStatement(statement) || t.isForOfStatement(statement) || t.isWhileStatement(statement) || t.isDoWhileStatement(statement)) && statement.body) {
    return t.isBlockStatement(statement.body) ? statement.body.body.map((child) => ({ statement: child, label: 'iteración' })) : [{ statement: statement.body, label: 'iteración' }]
  }
  if (t.isTryStatement(statement)) {
    return [...statement.block.body, ...(statement.handler?.body.body ?? []), ...(statement.finalizer?.body ?? [])].map((child) => ({ statement: child }))
  }
  return []
}

function analyzeJavaScript(source: string): DiagramGraph {
  const ast = parse(source, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'], errorRecovery: false })
  const nodes: FlowCardNode[] = []
  const edges: DiagramGraph['edges'] = []
  let row = 0
  let previousTopLevel: string | undefined

  const addStatement = (statement: t.Statement, depth: number, branchLabel?: string, parentId?: string) => {
    const described = describeStatement(statement)
    const start = statement.loc?.start.line ?? 1
    let currentId = parentId
    if (described) {
      currentId = `node-${nodes.length}`
      const raw = source.split('\n')[start - 1]?.trim() ?? described.label
      nodes.push({
        id: currentId,
        type: 'flowCard',
        position: { x: 90 + depth * 64, y: 68 + row * 126 },
        data: { ...described, line: start, detail: `${described.detail} · ${palette[described.kind]}`, active: false, label: raw.length > 37 ? `${described.label}` : described.label },
      })
      row += 1
      if (parentId) {
        edges.push({ id: `edge-${edges.length}`, source: parentId, target: currentId, label: branchLabel, animated: false, style: { stroke: '#39424a' }, labelStyle: { fill: '#8b949e', fontSize: 10 } })
      }
    }
    const children = getChildren(statement)
    let previousChild: string | undefined
    for (const child of children) {
      const before = nodes.length
      addStatement(child.statement, depth + 1, child.label, currentId)
      const added = nodes.slice(before)
      const directChild = added[0]?.id
      if (directChild && previousChild && directChild !== previousChild) {
        edges.push({ id: `edge-${edges.length}`, source: previousChild, target: directChild, style: { stroke: '#39424a' } })
      }
      if (directChild) previousChild = added.at(-1)?.id ?? directChild
    }
    return currentId
  }

  for (const statement of ast.program.body) {
    const start = nodes.length
    addStatement(statement, 0)
    const first = nodes[start]?.id
    const last = nodes.at(-1)?.id
    if (first && previousTopLevel) edges.push({ id: `edge-${edges.length}`, source: previousTopLevel, target: first, style: { stroke: '#39424a' } })
    if (last) previousTopLevel = last
  }

  return { nodes, edges }
}

function analyzePython(source: string): DiagramGraph {
  const rows = source.split('\n')
  const nodes: FlowCardNode[] = []
  const edges: DiagramGraph['edges'] = []
  const structural: Array<{ id: string; indent: number; line: number; kind: NodeKind }> = []

  rows.forEach((raw, index) => {
    const text = raw.trim()
    if (!text || text.startsWith('#')) return
    const indent = raw.length - raw.trimStart().length
    let kind: NodeKind | undefined
    let label = text
    let detail = 'Instrucción'
    if (/^(async\s+)?def\s+/.test(text)) {
      kind = 'function'
      label = text.match(/def\s+([\w]+)/)?.[1] ? `${text.match(/def\s+([\w]+)/)?.[1]}()` : 'def'
      detail = 'Definición de función'
    } else if (/^class\s+/.test(text)) {
      kind = 'class'
      label = text.match(/^class\s+([\w]+)/)?.[1] ?? 'class'
      detail = 'Definición de clase'
    } else if (/^(if|elif|else|match|case)\b/.test(text)) {
      kind = 'condition'
      label = text.split(':')[0]
      detail = 'Rama condicional'
    } else if (/^(for|while)\b/.test(text)) {
      kind = 'loop'
      label = text.split(':')[0]
      detail = 'Bucle de iteración'
    } else if (/^return\b/.test(text)) {
      kind = 'return'
      label = text.split(/\s+/).slice(0, 2).join(' ')
      detail = 'Valor de retorno'
    } else if (/^(import|from)\b/.test(text)) {
      kind = 'import'
      label = text.slice(0, 30)
      detail = 'Dependencia de módulo'
    } else if (/^(print|\w+(?:\.\w+)*)\s*\(/.test(text)) {
      label = text.match(/^([\w.]+)/)?.[1] ?? 'call'
      kind = /\.(connect|on|emit)\s*\(/.test(text) ? 'event' : 'call'
      detail = kind === 'event' ? 'Registro de evento' : 'Llamada a función'
    } else if (/^[\w, ]+\s*=(?!=)/.test(text)) {
      const name = text.match(/^([\w]+)/)?.[1] ?? 'variable'
      kind = /[=]\s*[\[{]/.test(text) ? 'object' : 'variable'
      label = name
      detail = kind === 'object' ? 'Estructura de datos' : 'Asignación de variable'
    }
    if (!kind) return
    const id = `node-${nodes.length}`
    nodes.push({ id, type: 'flowCard', position: { x: 90 + Math.min(indent / 4, 5) * 54, y: 68 + nodes.length * 126 }, data: { label, kind, line: index + 1, detail, active: false } })
    const parent = [...structural].reverse().find((node) => node.indent < indent)
    if (parent) edges.push({ id: `edge-${edges.length}`, source: parent.id, target: id, label: 'bloque', style: { stroke: '#39424a' }, labelStyle: { fill: '#8b949e', fontSize: 10 } })
    if (kind === 'function' || kind === 'condition' || kind === 'loop' || kind === 'class') structural.push({ id, indent, line: index + 1, kind })
    else if (!parent && nodes.length > 1) edges.push({ id: `edge-${edges.length}`, source: nodes[nodes.length - 2].id, target: id, style: { stroke: '#39424a' } })
  })
  return { nodes, edges }
}

export function analyzeCode(source: string, language: Language): DiagramGraph {
  if (!source.trim()) return { nodes: [], edges: [] }
  try {
    return language === 'javascript' ? analyzeJavaScript(source) : analyzePython(source)
  } catch (error) {
    return { nodes: [], edges: [], error: error instanceof Error ? error.message : 'No se pudo analizar el código.' }
  }
}
