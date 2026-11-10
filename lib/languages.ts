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

export interface RuntimeCommand {
  cmd: string
  args: string[]
  phase: 'compile' | 'run'
}

export interface RuntimePlan {
  filename: string
  check: string
  installPackages: string[]
  compile?: RuntimeCommand
  run: RuntimeCommand
}

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
    runtimeName: 'Node 24 · aislado',
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
    runtimeName: 'Bun · aislado',
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
    runtimeName: 'Python 3.14 · aislado',
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
    runtimeName: 'Lua 5.4 · aislado',
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
    runtimeName: 'OpenJDK · aislado',
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
    runtimeName: 'GCC · aislado',
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
    runtimeName: 'G++ · aislado',
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
    runtimeName: 'Mono · aislado',
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
    runtimeName: 'Go · aislado',
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
    runtimeName: 'Rust · aislado',
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

export function getRuntimePlan(language: Language, code: string): RuntimePlan {
  switch (language) {
    case 'javascript':
      return {
        filename: 'main.mjs',
        check: 'node',
        installPackages: [],
        run: { cmd: 'node', args: ['--max-old-space-size=256', 'main.mjs'], phase: 'run' },
      }
    case 'typescript':
      return {
        filename: 'main.ts',
        check: 'bun',
        installPackages: [],
        run: { cmd: 'bun', args: ['main.ts'], phase: 'run' },
      }
    case 'python':
      return {
        filename: 'main.py',
        check: 'python3',
        installPackages: [],
        run: { cmd: 'python3', args: ['main.py'], phase: 'run' },
      }
    case 'lua':
      return {
        filename: 'main.lua',
        check: 'lua5.4',
        installPackages: ['lua5.4'],
        run: { cmd: 'lua5.4', args: ['main.lua'], phase: 'run' },
      }
    case 'java': {
      const className = javaClassName(code)
      return {
        filename: `${className}.java`,
        check: 'javac',
        installPackages: ['default-jdk-headless'],
        compile: { cmd: 'javac', args: [`${className}.java`], phase: 'compile' },
        run: { cmd: 'java', args: [className], phase: 'run' },
      }
    }
    case 'c':
      return {
        filename: 'main.c',
        check: 'gcc',
        installPackages: ['gcc'],
        compile: { cmd: 'gcc', args: ['main.c', '-O2', '-o', 'main'], phase: 'compile' },
        run: { cmd: './main', args: [], phase: 'run' },
      }
    case 'cpp':
      return {
        filename: 'main.cpp',
        check: 'g++',
        installPackages: ['g++'],
        compile: { cmd: 'g++', args: ['main.cpp', '-O2', '-o', 'main'], phase: 'compile' },
        run: { cmd: './main', args: [], phase: 'run' },
      }
    case 'csharp':
      return {
        filename: 'Program.cs',
        check: 'mcs',
        installPackages: ['mono-mcs'],
        compile: { cmd: 'mcs', args: ['Program.cs', '-out:Program.exe'], phase: 'compile' },
        run: { cmd: 'mono', args: ['Program.exe'], phase: 'run' },
      }
    case 'go':
      return {
        filename: 'main.go',
        check: 'go',
        installPackages: ['golang-go'],
        run: { cmd: 'go', args: ['run', 'main.go'], phase: 'run' },
      }
    case 'rust':
      return {
        filename: 'main.rs',
        check: 'rustc',
        installPackages: ['rustc'],
        compile: { cmd: 'rustc', args: ['main.rs', '-O', '-o', 'main'], phase: 'compile' },
        run: { cmd: './main', args: [], phase: 'run' },
      }
  }
}
