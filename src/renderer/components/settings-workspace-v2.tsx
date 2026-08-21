import { useState, type ReactElement } from 'react'
import type { ReasoningEffort } from '../stores/ui.store'
import { useLocale } from '../i18n/locale-context'
import type { SettingsRuntimeProps } from './settings-core-pages'
import {
  AboutSettingsPage,
  AppearanceSettingsPage,
  GeneralSettingsPage,
  ShortcutsSettingsPage,
  UpdatesSettingsPage,
} from './settings-core-pages'
import { getSettingsCopy } from './settings-copy'
import { SETTINGS_GROUPS, type SettingsSectionId } from './settings-contract'
import { ModelsProvidersSettings } from './provider-settings-figma'
import { SearchControl, SettingsEmptyState } from './settings-controls'
import { FeedbackSettingsPage } from './feedback-settings-page'

export interface SettingsWorkspaceProps extends SettingsRuntimeProps {
  onClose: () => void
  reasoningEffort: ReasoningEffort
  setReasoningEffort: (effort: ReasoningEffort) => void
}

const FIGMA_SCREEN: Record<SettingsSectionId, string> = {
  general: '818:4102', appearance: '818:4269', providers: '1171:9637', runtimes: '818:11341', agents: '818:4642', skills: '818:4820', commands: '818:12358', mcp: '818:5141', plugins: '818:5444', downloads: '818:11070', automations: '818:5762', privacy: '818:4457', data: '818:5929', updates: '818:6184', shortcuts: '818:6343', advanced: '818:6499', feedback: '818:18002', about: '818:6686',
}

export const FIGMA_PROVIDER_SCREENS = {
  connection: '1171:9637',
  routing: '1171:11360',
  anthropicConnected: '1405:10653',
  openAiActive: '1405:11063',
  geminiActive: '1405:11501',
  mistralSetup: '1405:11877',
  bedrockConnected: '1406:11244',
  ollamaRunning: '1406:11690',
  anthropicRateLimited: '1406:12069',
  openAiAuthFailed: '1406:12440',
} as const

function isPlaceholderSection(id: SettingsSectionId): boolean {
  return id === 'runtimes'
    || id === 'agents'
    || id === 'skills'
    || id === 'commands'
    || id === 'mcp'
    || id === 'plugins'
    || id === 'downloads'
    || id === 'automations'
    || id === 'privacy'
    || id === 'data'
    || id === 'advanced'
}

export function SettingsWorkspace(props: SettingsWorkspaceProps): ReactElement {
  const { locale } = useLocale()
  const copy = getSettingsCopy(locale)
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general')
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase(locale)
  const visibleGroups = SETTINGS_GROUPS.map((group) => {
    const groupMatches = copy.group(group.id).toLocaleLowerCase(locale).includes(normalizedQuery)
    const items = group.items.filter((item) => groupMatches || `${copy.section(item.id)} ${item.label}`.toLocaleLowerCase(locale).includes(normalizedQuery))
    return { ...group, items }
  }).filter((group) => group.items.length > 0)
  const unavailableDescription = locale === 'zh-CN'
    ? '此页面在设计稿中使用的是演示占位信息；生产能力接入前不会显示虚构数据或可点击的假操作。'
    : 'The design uses demonstration placeholders here. Pivot will not show invented data or inactive actions until production backing exists.'

  return <section className="pv-settings-layout" data-figma-screen={FIGMA_SCREEN[activeSection]}>
    <aside className="pv-settings-navigation">
      <header>
        <strong>{copy.settings}</strong>
        <SearchControl ariaLabel={copy.search} className="pv-settings-nav-search" onChange={setQuery} placeholder={copy.search} value={query} />
      </header>
      <nav aria-label={copy.categories}>
        {visibleGroups.map((group) => <section key={group.id}><h2>{copy.group(group.id)}</h2>{group.items.map(({ icon: Icon, id }) => <button aria-current={activeSection === id ? 'page' : undefined} className={activeSection === id ? 'active' : ''} key={id} onClick={() => setActiveSection(id)} type="button">{activeSection === id && <i aria-hidden="true" />}<Icon aria-hidden="true" size={14} /><span>{copy.section(id)}</span></button>)}</section>)}
        {visibleGroups.length === 0 && <p className="pv-settings-search-empty">{locale === 'zh-CN' ? '没有匹配的设置' : 'No settings found'}</p>}
      </nav>
    </aside>
    <main className={`pv-settings-content section-${activeSection}`} data-placeholder={isPlaceholderSection(activeSection) || undefined}>
      {activeSection === 'general' && <GeneralSettingsPage />}
      {activeSection === 'appearance' && <AppearanceSettingsPage setTheme={props.setTheme} theme={props.theme} />}
      {activeSection === 'providers' && <ModelsProvidersSettings />}
      {activeSection === 'runtimes' && <SettingsEmptyState description={unavailableDescription} title={copy.section('runtimes')} />}
      {activeSection === 'agents' && <SettingsEmptyState description={unavailableDescription} title={copy.section('agents')} />}
      {activeSection === 'skills' && <SettingsEmptyState description={unavailableDescription} title={copy.section('skills')} />}
      {activeSection === 'commands' && <SettingsEmptyState description={unavailableDescription} title={copy.section('commands')} />}
      {activeSection === 'mcp' && <SettingsEmptyState description={unavailableDescription} title={copy.section('mcp')} />}
      {activeSection === 'plugins' && <SettingsEmptyState description={unavailableDescription} title={copy.section('plugins')} />}
      {activeSection === 'downloads' && <SettingsEmptyState description={unavailableDescription} title={copy.section('downloads')} />}
      {activeSection === 'automations' && <SettingsEmptyState description={unavailableDescription} title={copy.section('automations')} />}
      {activeSection === 'privacy' && <SettingsEmptyState description={unavailableDescription} title={copy.section('privacy')} />}
      {activeSection === 'data' && <SettingsEmptyState description={unavailableDescription} title={copy.section('data')} />}
      {activeSection === 'updates' && <UpdatesSettingsPage />}
      {activeSection === 'shortcuts' && <ShortcutsSettingsPage />}
      {activeSection === 'advanced' && <SettingsEmptyState description={unavailableDescription} title={copy.section('advanced')} />}
      {activeSection === 'feedback' && <FeedbackSettingsPage />}
      {activeSection === 'about' && <AboutSettingsPage />}
    </main>
  </section>
}
