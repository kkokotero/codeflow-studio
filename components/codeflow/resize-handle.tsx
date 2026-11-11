'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Estado que sobrevive a la recarga. Se lee en un efecto para que el HTML del
 * servidor y el del cliente coincidan y no se produzca desajuste de hidratación.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) setValue(JSON.parse(raw) as T)
    } catch {
      // Un valor ilegible no debe impedir abrir la app.
    }
    setHydrated(true)
  }, [key])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Sin espacio en disco: el estado sigue vivo en memoria.
    }
  }, [hydrated, key, value])

  return [value, setValue, hydrated] as const
}

interface ResizeHandleProps {
  /** 'vertical' para columnas (arrastrar izquierda/derecha), 'horizontal' para filas. */
  orientation: 'vertical' | 'horizontal'
  onResize: (delta: number) => void
  /** Teclado: flechas para ajustar, con la tecla Mayús para pasos grandes. */
  onNudge?: (delta: number) => void
  label: string
}

/**
 * Separador redimensionable entre paneles.
 *
 * La línea es un punto de agarre real: se arrastra con el puntero y también
 * se ajusta con el teclado, con el foco visible.
 */
export function ResizeHandle({ orientation, onResize, onNudge, label }: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false)
  const originRef = useRef(0)

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    originRef.current = orientation === 'vertical' ? event.clientX : event.clientY
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Sin puntero capturado el arrastre sigue funcionando con los eventos de la ventana.
    }
    setDragging(true)
  }, [orientation])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const current = orientation === 'vertical' ? event.clientX : event.clientY
    onResize(current - originRef.current)
    originRef.current = current
  }, [dragging, onResize, orientation])

  const stopDragging = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Nada que liberar.
    }
    setDragging(false)
  }, [])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onNudge) return
    const step = event.shiftKey ? 40 : 12
    const forward = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown'
    const backward = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp'
    if (event.key === forward) {
      event.preventDefault()
      onNudge(step)
    } else if (event.key === backward) {
      event.preventDefault()
      onNudge(-step)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onNudge(0)
    }
  }, [onNudge, orientation])
  return (
    <div
      className={`cf-resizer cf-resizer--${orientation} ${dragging ? 'is-dragging' : ''}`}
      role="separator"
      aria-label={label}
      aria-orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onNudge?.(0)}
    >
      <span className="cf-resizer__grip" aria-hidden="true" />
    </div>
  )
}
