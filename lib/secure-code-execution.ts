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

// The sandbox only reaches the Ubuntu package mirrors while provisioning a
// toolchain. The policy is switched back to deny-all before user code runs.
const TOOLCHAIN_NETWORK_POLICY = {
  allow: [
    'archive.ubuntu.com',
    'security.ubuntu.com',
    'ports.ubuntu.com',
    '*.ubuntu.com',
    'ubuntu.com',
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

  private append(stream: ExecutionOutput['stream'], text: string) {
    if (!text) return
    const previous = this.output.at(-1)
    if (previous?.stream === stream) previous.text += text
    else this.output.push({ stream, text })
  }
}

async function ensureToolchain(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  plan: ReturnType<typeof getRuntimePlan>,
  signal: AbortSignal,
) {
  if (!plan.installPackages.length) return

  const check = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc', `command -v ${plan.check}`],
    timeoutMs: 10_000,
    signal,
  })
  if (check.exitCode === 0) return

  const packages = plan.installPackages.join(' ')
  const install = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc', `DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ${packages}`],
    sudo: true,
    timeoutMs: MAX_TOOLCHAIN_INSTALL_TIME_MS,
    signal,
  })
  if (install.exitCode !== 0) throw new Error('No se pudo preparar el runtime del lenguaje seleccionado.')
}

async function runStep(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  step: RuntimeCommand,
  timeoutMs: number,
  signal: AbortSignal,
  output: OutputCapture,
) {
  let timedOut = false
  let startedAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const result = await sandbox.runCommand({
      cmd: step.cmd,
      args: step.args,
      cwd: SANDBOX_DIRECTORY,
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

export async function executeInSandbox(language: Language, code: string, signal: AbortSignal): Promise<SandboxExecutionResult> {
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | undefined
  let timedOut = false
  let durationMs = 0
  let exitCode = 0
  const output = new OutputCapture()
  const plan = getRuntimePlan(language, code)

  try {
    sandbox = await Sandbox.create({
      image: 'vercel/sandbox/universal:latest',
      timeout: SANDBOX_TIMEOUT_MS,
      persistent: false,
      resources: { vcpus: 1 },
      networkPolicy: plan.installPackages.length ? TOOLCHAIN_NETWORK_POLICY : 'deny-all',
      signal,
    })

    if (plan.installPackages.length) {
      await ensureToolchain(sandbox, plan, signal)
      await sandbox.update({ networkPolicy: 'deny-all' }, { signal })
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
  } finally {
    if (sandbox) await sandbox.delete().catch(() => undefined)
  }
}
