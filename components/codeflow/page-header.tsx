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
 * Comparte la misma jerarquía, el mismo acento y el mismo espacio, para que
 * cambiar de vista no parezca cambiar de aplicación.
 */
export function PageHeader({ eyebrow, title, description, actions, aside, back }: PageHeaderProps) {
  return (
    <header className="cf-page-header">
      <div className="cf-page-header__intro">
        {back && (
          <Button variant="ghost" size="sm" onClick={back.onClick} className="cf-back-button">
            <APP_ICONS.back aria-hidden="true" />{back.label}
          </Button>
        )}
        <span className="cf-page-header__eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="cf-page-header__actions">{actions}</div> : null}
      {aside ? <div className="cf-page-header__aside">{aside}</div> : null}
    </header>
  )
}
