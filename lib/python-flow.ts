import { parser } from '@lezer/python'
import { compactSource, emptyFlowFragment, FlowGraphBuilder, lineAt, type FlowFragment, type FlowNodeInput } from '@/lib/flow-graph-builder'
import type { DiagramGraph } from '@/lib/codeflow-types'

type PythonTree = ReturnType<typeof parser.parse>
type PythonNode = PythonTree['topNode']

interface PythonContext {
  loopDepth: number
  functionDepth: number
}

function childrenOf(node: PythonNode): PythonNode[] {
  const children: PythonNode[] = []
  for (let child = node.firstChild; child; child = child.nextSibling) children.push(child)
  return children
}

function nodeSource(source: string, node: PythonNode | null | undefined): string {
  return node ? source.slice(node.from, node.to) : ''
}

function nodeLine(source: string, node: PythonNode): number {
  return lineAt(source, node.from)
}

function isStatement(node: PythonNode): boolean {
  return node.name.endsWith('Statement') || node.name.endsWith('Definition') || node.name === 'DecoratedDefinition'
}

function statementsOf(node: PythonNode): PythonNode[] {
  return childrenOf(node).filter(isStatement)
}

function bodiesOf(node: PythonNode): PythonNode[] {
  return childrenOf(node).filter((child) => child.name === 'Body')
}

function headerBetween(source: string, from: number, to: number): string {
  return source.slice(from, to).trim().replace(/:\s*$/, '').replace(/\s+/g, ' ')
}

function stripHeader(header: string, keyword: string): string {
  return compactSource(header.replace(new RegExp(`^${keyword}\\s*`), ''), 38)
}

function mergeAbrupt(target: FlowFragment, fragment: FlowFragment): void {
  target.breakIds.push(...fragment.breakIds)
  target.continueIds.push(...fragment.continueIds)
  target.returnIds.push(...fragment.returnIds)
  target.throwIds.push(...fragment.throwIds)
}

function simpleFragment(node: PythonNode, depth: number, context: PythonContext, builder: FlowGraphBuilder, source: string): FlowFragment {
  const code = nodeSource(source, node).trim()
  const line = nodeLine(source, node)
  const base = { line, source: code }
  let description: FlowNodeInput
  const callName = code.match(/(?:^|[=,(]\s*)(print|input)\s*\(/)?.[1]
  if (node.name === 'ReturnStatement') {
    if (context.functionDepth === 0) throw new Error(`No se generó el diagrama: return fuera de una función, línea ${line}.`)
    description = { ...base, kind: 'return', label: compactSource(code || 'return'), detail: 'Salida de función' }
  } else if (node.name === 'BreakStatement') {
    if (context.loopDepth === 0) throw new Error(`No se generó el diagrama: break fuera de un bucle, línea ${line}.`)
    description = { ...base, kind: 'phase', label: 'break', detail: 'Salir del bucle actual', phase: 'exit' }
  } else if (node.name === 'ContinueStatement') {
    if (context.loopDepth === 0) throw new Error(`No se generó el diagrama: continue fuera de un bucle, línea ${line}.`)
    description = { ...base, kind: 'phase', label: 'continue', detail: 'Continuar con la siguiente iteración', phase: 'update' }
  } else if (node.name === 'RaiseStatement') {
    description = { ...base, kind: 'event', label: compactSource(code), detail: 'Salida por excepción' }
  } else if (callName) {
    const direction = callName === 'input' ? 'Entrada' : 'Salida'
    description = { ...base, kind: 'io', label: `${direction} · ${callName}()`, detail: 'Entrada / salida de datos', shape: 'input-output' }
  } else if (node.name === 'ImportStatement' || node.name === 'FromImportStatement') {
    description = { ...base, kind: 'import', label: compactSource(code), detail: 'Proceso · cargar dependencia' }
  } else if (node.name === 'AssignStatement' || node.name === 'UpdateStatement') {
    description = { ...base, kind: 'variable', label: compactSource(code), detail: 'Proceso · asignación' }
  } else {
    description = { ...base, kind: 'statement', label: compactSource(code || node.name), detail: 'Proceso · instrucción' }
  }

  const id = builder.addNode(description, depth)
  const result = emptyFlowFragment()
  result.entryId = id
  if (node.name === 'ReturnStatement') result.returnIds.push(id)
  else if (node.name === 'RaiseStatement') result.throwIds.push(id)
  else if (node.name === 'BreakStatement') result.breakIds.push(id)
  else if (node.name === 'ContinueStatement') result.continueIds.push(id)
  else result.exitIds.push(id)
  return result
}

function buildSequence(nodes: PythonNode[], depth: number, context: PythonContext, builder: FlowGraphBuilder, source: string, functionEntries: Map<string, string>, pendingCalls: Array<{ nodeId: string; name: string }>): FlowFragment {
  const result = emptyFlowFragment()
  let previousExits: string[] = []
  let previousSource: string | null = null
  let reachable = true

  for (const node of nodes) {
    const current = buildStatement(node, depth, context, builder, source, functionEntries, pendingCalls)
    if (!current.entryId) continue
    if (!result.entryId) result.entryId = current.entryId
    else if (reachable) previousExits.forEach((id) => builder.addEdge(id, current.entryId, 'siguiente', 'control'))
    else if (previousSource) builder.addEdge(previousSource, current.entryId, 'inaccesible', 'unreachable')

    if (reachable) {
      mergeAbrupt(result, current)
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

function buildIf(node: PythonNode, depth: number, context: PythonContext, builder: FlowGraphBuilder, source: string, functionEntries: Map<string, string>, pendingCalls: Array<{ nodeId: string; name: string }>): FlowFragment {
  const bodies = bodiesOf(node)
  if (!bodies.length) return simpleFragment(node, depth, context, builder, source)
  const branches = bodies.map((body, index) => {
    const headerStart = index === 0 ? node.from : bodies[index - 1].to
    return { body, header: headerBetween(source, headerStart, body.from), line: lineAt(source, headerStart) }
  })
  const result = emptyFlowFragment()
  const branchResults: Array<{ decision: string; flow: FlowFragment }> = []
  let previousDecision: string | null = null
  let elseFlow: FlowFragment | null = null
  let elseDecision: string | null = null

  for (const branch of branches) {
    if (/^else\b/.test(branch.header)) {
      elseFlow = buildSequence(statementsOf(branch.body), depth + 1, context, builder, source, functionEntries, pendingCalls)
      elseDecision = previousDecision
      continue
    }
    const condition = stripHeader(branch.header, /^(?:if|elif)\b/.test(branch.header) ? (/^elif\b/.test(branch.header) ? 'elif' : 'if') : 'if')
    const line = branch.line
    const decision = builder.addNode({ kind: 'condition', label: `¿${condition}?`, line, detail: 'Decisión · rama', source: branch.header }, depth)
    if (!result.entryId) result.entryId = decision
    if (previousDecision) builder.addEdge(previousDecision, decision, 'falso · siguiente condición', 'false')
    previousDecision = decision
    const flow = buildSequence(statementsOf(branch.body), depth + 1, context, builder, source, functionEntries, pendingCalls)
    if (flow.entryId) builder.addEdge(decision, flow.entryId, 'verdadero', 'true')
    branchResults.push({ decision, flow })
  }

  if (!previousDecision) return simpleFragment(node, depth, context, builder, source)
  if (elseFlow?.entryId && elseDecision) builder.addEdge(elseDecision, elseFlow.entryId, 'falso · else', 'false')
  const normalSources: Array<{ id: string; label: string; role: 'merge' | 'true' | 'false' }> = []
  for (const branch of branchResults) {
    if (branch.flow.entryId === null && branch.flow.exitIds.length === 0) normalSources.push({ id: branch.decision, label: 'verdadero', role: 'true' })
    for (const id of branch.flow.exitIds) normalSources.push({ id, label: 'unir', role: 'merge' })
    mergeAbrupt(result, branch.flow)
  }
  if (elseFlow) {
    if (!elseFlow.entryId && elseDecision) normalSources.push({ id: elseDecision, label: 'falso', role: 'false' })
    for (const id of elseFlow.exitIds) normalSources.push({ id, label: 'unir', role: 'merge' })
    mergeAbrupt(result, elseFlow)
  } else {
    normalSources.push({ id: previousDecision, label: 'falso', role: 'false' })
  }

  if (normalSources.length) {
    const merge = builder.addConnector(lineAt(source, node.from), depth)
    normalSources.forEach((path) => builder.addEdge(path.id, merge, path.label, path.role))
    result.exitIds.push(merge)
  }
  return result
}

function buildLoop(node: PythonNode, depth: number, context: PythonContext, builder: FlowGraphBuilder, source: string, functionEntries: Map<string, string>, pendingCalls: Array<{ nodeId: string; name: string }>): FlowFragment {
  const bodies = bodiesOf(node)
  const header = headerBetween(source, node.from, bodies[0]?.from ?? node.to)
  const line = lineAt(source, node.from)
  const loop = builder.addNode({ kind: 'loop', label: `¿${compactSource(header, 38)}?`, line, detail: 'Decisión · iteración', source: header }, depth)
  const body = bodies[0] ? buildSequence(statementsOf(bodies[0]), depth + 1, { ...context, loopDepth: context.loopDepth + 1 }, builder, source, functionEntries, pendingCalls) : emptyFlowFragment()
  const emptyBody = !body.entryId ? builder.addNode({ kind: 'statement', label: 'Cuerpo vacío', line, detail: 'Sin instrucciones', phase: 'body' }, depth + 1) : null
  const exit = builder.addConnector(line, depth)
  const bodyEntry = body.entryId ?? emptyBody!
  builder.addEdge(loop, bodyEntry, 'verdadero · cuerpo', 'true')
  if (!body.entryId) builder.addEdge(bodyEntry, loop, 'repetir', 'repeat')
  const loopElse = bodies[1] ? buildSequence(statementsOf(bodies[1]), depth + 1, context, builder, source, functionEntries, pendingCalls) : emptyFlowFragment()
  const falseTarget = loopElse.entryId ?? exit
  builder.addEdge(loop, falseTarget, bodies[1] ? 'agotado · else' : 'falso · salir', bodies[1] ? 'body' : 'false')

  for (const id of body.exitIds) builder.addEdge(id, loop, 'repetir', 'repeat')
  for (const id of body.continueIds) builder.addEdge(id, loop, 'continue · evaluar', 'repeat')
  for (const id of body.breakIds) builder.addEdge(id, exit, 'break · salir', 'exit')
  for (const id of loopElse.exitIds) builder.addEdge(id, exit, 'continuar', 'merge')

  const result = emptyFlowFragment()
  result.entryId = loop
  const hasNormalExit = body.breakIds.length > 0 || (bodies[1] ? loopElse.exitIds.length > 0 : true)
  if (hasNormalExit) result.exitIds.push(exit)
  result.returnIds.push(...body.returnIds, ...loopElse.returnIds)
  result.throwIds.push(...body.throwIds, ...loopElse.throwIds)
  result.breakIds.push(...loopElse.breakIds)
  result.continueIds.push(...loopElse.continueIds)
  return result
}

function buildMatch(node: PythonNode, depth: number, context: PythonContext, builder: FlowGraphBuilder, source: string, functionEntries: Map<string, string>, pendingCalls: Array<{ nodeId: string; name: string }>): FlowFragment {
  const matchBody = childrenOf(node).find((child) => child.name === 'MatchBody')
  const clauses = matchBody ? childrenOf(matchBody).filter((child) => child.name === 'MatchClause') : []
  if (!clauses.length) return simpleFragment(node, depth, context, builder, source)
  const header = headerBetween(source, node.from, matchBody?.from ?? node.to)
  const line = lineAt(source, node.from)
  const decision = builder.addNode({ kind: 'condition', label: compactSource(header, 38), line, detail: 'Decisión · match', source: header }, depth)
  const merge = builder.addConnector(line, depth)
  const result = emptyFlowFragment()
  result.entryId = decision
  let hasWildcard = false
  let hasNormalPath = false

  for (const clause of clauses) {
    const body = bodiesOf(clause)[0]
    if (!body) continue
    const label = headerBetween(source, clause.from, body.from).replace(/^case\s*/, '').replace(/:\s*$/, '')
    if (label.trim() === '_' || /^_\s+if\b/.test(label.trim())) hasWildcard = true
    const branch = buildSequence(statementsOf(body), depth + 1, context, builder, source, functionEntries, pendingCalls)
    if (branch.entryId) builder.addEdge(decision, branch.entryId, `case ${compactSource(label, 28)}`, 'case')
    else {
      builder.addEdge(decision, merge, `case ${compactSource(label, 28)}`, 'case')
      hasNormalPath = true
    }
    for (const id of branch.exitIds) {
      builder.addEdge(id, merge, 'unir', 'merge')
      hasNormalPath = true
    }
    mergeAbrupt(result, branch)
  }
  if (!hasWildcard) {
    builder.addEdge(decision, merge, 'sin coincidencia', 'false')
    hasNormalPath = true
  }
  if (hasNormalPath) result.exitIds.push(merge)
  return result
}

function buildTry(node: PythonNode, depth: number, context: PythonContext, builder: FlowGraphBuilder, source: string, functionEntries: Map<string, string>, pendingCalls: Array<{ nodeId: string; name: string }>): FlowFragment {
  const bodies = bodiesOf(node)
  const segments = bodies.map((body, index) => ({
    body,
    header: headerBetween(source, index === 0 ? node.from : bodies[index - 1].to, body.from),
  }))
  if (segments.some(({ header }) => /^finally\b/.test(header))) {
    throw new Error(`No se generó el diagrama: try/finally requiere mostrar sus salidas diferidas (línea ${lineAt(source, node.from)}).`)
  }
  const line = lineAt(source, node.from)
  const tryNode = builder.addNode({ kind: 'event', label: 'try · control de excepción', line, detail: 'Ruta normal y posibles excepciones', source: nodeSource(source, node) }, depth)
  const trySegment = segments[0]
  const tryFlow = trySegment ? buildSequence(statementsOf(trySegment.body), depth + 1, context, builder, source, functionEntries, pendingCalls) : emptyFlowFragment()
  if (tryFlow.entryId) builder.addEdge(tryNode, tryFlow.entryId, 'ejecutar', 'body')

  const exceptFlows: FlowFragment[] = []
  let elseFlow: FlowFragment | null = null
  for (const segment of segments.slice(1)) {
    if (/^except\b/.test(segment.header)) {
      const flow = buildSequence(statementsOf(segment.body), depth + 1, context, builder, source, functionEntries, pendingCalls)
      exceptFlows.push(flow)
      if (flow.entryId) builder.addEdge(tryNode, flow.entryId, `si ocurre ${compactSource(segment.header, 24)}`, 'exception')
      for (const id of tryFlow.throwIds) if (flow.entryId) builder.addEdge(id, flow.entryId, 'capturar', 'exception')
    } else if (/^else\b/.test(segment.header)) {
      elseFlow = buildSequence(statementsOf(segment.body), depth + 1, context, builder, source, functionEntries, pendingCalls)
    }
  }
  if (elseFlow?.entryId) for (const id of tryFlow.exitIds) builder.addEdge(id, elseFlow.entryId, 'sin excepción', 'body')

  const normalSources = elseFlow
    ? tryFlow.exitIds.length ? [...elseFlow.exitIds] : []
    : [...tryFlow.exitIds]
  for (const flow of exceptFlows) normalSources.push(...flow.exitIds)
  const result = emptyFlowFragment()
  result.entryId = tryNode
  if (normalSources.length) {
    const merge = builder.addConnector(line, depth)
    normalSources.forEach((id) => builder.addEdge(id, merge, 'continuar', 'merge'))
    result.exitIds.push(merge)
  }
  const catchesEveryException = segments.some(({ header }) => /^except(?:\s+BaseException(?:\s+as\s+[A-Za-z_]\w*)?)?$/.test(header.trim()))
  if (!catchesEveryException) result.throwIds.push(...tryFlow.throwIds)
  exceptFlows.forEach((flow) => mergeAbrupt(result, flow))
  result.breakIds.push(...tryFlow.breakIds)
  result.continueIds.push(...tryFlow.continueIds)
  result.returnIds.push(...tryFlow.returnIds)
  if (elseFlow) mergeAbrupt(result, elseFlow)
  return result
}

function buildFunction(node: PythonNode, depth: number, context: PythonContext, builder: FlowGraphBuilder, source: string, functionEntries: Map<string, string>, pendingCalls: Array<{ nodeId: string; name: string }>): FlowFragment {
  const code = nodeSource(source, node)
  const name = code.match(/(?:async\s+)?def\s+([A-Za-z_]\w*)/)?.[1] ?? 'anónima'
  const line = nodeLine(source, node)
  const definition = builder.addNode({ kind: 'function', label: `Definir ${name}()`, line, detail: 'El cuerpo se muestra como subflujo', source: code }, depth)
  const body = bodiesOf(node)[0]
  const entry = builder.addNode({ kind: 'start', label: `Inicio · ${name}()`, line, detail: 'Entrada de función', shape: 'terminator' }, depth + 1)
  const exit = builder.addNode({ kind: 'end', label: `Fin · ${name}()`, line, detail: 'Salida de función', shape: 'terminator' }, depth + 1)
  builder.addEdge(definition, entry, 'cuerpo de función', 'data')
  if (!functionEntries.has(name)) functionEntries.set(name, entry)
  const functionFlow = body ? buildSequence(statementsOf(body), depth + 2, { loopDepth: 0, functionDepth: context.functionDepth + 1 }, builder, source, functionEntries, pendingCalls) : emptyFlowFragment()
  if (functionFlow.entryId) builder.addEdge(entry, functionFlow.entryId, 'ejecutar cuerpo', 'body')
  else builder.addEdge(entry, exit, 'vacía', 'control')
  for (const id of functionFlow.exitIds) builder.addEdge(id, exit, 'fin normal', 'exit')
  for (const id of functionFlow.returnIds) builder.addEdge(id, exit, 'return', 'exit')
  for (const id of functionFlow.throwIds) builder.addEdge(id, exit, 'excepción', 'exception')
  return { ...emptyFlowFragment(), entryId: definition, exitIds: [definition] }
}

function buildClass(node: PythonNode, depth: number, context: PythonContext, builder: FlowGraphBuilder, source: string, functionEntries: Map<string, string>, pendingCalls: Array<{ nodeId: string; name: string }>): FlowFragment {
  const code = nodeSource(source, node)
  const name = code.match(/^class\s+([A-Za-z_]\w*)/)?.[1] ?? 'clase'
  const line = nodeLine(source, node)
  const classNode = builder.addNode({ kind: 'class', label: `class ${name}`, line, detail: 'Proceso · definir clase', source: code }, depth)
  const body = bodiesOf(node)[0]
  if (body) {
    const members = buildSequence(statementsOf(body), depth + 1, context, builder, source, functionEntries, pendingCalls)
    if (members.entryId) builder.addEdge(classNode, members.entryId, 'miembros · subflujo', 'data')
  }
  return { ...emptyFlowFragment(), entryId: classNode, exitIds: [classNode] }
}

function buildStatement(node: PythonNode, depth: number, context: PythonContext, builder: FlowGraphBuilder, source: string, functionEntries: Map<string, string>, pendingCalls: Array<{ nodeId: string; name: string }>): FlowFragment {
  if (node.name === 'DecoratedDefinition') {
    const definition = childrenOf(node).find((child) => child.name.endsWith('Definition'))
    return definition ? buildStatement(definition, depth, context, builder, source, functionEntries, pendingCalls) : simpleFragment(node, depth, context, builder, source)
  }
  if (node.name === 'FunctionDefinition') return buildFunction(node, depth, context, builder, source, functionEntries, pendingCalls)
  if (node.name === 'ClassDefinition') return buildClass(node, depth, context, builder, source, functionEntries, pendingCalls)
  if (node.name === 'IfStatement') return buildIf(node, depth, context, builder, source, functionEntries, pendingCalls)
  if (node.name === 'ForStatement' || node.name === 'WhileStatement') return buildLoop(node, depth, context, builder, source, functionEntries, pendingCalls)
  if (node.name === 'MatchStatement') return buildMatch(node, depth, context, builder, source, functionEntries, pendingCalls)
  if (node.name === 'TryStatement') return buildTry(node, depth, context, builder, source, functionEntries, pendingCalls)

  const fragment = simpleFragment(node, depth, context, builder, source)
  const code = nodeSource(source, node).trim()
  const call = code.match(/^([A-Za-z_]\w*)\s*\(/)?.[1]
  if (call && fragment.entryId && !['print', 'input'].includes(call)) pendingCalls.push({ nodeId: fragment.entryId, name: call })
  return fragment
}

export function analyzePython(source: string): DiagramGraph {
  const tree = parser.parse(source)
  const stack = [tree.topNode]
  while (stack.length) {
    const node = stack.pop()!
    if (node.type.isError) throw new Error(`No se generó el diagrama: sintaxis Python incompleta o no válida cerca de la línea ${lineAt(source, node.from)}.`)
    for (let child = node.firstChild; child; child = child.nextSibling) stack.push(child)
  }

  const builder = new FlowGraphBuilder()
  const functionEntries = new Map<string, string>()
  const pendingCalls: Array<{ nodeId: string; name: string }> = []
  const lineCount = source.split('\n').length
  const start = builder.addNode({ kind: 'start', label: 'Inicio', line: 1, detail: 'Entrada del programa', shape: 'terminator' }, 0)
  const end = builder.addNode({ kind: 'end', label: 'Fin', line: lineCount, detail: 'Salida del programa', shape: 'terminator' }, 0)
  const main = buildSequence(statementsOf(tree.topNode), 1, { loopDepth: 0, functionDepth: 0 }, builder, source, functionEntries, pendingCalls)

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
