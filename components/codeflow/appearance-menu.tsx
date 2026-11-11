'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  argbFromHex,
  hexFromArgb,
  Hct,
  SchemeExpressive,
} from '@material/material-color-utilities'
import type { LucideIcon } from 'lucide-react'

import { APP_ICONS } from '@/components/codeflow/app-icons'
import { Button } from '@/components/ui/button'

export type ColorMode = 'system' | 'light' | 'dark'

/**
 * Paletas disponibles. El nombre describe el acento que se ve realmente, no el
 * color de partida: el esquema expresivo desplaza el tono para dar carácter.
 */
export const COLOR_PRESETS = [
  { name: 'Coral', seed: '#83bfa0' },
  { name: 'Verde', seed: '#6e9cf0' },
  { name: 'Índigo', seed: '#e49a78' },
  { name: 'Turquesa', seed: '#b28adf' },
] as const

const MODE_STORAGE_KEY = 'codeflow-appearance-v1'

const MODES: Array<{ id: ColorMode; label: string; icon: LucideIcon }> = [
  { id: 'system', label: 'Automático', icon: APP_ICONS.appearanceSystem },
  { id: 'light', label: 'Claro', icon: APP_ICONS.appearanceLight },
  { id: 'dark', label: 'Oscuro', icon: APP_ICONS.appearanceDark },
]

function setColorToken(name: string, value: number) {
  document.documentElement.style.setProperty(name, hexFromArgb(value))
}

/** Acento que produce una semilla, para mostrarlo como muestra de color. */
function accentFor(seed: string, isDark: boolean): string {
  const scheme = new SchemeExpressive(Hct.fromInt(argbFromHex(seed)), isDark, 0)
  return hexFromArgb(scheme.primary)
}

function readStoredAppearance(): { mode: ColorMode; seed: string } {
  try {
    const raw = window.localStorage.getItem(MODE_STORAGE_KEY)
    if (!raw) return { mode: 'system', seed: COLOR_PRESETS[0].seed }
    const parsed = JSON.parse(raw) as { mode?: unknown; seed?: unknown }
    const mode = parsed.mode === 'light' || parsed.mode === 'dark' || parsed.mode === 'system'
      ? parsed.mode
      : 'system'
    const seed = typeof parsed.seed === 'string' && /^#[0-9a-f]{6}$/i.test(parsed.seed)
      ? parsed.seed
      : COLOR_PRESETS[0].seed
    return { mode, seed }
  } catch {
    return { mode: 'system', seed: COLOR_PRESETS[0].seed }
  }
}

/**
 * Genera el esquema de color con Material 3 Expressive a partir de una única
 * semilla y lo publica como roles `--md-sys-color-*`. Todo el CSS consume
 * esos roles: cambiar la semilla repinta la app completa sin reglas duplicadas.
 */
export function useMaterialTheme() {
  const [appearance, setAppearance] = useState<{ mode: ColorMode; seed: string }>({
    mode: 'system',
    seed: COLOR_PRESETS[0].seed,
  })
  const [systemPrefersDark, setSystemPrefersDark] = useState(true)
  const mode = appearance.mode
  const seed = appearance.seed
  const isDark = mode === 'dark' || (mode === 'system' && systemPrefersDark)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemPreference = () => setSystemPrefersDark(mediaQuery.matches)
    updateSystemPreference()
    mediaQuery.addEventListener('change', updateSystemPreference)
    return () => mediaQuery.removeEventListener('change', updateSystemPreference)
  }, [])

  useEffect(() => {
    setAppearance(readStoredAppearance())
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, JSON.stringify({ mode, seed }))
    } catch {
      // La apariencia es opcional: si no se puede guardar, la sesión sigue igual.
    }
  }, [mode, seed])

  useEffect(() => {
    const source = argbFromHex(seed)
    const expressiveLight = new SchemeExpressive(Hct.fromInt(source), false, 0)
    const expressiveDark = new SchemeExpressive(Hct.fromInt(source), true, 0)
    const scheme = isDark ? expressiveDark : expressiveLight
    const root = document.documentElement
    root.style.setProperty('--theme-seed', seed)

    const materialRoles: Record<string, number> = {
      '--md-sys-color-primary': scheme.primary,
      '--md-sys-color-on-primary': scheme.onPrimary,
      '--md-sys-color-primary-container': scheme.primaryContainer,
      '--md-sys-color-on-primary-container': scheme.onPrimaryContainer,
      '--md-sys-color-inverse-primary': scheme.inversePrimary,
      '--md-sys-color-secondary': scheme.secondary,
      '--md-sys-color-on-secondary': scheme.onSecondary,
      '--md-sys-color-secondary-container': scheme.secondaryContainer,
      '--md-sys-color-on-secondary-container': scheme.onSecondaryContainer,
      '--md-sys-color-tertiary': scheme.tertiary,
      '--md-sys-color-on-tertiary': scheme.onTertiary,
      '--md-sys-color-tertiary-container': scheme.tertiaryContainer,
      '--md-sys-color-on-tertiary-container': scheme.onTertiaryContainer,
      '--md-sys-color-error': scheme.error,
      '--md-sys-color-on-error': scheme.onError,
      '--md-sys-color-error-container': scheme.errorContainer,
      '--md-sys-color-on-error-container': scheme.onErrorContainer,
      '--md-sys-color-background': scheme.background,
      '--md-sys-color-on-background': scheme.onBackground,
      '--md-sys-color-surface': scheme.surface,
      '--md-sys-color-on-surface': scheme.onSurface,
      '--md-sys-color-surface-variant': scheme.surfaceVariant,
      '--md-sys-color-on-surface-variant': scheme.onSurfaceVariant,
      '--md-sys-color-surface-dim': scheme.surfaceDim,
      '--md-sys-color-surface-bright': scheme.surfaceBright,
      '--md-sys-color-surface-container-lowest': scheme.surfaceContainerLowest,
      '--md-sys-color-surface-container-low': scheme.surfaceContainerLow,
      '--md-sys-color-surface-container': scheme.surfaceContainer,
      '--md-sys-color-surface-container-high': scheme.surfaceContainerHigh,
      '--md-sys-color-surface-container-highest': scheme.surfaceContainerHighest,
      '--md-sys-color-outline': scheme.outline,
      '--md-sys-color-outline-variant': scheme.outlineVariant,
      '--md-sys-color-shadow': scheme.shadow,
      '--md-sys-color-scrim': scheme.scrim,
      '--md-sys-color-inverse-surface': scheme.inverseSurface,
      '--md-sys-color-inverse-on-surface': scheme.inverseOnSurface,
    }

    Object.entries(materialRoles).forEach(([name, value]) => setColorToken(name, value))

    // Colores de nodos y flechas en hexadecimal: se resuelven al exportar.
    setColorToken('--node-function', scheme.primary)
    setColorToken('--node-variable', scheme.secondary)
    setColorToken('--node-condition', scheme.tertiary)
    setColorToken('--node-loop', scheme.tertiaryContainer)
    setColorToken('--node-class', scheme.primaryContainer)
    setColorToken('--node-call', scheme.secondaryContainer)
    setColorToken('--node-return', scheme.error)
    setColorToken('--node-import', scheme.outline)
    setColorToken('--node-statement', scheme.onSurfaceVariant)
    setColorToken('--node-operation', scheme.secondary)
    setColorToken('--node-phase', scheme.tertiary)
    setColorToken('--cf-edge-control', scheme.onSurfaceVariant)
    setColorToken('--cf-edge-data', scheme.secondary)
    setColorToken('--cf-edge-true', scheme.primary)
    setColorToken('--cf-edge-false', scheme.error)
    setColorToken('--cf-edge-repeat', scheme.tertiaryContainer)
    setColorToken('--cf-edge-exit', scheme.tertiary)
    setColorToken('--cf-edge-body', scheme.outline)
    setColorToken('--cf-edge-operand', scheme.secondary)
    setColorToken('--cf-edge-case', scheme.tertiary)
    setColorToken('--cf-edge-exception', scheme.error)
    setColorToken('--cf-edge-merge', scheme.outline)
    setColorToken('--cf-edge-unreachable', scheme.outlineVariant)

    root.dataset.themeMode = mode
    root.dataset.colorScheme = isDark ? 'dark' : 'light'
    root.style.colorScheme = isDark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hexFromArgb(scheme.surface))
  }, [isDark, mode, seed])

  return {
    mode,
    setMode: (next: ColorMode) => setAppearance((current) => ({ ...current, mode: next })),
    seed,
    setSeed: (next: string) => setAppearance((current) => ({ ...current, seed: next })),
    isDark,
  }
}

interface Rgb {
  r: number
  g: number
  b: number
}

interface Hsl {
  h: number
  s: number
  l: number
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function hexToRgb(hex: string): Rgb | null {
  const match = hex.replace('#', '').match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)
  if (!match) return null
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) }
}

function rgbToHex({ r, g, b }: Rgb): string {
  const part = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: lightness * 100 }
  const delta = max - min
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hue = 0
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0)
  else if (max === green) hue = (blue - red) / delta + 2
  else hue = (red - green) / delta + 4
  return { h: (hue * 60) % 360, s: saturation * 100, l: lightness * 100 }
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hue = ((h % 360) + 360) % 360
  const saturation = s / 100
  const lightness = l / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const match = lightness - chroma / 2
  const [r, g, b] = hue < 60 ? [chroma, second, 0]
    : hue < 120 ? [second, chroma, 0]
      : hue < 180 ? [0, chroma, second]
        : hue < 240 ? [0, second, chroma]
          : hue < 300 ? [second, 0, chroma]
            : [chroma, 0, second]
  return { r: (r + match) * 255, g: (g + match) * 255, b: (b + match) * 255 }
}

/**
 * Selector de color propio.
 *
 * Área de saturación y valor, tira de tono y campo hexadecimal: el mismo
 * control que usan las herramientas de diseño, dibujado con los tokens de la
 * aplicación en vez del cuadro nativo del sistema.
 */
function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const current = hexToRgb(value) ?? hexToRgb(COLOR_PRESETS[0].seed)!
  const [hue, setHue] = useState(rgbToHsl(current).h)
  const [saturation, setSaturation] = useState(rgbToHsl(current).s)
  const [lightness, setLightness] = useState(rgbToHsl(current).l)

  useEffect(() => {
    const hsl = rgbToHsl(hexToRgb(value) ?? current)
    setHue(hsl.h)
    setSaturation(hsl.s)
    setLightness(hsl.l)
    // Solo cuando cambia el color desde fuera: el selector es la fuente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const preview = rgbToHex(hslToRgb({ h: hue, s: saturation, l: lightness }))

  const commit = (next: Hsl) => {
    setHue(next.h)
    setSaturation(next.s)
    setLightness(next.l)
    onChange(rgbToHex(hslToRgb(next)))
  }

  const pickArea = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.getBoundingClientRect()
    const x = clamp01((event.clientX - rect.left) / rect.width)
    const y = clamp01((event.clientY - rect.top) / rect.height)
    commit({ h: hue, s: x * 100, l: (1 - y) * 100 })
  }

  const pickHue = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.getBoundingClientRect()
    const x = clamp01((event.clientX - rect.left) / rect.width)
    commit({ h: x * 360, s: saturation, l: lightness })
  }

  return (
    <div className="cf-picker">
      <div
        className="cf-picker__area"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hue} 100% 50%)` }}
        role="application"
        aria-label=" Saturación y brillo del color"
        onPointerDown={pickArea}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          const rect = event.currentTarget.getBoundingClientRect()
          const x = clamp01((event.clientX - rect.left) / rect.width)
          const y = clamp01((event.clientY - rect.top) / rect.height)
          commit({ h: hue, s: x * 100, l: (1 - y) * 100 })
        }}
      >
        <span className="cf-picker__cursor" style={{ left: `${saturation}%`, top: `${100 - lightness}%` }} />
      </div>
      <div
        className="cf-picker__hue"
        role="application"
        aria-label="Tono del color"
        onPointerDown={pickHue}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          const rect = event.currentTarget.getBoundingClientRect()
          const x = clamp01((event.clientX - rect.left) / rect.width)
          commit({ h: x * 360, s: saturation, l: lightness })
        }}
      >
        <span className="cf-picker__cursor" style={{ left: `${(hue / 360) * 100}%` }} />
      </div>
      <div className="cf-picker__row">
        <span className="cf-picker__preview" style={{ background: preview }} aria-hidden="true" />
        <input
          className="cf-field__input cf-field__input--code"
          value={preview.toUpperCase()}
          spellCheck={false}
          aria-label="Color hexadecimal"
          onChange={(event) => {
            const next = event.target.value.trim()
            if (!/^#?[\da-f]{6}$/i.test(next)) return
            onChange(next.startsWith('#') ? next.toLowerCase() : `#${next.toLowerCase()}`)
          }}
        />
      </div>
    </div>
  )
}

interface AppearancePanelProps {
  mode: ColorMode
  seed: string
  isDark: boolean
  onModeChange: (mode: ColorMode) => void
  onSeedChange: (seed: string) => void
  /** Devuelve el layout a su estado inicial. */
  onResetLayout: () => void
}

/**
 * Panel de apariencia: tema, paleta y color propio.
 *
 * Es un panel propio y no un menú: el selector de color necesita puntero
 * libre sobre su área, algo que un menú modal no permite.
 */
export function AppearancePanel({
  mode,
  seed,
  isDark,
  onModeChange,
  onSeedChange,
  onResetLayout,
}: AppearancePanelProps) {
  const [open, setOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="cf-appearance" ref={rootRef}>
      <Button
        variant="ghost"
        size="icon-sm"
        className={`cf-icon-button ${open ? 'is-active' : ''}`}
        aria-label="Apariencia: tema y paleta"
        title="Apariencia"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <APP_ICONS.appearance aria-hidden="true" />
      </Button>

      {open && (
        <div className="cf-appearance__panel" role="dialog" aria-label="Apariencia">
          <div className="cf-appearance__group">
            <span className="cf-appearance__label">Tema</span>
            <div className="cf-segmented" role="radiogroup" aria-label="Tema de la aplicación">
              {MODES.map((option) => {
                const Icon = option.icon
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === option.id}
                    className={mode === option.id ? 'is-active' : ''}
                    onClick={() => onModeChange(option.id)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{option.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="cf-appearance__group">
            <span className="cf-appearance__label">Paleta</span>
            <div className="cf-appearance__swatches">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.seed}
                  type="button"
                  className={`cf-swatch ${seed === preset.seed ? 'is-active' : ''}`}
                  aria-label={preset.name}
                  aria-pressed={seed === preset.seed}
                  title={preset.name}
                  onClick={() => onSeedChange(preset.seed)}
                >
                  <span style={{ background: accentFor(preset.seed, isDark) }} />
                </button>
              ))}
              <button
                type="button"
                className={`cf-swatch cf-swatch--custom ${pickerOpen ? 'is-active' : ''}`}
                aria-label="Color personalizado"
                aria-expanded={pickerOpen}
                title="Color personalizado"
                onClick={() => setPickerOpen((current) => !current)}
              >
                <APP_ICONS.appearance aria-hidden="true" />
              </button>
            </div>
            {pickerOpen && <ColorPicker value={seed} onChange={onSeedChange} />}
          </div>

          <div className="cf-appearance__group cf-appearance__group--last">
            <Button variant="ghost" size="sm" className="cf-appearance__reset" onClick={onResetLayout}>
              <APP_ICONS.layout aria-hidden="true" />
              Restablecer el layout
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
