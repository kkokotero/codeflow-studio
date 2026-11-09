const MAX_SOURCE_LENGTH = 50000
const MAX_STEPS = 2000
const STACK_LIMIT = 64
let pyodide
let stack = []
let stepCount = 0
let active = false

const post = (message) => self.postMessage(message)
const blocked = () => { throw new Error('Las solicitudes de red y la carga de scripts están deshabilitadas en este runtime.') }

function emitStep(line, snapshotJson) {
  if (!active || stepCount >= MAX_STEPS) return
  let locals = {}
  try { locals = JSON.parse(snapshotJson) } catch { locals = { notice: 'Snapshot no disponible.' } }
  post({ type: 'step', line, locals, stack: [...stack], value: String(++stepCount) })
}

function emitOutput(value) {
  if (active) post({ type: 'console', value: String(value) })
}

function emitReturn(line, localsJson, valueJson) {
  if (!active || stepCount >= MAX_STEPS) return
  try {
    post({ type: 'step', line, locals: JSON.parse(localsJson), stack: [...stack], returnValue: JSON.parse(valueJson), value: String(++stepCount) })
  } catch {
    post({ type: 'step', line, locals: {}, stack: [...stack], returnValue: '[No serializable]', value: String(++stepCount) })
  }
}

function emitOperation(operationId, line, localsJson, valueJson) {
  if (!active || stepCount >= MAX_STEPS) return
  try {
    post({ type: 'operation', operationId, line, locals: JSON.parse(localsJson), operationValue: JSON.parse(valueJson), stack: [...stack], value: String(++stepCount) })
  } catch {
    post({ type: 'operation', operationId, line, locals: {}, operationValue: '[No serializable]', stack: [...stack], value: String(++stepCount) })
  }
}

function enterFunction(name) {
  if (stack.length < STACK_LIMIT) stack.push(String(name))
}

function exitFunction() {
  stack.pop()
}

const instrumentation = `
import ast as cf_ast
import builtins as __cf_builtins
import json as __cf_json

cf_safe_modules = {
    "math", "json", "statistics", "random", "collections", "itertools",
    "functools", "operator", "string", "re", "datetime", "decimal",
    "fractions", "heapq", "bisect"
}
__cf_real_import = __cf_builtins.__import__
def __cf_safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    if name.split(".")[0] not in cf_safe_modules:
        raise ImportError("El módulo '" + name + "' no está habilitado en el runtime aislado.")
    return __cf_real_import(name, globals, locals, fromlist, level)

__cf_builtins_map = dict(vars(__cf_builtins))
__cf_builtins_map["__import__"] = __cf_safe_import
for __cf_blocked_name in ("eval", "exec", "compile", "open", "input", "breakpoint"):
    __cf_builtins_map.pop(__cf_blocked_name, None)

def __cf_clean(value, depth=0, seen=None):
    if seen is None:
        seen = set()
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if __cf_math.isfinite(value) else str(value)
    if depth >= 3:
        return "[objeto]"
    identity = id(value)
    if identity in seen:
        return "[circular]"
    if isinstance(value, (list, tuple, set)):
        seen.add(identity)
        return [__cf_clean(item, depth + 1, seen) for item in list(value)[:50]]
    if isinstance(value, dict):
        seen.add(identity)
        return {str(key): __cf_clean(item, depth + 1, seen) for key, item in list(value.items())[:50]}
    return repr(value)[:180]

def __cf_trace(line, values):
    clean = {key: __cf_clean(value) for key, value in values.items() if key != "print" and not key.startswith("__cf_") and not key.startswith("__" )}
    __cf_emit_step__(line, __cf_json.dumps(clean, ensure_ascii=True))

def __cf_capture_return(line, value, values):
    clean = {key: __cf_clean(item) for key, item in values.items() if key != "print" and not key.startswith("__cf_") and not key.startswith("__" )}
    __cf_emit_return__(line, __cf_json.dumps(clean, ensure_ascii=True), __cf_json.dumps(__cf_clean(value), ensure_ascii=True))
    return value

def __cf_record_operation(operation_id, line, value, values):
    clean = {key: __cf_clean(item) for key, item in values.items() if key != "print" and not key.startswith("__cf_") and not key.startswith("__" )}
    __cf_emit_operation__(operation_id, line, __cf_json.dumps(clean, ensure_ascii=True), __cf_json.dumps(__cf_clean(value), ensure_ascii=True))
    return value

def __cf_print(*values, sep=" ", end="\\n", **kwargs):
    __cf_emit_output__(sep.join(str(value) for value in values) + end)

def __cf_name(node):
    if isinstance(node, (cf_ast.FunctionDef, cf_ast.AsyncFunctionDef)):
        return node.name
    return None

class CodeFlowInstrumenter(cf_ast.NodeTransformer):
    def __cf_body(self, body):
        output = []
        for statement in body:
            transformed = self.visit(statement)
            if transformed is None:
                continue
            if isinstance(transformed, list):
                output.extend(transformed)
                continue
            if isinstance(statement, (cf_ast.FunctionDef, cf_ast.AsyncFunctionDef, cf_ast.ClassDef)):
                output.append(transformed)
                continue
            line = getattr(statement, "lineno", 1)
            trace = cf_ast.Expr(value=cf_ast.Call(func=cf_ast.Name(id="__cf_trace", ctx=cf_ast.Load()), args=[cf_ast.Constant(value=line), cf_ast.Call(func=cf_ast.Name(id="locals", ctx=cf_ast.Load()), args=[], keywords=[])], keywords=[]))
            if isinstance(transformed, cf_ast.Return) and transformed.value is not None:
                transformed.value = cf_ast.Call(func=cf_ast.Name(id="__cf_capture_return", ctx=cf_ast.Load()), args=[cf_ast.Constant(value=line), transformed.value, cf_ast.Call(func=cf_ast.Name(id="locals", ctx=cf_ast.Load()), args=[], keywords=[])], keywords=[])
            if isinstance(statement, (cf_ast.Return, cf_ast.Raise, cf_ast.Break, cf_ast.Continue)):
                output.extend([trace, transformed])
            else:
                output.extend([transformed, trace])
        return output

    def __cf_record_expression(self, node):
        if not hasattr(node, "lineno") or not hasattr(node, "col_offset"):
            return node
        operation_id = "py-{}-{}-{}".format(node.lineno, node.col_offset, type(node).__name__)
        locals_call = cf_ast.Call(func=cf_ast.Name(id="locals", ctx=cf_ast.Load()), args=[], keywords=[])
        call = cf_ast.Call(
            func=cf_ast.Name(id="__cf_record_operation", ctx=cf_ast.Load()),
            args=[cf_ast.Constant(value=operation_id), cf_ast.Constant(value=node.lineno), node, locals_call],
            keywords=[],
        )
        return cf_ast.copy_location(call, node)

    def visit_Name(self, node):
        if isinstance(node.ctx, cf_ast.Load):
            return self.__cf_record_expression(node)
        return node

    def visit_Constant(self, node):
        return self.__cf_record_expression(node)

    def visit_BinOp(self, node):
        return self.__cf_record_expression(self.generic_visit(node))

    def visit_BoolOp(self, node):
        return self.__cf_record_expression(self.generic_visit(node))

    def visit_Compare(self, node):
        return self.__cf_record_expression(self.generic_visit(node))

    def visit_UnaryOp(self, node):
        return self.__cf_record_expression(self.generic_visit(node))

    def visit_NamedExpr(self, node):
        return self.__cf_record_expression(self.generic_visit(node))

    def visit_IfExp(self, node):
        return self.__cf_record_expression(self.generic_visit(node))

    def visit_Attribute(self, node):
        node = self.generic_visit(node)
        return self.__cf_record_expression(node) if isinstance(node.ctx, cf_ast.Load) else node

    def visit_Subscript(self, node):
        node = self.generic_visit(node)
        return self.__cf_record_expression(node) if isinstance(node.ctx, cf_ast.Load) else node

    def visit_List(self, node):
        node = self.generic_visit(node)
        return self.__cf_record_expression(node) if isinstance(node.ctx, cf_ast.Load) else node

    def visit_Tuple(self, node):
        node = self.generic_visit(node)
        return self.__cf_record_expression(node) if isinstance(node.ctx, cf_ast.Load) else node

    def visit_Set(self, node):
        return self.__cf_record_expression(self.generic_visit(node))

    def visit_Dict(self, node):
        return self.__cf_record_expression(self.generic_visit(node))

    def visit_JoinedStr(self, node):
        return self.__cf_record_expression(self.generic_visit(node))

    def visit_Module(self, node):
        node.body = self.__cf_body(node.body)
        return node

    def visit_FunctionDef(self, node):
        node.decorator_list = [self.visit(item) for item in node.decorator_list]
        node.args = self.visit(node.args)
        node.body = self.__cf_body(node.body)
        enter = cf_ast.Expr(value=cf_ast.Call(func=cf_ast.Name(id="__cf_enter", ctx=cf_ast.Load()), args=[cf_ast.Constant(value=node.name)], keywords=[]))
        leave = cf_ast.Expr(value=cf_ast.Call(func=cf_ast.Name(id="__cf_exit", ctx=cf_ast.Load()), args=[], keywords=[]))
        wrapped = cf_ast.Try(body=[enter, *node.body], handlers=[], orelse=[], finalbody=[leave])
        node.body = [wrapped]
        return node

    def visit_AsyncFunctionDef(self, node):
        raise RuntimeError("Las funciones async todavía no están habilitadas en este runtime.")

    def visit_Await(self, node):
        raise RuntimeError("await todavía no está habilitado en este runtime.")

    def visit_AsyncFor(self, node):
        raise RuntimeError("async for todavía no está habilitado en este runtime.")

    def visit_AsyncWith(self, node):
        raise RuntimeError("async with todavía no está habilitado en este runtime.")

    def visit_ClassDef(self, node):
        node.decorator_list = [self.visit(item) for item in node.decorator_list]
        node.bases = [self.visit(item) for item in node.bases]
        node.keywords = [self.visit(item) for item in node.keywords]
        node.body = self.__cf_body(node.body)
        return node

    def visit_If(self, node):
        node.test = self.visit(node.test)
        node.body = self.__cf_body(node.body)
        node.orelse = self.__cf_body(node.orelse)
        return node

    def visit_For(self, node):
        node.target = self.visit(node.target)
        node.iter = self.visit(node.iter)
        node.body = self.__cf_body(node.body)
        node.orelse = self.__cf_body(node.orelse)
        return node

    def visit_While(self, node):
        node.test = self.visit(node.test)
        node.body = self.__cf_body(node.body)
        node.orelse = self.__cf_body(node.orelse)
        return node

    def visit_Try(self, node):
        node.body = self.__cf_body(node.body)
        for handler in node.handlers:
            handler.body = self.__cf_body(handler.body)
        node.orelse = self.__cf_body(node.orelse)
        node.finalbody = self.__cf_body(node.finalbody)
        return node

    def visit_With(self, node):
        node.items = [self.visit(item) for item in node.items]
        node.body = self.__cf_body(node.body)
        return node

    def visit_Match(self, node):
        node.subject = self.visit(node.subject)
        for case in node.cases:
            case.guard = self.visit(case.guard) if case.guard else None
            case.body = self.__cf_body(case.body)
        return node

    def visit_Import(self, node):
        for alias in node.names:
            if alias.name.split(".")[0] not in cf_safe_modules:
                raise ImportError("El módulo '" + alias.name + "' no está habilitado en el runtime aislado.")
        return node

    def visit_ImportFrom(self, node):
        if node.module and node.module.split(".")[0] not in cf_safe_modules:
            raise ImportError("El módulo '" + node.module + "' no está habilitado en el runtime aislado.")
        return node

    def visit_Call(self, node):
        if isinstance(node.func, cf_ast.Name) and node.func.id in {"eval", "exec", "compile", "__import__"}:
            raise RuntimeError("La ejecución dinámica de código está deshabilitada en el runtime aislado.")
        return self.__cf_record_expression(self.generic_visit(node))
`

async function initializeRuntime() {
  if (pyodide) return pyodide
  self.importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js')
  pyodide = await self.loadPyodide()
  pyodide.globals.set('__cf_emit_step__', emitStep)
  pyodide.globals.set('__cf_emit_output__', emitOutput)
  pyodide.globals.set('__cf_emit_return__', emitReturn)
  pyodide.globals.set('__cf_emit_operation__', emitOperation)
  pyodide.globals.set('__cf_enter__', enterFunction)
  pyodide.globals.set('__cf_exit__', exitFunction)
  await pyodide.runPythonAsync('import math as __cf_math')
  await pyodide.runPythonAsync(instrumentation)
  self.fetch = blocked
  self.importScripts = blocked
  return pyodide
}

self.onmessage = async (event) => {
  const { code } = event.data || {}
  try {
    if (typeof code !== 'string' || !code.trim()) throw new Error('Escribe código Python antes de ejecutarlo.')
    if (code.includes('__cf_')) throw new Error('El prefijo __cf_ está reservado para la instrumentación del runtime.')
    if (code.length > MAX_SOURCE_LENGTH) throw new Error(`El código supera el límite de ${MAX_SOURCE_LENGTH.toLocaleString()} caracteres.`)
    stack = []
    stepCount = 0
    active = true
    const runtime = await initializeRuntime()
    runtime.globals.set('__source_text', code)
    post({ type: 'ready' })
    const runner = `
__cf_tree = cf_ast.parse(__source_text, filename="<CodeFlow>", mode="exec")
__cf_tree = CodeFlowInstrumenter().visit(__cf_tree)
cf_ast.fix_missing_locations(__cf_tree)
__cf_namespace = {"__name__": "__main__", "__builtins__": __cf_builtins_map, "__cf_trace": __cf_trace, "__cf_capture_return": __cf_capture_return, "__cf_enter": __cf_enter__, "__cf_exit": __cf_exit__, "__cf_emit_step__": __cf_emit_step__, "__cf_emit_output__": __cf_emit_output__, "__cf_emit_operation__": __cf_emit_operation__, "__cf_record_operation": __cf_record_operation, "__cf_math": __cf_math, "__cf_json": __cf_json}
__cf_namespace["print"] = __cf_print
exec(compile(__cf_tree, "<CodeFlow>", "exec"), __cf_namespace)
`
    await runtime.runPythonAsync(runner)
    active = false
    post({ type: 'done' })
  } catch (error) {
    active = false
    post({ type: 'error', error: error && error.message ? String(error.message) : String(error) })
    post({ type: 'done' })
  }
}
