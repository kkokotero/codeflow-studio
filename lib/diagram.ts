import { parse } from '@babel/parser'
import * as t from '@babel/types'
import type { DiagramGraph, FlowCardEdge, FlowCardNode, FlowEdgeRole, Language, NodeKind, OperationCategory } from '@/lib/codeflow-types'
import { parsePythonExpression, type ExpressionSpec } from './expression-tree'

interface StatementDescription {
  kind: NodeKind
  label: string
  detail: string
  phase?: FlowCardNode['data']['phase']
}

interface StatementRange {
  entryId: string
  exitId: string
}

interface SequenceRange {
  entryId: string | null
  exitId: string | null
}

const operationLabels: Record<OperationCategory, string> = {
  read: 'Lectura de valor',
  write: 'Escritura de valor',
  literal: 'Valor literal',
  arithmetic: 'Operación aritmética',
  comparison: 'Comparación',
  logical: 'Operación lógica',
  assignment: 'Asignación',
  call: 'Llamada',
  access: 'Acceso a propiedad',
  collection: 'Estructura de datos',
  conditional: 'Selección condicional',
  unary: 'Operación unaria',
  template: 'Interpolación de texto',
}

const edgeColors: Record<FlowEdgeRole, string> = {
  control: '#64736b',
  data: '#72b8ca',
  true: '#75c797',
  false: '#e39a88',
  repeat: '#b49be8',
  exit: '#d7b773',
  body: '#88958d',
  operand: '#72b8ca',
  case: '#dfbd73',
  exception: '#e1847f',
  merge: '#82918a',
}

function compact(value: string, length = 32): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > length ? `${normalized.slice(0, length - 1)}…` : normalized
}

function sourceOf(node: t.Node | null | undefined, source: string): string {
  if (!node || node.start == null || node.end == null) return ''
  return source.slice(node.start, node.end)
}

function describeStatement(statement: t.Statement, source: string): StatementDescription | null {
  if (t.isFunctionDeclaration(statement)) return { kind: 'function', label: `${statement.id?.name ?? 'anónima'}()`, detail: 'Declaración de función' }
  if (t.isClassDeclaration(statement)) return { kind: 'class', label: statement.id?.name ?? 'Clase', detail: 'Declaración de clase' }
  if (t.isVariableDeclaration(statement)) {
    const first = statement.declarations[0]
    const name = first ? compact(sourceOf(first.id, source) || 'variable', 24) : 'variable'
    const isObject = first?.init && (t.isObjectExpression(first.init) || t.isArrayExpression(first.init))
    return { kind: isObject ? 'object' : 'variable', label: `${statement.kind} ${name}`, detail: isObject ? 'Inicialización de colección' : 'Declaración de variable' }
  }
  if (t.isIfStatement(statement)) return { kind: 'condition', label: 'if · condición', detail: 'Evaluación de rama' }
  if (t.isSwitchStatement(statement)) return { kind: 'condition', label: 'switch · selección', detail: 'Selección entre casos' }
  if (t.isForStatement(statement)) return { kind: 'loop', label: 'for · iteración', detail: 'Bucle con inicialización y actualización' }
  if (t.isForInStatement(statement)) return { kind: 'loop', label: 'for…in · iteración', detail: 'Iteración sobre claves' }
  if (t.isForOfStatement(statement)) return { kind: 'loop', label: 'for…of · iteración', detail: 'Iteración sobre valores' }
  if (t.isWhileStatement(statement)) return { kind: 'loop', label: 'while · iteración', detail: 'Bucle con condición previa' }
  if (t.isDoWhileStatement(statement)) return { kind: 'loop', label: 'do…while · iteración', detail: 'Bucle con condición posterior' }
  if (t.isReturnStatement(statement)) return { kind: 'return', label: 'return', detail: 'Salida de función' }
  if (t.isThrowStatement(statement)) return { kind: 'event', label: 'throw · excepción', detail: 'Salida por error' }
  if (t.isBreakStatement(statement)) return { kind: 'phase', label: 'break · salir', detail: 'Salida anticipada del bucle', phase: 'exit' }
  if (t.isContinueStatement(statement)) return { kind: 'phase', label: 'continue · repetir', detail: 'Siguiente iteración', phase: 'update' }
  if (t.isImportDeclaration(statement)) return { kind: 'import', label: `import ${statement.source.value}`, detail: 'Dependencia de módulo' }
  if (t.isTryStatement(statement)) return { kind: 'event', label: 'try · excepción', detail: 'Flujo de excepciones' }
  if (t.isExpressionStatement(statement)) {
    const expression = statement.expression
    if (t.isAssignmentExpression(expression)) return { kind: 'variable', label: `asignar ${compact(sourceOf(expression.left, source), 22)}`, detail: `Asignación ${expression.operator}` }
    if (t.isUpdateExpression(expression)) return { kind: 'variable', label: compact(sourceOf(expression, source), 24), detail: 'Incremento o decremento' }
    if (t.isCallExpression(expression) || t.isOptionalCallExpression(expression)) {
      const callee = expression.callee
      const label = t.isIdentifier(callee) ? callee.name : t.isMemberExpression(callee) && t.isIdentifier(callee.property) ? callee.property.name : 'llamada'
      const isEvent = label === 'addEventListener' || label === 'removeEventListener' || label === 'on'
      return { kind: isEvent ? 'event' : 'call', label: `${label}()`, detail: isEvent ? 'Registro de evento' : 'Evaluación de llamada' }
    }
    return { kind: 'statement', label: compact(sourceOf(expression, source) || 'expresión'), detail: 'Evaluación de expresión' }
  }
  if (t.isBlockStatement(statement) || t.isEmptyStatement(statement)) return null
  return { kind: 'statement', label: compact(sourceOf(statement, source) || statement.type), detail: 'Instrucción de control' }
}

function babelChildren(expression: t.Expression): Array<{ expression: t.Expression; access?: 'write' }> {
  const children: Array<{ expression: t.Expression; access?: 'write' }> = []
  const add = (candidate: t.Node | null | undefined, access?: 'write') => {
    if (candidate && t.isExpression(candidate)) children.push({ expression: candidate, access })
  }

  if (t.isAssignmentExpression(expression)) {
    add(expression.left, 'write')
    add(expression.right)
  } else if (t.isUpdateExpression(expression)) add(expression.argument, 'write')
  else if (t.isBinaryExpression(expression) || t.isLogicalExpression(expression)) {
    add(expression.left)
    add(expression.right)
  } else if (t.isUnaryExpression(expression)) add(expression.argument)
  else if (t.isConditionalExpression(expression)) {
    add(expression.test)
    add(expression.consequent)
    add(expression.alternate)
  } else if (t.isCallExpression(expression) || t.isOptionalCallExpression(expression) || t.isNewExpression(expression)) {
    add(expression.callee)
    for (const argument of expression.arguments) add(t.isSpreadElement(argument) ? argument.argument : argument)
  } else if (t.isMemberExpression(expression) || t.isOptionalMemberExpression(expression)) {
    add(expression.object)
    if (expression.computed) add(expression.property)
  } else if (t.isArrayExpression(expression)) {
    for (const item of expression.elements) if (item) add(t.isSpreadElement(item) ? item.argument : item)
  } else if (t.isObjectExpression(expression)) {
    for (const property of expression.properties) {
      if (t.isObjectProperty(property)) {
        if (property.computed) add(property.key)
        add(property.value)
      } else if (t.isSpreadElement(property)) add(property.argument)
    }
  } else if (t.isTemplateLiteral(expression)) {
    expression.expressions.forEach((item) => add(item))
  } else if (t.isSequenceExpression(expression)) {
    expression.expressions.forEach((item) => add(item))
  } else if (t.isAwaitExpression(expression)) add(expression.argument)
  else if (t.isYieldExpression(expression)) add(expression.argument)
  else if (t.isTSAsExpression(expression) || t.isTSTypeAssertion(expression) || t.isTypeCastExpression(expression) || t.isTSNonNullExpression(expression) || t.isTSSatisfiesExpression(expression)) add(expression.expression)

  return children
}

function babelExpressionSpec(expression: t.Expression, source: string, access: 'read' | 'write' = 'read', depth = 0): ExpressionSpec | null {
  if (depth > 32) return null
  const expressionSource = sourceOf(expression, source) || expression.type
  const childInputs = babelChildren(expression)
  const children = childInputs.map((child) => babelExpressionSpec(child.expression, source, child.access ?? 'read', depth + 1)).filter((item): item is ExpressionSpec => Boolean(item))
  const expressionStart = expression.start ?? 0
  const withMetadata = (spec: Omit<ExpressionSpec, 'sourceStart' | 'operationType' | 'operationId'>): ExpressionSpec => ({
    ...spec,
    sourceStart: expressionStart,
    operationType: expression.type,
    operationId: `js-${expressionStart}-${expression.type}`,
  })

  if (t.isIdentifier(expression)) return withMetadata({ source: expressionSource, label: `${access === 'write' ? 'Escribir' : 'Leer'} ${expression.name}`, detail: operationLabels[access], category: access, children: [] })
  if (t.isNumericLiteral(expression) || t.isStringLiteral(expression) || t.isBooleanLiteral(expression) || t.isNullLiteral(expression) || t.isBigIntLiteral(expression) || t.isRegExpLiteral(expression)) {
    return withMetadata({ source: expressionSource, label: compact(expressionSource, 24), detail: operationLabels.literal, category: 'literal', children: [] })
  }
  if (t.isBinaryExpression(expression)) {
    const category: OperationCategory = ['==', '===', '!=', '!==', '<', '<=', '>', '>=', 'in', 'instanceof'].includes(expression.operator) ? 'comparison' : 'arithmetic'
    return withMetadata({ source: expressionSource, label: expression.operator, detail: operationLabels[category], category, children })
  }
  if (t.isLogicalExpression(expression)) return withMetadata({ source: expressionSource, label: expression.operator, detail: operationLabels.logical, category: 'logical', children })
  if (t.isAssignmentExpression(expression) || t.isUpdateExpression(expression)) return withMetadata({ source: expressionSource, label: t.isAssignmentExpression(expression) ? expression.operator : expression.prefix ? `${expression.operator} · prefijo` : `${expression.operator} · sufijo`, detail: operationLabels.assignment, category: 'assignment', children })
  if (t.isUnaryExpression(expression)) {
    const category: OperationCategory = expression.operator === '!' ? 'logical' : 'unary'
    return withMetadata({ source: expressionSource, label: expression.operator, detail: operationLabels[category], category, children })
  }
  if (t.isConditionalExpression(expression)) return withMetadata({ source: expressionSource, label: '?:', detail: operationLabels.conditional, category: 'conditional', children })
  if (t.isCallExpression(expression) || t.isOptionalCallExpression(expression) || t.isNewExpression(expression)) return withMetadata({ source: expressionSource, label: t.isNewExpression(expression) ? 'new · crear' : 'llamar · ejecutar', detail: operationLabels.call, category: 'call', children })
  if (t.isMemberExpression(expression) || t.isOptionalMemberExpression(expression)) {
    return withMetadata({ source: expressionSource, label: access === 'write' ? `Escribir ${compact(expressionSource, 18)}` : `acceso · ${compact(expressionSource, 18)}`, detail: operationLabels[access === 'write' ? 'write' : 'access'], category: access === 'write' ? 'write' : 'access', children })
  }
  if (t.isArrayExpression(expression) || t.isObjectExpression(expression)) return withMetadata({ source: expressionSource, label: t.isArrayExpression(expression) ? `Array · ${expression.elements.length}` : `Objeto · ${expression.properties.length}`, detail: operationLabels.collection, category: 'collection', children })
  if (t.isTemplateLiteral(expression)) return withMetadata({ source: expressionSource, label: 'plantilla · interpolar', detail: operationLabels.template, category: 'template', children })
  if (t.isThisExpression(expression) || t.isSuper(expression)) return withMetadata({ source: expressionSource, label: expression.type === 'ThisExpression' ? 'Leer this' : 'Leer super', detail: operationLabels.read, category: 'read', children: [] })
  return withMetadata({ source: expressionSource, label: compact(expressionSource, 22), detail: operationLabels[children.length ? 'unary' : 'literal'], category: children.length ? 'unary' : 'literal', children })
}

function edgeStyle(role: FlowEdgeRole) {
  const color = edgeColors[role]
  return { stroke: color, strokeWidth: role === 'data' || role === 'operand' ? 1.5 : 1.7, ...(role === 'repeat' ? { strokeDasharray: '5 4' } : {}) }
}

function addExpressionTree(
  spec: ExpressionSpec,
  line: number,
  targetId: string,
  depth: number,
  statementRow: number,
  nodes: FlowCardNode[],
  edges: FlowCardEdge[],
  addEdge: (source: string, target: string, label: string, role: FlowEdgeRole) => void,
  expressionOffset = 0,
  operationIdFor?: (spec: ExpressionSpec) => string | undefined,
): number {
  let column = 0
  let maxDepth = 0
  const visit = (current: ExpressionSpec, expressionDepth: number): string => {
    maxDepth = Math.max(maxDepth, expressionDepth)
    const children = current.children.map((child) => visit(child, expressionDepth + 1))
    const id = `operation-${nodes.length}`
    nodes.push({
      id,
      type: 'flowCard',
      position: { x: 330 + depth * 120 + expressionOffset + column * 142, y: 68 + statementRow * 108 + expressionDepth * 76 },
      data: {
        label: compact(current.label),
        kind: 'operation',
        line,
        detail: current.detail === current.category ? operationLabels[current.category] : current.detail,
        active: false,
        expression: compact(current.source, 140),
        operationId: current.operationId ?? operationIdFor?.(current),
        operationCategory: current.category,
      },
    })
    column += 1
    children.forEach((childId, index) => addEdge(childId, id, `entrada ${index + 1}`, 'data'))
    return id
  }
  const rootId = visit(spec, 0)
  addEdge(rootId, targetId, 'resultado', 'data')
  return maxDepth
}

function statementExpressions(statement: t.Statement): t.Expression[] {
  if (t.isVariableDeclaration(statement)) return statement.declarations.flatMap((declaration) => declaration.init && t.isExpression(declaration.init) ? [declaration.init] : [])
  if (t.isExpressionStatement(statement)) return [statement.expression]
  if (t.isIfStatement(statement)) return [statement.test]
  if (t.isReturnStatement(statement) && statement.argument) return [statement.argument]
  if (t.isThrowStatement(statement)) return [statement.argument]
  if (t.isSwitchStatement(statement)) return [statement.discriminant]
  if (t.isWithStatement(statement)) return [statement.object]
  return []
}

function blockStatements(statement: t.Statement): t.Statement[] {
  return t.isBlockStatement(statement) ? statement.body : [statement]
}

function analyzeJavaScript(source: string): DiagramGraph {
  const ast = parse(source, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'], errorRecovery: false })
  const nodes: FlowCardNode[] = []
  const edges: FlowCardEdge[] = []
  let row = 0

  const addEdge = (sourceId: string, targetId: string, label: string, role: FlowEdgeRole = 'control') => {
    if (!sourceId || !targetId || sourceId === targetId) return
    edges.push({ id: `edge-${edges.length}`, source: sourceId, target: targetId, label, type: 'smoothstep', data: { role }, style: edgeStyle(role), labelStyle: { fill: edgeColors[role], fontSize: 10 } })
  }

  const addNode = (description: StatementDescription, line: number, depth: number, nodeRow: number) => {
    const id = `node-${nodes.length}`
    nodes.push({ id, type: 'flowCard', position: { x: 84 + depth * 84, y: 68 + nodeRow * 108 }, data: { ...description, line, active: false } })
    return id
  }

  const addPhaseNode = (label: string, line: number, depth: number, phase: NonNullable<FlowCardNode['data']['phase']>, kind: NodeKind = 'phase') => {
    const phaseRow = row++
    const id = `node-${nodes.length}`
    nodes.push({ id, type: 'flowCard', position: { x: 84 + depth * 84, y: 68 + phaseRow * 108 }, data: { label, kind, line, detail: phase === 'condition' ? 'Evaluación de condición' : 'Fase de flujo', active: false, phase } })
    return { id, row: phaseRow }
  }

  const attachExpression = (expression: t.Expression | null | undefined, targetId: string, line: number, depth: number, nodeRow: number, offset = 0) => {
    if (!expression) return 0
    const spec = babelExpressionSpec(expression, source)
    if (!spec) return 0
    return addExpressionTree(spec, line, targetId, depth, nodeRow, nodes, edges, addEdge, offset)
  }

  function addSequence(statements: t.Statement[], depth: number, parentId?: string, entryRole: FlowEdgeRole = 'body', entryLabel = 'cuerpo'): SequenceRange {
    let first: StatementRange | null = null
    let previous: StatementRange | null = null
    for (const statement of statements.filter((item) => !t.isBlockStatement(item) && !t.isEmptyStatement(item))) {
      const current = addStatement(statement, depth)
      if (!first) {
        first = current
        if (parentId) addEdge(parentId, current.entryId, entryLabel, entryRole)
      }
      if (previous) addEdge(previous.exitId, current.entryId, 'siguiente', 'control')
      previous = current
    }
    return { entryId: first?.entryId ?? null, exitId: previous?.exitId ?? null }
  }

  function addStatement(statement: t.Statement, depth: number): StatementRange {
    const description = describeStatement(statement, source)
    if (!description) {
      const id = `node-${nodes.length}`
      return { entryId: id, exitId: id }
    }
    const line = statement.loc?.start.line ?? 1
    const statementRow = row++
    const id = addNode(description, line, depth, statementRow)

    if (t.isIfStatement(statement)) {
      const conditionDepth = attachExpression(statement.test, id, line, depth, statementRow)
      row += conditionDepth
      const trueRange = addSequence(blockStatements(statement.consequent), depth + 1, id, 'true', 'verdadero')
      let trueTerminal = trueRange.exitId
      if (!trueRange.entryId) {
        const emptyTrue = addPhaseNode('Rama verdadera · vacía', line, depth + 1, 'branch')
        addEdge(id, emptyTrue.id, 'verdadero', 'true')
        trueTerminal = emptyTrue.id
      }
      const falseRange = statement.alternate ? addSequence(blockStatements(statement.alternate), depth + 1, id, 'false', 'falso') : { entryId: null, exitId: null }
      let falseTerminal = falseRange.exitId
      if (!statement.alternate) {
        const falseBranch = addPhaseNode('Sin rama falsa · continuar', line, depth + 1, 'branch')
        addEdge(id, falseBranch.id, 'falso', 'false')
        falseTerminal = falseBranch.id
      }
      const merge = addPhaseNode('Continuación', line, depth, 'merge')
      addEdge(trueTerminal ?? id, merge.id, 'unir', 'merge')
      addEdge(falseTerminal ?? id, merge.id, 'unir', 'merge')
      return { entryId: id, exitId: merge.id }
    }

    if (t.isForStatement(statement) || t.isForInStatement(statement) || t.isForOfStatement(statement) || t.isWhileStatement(statement) || t.isDoWhileStatement(statement)) {
      const forLoop = t.isForStatement(statement)
      const iteratingLoop = t.isForInStatement(statement) || t.isForOfStatement(statement)
      const doWhile = t.isDoWhileStatement(statement)
      const initializers = forLoop && statement.init
        ? t.isVariableDeclaration(statement.init)
          ? statement.init.declarations.flatMap((declaration) => declaration.init && t.isExpression(declaration.init) ? [declaration.init] : [])
          : t.isExpression(statement.init) ? [statement.init] : []
        : iteratingLoop ? [statement.right] : []
      const test = forLoop ? statement.test : t.isWhileStatement(statement) || doWhile ? statement.test : null
      const update = forLoop ? statement.update : null
      const initText = forLoop && statement.init ? sourceOf(statement.init, source) : iteratingLoop ? sourceOf(statement.right, source) : 'Preparar primera evaluación'
      const testText = test ? sourceOf(test, source) : iteratingLoop ? '¿Queda otro elemento?' : 'true · repetir hasta break'
      const updateText = update ? sourceOf(update, source) : iteratingLoop ? 'Tomar siguiente elemento' : 'Volver a evaluar'
      const init = addPhaseNode(`Inicialización · ${compact(initText, 22)}`, line, depth + 1, 'initialization')
      const condition = addPhaseNode(`¿${compact(testText, 24)}?`, line, depth + 1, 'condition', 'condition')
      const updatePhase = addPhaseNode(`Actualización · ${compact(updateText, 22)}`, line, depth + 1, 'update')
      const exit = addPhaseNode('Salida del bucle', line, depth + 1, 'exit')
      initializers.forEach((expression, index) => attachExpression(expression, init.id, line, depth + 1, init.row, index * 150))
      attachExpression(test, condition.id, line, depth + 1, condition.row)
      if (update) attachExpression(update, updatePhase.id, line, depth + 1, updatePhase.row)
      addEdge(id, init.id, 'entrar', 'control')
      addEdge(init.id, condition.id, 'evaluar', 'control')
      if (doWhile) {
        const bodyRange = addSequence(blockStatements(statement.body), depth + 1, init.id, 'body', 'cuerpo · primera vuelta')
        const bodyEnd = bodyRange.exitId ?? init.id
        addEdge(bodyEnd, condition.id, 'evaluar después', 'control')
        addEdge(condition.id, bodyRange.entryId ?? init.id, 'verdadero · repetir', 'true')
      } else {
        const bodyRange = addSequence(blockStatements(statement.body), depth + 1, condition.id, 'true', 'verdadero · cuerpo')
        if (!bodyRange.entryId) {
          const emptyBody = addPhaseNode('Cuerpo vacío', line, depth + 2, 'body')
          addEdge(condition.id, emptyBody.id, 'verdadero', 'true')
          addEdge(emptyBody.id, updatePhase.id, 'siguiente', 'control')
        } else {
          addEdge(bodyRange.exitId ?? bodyRange.entryId, updatePhase.id, 'siguiente', 'control')
        }
        addEdge(updatePhase.id, condition.id, 'repetir', 'repeat')
      }
      addEdge(condition.id, exit.id, 'falso · salir', 'false')
      return { entryId: id, exitId: exit.id }
    }

    if (t.isSwitchStatement(statement)) {
      const discriminantDepth = attachExpression(statement.discriminant, id, line, depth, statementRow)
      row += discriminantDepth
      const merge = addPhaseNode('Continuación', line, depth, 'merge')
      let previousCaseExit: string | null = null
      statement.cases.forEach((switchCase) => {
        const caseLine = switchCase.loc?.start.line ?? line
        const caseSource = switchCase.test ? sourceOf(switchCase.test, source) : 'default'
        const branch = addPhaseNode(`case · ${compact(caseSource, 20)}`, caseLine, depth + 1, 'branch')
        addEdge(id, branch.id, compact(caseSource, 20), 'case')
        if (switchCase.test) attachExpression(switchCase.test, branch.id, caseLine, depth + 1, branch.row)
        if (previousCaseExit) addEdge(previousCaseExit, branch.id, 'fall-through', 'control')
        const caseRange = addSequence(switchCase.consequent, depth + 2, branch.id, 'body', 'caso')
        const caseExit = caseRange.exitId ?? branch.id
        if (switchCase.consequent.some((child) => t.isBreakStatement(child))) {
          addEdge(caseExit, merge.id, 'salir', 'exit')
          previousCaseExit = null
        } else previousCaseExit = caseExit
      })
      addEdge(previousCaseExit ?? id, merge.id, 'continuar', 'merge')
      return { entryId: id, exitId: merge.id }
    }

    if (t.isTryStatement(statement)) {
      const tryRange = addSequence(statement.block.body, depth + 1, id, 'body', 'sin error')
      const catchRange = statement.handler ? addSequence(statement.handler.body.body, depth + 1, id, 'exception', 'excepción') : { entryId: null, exitId: null }
      if (statement.finalizer) {
        const finallyRange = addSequence(statement.finalizer.body, depth + 1, id, 'control', 'finally')
        addEdge(tryRange.exitId ?? id, finallyRange.entryId ?? id, 'finalizar', 'control')
        if (catchRange.exitId) addEdge(catchRange.exitId, finallyRange.entryId ?? id, 'finalizar', 'control')
        return { entryId: id, exitId: finallyRange.exitId ?? id }
      }
      const merge = addPhaseNode('Continuación', line, depth, 'merge')
      addEdge(tryRange.exitId ?? id, merge.id, 'continuar', 'merge')
      if (catchRange.exitId) addEdge(catchRange.exitId, merge.id, 'continuar', 'merge')
      return { entryId: id, exitId: merge.id }
    }

    const expressions = statementExpressions(statement)
    let expressionDepth = 0
    expressions.forEach((expression, index) => { expressionDepth = Math.max(expressionDepth, attachExpression(expression, id, line, depth, statementRow, index * 150)) })
    row += expressionDepth

    if (t.isFunctionDeclaration(statement) && statement.body) addSequence(statement.body.body, depth + 1, id, 'body', 'cuerpo de función')
    if (t.isClassDeclaration(statement)) {
      statement.body.body.forEach((member) => {
        if (!t.isClassMethod(member) || !t.isBlockStatement(member.body)) return
        const methodLine = member.loc?.start.line ?? line
        const method = addPhaseNode(`método · ${t.isIdentifier(member.key) ? member.key.name : 'anónimo'}`, methodLine, depth + 1, 'body')
        addEdge(id, method.id, 'método', 'body')
        addSequence(member.body.body, depth + 2, method.id, 'body', 'cuerpo')
      })
    }

    return { entryId: id, exitId: id }
  }

  addSequence(ast.program.body, 0)
  return { nodes, edges }
}

interface PythonContext {
  id: string
  line: number
  indent: number
  kind: 'loop' | 'condition' | 'block' | 'branch'
  conditionId?: string
  updateId?: string
  exitId?: string
  lastBodyId?: string
  hasAlternate?: boolean
}

function analyzePython(source: string): DiagramGraph {
  const rows = source.split('\n')
  const nodes: FlowCardNode[] = []
  const edges: FlowCardEdge[] = []
  const structural: PythonContext[] = []
  let row = 0
  let previousTopLevel: string | null = null

  const addEdge = (sourceId: string, targetId: string, label: string, role: FlowEdgeRole = 'control') => {
    if (!sourceId || !targetId || sourceId === targetId) return
    edges.push({ id: `edge-${edges.length}`, source: sourceId, target: targetId, label, type: 'smoothstep', data: { role }, style: edgeStyle(role), labelStyle: { fill: edgeColors[role], fontSize: 10 } })
  }

  const addNode = (label: string, kind: NodeKind, line: number, indent: number, detail: string, nodeRow: number, phase?: FlowCardNode['data']['phase']) => {
    const id = `node-${nodes.length}`
    nodes.push({ id, type: 'flowCard', position: { x: 84 + Math.min(indent / 4, 6) * 72, y: 68 + nodeRow * 108 }, data: { label, kind, line, detail, active: false, ...(phase ? { phase } : {}) } })
    return id
  }

  const addPhase = (label: string, line: number, indent: number, phase: NonNullable<FlowCardNode['data']['phase']>, kind: NodeKind = 'phase') => {
    const phaseRow = row++
    return { id: addNode(label, kind, line, indent + 4, phase === 'condition' ? 'Evaluación de condición' : 'Fase de flujo', phaseRow, phase), row: phaseRow }
  }

  const attachExpression = (expression: ExpressionSpec | null, targetId: string, line: number, indent: number, nodeRow: number, expressionColumn = 0) => {
    if (!expression) return 0
    const rawLine = rows[line - 1] ?? ''
    return addExpressionTree(expression, line, targetId, Math.min(indent / 4, 6), nodeRow, nodes, edges, addEdge, 0, (spec) => {
      if (!spec.operationType || spec.sourceStart === undefined) return undefined
      const sourceColumn = expressionColumn + spec.sourceStart
      const byteColumn = new TextEncoder().encode(rawLine.slice(0, sourceColumn)).length
      return `py-${line}-${byteColumn}-${spec.operationType}`
    })
  }

  const closeContext = (context: PythonContext) => {
    if (context.kind === 'loop' && context.conditionId && context.updateId && context.exitId) {
      addEdge(context.lastBodyId ?? context.conditionId, context.updateId, 'siguiente', 'control')
      addEdge(context.updateId, context.conditionId, 'repetir', 'repeat')
      addEdge(context.conditionId, context.exitId, 'falso · salir', 'false')
    } else if (context.kind === 'condition' && !context.hasAlternate) {
      const falseBranch = addPhase('Sin rama falsa · continuar', context.line, context.indent, 'branch')
      addEdge(context.id, falseBranch.id, 'falso', 'false')
    }
  }

  rows.forEach((raw, index) => {
    const text = raw.trim()
    if (!text || text.startsWith('#')) return
    const indent = raw.length - raw.trimStart().length
    const line = index + 1
    const isAlternate = /^(else|elif)\b/.test(text)
    let alternateCondition: PythonContext | undefined

    while (structural.length && structural.at(-1)!.indent >= indent) {
      const context = structural.pop()!
      if (isAlternate && context.kind === 'condition' && context.indent === indent && !alternateCondition) {
        context.hasAlternate = true
        alternateCondition = context
      } else {
        closeContext(context)
      }
    }

    let kind: NodeKind | undefined
    let label = text
    let detail = 'Instrucción'
    if (/^(async\s+)?def\s+/.test(text)) {
      kind = 'function'
      label = `${text.match(/def\s+([\w]+)/)?.[1] ?? 'función'}()`
      detail = 'Definición de función'
    } else if (/^class\s+/.test(text)) {
      kind = 'class'
      label = text.match(/^class\s+([\w]+)/)?.[1] ?? 'class'
      detail = 'Definición de clase'
    } else if (/^(if|elif|else|match|case)\b/.test(text)) {
      kind = text.startsWith('else') ? 'phase' : 'condition'
      label = compact(text.split(':')[0], 32)
      detail = text.startsWith('else') ? 'Rama alternativa' : 'Evaluación de rama'
    } else if (/^(for|while)\b/.test(text)) {
      kind = 'loop'
      label = compact(text.split(':')[0], 32)
      detail = 'Bucle de iteración'
    } else if (/^return\b/.test(text)) {
      kind = 'return'
      label = compact(text, 30)
      detail = 'Salida de función'
    } else if (/^(break|continue)\b/.test(text)) {
      kind = 'phase'
      label = text.startsWith('break') ? 'break · salir' : 'continue · repetir'
      detail = 'Control de iteración'
    } else if (/^(import|from)\b/.test(text)) {
      kind = 'import'
      label = compact(text, 30)
      detail = 'Dependencia de módulo'
    } else if (/^(print|\w+(?:\.\w+)*)\s*\(/.test(text)) {
      label = text.match(/^([\w.]+)/)?.[1] ?? 'call'
      kind = /\.(connect|on|emit)\s*\(/.test(text) ? 'event' : 'call'
      detail = kind === 'event' ? 'Registro de evento' : 'Llamada de función'
    } else if (/^[\w, ]+\s*(?:\+|-|\*|\/|%|\/\/)?=(?!=)/.test(text)) {
      const name = text.match(/^([\w]+)/)?.[1] ?? 'variable'
      kind = /[=]\s*[\[{]/.test(text) ? 'object' : 'variable'
      label = `${name} · asignar`
      detail = 'Asignación de variable'
    }
    if (!kind) {
      kind = 'statement'
      label = compact(text, 30)
    }

    const nodeRow = row++
    const id = addNode(label, kind, line, indent, detail, nodeRow, kind === 'phase' ? 'branch' : undefined)
    const parent = structural.at(-1)
    if (alternateCondition) addEdge(alternateCondition.id, id, 'falso', 'false')
    else if (parent?.kind === 'loop' && parent.conditionId) {
      if (parent.lastBodyId) addEdge(parent.lastBodyId, id, 'siguiente', 'control')
      else addEdge(parent.conditionId, id, 'verdadero · cuerpo', 'true')
      parent.lastBodyId = id
    } else if (parent?.kind === 'condition' || parent?.kind === 'branch') {
      if (parent.lastBodyId) addEdge(parent.lastBodyId, id, 'siguiente', 'control')
      else addEdge(parent.id, id, parent.kind === 'condition' ? 'verdadero' : 'cuerpo', parent.kind === 'condition' ? 'true' : 'body')
      parent.lastBodyId = id
    } else if (parent) addEdge(parent.id, id, 'bloque', 'body')
    else if (previousTopLevel) addEdge(previousTopLevel, id, 'siguiente', 'control')
    if (!parent && !alternateCondition) previousTopLevel = id

    const loopMatch = text.match(/^for\s+.+?\s+in\s+(.+?):\s*$/)
    const conditionMatch = text.match(/^(?:if|elif|while)\s+(.+?):\s*$/)
    const assignmentMatch = text.match(/^[\w.]+\s*(?:\+|-|\*|\/|%|\/\/)?=(?!=)\s*(.+)$/)
    const returnMatch = text.match(/^return\s+(.+)$/)
    const expressionText = loopMatch?.[1] ?? conditionMatch?.[1] ?? assignmentMatch?.[1] ?? returnMatch?.[1] ?? (/^(def|class|else|break|continue)\b/.test(text) ? '' : text)
    const expressionColumn = Math.max(0, raw.lastIndexOf(expressionText))
    const expression = parsePythonExpression(expressionText)

    if (kind === 'loop') {
      const isFor = text.startsWith('for ')
      const init = addPhase(isFor ? 'Inicializar iterador' : 'Entrada al bucle', line, indent, 'initialization')
      const condition = addPhase(isFor ? '¿Quedan elementos?' : `¿${compact(expressionText, 24)}?`, line, indent, 'condition', 'condition')
      const update = addPhase(isFor ? 'Tomar siguiente elemento' : 'Volver a evaluar', line, indent, 'update')
      const exit = addPhase('Salida del bucle', line, indent, 'exit')
      addEdge(id, init.id, 'entrar', 'control')
      addEdge(init.id, condition.id, 'evaluar', 'control')
      if (expression) attachExpression(expression, isFor ? init.id : condition.id, line, indent, isFor ? init.row : condition.row, expressionColumn)
      structural.push({ id, line, indent, kind: 'loop', conditionId: condition.id, updateId: update.id, exitId: exit.id })
      return
    }

    if (expression && kind !== 'phase') {
      const expressionDepth = attachExpression(expression, id, line, indent, nodeRow, expressionColumn)
      row += expressionDepth
    }

    if (kind === 'condition') structural.push({ id, line, indent, kind: 'condition' })
    else if (kind === 'phase' && text.startsWith('else')) structural.push({ id, line, indent, kind: 'branch' })
    else if (kind === 'function' || kind === 'class') structural.push({ id, line, indent, kind: 'block' })
  })

  while (structural.length) closeContext(structural.pop()!)
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
