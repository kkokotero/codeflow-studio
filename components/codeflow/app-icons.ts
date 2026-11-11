import {
  ArrowLeft,
  ArrowLeftRight,
  Braces,
  Box,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CirclePlay,
  CircleStop,
  Copy,
  Download,
  Ellipsis,
  FileCode2,
  FileInput,
  FilePlus2,
  Flag,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  History,
  House,
  Info,
  Keyboard,
  Languages,
  Layers3,
  LayoutGrid,
  ListTree,
  Monitor,
  Moon,
  MoveRight,
  Network,
  Palette,
  Pencil,
  Play,
  Repeat2,
  ScanSearch,
  Sun,
  Terminal,
  Trash2,
  Trophy,
  Undo2,
  Upload,
  Variable,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import type { NodeKind } from '@/lib/codeflow-types'

/**
 * Registro único de glifos de la aplicación.
 *
 * Cada acción semántica tiene un solo icono y un solo nombre para que el mismo
 * significado se dibuje siempre igual, en cualquier panel o menú. Los nodos
 * del diagrama también salen de aquí: cada tipo de nodo tiene una forma
 * icónica distinta para que se distingan de un vistazo.
 */
export const APP_ICONS = {
  // Acciones de la aplicación
  run: Play,
  stop: CircleStop,
  import: Upload,
  exportFile: Download,
  exportProject: Network,
  exportDiagram: GitBranch,
  newFile: FilePlus2,
  newFolder: FolderPlus,
  rename: Pencil,
  duplicate: Copy,
  delete: Trash2,
  copy: Copy,
  download: Download,
  more: Ellipsis,
  home: House,
  open: FolderOpen,
  move: MoveRight,
  apply: Check,
  appearance: Palette,
  layout: LayoutGrid,
  appearanceLight: Sun,
  appearanceDark: Moon,
  appearanceSystem: Monitor,
  help: Keyboard,
  trophy: Trophy,
  back: ArrowLeft,
  info: Info,
  close: X,
  analysis: ScanSearch,
  languages: Languages,
  // Paneles y destinos
  code: FileCode2,
  flow: GitBranch,
  console: Terminal,
  inspector: ListTree,
  symbols: ListTree,
  history: History,
  files: Folder,
  folder: Folder,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,

  // Nodos del diagrama
  nodeStart: CirclePlay,
  nodeEnd: CircleStop,
  nodeConnector: Circle,
  nodeIo: ArrowLeftRight,
  nodeFunction: Braces,
  nodeVariable: Variable,
  nodeObject: Box,
  nodeEvent: Zap,
  nodeCondition: GitBranch,
  nodeLoop: Repeat2,
  nodeClass: Layers3,
  nodeCall: Undo2,
  nodeReturn: Undo2,
  nodeImport: FileInput,
  nodeStatement: Calculator,
  nodeOperation: Calculator,
  nodePhase: Flag,
} as const satisfies Record<string, LucideIcon>

export type AppIconName = keyof typeof APP_ICONS

/** Despliegue de un icono de la aplicación a un componente de lucide. */
export function appIcon(name: AppIconName): LucideIcon {
  return APP_ICONS[name]
}

/**
 * Glifo de cada tipo de nodo. Un tipo, un glifo: el diagrama y la lista de
 * símbolos dibujan la misma categoría con la misma forma.
 */
export const NODE_ICONS: Record<NodeKind, LucideIcon> = {
  start: APP_ICONS.nodeStart,
  end: APP_ICONS.nodeEnd,
  connector: APP_ICONS.nodeConnector,
  io: APP_ICONS.nodeIo,
  function: APP_ICONS.nodeFunction,
  variable: APP_ICONS.nodeVariable,
  object: APP_ICONS.nodeObject,
  event: APP_ICONS.nodeEvent,
  condition: APP_ICONS.nodeCondition,
  loop: APP_ICONS.nodeLoop,
  class: APP_ICONS.nodeClass,
  call: APP_ICONS.nodeCall,
  return: APP_ICONS.nodeReturn,
  import: APP_ICONS.nodeImport,
  statement: APP_ICONS.nodeStatement,
  operation: APP_ICONS.nodeOperation,
  phase: APP_ICONS.nodePhase,
}
