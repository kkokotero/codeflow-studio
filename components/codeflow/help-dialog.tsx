'use client'

import { ArrowRight, CircleAlert, Keyboard, Layers3, ShieldAlert, X } from 'lucide-react'

interface HelpDialogProps {
  onClose: () => void
}

export function HelpDialog({ onClose }: HelpDialogProps) {
  return (
    <div className="help-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" aria-describedby="help-description">
        <div className="help-header"><div className="help-title-icon"><Layers3 aria-hidden="true" /><span>GUÍA RÁPIDA</span></div><button type="button" className="help-close" onClick={onClose} aria-label="Cerrar ayuda"><X aria-hidden="true" /></button></div>
        <h2 id="help-title">Un programa, paso a paso.</h2>
        <p id="help-description" className="help-lede">CodeFlow convierte código en un diagrama estático de control. Escribe o importa un archivo para explorar su estructura sin ejecutarlo.</p>
        <div className="help-grid">
          <article className="help-card"><span className="help-card__number">01</span><strong>Lee la estructura</strong><p>JavaScript usa el AST de Babel y Python su gramática sintáctica. Selecciona un nodo para saltar a su línea.</p></article>
          <article className="help-card"><span className="help-card__number">02</span><strong>Explora el flujo</strong><p>Las decisiones, ciclos, entradas y salidas se agrupan en símbolos estándar. El diagrama no evalúa expresiones ni inventa valores dinámicos.</p></article>
          <article className="help-card"><span className="help-card__number">03</span><strong>Edita en ambos sentidos</strong><p>Los cambios del editor regeneran el diagrama. Edita una línea desde un nodo para sincronizarla con el código; se avisa si hay un conflicto.</p></article>
          <article className="help-card"><span className="help-card__number">04</span><strong>Guarda tu proyecto</strong><p>Importa varios archivos y exporta el espacio como <code>.codeflow.json</code>. Los cambios se mantienen en esta pestaña hasta exportarlos.</p></article>
        </div>
        <div className="help-shortcuts"><div className="help-shortcuts__title"><Keyboard aria-hidden="true" />Atajos</div><div><span>Buscar archivo</span><kbd>⌘ P</kbd><span className="shortcut-platform">o Ctrl P</span></div></div>
        <div className="help-runtime"><div className="help-runtime__heading"><ShieldAlert aria-hidden="true" /><strong>Ejecución de código</strong><span>desactivada</span></div><div className="help-warning"><CircleAlert aria-hidden="true" /><span>El código del editor nunca se ejecuta ni se envía a un servidor. El navegador no ofrece aquí un aislamiento suficiente para ejecutar de forma segura código arbitrario; solo se generan diagramas estáticos.</span></div></div>
        <div className="help-limit"><strong>Límites:</strong> no hay consola real, valores de ejecución, snapshots ni historial porque el código no se ejecuta. El análisis estructural no resuelve tipos ni imports entre archivos y puede rechazar sintaxis no compatible en lugar de dibujar un flujo incompleto.</div>
        <div className="help-footer"><span>Más información técnica en <code>docs/runtime-and-limits.md</code></span><button type="button" onClick={onClose}>Volver al estudio <ArrowRight aria-hidden="true" /></button></div>
      </section>
    </div>
  )
}
