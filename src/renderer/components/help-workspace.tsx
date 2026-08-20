import { BookOpen, Bot, Code2, Command, Keyboard, Search, Settings, Sparkles, type LucideIcon } from 'lucide-react'
import { useMemo, useState, type ReactElement } from 'react'
import type { PivotRoute } from '../navigation/pivot-navigation'

const HELP_ENTRIES: ReadonlyArray<{ description: string; label: string; route: PivotRoute }> = [
  { description: 'Step-by-step setup and workspace guidance', label: 'Getting Started', route: 'docs' },
  { description: 'Connect and configure AI model providers', label: 'Models & Providers', route: 'settings' },
  { description: 'Extend Pivot with skills and slash commands', label: 'Skills & Commands', route: 'settings' },
  { description: 'Complete guide to all Pivot features', label: 'User Manual', route: 'docs' },
  { description: 'Master Pivot with shortcuts', label: 'Keyboard Shortcuts', route: 'settings' },
  { description: 'Build integrations with the Pivot API', label: 'API Reference', route: 'docs' },
  { description: 'Recipes for common workflows', label: 'Cookbook', route: 'docs' },
  { description: 'What changed in each version', label: 'Release Notes', route: 'settings' },
]

export function HelpWorkspace({ onNavigate }: { onNavigate: (route: PivotRoute) => void }): ReactElement {
  const [query, setQuery] = useState('')
  const entries = useMemo(() => HELP_ENTRIES.filter((entry) => !query.trim() || `${entry.label} ${entry.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [query])
  return <section className="pv-help-workspace" data-figma-screen="248:5476">
    <header><div><h1>Help &amp; Docs</h1><p>Browse guides, resources, and answers to get the most out of your workflow.</p></div><label><Search size={16} /><input aria-label="Search help articles" onChange={(event) => setQuery(event.target.value)} placeholder="Search help articles..." type="search" value={query} /></label></header>
    <h2>QUICK START</h2><div className="pv-help-quickstart"><HelpCard description="Set up your first session and run a task" icon={Sparkles} label="Getting Started" onClick={() => onNavigate('docs')} route="docs" /><HelpCard description="Connect and configure AI model providers" icon={Bot} label="Models & Providers" onClick={() => onNavigate('settings')} route="settings" /><HelpCard description="Extend Pivot with skills and slash commands" icon={Command} label="Skills & Commands" onClick={() => onNavigate('settings')} route="settings" /></div>
    <div className="pv-help-columns"><section><h2>FREQUENTLY ASKED QUESTIONS</h2>{entries.slice(0, 4).map((entry) => <HelpRow entry={entry} icon={Settings} key={entry.label} onNavigate={onNavigate} />)}</section><section><h2>RESOURCES</h2>{entries.slice(4).map((entry, index) => <HelpRow entry={entry} icon={[BookOpen, Keyboard, Code2, BookOpen][index] ?? BookOpen} key={entry.label} onNavigate={onNavigate} />)}</section></div>
  </section>
}

function HelpCard({ description, icon: Icon, label, onClick, route }: { description: string; icon: LucideIcon; label: string; onClick: () => void; route: PivotRoute }): ReactElement { return <button data-target-route={route} onClick={onClick} type="button"><Icon size={20} /><span><strong>{label}</strong><small>{description}</small><em>Start Guide →</em></span></button> }
function HelpRow({ entry, icon: Icon, onNavigate }: { entry: (typeof HELP_ENTRIES)[number]; icon: LucideIcon; onNavigate: (route: PivotRoute) => void }): ReactElement { return <button data-target-route={entry.route} onClick={() => onNavigate(entry.route)} type="button"><Icon size={17} /><span><strong>{entry.label}</strong><small>{entry.description}</small></span><em>⌄</em></button> }
