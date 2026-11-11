'use client'

import type { ReactNode } from 'react'

import { APP_ICONS } from '@/components/codeflow/app-icons'
import { Button } from '@/components/ui/button'

interface PageHeaderProps {
  eyebrow: ReactNode
  title: string
  description?: string
  actions?: ReactNode
  aside?: ReactNode
  back?: { label: string; onClick: () => void }
}

/**
 * Cabecera común de las vistas de página (proyectos y logros).
 *
 * Sigue la jerarquía de las apps de Apple: un antetítulo pequeño, un título
 * grande con tracking cerrado y una descripción breve. Las acciones viven a la
 * derecha y el bloque `aside` es siempre lo último, de modo que el elemento
 * más destacado de la vista se lee primero al entrar.
 */
export function PageHeader({ eyebrow, title, description, actions, aside, back }: PageHeaderProps) {
  return (
    <header className="cf-page-header">
      <div className="cf-page-header__main">
        {back && (
          <Button variant="ghost" size="sm" onClick={back.onClick} className="cf-back-button">
            <APP_ICONS.back aria-hidden="true" />{back.label}
          </Button>
        )}
        <div className="cf-page-header__intro">
          <span className="cf-page-header__eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      <div className="cf-page-header__trailing">
        {actions ? <div className="cf-page-header__actions">{actions}</div> : null}
        {aside ? <div className="cf-page-header__aside">{aside}</div> : null}
      </div>
    </header>
  )
}
