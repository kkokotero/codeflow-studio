import type { Language } from './codeflow-types'
import { LANGUAGE_DEFINITIONS, SUPPORTED_LANGUAGES, isLanguage } from './languages'

export type AchievementCategory = 'Código' | 'Ejecución' | 'Exploración' | 'Constancia' | 'Construcción' | 'Dominio'
export type AchievementDifficulty = 'Inicial' | 'Fácil' | 'Intermedio' | 'Avanzado' | 'Experto'

export interface AchievementStats {
  hasWrittenCode: boolean
  totalEdits: number
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  consecutiveSuccessfulRuns: number
  bestConsecutiveSuccessfulRuns: number
  hadFailedRun: boolean
  editedAfterFailure: boolean
  fixedErrors: number
  hasFixedError: boolean
  hasHelloWorld: boolean
  helloWorldLanguages: Language[]
  languagesUsed: Language[]
  languageSuccessCounts: Partial<Record<Language, number>>
  hasExploredFeature: boolean
  hasExploredDiagram: boolean
  diagramInspections: number
  languageSwitches: number
  hasCreatedFile: boolean
  createdFiles: number
  importedFiles: number
  hasBuiltProgram: boolean
  builtPrograms: number
  loopPrograms: number
  conditionPrograms: number
  hasUsedLoop: boolean
  hasMultipleLoops: boolean
  hasFunction: boolean
  hasClass: boolean
  hasRecursion: boolean
  hasAsync: boolean
  hasErrorHandling: boolean
  hasArray: boolean
  hasObject: boolean
  hasImport: boolean
  hasComment: boolean
  hasSwitch: boolean
  hasArrayMethods: boolean
  hasArrowFunction: boolean
  hasTemplateLiteral: boolean
  hasBoolean: boolean
  hasFunctionProgram: boolean
  hasClassProgram: boolean
  hasRefinedProgram: boolean
  refinementRuns: number
  hasRunAfterRefinement: boolean
  hasAdvancedProgram: boolean
  advancedPrograms: number
  largestProgramNodeCount: number
  largestAdvancedProgramNodeCount: number
  maxLinesOfCode: number
  maxCodeCharacters: number
  outputPrograms: number
  maxOutputLines: number
  maxOutputCharacters: number
  totalOutputLines: number
  hasNumericOutput: boolean
  exports: number
  fileExports: number
  projectExports: number
  diagramExports: number
  snapshotViews: number
  helpOpened: boolean
  consoleClears: number
  inspectorTabsUsed: string[]
  sourceLineEdits: number
  resets: number
  activeDays: string[]
  diagramImageExports: number
  projectArchiveExports: number
  projectsCreated: number
  projectsDeleted: number
  foldersCreated: number
  filesMoved: number
  filesRenamed: number
  filesDuplicated: number
  folderImports: number
  layoutAdjustments: number
  consoleCopies: number
  outputComparisons: number
  symbolNavigations: number
  projectsVisited: number
  emptyWorkspaceVisits: number
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
  | { type: 'run-success'; language: Language; output: string; nodeCount: number; nodeKinds: string[]; code?: string }
  | { type: 'explore'; feature: 'diagram' | 'file' | 'import' | 'language' | 'help' }
  | { type: 'organize'; action: 'folder-created' | 'file-moved' | 'file-renamed' | 'file-duplicated' | 'folder-imported' }
  | { type: 'project'; action: 'created' | 'deleted' | 'visited' | 'archived' | 'empty' }
  | { type: 'console'; action: 'copied' | 'compared' }
  | { type: 'symbol'; action: 'navigated' }
  | { type: 'layout'; action: 'adjusted' }
  | { type: 'inspector'; tab: 'symbols' | 'history' }
  | { type: 'snapshot' }
  | { type: 'export'; target: 'file' | 'project' | 'diagram' }
  | { type: 'export-diagram-image'; format: 'svg' | 'png' }
  | { type: 'export-project-archive'; format: 'codeflow' | 'zip' }
  | { type: 'apply-edit' }
  | { type: 'reset' }
  | { type: 'clear-console' }

const progress = (current: number, target: number): AchievementProgress => ({ current: Math.min(current, target), target })
const reached = (current: number, target: number) => current >= target

export function createAchievementStats(): AchievementStats {
  return {
    hasWrittenCode: false,
    totalEdits: 0,
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    consecutiveSuccessfulRuns: 0,
    bestConsecutiveSuccessfulRuns: 0,
    hadFailedRun: false,
    editedAfterFailure: false,
    fixedErrors: 0,
    hasFixedError: false,
    hasHelloWorld: false,
    helloWorldLanguages: [],
    languagesUsed: [],
    languageSuccessCounts: {},
    hasExploredFeature: false,
    hasExploredDiagram: false,
    diagramInspections: 0,
    languageSwitches: 0,
    hasCreatedFile: false,
    createdFiles: 0,
    importedFiles: 0,
    hasBuiltProgram: false,
    builtPrograms: 0,
    loopPrograms: 0,
    conditionPrograms: 0,
    hasUsedLoop: false,
    hasMultipleLoops: false,
    hasFunction: false,
    hasClass: false,
    hasRecursion: false,
    hasAsync: false,
    hasErrorHandling: false,
    hasArray: false,
    hasObject: false,
    hasImport: false,
    hasComment: false,
    hasSwitch: false,
    hasArrayMethods: false,
    hasArrowFunction: false,
    hasTemplateLiteral: false,
    hasBoolean: false,
    hasFunctionProgram: false,
    hasClassProgram: false,
    hasRefinedProgram: false,
    refinementRuns: 0,
    hasRunAfterRefinement: false,
    hasAdvancedProgram: false,
    advancedPrograms: 0,
    largestProgramNodeCount: 0,
    largestAdvancedProgramNodeCount: 0,
    maxLinesOfCode: 0,
    maxCodeCharacters: 0,
    outputPrograms: 0,
    maxOutputLines: 0,
    maxOutputCharacters: 0,
    totalOutputLines: 0,
    hasNumericOutput: false,
    exports: 0,
    fileExports: 0,
    projectExports: 0,
    diagramExports: 0,
    snapshotViews: 0,
    helpOpened: false,
    consoleClears: 0,
    inspectorTabsUsed: [],
    sourceLineEdits: 0,
    resets: 0,
    activeDays: [],
    diagramImageExports: 0,
    projectArchiveExports: 0,
    projectsCreated: 0,
    projectsDeleted: 0,
    foldersCreated: 0,
    filesMoved: 0,
    filesRenamed: 0,
    filesDuplicated: 0,
    folderImports: 0,
    layoutAdjustments: 0,
    consoleCopies: 0,
    outputComparisons: 0,
    symbolNavigations: 0,
    projectsVisited: 0,
    emptyWorkspaceVisits: 0,
  }
}

function mergeStats(raw: Partial<AchievementStats> | undefined): AchievementStats {
  const defaults = createAchievementStats()
  if (!raw || typeof raw !== 'object') return defaults
  const stats: AchievementStats = { ...defaults, ...raw }
  stats.languagesUsed = Array.isArray(raw.languagesUsed) ? raw.languagesUsed.filter(isLanguage) : []
  stats.helloWorldLanguages = Array.isArray(raw.helloWorldLanguages) ? raw.helloWorldLanguages.filter(isLanguage) : []
  stats.activeDays = Array.isArray(raw.activeDays)
    ? [...new Set(raw.activeDays.filter((day): day is string => typeof day === 'string'))]
    : []
  stats.inspectorTabsUsed = Array.isArray(raw.inspectorTabsUsed)
    ? [...new Set(raw.inspectorTabsUsed.filter((tab): tab is string => typeof tab === 'string'))]
    : []
  const languageSuccessCounts: Partial<Record<Language, number>> = {}
  if (raw.languageSuccessCounts && typeof raw.languageSuccessCounts === 'object') {
    for (const language of SUPPORTED_LANGUAGES) {
      const value = raw.languageSuccessCounts[language]
      if (typeof value === 'number' && Number.isFinite(value)) languageSuccessCounts[language] = value
    }
  }
  stats.languageSuccessCounts = languageSuccessCounts
  return stats
}

type AchievementBase = Omit<AchievementDefinition, 'progress' | 'isComplete'>

interface LadderConfig {
  prefix: string
  category: AchievementCategory
  icon: string
  one: string
  other: string
  value: (stats: AchievementStats) => number
}

interface LadderTier {
  target: number
  name: string
  xp: number
  difficulty: AchievementDifficulty
}

function ladder(config: LadderConfig, tiers: LadderTier[]): AchievementDefinition[] {
  return tiers.map((tier) => {
    const unit = tier.target === 1 ? config.one : config.other
    return {
      id: `${config.prefix}-${tier.target}`,
      name: tier.name,
      description: `Has alcanzado ${tier.target} ${unit}.`,
      hint: `Sigue trabajando hasta llegar a ${tier.target} ${unit}.`,
      condition: `Alcanza ${tier.target} ${unit}.`,
      category: config.category,
      difficulty: tier.difficulty,
      xp: tier.xp,
      icon: config.icon,
      progress: (stats) => progress(config.value(stats), tier.target),
      isComplete: (stats) => reached(config.value(stats), tier.target),
    }
  })
}

function flag(base: AchievementBase, value: (stats: AchievementStats) => boolean): AchievementDefinition {
  return {
    ...base,
    progress: (stats) => progress(Number(value(stats)), 1),
    isComplete: value,
  }
}

function counter(base: AchievementBase, value: (stats: AchievementStats) => number, target: number): AchievementDefinition {
  return {
    ...base,
    progress: (stats) => progress(value(stats), target),
    isComplete: (stats) => reached(value(stats), target),
  }
}

const editTiers = ladder(
  { prefix: 'edits', category: 'Código', icon: 'Code2', one: 'edición', other: 'ediciones', value: (stats) => stats.totalEdits },
  [
    { target: 5, name: 'Primeros trazos', xp: 15, difficulty: 'Fácil' },
    { target: 10, name: 'Teclado caliente', xp: 20, difficulty: 'Fácil' },
    { target: 25, name: 'Editor domado', xp: 30, difficulty: 'Intermedio' },
    { target: 50, name: 'Maratón de código', xp: 45, difficulty: 'Intermedio' },
    { target: 100, name: 'Cien ediciones', xp: 60, difficulty: 'Avanzado' },
    { target: 250, name: 'Tejedor incansable', xp: 100, difficulty: 'Experto' },
  ],
)

const lineTiers = ladder(
  { prefix: 'lines', category: 'Código', icon: 'Ruler', one: 'línea de código', other: 'líneas de código', value: (stats) => stats.maxLinesOfCode },
  [
    { target: 5, name: 'Código compacto', xp: 15, difficulty: 'Fácil' },
    { target: 10, name: 'Estructura legible', xp: 20, difficulty: 'Fácil' },
    { target: 25, name: 'Programa mediano', xp: 30, difficulty: 'Intermedio' },
    { target: 50, name: 'Programa extenso', xp: 45, difficulty: 'Intermedio' },
    { target: 100, name: 'Cien líneas', xp: 70, difficulty: 'Avanzado' },
  ],
)

const characterTiers = ladder(
  { prefix: 'chars', category: 'Código', icon: 'Hash', one: 'carácter de código', other: 'caracteres de código', value: (stats) => stats.maxCodeCharacters },
  [
    { target: 100, name: 'Primer centenar', xp: 15, difficulty: 'Fácil' },
    { target: 500, name: 'Medio millar', xp: 25, difficulty: 'Fácil' },
    { target: 2000, name: 'Dos mil caracteres', xp: 45, difficulty: 'Intermedio' },
    { target: 5000, name: 'Cinco mil caracteres', xp: 75, difficulty: 'Avanzado' },
  ],
)

const successTiers = ladder(
  { prefix: 'successes', category: 'Ejecución', icon: 'Play', one: 'ejecución correcta', other: 'ejecuciones correctas', value: (stats) => stats.successfulRuns },
  [
    { target: 2, name: 'Dos victorias', xp: 15, difficulty: 'Inicial' },
    { target: 3, name: 'Tres ejecuciones', xp: 20, difficulty: 'Fácil' },
    { target: 5, name: 'Cinco victorias', xp: 25, difficulty: 'Fácil' },
    { target: 10, name: 'Diez ejecuciones', xp: 40, difficulty: 'Intermedio' },
    { target: 20, name: 'Veinte ejecuciones', xp: 60, difficulty: 'Intermedio' },
    { target: 30, name: 'Treinta ejecuciones', xp: 80, difficulty: 'Avanzado' },
    { target: 50, name: 'Medio centenar', xp: 110, difficulty: 'Avanzado' },
    { target: 75, name: 'Setenta y cinco', xp: 140, difficulty: 'Experto' },
    { target: 100, name: 'Centurión', xp: 180, difficulty: 'Experto' },
  ],
)

const runTiers = ladder(
  { prefix: 'runs', category: 'Ejecución', icon: 'Gauge', one: 'ejecución', other: 'ejecuciones', value: (stats) => stats.totalRuns },
  [
    { target: 5, name: 'Cinco intentos', xp: 15, difficulty: 'Inicial' },
    { target: 10, name: 'Diez intentos', xp: 25, difficulty: 'Fácil' },
    { target: 25, name: 'Veinticinco intentos', xp: 45, difficulty: 'Intermedio' },
    { target: 50, name: 'Cincuenta intentos', xp: 70, difficulty: 'Avanzado' },
    { target: 100, name: 'Cien intentos', xp: 110, difficulty: 'Experto' },
  ],
)

const failureTiers = ladder(
  { prefix: 'failures', category: 'Ejecución', icon: 'Bug', one: 'ejecución fallida', other: 'ejecuciones fallidas', value: (stats) => stats.failedRuns },
  [
    { target: 1, name: 'Primer tropiezo', xp: 10, difficulty: 'Inicial' },
    { target: 3, name: 'Tres tropiezos', xp: 20, difficulty: 'Fácil' },
    { target: 5, name: 'Cinco tropiezos', xp: 30, difficulty: 'Intermedio' },
    { target: 10, name: 'Diez cicatrices', xp: 50, difficulty: 'Avanzado' },
  ],
)

const fixTiers = ladder(
  { prefix: 'fixes', category: 'Ejecución', icon: 'Wrench', one: 'error corregido', other: 'errores corregidos', value: (stats) => stats.fixedErrors },
  [
    { target: 3, name: 'Reparador', xp: 45, difficulty: 'Intermedio' },
    { target: 5, name: 'Manitas', xp: 70, difficulty: 'Avanzado' },
    { target: 10, name: 'Ingeniero de incidentes', xp: 100, difficulty: 'Experto' },
  ],
)

const outputTiers = ladder(
  { prefix: 'outputs', category: 'Ejecución', icon: 'Terminal', one: 'ejecución con salida', other: 'ejecuciones con salida', value: (stats) => stats.outputPrograms },
  [
    { target: 1, name: 'Con salida', xp: 15, difficulty: 'Inicial' },
    { target: 5, name: 'Locuaz', xp: 30, difficulty: 'Fácil' },
    { target: 10, name: 'Narrador', xp: 45, difficulty: 'Intermedio' },
    { target: 25, name: 'Máquina de mensajes', xp: 75, difficulty: 'Avanzado' },
  ],
)

const outputLineTiers = ladder(
  { prefix: 'output-lines', category: 'Ejecución', icon: 'ListChecks', one: 'línea en una salida', other: 'líneas en una salida', value: (stats) => stats.maxOutputLines },
  [
    { target: 3, name: 'Tres líneas', xp: 15, difficulty: 'Fácil' },
    { target: 10, name: 'Diez líneas', xp: 30, difficulty: 'Intermedio' },
    { target: 25, name: 'Veinticinco líneas', xp: 55, difficulty: 'Avanzado' },
  ],
)

const outputCharacterTiers = ladder(
  { prefix: 'output-chars', category: 'Ejecución', icon: 'Binary', one: 'carácter de salida', other: 'caracteres de salida', value: (stats) => stats.maxOutputCharacters },
  [
    { target: 100, name: 'Mensaje largo', xp: 20, difficulty: 'Fácil' },
    { target: 1000, name: 'Salida generosa', xp: 40, difficulty: 'Intermedio' },
    { target: 5000, name: 'Volcado masivo', xp: 70, difficulty: 'Avanzado' },
  ],
)

const totalOutputLineTiers = ladder(
  { prefix: 'total-output-lines', category: 'Ejecución', icon: 'Rows3', one: 'línea de salida acumulada', other: 'líneas de salida acumuladas', value: (stats) => stats.totalOutputLines },
  [
    { target: 50, name: 'Flujo de texto', xp: 40, difficulty: 'Intermedio' },
    { target: 100, name: 'Cascada de texto', xp: 60, difficulty: 'Avanzado' },
  ],
)

const diagramTiers = ladder(
  { prefix: 'diagrams', category: 'Exploración', icon: 'GitBranch', one: 'inspección del diagrama', other: 'inspecciones del diagrama', value: (stats) => stats.diagramInspections },
  [
    { target: 5, name: 'Cartógrafo', xp: 20, difficulty: 'Fácil' },
    { target: 10, name: 'Lector de mapas', xp: 30, difficulty: 'Intermedio' },
    { target: 25, name: 'Topógrafo', xp: 45, difficulty: 'Intermedio' },
    { target: 50, name: 'Maestro del flujo', xp: 70, difficulty: 'Avanzado' },
  ],
)

const languageSwitchTiers = ladder(
  { prefix: 'language-switches', category: 'Exploración', icon: 'Languages', one: 'cambio de lenguaje', other: 'cambios de lenguaje', value: (stats) => stats.languageSwitches },
  [
    { target: 1, name: 'Cambio de idioma', xp: 15, difficulty: 'Fácil' },
    { target: 3, name: 'Tricultural', xp: 25, difficulty: 'Intermedio' },
    { target: 5, name: 'Adaptable', xp: 35, difficulty: 'Intermedio' },
    { target: 10, name: 'Camaleón', xp: 50, difficulty: 'Avanzado' },
  ],
)

const fileTiers = ladder(
  { prefix: 'files', category: 'Exploración', icon: 'FilePlus2', one: 'archivo creado', other: 'archivos creados', value: (stats) => stats.createdFiles },
  [
    { target: 1, name: 'Nuevo archivo', xp: 15, difficulty: 'Fácil' },
    { target: 3, name: 'Organizador', xp: 25, difficulty: 'Intermedio' },
    { target: 5, name: 'Coleccionista', xp: 35, difficulty: 'Intermedio' },
    { target: 10, name: 'Bibliotecario', xp: 55, difficulty: 'Avanzado' },
  ],
)

const importTiers = ladder(
  { prefix: 'imports', category: 'Exploración', icon: 'Upload', one: 'archivo importado', other: 'archivos importados', value: (stats) => stats.importedFiles },
  [
    { target: 1, name: 'Importador', xp: 20, difficulty: 'Fácil' },
    { target: 5, name: 'Migrador', xp: 35, difficulty: 'Intermedio' },
    { target: 10, name: 'Archivista', xp: 50, difficulty: 'Avanzado' },
  ],
)

const snapshotTiers = ladder(
  { prefix: 'snapshots', category: 'Exploración', icon: 'History', one: 'ejecución del historial consultada', other: 'ejecuciones del historial consultadas', value: (stats) => stats.snapshotViews },
  [
    { target: 1, name: 'Viajero del tiempo', xp: 20, difficulty: 'Fácil' },
    { target: 5, name: 'Coleccionista de runs', xp: 35, difficulty: 'Intermedio' },
    { target: 10, name: 'Historiador', xp: 50, difficulty: 'Avanzado' },
  ],
)

const consoleClearTiers = ladder(
  { prefix: 'console-clears', category: 'Exploración', icon: 'Trash2', one: 'limpieza de consola', other: 'limpiezas de consola', value: (stats) => stats.consoleClears },
  [
    { target: 1, name: 'Pizarra limpia', xp: 10, difficulty: 'Inicial' },
    { target: 5, name: 'Orden en consola', xp: 20, difficulty: 'Fácil' },
  ],
)

const exportTiers = ladder(
  { prefix: 'exports', category: 'Exploración', icon: 'Download', one: 'exportación', other: 'exportaciones', value: (stats) => stats.exports },
  [
    { target: 1, name: 'Exportador', xp: 15, difficulty: 'Fácil' },
    { target: 5, name: 'Distribuidor', xp: 30, difficulty: 'Intermedio' },
    { target: 10, name: 'Exportador serial', xp: 45, difficulty: 'Intermedio' },
  ],
)

const streakTiers = ladder(
  { prefix: 'best-streak', category: 'Constancia', icon: 'Flame', one: 'ejecución correcta consecutiva', other: 'ejecuciones correctas consecutivas', value: (stats) => stats.bestConsecutiveSuccessfulRuns },
  [
    { target: 5, name: 'Racha de cinco', xp: 45, difficulty: 'Intermedio' },
    { target: 7, name: 'Racha de siete', xp: 65, difficulty: 'Avanzado' },
    { target: 10, name: 'Racha de diez', xp: 90, difficulty: 'Avanzado' },
    { target: 15, name: 'Racha de quince', xp: 130, difficulty: 'Experto' },
  ],
)

const activeDayTiers = ladder(
  { prefix: 'active-days', category: 'Constancia', icon: 'CalendarDays', one: 'día activo', other: 'días activos', value: (stats) => stats.activeDays.length },
  [
    { target: 2, name: 'Segundo día', xp: 20, difficulty: 'Fácil' },
    { target: 3, name: 'Tres días', xp: 30, difficulty: 'Fácil' },
    { target: 5, name: 'Cinco días', xp: 45, difficulty: 'Intermedio' },
    { target: 7, name: 'Semana completa', xp: 70, difficulty: 'Avanzado' },
    { target: 14, name: 'Dos semanas', xp: 100, difficulty: 'Avanzado' },
    { target: 30, name: 'Treinta días', xp: 180, difficulty: 'Experto' },
  ],
)

const builtTiers = ladder(
  { prefix: 'built', category: 'Construcción', icon: 'Hammer', one: 'programa construido', other: 'programas construidos', value: (stats) => stats.builtPrograms },
  [
    { target: 3, name: 'Constructor habitual', xp: 30, difficulty: 'Intermedio' },
    { target: 5, name: 'Obrero experto', xp: 45, difficulty: 'Intermedio' },
    { target: 10, name: 'Maestro de obra', xp: 70, difficulty: 'Avanzado' },
    { target: 25, name: 'Urbanista', xp: 110, difficulty: 'Experto' },
  ],
)

const loopTiers = ladder(
  { prefix: 'loops', category: 'Construcción', icon: 'Repeat2', one: 'programa con bucle', other: 'programas con bucle', value: (stats) => stats.loopPrograms },
  [
    { target: 3, name: 'Rueda giratoria', xp: 35, difficulty: 'Intermedio' },
    { target: 10, name: 'Motor de bucles', xp: 65, difficulty: 'Avanzado' },
  ],
)

const conditionTiers = ladder(
  { prefix: 'conditions', category: 'Construcción', icon: 'GitBranch', one: 'programa con decisión', other: 'programas con decisión', value: (stats) => stats.conditionPrograms },
  [
    { target: 1, name: 'Bifurcación', xp: 25, difficulty: 'Fácil' },
    { target: 3, name: 'Árbol de decisión', xp: 40, difficulty: 'Intermedio' },
    { target: 10, name: 'Estratega', xp: 70, difficulty: 'Avanzado' },
  ],
)

const nodeTiers = ladder(
  { prefix: 'nodes', category: 'Construcción', icon: 'Blocks', one: 'nodo en un programa', other: 'nodos en un programa', value: (stats) => stats.largestProgramNodeCount },
  [
    { target: 5, name: 'Estructura clara', xp: 20, difficulty: 'Fácil' },
    { target: 10, name: 'Diagrama amplio', xp: 35, difficulty: 'Intermedio' },
    { target: 15, name: 'Flujo profundo', xp: 50, difficulty: 'Intermedio' },
    { target: 20, name: 'Sistema complejo', xp: 70, difficulty: 'Avanzado' },
    { target: 30, name: 'Catedral de lógica', xp: 100, difficulty: 'Experto' },
  ],
)

const advancedNodeTiers = ladder(
  { prefix: 'advanced-nodes', category: 'Construcción', icon: 'Network', one: 'nodo en un programa avanzado', other: 'nodos en un programa avanzado', value: (stats) => stats.largestAdvancedProgramNodeCount },
  [
    { target: 10, name: 'Diseño avanzado', xp: 45, difficulty: 'Intermedio' },
    { target: 15, name: 'Arquitectura mayor', xp: 70, difficulty: 'Avanzado' },
    { target: 20, name: 'Ingeniería de flujo', xp: 100, difficulty: 'Experto' },
  ],
)

const advancedProgramTiers = ladder(
  { prefix: 'advanced-programs', category: 'Construcción', icon: 'Workflow', one: 'programa avanzado', other: 'programas avanzados', value: (stats) => stats.advancedPrograms },
  [
    { target: 3, name: 'Serie avanzada', xp: 60, difficulty: 'Avanzado' },
    { target: 10, name: 'Producción avanzada', xp: 100, difficulty: 'Experto' },
  ],
)

const languageTiers = ladder(
  { prefix: 'languages', category: 'Dominio', icon: 'Languages', one: 'lenguaje', other: 'lenguajes', value: (stats) => stats.languagesUsed.length },
  [
    { target: 3, name: 'Trilingüe', xp: 60, difficulty: 'Intermedio' },
    { target: 4, name: 'Cuatrilingüe', xp: 75, difficulty: 'Intermedio' },
    { target: 5, name: 'Cinco lenguajes', xp: 90, difficulty: 'Avanzado' },
    { target: 6, name: 'Seis lenguajes', xp: 110, difficulty: 'Avanzado' },
    { target: 7, name: 'Siete lenguajes', xp: 130, difficulty: 'Avanzado' },
    { target: 8, name: 'Ocho lenguajes', xp: 150, difficulty: 'Experto' },
    { target: 9, name: 'Nueve lenguajes', xp: 175, difficulty: 'Experto' },
    { target: 10, name: 'Omniglot', xp: 220, difficulty: 'Experto' },
  ],
)

const maxLanguageSuccesses = (stats: AchievementStats) => Math.max(0, ...SUPPORTED_LANGUAGES.map((language) => stats.languageSuccessCounts[language] ?? 0))

const languageMasteryTiers = ladder(
  { prefix: 'language-mastery', category: 'Dominio', icon: 'Crown', one: 'ejecución en un mismo lenguaje', other: 'ejecuciones en un mismo lenguaje', value: maxLanguageSuccesses },
  [
    { target: 3, name: 'Especialista de lenguaje', xp: 30, difficulty: 'Intermedio' },
    { target: 10, name: 'Dominio de runtime', xp: 60, difficulty: 'Avanzado' },
    { target: 25, name: 'Autoridad del lenguaje', xp: 120, difficulty: 'Experto' },
  ],
)

const languageAchievements: AchievementDefinition[] = SUPPORTED_LANGUAGES.map((language) => counter({
  id: `language-${language}`,
  name: `Voz de ${LANGUAGE_DEFINITIONS[language].label}`,
  description: `Completa una ejecución correcta en ${LANGUAGE_DEFINITIONS[language].label}.`,
  hint: `Cambia el lenguaje del archivo a ${LANGUAGE_DEFINITIONS[language].label} y ejecuta un programa sin errores.`,
  condition: `Una ejecución correcta en ${LANGUAGE_DEFINITIONS[language].label}.`,
  category: 'Dominio',
  difficulty: 'Intermedio',
  xp: 25,
  icon: 'Languages',
}, (stats) => stats.languageSuccessCounts[language] ?? 0, 1))

export const ACHIEVEMENTS: AchievementDefinition[] = [
  flag({ id: 'first-line', name: 'Primeros pasos', description: 'Escribe tu primera línea de código.', hint: 'Cambia algo en el editor; puede ser tan simple como una variable.', condition: 'Escribir código en el editor.', category: 'Código', difficulty: 'Inicial', xp: 10, icon: 'Code2' }, (stats) => stats.hasWrittenCode),
  ...editTiers,
  ...lineTiers,
  ...characterTiers,
  flag({ id: 'comment-writer', name: 'Voz propia', description: 'Documenta tu código con un comentario.', hint: 'Añade una línea que empiece por // o un bloque /* ... */.', condition: 'Escribir un comentario en el editor.', category: 'Código', difficulty: 'Fácil', xp: 20, icon: 'MessageCircleCode' }, (stats) => stats.hasComment),
  flag({ id: 'function-author', name: 'Función hecha', description: 'Declara tu primera función.', hint: 'Usa function, def, func o una función flecha.', condition: 'Escribir una función en el editor.', category: 'Código', difficulty: 'Intermedio', xp: 30, icon: 'Braces' }, (stats) => stats.hasFunction),
  flag({ id: 'class-author', name: 'Molde de objetos', description: 'Declara una clase, estructura o interfaz.', hint: 'Crea una clase con class o una estructura equivalente en tu lenguaje.', condition: 'Escribir una clase o estructura en el editor.', category: 'Código', difficulty: 'Avanzado', xp: 50, icon: 'Boxes' }, (stats) => stats.hasClass),
  flag({ id: 'arrow-function', name: 'Flecha directa', description: 'Escribe una función flecha.', hint: 'Convierte una función sencilla en una expresión con =>.', condition: 'Usar la sintaxis de función flecha.', category: 'Código', difficulty: 'Fácil', xp: 25, icon: 'Zap' }, (stats) => stats.hasArrowFunction),
  flag({ id: 'template-literal', name: 'Texto dinámico', description: 'Combina texto y valores con una plantilla.', hint: 'Usa comillas invertidas y ${...} para interpolar.', condition: 'Escribir una plantilla de texto.', category: 'Código', difficulty: 'Fácil', xp: 25, icon: 'Puzzle' }, (stats) => stats.hasTemplateLiteral),
  flag({ id: 'array-keeper', name: 'Lista ordenada', description: 'Trabaja con una colección de valores.', hint: 'Declara un array o una lista en tu programa.', condition: 'Usar un array o lista en el editor.', category: 'Código', difficulty: 'Fácil', xp: 20, icon: 'Layers' }, (stats) => stats.hasArray),
  flag({ id: 'object-keeper', name: 'Objeto con forma', description: 'Agrupa datos en un objeto.', hint: 'Crea un objeto con pares clave-valor.', condition: 'Usar un objeto con propiedades en el editor.', category: 'Código', difficulty: 'Fácil', xp: 20, icon: 'Boxes' }, (stats) => stats.hasObject),
  flag({ id: 'boolean-thinker', name: 'Lógica binaria', description: 'Usa un valor verdadero o falso.', hint: 'Introduce true o false en una condición o variable.', condition: 'Usar un valor booleano en el editor.', category: 'Código', difficulty: 'Fácil', xp: 20, icon: 'Divide' }, (stats) => stats.hasBoolean),
  flag({ id: 'import-user', name: 'Trae herramientas', description: 'Importa código desde otro módulo.', hint: 'Usa import, require o #include según el lenguaje.', condition: 'Escribir una importación en el editor.', category: 'Código', difficulty: 'Intermedio', xp: 30, icon: 'Upload' }, (stats) => stats.hasImport),
  flag({ id: 'recursion-mind', name: 'Mente recursiva', description: 'Haz que una función se llame a sí misma.', hint: 'Resuelve un problema pequeño llamando de nuevo a la función.', condition: 'Escribir una función recursiva.', category: 'Código', difficulty: 'Avanzado', xp: 55, icon: 'Infinity' }, (stats) => stats.hasRecursion),
  flag({ id: 'async-explorer', name: 'Tiempo asíncrono', description: 'Trabaja con código asíncrono.', hint: 'Prueba async, await o una promesa.', condition: 'Usar async, await o Promise en el editor.', category: 'Código', difficulty: 'Avanzado', xp: 55, icon: 'Timer' }, (stats) => stats.hasAsync),
  flag({ id: 'error-handler', name: 'Red de seguridad', description: 'Captura un posible error.', hint: 'Envuelve el código en try/catch o el equivalente de tu lenguaje.', condition: 'Escribir un bloque de manejo de errores.', category: 'Código', difficulty: 'Avanzado', xp: 50, icon: 'Bug' }, (stats) => stats.hasErrorHandling),
  flag({ id: 'switch-navigator', name: 'Rutas alternativas', description: 'Usa una estructura de selección múltiple.', hint: 'Prueba switch, case o match.', condition: 'Escribir un switch o equivalente.', category: 'Código', difficulty: 'Intermedio', xp: 35, icon: 'Route' }, (stats) => stats.hasSwitch),
  flag({ id: 'array-methods', name: 'Colección expresiva', description: 'Transforma una colección con un método funcional.', hint: 'Prueba map, filter, reduce o forEach.', condition: 'Usar un método de colección en el editor.', category: 'Código', difficulty: 'Intermedio', xp: 40, icon: 'ListChecks' }, (stats) => stats.hasArrayMethods),
  counter({ id: 'source-line-editor', name: 'Cirujano del código', description: 'Edita una línea desde el inspector del diagrama.', hint: 'Selecciona un nodo, cambia su línea y aplica el cambio.', condition: 'Aplicar una edición desde el nodo del diagrama.', category: 'Código', difficulty: 'Intermedio', xp: 25, icon: 'ScanSearch' }, (stats) => stats.sourceLineEdits, 1),
  flag({ id: 'refactor', name: 'Segunda versión', description: 'Mejora un programa después de ejecutarlo.', hint: 'Tras una ejecución correcta, modifica el código y vuelve a ejecutarlo.', condition: 'Editar código después de una ejecución correcta y luego ejecutar con éxito.', category: 'Código', difficulty: 'Avanzado', xp: 70, icon: 'WandSparkles' }, (stats) => stats.hasRunAfterRefinement),
  ...ladder({ prefix: 'refinements', category: 'Código', icon: 'WandSparkles', one: 'ejecución tras refinar', other: 'ejecuciones tras refinar', value: (stats) => stats.refinementRuns }, [
    { target: 3, name: 'Refinador', xp: 45, difficulty: 'Intermedio' },
    { target: 10, name: 'Pulidor implacable', xp: 90, difficulty: 'Experto' },
  ]),

  flag({ id: 'first-run', name: 'En marcha', description: 'Ejecuta un programa sin errores.', hint: 'Pulsa Ejecutar y revisa la consola para ver el resultado.', condition: 'Completar una ejecución correctamente.', category: 'Ejecución', difficulty: 'Inicial', xp: 20, icon: 'Play' }, (stats) => reached(stats.successfulRuns, 1)),
  flag({ id: 'hello-world', name: 'Hello, World!', description: 'Muestra el saludo clásico en la consola.', hint: 'Prueba console.log en JavaScript o print en Python.', condition: 'Una ejecución correcta debe imprimir «Hello, World!».', category: 'Ejecución', difficulty: 'Fácil', xp: 30, icon: 'MessageCircleCode' }, (stats) => stats.hasHelloWorld),
  ...successTiers,
  ...runTiers,
  ...failureTiers,
  flag({ id: 'debugger', name: 'Solucionador', description: 'Recupérate de un error y vuelve a ejecutar con éxito.', hint: 'Provoca o encuentra un error, corrige el código y vuelve a ejecutarlo.', condition: 'Tras una ejecución fallida, editar el código y completar una ejecución correcta.', category: 'Ejecución', difficulty: 'Intermedio', xp: 40, icon: 'Bug' }, (stats) => stats.hasFixedError),
  ...fixTiers,
  ...outputTiers,
  ...outputLineTiers,
  ...outputCharacterTiers,
  ...totalOutputLineTiers,
  flag({ id: 'numeric-output', name: 'Números en pantalla', description: 'Imprime un valor numérico en la consola.', hint: 'Muestra el resultado de una operación con console.log o print.', condition: 'Una ejecución correcta debe incluir un número en la salida.', category: 'Ejecución', difficulty: 'Fácil', xp: 20, icon: 'Sigma' }, (stats) => stats.hasNumericOutput),
  counter({ id: 'hello-world-2', name: 'Dos saludos', description: 'Muestra Hello, World! en dos lenguajes distintos.', hint: 'Repite el saludo clásico cambiando de runtime.', condition: 'Imprimir el saludo en dos lenguajes.', category: 'Ejecución', difficulty: 'Intermedio', xp: 40, icon: 'Languages' }, (stats) => stats.helloWorldLanguages.length, 2),
  counter({ id: 'hello-world-3', name: 'Saludo universal', description: 'Muestra Hello, World! en tres lenguajes distintos.', hint: 'Lleva el saludo clásico a un tercer lenguaje.', condition: 'Imprimir el saludo en tres lenguajes.', category: 'Ejecución', difficulty: 'Avanzado', xp: 60, icon: 'Languages' }, (stats) => stats.helloWorldLanguages.length, 3),

  flag({ id: 'explorer', name: 'Explorador', description: 'Descubre una herramienta del estudio.', hint: 'Abre un nodo del diagrama, cambia de lenguaje o crea otro archivo.', condition: 'Usar una función de exploración del estudio.', category: 'Exploración', difficulty: 'Fácil', xp: 20, icon: 'Compass' }, (stats) => stats.hasExploredFeature),
  flag({ id: 'analyst', name: 'Lector de flujos', description: 'Inspecciona un nodo del diagrama de flujo.', hint: 'Selecciona cualquier bloque del diagrama para ver su línea de origen.', condition: 'Seleccionar un nodo del diagrama.', category: 'Exploración', difficulty: 'Fácil', xp: 25, icon: 'GitBranch' }, (stats) => stats.hasExploredDiagram),
  ...diagramTiers,
  ...languageSwitchTiers,
  ...fileTiers,
  ...importTiers,
  ...snapshotTiers,
  ...consoleClearTiers,
  ...exportTiers,
  counter({ id: 'export-file-1', name: 'Archivo compartido', description: 'Exporta el archivo activo.', hint: 'Abre el menú «Más acciones» de la barra superior y elige Exportar archivo.', condition: 'Exportar un archivo de código.', category: 'Exploración', difficulty: 'Fácil', xp: 15, icon: 'Download' }, (stats) => stats.fileExports, 1),
  counter({ id: 'export-project-1', name: 'Proyecto entregado', description: 'Exporta el proyecto completo.', hint: 'Abre el menú del proyecto y elige Exportar proyecto.', condition: 'Exportar un proyecto CodeFlow.', category: 'Exploración', difficulty: 'Fácil', xp: 20, icon: 'FolderOpen' }, (stats) => stats.projectExports, 1),
  counter({ id: 'export-diagram-1', name: 'Diagrama exportado', description: 'Exporta el diagrama del flujo actual.', hint: 'Abre el menú «Más acciones» del panel Flujo y elige Exportar diagrama.', condition: 'Exportar un diagrama de flujo.', category: 'Exploración', difficulty: 'Fácil', xp: 20, icon: 'GitCommitHorizontal' }, (stats) => stats.diagramExports, 1),
  flag({ id: 'help-opened', name: 'Curioso', description: 'Abre la ayuda y los atajos de teclado.', hint: 'Pulsa el icono de teclado en la barra superior.', condition: 'Abrir el diálogo de ayuda.', category: 'Exploración', difficulty: 'Fácil', xp: 15, icon: 'Lightbulb' }, (stats) => stats.helpOpened),
  counter({ id: 'inspector-tabs-2', name: 'Inspector completo', description: 'Visita las dos pestañas del inspector.', hint: 'Revisa Símbolos e Historial en el panel derecho.', condition: 'Abrir las pestañas de símbolos e historial.', category: 'Exploración', difficulty: 'Intermedio', xp: 25, icon: 'ScanSearch' }, (stats) => stats.inspectorTabsUsed.length, 2),

  flag({ id: 'folder-created', name: 'Creador de carpetas', description: 'Crea tu primera carpeta en el explorador.', hint: 'Usa el botón de carpeta junto a «Explorador» o el menú de una carpeta.', condition: 'Crear una carpeta en un proyecto.', category: 'Exploración', difficulty: 'Fácil', xp: 15, icon: 'FolderOpen' }, (stats) => stats.foldersCreated >= 1),
  flag({ id: 'file-moved', name: 'Reordenador', description: 'Mueve un archivo a otra carpeta.', hint: 'Abre el menú de un archivo y elige «Mover a…».', condition: 'Mover un archivo de carpeta.', category: 'Exploración', difficulty: 'Fácil', xp: 15, icon: 'Layers' }, (stats) => stats.filesMoved >= 1),
  flag({ id: 'file-renamed', name: 'Renombrador', description: 'Cambia el nombre de un archivo o de una carpeta.', hint: 'El menú de cada fila del explorador permite renombrar.', condition: 'Renombrar un archivo o una carpeta.', category: 'Exploración', difficulty: 'Fácil', xp: 15, icon: 'FilePlus2' }, (stats) => stats.filesRenamed >= 1),
  flag({ id: 'file-duplicated', name: 'Gemelo', description: 'Duplica un archivo para trabajar sobre una copia.', hint: 'Elige «Duplicar» en el menú de un archivo.', condition: 'Duplicar un archivo.', category: 'Exploración', difficulty: 'Fácil', xp: 15, icon: 'Copy' }, (stats) => stats.filesDuplicated >= 1),
  flag({ id: 'folder-imported', name: 'Excavador', description: 'Importa una carpeta completa del disco.', hint: 'En el menú «Más acciones» elige «Importar carpeta…».', condition: 'Importar una carpeta con código.', category: 'Exploración', difficulty: 'Intermedio', xp: 30, icon: 'Upload' }, (stats) => stats.folderImports >= 1),
  flag({ id: 'projects-visited', name: 'Curioso de proyectos', description: 'Vuelve a la vista de proyectos.', hint: 'Pulsa la marca de la barra superior.', condition: 'Abrir la vista de proyectos.', category: 'Exploración', difficulty: 'Inicial', xp: 10, icon: 'Compass' }, (stats) => stats.projectsVisited >= 1),
  flag({ id: 'empty-workspace', name: 'Página en blanco', description: 'Explora el estudio sin ningún proyecto.', hint: 'Elimina todos los proyectos y quédate en la vista de proyectos.', condition: 'Tener la lista de proyectos vacía.', category: 'Exploración', difficulty: 'Intermedio', xp: 25, icon: 'Sparkles' }, (stats) => stats.emptyWorkspaceVisits >= 1),
  flag({ id: 'layout-adjusted', name: 'Arquitecto de espacio', description: 'Redimensiona los paneles del estudio.', hint: 'Arrastra los separadores con los puntos de agarre.', condition: 'Ajustar el tamaño de un panel.', category: 'Exploración', difficulty: 'Fácil', xp: 15, icon: 'Workflow' }, (stats) => stats.layoutAdjustments >= 1),
  flag({ id: 'console-copied', name: 'Portapapeles', description: 'Copia la salida de la consola.', hint: 'Usa el botón de copiar en la cabecera de la consola.', condition: 'Copiar la salida del programa.', category: 'Exploración', difficulty: 'Fácil', xp: 15, icon: 'Terminal' }, (stats) => stats.consoleCopies >= 1),
  flag({ id: 'output-comparison', name: 'Comparador', description: 'Compara la salida de dos ejecuciones.', hint: 'En «Historial» marca dos ejecuciones para compararlas.', condition: 'Comparar dos salidas guardadas.', category: 'Exploración', difficulty: 'Intermedio', xp: 30, icon: 'GitCommitHorizontal' }, (stats) => stats.outputComparisons >= 1),
  flag({ id: 'symbol-navigation', name: 'Lector de símbolos', description: 'Salta a un símbolo desde la lista del inspector.', hint: 'En la pestaña «Símbolos» pulsa cualquier entrada.', condition: 'Navegar a un símbolo desde el inspector.', category: 'Exploración', difficulty: 'Fácil', xp: 15, icon: 'ScanSearch' }, (stats) => stats.symbolNavigations >= 1),
  counter({ id: 'diagram-image-1', name: 'Imagen del flujo', description: 'Exporta el diagrama como SVG o PNG.', hint: 'En el panel «Flujo» elige «Exportar diagrama…».', condition: 'Exportar un diagrama en imagen.', category: 'Dominio', difficulty: 'Fácil', xp: 20, icon: 'Download' }, (stats) => stats.diagramImageExports, 1),
  counter({ id: 'diagram-image-5', name: 'Galería de flujos', description: 'Exporta cinco diagramas en imagen.', hint: 'Cada exportación en SVG o PNG cuenta.', condition: 'Exportar 5 diagramas en imagen.', category: 'Dominio', difficulty: 'Intermedio', xp: 45, icon: 'Download' }, (stats) => stats.diagramImageExports, 5),
  flag({ id: 'project-archived', name: 'Empaquetador', description: 'Exporta un proyecto en ZIP con sus diagramas.', hint: 'En el menú del proyecto elige «Exportar proyecto…» y luego ZIP.', condition: 'Exportar un proyecto como ZIP.', category: 'Dominio', difficulty: 'Intermedio', xp: 35, icon: 'FolderOpen' }, (stats) => stats.projectArchiveExports >= 1),
  flag({ id: 'project-created', name: 'Fundador', description: 'Crea un proyecto nuevo desde cero.', hint: 'En la vista de proyectos, «Nuevo proyecto».', condition: 'Crear un proyecto.', category: 'Dominio', difficulty: 'Fácil', xp: 20, icon: 'Sparkles' }, (stats) => stats.projectsCreated >= 1),
  counter({ id: 'projects-created-3', name: 'Cartera de proyectos', description: 'Crea tres proyectos distintos.', hint: 'Cada proyecto nuevo suma uno.', condition: 'Crear 3 proyectos.', category: 'Dominio', difficulty: 'Intermedio', xp: 40, icon: 'Layers' }, (stats) => stats.projectsCreated, 3),
  counter({ id: 'folder-tiers-3', name: 'Estructura propia', description: 'Crea tres carpetas en tus proyectos.', hint: 'Agrupa tu código en carpetas del explorador.', condition: 'Crear 3 carpetas.', category: 'Dominio', difficulty: 'Intermedio', xp: 30, icon: 'FolderOpen' }, (stats) => stats.foldersCreated, 3),

  counter({ id: 'steady', name: 'Constancia', description: 'Completa tres ejecuciones correctas seguidas.', hint: 'Cada ejecución correcta consecutiva suma; un error reinicia la racha.', condition: 'Completar 3 ejecuciones correctas consecutivas.', category: 'Constancia', difficulty: 'Intermedio', xp: 45, icon: 'Flame' }, (stats) => stats.consecutiveSuccessfulRuns, 3),
  ...streakTiers,
  ...activeDayTiers,

  flag({ id: 'builder', name: 'Constructor', description: 'Crea un programa que produzca una salida útil.', hint: 'Combina varias instrucciones y comprueba su resultado en la consola.', condition: 'Escribir código y ejecutar con éxito un programa de 3 o más nodos que produzca salida.', category: 'Construcción', difficulty: 'Intermedio', xp: 60, icon: 'Hammer' }, (stats) => stats.hasBuiltProgram),
  ...builtTiers,
  flag({ id: 'loop-maker', name: 'Bucle virtuoso', description: 'Construye y ejecuta correctamente un ciclo.', hint: 'Prueba for o while y observa su representación en el diagrama.', condition: 'Completar una ejecución correcta cuyo flujo contenga un ciclo.', category: 'Construcción', difficulty: 'Avanzado', xp: 65, icon: 'Repeat2' }, (stats) => stats.hasUsedLoop),
  ...loopTiers,
  ...conditionTiers,
  flag({ id: 'multi-loop', name: 'Doble bucle', description: 'Combina dos o más bucles en un mismo programa.', hint: 'Añade un segundo for o while al código que ya tiene un ciclo.', condition: 'Escribir un programa con al menos dos bucles.', category: 'Construcción', difficulty: 'Avanzado', xp: 45, icon: 'Repeat2' }, (stats) => stats.hasMultipleLoops),
  flag({ id: 'function-program', name: 'Función en acción', description: 'Ejecuta un programa propio que use una función.', hint: 'Escribe una función y ejecútala con datos reales.', condition: 'Ejecutar con éxito un programa propio con una función.', category: 'Construcción', difficulty: 'Intermedio', xp: 35, icon: 'Braces' }, (stats) => stats.hasFunctionProgram),
  flag({ id: 'class-program', name: 'Clase en acción', description: 'Ejecuta un programa propio que use una clase.', hint: 'Instancia una clase o estructura y usa uno de sus miembros.', condition: 'Ejecutar con éxito un programa propio con una clase.', category: 'Construcción', difficulty: 'Avanzado', xp: 45, icon: 'Boxes' }, (stats) => stats.hasClassProgram),
  ...nodeTiers,
  flag({ id: 'architect', name: 'Arquitecto', description: 'Diseña un flujo de programa amplio y funcional.', hint: 'Combina funciones, decisiones y varias instrucciones en un mismo programa.', condition: 'Escribir código y ejecutar correctamente un programa con 8 o más nodos y una decisión o ciclo.', category: 'Construcción', difficulty: 'Avanzado', xp: 100, icon: 'Blocks' }, (stats) => stats.hasAdvancedProgram),
  ...advancedNodeTiers,
  ...advancedProgramTiers,

  counter({ id: 'polyglot', name: 'Políglota', description: 'Programa y ejecuta en dos lenguajes distintos.', hint: 'Completa una ejecución correcta en dos lenguajes diferentes.', condition: 'Ejecutar correctamente al menos un programa en cada uno de dos lenguajes.', category: 'Dominio', difficulty: 'Intermedio', xp: 55, icon: 'Languages' }, (stats) => stats.languagesUsed.length, 2),
  ...languageTiers,
  ...languageAchievements,
  ...languageMasteryTiers,
  {
    id: 'specialist',
    name: 'Especialista',
    description: 'Domina los retos de programación de mayor complejidad.',
    hint: 'Construye una solución extensa con flujo de control y sigue iterando.',
    condition: 'Completar 10 ejecuciones correctas y un reto avanzado escrito por ti de 12 o más nodos.',
    category: 'Dominio',
    difficulty: 'Experto',
    xp: 150,
    icon: 'Trophy',
    progress: (stats) => progress(Math.min(stats.successfulRuns, stats.largestAdvancedProgramNodeCount >= 12 ? 10 : 9), 10),
    isComplete: (stats) => stats.successfulRuns >= 10 && stats.largestAdvancedProgramNodeCount >= 12,
  },
]

export const ACHIEVEMENT_CATEGORIES: AchievementCategory[] = ['Código', 'Ejecución', 'Exploración', 'Constancia', 'Construcción', 'Dominio']

function todayKey(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function applyCodeFeatures(stats: AchievementStats, code: string) {
  if (!code.trim()) return
  const meaningfulLines = code.split('\n').filter((line) => line.trim().length > 0).length
  stats.maxLinesOfCode = Math.max(stats.maxLinesOfCode, meaningfulLines)
  stats.maxCodeCharacters = Math.max(stats.maxCodeCharacters, code.length)
  if (/\/\/|\/\*|(^|\n)\s*#/.test(code)) stats.hasComment = true
  if (/\b(?:function|def|func|fn)\s+[A-Za-z_]\w*|=>|\b[A-Za-z_]\w*\s+[A-Za-z_]\w*\s*\([^)]*\)\s*\{|\b(?:public|private|protected|static)\s+[\w<>[\]]+\s+[A-Za-z_]\w*\s*\(/.test(code)) stats.hasFunction = true
  if (/\b(?:class|interface|struct|record|enum)\s+[A-Za-z_]\w*/.test(code)) stats.hasClass = true
  if (/=>/.test(code)) stats.hasArrowFunction = true
  if (/`/.test(code)) stats.hasTemplateLiteral = true
  if (/\[[^\]]*\]/.test(code) || /\b(?:Array|list|vec!)\s*[<(]/.test(code)) stats.hasArray = true
  if (/\{[^{}]*:[^{}]*\}/.test(code)) stats.hasObject = true
  if (/\b(?:true|false)\b/.test(code)) stats.hasBoolean = true
  if (/^\s*(?:import|from|require\s*\(|using\s|#include)/m.test(code)) stats.hasImport = true
  if (/\b(?:switch|case|match)\b/.test(code)) stats.hasSwitch = true
  if (/\.(?:map|filter|reduce|forEach|some|every|find|flatMap|sort)\s*\(|\b(?:map|filter|reduce)\s*\(/.test(code)) stats.hasArrayMethods = true
  if (/\basync\b|\bawait\b|\bPromise\b/.test(code)) stats.hasAsync = true
  if (/\btry\b[\s\S]*\b(?:catch|except|rescue|Result)\b/.test(code)) stats.hasErrorHandling = true
  const functionNames = [...code.matchAll(/\b(?:function|def|func|fn)\s+([A-Za-z_]\w*)/g)].map((match) => match[1])
  const arrowNames = [...code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_]\w*)\s*=>/g)].map((match) => match[1])
  for (const name of [...functionNames, ...arrowNames]) {
    if ((code.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length >= 2) stats.hasRecursion = true
  }
  if ((code.match(/\b(?:for|while)\b/g) ?? []).length >= 2) stats.hasMultipleLoops = true
}

export function createAchievementProfile(name: string, id = crypto.randomUUID()): AchievementProfile {
  return {
    id,
    name: name.trim() || 'Integrante',
    createdAt: Date.now(),
    xp: 0,
    unlocked: {},
    stats: createAchievementStats(),
  }
}

export function isAchievementProfile(value: unknown): value is AchievementProfile {
  if (!value || typeof value !== 'object') return false
  const profile = value as Partial<AchievementProfile>
  const stats = profile.stats
  return typeof profile.id === 'string'
    && typeof profile.name === 'string'
    && typeof profile.createdAt === 'number'
    && typeof profile.xp === 'number'
    && Boolean(profile.unlocked && typeof profile.unlocked === 'object')
    && Boolean(stats && typeof stats === 'object')
}

export function migrateAchievementProfile(profile: AchievementProfile): AchievementProfile {
  return { ...profile, stats: mergeStats(profile.stats) }
}

export function recordAchievementActivity(profile: AchievementProfile, activity: AchievementActivity): { profile: AchievementProfile; unlockedIds: string[] } {
  const stats = mergeStats(profile.stats)
  const today = todayKey()
  if (!stats.activeDays.includes(today)) stats.activeDays.push(today)

  if (activity.type === 'edit' && activity.code.trim()) {
    stats.hasWrittenCode = true
    stats.totalEdits += 1
    if (stats.hadFailedRun) stats.editedAfterFailure = true
    if (stats.successfulRuns > 0) stats.hasRefinedProgram = true
    applyCodeFeatures(stats, activity.code)
  }

  if (activity.type === 'run-failure') {
    stats.hadFailedRun = true
    stats.totalRuns += 1
    stats.failedRuns += 1
    stats.consecutiveSuccessfulRuns = 0
  }

  if (activity.type === 'explore') {
    stats.hasExploredFeature = true
    if (activity.feature === 'diagram') {
      stats.hasExploredDiagram = true
      stats.diagramInspections += 1
    }
    if (activity.feature === 'file') {
      stats.hasCreatedFile = true
      stats.createdFiles += 1
    }
    if (activity.feature === 'import') {
      stats.hasCreatedFile = true
      stats.importedFiles += 1
    }
    if (activity.feature === 'language') stats.languageSwitches += 1
    if (activity.feature === 'help') stats.helpOpened = true
  }

  if (activity.type === 'inspector' && !stats.inspectorTabsUsed.includes(activity.tab)) {
    stats.inspectorTabsUsed.push(activity.tab)
  }

  if (activity.type === 'snapshot') stats.snapshotViews += 1

  if (activity.type === 'export') {
    stats.exports += 1
    if (activity.target === 'file') stats.fileExports += 1
    if (activity.target === 'project') stats.projectExports += 1
    if (activity.target === 'diagram') stats.diagramExports += 1
  }

  if (activity.type === 'organize') {
    if (activity.action === 'folder-created') stats.foldersCreated += 1
    if (activity.action === 'file-moved') stats.filesMoved += 1
    if (activity.action === 'file-renamed') stats.filesRenamed += 1
    if (activity.action === 'file-duplicated') stats.filesDuplicated += 1
    if (activity.action === 'folder-imported') stats.folderImports += 1
  }

  if (activity.type === 'project') {
    if (activity.action === 'created') stats.projectsCreated += 1
    if (activity.action === 'deleted') stats.projectsDeleted += 1
    if (activity.action === 'archived') stats.projectArchiveExports += 1
    if (activity.action === 'visited') stats.projectsVisited += 1
    if (activity.action === 'empty') stats.emptyWorkspaceVisits += 1
  }

  if (activity.type === 'console') {
    if (activity.action === 'copied') stats.consoleCopies += 1
    if (activity.action === 'compared') stats.outputComparisons += 1
  }

  if (activity.type === 'symbol' && activity.action === 'navigated') stats.symbolNavigations += 1

  if (activity.type === 'layout') stats.layoutAdjustments += 1

  if (activity.type === 'export-diagram-image') stats.diagramImageExports += 1
  if (activity.type === 'export-project-archive') stats.projectArchiveExports += 1

  if (activity.type === 'apply-edit') stats.sourceLineEdits += 1
  if (activity.type === 'reset') stats.resets += 1
  if (activity.type === 'clear-console') stats.consoleClears += 1

  if (activity.type === 'run-success') {
    stats.totalRuns += 1
    stats.successfulRuns += 1
    stats.consecutiveSuccessfulRuns += 1
    stats.bestConsecutiveSuccessfulRuns = Math.max(stats.bestConsecutiveSuccessfulRuns, stats.consecutiveSuccessfulRuns)
    if (stats.hasRefinedProgram) {
      stats.hasRunAfterRefinement = true
      stats.refinementRuns += 1
    }
    stats.languageSuccessCounts[activity.language] = (stats.languageSuccessCounts[activity.language] ?? 0) + 1
    if (!stats.languagesUsed.includes(activity.language)) stats.languagesUsed.push(activity.language)
    if (/hello\s*,?\s*world!?/i.test(activity.output)) {
      stats.hasHelloWorld = true
      if (!stats.helloWorldLanguages.includes(activity.language)) stats.helloWorldLanguages.push(activity.language)
    }
    if (stats.editedAfterFailure) {
      stats.hasFixedError = true
      stats.fixedErrors += 1
      stats.editedAfterFailure = false
    }
    if (activity.code && stats.hasWrittenCode) applyCodeFeatures(stats, activity.code)
    const outputLines = activity.output.split('\n').filter((line) => line.trim().length > 0).length
    if (activity.output.trim()) stats.outputPrograms += 1
    stats.maxOutputLines = Math.max(stats.maxOutputLines, outputLines)
    stats.maxOutputCharacters = Math.max(stats.maxOutputCharacters, activity.output.length)
    stats.totalOutputLines += outputLines
    if (/\d/.test(activity.output)) stats.hasNumericOutput = true
    if (stats.hasWrittenCode && activity.output.trim() && activity.nodeCount >= 3) stats.hasBuiltProgram = true
    if (stats.hasWrittenCode && activity.output.trim() && activity.nodeCount >= 3) stats.builtPrograms += 1
    if (stats.hasWrittenCode && activity.nodeKinds.includes('loop')) {
      stats.hasUsedLoop = true
      stats.loopPrograms += 1
    }
    if (stats.hasWrittenCode && activity.nodeKinds.includes('condition')) stats.conditionPrograms += 1
    if (stats.hasWrittenCode && stats.hasFunction) stats.hasFunctionProgram = true
    if (stats.hasWrittenCode && stats.hasClass) stats.hasClassProgram = true
    stats.largestProgramNodeCount = Math.max(stats.largestProgramNodeCount, activity.nodeCount)
    if (stats.hasWrittenCode && activity.nodeCount >= 8 && (activity.nodeKinds.includes('condition') || activity.nodeKinds.includes('loop'))) {
      stats.hasAdvancedProgram = true
      stats.advancedPrograms += 1
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
