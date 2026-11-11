'use client'

import { useId, type ReactNode } from 'react'

interface ProgressRingProps {
  /** Progreso del anillo, entre 0 y 1. */
  value: number
  /** Diámetro exterior del anillo en píxeles. */
  size?: number
  /** Grosor del trazo en píxeles. */
  stroke?: number
  /** Contenido centrado dentro del anillo. */
  children?: ReactNode
  /** Descripción del anillo para lectores de pantalla. */
  label?: string
  className?: string
}

/**
 * Anillo de progreso circular, al estilo de los anillos de Activity.
 *
 * El trazo activo usa un degradado entre el acento y el color terciario del
 * esquema, de modo que la forma mantiene el carácter del tema sea cual sea la
 * paleta elegida. El trazo se dibuja desde las doce en punto.
 */
export function ProgressRing({
  value,
  size = 72,
  stroke = 7,
  children,
  label,
  className,
}: ProgressRingProps) {
  // Los identificadores de React contienen caracteres que no son válidos en
  // una referencia de SVG, así que se filtran antes de usarlos.
  const rawId = useId()
  const gradientId = `cf-ring-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0

  return (
    <div
      className={`cf-ring ${className ?? ''}`.trim()}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--cf-accent)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--md-sys-color-tertiary, var(--cf-accent))' }} />
          </linearGradient>
        </defs>
        <circle className="cf-ring__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        <circle
          className="cf-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      {children ? <span className="cf-ring__label">{children}</span> : null}
    </div>
  )
}
