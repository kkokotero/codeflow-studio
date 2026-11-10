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

const SANDBOX_DIRECTORY = '/vercel/sandbox'
const SANDBOX_TIMEOUT_MS = 90_000

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

async function ensureToolchain(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  plan: ReturnType<typeof getRuntimePlan>,
  signal: AbortSignal,
  output: OutputCapture,
) {
  if (!plan.installPackages.length) return

  const check = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc', `command -v ${plan.check}`],
    cwd: SANDBOX_DIRECTORY,
    timeoutMs: 10_000,
    signal,
  })
  if (check.exitCode === 0) return

  const packages = plan.installPackages.join(' ')
  const install = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc', `set -e; export DEBIAN_FRONTEND=noninteractive; apt-get update -qq; apt-get install -y -qq --no-install-recommends ${packages}`],
    cwd: SANDBOX_DIRECTORY,
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
}

async function runStep(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
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

function isAbortError(error: unknown, signal: AbortSignal) {
  return signal.aborted || (error instanceof Error && (error.name === 'AbortError' || /aborted|abort/i.test(error.message)))
}

export async function executeInSandbox(language: Language, code: string, signal: AbortSignal): Promise<SandboxExecutionResult> {
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | undefined
  let timedOut = false
  let durationMs = 0
  let exitCode = 0
  const output = new OutputCapture()
  const plan = getRuntimePlan(language, code)
  const env = runtimeEnv(language)

  try {
    sandbox = await Sandbox.create({
      timeout: SANDBOX_TIMEOUT_MS,
      resources: { vcpus: 1 },
      networkPolicy: plan.installPackages.length ? TOOLCHAIN_NETWORK_POLICY : 'deny-all',
      signal,
    } as Parameters<typeof Sandbox.create>[0])

    if (plan.installPackages.length) {
      await ensureToolchain(sandbox, plan, signal, output)
      await sandbox.update({ networkPolicy: 'deny-all' } as never, { signal } as never).catch(() => undefined)
    }

    await sandbox.writeFiles([{ path: `${SANDBOX_DIRECTORY}/${plan.filename}`, content: code }], { signal })

    const steps = [plan.compile, plan.run].filter((step): step is RuntimeCommand => Boolean(step))
    for (const step of steps) {
      const result = await runStep(
        sandbox,
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

    return {
      output: output.output,
      exitCode,
      durationMs,
      timedOut,
      outputTruncated: output.truncated,
    }
  } catch (error) {
    if (isAbortError(error, signal)) throw error
    const message = error instanceof Error ? error.message : 'No se pudo ejecutar el código.'
    if (!output.output.some((item) => item.stream === 'stderr' && item.text.includes(message))) {
      output.append('stderr', `${message}\n`)
    }
    return {
      output: output.output,
      exitCode: exitCode || 1,
      durationMs,
      timedOut,
      outputTruncated: output.truncated,
    }
  } finally {
    if (sandbox) await sandbox.stop().catch(() => sandbox?.delete?.().catch(() => undefined))
  }
}
