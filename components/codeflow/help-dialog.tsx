'use client'

import { ArrowRight, CircleAlert, Keyboard, Layers3, ShieldAlert, X } from 'lucide-react'
import { MAX_EXECUTIONS_PER_MINUTE } from '@/lib/runtime-safety'
import { SUPPORTED_LANGUAGES, LANGUAGE_DEFINITIONS } from '@/lib/languages'

interface HelpDialogProps {
  onClose: () => void
}

export function HelpDialog({ onClose }: HelpDialogProps) {
  return (
    <div className="help-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" aria-describedby="help-description">
        <div className="help-header"><div className="help-title-icon"><Layers3 aria-hidden="true" /><span>GUÍA RÁPIDA</span></div><button type="button" className="help-close" onClick={onClose} aria-label="Cerrar ayuda"><X aria-hidden="true" /></button></div>
        <h2 id="help-title">Un programa, paso a paso.</h2>
        <p id="help-description" className="help-lede">CodeFlow convierte código en un diagrama estático de control y ejecuta {SUPPORTED_LANGUAGES.map((language) => LANGUAGE_DEFINITIONS[language].label).join(', ')} en una microVM desechable, fuera del navegador y del proceso de la aplicación.</p>
        <div className="help-grid">
          <article className="help-card"><span className="help-card__number">01</span><strong>Lee la estructura</strong><p>JavaScript y TypeScript usan el AST de Babel, Python su gramática sintáctica y el resto de lenguajes un analizador estructural. Selecciona un nodo para saltar a su línea.</p></article>
          <article className="help-card"><span className="help-card__number">02</span><strong>Explora el flujo</strong><p>Las decisiones, ciclos, entradas y salidas se agrupan en símbolos estándar. El diagrama no evalúa expresiones ni inventa valores dinámicos.</p></article>
          <article className="help-card"><span className="help-card__number">03</span><strong>Edita en ambos sentidos</strong><p>Los cambios del editor regeneran el diagrama. Edita una línea desde un nodo para sincronizarla con el código; se avisa si hay un conflicto.</p></article>
          <article className="help-card"><span className="help-card__number">04</span><strong>Guarda tu proyecto</strong><p>Importa varios archivos y exporta el espacio como <code>.codeflow.json</code>. Los cambios se mantienen en esta pestaña hasta exportarlos.</p></article>
        </div>
        <div className="help-shortcuts"><div className="help-shortcuts__title"><Keyboard aria-hidden="true" />Atajos</div><div><span>Buscar archivo</span><kbd>⌘ P</kbd><span className="shortcut-platform">o Ctrl P</span></div></div>
        <div className="help-runtime"><div className="help-runtime__heading"><ShieldAlert aria-hidden="true" /><strong>Ejecución aislada</strong><span>disponible</span></div><div className="help-warning"><CircleAlert aria-hidden="true" /><span>Cada ejecución crea una microVM efímera de Vercel Sandbox. El código no corre en el navegador ni en el servidor de la app, no recibe secretos del proyecto, no tiene acceso a red y el entorno se elimina al terminar.</span></div></div>
        <div className="help-limit"><strong>Límites:</strong> fuente hasta 50 KB, una vCPU y 2 GB de memoria, 15 segundos de compilación, máximo 8 segundos de ejecución y 16 KB de salida; el límite compartido es de {MAX_EXECUTIONS_PER_MINUTE.toLocaleString('es')} ejecuciones por minuto y dirección IP. Se muestran stdout y stderr; esta versión no captura variables ni trazas paso a paso. El análisis estático puede rechazar sintaxis no compatible en lugar de dibujar un flujo incompleto.</div>
        <div className="help-footer"><span>Más información técnica en <code>docs/runtime-and-limits.md</code></span><button type="button" onClick={onClose}>Volver al estudio <ArrowRight aria-hidden="true" /></button></div>
      </section>
    </div>
  )
}
