/**
 * Paleta compartida por el editor de código y la terminal.
 *
 * Los dos leen los mismos roles de color del esquema activo: así el código y
 * su salida comparten el mismo color, sea cual sea la paleta elegida.
 */

export interface AppPalette {
  /** Fondo del lienzo de código y de la terminal. */
  canvas: string
  /** Fondo de las superficies elevadas. */
  raised: string
  /** Color del texto principal. */
  text: string
  /** Color del texto secundario. */
  muted: string
  /** Color del texto terciario. */
  subtle: string
  /** Color de acento. */
  primary: string
  /** Contenedor de acento. */
  primaryContainer: string
  /** Texto sobre el contenedor de acento. */
  onPrimaryContainer: string
  /** Color terciario del esquema. */
  tertiary: string
  /** Contenedor terciario. */
  tertiaryContainer: string
  /** Color secundario del esquema. */
  secondary: string
  /** Contenedor secundario. */
  secondaryContainer: string
  /** Color de error. */
  error: string
  /** Contenedor de error. */
  errorContainer: string
  /** Color del contorno. */
  outline: string
  /** Variante suave del contorno. */
  outlineVariant: string
}

const FALLBACK: AppPalette = {
  canvas: '#0e1212',
  raised: '#141a1a',
  text: '#dde4e0',
  muted: '#9aa7a1',
  subtle: '#6d7976',
  primary: '#a6d68a',
  primaryContainer: '#2c3a22',
  onPrimaryContainer: '#d7e8c8',
  tertiary: '#e0c08a',
  tertiaryContainer: '#cfc0e8',
  secondary: '#9fc6b2',
  secondaryContainer: '#a9c4b8',
  error: '#e8a9a4',
  errorContainer: '#45292a',
  outline: '#5c6866',
  outlineVariant: '#333d3b',
}

/** Lee un color del esquema activo; si no es un hexadecimal, usa el respaldo. */
function read(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim()
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
}

/**
 * Lee la paleta activa del documento.
 *
 * Devuelve colores con almohadilla, listos para el editor y para la terminal.
 */
export function readAppPalette(): AppPalette {
  if (typeof document === 'undefined') return FALLBACK
  const styles = getComputedStyle(document.documentElement)
  return {
    canvas: read(styles, '--md-sys-color-surface-container-lowest', FALLBACK.canvas),
    raised: read(styles, '--md-sys-color-surface-container-low', FALLBACK.raised),
    text: read(styles, '--md-sys-color-on-surface', FALLBACK.text),
    muted: read(styles, '--md-sys-color-on-surface-variant', FALLBACK.muted),
    subtle: read(styles, '--md-sys-color-outline', FALLBACK.subtle),
    primary: read(styles, '--md-sys-color-primary', FALLBACK.primary),
    primaryContainer: read(styles, '--md-sys-color-primary-container', FALLBACK.primaryContainer),
    onPrimaryContainer: read(styles, '--md-sys-color-on-primary-container', FALLBACK.onPrimaryContainer),
    tertiary: read(styles, '--md-sys-color-tertiary', FALLBACK.tertiary),
    tertiaryContainer: read(styles, '--md-sys-color-tertiary-container', FALLBACK.tertiaryContainer),
    secondary: read(styles, '--md-sys-color-secondary', FALLBACK.secondary),
    secondaryContainer: read(styles, '--md-sys-color-secondary-container', FALLBACK.secondaryContainer),
    error: read(styles, '--md-sys-color-error', FALLBACK.error),
    errorContainer: read(styles, '--md-sys-color-error-container', FALLBACK.errorContainer),
    outline: read(styles, '--md-sys-color-outline', FALLBACK.outline),
    outlineVariant: read(styles, '--md-sys-color-outline-variant', FALLBACK.outlineVariant),
  }
}

/** Convierte un color con almohadilla en el formato que usa el editor. */
export function withoutHash(color: string): string {
  return color.replace(/^#/, '')
}

/** Mezcla un color con alfa, como `#a6d68a` + `44` → `#a6d68a44`. */
export function withAlpha(color: string, alpha: string): string {
  return `${color}${alpha}`
}
