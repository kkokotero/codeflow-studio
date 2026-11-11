import { compactSource, emptyFlowFragment, FlowGraphBuilder, type FlowFragment, type FlowNodeInput } from '@/lib/flow-graph-builder'
import { PSEUDO, pseudoExpression, pseudoLabel, pseudoStatement } from '@/lib/pseudo-code'
import type { DiagramGraph, Language } from '@/lib/codeflow-types'

interface SourceItem {
  text: string
  line: number
}

interface SourceBlock {
  header: SourceItem | null
  items: SourceNode[]
  openLine: number
  closeLine: number
}

type SourceNode = SourceItem | SourceBlock

interface AnalyzeContext {
  loopDepth: number
  functionDepth: number
}

const CONTROL_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'catch', 'synchronized', 'using',
  'lock', 'try', 'finally', 'match', 'when', 'return', 'sizeof', 'typeof', 'new',
])

const IO_PATTERN = /\b(?:console\.log|console\.info|console\.warn|console\.error|system\.out\.print|system\.out\.printf|system\.err\.print|console\.writeline|console\.write|fmt\.print|fmt\.printf|io\.write|io\.read|std::cout|std::cerr|std::cin|println!|print!|eprintln!|print|println|printf|puts|writeln|scanf|readline|readln|input|cout|cerr)\b/i
const INPUT_PATTERN = /\b(?:input|readline|readln|scanf|cin|stdin|io\.read)\b/i

function isBlock(node: SourceNode): node is SourceBlock {
  return 'items' in node
}

function headerOf(block: SourceBlock): string {
  return block.header?.text ?? ''
}

function lineOf(block: SourceBlock): number {
  return block.header?.line ?? block.openLine
}

function isIfHeader(header: string): boolean {
  return /^(?:else\s+)?if\b/i.test(header) || /^elseif\b/i.test(header)
}

function isElseIfHeader(header: string): boolean {
  return /^else\s+if\b/i.test(header) || /^elseif\b/i.test(header)
}

function isElseHeader(header: string): boolean {
  return /^else\b/i.test(header) && !isElseIfHeader(header)
}

function isLoopHeader(header: string): boolean {
  return /^(?:for|while|do|repeat|loop)\b/i.test(header)
}

function isDoLikeHeader(header: string): boolean {
  return /^(?:do|repeat)\b/i.test(header)
}

function isSwitchHeader(header: string): boolean {
  return /^(?:switch|match|when|select)\b/i.test(header)
}

function isTryHeader(header: string): boolean {
  return /^try\b/i.test(header)
}

function isHandlerHeader(header: string): boolean {
  return /^(?:catch|except|finally)\b/i.test(header)
}

function isClassHeader(header: string): boolean {
  return /^(?:\s*(?:public|private|protected|internal|abstract|sealed|static|final|partial|export|default|data|open|pub|unsafe|extern)\s+)*(?:class|struct|interface|enum|record|union|namespace|module|trait|impl|object)\b/i.test(header)
    || /^type\s+\w+\s+(?:struct|interface)\b/i.test(header)
}

function isFunctionHeader(header: string): boolean {
  const text = header.trim()
  if (!text || isIfHeader(text) || isLoopHeader(text) || isSwitchHeader(text) || isTryHeader(text) || isHandlerHeader(text) || isClassHeader(text)) return false
  if (/^(?:synchronized|using|lock|sizeof|typeof)\b/i.test(text)) return false
  if (/^(?:local\s+)?function\b/i.test(text)) return true
  if (/^func\b/i.test(text)) return true
  if (/^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\b/i.test(text)) return true
  if (/\b(?:if|for|while|switch|catch|return|new)\b/.test(text) && !/\)\s*(?:const|noexcept|override|final|->.*)?$/.test(text)) return false
  return /^[^;{}]*[A-Za-z_]\w*\s*\([^;{}]*\)\s*(?:const|noexcept|override|final|->.*|throws\s+[\w.,\s]+)?$/i.test(text)
}

function functionName(header: string): string {
  const text = header.trim()
  const lua = text.match(/^(?:local\s+)?function\s+([A-Za-z_][\w.:]*)/i)
  if (lua) return lua[1]
  const go = text.match(/^func\s*(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/i)
  if (go) return go[1]
  const rust = text.match(/^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+([A-Za-z_]\w*)/i)
  if (rust) return rust[1]
  const callable = text.replace(/@\w+(?:\([^)]*\))?\s*/g, '').match(/([A-Za-z_]\w*)\s*\(/)
  return callable?.[1] ?? 'función'
}

function classLabel(header: string): string {
  const typed = header.match(/\b(class|struct|interface|enum|record|union|namespace|module|trait|impl|object)\s+([A-Za-z_]\w*)/i)
  if (typed) return typed[2]
  const goType = header.match(/\btype\s+([A-Za-z_]\w*)/i)
  if (goType) return goType[1]
  return 'tipo'
}

function extractParentheses(text: string): string | null {
  const range = parenthesesRange(text)
  return range?.content ?? null
}

function parenthesesRange(text: string): { content: string; end: number } | null {
  const start = text.indexOf('(')
  if (start < 0) return null
  let depth = 0
  let quote = ''
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (quote) {
      if (char === '\\') index += 1
      else if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth === 0) return { content: text.slice(start + 1, index).trim(), end: index }
    }
  }
  return null
}

function conditionExpression(header: string): string {
  const isFor = /^(?:for|foreach)\b/i.test(header.trim())
  let text = header.trim()
    .replace(/^(?:else\s+)?if\b/i, '')
    .replace(/^elseif\b/i, '')
    .replace(/^(?:for|while|switch|match|when|select|case)\b/i, '')
    .replace(/\b(?:then|do)\s*$/i, '')
    .replace(/\s*\{\s*$/, '')
    .trim()
  // Un `for` clásico lleva tres partes: solo importa la condición central.
  if (isFor && text.includes(';')) {
    const parts = text.split(';')
    if (parts.length >= 2) text = parts[1].trim()
  }
  // Un rango numérico (`for i = 1, limite`) se lee como un recorrido.
  const range = text.match(/^[A-Za-z_]\w*\s*=\s*[^,]+,\s*(.+)$/)
  if (isFor && range) return `quedan elementos hasta ${pseudoExpression(range[1])}`
  text = extractParentheses(text) ?? text
  text = text.replace(/^\(|\)$/g, '').trim()
  return pseudoExpression(text || 'condición')
}

function isStructuralBrace(header: string): boolean {
  const text = header.trim()
  if (!text) return true
  const startsControl = /^(?:if|else|for|foreach|while|do|switch|match|when|select|try|catch|except|finally|synchronized|using|lock)\b/i.test(text)
  if (!startsControl && (/(?:^|[^=!<>])=(?!=)/.test(text) || /:=/.test(text))) return false
  if (/(?:^|[^\w])(?:return|new|throw)\b/.test(text)) return false
  if (/[=:]\s*$/.test(text)) return false
  if (/^[([{]/.test(text) && !startsControl) return false
  if (/^(?:\[\]|map\[|&?[A-Z]\w*(?:<[^>]*>)?)$/.test(text)) return false
  if (/\b(?:if|else|for|while|do|switch|match|when|select|try|catch|finally|class|struct|enum|interface|record|namespace|impl|trait|mod|module|func|fn|fun|function|type|object|union|template|public|private|protected|internal|static|final|abstract|sealed|partial|export|default|async|synchronized|unsafe|extern|inline|const|constexpr|virtual|override|get|set|init|add|remove)\b/.test(text)) return true
  if (/\)\s*(?:const|noexcept|override|final|throws\s+[\w.,\s]+|->.*)?$/.test(text)) return true
  return false
}

function isGoContinuation(text: string): boolean {
  const value = text.trim()
  if (!value) return false
  if (/[=+\-*/%&|^,.\[]$/.test(value)) return true
  if (/^(?:func|if|for|switch|select|else|type|struct|interface)\b/.test(value)) return true
  if (/^(?:var|const|import)\s*\($/.test(value)) return true
  return false
}

function parseBraceBlocks(source: string, language: Language): SourceBlock {
  const lines = source.split(/\r?\n/)
  const root: SourceBlock = { header: null, items: [], openLine: 1, closeLine: lines.length }
  const stack: SourceBlock[] = [root]
  let buffer = ''
  let bufferLine = 1
  let line = 1
  let index = 0
  let expressionBraceDepth = 0
  let parenDepth = 0
  let bracketDepth = 0
  let state: 'normal' | 'line-comment' | 'block-comment' | 'single' | 'double' | 'template' = 'normal'
  let quote = ''

  const append = (value: string) => {
    if (!buffer.trim() && value.trim()) bufferLine = line
    buffer += value
  }

  const flushItem = () => {
    const text = buffer.replace(/\s+/g, ' ').trim()
    if (text) stack.at(-1)!.items.push({ text, line: bufferLine })
    buffer = ''
  }

  const pushBlock = () => {
    const text = buffer.replace(/\s+/g, ' ').trim()
    const current = stack.at(-1)!
    const block: SourceBlock = {
      header: text ? { text, line: bufferLine } : null,
      items: [],
      openLine: line,
      closeLine: line,
    }
    current.items.push(block)
    stack.push(block)
    buffer = ''
  }

  const popBlock = () => {
    flushItem()
    if (stack.length === 1) {
      throw new Error(`No se generó el diagrama: llave de cierre sin bloque abierto cerca de la línea ${line}.`)
    }
    const block = stack.pop()!
    block.closeLine = line
  }

  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '\n') {
      line += 1
      if (state === 'line-comment') state = 'normal'
      if (language === 'go' && state === 'normal' && parenDepth === 0 && bracketDepth === 0 && expressionBraceDepth === 0 && buffer.trim() && !isGoContinuation(buffer)) {
        flushItem()
      }
      if (state === 'normal') append(' ')
      index += 1
      continue
    }

    if (state === 'line-comment') {
      index += 1
      continue
    }

    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        state = 'normal'
        index += 2
      } else {
        index += 1
      }
      continue
    }

    if (state === 'single' || state === 'double' || state === 'template') {
      if (char === '\\') {
        append(source.slice(index, index + 2))
        index += 2
        continue
      }
      append(char)
      if (char === quote) state = 'normal'
      index += 1
      continue
    }

    if (char === '/' && next === '/') {
      state = 'line-comment'
      append(' ')
      index += 2
      continue
    }
    if (char === '/' && next === '*') {
      state = 'block-comment'
      append(' ')
      index += 2
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      state = char === '"' ? 'double' : char === "'" ? 'single' : 'template'
      quote = char
      append(char)
      index += 1
      continue
    }
    if ((language === 'c' || language === 'cpp') && char === '#' && !buffer.trim()) {
      state = 'line-comment'
      index += 1
      continue
    }
    if (char === '{') {
      if (parenDepth > 0 || bracketDepth > 0 || !isStructuralBrace(buffer)) {
        expressionBraceDepth += 1
        append('{')
      } else {
        pushBlock()
      }
      index += 1
      continue
    }
    if (char === '}') {
      if (expressionBraceDepth > 0) {
        expressionBraceDepth -= 1
        append('}')
      } else {
        popBlock()
      }
      index += 1
      continue
    }
    if (char === '(') {
      parenDepth += 1
      append(char)
      index += 1
      continue
    }
    if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1)
      append(char)
      index += 1
      continue
    }
    if (char === '[') {
      bracketDepth += 1
      append(char)
      index += 1
      continue
    }
    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1)
      append(char)
      index += 1
      continue
    }
    if (char === ';') {
      if (parenDepth === 0 && bracketDepth === 0 && !/^for\b/i.test(buffer.trim())) flushItem()
      else append(char)
      index += 1
      continue
    }

    append(char)
    index += 1
  }

  flushItem()
  const unclosed = stack.at(-1)
  if (stack.length > 1 && unclosed) {
    throw new Error(`No se generó el diagrama: bloque sin cerrar desde la línea ${lineOf(unclosed)}.`)
  }
  return root
}

function stripLuaComments(source: string): string[] {
  const lines = source.split(/\r?\n/)
  const result: string[] = []
  let inLongComment = false
  for (const line of lines) {
    let output = ''
    let quote = ''
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      if (inLongComment) {
        if (char === ']' && line[index + 1] === ']') {
          inLongComment = false
          index += 1
        }
        continue
      }
      if (quote) {
        output += char
        if (char === '\\') {
          output += line[index + 1] ?? ''
          index += 1
        } else if (char === quote) {
          quote = ''
        }
        continue
      }
      if (char === '"' || char === "'") {
        quote = char
        output += char
        continue
      }
      if (char === '-' && line[index + 1] === '-') {
        if (line[index + 2] === '[' && line[index + 3] === '[') {
          inLongComment = true
          index += 3
        }
        break
      }
      output += char
    }
    result.push(output)
  }
  return result
}

function splitLuaStatements(line: string): string[] {
  const statements: string[] = []
  let current = ''
  let quote = ''
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quote) {
      current += char
      if (char === '\\') {
        current += line[index + 1] ?? ''
        index += 1
      } else if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === ';') {
      if (current.trim()) statements.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) statements.push(current.trim())
  return statements
}

function isLuaBlockHeader(statement: string): boolean {
  const text = statement.trim()
  if (/^(?:local\s+)?function\b/i.test(text)) return true
  if (/^repeat\b/i.test(text)) return true
  if (/^do\b/i.test(text)) return true
  if (/^if\b/i.test(text) && /\bthen\b/i.test(text)) return !/\bend\b\s*$/i.test(text)
  if (/^(?:elseif|else)\b/i.test(text)) return true
  if (/^(?:for|while)\b/i.test(text) && /\bdo\b/i.test(text)) return !/\bend\b\s*$/i.test(text)
  return false
}

function parseLuaBlocks(source: string): SourceBlock {
  const lines = stripLuaComments(source)
  const root: SourceBlock = { header: null, items: [], openLine: 1, closeLine: lines.length }
  const stack: SourceBlock[] = [root]

  const addItem = (text: string, line: number) => {
    stack.at(-1)!.items.push({ text, line })
  }

  const addBlock = (header: string, line: number) => {
    const block: SourceBlock = { header: { text: header, line }, items: [], openLine: line, closeLine: line }
    stack.at(-1)!.items.push(block)
    stack.push(block)
  }

  lines.forEach((sourceLine, index) => {
    const lineNumber = index + 1
    for (const statement of splitLuaStatements(sourceLine)) {
      const text = statement.trim()
      if (!text) continue
      if (/^end\b/i.test(text)) {
        if (stack.length === 1) throw new Error(`No se generó el diagrama: end sin bloque abierto cerca de la línea ${lineNumber}.`)
        stack.pop()!.closeLine = lineNumber
        continue
      }
      if (/^until\b/i.test(text)) {
        if (stack.length === 1) throw new Error(`No se generó el diagrama: until sin bloque repeat cerca de la línea ${lineNumber}.`)
        stack.pop()!.closeLine = lineNumber
        addItem(text, lineNumber)
        continue
      }
      if (/^(?:elseif|else)\b/i.test(text)) {
        if (stack.length === 1) throw new Error(`No se generó el diagrama: ${text.split(/\s/)[0]} sin if abierto cerca de la línea ${lineNumber}.`)
        stack.pop()!.closeLine = lineNumber
        addBlock(text, lineNumber)
        continue
      }
      if (isLuaBlockHeader(text)) addBlock(text, lineNumber)
      else addItem(text, lineNumber)
    }
  })

  const unclosed = stack.at(-1)
  if (stack.length > 1 && unclosed) {
    throw new Error(`No se generó el diagrama: bloque sin cerrar desde la línea ${lineOf(unclosed)}.`)
  }
  return root
}

function describeItem(item: SourceItem): { input: FlowNodeInput; abrupt: 'return' | 'break' | 'continue' | 'throw' | null } {
  const text = item.text
  const base = { line: item.line, source: text }
  // Salida por flujo (`cout << valor`), que no es una llamada.
  const stream = text.match(/(?:std::)?(?:cout|cerr)\s*<<\s*(.+?)\s*;?$/)
  if (stream) {
    const instruction = { form: 'print' as const, name: 'cout', value: pseudoExpression(stream[1]) }
    return { input: { ...base, kind: 'io', label: PSEUDO.print(instruction.value), detail: 'Entrada / salida de datos', shape: 'input-output', pseudo: instruction }, abrupt: null }
  }
  const instruction = pseudoStatement(text)
  const label = pseudoLabel(instruction)

  if (instruction.form === 'return') return { input: { ...base, kind: 'return', label, detail: 'Salida de función', pseudo: instruction }, abrupt: 'return' }
  if (instruction.form === 'break') return { input: { ...base, kind: 'phase', label, detail: 'Salir del bucle o selección', phase: 'exit', pseudo: instruction }, abrupt: 'break' }
  if (instruction.form === 'continue') return { input: { ...base, kind: 'phase', label, detail: 'Continuar con la siguiente iteración', phase: 'update', pseudo: instruction }, abrupt: 'continue' }
  if (instruction.form === 'throw') return { input: { ...base, kind: 'event', label, detail: 'Salida por excepción', pseudo: instruction }, abrupt: 'throw' }
  if (instruction.form === 'import') return { input: { ...base, kind: 'import', label, detail: 'Proceso · cargar dependencia', pseudo: instruction }, abrupt: null }
  if (instruction.form === 'print') return { input: { ...base, kind: 'io', label, detail: 'Entrada / salida de datos', shape: 'input-output', pseudo: instruction }, abrupt: null }
  if (instruction.form === 'read') return { input: { ...base, kind: 'io', label, detail: 'Entrada / salida de datos', shape: 'input-output', pseudo: instruction }, abrupt: null }
  if (instruction.form === 'assign') return { input: { ...base, kind: 'variable', label, detail: 'Proceso · asignación', pseudo: instruction }, abrupt: null }
  if (instruction.form === 'call') return { input: { ...base, kind: 'call', label, detail: 'Proceso · llamada', pseudo: instruction }, abrupt: null }
  return { input: { ...base, kind: 'statement', label, detail: 'Proceso · instrucción', pseudo: instruction }, abrupt: null }
}

function buildItem(item: SourceItem, depth: number, builder: FlowGraphBuilder): FlowFragment {
  const { input, abrupt } = describeItem(item)
  const id = builder.addNode(input, depth)
  const fragment = emptyFlowFragment()
  fragment.entryId = id
  if (abrupt === 'return') fragment.returnIds.push(id)
  else if (abrupt === 'break') fragment.breakIds.push(id)
  else if (abrupt === 'continue') fragment.continueIds.push(id)
  else if (abrupt === 'throw') fragment.throwIds.push(id)
  else fragment.exitIds.push(id)
  return fragment
}

function appendAbrupt(target: FlowFragment, source: FlowFragment): void {
  target.breakIds.push(...source.breakIds)
  target.continueIds.push(...source.continueIds)
  target.returnIds.push(...source.returnIds)
  target.throwIds.push(...source.throwIds)
}

function joinBranches(
  builder: FlowGraphBuilder,
  sources: Array<{ id: string; label: string; role: 'merge' | 'true' | 'false' | 'exit' }>,
  line: number,
  depth: number,
): string | null {
  if (!sources.length) return null
  const merge = builder.addConnector(line, depth)
  for (const source of sources) builder.addEdge(source.id, merge, source.label, source.role)
  return merge
}

function buildIf(
  block: SourceBlock,
  elseBlocks: SourceBlock[],
  depth: number,
  context: AnalyzeContext,
  builder: FlowGraphBuilder,
  language: Language,
): FlowFragment {
  const header = headerOf(block)
  const line = lineOf(block)
  const condition = conditionExpression(header)
  const decision = builder.addNode({
    kind: 'condition',
    label: PSEUDO.condition(condition),
    line,
    detail: isElseIfHeader(header) ? 'Decisión · condición encadenada' : 'Decisión · condición',
    source: header,
    pseudo: { form: 'condition', value: condition },
  }, depth)
  const yes = buildSequence(block.items, depth + 1, context, builder, language)
  const no = buildElseChain(elseBlocks, 0, depth + 1, context, builder, language)
  const sources: Array<{ id: string; label: string; role: 'merge' | 'true' | 'false' | 'exit' }> = []

  if (yes.entryId) builder.addEdge(decision, yes.entryId, 'verdadero', 'true')
  else sources.push({ id: decision, label: 'verdadero', role: 'true' })
  if (no.entryId) builder.addEdge(decision, no.entryId, 'falso', 'false')
  else sources.push({ id: decision, label: 'falso', role: 'false' })
  for (const id of yes.exitIds) sources.push({ id, label: 'unir', role: 'merge' })
  for (const id of no.exitIds) sources.push({ id, label: 'unir', role: 'merge' })

  const result = emptyFlowFragment()
  result.entryId = decision
  const merge = joinBranches(builder, sources, line, depth)
  if (merge) result.exitIds.push(merge)
  appendAbrupt(result, yes)
  appendAbrupt(result, no)
  return result
}

function buildElseChain(
  elseBlocks: SourceBlock[],
  index: number,
  depth: number,
  context: AnalyzeContext,
  builder: FlowGraphBuilder,
  language: Language,
): FlowFragment {
  if (index >= elseBlocks.length) return emptyFlowFragment()
  const block = elseBlocks[index]
  const header = headerOf(block)
  if (isIfHeader(header)) return buildIf(block, elseBlocks.slice(index + 1), depth, context, builder, language)
  return buildSequence(block.items, depth, context, builder, language)
}

function buildLoop(
  block: SourceBlock,
  tail: SourceItem | null,
  depth: number,
  context: AnalyzeContext,
  builder: FlowGraphBuilder,
  language: Language,
): FlowFragment {
  const header = headerOf(block)
  const line = lineOf(block)
  const body = buildSequence(block.items, depth + 1, { ...context, loopDepth: context.loopDepth + 1 }, builder, language)
  const exit = builder.addConnector(line, depth, 'Salida del bucle')
  const result = emptyFlowFragment()

  if (isDoLikeHeader(header)) {
    const conditionText = tail?.text ?? (/^repeat\b/i.test(header) ? 'hasta que termine' : 'condición final')
    const entry = builder.addNode({
      kind: 'phase',
      label: 'Ejecutar cuerpo primero',
      line,
      detail: 'Bucle de condición posterior',
      phase: 'initialization',
    }, depth)
    const condition = pseudoExpression(conditionText.replace(/^until\b/i, 'hasta'))
    const conditionNode = builder.addNode({
      kind: 'loop',
      label: PSEUDO.loop(condition),
      line: tail?.line ?? line,
      detail: /^repeat\b/i.test(header) ? 'Decisión · repetir hasta' : 'Decisión · iteración',
      source: tail?.text ?? header,
      pseudo: { form: 'loop', value: condition },
    }, depth)
    const bodyEntry = body.entryId ?? builder.addNode({ kind: 'statement', label: 'Cuerpo vacío', line, detail: 'Sin instrucciones', phase: 'body' }, depth + 1)
    builder.addEdge(entry, bodyEntry, 'cuerpo · primera vuelta', 'body')
    for (const id of body.entryId ? body.exitIds : [bodyEntry]) builder.addEdge(id, conditionNode, 'evaluar condición', 'control')
    for (const id of body.continueIds) builder.addEdge(id, conditionNode, 'continue · evaluar', 'repeat')
    builder.addEdge(conditionNode, bodyEntry, 'verdadero · repetir', 'true')
    builder.addEdge(conditionNode, exit, 'falso · salir', 'false')
    for (const id of body.breakIds) builder.addEdge(id, exit, 'break · salir', 'exit')
    result.entryId = entry
    result.exitIds.push(exit)
    result.returnIds.push(...body.returnIds)
    result.throwIds.push(...body.throwIds)
    return result
  }

  const condition = conditionExpression(header)
  const conditionNode = builder.addNode({
    kind: 'loop',
    label: PSEUDO.loop(condition),
    line,
    detail: 'Decisión · iteración',
    source: header,
    pseudo: { form: 'loop', value: condition },
  }, depth)
  const bodyEntry = body.entryId ?? builder.addNode({ kind: 'statement', label: 'Cuerpo vacío', line, detail: 'Sin instrucciones', phase: 'body' }, depth + 1)
  builder.addEdge(conditionNode, bodyEntry, 'verdadero · cuerpo', 'true')
  for (const id of body.entryId ? body.exitIds : [bodyEntry]) builder.addEdge(id, conditionNode, 'repetir', 'repeat')
  for (const id of body.continueIds) builder.addEdge(id, conditionNode, 'continue', 'repeat')
  builder.addEdge(conditionNode, exit, 'falso · salir', 'false')
  for (const id of body.breakIds) builder.addEdge(id, exit, 'break · salir', 'exit')
  result.entryId = conditionNode
  result.exitIds.push(exit)
  result.returnIds.push(...body.returnIds)
  result.throwIds.push(...body.throwIds)
  return result
}

function buildSwitch(
  block: SourceBlock,
  depth: number,
  context: AnalyzeContext,
  builder: FlowGraphBuilder,
  language: Language,
): FlowFragment {
  const header = headerOf(block)
  const line = lineOf(block)
  const selection = conditionExpression(header)
  const decision = builder.addNode({
    kind: 'condition',
    label: PSEUDO.condition(selection),
    line,
    detail: 'Decisión · selección',
    source: header,
    pseudo: { form: 'condition', value: selection },
  }, depth)
  const merge = builder.addConnector(line, depth, 'Continuación de selección')
  const result = emptyFlowFragment()
  result.entryId = decision

  let currentExits: string[] = []
  let currentRole: 'case' | 'body' = 'case'
  let hasDefault = false

  for (const node of block.items) {
    if (!isBlock(node) && (/^(?:case|default|when)\b/i.test(node.text) || /^[A-Za-z_]\w*\s*=>/.test(node.text))) {
      const isDefault = /^default\b/i.test(node.text)
      hasDefault ||= isDefault
      const label = node.text.includes('=>') ? node.text.split('=>')[0]!.trim() : compactSource(node.text, 30)
      const marker = builder.addNode({
        kind: 'connector',
        label: String.fromCharCode(65 + (result.breakIds.length + builder.nodes.length) % 26),
        line: node.line,
        detail: `caso · ${label}`,
        shape: 'connector',
        source: node.text,
      }, depth + 1)
      builder.addEdge(decision, marker, label, 'case')
      const right = node.text.includes('=>') ? node.text.split('=>').slice(1).join('=>').trim() : ''
      if (right) {
        const process = builder.addNode({ kind: 'statement', label: compactSource(right), line: node.line, detail: 'Proceso · resultado del caso', source: right }, depth + 2)
        builder.addEdge(marker, process, 'caso', 'body')
        currentExits = [process]
      } else {
        currentExits = [marker]
      }
      currentRole = 'body'
      continue
    }

    const fragment = isBlock(node)
      ? buildBlock(node, depth + 1, context, builder, language)
      : buildItem(node, depth + 1, builder)
    if (!fragment.entryId) continue
    for (const id of currentExits) builder.addEdge(id, fragment.entryId, currentRole === 'case' ? 'caso' : 'siguiente', currentRole)
    currentExits = fragment.exitIds
    for (const id of fragment.breakIds) builder.addEdge(id, merge, 'break · salir', 'exit')
    result.continueIds.push(...fragment.continueIds)
    result.returnIds.push(...fragment.returnIds)
    result.throwIds.push(...fragment.throwIds)
  }

  if (!currentExits.length) builder.addEdge(decision, merge, 'sin caso', 'false')
  else for (const id of currentExits) builder.addEdge(id, merge, 'continuar', 'merge')
  if (!hasDefault) builder.addEdge(decision, merge, 'sin coincidencia', 'false')
  result.exitIds.push(merge)
  return result
}

function buildFunction(
  block: SourceBlock,
  depth: number,
  context: AnalyzeContext,
  builder: FlowGraphBuilder,
  language: Language,
): FlowFragment {
  const header = headerOf(block)
  const line = lineOf(block)
  const name = functionName(header)
  const definition = builder.addNode({ kind: 'function', label: PSEUDO.define(name), line, detail: 'El cuerpo se muestra como subflujo', source: header, pseudo: { form: 'define', name } }, depth)
  const entry = builder.addNode({ kind: 'start', label: `Inicio · ${name}()`, line, detail: 'Entrada de función', shape: 'terminator' }, depth + 1)
  const exit = builder.addNode({ kind: 'end', label: `Fin · ${name}()`, line, detail: 'Salida de función', shape: 'terminator' }, depth + 1)
  builder.addEdge(definition, entry, 'cuerpo de función', 'data')
  const body = buildSequence(block.items, depth + 2, { ...context, functionDepth: context.functionDepth + 1 }, builder, language)
  if (body.entryId) builder.addEdge(entry, body.entryId, 'ejecutar cuerpo', 'body')
  else builder.addEdge(entry, exit, 'vacía', 'control')
  for (const id of body.exitIds) builder.addEdge(id, exit, 'fin normal', 'exit')
  for (const id of body.returnIds) builder.addEdge(id, exit, 'return', 'exit')
  for (const id of body.throwIds) builder.addEdge(id, exit, 'excepción', 'exception')
  return { ...emptyFlowFragment(), entryId: definition, exitIds: [definition] }
}

function buildClass(
  block: SourceBlock,
  depth: number,
  context: AnalyzeContext,
  builder: FlowGraphBuilder,
  language: Language,
): FlowFragment {
  const header = headerOf(block)
  const line = lineOf(block)
  const name = classLabel(header)
  const definition = builder.addNode({ kind: 'class', label: PSEUDO.class(name), line, detail: 'Proceso · definir tipo', source: header, pseudo: { form: 'class', name } }, depth)
  for (const node of block.items) {
    if (isBlock(node) && isFunctionHeader(headerOf(node))) {
      const method = buildFunction(node, depth + 1, context, builder, language)
      builder.addEdge(definition, method.entryId, 'método', 'data')
      continue
    }
    if (isBlock(node) && isClassHeader(headerOf(node))) {
      const nested = buildClass(node, depth + 1, context, builder, language)
      builder.addEdge(definition, nested.entryId, 'tipo anidado', 'data')
      continue
    }
    const fragment = isBlock(node)
      ? buildBlock(node, depth + 1, context, builder, language)
      : buildItem(node, depth + 1, builder)
    if (fragment.entryId) builder.addEdge(definition, fragment.entryId, 'miembro', 'data')
  }
  return { ...emptyFlowFragment(), entryId: definition, exitIds: [definition] }
}

function buildTry(
  block: SourceBlock,
  handlers: SourceBlock[],
  depth: number,
  context: AnalyzeContext,
  builder: FlowGraphBuilder,
  language: Language,
): FlowFragment {
  const line = lineOf(block)
  const tryNode = builder.addNode({ kind: 'event', label: 'proteger', line, detail: 'Posible ruta de error', source: headerOf(block), pseudo: { form: 'statement', value: 'proteger' } }, depth)
  const body = buildSequence(block.items, depth + 1, context, builder, language)
  if (body.entryId) builder.addEdge(tryNode, body.entryId, 'ejecutar', 'body')
  const sources: Array<{ id: string; label: string; role: 'merge' | 'true' | 'false' | 'exit' }> = []
  body.exitIds.forEach((id) => sources.push({ id, label: 'continuar', role: 'merge' }))
  const result = emptyFlowFragment()
  result.entryId = tryNode
  for (const handler of handlers) {
    const fragment = buildSequence(handler.items, depth + 1, context, builder, language)
    if (!fragment.entryId) continue
    builder.addEdge(tryNode, fragment.entryId, `si ocurre una excepción (${compactSource(headerOf(handler), 24)})`, 'exception')
    for (const id of body.throwIds) builder.addEdge(id, fragment.entryId, 'capturar', 'exception')
    fragment.exitIds.forEach((id) => sources.push({ id, label: 'continuar', role: 'merge' }))
    appendAbrupt(result, fragment)
  }
  const merge = joinBranches(builder, sources, line, depth)
  if (merge) result.exitIds.push(merge)
  if (!handlers.length) appendAbrupt(result, body)
  result.breakIds.push(...body.breakIds)
  result.continueIds.push(...body.continueIds)
  result.returnIds.push(...body.returnIds)
  return result
}

function buildBlock(
  block: SourceBlock,
  depth: number,
  context: AnalyzeContext,
  builder: FlowGraphBuilder,
  language: Language,
): FlowFragment {
  const header = headerOf(block)
  if (isIfHeader(header)) return buildIf(block, [], depth, context, builder, language)
  if (isLoopHeader(header)) return buildLoop(block, null, depth, context, builder, language)
  if (isSwitchHeader(header)) return buildSwitch(block, depth, context, builder, language)
  if (isFunctionHeader(header)) return buildFunction(block, depth, context, builder, language)
  if (isClassHeader(header)) return buildClass(block, depth, context, builder, language)
  if (isTryHeader(header)) return buildTry(block, [], depth, context, builder, language)
  return buildSequence(block.items, depth, context, builder, language)
}

function buildInlineControl(
  item: SourceItem,
  depth: number,
  context: AnalyzeContext,
  builder: FlowGraphBuilder,
  language: Language,
): FlowFragment | null {
  const text = item.text.trim()
  const isIf = /^(?:else\s+)?if\b/i.test(text)
  const isLoop = /^(?:for|while)\b/i.test(text)
  if (!isIf && !isLoop) return null

  const range = parenthesesRange(text)
  const bodyText = range ? text.slice(range.end + 1).trim() : ''
  if (!range || !bodyText) return null

  const body = buildItem({ text: bodyText, line: item.line }, depth + 1, builder)
  if (!body.entryId) return null

  if (isIf) {
    const condition = pseudoExpression(range.content)
    const decision = builder.addNode({
      kind: 'condition',
      label: PSEUDO.condition(condition),
      line: item.line,
      detail: 'Decisión · condición',
      source: text,
      pseudo: { form: 'condition', value: condition },
    }, depth)
    const merge = builder.addConnector(item.line, depth)
    builder.addEdge(decision, body.entryId, 'verdadero', 'true')
    builder.addEdge(decision, merge, 'falso', 'false')
    for (const id of body.exitIds) builder.addEdge(id, merge, 'unir', 'merge')
    const result = emptyFlowFragment()
    result.entryId = decision
    result.exitIds.push(merge)
    appendAbrupt(result, body)
    return result
  }

  const condition = pseudoExpression(range.content)
  const conditionNode = builder.addNode({
    kind: 'loop',
    label: PSEUDO.loop(condition),
    line: item.line,
    detail: 'Decisión · iteración',
    source: text,
    pseudo: { form: 'loop', value: condition },
  }, depth)
  const exit = builder.addConnector(item.line, depth, 'Salida del bucle')
  builder.addEdge(conditionNode, body.entryId, 'verdadero · cuerpo', 'true')
  for (const id of body.exitIds) builder.addEdge(id, conditionNode, 'repetir', 'repeat')
  for (const id of body.continueIds) builder.addEdge(id, conditionNode, 'continue', 'repeat')
  for (const id of body.breakIds) builder.addEdge(id, exit, 'break · salir', 'exit')
  builder.addEdge(conditionNode, exit, 'falso · salir', 'false')
  const result = emptyFlowFragment()
  result.entryId = conditionNode
  result.exitIds.push(exit)
  result.returnIds.push(...body.returnIds)
  result.throwIds.push(...body.throwIds)
  return result
}

function buildSequence(
  nodes: SourceNode[],
  depth: number,
  context: AnalyzeContext,
  builder: FlowGraphBuilder,
  language: Language,
): FlowFragment {
  const result = emptyFlowFragment()
  let previousExits: string[] = []
  let previousSource: string | null = null
  let reachable = true

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    let current: FlowFragment

    if (!isBlock(node)) {
      current = buildInlineControl(node, depth, context, builder, language) ?? buildItem(node, depth, builder)
    } else {
      const header = headerOf(node)
      if (isIfHeader(header)) {
        const elseBlocks: SourceBlock[] = []
        while (index + 1 < nodes.length) {
          const candidate = nodes[index + 1]
          if (isBlock(candidate) && isElseHeader(headerOf(candidate))) {
            elseBlocks.push(candidate)
            index += 1
          } else break
        }
        current = buildIf(node, elseBlocks, depth, context, builder, language)
      } else if (isTryHeader(header)) {
        const handlers: SourceBlock[] = []
        while (index + 1 < nodes.length) {
          const candidate = nodes[index + 1]
          if (isBlock(candidate) && isHandlerHeader(headerOf(candidate))) {
            handlers.push(candidate)
            index += 1
          } else break
        }
        current = buildTry(node, handlers, depth, context, builder, language)
      } else if (isDoLikeHeader(header)) {
        const next = nodes[index + 1]
        let tail: SourceItem | null = null
        if (next && !isBlock(next) && /^(?:while|until)\b/i.test(next.text)) {
          tail = next
          index += 1
        }
        current = buildLoop(node, tail, depth, context, builder, language)
      } else if (isLoopHeader(header)) {
        current = buildLoop(node, null, depth, context, builder, language)
      } else if (isSwitchHeader(header)) {
        current = buildSwitch(node, depth, context, builder, language)
      } else if (isFunctionHeader(header)) {
        current = buildFunction(node, depth, context, builder, language)
      } else if (isClassHeader(header)) {
        current = buildClass(node, depth, context, builder, language)
      } else {
        current = buildSequence(node.items, depth, context, builder, language)
      }
    }

    if (!current.entryId) continue
    if (!result.entryId) result.entryId = current.entryId
    if (reachable) previousExits.forEach((id) => builder.addEdge(id, current.entryId, 'siguiente', 'control'))
    else if (previousSource) builder.addEdge(previousSource, current.entryId, 'inaccesible', 'unreachable')

    if (reachable) {
      appendAbrupt(result, current)
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

export function analyzeGenericLanguage(source: string, language: Language): DiagramGraph {
  const root = language === 'lua' ? parseLuaBlocks(source) : parseBraceBlocks(source, language)
  const builder = new FlowGraphBuilder()
  const lineCount = Math.max(1, source.split(/\r?\n/).length)
  const start = builder.addNode({ kind: 'start', label: 'Inicio', line: 1, detail: 'Entrada del programa', shape: 'terminator' }, 0)
  const end = builder.addNode({ kind: 'end', label: 'Fin', line: lineCount, detail: 'Salida del programa', shape: 'terminator' }, 0)
  const main = buildSequence(root.items, 1, { loopDepth: 0, functionDepth: 0 }, builder, language)

  if (main.entryId) builder.addEdge(start, main.entryId, 'iniciar', 'control')
  else builder.addEdge(start, end, 'sin instrucciones', 'control')
  for (const id of main.exitIds) builder.addEdge(id, end, 'fin', 'exit')
  for (const id of main.returnIds) builder.addEdge(id, end, 'return', 'exit')
  for (const id of main.throwIds) builder.addEdge(id, end, 'excepción no capturada', 'exception')
  return builder.toGraph()
}
