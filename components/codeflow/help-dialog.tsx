'use client'

import { CircleAlert, Keyboard, Layers3, ShieldAlert } from 'lucide-react'

import { APP_ICONS } from '@/components/codeflow/app-icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { MAX_EXECUTIONS_PER_MINUTE } from '@/lib/runtime-safety'
import { LANGUAGE_DEFINITIONS, SUPPORTED_LANGUAGES } from '@/lib/languages'

interface HelpDialogProps {
  open: boolean
  onClose: () => void
}

const STEPS = [
  {
    title: 'Lee la estructura',
    body: 'JavaScript y TypeScript usan el AST de Babel, Python su gramática sintáctica y el resto de lenguajes un analizador estructural. Selecciona un nodo para saltar a su línea.',
  },
  {
    title: 'Explora el flujo',
    body: 'Las decisiones, ciclos, entradas y salidas se agrupan en símbolos estándar. El diagrama no evalúa expresiones ni inventa valores dinámicos.',
  },
  {
    title: 'Edita en ambos sentidos',
    body: 'Los cambios del editor regeneran el diagrama. Edita una línea desde un nodo para sincronizarla con el código; se avisa si hay un conflicto.',
  },
  {
    title: 'Guarda tu proyecto',
    body: 'Importa archivos o una carpeta entera, y exporta el espacio como .codeflow.json o como ZIP con los diagramas. Los cambios se guardan en esta sesión.',
  },
]

const SHORTCUTS = [
  { label: 'Ejecutar el archivo', keys: ['⌘', '↵'], alt: 'Ctrl + Enter' },
  { label: 'Filtrar archivos', keys: ['⌘', 'P'], alt: 'Ctrl + P' },
  { label: 'Abrir esta guía', keys: ['⌘', '?'], alt: 'Ctrl + ?' },
  { label: 'Cerrar menús y diálogos', keys: ['Esc'], alt: '' },
]

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="cf-dialog cf-dialog--wide">
        <header className="cf-help__header">
          <span className="cf-help__eyebrow"><Layers3 aria-hidden="true" /> Guía rápida</span>
          <Button variant="ghost" size="icon-sm" className="cf-icon-button" onClick={onClose} aria-label="Cerrar la guía" title="Cerrar">
            <APP_ICONS.close aria-hidden="true" />
          </Button>
        </header>

        <h2 className="cf-help__title">Un programa, paso a paso.</h2>
        <p className="cf-help__lede">
          CodeFlow convierte código en un diagrama estático de control y ejecuta {SUPPORTED_LANGUAGES.map((language) => LANGUAGE_DEFINITIONS[language].label).join(', ')} en una microVM desechable, fuera del navegador y del proceso de la aplicación.
        </p>

        <div className="cf-help__steps">
          {STEPS.map((step, index) => (
            <article className="cf-help__step" key={step.title}>
              <span className="cf-help__step-index">{String(index + 1).padStart(2, '0')}</span>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
            </article>
          ))}
        </div>

        <section className="cf-help__shortcuts">
          <div className="cf-help__section-title"><Keyboard aria-hidden="true" /> Atajos</div>
          {SHORTCUTS.map((shortcut) => (
            <div className="cf-help__shortcut" key={shortcut.label}>
              <span>{shortcut.label}</span>
              <span className="cf-help__keys">
                {shortcut.keys.map((key) => <kbd key={key}>{key}</kbd>)}
              </span>
              {shortcut.alt ? <span className="cf-help__alt">{shortcut.alt}</span> : <span />}
            </div>
          ))}
        </section>

        <section className="cf-help__runtime">
          <div className="cf-help__section-title"><ShieldAlert aria-hidden="true" /> Ejecución aislada <span>disponible</span></div>
          <p>
            <CircleAlert aria-hidden="true" />
            <span>Cada ejecución crea una microVM efímera de Vercel Sandbox. El código no corre en el navegador ni en el servidor de la app, no recibe secretos del proyecto, no tiene acceso a red y el entorno se elimina al terminar.</span>
          </p>
        </section>

        <p className="cf-help__limit">
          <strong>Límites:</strong> fuente hasta 50 KB, una vCPU y 2 GB de memoria, 15 segundos de compilación, máximo 8 segundos de ejecución y 16 KB de salida; el límite compartido es de {MAX_EXECUTIONS_PER_MINUTE.toLocaleString('es')} ejecuciones por minuto y dirección IP. La consola muestra stdout y stderr. El análisis es estático: no captura variables ni trazas paso a paso, y puede rechazar sintaxis no compatible en lugar de dibujar un flujo incompleto.
        </p>

        <footer className="cf-help__footer">
          <span>Más información técnica en <code>docs/runtime-and-limits.md</code></span>
          <Button variant="ghost" size="sm" onClick={onClose} className="cf-home__link">
            Volver al estudio
            <APP_ICONS.chevronRight aria-hidden="true" />
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
