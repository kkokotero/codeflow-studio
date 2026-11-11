'use client'

import { ArrowRight, CircleAlert, Keyboard, Layers3, ShieldAlert, X } from 'lucide-react'

import { APP_ICONS } from '@/components/codeflow/app-icons'
import { MAX_EXECUTIONS_PER_MINUTE } from '@/lib/runtime-safety'
import { LANGUAGE_DEFINITIONS, SUPPORTED_LANGUAGES } from '@/lib/languages'

interface HelpDialogProps {
  onClose: () => void
}

const SHORTCUTS = [
  { label: 'Ejecutar el archivo', keys: ['⌘', '↵'], alt: 'Ctrl + Enter' },
  { label: 'Filtrar archivos', keys: ['⌘', 'P'], alt: 'Ctrl + P' },
  { label: 'Abrir esta ayuda', keys: ['⌘', '?'], alt: 'Ctrl + ?' },
  { label: 'Cerrar menús y diálogos', keys: ['Esc'], alt: '' },
]

export function HelpDialog({ onClose }: HelpDialogProps) {
  return (
    <div className="cf-help-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="cf-help" role="dialog" aria-modal="true" aria-labelledby="help-title" aria-describedby="help-description">
        <div className="cf-help__header">
          <div className="cf-help__eyebrow"><Layers3 aria-hidden="true" /><span>Guía rápida</span></div>
          <button type="button" className="cf-help__close" onClick={onClose} aria-label="Cerrar ayuda"><X aria-hidden="true" /></button>
        </div>
        <h2 id="help-title">Un programa, paso a paso.</h2>
        <p id="help-description" className="cf-help__lede">
          CodeFlow convierte código en un diagrama estático de control y ejecuta {SUPPORTED_LANGUAGES.map((language) => LANGUAGE_DEFINITIONS[language].label).join(', ')} en una microVM desechable, fuera del navegador y del proceso de la aplicación.
        </p>
        <div className="cf-help__grid">
          <article className="cf-help__card">
            <span className="cf-help__number">01</span>
            <strong>Lee la estructura</strong>
            <p>JavaScript y TypeScript usan el AST de Babel, Python su gramática sintáctica y el resto de lenguajes un analizador estructural. Selecciona un nodo para saltar a su línea.</p>
          </article>
          <article className="cf-help__card">
            <span className="cf-help__number">02</span>
            <strong>Explora el flujo</strong>
            <p>Las decisiones, ciclos, entradas y salidas se agrupan en símbolos estándar. El diagrama no evalúa expresiones ni inventa valores dinámicos.</p>
          </article>
          <article className="cf-help__card">
            <span className="cf-help__number">03</span>
            <strong>Edita en ambos sentidos</strong>
            <p>Los cambios del editor regeneran el diagrama. Edita una línea desde un nodo para sincronizarla con el código; se avisa si hay un conflicto.</p>
          </article>
          <article className="cf-help__card">
            <span className="cf-help__number">04</span>
            <strong>Guarda tu proyecto</strong>
            <p>Importa varios archivos y exporta el espacio como <code>.codeflow.json</code>. Los cambios se mantienen en esta pestaña hasta exportarlos.</p>
          </article>
        </div>
        <div className="cf-help__shortcuts">
          <div className="cf-help__shortcuts-title"><Keyboard aria-hidden="true" />Atajos</div>
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label}>
              <span>{shortcut.label}</span>
              <span className="cf-help__keys">
                {shortcut.keys.map((key) => <kbd key={key}>{key}</kbd>)}
              </span>
              {shortcut.alt ? <span className="cf-help__alt">{shortcut.alt}</span> : null}
            </div>
          ))}
        </div>
        <div className="cf-help__runtime">
          <div className="cf-help__runtime-heading"><ShieldAlert aria-hidden="true" /><strong>Ejecución aislada</strong><span>disponible</span></div>
          <div className="cf-help__warning">
            <CircleAlert aria-hidden="true" />
            <span>Cada ejecución crea una microVM efímera de Vercel Sandbox. El código no corre en el navegador ni en el servidor de la app, no recibe secretos del proyecto, no tiene acceso a red y el entorno se elimina al terminar.</span>
          </div>
        </div>
        <div className="cf-help__limit">
          <strong>Límites:</strong> fuente hasta 50 KB, una vCPU y 2 GB de memoria, 15 segundos de compilación, máximo 8 segundos de ejecución y 16 KB de salida; el límite compartido es de {MAX_EXECUTIONS_PER_MINUTE.toLocaleString('es')} ejecuciones por minuto y dirección IP. La consola muestra stdout y stderr. El análisis es estático: no captura variables ni trazas paso a paso, y puede rechazar sintaxis no compatible en lugar de dibujar un flujo incompleto.
        </div>
        <div className="cf-help__footer">
          <span>Más información técnica en <code>docs/runtime-and-limits.md</code></span>
          <button type="button" onClick={onClose}>Volver al estudio <ArrowRight aria-hidden="true" /></button>
        </div>
      </section>
    </div>
  )
}
