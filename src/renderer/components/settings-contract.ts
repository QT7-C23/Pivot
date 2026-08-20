import {
  Bot,
  BrainCircuit,
  Cable,
  Command,
  Download,
  HardDrive,
  Info,
  MessageSquareText,
  Keyboard,
  Palette,
  Puzzle,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Wrench,
  ShieldCheck,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

export type SettingsSectionId =
  | 'general'
  | 'appearance'
  | 'providers'
  | 'runtimes'
  | 'agents'
  | 'skills'
  | 'commands'
  | 'mcp'
  | 'plugins'
  | 'downloads'
  | 'automations'
  | 'privacy'
  | 'data'
  | 'updates'
  | 'shortcuts'
  | 'advanced'
  | 'feedback'
  | 'about'

export type SettingsGroupId = 'basics' | 'execution' | 'extensions' | 'marketplace' | 'automation' | 'security' | 'application'

export interface SettingsNavigationItem {
  icon: LucideIcon
  id: SettingsSectionId
  label: string
}

export interface SettingsNavigationGroup {
  id: SettingsGroupId
  items: SettingsNavigationItem[]
  label: string
}

export const SETTINGS_GROUPS: SettingsNavigationGroup[] = [
  { id: 'basics', label: 'BASICS', items: [
    { id: 'general', label: 'General', icon: SlidersHorizontal },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ] },
  { id: 'execution', label: 'AI & EXECUTION', items: [
    { id: 'providers', label: 'Models & Providers', icon: BrainCircuit },
    { id: 'runtimes', label: 'Runtimes & CLI', icon: Terminal },
    { id: 'agents', label: 'Agents', icon: Bot },
  ] },
  { id: 'extensions', label: 'EXTENSIONS', items: [
    { id: 'skills', label: 'Skills', icon: Sparkles },
    { id: 'commands', label: 'Slash Commands', icon: Command },
    { id: 'mcp', label: 'MCP & Connectors', icon: Cable },
    { id: 'plugins', label: 'Plugins', icon: Puzzle },
  ] },
  { id: 'marketplace', label: 'MARKETPLACE', items: [
    { id: 'downloads', label: 'Downloads', icon: Download },
  ] },
  { id: 'automation', label: 'AUTOMATION', items: [
    { id: 'automations', label: 'Automations', icon: Workflow },
  ] },
  { id: 'security', label: 'SECURITY & DATA', items: [
    { id: 'privacy', label: 'Privacy & Security', icon: ShieldCheck },
    { id: 'data', label: 'Data & Storage', icon: HardDrive },
  ] },
  { id: 'application', label: 'APPLICATION', items: [
    { id: 'updates', label: 'Updates', icon: RefreshCw },
    { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
    { id: 'advanced', label: 'Advanced', icon: Wrench },
    { id: 'feedback', label: 'Feedback', icon: MessageSquareText },
    { id: 'about', label: 'About', icon: Info },
  ] },
]

export const SETTINGS_SECTION_IDS = SETTINGS_GROUPS.flatMap((group) => group.items.map((item) => item.id))
