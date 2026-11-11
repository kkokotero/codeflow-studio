'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

import { readAppPalette } from '@/lib/app-palette'
import type { ExecutionOutput } from '@/lib/codeflow-types'

interface ConsoleTerminalProps {
  /** Salida acumulada de la última ejecución. */
  logs: ExecutionOutput[]
  /** Aviso del sistema que se muestra antes de la salida. */
  runNotice: string
  /** Texto que pide el programa por la entrada estándar. */
  inputPrompt?: string | null
  /** Envía una línea a la entrada estándar del programa. */
  onSendInput?: (line: string) => void
  /** El usuario ha pedido detener el programa. */
  onInterrupt?: () => void
  /** Avisa de que la salida se copió. */
  onCopy?: () => void
}

/** Colores de la terminal: los mismos roles que usa el editor de código. */
function buildTheme(): ITheme {
  const palette = readAppPalette()
  return {
    background: palette.canvas,
    foreground: palette.text,
    cursor: palette.primary,
    cursorAccent: palette.canvas,
    selectionBackground: `${palette.primary}55`,
    selectionInactiveBackground: `${palette.primary}33`,
    black: palette.outline,
    red: palette.error,
    green: palette.primary,
    yellow: palette.tertiary,
    blue: palette.secondary,
    magenta: palette.tertiaryContainer,
    cyan: palette.secondaryContainer,
    white: palette.text,
    brightBlack: palette.muted,
    brightRed: palette.errorContainer,
    brightGreen: palette.primaryContainer,
    brightYellow: palette.tertiaryContainer,
    brightBlue: palette.secondaryContainer,
    brightMagenta: palette.primaryContainer,
    brightCyan: palette.primaryContainer,
    brightWhite: palette.primary,
  }
}

/**
 * Terminal real del programa.
 *
 * Usa xterm.js: la salida se escribe como en una terminal de verdad y lo que
 * se teclea va a la entrada estándar del proceso. Comparte paleta con el
 * editor de código, así que ambos se leen como parte de la misma interfaz.
 */
export function ConsoleTerminal({
  logs,
  runNotice,
  inputPrompt,
  onSendInput,
  onInterrupt,
  onCopy,
}: ConsoleTerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const writtenRef = useRef(0)
  const noticeRef = useRef('')
  const lineRef = useRef('')
  const promptRef = useRef<string | null>(null)

  // La terminal se crea una vez y se reutiliza.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const terminal = new Terminal({
      allowProposedApi: true,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      disableStdin: false,
      fontFamily: 'Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.35,
      scrollback: 4_000,
      theme: buildTheme(),
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(host)
    fitAddon.fit()

    terminalRef.current = terminal
    fitRef.current = fitAddon

    // Edición de línea: la terminal hace de terminal.
    terminal.onData((data) => {
      if (data === '\r') {
        const line = lineRef.current
        lineRef.current = ''
        terminal.write('\r\n')
        onSendInput?.(line)
        return
      }
      if (data === '\u0003') {
        lineRef.current = ''
        terminal.write('^C\r\n')
        onInterrupt?.()
        return
      }
      if (data === '\u007f' || data === '\b') {
        if (!lineRef.current) return
        lineRef.current = lineRef.current.slice(0, -1)
        terminal.write('\b \b')
        return
      }
      if (data < ' ') return
      lineRef.current += data
      terminal.write(data)
    })

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit()
      } catch {
        // El panel puede estar oculto mientras se ajusta.
      }
    })
    observer.observe(host)

    return () => {
      observer.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
      writtenRef.current = 0
    }
  }, [onInterrupt, onSendInput])

  // La paleta del tema se refresca cuando cambia el esquema activo.
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    terminal.options.theme = buildTheme()
  }, [logs])

  // La salida se escribe en la terminal a medida que llega.
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return

    if (logs.length < writtenRef.current) {
      terminal.reset()
      writtenRef.current = 0
      noticeRef.current = ''
    }

    if (runNotice && runNotice !== noticeRef.current) {
      noticeRef.current = runNotice
      terminal.write(`\u001b[2m${runNotice}\u001b[0m\r\n`)
    }

    for (let index = writtenRef.current; index < logs.length; index += 1) {
      const entry = logs[index]
      const color = entry.stream === 'stderr' ? '\u001b[31m' : '\u001b[0m'
      terminal.write(`${color}${entry.text}\u001b[0m`)
    }
    writtenRef.current = logs.length
  }, [logs, runNotice])

  // Cuando el programa pide datos, se muestra su mensaje y el cursor espera.
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    if (inputPrompt === null || inputPrompt === undefined) {
      promptRef.current = null
      return
    }
    if (promptRef.current === inputPrompt) return
    promptRef.current = inputPrompt
    terminal.write(`\u001b[36m${inputPrompt}\u001b[0m`)
    terminal.focus()
  }, [inputPrompt])

  const style = useMemo(() => ({ '--cf-terminal-accent': readAppPalette().primary }) as React.CSSProperties, [])

  return (
    <div className="cf-terminal" ref={hostRef} style={style} onCopy={() => onCopy?.()} />
  )
}
