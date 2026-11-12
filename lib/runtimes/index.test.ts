import { describe, expect, it } from 'vitest'

import { SUPPORTED_LANGUAGES } from '@/lib/languages'
import { BROWSER_RUNTIMES, getBrowserRuntime, isRunnableInBrowser } from './index'
import { RUNTIME_ASSETS } from './assets'

describe('registro de runtimes del navegador', () => {
  it('da un motor a todos los lenguajes', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(isRunnableInBrowser(language), language).toBe(true)
      expect(getBrowserRuntime(language)?.label, language).toBeTruthy()
    }
  })

  it('no tiene motores de más', () => {
    for (const language of Object.keys(BROWSER_RUNTIMES)) {
      expect(SUPPORTED_LANGUAGES).toContain(language)
    }
  })

  it('declara los archivos que descarga cada motor pesado', () => {
    const pesados = ['python', 'lua', 'go', 'c', 'cpp', 'java', 'rust']
    for (const language of pesados) {
      const assets = RUNTIME_ASSETS[language as keyof typeof RUNTIME_ASSETS]
      expect(assets, language).toBeDefined()
      expect(assets?.length, language).toBeGreaterThan(0)
      for (const asset of assets ?? []) {
        expect(asset.label, language).toBeTruthy()
      }
    }
  })
})
