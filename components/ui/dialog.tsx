'use client'

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTitle = DialogPrimitive.Title
const DialogDescription = DialogPrimitive.Description

function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Popup> & { children?: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="cf-dialog__backdrop" />
      <DialogPrimitive.Popup {...props} className={cn('cf-dialog', className)}>
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

export { Dialog, DialogContent, DialogDescription, DialogTitle }
