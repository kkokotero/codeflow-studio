'use client'

import { useEffect, useState } from 'react'
import {
  argbFromHex,
  hexFromArgb,
  Hct,
  SchemeExpressive,
} from '@material/material-color-utilities'

type ColorMode = 'system' | 'light' | 'dark'

const colorPresets = [
  { name: 'Menta', value: '#83bfa0' },
  { name: 'Azul', value: '#6e9cf0' },
  { name: 'Coral', value: '#e49a78' },
  { name: 'Lavanda', value: '#b28adf' },
]

function setColorToken(name: string, value: number) {
  document.documentElement.style.setProperty(name, hexFromArgb(value))
}

export function useMaterialTheme() {
  const [mode, setMode] = useState<ColorMode>('system')
  const [seed, setSeed] = useState(colorPresets[0].value)
  const [systemPrefersDark, setSystemPrefersDark] = useState(true)
  const isDark = mode === 'dark' || (mode === 'system' && systemPrefersDark)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemPreference = () => setSystemPrefersDark(mediaQuery.matches)
    updateSystemPreference()
    mediaQuery.addEventListener('change', updateSystemPreference)
    return () => mediaQuery.removeEventListener('change', updateSystemPreference)
  }, [])

  useEffect(() => {
    const source = argbFromHex(seed)
    const expressiveLight = new SchemeExpressive(Hct.fromInt(source), false, 0)
    const expressiveDark = new SchemeExpressive(Hct.fromInt(source), true, 0)
    const scheme = isDark ? expressiveDark : expressiveLight
    const root = document.documentElement
    root.style.setProperty('--theme-seed', seed)
    const materialRoles: Record<string, number> = {
      '--md-sys-color-background': scheme.background,
      '--md-sys-color-on-background': scheme.onBackground,
      '--md-sys-color-surface': scheme.surface,
      '--md-sys-color-on-surface': scheme.onSurface,
      '--md-sys-color-surface-variant': scheme.surfaceVariant,
      '--md-sys-color-on-surface-variant': scheme.onSurfaceVariant,
      '--md-sys-color-surface-container-low': scheme.surfaceContainerLow,
      '--md-sys-color-surface-container': scheme.surfaceContainer,
      '--md-sys-color-surface-container-high': scheme.surfaceContainerHigh,
      '--md-sys-color-surface-container-highest': scheme.surfaceContainerHighest,
      '--md-sys-color-primary': scheme.primary,
      '--md-sys-color-on-primary': scheme.onPrimary,
      '--md-sys-color-primary-container': scheme.primaryContainer,
      '--md-sys-color-secondary': scheme.secondary,
      '--md-sys-color-secondary-container': scheme.secondaryContainer,
      '--md-sys-color-on-secondary-container': scheme.onSecondaryContainer,
      '--md-sys-color-tertiary': scheme.tertiary,
      '--md-sys-color-tertiary-container': scheme.tertiaryContainer,
      '--md-sys-color-on-tertiary-container': scheme.onTertiaryContainer,
      '--md-sys-color-error': scheme.error,
      '--md-sys-color-outline': scheme.outline,
      '--md-sys-color-outline-variant': scheme.outlineVariant,
    }

    Object.entries(materialRoles).forEach(([name, value]) => setColorToken(name, value))

    setColorToken('--background', scheme.background)
    setColorToken('--foreground', scheme.onBackground)
    setColorToken('--card', scheme.surface)
    setColorToken('--card-foreground', scheme.onSurface)
    setColorToken('--popover', scheme.surfaceContainerHigh)
    setColorToken('--popover-foreground', scheme.onSurface)
    setColorToken('--primary', scheme.primary)
    setColorToken('--primary-foreground', scheme.onPrimary)
    setColorToken('--secondary', scheme.secondaryContainer)
    setColorToken('--secondary-foreground', scheme.onSecondaryContainer)
    setColorToken('--muted', scheme.surfaceContainerLow)
    setColorToken('--muted-foreground', scheme.onSurfaceVariant)
    setColorToken('--accent', scheme.tertiaryContainer)
    setColorToken('--accent-foreground', scheme.onTertiaryContainer)
    setColorToken('--destructive', scheme.error)
    setColorToken('--border', scheme.outlineVariant)
    setColorToken('--input', scheme.outline)
    setColorToken('--ring', scheme.primary)
    setColorToken('--panel', scheme.surfaceContainer)
    setColorToken('--panel-raised', scheme.surfaceContainerHigh)
    setColorToken('--panel-hover', scheme.surfaceContainerHighest)
    setColorToken('--line', scheme.outlineVariant)
    setColorToken('--line-soft', scheme.surfaceContainerLow)
    setColorToken('--text', scheme.onSurface)
    setColorToken('--subtle', scheme.outline)
    setColorToken('--lime', scheme.primary)
    setColorToken('--node-function', scheme.primary)
    setColorToken('--node-variable', scheme.secondary)
    setColorToken('--node-condition', scheme.tertiary)
    setColorToken('--node-loop', scheme.primaryContainer)
    setColorToken('--node-class', scheme.tertiaryContainer)
    setColorToken('--node-call', scheme.secondary)
    setColorToken('--node-return', scheme.error)
    setColorToken('--node-import', scheme.outline)
    setColorToken('--node-statement', scheme.onSurfaceVariant)
    setColorToken('--node-operation', scheme.secondary)
    setColorToken('--node-phase', scheme.tertiary)

    root.dataset.themeMode = mode
    root.dataset.colorScheme = isDark ? 'dark' : 'light'
    root.style.colorScheme = isDark ? 'dark' : 'light'
    root.classList.toggle('dark', isDark)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hexFromArgb(scheme.surface))
  }, [isDark, mode, seed])

  return { mode, setMode, seed, setSeed, isDark }
}

interface ColorThemeControlsProps {
  mode: ColorMode
  seed: string
  onModeChange: (mode: ColorMode) => void
  onSeedChange: (seed: string) => void
}

export function ColorThemeControls({ mode, seed, onModeChange, onSeedChange }: ColorThemeControlsProps) {
  return (
    <div className="theme-controls" role="group" aria-label="Apariencia">
      <label className="sr-only" htmlFor="color-mode">Modo de color</label>
      <select id="color-mode" aria-label="Modo de color" value={mode} onChange={(event) => onModeChange(event.target.value as ColorMode)}>
        <option value="system">Sistema</option>
        <option value="light">Claro</option>
        <option value="dark">Oscuro</option>
      </select>
      <div className="theme-presets" role="group" aria-label="Paletas dinámicas">
        {colorPresets.map((preset) => (
          <button
            key={preset.value}
            className="theme-preset"
            type="button"
            aria-label={`Usar paleta ${preset.name}`}
            aria-pressed={seed === preset.value}
            title={`Paleta ${preset.name}`}
            onClick={() => onSeedChange(preset.value)}
          >
            <span style={{ backgroundColor: preset.value }} />
          </button>
        ))}
      </div>
      <label className="theme-color-picker" title="Color de origen personalizado">
        <span className="sr-only">Color de origen personalizado</span>
        <input aria-label="Color de origen personalizado" type="color" value={seed} onChange={(event) => onSeedChange(event.target.value)} />
      </label>
    </div>
  )
}
