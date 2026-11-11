'use client'

import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import type { LucideIcon } from 'lucide-react'
import { Check } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

const Menu = MenuPrimitive.Root
const MenuTrigger = MenuPrimitive.Trigger
const MenuGroup = MenuPrimitive.Group
const MenuRadioGroup = MenuPrimitive.RadioGroup

/**
 * Menú contextual de la aplicación.
 *
 * Un único patrón para toda la app: separadores entre grupos, etiquetas con
 * verbo, glifos consistentes y el atajo de teclado alineado a la derecha.
 */
function MenuContent({
  className,
  align = 'start',
  side = 'bottom',
  sideOffset = 6,
  ...props
}: ComponentProps<typeof MenuPrimitive.Popup> & {
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  sideOffset?: number
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignOffset={-4}
        collisionPadding={8}
        className="cf-menu-positioner"
      >
        <MenuPrimitive.Popup {...props} className={cn('cf-menu', className)} />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function MenuGroupLabel({ className, ...props }: ComponentProps<typeof MenuPrimitive.GroupLabel>) {
  return <MenuPrimitive.GroupLabel {...props} className={cn('cf-menu__label', className)} />
}

function MenuSeparator({ className, ...props }: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator {...props} className={cn('cf-menu__separator', className)} />
}

interface MenuItemProps extends ComponentProps<typeof MenuPrimitive.Item> {
  /** Glifo opcional. Todos los elementos de un grupo deben llevarlo o ninguno. */
  icon?: LucideIcon
  /** Contenido opcional antes de la etiqueta (una muestra de color, una insignia…). */
  leading?: ReactNode
  /** Atajo de teclado, mostrado alineado a la derecha. */
  shortcut?: string
  /** Texto secundario, mostrado a la derecha del atajo. */
  hint?: string
  /** Marca la acción como destructiva. */
  destructive?: boolean
}

function MenuItem({ className, icon: Icon, leading, shortcut, hint, destructive, children, ...props }: MenuItemProps) {
  return (
    <MenuPrimitive.Item {...props} className={cn('cf-menu__item', destructive && 'cf-menu__item--destructive', className)}>
      {Icon ? <Icon className="cf-menu__icon" aria-hidden="true" /> : null}
      {leading}
      <span className="cf-menu__label">{children}</span>
      {hint ? <span className="cf-menu__hint">{hint}</span> : null}
      {shortcut ? <kbd className="cf-menu__shortcut">{shortcut}</kbd> : null}
    </MenuPrimitive.Item>
  )
}

interface MenuRadioItemProps extends ComponentProps<typeof MenuPrimitive.RadioItem> {
  icon?: LucideIcon
  leading?: ReactNode
}

function MenuRadioItem({ className, icon: Icon, leading, children, ...props }: MenuRadioItemProps) {
  return (
    <MenuPrimitive.RadioItem {...props} className={cn('cf-menu__item cf-menu__item--radio', className)}>
      <MenuPrimitive.RadioItemIndicator className="cf-menu__check" aria-hidden="true">
        <Check />
      </MenuPrimitive.RadioItemIndicator>
      {Icon ? <Icon className="cf-menu__icon" aria-hidden="true" /> : null}
      {leading}
      <span className="cf-menu__label">{children}</span>
    </MenuPrimitive.RadioItem>
  )
}

interface MenuSwatchItemProps extends ComponentProps<typeof MenuPrimitive.RadioItem> {
  /** Muestra una muestra de color en lugar de un glifo. */
  swatch: string
}

function MenuSwatchItem({ className, swatch, children, ...props }: MenuSwatchItemProps) {
  return (
    <MenuPrimitive.RadioItem {...props} className={cn('cf-menu__item cf-menu__item--radio', className)}>
      <MenuPrimitive.RadioItemIndicator className="cf-menu__check" aria-hidden="true">
        <Check />
      </MenuPrimitive.RadioItemIndicator>
      <span className="cf-menu__swatch" style={{ backgroundColor: swatch }} aria-hidden="true" />
      <span className="cf-menu__label">{children}</span>
    </MenuPrimitive.RadioItem>
  )
}

export {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSwatchItem,
  MenuTrigger,
}

export type { ReactNode }
