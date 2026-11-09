import type { OperationCategory } from '@/lib/codeflow-types'

export interface ExpressionSpec {
  label: string
  source: string
  detail: string
  category: OperationCategory
  children: ExpressionSpec[]
  sourceStart?: number
  operationType?: string
  operationId?: string
}

interface Token {
  value: string
  kind: 'identifier' | 'number' | 'string' | 'operator'
  start: number
}

const binaryPrecedence: Record<string, number> = {
  or: 1,
  and: 2,
  '==': 3,
  '!=': 3,
  '<': 3,
  '>': 3,
  '<=': 3,
  '>=': 3,
  in: 3,
  'not in': 3,
  is: 3,
  'is not': 3,
  '|': 4,
  '^': 5,
  '&': 6,
  '<<': 7,
  '>>': 7,
  '+': 8,
  '-': 8,
  '*': 9,
  '@': 9,
  '/': 9,
  '//': 9,
  '%': 9,
  '**': 11,
}

const comparisonOperators = new Set(['==', '!=', '<', '>', '<=', '>=', 'in', 'not in', 'is', 'is not'])

function createExpression(
  source: string,
  label: string,
  category: OperationCategory,
  children: ExpressionSpec[] = [],
  detail?: string,
  sourceStart = 0,
  operationType?: string,
): ExpressionSpec {
  return {
    source,
    label: label.length > 32 ? `${label.slice(0, 29)}…` : label,
    category,
    detail: detail ?? category,
    children,
    sourceStart,
    operationType,
  }
}

function tokenize(source: string, sourceOffset = 0): Token[] {
  const tokens: Token[] = []
  let cursor = 0
  const multiOperators = ['**=', '//=', '<<=', '>>=', '==', '!=', '<=', '>=', '**', '//', '<<', '>>', '+=', '-=', '*=', '/=', '%=', ':=']

  while (cursor < source.length) {
    const rest = source.slice(cursor)
    if (/^\s+/.test(rest)) {
      cursor += rest.match(/^\s+/)?.[0].length ?? 1
      continue
    }

    const string = rest.match(/^(?:[fFrRuUbB]{0,2})?(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/)?.[0]
    if (string) {
      tokens.push({ value: string, kind: 'string', start: sourceOffset + cursor })
      cursor += string.length
      continue
    }

    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?j?/)?.[0]
    if (number) {
      tokens.push({ value: number, kind: 'number', start: sourceOffset + cursor })
      cursor += number.length
      continue
    }

    const identifier = rest.match(/^[A-Za-z_]\w*/)?.[0]
    if (identifier) {
      tokens.push({ value: identifier, kind: 'identifier', start: sourceOffset + cursor })
      cursor += identifier.length
      continue
    }

    const operator = multiOperators.find((candidate) => rest.startsWith(candidate)) ?? rest[0]
    tokens.push({ value: operator, kind: 'operator', start: sourceOffset + cursor })
    cursor += operator.length
  }

  return tokens
}

export function parsePythonExpression(source: string, sourceOffset = 0): ExpressionSpec | null {
  const tokens = tokenize(source, sourceOffset)
  if (!tokens.length) return null
  let cursor = 0

  const peek = (offset = 0) => tokens[cursor + offset]
  const consume = (value?: string) => {
    const token = peek()
    if (!token || (value !== undefined && token.value !== value)) return undefined
    cursor += 1
    return token
  }
  const parseExpression = (minimumPrecedence = 0): ExpressionSpec | null => {
    let left = parsePrimary()
    if (!left) return null

    while (cursor < tokens.length) {
      const current = peek()
      const next = peek(1)
      if (!current) break

      if (current.value === 'if' && minimumPrecedence === 0) {
        consume('if')
        const condition = parseExpression(0)
        if (!condition || !consume('else')) break
        const alternate = parseExpression(0)
        if (!alternate) break
        left = createExpression(`${left.source} if ${condition.source} else ${alternate.source}`, 'si · entonces · si no', 'conditional', [condition, left, alternate], undefined, left.sourceStart ?? 0, 'IfExp')
        continue
      }

      const operator = current.value === 'not' && next?.value === 'in' ? 'not in' : current.value === 'is' && next?.value === 'not' ? 'is not' : current.value
      const precedence = binaryPrecedence[operator]
      if (precedence === undefined || precedence < minimumPrecedence) break
      consume()
      if (operator.includes(' ')) consume(operator.split(' ')[1])
      const right = parseExpression(operator === '**' ? precedence : precedence + 1)
      if (!right) break

      if (comparisonOperators.has(operator)) {
        const operands = [left, right]
        let lastOperator = operator
        while (cursor < tokens.length) {
          const candidate = peek()
          const following = peek(1)
          if (!candidate) break
          const chainedOperator = candidate.value === 'not' && following?.value === 'in' ? 'not in' : candidate.value === 'is' && following?.value === 'not' ? 'is not' : candidate.value
          if (!comparisonOperators.has(chainedOperator)) break
          consume()
          if (chainedOperator.includes(' ')) consume(chainedOperator.split(' ')[1])
          const operand = parseExpression(precedence + 1)
          if (!operand) break
          operands.push(operand)
          lastOperator = chainedOperator
        }
        const label = operands.length > 2 ? `comparar · ${lastOperator}` : operator
        left = createExpression(operands.map((operand) => operand.source).join(` ${operator} `), label, 'comparison', operands, undefined, operands[0]?.sourceStart ?? 0, 'Compare')
        continue
      }

      const category: OperationCategory = operator === 'and' || operator === 'or' ? 'logical' : operator === ':=' || operator.endsWith('=') && operator.length > 1 ? 'assignment' : 'arithmetic'
      const operationType = operator === ':=' ? 'NamedExpr' : category === 'logical' ? 'BoolOp' : 'BinOp'
      left = createExpression(`${left.source} ${operator} ${right.source}`, operator, category, [left, right], undefined, left.sourceStart ?? 0, operationType)
    }

    return left
  }

  const parseDelimited = (closing: string): ExpressionSpec[] => {
    const values: ExpressionSpec[] = []
    while (cursor < tokens.length && peek()?.value !== closing) {
      const value = parseExpression(0)
      if (value) values.push(value)
      if (!consume(',')) break
    }
    consume(closing)
    return values
  }

  const parsePrimary = (): ExpressionSpec | null => {
    const token = consume()
    if (!token) return null
    let expression: ExpressionSpec

    if (token.value === 'not' || token.value === '+' || token.value === '-' || token.value === '~') {
      const argument = parseExpression(10)
      if (!argument) return createExpression(token.value, token.value, 'unary', [], undefined, token.start, 'UnaryOp')
      expression = createExpression(`${token.value} ${argument.source}`, token.value, token.value === 'not' ? 'logical' : 'unary', [argument], undefined, token.start, 'UnaryOp')
    } else if (token.value === '(') {
      const values = parseDelimited(')')
      expression = values.length === 1 ? values[0] : createExpression(`(${values.map((value) => value.source).join(', ')})`, 'tupla', 'collection', values, undefined, token.start, 'Tuple')
    } else if (token.value === '[') {
      const values = parseDelimited(']')
      expression = createExpression(`[${values.map((value) => value.source).join(', ')}]`, `lista · ${values.length}`, 'collection', values, undefined, token.start, 'List')
    } else if (token.value === '{') {
      const values = parseDelimited('}')
      expression = createExpression(`{${values.map((value) => value.source).join(', ')}}`, `diccionario · ${values.length}`, 'collection', values, undefined, token.start, 'Dict')
    } else if (token.kind === 'string' && /^[fF]/.test(token.value)) {
      const parts = [...token.value.matchAll(/\{([^{}]+)\}/g)].map((match) => parsePythonExpression(match[1], token.start + (match.index ?? 0) + 1)).filter((item): item is ExpressionSpec => Boolean(item))
      expression = createExpression(token.value, 'plantilla f-string', 'template', parts, undefined, token.start, 'JoinedStr')
    } else if (token.kind === 'number' || token.kind === 'string' || ['True', 'False', 'None'].includes(token.value)) {
      expression = createExpression(token.value, token.value.length > 18 ? `${token.value.slice(0, 15)}…` : token.value, 'literal', [], undefined, token.start, 'Constant')
    } else {
      expression = createExpression(token.value, token.value, 'read', [], undefined, token.start, 'Name')
    }

    while (cursor < tokens.length) {
      if (consume('.')) {
        const property = consume()
        if (!property) break
        const member = createExpression(property.value, property.value, 'read', [], undefined, property.start)
        expression = createExpression(`${expression.source}.${property.value}`, `acceso · ${property.value}`, 'access', [expression, member], undefined, expression.sourceStart ?? 0, 'Attribute')
        continue
      }
      if (consume('(')) {
        const args = parseDelimited(')')
        expression = createExpression(`${expression.source}(${args.map((argument) => argument.source).join(', ')})`, 'llamada', 'call', [expression, ...args], undefined, expression.sourceStart ?? 0, 'Call')
        continue
      }
      if (consume('[')) {
        const index = parseExpression(0)
        if (consume(':')) {
          const end = peek()?.value === ']' ? null : parseExpression(0)
          consume(']')
          const slice = createExpression(`${index?.source ?? ''}:${end?.source ?? ''}`, 'rango / slice', 'access', [index, end].filter((item): item is ExpressionSpec => Boolean(item)), undefined, index?.sourceStart ?? token.start, 'Slice')
          expression = createExpression(`${expression.source}[${slice.source}]`, 'índice', 'access', [expression, slice], undefined, expression.sourceStart ?? 0, 'Subscript')
          continue
        }
        consume(']')
        if (index) expression = createExpression(`${expression.source}[${index.source}]`, 'índice', 'access', [expression, index], undefined, expression.sourceStart ?? 0, 'Subscript')
        continue
      }
      break
    }

    return expression
  }

  try {
    return parseExpression()
  } catch {
    return createExpression(source, 'expresión', 'literal')
  }
}
