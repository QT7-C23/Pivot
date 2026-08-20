import { Bot, BookOpen, BrainCircuit, Check, Cpu, Globe2, Info, Keyboard, Monitor, Palette, Plug, Puzzle, Radio, RefreshCcw, SlidersHorizontal, XCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { APP_VERSION } from '../../shared/app-version'
import type { ApplicationUpdateStatus } from '../../shared/application-update'
import type { AgentAdapterInfo, AgentCliMaintenanceAction, AgentCliMaintenanceResult, AgentCliProfile, AgentCliProfileId } from '../../shared/types/domain'
import { getLocaleOptions, type MessageKey } from '../i18n/locale'
import { useLocale } from '../i18n/locale-context'
import type { ReasoningEffort, ThemeMode } from '../stores/ui.store'
import { useUpdateStore } from '../stores/update.store'
import { useAxisShadowStore } from '../stores/axis-shadow.store'
import { PluginEcosystemPage } from './plugin-ecosystem-page'
import { ProviderSettings } from './provider-workspace'

type SettingsSectionId = 'provider' | 'model' | 'agent' | 'appearance' | 'language' | 'shortcuts' | 'mcp' | 'plugins' | 'cookbook' | 'about'

const SETTINGS_SECTIONS: Array<{ id: SettingsSectionId; labelKey: MessageKey; icon: LucideIcon }> = [
  { id: 'provider', labelKey: 'settings.nav.provider', icon: Radio },
  { id: 'model', labelKey: 'settings.nav.model', icon: Cpu },
  { id: 'agent', labelKey: 'settings.nav.agent', icon: Bot },
  { id: 'appearance', labelKey: 'settings.nav.appearance', icon: Palette },
  { id: 'language', labelKey: 'settings.nav.language', icon: Globe2 },
  { id: 'shortcuts', labelKey: 'settings.nav.shortcuts', icon: Keyboard },
  { id: 'mcp', labelKey: 'settings.nav.mcp', icon: Plug },
  { id: 'plugins', labelKey: 'settings.nav.plugins', icon: Puzzle },
  { id: 'cookbook', labelKey: 'settings.nav.cookbook', icon: Monitor },
  { id: 'about', labelKey: 'settings.nav.about', icon: Info },
]

export interface SettingsWorkspaceProps {
  adapterInfo: AgentAdapterInfo | null
  lastMaintenanceResult: AgentCliMaintenanceResult | null
  maintenanceInProgress: string | null
  onClose: () => void
  profiles: AgentCliProfile[]
  reasoningEffort: ReasoningEffort
  runCliMaintenance: (profileId: AgentCliProfileId, action: AgentCliMaintenanceAction) => Promise<void>
  selectCliProfile: (profileId: AgentCliProfileId) => Promise<void>
  setReasoningEffort: (effort: ReasoningEffort) => void
  setTheme: (theme: ThemeMode) => void
  theme: ThemeMode
}

export function SettingsWorkspace(props: SettingsWorkspaceProps): ReactElement {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('provider')
  const { t } = useLocale()
  return (
    <section className="settings-layout">
      <header className="settings-header"><h1>{t('settings.title')}</h1><button aria-label={t('settings.close')} className="settings-close" onClick={props.onClose} type="button"><XCircle size={16} /></button></header>
      <div className="settings-body">
        <nav aria-label={t('settings.categories')} className="settings-navigation">
          {SETTINGS_SECTIONS.map(({ id, icon: Icon, labelKey }) => <button aria-current={activeSection === id ? 'page' : undefined} className={activeSection === id ? 'active' : ''} key={id} onClick={() => setActiveSection(id)} type="button"><Icon size={16} /><span>{t(labelKey)}</span></button>)}
        </nav>
        <main className="settings-content">
          {activeSection === 'provider' && <ProviderPage />}
          {activeSection === 'model' && <ModelPage {...props} />}
          {activeSection === 'agent' && <AgentPage {...props} />}
          {activeSection === 'appearance' && <AppearancePage setTheme={props.setTheme} theme={props.theme} />}
          {activeSection === 'language' && <LanguagePage />}
          {activeSection === 'shortcuts' && <ShortcutsPage />}
          {activeSection === 'mcp' && <RoadmapPage descriptionKey="settings.mcp.description" icon={Plug} title="MCP" version="v1.0" />}
          {activeSection === 'plugins' && <PluginEcosystemPage />}
          {activeSection === 'cookbook' && <RoadmapPage descriptionKey="settings.cookbook.description" icon={BookOpen} titleKey="settings.cookbook.title" version="v1.0" />}
          {activeSection === 'about' && <AboutPage />}
        </main>
      </div>
    </section>
  )
}

function ProviderPage(): ReactElement {
  const { t } = useLocale()
  return <SettingsPage heading={t('settings.nav.provider')} description={t('settings.provider.description')}><ProviderSettings /></SettingsPage>
}

function ModelPage({ adapterInfo, reasoningEffort, setReasoningEffort }: SettingsWorkspaceProps): ReactElement {
  const { t } = useLocale()
  const levels: Array<{ value: ReasoningEffort; name: string; descriptionKey: MessageKey }> = [
    { value: 5, name: 'Deep', descriptionKey: 'settings.model.level.deep' }, { value: 4, name: 'Balanced-Deep', descriptionKey: 'settings.model.level.balancedDeep' },
    { value: 3, name: 'Moderate', descriptionKey: 'settings.model.level.moderate' }, { value: 2, name: 'Balanced-Fast', descriptionKey: 'settings.model.level.balancedFast' },
    { value: 1, name: 'Fast', descriptionKey: 'settings.model.level.fast' },
  ]
  const selected = levels.find((level) => level.value === reasoningEffort)!
  const tasks: MessageKey[] = ['settings.model.task.review', 'settings.model.task.development', 'settings.model.task.architecture']
  return <SettingsPage heading={t('settings.model.title')} description={t('settings.model.description')}>
    <div className="settings-field-grid"><InfoCard label={t('settings.model.currentRuntime')} value={adapterInfo?.label ?? t('common.loading')} /><InfoCard label={t('settings.model.adapterType')} value={adapterInfo?.kind ?? 'unknown'} /></div>
    <section className="settings-card reasoning-card"><div className="settings-card-heading"><div><h3>{t('settings.model.reasoningLevel')}</h3><p>Reasoning Level</p></div><SlidersHorizontal size={18} /></div><input aria-label={t('settings.model.reasoningLevel')} max={5} min={1} onChange={(event) => setReasoningEffort(Number(event.target.value) as ReasoningEffort)} style={{ '--reasoning-progress': `${((reasoningEffort - 1) / 4) * 100}%` } as CSSProperties} type="range" value={reasoningEffort} /><div className="reasoning-axis"><span>🚀 {t('settings.model.speed')}</span><span>{t('settings.model.quality')} 🐢</span></div><div className="reasoning-levels">{levels.map((level) => <button className={level.value === reasoningEffort ? 'active' : ''} key={level.value} onClick={() => setReasoningEffort(level.value)} type="button"><strong>{level.value} {level.name}</strong><span>{t(level.descriptionKey)}</span></button>)}</div></section>
    <section className="routing-preview"><h3>{t('settings.model.routingPreview')}</h3><div className="routing-row header"><span>{t('settings.model.taskType')}</span><span>{t('settings.model.defaultRuntime')}</span><span>{t('settings.model.reasoningLevel')}</span></div>{tasks.map((taskKey) => <div className="routing-row" key={taskKey}><span>{t(taskKey)}</span><span>{adapterInfo?.label ?? t('common.notConfigured')}</span><span className="routing-effort">{reasoningEffort} {selected.name}</span></div>)}</section>
  </SettingsPage>
}

function AgentPage({ adapterInfo, lastMaintenanceResult, maintenanceInProgress, profiles, runCliMaintenance, selectCliProfile }: SettingsWorkspaceProps): ReactElement {
  const { locale, t } = useLocale()
  const shadowState = useAxisShadowStore((state) => state.state)
  const dryRunState = useAxisShadowStore((state) => state.dryRunState)
  const loadShadowState = useAxisShadowStore((state) => state.loadState)
  const setShadowEnabled = useAxisShadowStore((state) => state.setShadowEnabled)
  const setDryRunEnabled = useAxisShadowStore((state) => state.setDryRunEnabled)
  useEffect(() => { void loadShadowState() }, [loadShadowState])
  const shadowCopy = locale === 'zh-CN'
    ? { title: 'Axis 影子规划', description: '默认关闭。开启后仅在你主动生成规划时调用当前 Provider，不执行文件修改或命令。', on: '已开启', off: '已关闭' }
    : { title: 'Axis Shadow planning', description: 'Shadow planning is off by default. When enabled, it calls the active Provider only after you request a plan and never executes files or commands.', on: 'Enabled', off: 'Disabled' }
  const dryRunCopy = locale === 'zh-CN'
    ? { title: 'Axis 模拟执行', description: '独立默认关闭。仅模拟 DAG 状态、依赖和预算，不调用工具、不运行命令，也不修改文件。', on: '已开启', off: '已关闭' }
    : { title: 'Axis Dry-run execution', description: 'Dry-run execution is independently off by default. It simulates DAG state, dependencies, and budgets without tools, commands, or file changes.', on: 'Enabled', off: 'Disabled' }
  return <SettingsPage heading="Agent" description={t('settings.agent.description')}>
    <div className="settings-field-grid"><InfoCard label={t('settings.agent.adapter')} value={adapterInfo?.kind ?? 'unknown'} /><InfoCard label={t('settings.agent.command')} value={adapterInfo?.command ?? 'Pivot Local Runtime'} /></div>
    <section className="settings-card axis-shadow-card"><div><BrainCircuit size={18} /><span><strong>{shadowCopy.title}</strong><small>{shadowCopy.description}</small></span></div><button aria-checked={shadowState?.enabled ?? false} className={shadowState?.enabled ? 'active' : ''} onClick={() => void setShadowEnabled(!(shadowState?.enabled ?? false))} role="switch" type="button"><i />{shadowState?.enabled ? shadowCopy.on : shadowCopy.off}</button></section>
    <section className="settings-card axis-shadow-card axis-dry-run-card"><div><Cpu size={18} /><span><strong>{dryRunCopy.title}</strong><small>{dryRunCopy.description}</small></span></div><button aria-checked={dryRunState?.enabled ?? false} className={dryRunState?.enabled ? 'active' : ''} onClick={() => void setDryRunEnabled(!(dryRunState?.enabled ?? false))} role="switch" type="button"><i />{dryRunState?.enabled ? dryRunCopy.on : dryRunCopy.off}</button></section>
    <section className="cli-profile-list">{profiles.map((profile) => <article className={profile.isSelected ? 'cli-profile active' : 'cli-profile'} key={profile.id}><div className="cli-profile-main"><strong>{profile.label}</strong><span>{profile.adapterCommand ?? t('settings.agent.localRuntime')}</span></div><div className="cli-profile-actions"><button className="icon-label-button" disabled={profile.isSelected} onClick={() => void selectCliProfile(profile.id)} type="button"><Check size={14} /><span>{profile.isSelected ? t('common.selected') : t('common.use')}</span></button><button className="icon-label-button" disabled={!profile.versionCommand || maintenanceInProgress !== null} onClick={() => void runCliMaintenance(profile.id, 'version')} type="button"><RefreshCcw className={maintenanceInProgress === `${profile.id}:version` ? 'spin' : ''} size={14} /><span>{t('common.refreshVersion')}</span></button><button className="icon-label-button" disabled={!profile.updateCommand || maintenanceInProgress !== null} onClick={() => void runCliMaintenance(profile.id, 'update')} type="button"><RefreshCcw className={maintenanceInProgress === `${profile.id}:update` ? 'spin' : ''} size={14} /><span>{t('common.update')}</span></button></div></article>)}</section>
    {lastMaintenanceResult && <section className={`cli-maintenance-result ${lastMaintenanceResult.unavailable ? 'unavailable' : ''}`}><div className="message-meta"><span>{lastMaintenanceResult.unavailable ? t('settings.agent.cliUnavailable') : lastMaintenanceResult.action === 'version' ? t('common.refreshVersion') : t('common.update')}</span><time>{lastMaintenanceResult.command}</time></div><pre>{lastMaintenanceResult.output || `Exit code ${lastMaintenanceResult.exitCode}`}</pre></section>}
    <div className="settings-note">{t('settings.agent.customNote')}</div>
  </SettingsPage>
}

function AppearancePage({ setTheme, theme }: { setTheme: (theme: ThemeMode) => void; theme: ThemeMode }): ReactElement {
  const { t } = useLocale()
  return <SettingsPage heading={t('settings.appearance.title')} description={t('settings.appearance.description')}><SettingChoices label={t('settings.appearance.theme')} options={[['system', t('settings.appearance.system')], ['dark', t('settings.appearance.dark')], ['light', t('settings.appearance.light')]]} value={theme} onChange={(value) => setTheme(value as ThemeMode)} /></SettingsPage>
}

function LanguagePage(): ReactElement {
  const { locale, setLocale, t } = useLocale()
  return <SettingsPage heading={t('settings.language.title')} description={t('settings.language.description')}><label className="settings-select-label">{t('settings.language.interfaceLanguage')}<select onChange={(event) => setLocale(event.target.value as typeof locale)} value={locale}>{getLocaleOptions().map(({ label, value }) => <option key={value} value={value}>{label}</option>)}</select></label><div className="settings-note">{t('settings.language.supportedHint')}</div></SettingsPage>
}

function ShortcutsPage(): ReactElement {
  const { t } = useLocale()
  const shortcuts: Array<[MessageKey, string]> = [['settings.shortcuts.quickCapture', 'Alt + Space'], ['settings.shortcuts.openSettings', 'Ctrl/Cmd + ,'], ['settings.shortcuts.switchChat', 'Ctrl/Cmd + 1'], ['settings.shortcuts.switchIde', 'Ctrl/Cmd + 2'], ['settings.shortcuts.openTerminal', 'Ctrl/Cmd + `'], ['settings.shortcuts.closeSettings', 'Esc']]
  return <SettingsPage heading={t('settings.shortcuts.title')} description={t('settings.shortcuts.description')}><div className="shortcut-list">{shortcuts.map(([labelKey, keys]) => <div key={labelKey}><span>{t(labelKey)}</span><kbd>{keys}</kbd></div>)}</div></SettingsPage>
}

function RoadmapPage({ descriptionKey, icon: Icon, title, titleKey, version }: { descriptionKey: MessageKey; icon: LucideIcon; title?: string; titleKey?: MessageKey; version: string }): ReactElement {
  const { t } = useLocale()
  return <SettingsPage heading={title ?? t(titleKey!)} description={t(descriptionKey)}><section className="roadmap-card"><Icon size={28} /><div><strong>{t('settings.roadmap.capability', { version })}</strong><p>{t('settings.roadmap.notice')}</p></div></section></SettingsPage>
}

function AboutPage(): ReactElement {
  const { t } = useLocale()
  const updateState = useUpdateStore((state) => state.state)
  const loadUpdates = useUpdateStore((state) => state.load)
  const checkUpdates = useUpdateStore((state) => state.check)
  const downloadUpdate = useUpdateStore((state) => state.download)
  const installUpdate = useUpdateStore((state) => state.install)
  useEffect(() => { void loadUpdates() }, [loadUpdates])
  const status = updateState?.status ?? 'unavailable'
  return <SettingsPage heading={t('settings.about.title')} description={t('settings.about.description')}>
    <div className="about-mark"><Cpu size={30} /><div><strong>Pivot {APP_VERSION}</strong><span>{t('settings.about.stack')}</span></div></div>
    <section className={`update-status-card status-${status}`}>
      <div><span>{t('settings.about.updates')}</span><strong>{t(UPDATE_STATUS_KEYS[status])}</strong><p>{updateState?.message ?? (updateState?.availableVersion ? t('settings.about.versionAvailable', { version: updateState.availableVersion }) : t('settings.about.updateHint'))}</p></div>
      {status === 'downloading' && <progress max={100} value={updateState?.progress ?? 0} />}
      <div className="update-actions">
        {status === 'available' && <button className="primary-button" onClick={() => void downloadUpdate()} type="button">{t('settings.about.downloadUpdate')}</button>}
        {status === 'downloaded' && <button className="primary-button" onClick={() => void installUpdate()} type="button">{t('settings.about.restartInstall')}</button>}
        {status !== 'available' && status !== 'downloaded' && <button className="secondary-button" disabled={status === 'unavailable' || status === 'checking' || status === 'downloading'} onClick={() => void checkUpdates()} type="button"><RefreshCcw className={status === 'checking' ? 'spin' : ''} size={14} />{t('settings.about.checkUpdates')}</button>}
      </div>
    </section>
    <div className="settings-note">{t('settings.about.note')}</div>
  </SettingsPage>
}

const UPDATE_STATUS_KEYS: Record<ApplicationUpdateStatus, MessageKey> = {
  unavailable: 'settings.about.update.unavailable', idle: 'settings.about.update.idle', checking: 'settings.about.update.checking', available: 'settings.about.update.available', downloading: 'settings.about.update.downloading', downloaded: 'settings.about.update.downloaded', 'up-to-date': 'settings.about.update.upToDate', error: 'settings.about.update.error',
}

function SettingsPage({ children, description, heading }: { children: ReactNode; description: string; heading: string }): ReactElement {
  return <div className="settings-page"><header><h2>{heading}</h2><p>{description}</p></header>{children}</div>
}

function InfoCard({ label, value }: { label: string; value: string }): ReactElement { return <div className="settings-info-card"><span>{label}</span><strong>{value}</strong></div> }

function SettingChoices({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: string[][]; value: string }): ReactElement {
  return <section className="settings-choice-group"><h3>{label}</h3><div>{options.map(([optionValue, optionLabel]) => <button className={value === optionValue ? 'active' : ''} key={optionValue} onClick={() => onChange(optionValue!)} type="button"><Check size={14} />{optionLabel}</button>)}</div></section>
}
