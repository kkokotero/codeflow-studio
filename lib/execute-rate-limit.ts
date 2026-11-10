import 'server-only'

import { createHash } from 'node:crypto'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { MAX_EXECUTIONS_PER_MINUTE } from '@/lib/runtime-safety'

let rateLimiter: Ratelimit | undefined

function getRateLimiter() {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN

  if (!url || !token) throw new Error('Execution rate limiter is not configured.')

  rateLimiter ??= new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(MAX_EXECUTIONS_PER_MINUTE, '1 m'),
    prefix: 'codeflow:execution:v1',
    analytics: false,
  })

  return rateLimiter
}

function getClientIp(request: Request): string | null {
  const platformIp = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
  if (platformIp) return platformIp
  if (process.env.NODE_ENV !== 'production') return '127.0.0.1'
  return null
}

export async function checkExecutionRateLimit(request: Request) {
  const ip = getClientIp(request)
  if (!ip) throw new Error('Client IP is unavailable.')

  const identifier = createHash('sha256').update(ip).digest('hex')
  return getRateLimiter().limit(identifier)
}
