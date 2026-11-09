import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import generate from '@babel/generator'
import * as t from '@babel/types'

type WorkerScope = {
  onmessage: ((event: MessageEvent<{ code: string }>) => void) | null
  postMessage: (message: unknown) => void
  fetch: typeof fetch
  importScripts: (...urls: string[]) => void
  WebSocket: typeof WebSocket
}
const scope = self as unknown as WorkerScope
const send = scope.postMessage.bind(scope)
const MAX_STEPS = 2000
const MAX_SOURCE_LENGTH = 50_000

function pack(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'undefined') return 'undefined'
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value === 'function') return `[Function${value.name ? `: ${value.name}` : ''}]`
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) return '[Circular]'
  if (depth >= 3) return Array.isArray(value) ? `[Array(${value.length})]` : '[Object]'
  seen.add(value)
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => pack(item, depth + 1, seen))
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(value).slice(0, 50)) {
    try { output[key] = pack((value as Record<string, unknown>)[key], depth + 1, seen) }
    catch { output[key] = '[Unavailable]' }
  }
  return output
}

function instrument(source: string, traceName: string, enterName: string, exitName: string, returnName: string) {
  const ast = parse(source, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'] })
  if (ast.program.body.some((node) => t.isImportDeclaration(node) || t.isExportDeclaration(node))) throw new Error('La ejecución de imports/exports entre archivos todavía no está habilitada; ejecuta un archivo independiente.')
  const blockify = (path: import('@babel/traverse').NodePath<any>) => {
    if (path?.node && !t.isBlockStatement(path.node)) path.replaceWith(t.blockStatement([path.node]))
  }

  traverse(ast, {
    IfStatement(path) {
      blockify(path.get('consequent'))
      if (path.node.alternate && !t.isIfStatement(path.node.alternate)) blockify(path.get('alternate'))
    },
    ForStatement(path) { blockify(path.get('body')) },
    ForInStatement(path) { blockify(path.get('body')) },
    ForOfStatement(path) { blockify(path.get('body')) },
    WhileStatement(path) { blockify(path.get('body')) },
    DoWhileStatement(path) { blockify(path.get('body')) },
    CatchClause(path) { if (!t.isBlockStatement(path.node.body)) path.node.body = t.blockStatement([path.node.body as unknown as t.Statement]) },
    Function(path) {
      let body = path.node.body
      if (t.isExpression(body)) {
        body = t.blockStatement([t.returnStatement(body)])
        path.node.body = body
        if (t.isArrowFunctionExpression(path.node)) path.node.expression = false
      }
      if (!t.isBlockStatement(body)) return
      const name = t.isFunctionDeclaration(path.node)
        ? path.node.id?.name ?? 'anonymous'
        : t.isFunctionExpression(path.node)
          ? path.node.id?.name ?? 'anonymous'
          : t.isObjectMethod(path.node) || t.isClassMethod(path.node)
            ? (t.isIdentifier(path.node.key) ? path.node.key.name : 'method')
            : 'anonymous'
      const line = path.node.loc?.start.line ?? 1
      const entry = t.expressionStatement(t.callExpression(t.identifier(enterName), [t.stringLiteral(name), t.numericLiteral(line)]))
      const original = body.body
      const directives = body.directives
      body.body = [t.tryStatement(t.blockStatement([entry, ...original]), null, t.blockStatement([t.expressionStatement(t.callExpression(t.identifier(exitName), []))]))]
      body.directives = directives
    },
  })

  traverse(ast, {
    Function(path) { if (path.node.async) throw new Error('Las funciones async todavía no están habilitadas en este runtime.') },
    AwaitExpression() { throw new Error('await todavía no está habilitado en este runtime.') },
    CallExpression(path) {
      if (path.node.callee.type === 'Import') throw new Error('Las importaciones dinámicas no están habilitadas en este runtime.')
    },
    ImportExpression() { throw new Error('Las importaciones dinámicas no están habilitadas en este runtime.') },
  })

  const statements: Array<import('@babel/traverse').NodePath<t.Statement>> = []
  traverse(ast, {
    Statement(path) {
      if (path.isBlockStatement() || path.isEmptyStatement() || path.node.leadingComments?.some((comment) => comment.value.includes('codeflow:skip'))) return
      if (path.parentPath.isExportNamedDeclaration() || path.parentPath.isExportDefaultDeclaration()) return
      statements.push(path as import('@babel/traverse').NodePath<t.Statement>)
    },
  })

  for (const path of statements.reverse()) {
    if (!path.node || !path.parentPath) continue
    const bindings = Object.keys(path.scope.getAllBindings()).filter((name) => /^[$A-Z_a-z][$\w]*$/.test(name) && !name.startsWith(traceName))
    const values = t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__cf_values'), t.objectExpression([]))])
    const assignments = bindings.map((name) => t.tryStatement(
      t.blockStatement([t.expressionStatement(t.assignmentExpression('=', t.memberExpression(t.identifier('__cf_values'), t.stringLiteral(name), true), t.identifier(name)))]),
      t.catchClause(null, t.blockStatement([])),
    ))
    const snapshot = t.arrowFunctionExpression([], t.blockStatement([
      values,
      ...assignments,
      t.returnStatement(t.identifier('__cf_values')),
    ]))
    const line = t.numericLiteral(path.node.loc?.start.line ?? 1)
    if (t.isReturnStatement(path.node)) {
      const value = path.node.argument ?? t.unaryExpression('void', t.numericLiteral(0))
      path.node.argument = t.callExpression(t.identifier(returnName), [line, value, snapshot])
      continue
    }
    const trace = t.expressionStatement(t.callExpression(t.identifier(traceName), [line, snapshot]))
    if (t.isThrowStatement(path.node) || t.isBreakStatement(path.node) || t.isContinueStatement(path.node)) path.insertBefore(trace)
    else path.insertAfter(trace)
  }
  return generate(ast, { retainLines: true, compact: false }).code
}

function safeConsole() {
  const emit = (level: string) => (...values: unknown[]) => {
    send({ type: 'console', value: values.map((value) => typeof value === 'string' ? value : JSON.stringify(pack(value))).join(' ') })
  }
  return { log: emit('log'), info: emit('info'), warn: emit('warn'), error: emit('error'), clear: () => send({ type: 'console', value: '— consola limpiada —' }) }
}

scope.onmessage = async (event: MessageEvent<{ code: string }>) => {
  try {
    const { code } = event.data
    if (code.length > MAX_SOURCE_LENGTH) throw new Error(`El código supera el límite de ${MAX_SOURCE_LENGTH.toLocaleString()} caracteres.`)
    const traceName = `__cf_trace_${crypto.randomUUID().replaceAll('-', '')}`
    const enterName = `__cf_enter_${crypto.randomUUID().replaceAll('-', '')}`
    const exitName = `__cf_exit_${crypto.randomUUID().replaceAll('-', '')}`
    const returnName = `__cf_return_${crypto.randomUUID().replaceAll('-', '')}`
    for (const name of [traceName, enterName, exitName, returnName]) if (code.includes(name)) throw new Error('El código incluye un identificador reservado por el runtime.')
    const executable = instrument(code, traceName, enterName, exitName, returnName)
    const stack: string[] = []
    let index = 0
    const recordStep = (line: number, getLocals: () => Record<string, unknown>, returnValue?: unknown, hasReturnValue = false) => {
      if (index >= MAX_STEPS) return
      let locals: Record<string, unknown> = {}
      try { locals = pack(getLocals()) as Record<string, unknown> }
      catch { locals = { notice: 'No se pudieron leer todas las variables de este paso.' } }
      send({ type: 'step', line, locals, stack: [...stack], value: String(index + 1), ...(hasReturnValue ? { returnValue: pack(returnValue) } : {}) })
      index += 1
    }
    const trace = (line: number, getLocals: () => Record<string, unknown>) => recordStep(line, getLocals)
    const captureReturn = (line: number, value: unknown, getLocals: () => Record<string, unknown>) => {
      recordStep(line, getLocals, value, true)
      return value
    }
    const enter = (name: string) => { if (stack.length < 64) stack.push(name) }
    const exit = () => { stack.pop() }
    const deny = () => { throw new Error('Las solicitudes de red y la carga dinámica de scripts están deshabilitadas en el runtime.') }
    scope.fetch = deny as typeof fetch
    scope.importScripts = deny as WorkerScope['importScripts']
    scope.postMessage = deny as typeof postMessage
    scope.WebSocket = undefined as unknown as typeof WebSocket
    const consoleProxy = safeConsole()
    send({ type: 'ready' })
    const sandbox = new Function(traceName, enterName, exitName, returnName, 'console', 'fetch', 'importScripts', 'WebSocket', 'globalThis', 'self', 'Function', 'eval', 'postMessage', 'XMLHttpRequest', 'EventSource', 'WebTransport', `"use strict";\n${executable}`)
    await Promise.resolve(sandbox(trace, enter, exit, captureReturn, consoleProxy, deny, deny, undefined, Object.freeze({}), Object.freeze({}), deny, deny, deny, undefined, undefined, undefined))
    send({ type: 'done' })
  } catch (error) {
    send({ type: 'error', error: error instanceof Error ? error.message : String(error) })
    send({ type: 'done' })
  }
}
