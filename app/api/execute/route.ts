import { checkExecutionRateLimit } from '@/lib/execute-rate-limit'
import { executeInSandbox } from '@/lib/secure-code-execution'
import { isLanguage, type Language } from '@/lib/languages'
import { MAX_EXECUTION_SOURCE_BYTES, MAX_EXECUTIONS_PER_MINUTE } from '@/lib/runtime-safety'

export const runtime = 'nodejs'
export const maxDuration = 90

const MAX_REQUEST_BYTES = MAX_EXECUTION_SOURCE_BYTES + 1_024
const responseHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders, ...headers },
  })
}

function hasSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ?? request.headers.get('host')
  if (!origin || !host) return process.env.NODE_ENV !== 'production'

  try {
    const parsedOrigin = new URL(origin)
    return (parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:')
      && parsedOrigin.host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

async function readLimitedBody(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Request body is required.')

  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel()
        throw new RangeError('Request body exceeds the allowed size.')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function parseExecutionRequest(value: unknown): { language: Language; code: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if (!isLanguage(body.language) || typeof body.code !== 'string') return null
  if (Buffer.byteLength(body.code, 'utf8') > MAX_EXECUTION_SOURCE_BYTES) return null
  return { language: body.language, code: body.code }
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return jsonResponse({ error: 'Solicitud de origen no válido.' }, 403)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return jsonResponse({ error: 'Se requiere una solicitud JSON.' }, 415)
  }

  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse({ error: 'El código supera el límite de tamaño.' }, 413)
  }

  try {
    const rate = await checkExecutionRateLimit(request)
    if (!rate.success) {
      const retryAfterSeconds = Math.max(1, Math.ceil((rate.reset - Date.now()) / 1_000))
      return jsonResponse(
        { error: `Se alcanzó el límite de ${MAX_EXECUTIONS_PER_MINUTE.toLocaleString('es')} ejecuciones por minuto. Inténtalo de nuevo en un momento.` },
        429,
        { 'Retry-After': String(retryAfterSeconds) },
      )
    }
  } catch {
    return jsonResponse({ error: 'No se pudo aplicar el límite de solicitudes. Inténtalo más tarde.' }, 503)
  }

  let executionRequest: { language: Language; code: string } | null = null
  try {
    const body = await readLimitedBody(request)
    executionRequest = parseExecutionRequest(JSON.parse(body))
  } catch (error) {
    const status = error instanceof RangeError ? 413 : 400
    return jsonResponse({ error: status === 413 ? 'El código supera el límite de tamaño.' : 'El cuerpo de la solicitud no es JSON válido.' }, status)
  }

  if (!executionRequest) {
    return jsonResponse({ error: 'Indica un lenguaje compatible y código de hasta 50 KB.' }, 400)
  }

  try {
    const result = await executeInSandbox(executionRequest.language, executionRequest.code, request.signal)
    return jsonResponse(result)
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499, headers: responseHeaders })
    return jsonResponse({ error: 'No se pudo iniciar el entorno aislado. Inténtalo de nuevo.' }, 503)
  }
}
