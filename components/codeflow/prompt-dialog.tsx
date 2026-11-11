'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { LANGUAGE_DEFINITIONS, SUPPORTED_LANGUAGES, type Language } from '@/lib/languages'

interface NameDialogProps {
  open: boolean
  title: string
  description: string
  label: string
  initialValue: string
  confirmLabel: string
  onClose: () => void
  onConfirm: (value: string) => void
}

/**
 * Diálogo breve para nombrar o renombrar. Un campo, una acción principal y
 * cancelar: sin formularios largos ni decisiones redundantes.
 */
export function NameDialog({
  open,
  title,
  description,
  label,
  initialValue,
  confirmLabel,
  onClose,
  onConfirm,
}: NameDialogProps) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    if (open) setValue(initialValue)
  }, [initialValue, open])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="cf-dialog--prompt">
        <DialogTitle className="cf-dialog__title">{title}</DialogTitle>
        <DialogDescription className="cf-dialog__description">{description}</DialogDescription>
        <form
          className="cf-dialog__form"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = value.trim()
            if (trimmed) onConfirm(trimmed)
          }}
        >
          <label className="cf-field">
            <span className="cf-field__label">{label}</span>
            <input
              className="cf-field__input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
              spellCheck={false}
            />
          </label>
          <div className="cf-dialog__actions">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant="default" size="sm" disabled={!value.trim()}>{confirmLabel}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface NewFileDialogProps {
  open: boolean
  initialLanguage: Language
  onClose: () => void
  onConfirm: (name: string, language: Language) => void
}

/**
 * Alta de archivo: nombre y lenguaje en un solo paso, con la extensión
 * propuesta a partir del lenguaje escolhido.
 */
export function NewFileDialog({ open, initialLanguage, onClose, onConfirm }: NewFileDialogProps) {
  const [name, setName] = useState('')
  const [language, setLanguage] = useState<Language>(initialLanguage)

  useEffect(() => {
    if (open) {
      setName('')
      setLanguage(initialLanguage)
    }
  }, [initialLanguage, open])

  const extension = LANGUAGE_DEFINITIONS[language].extension
  const trimmed = name.trim()
  const withExtension = trimmed && !/\.[^./]+$/.test(trimmed) ? `${trimmed}.${extension}` : trimmed

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="cf-dialog--prompt">
        <DialogTitle className="cf-dialog__title">Nuevo archivo</DialogTitle>
        <DialogDescription className="cf-dialog__description">
          Elige el lenguaje y el nombre. La extensión se añade sola.
        </DialogDescription>
        <form
          className="cf-dialog__form"
          onSubmit={(event) => {
            event.preventDefault()
            if (withExtension) onConfirm(withExtension, language)
          }}
        >
          <label className="cf-field">
            <span className="cf-field__label">Nombre</span>
            <input
              className="cf-field__input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`ejemplo.${extension}`}
              autoFocus
              spellCheck={false}
            />
            {withExtension ? <span className="cf-field__hint">Se guardará como {withExtension}</span> : null}
          </label>
          <fieldset className="cf-field">
            <legend className="cf-field__label">Lenguaje</legend>
            <div className="cf-language-grid">
              {SUPPORTED_LANGUAGES.map((option) => (
                <label key={option} className={`cf-language-option ${language === option ? 'is-active' : ''}`}>
                  <input
                    type="radio"
                    name="cf-new-file-language"
                    value={option}
                    checked={language === option}
                    onChange={() => setLanguage(option)}
                    className="visually-hidden"
                  />
                  <span className={`cf-language-mark cf-language-mark--${option}`}>{LANGUAGE_DEFINITIONS[option].mark}</span>
                  <span>{LANGUAGE_DEFINITIONS[option].label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="cf-dialog__actions">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant="default" size="sm" disabled={!withExtension}>Crear archivo</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
