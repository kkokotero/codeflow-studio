'use client'

import { useEffect, useState } from 'react'
import {
  argbFromHex,
  hexFromArgb,
  Hct,
  SchemeExpressive,
} from '@material/material-color-utilities'

import { Button } from '@/components/ui/button'
import {
  Menu,
  MenuContent,
  MenuGroupLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSwatchItem,
  MenuTrigger,
} from '@/components/ui/menu'
import { APP_ICONS } from '@/components/codeflow/app-icons'

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

    root.dataset.themeMode = mode
    root.dataset.colorScheme = isDark ? 'dark' : 'light'
    root.style.colorScheme = isDark ? 'dark' : 'light'
    root.classList.toggle('dark', isDark)
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

interface AppearanceMenuProps {
  mode: ColorMode
  seed: string
  isDark: boolean
  onModeChange: (mode: ColorMode) => void
  onSeedChange: (seed: string) => void
}

/**
 * Botón de apariencia: un solo control para el tema y la paleta, en lugar de
 * un selector, cuatro muestras y un campo de color sueltos en la barra.
 */
export function AppearanceMenu({ mode, seed, isDark, onModeChange, onSeedChange }: AppearanceMenuProps) {
  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="ghost" size="icon-sm" />}
        className="cf-icon-button"
        aria-label="Apariencia: tema y paleta"
        title="Apariencia"
      >
        <APP_ICONS.appearance aria-hidden="true" />
      </MenuTrigger>
      <MenuContent align="end" className="cf-menu--appearance">
        <MenuRadioGroup value={mode} onValueChange={(value) => onModeChange(value as ColorMode)}>
          <MenuGroupLabel>Tema</MenuGroupLabel>
          <MenuRadioItem value="system" icon={APP_ICONS.appearanceSystem}>Automático</MenuRadioItem>
          <MenuRadioItem value="light" icon={APP_ICONS.appearanceLight}>Claro</MenuRadioItem>
          <MenuRadioItem value="dark" icon={APP_ICONS.appearanceDark}>Oscuro</MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuRadioGroup value={seed} onValueChange={(value) => onSeedChange(String(value))}>
          <MenuGroupLabel>Paleta</MenuGroupLabel>
          {COLOR_PRESETS.map((preset) => (
            <MenuSwatchItem key={preset.seed} value={preset.seed} swatch={accentFor(preset.seed, isDark)}>
              {preset.name}
            </MenuSwatchItem>
          ))}
          <label className="cf-menu__item cf-menu__item--color">
            <input
              type="color"
              value={seed}
              onChange={(event) => onSeedChange(event.target.value)}
              aria-label="Color de origen personalizado"
            />
            <span className="cf-menu__label">Color personalizado…</span>
          </label>
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}
