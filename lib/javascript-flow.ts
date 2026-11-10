import { parse } from '@babel/parser'
import * as t from '@babel/types'
import { compactSource, emptyFlowFragment, FlowGraphBuilder, type FlowFragment, type FlowNodeInput } from '@/lib/flow-graph-builder'
import type { DiagramGraph } from '@/lib/codeflow-types'

type LoopStatement = t.ForStatement | t.ForInStatement | t.ForOfStatement | t.WhileStatement | t.DoWhileStatement

interface BuildContext {
  loopDepth: number
  breakDepth: number
  functionDepth: number
}

function sourceOf(node: t.Node | null | undefined, source: string): string {
  if (!node || node.start == null || node.end == null) return ''
  return source.slice(node.start, node.end)
}

function statementsOf(node: t.Statement | t.BlockStatement | null | undefined): t.Statement[] {
  if (!node) return []
  return t.isBlockStatement(node) ? node.body : [node]
}

function calleeName(node: t.Node): string | null {
  if (t.isIdentifier(node)) return node.name
  if (t.isMemberExpression(node) && !node.computed && t.isIdentifier(node.property)) {
    const object = calleeName(node.object)
    return object ? `${object}.${node.property.name}` : node.property.name
  }
  return null
}

function callExpression(statement: t.Statement): t.CallExpression | t.OptionalCallExpression | null {
  if (!t.isExpressionStatement(statement)) return null
  const expression = statement.expression
  return t.isCallExpression(expression) || t.isOptionalCallExpression(expression) ? expression : null
}

function describeSimple(statement: t.Statement, source: string): FlowNodeInput {
  const code = sourceOf(statement, source)
  const line = statement.loc?.start.line ?? 1
  const base = { line, source: code }

  if (t.isVariableDeclaration(statement)) {
    const objectInitializer = statement.declarations.some((declaration) => declaration.init && (t.isObjectExpression(declaration.init) || t.isArrayExpression(declaration.init)))
    return { ...base, kind: objectInitializer ? 'object' : 'variable', label: compactSource(code), detail: objectInitializer ? 'Proceso · inicializar colección' : 'Proceso · asignación' }
  }
  if (t.isImportDeclaration(statement)) return { ...base, kind: 'import', label: compactSource(code), detail: 'Proceso · cargar dependencia' }
  if (t.isReturnStatement(statement)) return { ...base, kind: 'return', label: compactSource(code || 'return'), detail: 'Salida de función' }
  if (t.isThrowStatement(statement)) return { ...base, kind: 'event', label: compactSource(code), detail: 'Salida por excepción' }
  if (t.isBreakStatement(statement)) return { ...base, kind: 'phase', label: 'break', detail: 'Salir del bucle actual', phase: 'exit' }
  if (t.isContinueStatement(statement)) return { ...base, kind: 'phase', label: 'continue', detail: 'Continuar con la siguiente iteración', phase: 'update' }
  if (t.isExpressionStatement(statement)) {
    const call = callExpression(statement)
    if (call) {
      const name = calleeName(call.callee) ?? 'llamada'
      const outputCalls = new Set(['console.log', 'console.info', 'console.warn', 'console.error', 'alert'])
      const inputCalls = new Set(['prompt', 'confirm'])
      if (outputCalls.has(name) || inputCalls.has(name)) {
        return { ...base, kind: 'io', label: `${inputCalls.has(name) ? 'Entrada' : 'Salida'} · ${name}()`, detail: 'Entrada / salida de datos', shape: 'input-output' }
      }
      const isAssignment = t.isAssignmentExpression(statement.expression) || t.isUpdateExpression(statement.expression)
      return { ...base, kind: isAssignment ? 'variable' : 'call', label: compactSource(code), detail: isAssignment ? 'Proceso · actualizar valor' : 'Proceso · llamada' }
    }
    if (t.isAssignmentExpression(statement.expression) || t.isUpdateExpression(statement.expression)) {
      return { ...base, kind: 'variable', label: compactSource(code), detail: 'Proceso · actualizar valor' }
    }
  }
  if (t.isClassDeclaration(statement)) return { ...base, kind: 'class', label: `class ${statement.id?.name ?? 'anónima'}`, detail: 'Proceso · definir clase' }
  return { ...base, kind: 'statement', label: compactSource(code || statement.type), detail: 'Proceso · instrucción' }
}

function createSimpleFragment(statement: t.Statement, depth: number, builder: FlowGraphBuilder, source: string): FlowFragment {
  const description = describeSimple(statement, source)
  const id = builder.addNode(description, depth)
  const fragment = emptyFlowFragment()
  fragment.entryId = id

  if (t.isBreakStatement(statement)) {
    fragment.breakIds.push(id)
  } else if (t.isContinueStatement(statement)) {
    fragment.continueIds.push(id)
  } else if (t.isReturnStatement(statement)) {
    fragment.returnIds.push(id)
  } else if (t.isThrowStatement(statement)) {
    fragment.throwIds.push(id)
  } else {
    fragment.exitIds.push(id)
  }
  return fragment
}

function appendAbrupt(target: FlowFragment, source: FlowFragment): void {
  target.breakIds.push(...source.breakIds)
  target.continueIds.push(...source.continueIds)
  target.returnIds.push(...source.returnIds)
  target.throwIds.push(...source.throwIds)
}

function joinNormalPaths(builder: FlowGraphBuilder, sources: Array<{ id: string; label: string; role: 'merge' | 'true' | 'false' | 'exit' }>, line: number, depth: number): string | null {
  if (!sources.length) return null
  const merge = builder.addConnector(line, depth)
  for (const path of sources) builder.addEdge(path.id, merge, path.label, path.role)
  return merge
}

function createFunctionSubgraph(
  name: string,
  bodyStatements: t.Statement[],
  bodyExpression: t.Expression | null,
  line: number,
  depth: number,
  definitionId: string,
  source: string,
  builder: FlowGraphBuilder,
  functionEntries: Map<string, string>,
  context: BuildContext,
  pendingCalls: Array<{ nodeId: string; name: string }>,
): void {
  const entry = builder.addNode({ kind: 'start', label: `Inicio · ${name}()`, line, detail: 'Entrada de función', shape: 'terminator' }, depth + 1)
  const exit = builder.addNode({ kind: 'end', label: `Fin · ${name}()`, line, detail: 'Salida de función', shape: 'terminator' }, depth + 1)
  builder.addEdge(definitionId, entry, 'cuerpo de función', 'data')
  if (!functionEntries.has(name)) functionEntries.set(name, entry)

  let body: FlowFragment
  if (bodyExpression) {
    const returnSource = `return ${sourceOf(bodyExpression, source)}`
    const returnId = builder.addNode({ kind: 'return', label: compactSource(returnSource), line, detail: 'Salida de función', source: returnSource }, depth + 2)
    body = { ...emptyFlowFragment(), entryId: returnId, returnIds: [returnId] }
  } else {
    body = buildSequence(bodyStatements, depth + 2, { loopDepth: 0, breakDepth: 0, functionDepth: context.functionDepth + 1 }, builder, source, functionEntries, pendingCalls)
  }

  if (body.entryId) builder.addEdge(entry, body.entryId, 'ejecutar cuerpo', 'body')
  else builder.addEdge(entry, exit, 'vacía', 'control')
  for (const id of body.exitIds) builder.addEdge(id, exit, 'fin normal', 'exit')
  for (const id of body.returnIds) builder.addEdge(id, exit, 'return', 'exit')
  for (const id of body.throwIds) builder.addEdge(id, exit, 'excepción', 'exception')
}

function buildIf(statement: t.IfStatement, depth: number, context: BuildContext, builder: FlowGraphBuilder, source: string, functionEntries: Map<string, string>, pendingCalls: Array<{ nodeId: string; name: string }>): FlowFragment {
  const line = statement.loc?.start.line ?? 1
  const decision = builder.addNode({ kind: 'condition', label: `¿${compactSource(sourceOf(statement.test, source), 35)}?`, line, detail: 'Decisión · if', source: sourceOf(statement, source) }, depth)
  const yes = buildSequence(statementsOf(statement.consequent), depth + 1, context, builder, source, functionEntries, pendingCalls)
  const no = statement.alternate
    ? buildStatement(statement.alternate, depth + 1, context, builder, source, functionEntries, pendingCalls)
    : emptyFlowFragment()
  const sources: Array<{ id: string; label: string; role: 'merge' | 'true' | 'false' | 'exit' }> = []

  if (yes.entryId) builder.addEdge(decision, yes.entryId, 'verdadero', 'true')
  else sources.push({ id: decision, label: 'verdadero', role: 'true' })
  if (no.entryId) builder.addEdge(decision, no.entryId, 'falso', 'false')
  else sources.push({ id: decision, label: 'falso', role: 'false' })
  for (const id of yes.exitIds) sources.push({ id, label: 'unir', role: 'merge' })
  for (const id of no.exitIds) sources.push({ id, label: 'unir', role: 'merge' })

  const result = emptyFlowFragment()
  result.entryId = decision
  const mergeId = joinNormalPaths(builder, sources, line, depth)
  if (mergeId) result.exitIds.push(mergeId)
  appendAbrupt(result, yes)
  appendAbrupt(result, no)
  return result
}

function buildLoop(statement: LoopStatement, depth: number, context: BuildContext, builder: FlowGraphBuilder, source: string, functionEntries: Map<string, string>, pendingCalls: Array<{ nodeId: string; name: string }>): FlowFragment {
  const line = statement.loc?.start.line ?? 1
  const isFor = t.isForStatement(statement)
  const isForEach = t.isForInStatement(statement) || t.isForOfStatement(statement)
  const isDoWhile = t.isDoWhileStatement(statement)
  const loopLabel = isFor
    ? `¿${statement.test ? compactSource(sourceOf(statement.test, source), 34) : 'se solicita break'}?`
    : isForEach
      ? `¿Quedan elementos en ${compactSource(sourceOf(statement.right, source), 26)}?`
      : `¿${compactSource(sourceOf(statement.test, source), 36)}?`
  const initNode = isFor && statement.init
    ? builder.addNode({ kind: 'variable', label: compactSource(sourceOf(statement.init, source)), line, detail: 'Inicialización del bucle', source: sourceOf(statement.init, source) }, depth)
    : isForEach
      ? builder.addNode({ kind: 'phase', label: 'Inicializar iterador', line, detail: 'Preparar la colección', phase: 'initialization' }, depth)
      : null
  const entryNode = isDoWhile
    ? builder.addNode({ kind: 'phase', label: 'Ejecutar cuerpo primero', line, detail: 'Bucle de condición posterior', phase: 'initialization' }, depth)
    : null
  const condition = builder.addNode({ kind: 'loop', label: loopLabel, line, detail: isDoWhile ? 'Decisión · do…while' : 'Decisión · iteración', source: sourceOf(statement, source) }, depth)
  const update = (isFor && statement.update) || isForEach
    ? builder.addNode({ kind: 'phase', label: isFor && statement.update ? compactSource(sourceOf(statement.update, source)) : 'Tomar siguiente elemento', line, detail: 'Actualizar iteración', phase: 'update' }, depth)
    : null
  const exit = builder.addConnector(line, depth, 'Salida del bucle')
  if (initNode) builder.addEdge(initNode, condition, 'evaluar', 'control')

  const body = buildSequence(statementsOf(statement.body), depth + 1, { ...context, loopDepth: context.loopDepth + 1, breakDepth: context.breakDepth + 1 }, builder, source, functionEntries, pendingCalls)
  const bodyEntry = body.entryId ?? builder.addNode({ kind: 'statement', label: 'Cuerpo vacío', line, detail: 'Sin instrucciones', phase: 'body' }, depth + 1)
  const bodyNormalExits = body.entryId ? body.exitIds : [bodyEntry]
  const sequenceEntry = isDoWhile ? entryNode! : initNode ?? condition

  if (isDoWhile) {
    builder.addEdge(entryNode, bodyEntry, 'cuerpo · primera vuelta', 'body')
    for (const id of bodyNormalExits) builder.addEdge(id, condition, 'evaluar condición', 'control')
    for (const id of body.continueIds) builder.addEdge(id, condition, 'continue · evaluar', 'repeat')
    builder.addEdge(condition, bodyEntry, 'verdadero · repetir', 'true')
  } else {
    builder.addEdge(condition, bodyEntry, 'verdadero · cuerpo', 'true')
    const repeatTarget = update ?? condition
    for (const id of bodyNormalExits) builder.addEdge(id, repeatTarget, update ? 'siguiente' : 'repetir', update ? 'control' : 'repeat')
    for (const id of body.continueIds) builder.addEdge(id, repeatTarget, 'continue', 'repeat')
    if (update) builder.addEdge(update, condition, 'repetir', 'repeat')
  }

  const result = emptyFlowFragment()
  result.entryId = sequenceEntry
  result.exitIds.push(exit)
  for (const id of body.breakIds) builder.addEdge(id, exit, 'break · salir', 'exit')
  builder.addEdge(condition, exit, 'falso · salir', 'false')
  result.returnIds.push(...body.returnIds)
  result.throwIds.push(...body.throwIds)
  return result
}

function buildSwitch(statement: t.SwitchStatement, depth: number, context: BuildContext, builder: FlowGraphBuilder, source: string, functionEntries: Map<string, string>, pendingCalls: Array<{ nodeId: string; name: string }>): FlowFragment {
  const line = statement.loc?.start.line ?? 1
  const decision = builder.addNode({ kind: 'condition', label: `switch · ${compactSource(sourceOf(statement.discriminant, source), 30)}`, line, detail: 'Selección entre casos', source: sourceOf(statement, source) }, depth)
  const merge = builder.addConnector(line, depth, 'Continuación de selección')
  const cases = statement.cases
  const hasDefault = cases.some((item) => !item.test)
  let hasNormalPath = !hasDefault
  const markers = cases.map((item, index) => builder.addNode({
    kind: 'connector',
    label: String.fromCharCode(65 + (index % 26)),
    line: item.loc?.start.line ?? line,
    detail: `case · ${item.test ? compactSource(sourceOf(item.test, source), 30) : 'default'}`,
    shape: 'connector',
    source: item.test ? sourceOf(item.test, source) : 'default',
  }, depth + 1))
  const result = emptyFlowFragment()
  result.entryId = decision

  cases.forEach((item, index) => {
    const marker = markers[index]
    const label = item.test ? compactSource(sourceOf(item.test, source), 26) : 'default'
    builder.addEdge(decision, marker, label, 'case')
    const branch = buildSequence(item.consequent, depth + 2, { ...context, breakDepth: context.breakDepth + 1 }, builder, source, functionEntries, pendingCalls)
    if (branch.entryId) builder.addEdge(marker, branch.entryId, 'caso', 'body')
    else if (index + 1 < markers.length) builder.addEdge(marker, markers[index + 1], 'fall-through', 'control')
    else {
      builder.addEdge(marker, merge, 'continuar', 'merge')
      hasNormalPath = true
    }

    if (branch.exitIds.length) {
      const nextCase = markers[index + 1]
      for (const id of branch.exitIds) builder.addEdge(id, nextCase ?? merge, nextCase ? 'fall-through' : 'continuar', nextCase ? 'control' : 'merge')
      if (!nextCase) hasNormalPath = true
    }
    for (const id of branch.breakIds) {
      builder.addEdge(id, merge, 'break · salir', 'exit')
      hasNormalPath = true
    }
    result.continueIds.push(...branch.continueIds)
    result.returnIds.push(...branch.returnIds)
    result.throwIds.push(...branch.throwIds)
  })

  if (!hasDefault) builder.addEdge(decision, merge, 'sin coincidencia', 'false')
  if (hasNormalPath) result.exitIds.push(merge)
  return result
}

function buildTry(statement: t.TryStatement, depth: number, context: BuildContext, builder: FlowGraphBuilder, source: string, functionEntries: Map<string, string>, pendingCalls: Array<{ nodeId: string; name: string }>): FlowFragment {
  if (statement.finalizer) throw new Error('No se generó el diagrama: try/finally necesita una visualización explícita de sus salidas diferidas.')
  const line = statement.loc?.start.line ?? 1
  const tryNode = builder.addNode({ kind: 'event', label: 'try · control de excepción', line, detail: 'Posible ruta de error', source: sourceOf(statement, source) }, depth)
  const body = buildSequence(statement.block.body, depth + 1, context, builder, source, functionEntries, pendingCalls)
  const handler = statement.handler ? buildSequence(statement.handler.body.body, depth + 1, context, builder, source, functionEntries, pendingCalls) : emptyFlowFragment()
  if (body.entryId) builder.addEdge(tryNode, body.entryId, 'ejecutar', 'body')
  if (handler.entryId) {
    builder.addEdge(tryNode, handler.entryId, `si ocurre ${statement.handler?.param ? 'una excepción coincidente' : 'una excepción'}`, 'exception')
    for (const id of body.throwIds) builder.addEdge(id, handler.entryId, 'capturar', 'exception')
  }
  const normalSources = [...body.exitIds, ...handler.exitIds]
  const result = emptyFlowFragment()
  result.entryId = tryNode
  if (normalSources.length) {
    const merge = builder.addConnector(line, depth)
    normalSources.forEach((id) => builder.addEdge(id, merge, 'continuar', 'merge'))
    result.exitIds.push(merge)
  }
  result.breakIds.push(...body.breakIds, ...handler.breakIds)
  result.continueIds.push(...body.continueIds, ...handler.continueIds)
  result.returnIds.push(...body.returnIds, ...handler.returnIds)
  result.throwIds.push(...(handler.entryId ? [] : body.throwIds), ...handler.throwIds)
  return result
}

function buildStatement(statement: t.Statement, depth: number, context: BuildContext, builder: FlowGraphBuilder, source: string, functionEntries: Map<string, string>, pendingCalls: Array<{ nodeId: string; name: string }>): FlowFragment {
  if (t.isEmptyStatement(statement)) return emptyFlowFragment()
  if (t.isBlockStatement(statement)) return buildSequence(statement.body, depth, context, builder, source, functionEntries, pendingCalls)
  if (t.isIfStatement(statement)) return buildIf(statement, depth, context, builder, source, functionEntries, pendingCalls)
  if (t.isSwitchStatement(statement)) return buildSwitch(statement, depth, context, builder, source, functionEntries, pendingCalls)
  if (t.isTryStatement(statement)) return buildTry(statement, depth, context, builder, source, functionEntries, pendingCalls)
  if (t.isForStatement(statement) || t.isForInStatement(statement) || t.isForOfStatement(statement) || t.isWhileStatement(statement) || t.isDoWhileStatement(statement)) {
    return buildLoop(statement, depth, context, builder, source, functionEntries, pendingCalls)
  }
  if (t.isBreakStatement(statement) && (statement.label || context.breakDepth === 0)) throw new Error('No se generó el diagrama: break etiquetado o fuera de un bucle o switch no está soportado.')
  if (t.isContinueStatement(statement) && (statement.label || context.loopDepth === 0)) throw new Error('No se generó el diagrama: continue etiquetado o fuera de un bucle no está soportado.')
  if (t.isLabeledStatement(statement)) throw new Error('No se generó el diagrama: las etiquetas de control no están soportadas todavía.')

  if (t.isFunctionDeclaration(statement) && statement.body) {
    const line = statement.loc?.start.line ?? 1
    const name = statement.id?.name ?? 'anónima'
    const definition = builder.addNode({ kind: 'function', label: `Definir ${name}()`, line, detail: 'El cuerpo se muestra como subflujo', source: sourceOf(statement, source) }, depth)
    createFunctionSubgraph(name, statement.body.body, null, line, depth, definition, source, builder, functionEntries, context, pendingCalls)
    return { ...emptyFlowFragment(), entryId: definition, exitIds: [definition] }
  }

  if (t.isClassDeclaration(statement)) {
    const line = statement.loc?.start.line ?? 1
    const name = statement.id?.name ?? 'anónima'
    const id = builder.addNode({ kind: 'class', label: `class ${name}`, line, detail: 'Proceso · definir clase', source: sourceOf(statement, source) }, depth)
    for (const member of statement.body.body) {
      if (!t.isClassMethod(member) || !t.isBlockStatement(member.body)) continue
      const methodName = t.isIdentifier(member.key) ? member.key.name : 'método'
      const method = builder.addNode({ kind: 'function', label: `${name}.${methodName}()`, line: member.loc?.start.line ?? line, detail: 'Método · subflujo separado', source: sourceOf(member, source) }, depth + 1)
      builder.addEdge(id, method, 'método', 'data')
      createFunctionSubgraph(`${name}.${methodName}`, member.body.body, null, member.loc?.start.line ?? line, depth + 1, method, source, builder, functionEntries, context, pendingCalls)
    }
    return { ...emptyFlowFragment(), entryId: id, exitIds: [id] }
  }

  const simple = createSimpleFragment(statement, depth, builder, source)
  const call = callExpression(statement)
  const name = call ? calleeName(call.callee) : null
  if (name && simple.entryId) pendingCalls.push({ nodeId: simple.entryId, name })

  if (t.isReturnStatement(statement)) {
    if (context.functionDepth === 0) throw new Error('No se generó el diagrama: return aparece fuera de una función.')
  }
  if (t.isVariableDeclaration(statement)) {
    for (const declaration of statement.declarations) {
      const initializer = declaration.init
      if (!initializer || (!t.isArrowFunctionExpression(initializer) && !t.isFunctionExpression(initializer))) continue
      const name = t.isIdentifier(declaration.id) ? declaration.id.name : 'callback'
      const bodyStatements = t.isBlockStatement(initializer.body) ? initializer.body.body : []
      const bodyExpression = t.isBlockStatement(initializer.body) ? null : initializer.body
      createFunctionSubgraph(name, bodyStatements, bodyExpression, initializer.loc?.start.line ?? statement.loc?.start.line ?? 1, depth, simple.entryId!, source, builder, functionEntries, context, pendingCalls)
    }
  }
  return simple
}

function buildSequence(statements: t.Statement[], depth: number, context: BuildContext, builder: FlowGraphBuilder, source: string, functionEntries: Map<string, string>, pendingCalls: Array<{ nodeId: string; name: string }>): FlowFragment {
  const result = emptyFlowFragment()
  let previousExits: string[] = []
  let previousSource: string | null = null
  let reachable = true

  for (const statement of statements) {
    const current = buildStatement(statement, depth, context, builder, source, functionEntries, pendingCalls)
    if (!current.entryId) continue
    if (!result.entryId) result.entryId = current.entryId
    else if (reachable) previousExits.forEach((id) => builder.addEdge(id, current.entryId, 'siguiente', 'control'))
    else if (previousSource) builder.addEdge(previousSource, current.entryId, 'inaccesible', 'unreachable')

    if (reachable) {
      result.breakIds.push(...current.breakIds)
      result.continueIds.push(...current.continueIds)
      result.returnIds.push(...current.returnIds)
      result.throwIds.push(...current.throwIds)
      previousExits = current.exitIds
      reachable = current.exitIds.length > 0
    } else {
      previousExits = []
    }
    previousSource = current.exitIds.at(-1) ?? current.entryId
  }
  result.exitIds = previousExits
  return result
}

export function analyzeJavaScript(source: string): DiagramGraph {
  const ast = parse(source, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'], errorRecovery: false })
  const builder = new FlowGraphBuilder()
  const functionEntries = new Map<string, string>()
  const pendingCalls: Array<{ nodeId: string; name: string }> = []
  const start = builder.addNode({ kind: 'start', label: 'Inicio', line: 1, detail: 'Entrada del programa', shape: 'terminator' }, 0)
  const end = builder.addNode({ kind: 'end', label: 'Fin', line: source.split('\n').length, detail: 'Salida del programa', shape: 'terminator' }, 0)
  const main = buildSequence(ast.program.body, 1, { loopDepth: 0, breakDepth: 0, functionDepth: 0 }, builder, source, functionEntries, pendingCalls)

  if (main.entryId) builder.addEdge(start, main.entryId, 'iniciar', 'control')
  else builder.addEdge(start, end, 'sin instrucciones', 'control')
  for (const id of main.exitIds) builder.addEdge(id, end, 'fin', 'exit')
  for (const id of main.throwIds) builder.addEdge(id, end, 'excepción no capturada', 'exception')
  for (const call of pendingCalls) {
    const entry = functionEntries.get(call.name)
    if (entry) builder.addEdge(call.nodeId, entry, 'llama · subflujo', 'data')
  }
  return builder.toGraph()
}
