'use client'

import { ArrowRight, CircleAlert, Keyboard, Layers3, ShieldCheck, X } from 'lucide-react'

interface HelpDialogProps {
  onClose: () => void
}

export function HelpDialog({ onClose }: HelpDialogProps) {
  return (
    <div className="help-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" aria-describedby="help-description">
        <div className="help-header"><div className="help-title-icon"><Layers3 aria-hidden="true" /><span>GUÍA RÁPIDA</span></div><button type="button" className="help-close" onClick={onClose} aria-label="Cerrar ayuda"><X aria-hidden="true" /></button></div>
        <h2 id="help-title">Un programa, paso a paso.</h2>
        <p id="help-description" className="help-lede">CodeFlow convierte código ejecutable en un registro de estados reales. Escribe o importa un archivo y ejecuta el ejemplo.</p>
        <div className="help-grid">
          <article className="help-card"><span className="help-card__number">01</span><strong>Lee la estructura</strong><p>El diagrama se genera desde el AST de JavaScript y el análisis de bloques Python. Selecciona un nodo para saltar a su línea.</p></article>
          <article className="help-card"><span className="help-card__number">02</span><strong>Inspecciona valores</strong><p>Ejecuta el archivo para capturar variables, llamadas, consola y líneas. Avanza por el registro con los controles inferiores.</p></article>
          <article className="help-card"><span className="help-card__number">03</span><strong>Edita en ambos sentidos</strong><p>Los cambios del editor regeneran el diagrama. Edita una línea desde un nodo para sincronizarla con el código; se avisa si hay un conflicto.</p></article>
          <article className="help-card"><span className="help-card__number">04</span><strong>Compara experimentos</strong><p>Cada ejecución guarda un snapshot temporal en esta pestaña. Marca dos ejecuciones en Historial para comparar sus valores finales.</p></article>
        </div>
        <div className="help-shortcuts"><div className="help-shortcuts__title"><Keyboard aria-hidden="true" />Atajos</div><div><span>Ejecutar</span><kbd>⌘ Enter</kbd><span className="shortcut-platform">o Ctrl Enter</span></div><div><span>Buscar archivo</span><kbd>⌘ P</kbd><span className="shortcut-platform">o Ctrl P</span></div></div>
        <div className="help-runtime"><div className="help-runtime__heading"><ShieldCheck aria-hidden="true" /><strong>Runtimes actuales</strong><span>02 activos</span></div><div className="help-runtime__row"><span className="runtime-language">JS</span><div><strong>JavaScript</strong><span>Worker desechable · Babel AST · límite de 10 s</span></div></div><div className="help-runtime__row"><span className="runtime-language runtime-language--python">Py</span><div><strong>Python</strong><span>Pyodide / WebAssembly · descarga inicial desde jsDelivr</span></div></div><div className="help-warning"><CircleAlert aria-hidden="true" /><span>Las pausas y breakpoints navegan el registro capturado; no congelan el intérprete. No hay cuota de memoria por Worker en los navegadores. Ejecuta código de confianza.</span></div></div>
        <div className="help-limit"><strong>Aún no disponible:</strong> TypeScript, Lua, Java, C/C++, C#, Go, Rust; imports entre archivos; ejecución asíncrona y persistencia entre recargas. Los archivos y el historial se quedan en esta pestaña. Exporta el proyecto como <code>.codeflow.json</code> para guardarlo.</div>
        <div className="help-footer"><span>Más información técnica en <code>docs/runtime-and-limits.md</code></span><button type="button" onClick={onClose}>Volver al estudio <ArrowRight aria-hidden="true" /></button></div>
      </section>
    </div>
  )
}
