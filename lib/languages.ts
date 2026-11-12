export type Language =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'lua'
  | 'java'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'go'
  | 'rust'

export type DiagramAnalyzer = 'javascript' | 'python' | 'generic' | 'lua'

export interface LanguageDefinition {
  id: Language
  label: string
  mark: string
  extension: string
  extensions: string[]
  monacoLanguage: string
  tabSize: number
  runtimeName: string
  analyzerName: string
  diagram: DiagramAnalyzer
}

export const LANGUAGE_DEFINITIONS: Record<Language, LanguageDefinition> = {
  javascript: {
    id: 'javascript',
    label: 'JavaScript',
    mark: 'JS',
    extension: 'js',
    extensions: ['js', 'jsx', 'mjs', 'cjs'],
    monacoLanguage: 'javascript',
    tabSize: 2,
    runtimeName: 'Web Worker · navegador',
    analyzerName: 'JavaScript · Babel AST',
    diagram: 'javascript',
  },
  typescript: {
    id: 'typescript',
    label: 'TypeScript',
    mark: 'TS',
    extension: 'ts',
    extensions: ['ts', 'tsx', 'mts', 'cts'],
    monacoLanguage: 'typescript',
    tabSize: 2,
    runtimeName: 'Web Worker · navegador',
    analyzerName: 'TypeScript · Babel AST',
    diagram: 'javascript',
  },
  python: {
    id: 'python',
    label: 'Python',
    mark: 'Py',
    extension: 'py',
    extensions: ['py', 'pyw'],
    monacoLanguage: 'python',
    tabSize: 4,
    runtimeName: 'Pyodide · WebAssembly',
    analyzerName: 'Python · Lezer',
    diagram: 'python',
  },
  lua: {
    id: 'lua',
    label: 'Lua',
    mark: 'Lua',
    extension: 'lua',
    extensions: ['lua'],
    monacoLanguage: 'lua',
    tabSize: 2,
    runtimeName: 'Wasmoon · WebAssembly',
    analyzerName: 'Lua · analizador estructural',
    diagram: 'lua',
  },
  java: {
    id: 'java',
    label: 'Java',
    mark: 'Java',
    extension: 'java',
    extensions: ['java'],
    monacoLanguage: 'java',
    tabSize: 4,
    runtimeName: 'javac + TeaVM · WebAssembly',
    analyzerName: 'Java · analizador estructural',
    diagram: 'generic',
  },
  c: {
    id: 'c',
    label: 'C',
    mark: 'C',
    extension: 'c',
    extensions: ['c', 'h'],
    monacoLanguage: 'c',
    tabSize: 4,
    runtimeName: 'Clang 22 · WebAssembly',
    analyzerName: 'C · analizador estructural',
    diagram: 'generic',
  },
  cpp: {
    id: 'cpp',
    label: 'C++',
    mark: 'C++',
    extension: 'cpp',
    extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'],
    monacoLanguage: 'cpp',
    tabSize: 4,
    runtimeName: 'Clang 22 · WebAssembly',
    analyzerName: 'C++ · analizador estructural',
    diagram: 'generic',
  },
  csharp: {
    id: 'csharp',
    label: 'C#',
    mark: 'C#',
    extension: 'cs',
    extensions: ['cs'],
    monacoLanguage: 'csharp',
    tabSize: 4,
    runtimeName: 'Sin runtime en el navegador',
    analyzerName: 'C# · analizador estructural',
    diagram: 'generic',
  },
  go: {
    id: 'go',
    label: 'Go',
    mark: 'Go',
    extension: 'go',
    extensions: ['go'],
    monacoLanguage: 'go',
    tabSize: 4,
    runtimeName: 'Yaegi · WebAssembly',
    analyzerName: 'Go · analizador estructural',
    diagram: 'generic',
  },
  rust: {
    id: 'rust',
    label: 'Rust',
    mark: 'Rs',
    extension: 'rs',
    extensions: ['rs'],
    monacoLanguage: 'rust',
    tabSize: 4,
    runtimeName: 'Sin runtime en el navegador',
    analyzerName: 'Rust · analizador estructural',
    diagram: 'generic',
  },
}

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_DEFINITIONS) as Language[]

const LANGUAGE_IDS = new Set<string>(SUPPORTED_LANGUAGES)

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && LANGUAGE_IDS.has(value)
}

export function getLanguageDefinition(language: Language): LanguageDefinition {
  return LANGUAGE_DEFINITIONS[language]
}

export function languageFromFileName(name: string): Language | null {
  const lowerName = name.toLowerCase()
  let match: Language | null = null
  let matchLength = 0
  for (const language of SUPPORTED_LANGUAGES) {
    for (const extension of LANGUAGE_DEFINITIONS[language].extensions) {
      const suffix = `.${extension}`
      if (lowerName.endsWith(suffix) && suffix.length > matchLength) {
        match = language
        matchLength = suffix.length
      }
    }
  }
  return match
}

export function acceptedFileExtensions(): string {
  return SUPPORTED_LANGUAGES
    .flatMap((language) => LANGUAGE_DEFINITIONS[language].extensions.map((extension) => `.${extension}`))
    .join(',')
}

function javaClassName(code: string): string {
  const withoutComments = code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
  const publicType = withoutComments.match(/\bpublic\s+(?:final\s+|abstract\s+|sealed\s+|non-sealed\s+)?(?:class|record|enum|interface)\s+([A-Za-z_]\w*)/)
  const anyType = withoutComments.match(/\b(?:class|record|enum|interface)\s+([A-Za-z_]\w*)/)
  return publicType?.[1] ?? anyType?.[1] ?? 'Main'
}

