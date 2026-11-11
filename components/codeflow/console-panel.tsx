'use client'

import { useCallback, useState } from 'react'

import { APP_ICONS } from '@/components/codeflow/app-icons'
import { Button } from '@/components/ui/button'
import type { ExecutionOutput, RunStatus } from '@/lib/codeflow-types'

const STATUS_LABEL: Record<RunStatus, string> = {
  idle: 'En espera',
  loading: 'Creando microVM',
  running: 'En ejecución',
  paused: 'En pausa',
  complete: 'Completado',
  stopped: 'Detenido',
  error: 'Error',
}

interface ConsolePanelProps {
  logs: ExecutionOutput[]
  status: RunStatus
  notice: string
  collapsed: boolean
  height?: number
  onToggleCollapsed: () => void
  onClear: () => void
}

/**
 * Consola de salida del proceso.
 *
 * Es el único panel de resultados:stdout y stderr con su marca de canal, el
 * estado de la última ejecución y dos acciones que hacen algo real (copiar y
 * limpiar). Nada de controles que nunca reciben datos.
 */
export function ConsolePanel({ logs, status, notice, collapsed, height, onToggleCollapsed, onClear }: ConsolePanelProps) {
  const [copied, setCopied] = useState(false)

  const copyOutput = useCallback(async () => {
    const text = logs.map((entry) => entry.text).join('\n')
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_600)
    } catch {
      setCopied(false)
    }
  }, [logs])

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
          <span className="cf-console__status">{STATUS_LABEL[status]}</span>
          <APP_ICONS.chevronDown aria-hidden="true" className={`cf-console__chevron ${collapsed ? 'is-collapsed' : ''}`} />
        </button>
        <span className="cf-console__notice" title={notice}>{notice}</span>
        <div className="cf-console__actions">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Copiar salida de la consola"
            title="Copiar salida"
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
        </div>
      </header>
      {!collapsed && (
        <div className="cf-console__body" role="log" aria-live="polite" aria-label="Salida del programa">
          {logs.length ? (
            logs.map((entry, index) => (
              <div className={`cf-console__line ${entry.stream === 'stderr' ? 'is-error' : ''}`} key={`${index}-${entry.stream}`}>
                <span className="cf-console__prompt" aria-hidden="true">{entry.stream === 'stderr' ? '!' : '›'}</span>
                <span className="cf-console__text">{entry.text}</span>
              </div>
            ))
          ) : (
            <p className="cf-console__empty">
              {status === 'complete'
                ? 'La ejecución terminó sin escribir en la salida estándar.'
                : status === 'error'
                  ? 'La ejecución falló antes de producir salida.'
                  : 'Ejecuta el archivo para ver aquí stdout y stderr. Cada proceso corre en una microVM desechable, sin red.'}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
