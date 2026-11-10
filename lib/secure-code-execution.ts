import 'server-only'

import { Sandbox } from '@vercel/sandbox'
import { StringDecoder } from 'node:string_decoder'
import { Writable } from 'node:stream'
import type { ExecutionOutput, Language, SandboxExecutionResult } from '@/lib/codeflow-types'
import { getRuntimePlan, type RuntimeCommand } from '@/lib/languages'
import {
  MAX_COMPILE_TIME_MS,
  MAX_EXECUTION_OUTPUT_BYTES,
  MAX_EXECUTION_TIME_MS,
  MAX_TOOLCHAIN_INSTALL_TIME_MS,
} from '@/lib/runtime-safety'

const SANDBOX_DIRECTORY = '/tmp/codeflow'
const SANDBOX_TIMEOUT_MS = 5 * 60_000
const IDLE_STOP_MS = 4 * 60_000

// The sandbox only reaches package mirrors while provisioning a toolchain.
// The policy is switched back to deny-all before user code runs.
const TOOLCHAIN_NETWORK_POLICY = {
  allow: [
    'archive.ubuntu.com',
    'security.ubuntu.com',
    'ports.ubuntu.com',
    '*.ubuntu.com',
    'deb.debian.org',
    '*.debian.org',
  ],
}

type SandboxInstance = Awaited<ReturnType<typeof Sandbox.create>>

interface PooledSandbox {
  sandbox: SandboxInstance
  queue: Promise<void>
  idleTimer?: ReturnType<typeof setTimeout>
  toolchainsReady: Set<string>
  dirReady: boolean
  disposed: boolean
}

const poolKey = '__codeflowSandboxPool__' as const
const queueKey = '__codeflowSandboxQueues__' as const
const globalPool = globalThis as typeof globalThis & {
  [poolKey]?: Partial<Record<Language, PooledSandbox>>
  [queueKey]?: Partial<Record<Language, Promise<void>>>
}

function getPool() {
  if (!globalPool[poolKey]) globalPool[poolKey] = {}
  return globalPool[poolKey]!
}

function getQueues() {
  if (!globalPool[queueKey]) globalPool[queueKey] = {}
  return globalPool[queueKey]!
}

class OutputCapture {
  readonly output: ExecutionOutput[] = []
  truncated = false
  private byteCount = 0
  private stopProcess: (() => void) | undefined

  setStopProcess(stopProcess: () => void) {
    this.stopProcess = stopProcess
  }

  append(stream: ExecutionOutput['stream'], text: string) {
    if (!text) return
    const previous = this.output.at(-1)
    if (previous?.stream === stream) previous.text += text
    else this.output.push({ stream, text })
  }

  createStream(stream: ExecutionOutput['stream']) {
    const decoder = new StringDecoder('utf8')
    return new Writable({
      write: (chunk, _encoding, callback) => {
        try {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          const remaining = Math.max(0, MAX_EXECUTION_OUTPUT_BYTES - this.byteCount)
          const accepted = bytes.subarray(0, remaining)
          this.byteCount += accepted.byteLength
          this.append(stream, decoder.write(accepted))

          if (accepted.byteLength < bytes.byteLength) {
            this.truncated = true
            this.stopProcess?.()
          }

          callback()
        } catch (error) {
          callback(error instanceof Error ? error : new Error('Unable to capture sandbox output.'))
        }
      },
      final: (callback) => {
        this.append(stream, decoder.end())
        callback()
      },
    })
  }
}

function runtimeEnv(language: Language): Record<string, string> {
  const base: Record<string, string> = {
    HOME: '/tmp',
    TMPDIR: '/tmp',
  }
  if (language === 'go') {
    base.GOCACHE = '/tmp/go-cache'
    base.GOPATH = '/tmp/go'
    base.GOMODCACHE = '/tmp/go/pkg/mod'
  }
  if (language === 'rust') {
    base.CARGO_HOME = '/tmp/cargo'
    base.RUSTUP_HOME = '/tmp/rustup'
  }
  return base
}

async function readCommandText(result: { stdout?: () => Promise<string>; stderr?: () => Promise<string> }) {
  const [stdout, stderr] = await Promise.all([
    typeof result.stdout === 'function' ? result.stdout().catch(() => '') : Promise.resolve(''),
    typeof result.stderr === 'function' ? result.stderr().catch(() => '') : Promise.resolve(''),
  ])
  return { stdout, stderr }
}

function isAbortError(error: unknown, signal: AbortSignal) {
  return signal.aborted || (error instanceof Error && (error.name === 'AbortError' || /aborted|abort/i.test(error.message)))
}

function isSandboxUnavailable(error: unknown) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return message.includes('stopped') || message.includes('not found') || message.includes('no such file or directory') || message.includes('sandbox')
}

async function stopSandbox(sandbox: SandboxInstance) {
  await (sandbox as SandboxInstance & { stop?: (opts?: unknown) => Promise<unknown> }).stop?.().catch(() => undefined)
}

async function disposePooled(language: Language, entry?: PooledSandbox) {
  const pool = getPool()
  const current = entry ?? pool[language]
  if (!current) return
  if (pool[language] === current) delete pool[language]
  if (current.disposed) return
  current.disposed = true
  if (current.idleTimer) clearTimeout(current.idleTimer)
  await stopSandbox(current.sandbox)
}

function scheduleIdleStop(language: Language, entry: PooledSandbox) {
  if (entry.idleTimer) clearTimeout(entry.idleTimer)
  entry.idleTimer = setTimeout(() => {
    void disposePooled(language, entry)
  }, IDLE_STOP_MS)
  const timer = entry.idleTimer as ReturnType<typeof setTimeout> & { unref?: () => void }
  timer.unref?.()
}

async function ensureDirectory(sandbox: SandboxInstance, signal: AbortSignal) {
  const result = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc', `mkdir -p ${SANDBOX_DIRECTORY}`],
    timeoutMs: 10_000,
    signal,
  })
  if (result.exitCode !== 0) throw new Error('No se pudo preparar el directorio de ejecución.')
}

async function ensureToolchain(
  sandbox: SandboxInstance,
  language: Language,
  plan: ReturnType<typeof getRuntimePlan>,
  signal: AbortSignal,
  output: OutputCapture,
  entry: PooledSandbox,
) {
  if (!plan.installPackages.length) return
  const key = plan.installPackages.join(',')
  if (entry.toolchainsReady.has(key)) return

  const check = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc', `command -v ${plan.check}`],
    timeoutMs: 10_000,
    signal,
  })
  if (check.exitCode === 0) {
    entry.toolchainsReady.add(key)
    return
  }

  const packages = plan.installPackages.join(' ')
  const install = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc', `set -e; export DEBIAN_FRONTEND=noninteractive; apt-get update -qq; apt-get install -y -qq --no-install-recommends ${packages}`],
    sudo: true,
    timeoutMs: MAX_TOOLCHAIN_INSTALL_TIME_MS,
    signal,
  })
  if (install.exitCode !== 0) {
    const text = await readCommandText(install)
    if (text.stdout.trim()) output.append('stdout', text.stdout)
    if (text.stderr.trim()) output.append('stderr', text.stderr)
    throw new Error(`No se pudo preparar el runtime del lenguaje seleccionado${packages ? ` (${packages})` : ''}.`)
  }

  entry.toolchainsReady.add(key)
}

async function createPooledSandbox(language: Language, needsToolchainNetwork: boolean, signal: AbortSignal): Promise<SandboxInstance> {
  return Sandbox.create({
    timeout: SANDBOX_TIMEOUT_MS,
    resources: { vcpus: 1 },
    networkPolicy: needsToolchainNetwork ? TOOLCHAIN_NETWORK_POLICY : 'deny-all',
    signal,
  } as Parameters<typeof Sandbox.create>[0])
}

async function getOrCreateEntry(language: Language, needsToolchainNetwork: boolean, signal: AbortSignal): Promise<PooledSandbox> {
  const pool = getPool()
  let entry = pool[language]
  if (entry && !entry.disposed) return entry

  const sandbox = await createPooledSandbox(language, needsToolchainNetwork, signal)
  entry = {
    sandbox,
    queue: Promise.resolve(),
    toolchainsReady: new Set(),
    dirReady: false,
    disposed: false,
  }
  pool[language] = entry
  scheduleIdleStop(language, entry)
  return entry
}

async function runStep(
  sandbox: SandboxInstance,
  step: RuntimeCommand,
  timeoutMs: number,
  signal: AbortSignal,
  output: OutputCapture,
  env: Record<string, string>,
) {
  let timedOut = false
  let startedAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const result = await sandbox.runCommand({
      cmd: step.cmd,
      args: step.args,
      cwd: SANDBOX_DIRECTORY,
      env,
      timeoutMs,
      signal,
      stdout: output.createStream('stdout'),
      stderr: output.createStream('stderr'),
      onStart: (command) => {
        startedAt = Date.now()
        output.setStopProcess(() => { void command.kill('SIGKILL').catch(() => undefined) })
        timer = setTimeout(() => {
          timedOut = true
          void command.kill('SIGKILL').catch(() => undefined)
        }, timeoutMs)
      },
    })

    return {
      exitCode: result.exitCode,
      durationMs: Math.max(0, result.durationMs ?? (Date.now() - startedAt)),
      timedOut,
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function prepareAndRun(
  language: Language,
  code: string,
  signal: AbortSignal,
): Promise<SandboxExecutionResult> {
  let timedOut = false
  let durationMs = 0
  let exitCode = 0
  const output = new OutputCapture()
  const plan = getRuntimePlan(language, code)
  const env = runtimeEnv(language)

  const runOnce = async (): Promise<SandboxExecutionResult> => {
    const entry = await getOrCreateEntry(language, plan.installPackages.length > 0, signal)
    scheduleIdleStop(language, entry)

    if (!entry.dirReady) {
      await ensureDirectory(entry.sandbox, signal)
      entry.dirReady = true
    }

    if (plan.installPackages.length) {
      await ensureToolchain(entry.sandbox, language, plan, signal, output, entry)
      await (entry.sandbox as SandboxInstance & { update?: (opts: unknown, init?: unknown) => Promise<unknown> })
        .update?.({ networkPolicy: 'deny-all' }, { signal })
        .catch(() => undefined)
    }

    // Clean previous source/binaries and write the new file.
    await entry.sandbox.runCommand({
      cmd: 'bash',
      args: ['-lc', `find ${SANDBOX_DIRECTORY} -mindepth 1 -maxdepth 1 -exec rm -rf {} +`],
      timeoutMs: 10_000,
      signal,
    }).catch(() => undefined)

    await entry.sandbox.writeFiles([{ path: `${SANDBOX_DIRECTORY}/${plan.filename}`, content: code }], { signal })

    const steps = [plan.compile, plan.run].filter((step): step is RuntimeCommand => Boolean(step))
    for (const step of steps) {
      const result = await runStep(
        entry.sandbox,
        step,
        step.phase === 'compile' ? MAX_COMPILE_TIME_MS : MAX_EXECUTION_TIME_MS,
        signal,
        output,
        env,
      )
      durationMs += result.durationMs
      exitCode = result.exitCode
      timedOut ||= result.timedOut
      if (result.exitCode !== 0 || result.timedOut) break
    }

    // Keep sandbox warm for subsequent runs of the same language.
    await (entry.sandbox as SandboxInstance & { extendTimeout?: (ms: number, opts?: unknown) => Promise<unknown> })
      .extendTimeout?.(SANDBOX_TIMEOUT_MS, { signal })
      .catch(() => undefined)

    return {
      output: output.output,
      exitCode,
      durationMs,
      timedOut,
      outputTruncated: output.truncated,
    }
  }

  try {
    return await runOnce()
  } catch (error) {
    if (isAbortError(error, signal)) throw error
    // If the pooled sandbox died or cwd/path became invalid, recreate once.
    if (isSandboxUnavailable(error)) {
      await disposePooled(language)
      timedOut = false
      durationMs = 0
      exitCode = 0
      output.output.length = 0
      output.truncated = false
      try {
        return await runOnce()
      } catch (retryError) {
        if (isAbortError(retryError, signal)) throw retryError
        const message = retryError instanceof Error ? retryError.message : 'No se pudo ejecutar el código.'
        output.append('stderr', `${message}\n`)
        return { output: output.output, exitCode: 1, durationMs, timedOut, outputTruncated: output.truncated }
      }
    }
    const message = error instanceof Error ? error.message : 'No se pudo ejecutar el código.'
    output.append('stderr', `${message}\n`)
    return {
      output: output.output,
      exitCode: exitCode || 1,
      durationMs,
      timedOut,
      outputTruncated: output.truncated,
    }
  }
}

export async function executeInSandbox(language: Language, code: string, signal: AbortSignal): Promise<SandboxExecutionResult> {
  const queues = getQueues()
  const previous = queues[language] ?? Promise.resolve()

  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  const queued = previous.catch(() => undefined).then(() => current)
  queues[language] = queued

  await previous.catch(() => undefined)
  try {
    return await prepareAndRun(language, code, signal)
  } finally {
    release()
  }
}
