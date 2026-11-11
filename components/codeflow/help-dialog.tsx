'use client'

import { CircleAlert, Keyboard, Layers3, ShieldAlert, type LucideIcon } from 'lucide-react'

import { APP_ICONS } from '@/components/codeflow/app-icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { MAX_EXECUTION_OUTPUT_BYTES, MAX_EXECUTION_TIME_MS } from '@/lib/runtime-safety'
import { LANGUAGE_DEFINITIONS, SUPPORTED_LANGUAGES } from '@/lib/languages'

interface HelpDialogProps {
  open: boolean
  onClose: () => void
}

interface HelpStep {
  icon: LucideIcon
  title: string
  body: string
}

const STEPS: HelpStep[] = [
  {
    icon: APP_ICONS.analysis,
    title: 'Lee la estructura',
    body: 'JavaScript y TypeScript usan el AST de Babel, Python su gramática sintáctica y el resto de lenguajes un analizador estructural. Selecciona un nodo para saltar a su línea.',
  },
  {
    icon: APP_ICONS.languages,
    title: 'Un solo pseudo-código',
    body: 'Todos los diagramas hablan el mismo idioma: asignaciones, salidas, decisiones y bucles se dibujan igual en los diez lenguajes. Lo que ves en el nodo es lo que se ejecuta.',
  },
  {
    icon: APP_ICONS.flow,
    title: 'Explora el flujo',
    body: 'Las decisiones, ciclos, entradas y salidas se agrupan en símbolos estándar. El diagrama no evalúa expresiones ni inventa valores dinámicos.',
  },
  {
    icon: APP_ICONS.apply,
    title: 'Edita en ambos sentidos',
    body: 'Los cambios del editor regeneran el diagrama. Y al seleccionar un nodo puedes cambiar su forma y sus valores: se escribe en el código original.',
  },
  {
    icon: APP_ICONS.folder,
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
      <DialogContent className="cf-dialog cf-dialog--wide cf-help">
        <header className="cf-help__header">
          <span className="cf-help__eyebrow"><Layers3 aria-hidden="true" /> Guía rápida</span>
          <Button variant="ghost" size="icon-sm" className="cf-icon-button" onClick={onClose} aria-label="Cerrar la guía" title="Cerrar">
            <APP_ICONS.close aria-hidden="true" />
          </Button>
        </header>

        <div className="cf-help__hero">
          <h2 className="cf-help__title">Un programa, paso a paso.</h2>
          <p className="cf-help__lede">
            CodeFlow convierte el código en un diagrama estático de control y lo ejecuta en tu
            navegador, dentro de un Web Worker aislado que se destruye al terminar.
          </p>
          <ul className="cf-help__languages">
            {SUPPORTED_LANGUAGES.map((language) => (
              <li key={language}>
                <span className={`cf-language-mark cf-language-mark--${language}`} aria-hidden="true">
                  {LANGUAGE_DEFINITIONS[language].mark}
                </span>
                {LANGUAGE_DEFINITIONS[language].label}
              </li>
            ))}
          </ul>
        </div>

        <div className="cf-help__body">
          <section className="cf-help__steps" aria-label="Cómo funciona">
            {STEPS.map((step, index) => {
              const Icon = step.icon
              return (
                <article className="cf-help__step" key={step.title}>
                  <span className="cf-help__step-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="cf-help__step-body">
                    <strong><Icon aria-hidden="true" /> {step.title}</strong>
                    <p>{step.body}</p>
                  </div>
                </article>
              )
            })}
          </section>

          <aside className="cf-help__aside">
            <section className="cf-help__shortcuts" aria-label="Atajos de teclado">
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
              <div className="cf-help__section-title"><ShieldAlert aria-hidden="true" /> Ejecución aislada</div>
              <p>
                <CircleAlert aria-hidden="true" />
                <span>Cada ejecución corre en un Web Worker: sin DOM, sin red y sin secretos del proyecto. Python y Lua usan motores compilados a WebAssembly que se cargan en el navegador; al terminar, el worker se destruye.</span>
              </p>
            </section>

            <p className="cf-help__limit">
              <strong>Límites:</strong> fuente hasta 50 KB, máximo {MAX_EXECUTION_TIME_MS / 1_000} segundos de ejecución y {Math.round(MAX_EXECUTION_OUTPUT_BYTES / 1_024)} KB de salida. La consola muestra stdout y stderr en vivo y acepta datos por la entrada estándar. El análisis es estático: no captura variables ni trazas paso a paso, y puede rechazar sintaxis no compatible en lugar de dibujar un flujo incompleto.
            </p>
          </aside>
        </div>

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
