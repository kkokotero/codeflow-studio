import 'server-only'

import { Sandbox } from '@vercel/sandbox'
import { StringDecoder } from 'node:string_decoder'
import { Writable } from 'node:stream'
import type { ExecutionOutput, Language, SandboxExecutionResult } from '@/lib/codeflow-types'
import { MAX_EXECUTION_OUTPUT_BYTES, MAX_EXECUTION_TIME_MS } from '@/lib/runtime-safety'

const SANDBOX_DIRECTORY = '/vercel/sandbox'
const SANDBOX_TIMEOUT_MS = 30_000

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

export async function executeInSandbox(language: Language, code: string, signal: AbortSignal): Promise<SandboxExecutionResult> {
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | undefined
  let commandTimeout: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  let commandStartedAt = 0
  const output = new OutputCapture()

  try {
    sandbox = await Sandbox.create({
      image: 'vercel/sandbox/universal:latest',
      timeout: SANDBOX_TIMEOUT_MS,
      persistent: false,
      resources: { vcpus: 1 },
      networkPolicy: 'deny-all',
      signal,
    })

    const filename = language === 'javascript' ? 'main.mjs' : 'main.py'
    await sandbox.writeFiles([{ path: `${SANDBOX_DIRECTORY}/${filename}`, content: code }], { signal })

    const result = await sandbox.runCommand({
      cmd: language === 'javascript' ? 'node' : 'python3',
      args: language === 'javascript' ? ['--max-old-space-size=256', filename] : [filename],
      cwd: SANDBOX_DIRECTORY,
      timeoutMs: MAX_EXECUTION_TIME_MS,
      signal,
      stdout: output.createStream('stdout'),
      stderr: output.createStream('stderr'),
      onStart: (command) => {
        commandStartedAt = Date.now()
        output.setStopProcess(() => { void command.kill('SIGKILL').catch(() => undefined) })
        commandTimeout = setTimeout(() => {
          timedOut = true
          void command.kill('SIGKILL').catch(() => undefined)
        }, MAX_EXECUTION_TIME_MS)
      },
    })

    const durationMs = Math.max(0, result.durationMs ?? (Date.now() - commandStartedAt))
    return {
      output: output.output,
      exitCode: result.exitCode,
      durationMs,
      timedOut: timedOut || durationMs >= MAX_EXECUTION_TIME_MS,
      outputTruncated: output.truncated,
    }
  } finally {
    if (commandTimeout) clearTimeout(commandTimeout)
    if (sandbox) await sandbox.delete().catch(() => undefined)
  }
}
