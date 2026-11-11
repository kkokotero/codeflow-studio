'use client'

import { useEffect, useMemo, useState } from 'react'

import { APP_ICONS } from '@/components/codeflow/app-icons'
import { Button } from '@/components/ui/button'
import {
  PSEUDO_FORM_LABELS,
  PSEUDO_FORM_SHAPES,
  buildSourceLine,
  pseudoText,
} from '@/lib/pseudo-code'
import type { Language, PseudoForm, PseudoInstruction } from '@/lib/codeflow-types'

type Shape = 'process' | 'decision' | 'input-output' | 'terminator'
type Field = 'target' | 'value' | 'name'

/** Formas que se pueden elegir desde cada forma: el flujo cambia de silueta. */
const FORM_CHOICES: Record<PseudoForm, PseudoForm[]> = {
  assign: ['assign', 'print', 'call'],
  call: ['call', 'print', 'assign'],
  print: ['print', 'assign', 'call'],
  read: ['read', 'print', 'assign'],
  return: ['return', 'call'],
  throw: ['throw', 'call'],
  import: ['import', 'call'],
  define: ['define'],
  class: ['class'],
  condition: ['condition'],
  loop: ['loop'],
  break: [],
  continue: [],
  statement: ['statement', 'call', 'print', 'assign'],
}

/** Campos que se rellenan en cada forma. */
const FORM_FIELDS: Record<PseudoForm, Field[]> = {
  assign: ['target', 'value'],
  call: ['name', 'value'],
  print: ['value'],
  read: ['target'],
  return: ['value'],
  throw: ['value'],
  import: ['name'],
  define: ['name'],
  class: ['name'],
  condition: ['value'],
  loop: ['value'],
  break: [],
  continue: [],
  statement: ['value'],
}

const FIELD_LABELS: Record<PseudoForm, Partial<Record<Field, string>>> = {
  assign: { target: 'Destino', value: 'Valor' },
  call: { name: 'Función', value: 'Argumentos' },
  print: { value: 'Valor a imprimir' },
  read: { target: 'Destino' },
  return: { value: 'Valor a devolver' },
  throw: { value: 'Error' },
  import: { name: 'Módulo' },
  define: { name: 'Nombre' },
  class: { name: 'Tipo' },
  condition: { value: 'Condición' },
  loop: { value: 'Condición' },
  break: {},
  continue: {},
  statement: { value: 'Instrucción' },
}

/** Silueta de una forma, dibujada con la misma geometría del lienzo. */
function ShapePreview({ shape }: { shape: Shape }) {
  return (
    <svg className="cf-flow-shape" viewBox="0 0 40 28" aria-hidden="true">
      {shape === 'decision' && <polygon points="20,2 38,14 20,26 2,14" />}
      {shape === 'input-output' && <polygon points="7,2 38,2 33,26 2,26" />}
      {shape === 'terminator' && <rect x="2" y="5" width="36" height="18" rx="9" />}
      {shape === 'process' && <rect x="2" y="5" width="36" height="18" rx="4" />}
    </svg>
  )
}

/** Instruction inicial para una forma nueva, heredando lo que ya se sabe. */
function nextInstruction(form: PseudoForm, current: PseudoInstruction): PseudoInstruction {
  const value = current.value ?? ''
  const target = current.target ?? ''
  const name = current.name ?? ''
  switch (form) {
    case 'assign':
      return { form, target: target || 'valor', value: value || '0', operator: current.operator ?? '=' }
    case 'print':
      return { form, name: name || 'salida', value: value || target || 'valor' }
    case 'read':
      return { form, name: name || 'entrada', target: target || 'valor' }
    case 'call':
      return { form, name: name || 'función', value }
    case 'return':
      return { form, value }
    case 'throw':
      return { form, value: value || 'error' }
    case 'import':
      return { form, name: name || 'módulo' }
    case 'define':
      return { form, name: name || 'función' }
    case 'class':
      return { form, name: name || 'tipo' }
    case 'condition':
    case 'loop':
      return { form, value: value || 'condición' }
    default:
      return { form, value }
  }
}

interface FlowNodeEditorProps {
  /** La instrucción del nodo con el vocabulario común. */
  pseudo: PseudoInstruction | undefined
  /** Texto del nodo en el diagrama. */
  label: string
  /** Nombre legible del tipo de nodo. */
  kindLabel: string
  language: Language
  line: number
  detail: string
  /** Línea original del archivo, tal y como está ahora. */
  originalLine: string
  readOnly: boolean
  conflicted: boolean
  onApply: (line: string) => void
  onClose: () => void
  onReloadLine: () => void
}

/**
 * Editor visual del nodo seleccionado.
 *
 * En vez de enseñar la línea de código, muestra la forma de la instrucción con
 * su silueta y sus campos: destino, valor, condición o argumentos. Al aplicar,
 * la instrucción se reconstruye en el lenguaje del archivo y el diagrama se
 * vuelve a dibujar con el nuevo pseudo-código.
 */
export function FlowNodeEditor({
  pseudo,
  label,
  kindLabel,
  language,
  line,
  detail,
  originalLine,
  readOnly,
  conflicted,
  onApply,
  onClose,
  onReloadLine,
}: FlowNodeEditorProps) {
  const [form, setForm] = useState<PseudoForm>(pseudo?.form ?? 'statement')
  const [target, setTarget] = useState(pseudo?.target ?? '')
  const [value, setValue] = useState(pseudo?.value ?? '')
  const [name, setName] = useState(pseudo?.name ?? '')
  const [showSource, setShowSource] = useState(false)
  const [sourceEdit, setSourceEdit] = useState(originalLine)

  useEffect(() => {
    setForm(pseudo?.form ?? 'statement')
    setTarget(pseudo?.target ?? '')
    setValue(pseudo?.value ?? '')
    setName(pseudo?.name ?? '')
    setSourceEdit(originalLine)
    setShowSource(false)
  }, [pseudo, originalLine])

  const instruction = useMemo<PseudoInstruction>(() => ({
    form,
    target: target || undefined,
    value: value || undefined,
    name: name || undefined,
    type: pseudo?.type,
    operator: pseudo?.operator,
  }), [form, name, pseudo?.operator, pseudo?.type, target, value])

  const choices = FORM_CHOICES[pseudo?.form ?? 'statement']
  const fields = FORM_FIELDS[form]
  const preview = pseudoText(instruction)
  const generated = useMemo(
    () => buildSourceLine(language, instruction, originalLine),
    [instruction, language, originalLine],
  )

  const chooseForm = (next: PseudoForm) => {
    const base = nextInstruction(next, instruction)
    setForm(next)
    setTarget(base.target ?? '')
    setValue(base.value ?? '')
    setName(base.name ?? '')
  }

  return (
    <div className="cf-node-inspector">
      <div className="cf-pane-header">
        <h2 className="cf-pane-title"><APP_ICONS.flow aria-hidden="true" />Editar flujo</h2>
        <Button variant="ghost" size="icon-xs" aria-label="Cerrar inspector de nodo" title="Cerrar" onClick={onClose}>
          <APP_ICONS.close aria-hidden="true" />
        </Button>
      </div>

      <div className="cf-node-inspector__body">
        <div className="cf-node-inspector__head">
          <span className="cf-chip">{kindLabel}</span>
          <span className="cf-node-inspector__meta">Línea {line} · {detail}</span>
        </div>

        <div className="cf-flow-preview">
          <ShapePreview shape={PSEUDO_FORM_SHAPES[form]} />
          <div>
            <span className="cf-flow-preview__label">Pseudo-código</span>
            <code className="cf-flow-preview__code">{preview}</code>
          </div>
        </div>

        {choices.length > 1 && (
          <fieldset className="cf-field">
            <legend className="cf-field__label">Forma de la instrucción</legend>
            <div className="cf-flow-forms">
              {choices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={`cf-flow-form ${form === choice ? 'is-active' : ''}`}
                  aria-pressed={form === choice}
                  onClick={() => chooseForm(choice)}
                  disabled={readOnly}
                >
                  <ShapePreview shape={PSEUDO_FORM_SHAPES[choice]} />
                  <span>{PSEUDO_FORM_LABELS[choice]}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {fields.length > 0 && (
          <div className="cf-flow-fields">
            {fields.map((field) => (
              <label className="cf-field" key={field}>
                <span className="cf-field__label">{FIELD_LABELS[form]?.[field] ?? field}</span>
                <input
                  className="cf-field__input cf-field__input--code"
                  value={field === 'target' ? target : field === 'name' ? name : value}
                  onChange={(event) => {
                    const next = event.target.value
                    if (field === 'target') setTarget(next)
                    else if (field === 'name') setName(next)
                    else setValue(next)
                  }}
                  spellCheck={false}
                  readOnly={readOnly}
                />
              </label>
            ))}
          </div>
        )}

        {readOnly ? (
          <p className="cf-node-inspector__note">Este snapshot es de solo lectura.</p>
        ) : conflicted ? (
          <div className="cf-conflict" role="alert">
            <span>El editor modificó esta línea desde que abriste el nodo.</span>
            <Button variant="ghost" size="sm" onClick={onReloadLine}>Cargar línea actual</Button>
          </div>
        ) : null}

        <div className="cf-node-inspector__actions">
          <Button
            variant="default"
            size="sm"
            onClick={() => generated && onApply(generated)}
            disabled={readOnly || !generated}
          >
            <APP_ICONS.apply aria-hidden="true" />
            Aplicar al código
          </Button>
          {generated ? (
            <code className="cf-node-inspector__generated">{generated}</code>
          ) : (
            <p className="cf-node-inspector__note">
              Esta forma no se puede traducir al lenguaje del archivo: usa la línea original.
            </p>
          )}
        </div>

        <button
          type="button"
          className="cf-node-inspector__toggle"
          aria-expanded={showSource}
          onClick={() => setShowSource((current) => !current)}
        >
          {showSource ? 'Ocultar' : 'Editar'} la línea original
        </button>
        {showSource && (
          <label className="cf-field">
            <span className="cf-field__label">Línea de origen</span>
            <textarea
              className="cf-field__input cf-field__input--code"
              value={sourceEdit}
              onChange={(event) => setSourceEdit(event.target.value)}
              rows={3}
              spellCheck={false}
              readOnly={readOnly}
            />
            <Button variant="outline" size="sm" onClick={() => onApply(sourceEdit)} disabled={readOnly}>
              Aplicar la línea
            </Button>
          </label>
        )}
      </div>
    </div>
  )
}
