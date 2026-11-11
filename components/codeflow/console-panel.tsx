'use client'

import { useCallback, useState } from 'react'

import { APP_ICONS } from '@/components/codeflow/app-icons'
import { Button } from '@/components/ui/button'
import { ConsoleTerminal } from '@/components/codeflow/console-terminal'
import type { ExecutionOutput, RunStatus } from '@/lib/codeflow-types'

const STATUS_LABEL: Record<RunStatus, string> = {
  idle: 'En espera',
  loading: 'Preparando',
  running: 'En ejecución',
  paused: 'En pausa',
  complete: 'Completado',
  stopped: 'Detenido',
  error: 'Error',
}

interface ConsolePanelProps {
  logs: ExecutionOutput[]
  status: RunStatus
  /** Resultado de la última ejecución, siempre visible en el cuerpo. */
  runNotice: string
  /** Cierra la consola por completo; su icono queda en la barra. */
  onClose?: () => void
  collapsed: boolean
  height?: number
  onToggleCollapsed: () => void
  onClear: () => void
  /** Avisa de que la salida se copió, para registrar el progreso. */
  onCopy?: () => void
  /** Texto que pide el programa por la entrada estándar. */
  inputPrompt?: string | null
  /** Descarga en curso de las herramientas del runtime. */
  progress?: { label: string; loaded: number; total: number } | null
  /** Envía una línea a la entrada estándar del programa. */
  onSendInput?: (line: string) => void
  /** El usuario ha pedido detener el programa. */
  onInterrupt?: () => void
}

/**
 * Consola real del programa.
 *
 * La salida vive en una terminal de verdad: se ve mientras llega y lo que se
 * teclea va a la entrada estándar del proceso, que es lo que permite negociar
 * con un programa que pregunta datos.
 */
export function ConsolePanel({
  logs,
  status,
  runNotice,
  onClose,
  collapsed,
  height,
  onToggleCollapsed,
  onClear,
  onCopy,
  inputPrompt,
  progress,
  onSendInput,
  onInterrupt,
}: ConsolePanelProps) {
  const [copied, setCopied] = useState(false)

  const copyOutput = useCallback(async () => {
    const text = logs.map((entry) => entry.text).join('\n')
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      onCopy?.()
      window.setTimeout(() => setCopied(false), 1_600)
    } catch {
      setCopied(false)
    }
  }, [logs, onCopy])

  return (
    <section
      className={`cf-console ${collapsed ? 'is-collapsed' : ''}`}
      style={collapsed || height === undefined ? undefined : { height }}
      aria-label="Consola de salida"
    >
      <header className="cf-console__header">
        <button
          type="button"
          className="cf-console__disclosure"
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
        >
          <APP_ICONS.console aria-hidden="true" className="cf-icon" />
          <span className="cf-console__title">Consola</span>
          <span className={`cf-status-dot cf-status-dot--${status}`} aria-hidden="true" />
          <span className={`cf-console__status`}>{STATUS_LABEL[status]}</span>
          <APP_ICONS.chevronDown aria-hidden="true" className={`cf-console__chevron ${collapsed ? 'is-collapsed' : ''}`} />
        </button>
        <div className="cf-console__actions">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Copiar salida de la consola"
            title={copied ? 'Copiado' : 'Copiar salida'}
            onClick={() => void copyOutput()}
            disabled={!logs.length}
          >
            <APP_ICONS.copy aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Limpiar consola"
            title="Limpiar consola"
            onClick={onClear}
            disabled={!logs.length}
          >
            <APP_ICONS.delete aria-hidden="true" />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Cerrar la consola"
              title="Cerrar la consola"
              onClick={onClose}
            >
              <APP_ICONS.close aria-hidden="true" />
            </Button>
          )}
        </div>
      </header>
      {!collapsed && (
        <>
          {progress && (
            <div className="cf-console__progress" role="status">
              <div className="cf-console__progress-head">
                <APP_ICONS.download aria-hidden="true" />
                <span>Descargando {progress.label}…</span>
                <strong>
                  {progress.total > 0
                    ? `${Math.round(progress.loaded / progress.total * 100)}%`
                    : `${Math.round(progress.loaded / 1024)} KB`}
                </strong>
              </div>
              <div className="cf-console__progress-track">
                <span
                  style={{
                    width: progress.total > 0
                      ? `${Math.min(100, progress.loaded / progress.total * 100)}%`
                      : '100%',
                  }}
                />
              </div>
            </div>
          )}
          <div className="cf-console__body">
            <ConsoleTerminal
              logs={logs}
              runNotice={runNotice}
              inputPrompt={inputPrompt}
              onSendInput={onSendInput}
              onInterrupt={onInterrupt}
              onCopy={() => void copyOutput()}
            />
            {!logs.length && status !== 'running' && (
              <p className="cf-console__empty">
                {status === 'complete'
                  ? 'La ejecución terminó sin escribir en la salida estándar.'
                  : status === 'error'
                    ? 'La ejecución falló antes de producir salida.'
                    : 'Ejecuta el archivo para ver aquí stdout y stderr.'}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
