import type { Language } from './codeflow-types'
import { isLanguage } from './languages'

export type AchievementCategory = 'Código' | 'Ejecución' | 'Exploración' | 'Constancia' | 'Construcción' | 'Dominio'
export type AchievementDifficulty = 'Inicial' | 'Fácil' | 'Intermedio' | 'Avanzado' | 'Experto'

export interface AchievementStats {
  hasWrittenCode: boolean
  successfulRuns: number
  consecutiveSuccessfulRuns: number
  hadFailedRun: boolean
  editedAfterFailure: boolean
  hasFixedError: boolean
  hasHelloWorld: boolean
  languagesUsed: Language[]
  hasExploredFeature: boolean
  hasExploredDiagram: boolean
  hasCreatedFile: boolean
  hasBuiltProgram: boolean
  hasUsedLoop: boolean
  hasRefinedProgram: boolean
  hasRunAfterRefinement: boolean
  hasAdvancedProgram: boolean
  largestProgramNodeCount: number
  largestAdvancedProgramNodeCount: number
}

export interface AchievementProfile {
  id: string
  name: string
  createdAt: number
  xp: number
  unlocked: Record<string, number>
  stats: AchievementStats
}

export interface AchievementProgress {
  current: number
  target: number
}

export interface AchievementDefinition {
  id: string
  name: string
  description: string
  hint: string
  condition: string
  category: AchievementCategory
  difficulty: AchievementDifficulty
  xp: number
  icon: string
  progress: (stats: AchievementStats) => AchievementProgress
  isComplete: (stats: AchievementStats) => boolean
}

export type AchievementActivity =
  | { type: 'edit'; code: string }
  | { type: 'run-failure' }
  | { type: 'run-success'; language: Language; output: string; nodeCount: number; nodeKinds: string[] }
  | { type: 'explore'; feature: 'diagram' | 'file' | 'language' }

const progress = (current: number, target: number): AchievementProgress => ({ current: Math.min(current, target), target })
const reached = (current: number, target: number) => current >= target

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'first-line', name: 'Primeros pasos', description: 'Escribe tu primera línea de código.', hint: 'Cambia algo en el editor; puede ser tan simple como una variable.', condition: 'Escribir código en el editor.', category: 'Código', difficulty: 'Inicial', xp: 10, icon: 'Code2', progress: (stats) => progress(Number(stats.hasWrittenCode), 1), isComplete: (stats) => stats.hasWrittenCode },
  { id: 'first-run', name: 'En marcha', description: 'Ejecuta un programa sin errores.', hint: 'Pulsa Ejecutar y revisa la consola para ver el resultado.', condition: 'Completar una ejecución correctamente.', category: 'Ejecución', difficulty: 'Inicial', xp: 20, icon: 'Play', progress: (stats) => progress(stats.successfulRuns, 1), isComplete: (stats) => reached(stats.successfulRuns, 1) },
  { id: 'hello-world', name: 'Hello, World!', description: 'Muestra el saludo clásico en la consola.', hint: 'Prueba console.log en JavaScript o print en Python.', condition: 'Una ejecución correcta debe imprimir «Hello, World!».', category: 'Ejecución', difficulty: 'Fácil', xp: 30, icon: 'MessageCircleCode', progress: (stats) => progress(Number(stats.hasHelloWorld), 1), isComplete: (stats) => stats.hasHelloWorld },
  { id: 'explorer', name: 'Explorador', description: 'Descubre una herramienta del estudio.', hint: 'Abre un nodo del diagrama, cambia de lenguaje o crea otro archivo.', condition: 'Usar una función de exploración del estudio.', category: 'Exploración', difficulty: 'Fácil', xp: 20, icon: 'Compass', progress: (stats) => progress(Number(stats.hasExploredFeature), 1), isComplete: (stats) => stats.hasExploredFeature },
  { id: 'analyst', name: 'Lector de flujos', description: 'Inspecciona un nodo del diagrama de flujo.', hint: 'Selecciona cualquier bloque del diagrama para ver su línea de origen.', condition: 'Seleccionar un nodo del diagrama.', category: 'Exploración', difficulty: 'Fácil', xp: 25, icon: 'GitBranch', progress: (stats) => progress(Number(stats.hasExploredDiagram), 1), isComplete: (stats) => stats.hasExploredDiagram },
  { id: 'debugger', name: 'Solucionador', description: 'Recupérate de un error y vuelve a ejecutar con éxito.', hint: 'Provoca o encuentra un error, corrige el código y vuelve a ejecutarlo.', condition: 'Tras una ejecución fallida, editar el código y completar una ejecución correcta.', category: 'Ejecución', difficulty: 'Intermedio', xp: 40, icon: 'Bug', progress: (stats) => progress(Number(stats.hasFixedError), 1), isComplete: (stats) => stats.hasFixedError },
  { id: 'steady', name: 'Constancia', description: 'Completa tres ejecuciones correctas seguidas.', hint: 'Cada ejecución correcta consecutiva suma; un error reinicia la racha.', condition: 'Completar 3 ejecuciones correctas consecutivas.', category: 'Constancia', difficulty: 'Intermedio', xp: 45, icon: 'Flame', progress: (stats) => progress(stats.consecutiveSuccessfulRuns, 3), isComplete: (stats) => reached(stats.consecutiveSuccessfulRuns, 3) },
  { id: 'builder', name: 'Constructor', description: 'Crea un programa que produzca una salida útil.', hint: 'Combina varias instrucciones y comprueba su resultado en la consola.', condition: 'Escribir código y ejecutar con éxito un programa de 3 o más nodos que produzca salida.', category: 'Construcción', difficulty: 'Intermedio', xp: 60, icon: 'Hammer', progress: (stats) => progress(Number(stats.hasBuiltProgram), 1), isComplete: (stats) => stats.hasBuiltProgram },
  { id: 'polyglot', name: 'Políglota', description: 'Programa y ejecuta en dos lenguajes distintos.', hint: 'Completa una ejecución correcta en dos lenguajes diferentes.', condition: 'Ejecutar correctamente al menos un programa en cada uno de dos lenguajes.', category: 'Dominio', difficulty: 'Intermedio', xp: 55, icon: 'Languages', progress: (stats) => progress(stats.languagesUsed.length, 2), isComplete: (stats) => stats.languagesUsed.length >= 2 },
  { id: 'loop-maker', name: 'Bucle virtuoso', description: 'Construye y ejecuta correctamente un ciclo.', hint: 'Prueba for o while y observa su representación en el diagrama.', condition: 'Completar una ejecución correcta cuyo flujo contenga un ciclo.', category: 'Construcción', difficulty: 'Avanzado', xp: 65, icon: 'Repeat2', progress: (stats) => progress(Number(stats.hasUsedLoop), 1), isComplete: (stats) => stats.hasUsedLoop },
  { id: 'refactor', name: 'Segunda versión', description: 'Mejora un programa después de ejecutarlo.', hint: 'Tras una ejecución correcta, modifica el código y vuelve a ejecutarlo.', condition: 'Editar código después de una ejecución correcta y luego ejecutar con éxito.', category: 'Código', difficulty: 'Avanzado', xp: 70, icon: 'WandSparkles', progress: (stats) => progress(Number(stats.hasRunAfterRefinement), 1), isComplete: (stats) => stats.hasRunAfterRefinement },
  { id: 'architect', name: 'Arquitecto', description: 'Diseña un flujo de programa amplio y funcional.', hint: 'Combina funciones, decisiones y varias instrucciones en un mismo programa.', condition: 'Escribir código y ejecutar correctamente un programa con 8 o más nodos y una decisión o ciclo.', category: 'Construcción', difficulty: 'Avanzado', xp: 100, icon: 'Blocks', progress: (stats) => progress(stats.largestAdvancedProgramNodeCount, 8), isComplete: (stats) => stats.hasAdvancedProgram },
  { id: 'specialist', name: 'Especialista', description: 'Domina los retos de programación de mayor complejidad.', hint: 'Construye una solución extensa con flujo de control y sigue iterando.', condition: 'Completar 10 ejecuciones correctas y un reto avanzado escrito por ti de 12 o más nodos.', category: 'Dominio', difficulty: 'Experto', xp: 150, icon: 'Trophy', progress: (stats) => progress(Math.min(stats.successfulRuns, stats.largestAdvancedProgramNodeCount >= 12 ? 10 : 9), 10), isComplete: (stats) => stats.successfulRuns >= 10 && stats.largestAdvancedProgramNodeCount >= 12 },
]

export const ACHIEVEMENT_CATEGORIES: AchievementCategory[] = ['Código', 'Ejecución', 'Exploración', 'Constancia', 'Construcción', 'Dominio']

export function createAchievementProfile(name: string, id = crypto.randomUUID()): AchievementProfile {
  return {
    id,
    name: name.trim() || 'Integrante',
    createdAt: Date.now(),
    xp: 0,
    unlocked: {},
    stats: {
      hasWrittenCode: false,
      successfulRuns: 0,
      consecutiveSuccessfulRuns: 0,
      hadFailedRun: false,
      editedAfterFailure: false,
      hasFixedError: false,
      hasHelloWorld: false,
      languagesUsed: [],
      hasExploredFeature: false,
      hasExploredDiagram: false,
      hasCreatedFile: false,
      hasBuiltProgram: false,
      hasUsedLoop: false,
      hasRefinedProgram: false,
      hasRunAfterRefinement: false,
      hasAdvancedProgram: false,
      largestProgramNodeCount: 0,
      largestAdvancedProgramNodeCount: 0,
    },
  }
}

export function isAchievementProfile(value: unknown): value is AchievementProfile {
  if (!value || typeof value !== 'object') return false
  const profile = value as Partial<AchievementProfile>
  const stats = profile.stats
  if (!stats || typeof stats !== 'object') return false
  return typeof profile.id === 'string'
    && typeof profile.name === 'string'
    && typeof profile.createdAt === 'number'
    && typeof profile.xp === 'number'
    && Boolean(profile.unlocked && typeof profile.unlocked === 'object')
    && typeof stats.hasWrittenCode === 'boolean'
    && typeof stats.successfulRuns === 'number'
    && typeof stats.consecutiveSuccessfulRuns === 'number'
    && typeof stats.hadFailedRun === 'boolean'
    && typeof stats.editedAfterFailure === 'boolean'
    && typeof stats.hasFixedError === 'boolean'
    && typeof stats.hasHelloWorld === 'boolean'
    && Array.isArray(stats.languagesUsed)
    && stats.languagesUsed.every((language) => isLanguage(language))
    && typeof stats.hasExploredFeature === 'boolean'
    && typeof stats.hasExploredDiagram === 'boolean'
    && typeof stats.hasCreatedFile === 'boolean'
    && typeof stats.hasBuiltProgram === 'boolean'
    && typeof stats.hasUsedLoop === 'boolean'
    && typeof stats.hasRefinedProgram === 'boolean'
    && typeof stats.hasRunAfterRefinement === 'boolean'
    && typeof stats.hasAdvancedProgram === 'boolean'
    && typeof stats.largestProgramNodeCount === 'number'
    && typeof stats.largestAdvancedProgramNodeCount === 'number'
}

export function recordAchievementActivity(profile: AchievementProfile, activity: AchievementActivity): { profile: AchievementProfile; unlockedIds: string[] } {
  const stats = { ...profile.stats, languagesUsed: [...profile.stats.languagesUsed] }

  if (activity.type === 'edit' && activity.code.trim()) {
    stats.hasWrittenCode = true
    if (stats.hadFailedRun) stats.editedAfterFailure = true
    if (stats.successfulRuns > 0) stats.hasRefinedProgram = true
  }

  if (activity.type === 'run-failure') {
    stats.hadFailedRun = true
    stats.consecutiveSuccessfulRuns = 0
  }

  if (activity.type === 'explore') {
    stats.hasExploredFeature = true
    if (activity.feature === 'diagram') stats.hasExploredDiagram = true
    if (activity.feature === 'file') stats.hasCreatedFile = true
  }

  if (activity.type === 'run-success') {
    stats.successfulRuns += 1
    stats.consecutiveSuccessfulRuns += 1
    if (stats.hasRefinedProgram) stats.hasRunAfterRefinement = true
    if (!stats.languagesUsed.includes(activity.language)) stats.languagesUsed.push(activity.language)
    if (/hello\s*,?\s*world!?/i.test(activity.output)) stats.hasHelloWorld = true
    if (stats.editedAfterFailure) stats.hasFixedError = true
    if (stats.hasWrittenCode && activity.output.trim() && activity.nodeCount >= 3) stats.hasBuiltProgram = true
    if (stats.hasWrittenCode && activity.nodeKinds.includes('loop')) stats.hasUsedLoop = true
    stats.largestProgramNodeCount = Math.max(stats.largestProgramNodeCount, activity.nodeCount)
    if (stats.hasWrittenCode && activity.nodeCount >= 8 && (activity.nodeKinds.includes('condition') || activity.nodeKinds.includes('loop'))) {
      stats.hasAdvancedProgram = true
      stats.largestAdvancedProgramNodeCount = Math.max(stats.largestAdvancedProgramNodeCount, activity.nodeCount)
    }
  }

  const unlocked = { ...profile.unlocked }
  let xp = profile.xp
  const unlockedIds: string[] = []
  for (const achievement of ACHIEVEMENTS) {
    if (!unlocked[achievement.id] && achievement.isComplete(stats)) {
      unlocked[achievement.id] = Date.now()
      xp += achievement.xp
      unlockedIds.push(achievement.id)
    }
  }

  return { profile: { ...profile, xp, unlocked, stats }, unlockedIds }
}

export function getLevelProgress(xp: number) {
  let level = 1
  let earnedAtLevel = Math.max(0, xp)
  let nextLevelXp = 100

  while (earnedAtLevel >= nextLevelXp) {
    earnedAtLevel -= nextLevelXp
    level += 1
    nextLevelXp = 100 + (level - 1) * 50
  }

  return { level, earnedAtLevel, nextLevelXp, progress: Math.min(earnedAtLevel / nextLevelXp, 1) }
}

export function getAchievementStatus(profile: AchievementProfile, achievement: AchievementDefinition) {
  if (profile.unlocked[achievement.id]) return 'unlocked' as const
  const current = achievement.progress(profile.stats)
  return current.current > 0 ? 'in-progress' as const : 'locked' as const
}