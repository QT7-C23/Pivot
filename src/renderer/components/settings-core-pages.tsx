import { AlertTriangle, Bot, Check, Command, Cpu, Database, FolderOpen, HardDrive, Info, Keyboard, Monitor, RefreshCcw, ShieldCheck, Terminal, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import { APP_VERSION } from '../../shared/app-version'
import { ELECTRON_RUNTIME_VERSION } from '../../shared/runtime-versions'
import {
  DEFAULT_APPLICATION_PREFERENCE_VALUES,
  type ApplicationPreferenceValues,
} from '../../shared/application-preferences'
import type { AgentAdapterInfo, AgentCliMaintenanceAction, AgentCliMaintenanceResult, AgentCliProfile, AgentCliProfileId } from '../../shared/types/domain'
import { getLocaleOptions } from '../i18n/locale'
import { useLocale } from '../i18n/locale-context'
import type { ThemeMode } from '../stores/ui.store'
import { useUpdateStore } from '../stores/update.store'
import { useApplicationPreferencesStore } from '../stores/application-preferences.store'
import { ActionButton, ListItem, SelectControl, SettingRow, SettingsPage, SettingsSection, Tag, Toggle, useStoredSetting } from './settings-controls'

export interface SettingsRuntimeProps {
  adapterInfo: AgentAdapterInfo | null
  lastMaintenanceResult: AgentCliMaintenanceResult | null
  maintenanceInProgress: string | null
  profiles: AgentCliProfile[]
  runCliMaintenance: (profileId: AgentCliProfileId, action: AgentCliMaintenanceAction) => Promise<void>
  selectCliProfile: (profileId: AgentCliProfileId) => Promise<void>
  setTheme: (theme: ThemeMode) => void
  theme: ThemeMode
}

export function GeneralSettingsPage(): ReactElement {
  const { locale, setLocale } = useLocale()
  const zh = locale === 'zh-CN'
  const preferences = useApplicationPreferencesStore((state) => state.preferences)
  const isLoading = useApplicationPreferencesStore((state) => state.isLoading)
  const error = useApplicationPreferencesStore((state) => state.error)
  const loadPreferences = useApplicationPreferencesStore((state) => state.load)
  const updatePreferences = useApplicationPreferencesStore((state) => state.update)
  const values = preferences?.values ?? DEFAULT_APPLICATION_PREFERENCE_VALUES

  useEffect(() => { if (!preferences) void loadPreferences() }, [loadPreferences, preferences])
  useEffect(() => {
    if (preferences && preferences.values.locale !== locale) setLocale(preferences.values.locale)
  }, [locale, preferences, setLocale])

  function updatePreference<K extends keyof ApplicationPreferenceValues>(
    key: K,
    value: ApplicationPreferenceValues[K],
  ): void {
    void updatePreferences({ [key]: value })
  }

  const disabled = isLoading || !preferences
  return <SettingsPage description={zh ? '设置 Pivot 的语言、启动方式和默认行为。' : 'Configure Pivot language, startup, and default behavior.'} title={zh ? '通用' : 'General'}>
    {error && <p className="pv-settings-inline-error" role="alert">{error}</p>}
    <SettingsSection title={zh ? '语言与区域' : 'LANGUAGE'}>
      <SettingRow description={zh ? '菜单、标签和系统消息所使用的语言' : 'Language used for menus, labels, and system messages'} label={zh ? '显示语言' : 'Display language'}><SelectControl ariaLabel="Display language" disabled={disabled} onChange={(value) => updatePreference('locale', value as ApplicationPreferenceValues['locale'])} options={getLocaleOptions().map(({ label, value }) => [value, label])} value={values.locale} /></SettingRow>
      <SettingRow description={zh ? '整个应用中日期的显示格式' : 'Format for dates throughout the application'} label={zh ? '日期格式' : 'Date format'}><SelectControl ariaLabel="Date format" disabled={disabled} onChange={(value) => updatePreference('dateFormat', value as ApplicationPreferenceValues['dateFormat'])} options={[["yyyy-mm-dd", "YYYY-MM-DD"], ["dd-mm-yyyy", "DD-MM-YYYY"], ["mm-dd-yyyy", "MM-DD-YYYY"]]} value={values.dateFormat} /></SettingRow>
      <SettingRow description={zh ? '使用 12 小时制或 24 小时制' : '12-hour or 24-hour clock display'} label={zh ? '时间格式' : 'Time format'}><SelectControl ariaLabel="Time format" disabled={disabled} onChange={(value) => updatePreference('timeFormat', value as ApplicationPreferenceValues['timeFormat'])} options={[["24", zh ? '24 小时制' : '24-hour'], ["12", zh ? '12 小时制' : '12-hour']]} value={values.timeFormat} /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '启动' : 'STARTUP'}>
      <SettingRow description={zh ? 'Pivot 启动时显示的页面' : 'What to show when Pivot starts'} label={zh ? '启动时打开' : 'Open on launch'}><SelectControl ariaLabel="Open on launch" disabled={disabled} onChange={(value) => updatePreference('openOnLaunch', value as ApplicationPreferenceValues['openOnLaunch'])} options={[["last", zh ? '上次工作区' : 'Last workspace'], ["home", zh ? '首页' : 'Home'], ["new", zh ? '新对话' : 'New conversation']]} value={values.openOnLaunch} /></SettingRow>
      <SettingRow description={zh ? '启动时自动恢复上次会话' : 'Automatically restore previous sessions on launch'} label={zh ? '恢复会话' : 'Restore sessions'}><Toggle checked={values.restoreSessions} disabled={disabled} label="Restore sessions" onChange={(value) => updatePreference('restoreSessions', value)} /></SettingRow>
      <SettingRow description={zh ? '启动 Pivot 后最小化至系统托盘' : 'Launch Pivot in the system tray'} label={zh ? '最小化启动' : 'Start minimized'}><Toggle checked={values.startMinimized} disabled={disabled} label="Start minimized" onChange={(value) => updatePreference('startMinimized', value)} /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '行为' : 'BEHAVIOR'}>
      <SettingRow description={zh ? '空闲后自动暂停会话' : 'Auto-pause sessions after inactivity'} label={zh ? '会话空闲超时' : 'Session timeout'}><SelectControl ariaLabel="Session timeout" disabled={disabled} onChange={(value) => updatePreference('sessionTimeout', value as ApplicationPreferenceValues['sessionTimeout'])} options={[["15", zh ? '15 分钟' : '15 minutes'], ["30", zh ? '30 分钟' : '30 minutes'], ["60", zh ? '1 小时' : '1 hour'], ["never", zh ? '永不' : 'Never']]} value={values.sessionTimeout} /></SettingRow>
      <SettingRow description={zh ? '哪些事件会触发桌面通知' : 'Which events trigger desktop notifications'} label={zh ? '通知级别' : 'Notification level'}><SelectControl ariaLabel="Notification level" disabled={disabled} onChange={(value) => updatePreference('notificationLevel', value as ApplicationPreferenceValues['notificationLevel'])} options={[["all", zh ? '全部事件' : 'All events'], ["failures", zh ? '仅失败' : 'Failures only'], ["none", zh ? '关闭' : 'Off']]} value={values.notificationLevel} /></SettingRow>
    </SettingsSection>
  </SettingsPage>
}

export function AppearanceSettingsPage({ setTheme, theme }: Pick<SettingsRuntimeProps, 'setTheme' | 'theme'>): ReactElement {
  const { locale } = useLocale()
  const zh = locale === 'zh-CN'
  const preferences = useApplicationPreferencesStore((state) => state.preferences)
  const isLoading = useApplicationPreferencesStore((state) => state.isLoading)
  const error = useApplicationPreferencesStore((state) => state.error)
  const loadPreferences = useApplicationPreferencesStore((state) => state.load)
  const updatePreferences = useApplicationPreferencesStore((state) => state.update)
  useEffect(() => { if (!preferences) void loadPreferences() }, [loadPreferences, preferences])
  useEffect(() => {
    if (preferences && preferences.values.theme !== theme) setTheme(preferences.values.theme)
  }, [preferences, setTheme, theme])

  function chooseTheme(value: ThemeMode): void {
    setTheme(value)
    void updatePreferences({ theme: value })
  }
  return <SettingsPage description={zh ? '选择 Pivot 的界面配色。该选择会安全保存，并在下次启动时恢复。' : 'Choose Pivot’s interface colors. Your choice is saved and restored on the next launch.'} title={zh ? '外观' : 'Appearance'}>
    {error && <p className="pv-settings-inline-error" role="alert">{error}</p>}
    <SettingsSection title={zh ? '主题' : 'THEME'}><div className="pv-theme-grid">{([['light', zh ? '浅色' : 'Light'], ['dark', zh ? '深色' : 'Dark'], ['system', zh ? '跟随系统' : 'System']] as Array<[ThemeMode, string]>).map(([value, label]) => <button className={theme === value ? 'active' : ''} disabled={isLoading || !preferences} key={value} onClick={() => chooseTheme(value)} type="button"><span className={`pv-theme-preview ${value}`}><i /><i /><i /></span><strong>{label}</strong>{theme === value && <Check size={13} />}</button>)}</div></SettingsSection>
  </SettingsPage>
}

export function RuntimesSettingsPage(_props: SettingsRuntimeProps): ReactElement {
  const { locale } = useLocale()
  const zh = locale === 'zh-CN'
  const [sandboxMode, setSandboxMode] = useStoredSetting('runtime-sandbox-mode', 'docker')
  const [networkAccess, setNetworkAccess] = useStoredSetting('runtime-network-access', true)
  const [resourceLimits, setResourceLimits] = useStoredSetting('runtime-resource-limits', '2cpu-4gb')
  const [persistWorkspace, setPersistWorkspace] = useStoredSetting('runtime-persist-workspace', false)
  const [mountProject, setMountProject] = useStoredSetting('runtime-mount-project', true)
  const [shell, setShell] = useStoredSetting('runtime-default-shell', 'powershell')
  const [terminalFont, setTerminalFont] = useStoredSetting('runtime-terminal-font', 'JetBrains Mono')
  const [scrollback, setScrollback] = useStoredSetting('runtime-scrollback', '10000')
  const [autoInstall, setAutoInstall] = useStoredSetting('runtime-auto-install', false)
  const localRuntimes = [
    ['Node.js', 'v20.11.0', zh ? '已检测' : 'Detected', 'node'],
    ['Python', '3.12.2', zh ? '已检测' : 'Detected', 'python'],
    ['Git', '2.43.0', zh ? '已检测' : 'Detected', 'git'],
    ['Docker', '24.0.7', zh ? '运行中' : 'Running', 'docker'],
    ['Deno', zh ? '未安装' : 'Not installed', zh ? 'PATH 中未找到' : 'Not found in PATH', 'deno'],
    ['Bun', '1.1.4', zh ? '有可用更新' : 'Update available', 'bun'],
  ]
  return <SettingsPage description={zh ? '管理本地与云端运行时、隔离策略、终端和 CLI 行为。' : 'Manage local and cloud runtimes, isolation, terminal, and CLI behavior.'} title={zh ? '运行时与 CLI' : 'Runtimes & CLI'}>
    <SettingsSection title={zh ? '本地运行时' : 'LOCAL RUNTIMES'}>
      {localRuntimes.map(([name, version, status, mark]) => <ListItem actions={<>{name === 'Bun' && <ActionButton>{zh ? '更新' : 'Update'}</ActionButton>}<ActionButton>{zh ? '配置' : 'Configure'}</ActionButton></>} description={status} icon={<span className="pv-runtime-mark">{mark.slice(0, 2).toUpperCase()}</span>} key={name} meta={<><Tag tone={status === 'Detected' || status === 'Running' || status === '已检测' || status === '运行中' ? 'accent' : 'warning'}>{version}</Tag></>} title={name} />)}
    </SettingsSection>
    <SettingsSection title={zh ? '云端运行时' : 'CLOUD RUNTIMES'}>
      <ListItem actions={<ActionButton>{zh ? '配置' : 'Configure'}</ActionButton>} description={zh ? '用于不受信任代码执行的远程沙箱' : 'Remote sandbox for untrusted code execution'} icon={<Bot size={16} />} meta={<><Tag>Sandbox</Tag><Tag>API</Tag></>} title="E2B Sandbox" />
      <ListItem actions={<ActionButton>{zh ? '配置' : 'Configure'}</ActionButton>} description={zh ? '用于模型推理的无服务器 GPU 计算' : 'Serverless GPU compute for model inference'} icon={<Bot size={16} />} meta={<><Tag>GPU</Tag><Tag>Serverless</Tag></>} title="Modal" />
      <ListItem actions={<ActionButton>{zh ? '配置' : 'Configure'}</ActionButton>} description={zh ? '用于全球部署的边缘容器运行时' : 'Edge container runtime for global deployment'} icon={<Bot size={16} />} meta={<><Tag>Container</Tag><Tag>Edge</Tag></>} title="Fly.io" />
      <button className="pv-settings-add-row" type="button"><span>+</span>{zh ? '添加云端运行时' : 'Add Cloud Runtime'}</button>
    </SettingsSection>
    <SettingsSection title={zh ? '沙箱与隔离' : 'SANDBOX & ISOLATION'}>
      <SettingRow description={zh ? '代码执行所使用的隔离方式' : 'Isolation method for code execution'} label={zh ? '沙箱模式' : 'Sandbox mode'}><SelectControl ariaLabel="Sandbox mode" onChange={setSandboxMode} options={[['docker', 'Docker'], ['process', zh ? '受限进程' : 'Restricted process'], ['none', zh ? '无' : 'None']]} value={sandboxMode} /></SettingRow>
      <SettingRow description={zh ? '允许沙箱进程访问网络' : 'Allow sandboxed processes to access network'} label={zh ? '网络访问' : 'Network access'}><Toggle checked={networkAccess} label="Network access" onChange={setNetworkAccess} /></SettingRow>
      <SettingRow description={zh ? '沙箱任务的 CPU 和内存上限' : 'Max CPU and memory for sandboxed tasks'} label={zh ? '资源限制' : 'Resource limits'}><SelectControl ariaLabel="Resource limits" onChange={setResourceLimits} options={[['1cpu-2gb', '1 CPU / 2 GB'], ['2cpu-4gb', '2 CPU / 4 GB'], ['4cpu-8gb', '4 CPU / 8 GB']]} value={resourceLimits} /></SettingRow>
      <SettingRow description={zh ? '在会话之间保留沙箱文件系统' : 'Keep sandbox filesystem between sessions'} label={zh ? '保留工作区' : 'Persist workspace'}><Toggle checked={persistWorkspace} label="Persist workspace" onChange={setPersistWorkspace} /></SettingRow>
      <SettingRow description={zh ? '将工作目录绑定挂载到沙箱中' : 'Bind-mount working directory into sandbox'} label={zh ? '挂载项目文件' : 'Mount project files'}><Toggle checked={mountProject} label="Mount project files" onChange={setMountProject} /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '终端与 CLI' : 'TERMINAL & CLI'}>
      <SettingRow description={zh ? '终端和命令执行所使用的 Shell' : 'Shell used for terminal and command execution'} label={zh ? '默认 Shell' : 'Default shell'}><SelectControl ariaLabel="Default shell" onChange={setShell} options={[['powershell', 'PowerShell'], ['cmd', 'Command Prompt'], ['bash', 'bash'], ['zsh', 'zsh']]} value={shell} /></SettingRow>
      <SettingRow description={zh ? '默认项目根路径' : 'Default project root path'} label={zh ? '工作目录' : 'Working directory'}><ActionButton>{zh ? '浏览' : 'Browse'}</ActionButton></SettingRow>
      <SettingRow description={zh ? '额外的二进制搜索路径' : 'Additional binary search paths'} label="PATH extensions"><ActionButton>{zh ? '浏览' : 'Browse'}</ActionButton></SettingRow>
      <SettingRow description={zh ? '集成终端使用的等宽字体' : 'Monospace font for integrated terminal'} label={zh ? '终端字体' : 'Terminal font'}><SelectControl ariaLabel="Terminal font" onChange={setTerminalFont} options={[['JetBrains Mono', 'JetBrains Mono'], ['Cascadia Code', 'Cascadia Code'], ['Consolas', 'Consolas']]} value={terminalFont} /></SettingRow>
      <SettingRow description={zh ? '终端历史记录的最大行数' : 'Maximum terminal history buffer'} label={zh ? '回滚行数' : 'Scrollback lines'}><SelectControl ariaLabel="Scrollback lines" onChange={setScrollback} options={[['5000', '5,000'], ['10000', '10,000'], ['50000', '50,000']]} value={scrollback} /></SettingRow>
      <SettingRow description={zh ? '自动安装缺失的 CLI 依赖' : 'Automatically install missing CLI dependencies'} label={zh ? '自动安装工具' : 'Auto-install tools'}><Toggle checked={autoInstall} label="Auto-install tools" onChange={setAutoInstall} /></SettingRow>
    </SettingsSection>
  </SettingsPage>
}

export function AgentsSettingsPage(): ReactElement {
  const { locale } = useLocale()
  const zh = locale === 'zh-CN'
  const [maxAgents, setMaxAgents] = useStoredSetting('max-agents', '3')
  const [timeout, setTimeout] = useStoredSetting('agent-timeout', '5')
  const [autoSafe, setAutoSafe] = useStoredSetting('agent-auto-safe', true)
  const [verbose, setVerbose] = useStoredSetting('agent-verbose-logs', false)
  const [fileAccess, setFileAccess] = useStoredSetting('agent-file-access', 'project')
  const [network, setNetwork] = useStoredSetting('agent-network', 'allowlist')
  const [shell, setShell] = useStoredSetting('agent-shell', 'confirm')
  const [secrets, setSecrets] = useStoredSetting('agent-secrets-access', false)
  const [persist, setPersist] = useStoredSetting('agent-persist-context', true)
  const [contextWindow, setContextWindow] = useStoredSetting('agent-context-window', '128')
  const [summarize, setSummarize] = useStoredSetting('agent-auto-summarize', true)
  return <SettingsPage description={zh ? '设置智能体并发、权限和记忆。' : 'Configure agent concurrency, permissions, and memory.'} title={zh ? '智能体' : 'Agents'}>
    <SettingsSection title={zh ? '默认设置' : 'AGENT DEFAULTS'}>
      <SettingRow description={zh ? '并行运行智能体的数量上限' : 'Parallel agent execution limit'} label={zh ? '最大并发智能体' : 'Max concurrent agents'}><SelectControl ariaLabel="Max concurrent agents" onChange={setMaxAgents} options={[["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]]} value={maxAgents} /></SettingRow>
      <SettingRow description={zh ? '每个智能体步骤允许的最长时间' : 'Maximum time per agent step'} label={zh ? '默认超时' : 'Default timeout'}><SelectControl ariaLabel="Default timeout" onChange={setTimeout} options={[["2", zh ? '2 分钟' : '2 min'], ["5", zh ? '5 分钟' : '5 min'], ["10", zh ? '10 分钟' : '10 min']]} value={timeout} /></SettingRow>
      <SettingRow description={zh ? '只读操作无需确认' : 'Skip confirmation for read-only operations'} label={zh ? '自动批准安全操作' : 'Auto-approve safe actions'}><Toggle checked={autoSafe} label="Auto-approve safe actions" onChange={setAutoSafe} /></SettingRow>
      <SettingRow description={zh ? '显示详细的智能体推理记录' : 'Show detailed agent reasoning'} label={zh ? '详细日志' : 'Verbose logging'}><Toggle checked={verbose} label="Verbose logging" onChange={setVerbose} /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '权限' : 'PERMISSIONS'}>
      <SettingRow description={zh ? '允许智能体读写文件' : 'Allow agents to read/write files'} label={zh ? '文件系统访问' : 'File system access'}><SelectControl ariaLabel="File system access" onChange={setFileAccess} options={[["project", zh ? '仅项目' : 'Project only'], ["ask", zh ? '每次询问' : 'Ask every time'], ["none", zh ? '禁止' : 'None']]} value={fileAccess} /></SettingRow>
      <SettingRow description={zh ? '允许发起外部 HTTP 请求' : 'Allow outbound HTTP requests'} label={zh ? '网络访问' : 'Network access'}><SelectControl ariaLabel="Network access" onChange={setNetwork} options={[["allowlist", zh ? '允许列表' : 'Allowlist'], ["ask", zh ? '每次询问' : 'Ask every time'], ["none", zh ? '禁止' : 'None']]} value={network} /></SettingRow>
      <SettingRow description={zh ? '允许智能体运行命令' : 'Allow agents to run commands'} label={zh ? 'Shell 执行' : 'Shell execution'}><SelectControl ariaLabel="Shell execution" onChange={setShell} options={[["confirm", zh ? '每次确认' : 'Confirm each'], ["safe", zh ? '自动批准安全命令' : 'Approve safe commands'], ["none", zh ? '禁止' : 'None']]} value={shell} /></SettingRow>
      <SettingRow description={zh ? '允许读取环境变量' : 'Allow reading environment variables'} label={zh ? '密钥访问' : 'Secrets access'}><Toggle checked={secrets} label="Secrets access" onChange={setSecrets} /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '记忆' : 'MEMORY'}>
      <SettingRow description={zh ? '在会话之间保存智能体记忆' : 'Save agent memory between sessions'} label={zh ? '保留上下文' : 'Persist context'}><Toggle checked={persist} label="Persist context" onChange={setPersist} /></SettingRow>
      <SettingRow description={zh ? '智能体上下文的最大令牌数' : 'Maximum tokens for agent context'} label={zh ? '上下文窗口' : 'Context window'}><SelectControl ariaLabel="Context window" onChange={setContextWindow} options={[["64", "64K"], ["128", "128K"], ["256", "256K"]]} value={contextWindow} /></SettingRow>
      <SettingRow description={zh ? '压缩较长的对话' : 'Compress long conversations'} label={zh ? '自动摘要' : 'Auto-summarize'}><Toggle checked={summarize} label="Auto-summarize" onChange={setSummarize} /></SettingRow>
    </SettingsSection>
  </SettingsPage>
}

export function AutomationsSettingsPage(): ReactElement {
  const { locale } = useLocale(); const zh = locale === 'zh-CN'
  const [format, setFormat] = useStoredSetting('automation-format', true)
  const [lint, setLint] = useStoredSetting('automation-lint', true)
  const [tests, setTests] = useStoredSetting('automation-tests', false)
  const [summary, setSummary] = useStoredSetting('automation-summary', false)
  const [fileEvents, setFileEvents] = useStoredSetting('automation-file-events', true)
  const [gitHooks, setGitHooks] = useStoredSetting('automation-git-hooks', true)
  const [webhook, setWebhook] = useStoredSetting('automation-webhook', false)
  return <SettingsPage description={zh ? '配置定时与事件驱动任务、Webhook 和执行限制。' : 'Configure scheduled and event-driven work, webhooks, and execution limits.'} title={zh ? '自动化' : 'Automations'}>
    <SettingsSection title={zh ? '活动自动化' : 'ACTIVE AUTOMATIONS'}>
      <SettingRow description={zh ? '保存文件时运行 Prettier' : 'Run Prettier when files are saved'} label={zh ? '保存时格式化' : 'Auto-format on save'}><Toggle checked={format} label="Auto-format" onChange={setFormat} /></SettingRow>
      <SettingRow description={zh ? '每次提交前运行检查器' : 'Run linter before each commit'} label={zh ? '提交时检查' : 'Lint on commit'}><Toggle checked={lint} label="Lint on commit" onChange={setLint} /></SettingRow>
      <SettingRow description={zh ? '代码变更时运行相关测试' : 'Run related tests when code changes'} label={zh ? '变更时自动测试' : 'Auto-test on change'}><Toggle checked={tests} label="Auto-test on change" onChange={setTests} /></SettingRow>
      <SettingRow description={zh ? '生成项目状态摘要' : 'Generate project status digest'} label={zh ? '每日摘要' : 'Daily summary'}><Toggle checked={summary} label="Daily summary" onChange={setSummary} /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '触发器' : 'TRIGGERS'}>
      <SettingRow description={zh ? '响应文件系统变更' : 'React to file system changes'} label={zh ? '文件变更事件' : 'File change events'}><Toggle checked={fileEvents} label="File events" onChange={setFileEvents} /></SettingRow>
      <SettingRow description={zh ? '在 Git 事件上运行操作' : 'Run actions on git events'} label={zh ? 'Git 钩子' : 'Git hooks'}><Toggle checked={gitHooks} label="Git hooks" onChange={setGitHooks} /></SettingRow>
      <SettingRow description={zh ? '基于时间的自动化触发器' : 'Time-based automation triggers'} label={zh ? '计划任务' : 'Schedule'}><SelectControl ariaLabel="Schedule" onChange={() => undefined} options={[["off", zh ? '关闭' : 'Off'], ["daily", zh ? '每天' : 'Daily'], ["weekly", zh ? '每周' : 'Weekly']]} value="off" /></SettingRow>
      <SettingRow description={zh ? '外部事件触发器' : 'External event triggers'} label="Webhook"><Toggle checked={webhook} label="Webhook" onChange={setWebhook} /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '限制' : 'LIMITS'}><SettingRow description={zh ? '并行自动化数量上限' : 'Parallel automation limit'} label={zh ? '最大并发' : 'Max concurrent'}><SelectControl ariaLabel="Max concurrent" onChange={() => undefined} options={[["1", "1"], ["2", "2"], ["4", "4"]]} value="2" /></SettingRow><SettingRow description={zh ? '每项自动化允许的最长时间' : 'Maximum time per automation'} label={zh ? '执行超时' : 'Execution timeout'}><SelectControl ariaLabel="Execution timeout" onChange={() => undefined} options={[["5", "5 min"], ["10", "10 min"], ["30", "30 min"]]} value="10" /></SettingRow></SettingsSection>
  </SettingsPage>
}

export function PrivacySettingsPage(): ReactElement {
  const { locale } = useLocale(); const zh = locale === 'zh-CN'
  const [analytics, setAnalytics] = useStoredSetting('privacy-analytics', false)
  const [crashReports, setCrashReports] = useStoredSetting('privacy-crash-reports', true)
  const [telemetry, setTelemetry] = useStoredSetting('privacy-model-telemetry', false)
  const [reads, setReads] = useStoredSetting('privacy-auto-reads', true)
  const [clearOnExit, setClearOnExit] = useStoredSetting('privacy-clear-on-exit', false)
  const [lock, setLock] = useStoredSetting('privacy-lock-idle', false)
  return <SettingsPage description={zh ? '控制遥测、默认权限、会话保护和敏感数据操作。' : 'Control telemetry, default permissions, session protection, and sensitive data actions.'} title={zh ? '隐私与安全' : 'Privacy & Security'}>
    <SettingsSection title={zh ? '数据收集' : 'DATA COLLECTION'}>
      <SettingRow description={zh ? '发送匿名使用数据以帮助改进 Pivot' : 'Send anonymous usage data to help improve Pivot'} label={zh ? '使用分析' : 'Usage analytics'}><Toggle checked={analytics} label="Usage analytics" onChange={setAnalytics} /></SettingRow>
      <SettingRow description={zh ? '自动发送崩溃报告' : 'Automatically send crash reports'} label={zh ? '崩溃报告' : 'Crash reports'}><Toggle checked={crashReports} label="Crash reports" onChange={setCrashReports} /></SettingRow>
      <SettingRow description={zh ? '与提供商共享模型性能指标' : 'Share model performance metrics with providers'} label={zh ? '模型遥测' : 'Model telemetry'}><Toggle checked={telemetry} label="Model telemetry" onChange={setTelemetry} /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '默认权限' : 'PERMISSIONS'}>
      <SettingRow description={zh ? '新智能体任务的默认权限级别' : 'Default permission level for new agent tasks'} label={zh ? '默认文件访问' : 'Default file access'}><SelectControl ariaLabel="Default file access" onChange={() => undefined} options={[["ask", zh ? '每次询问' : 'Ask every time'], ["project", zh ? '仅项目' : 'Project only']]} value="ask" /></SettingRow>
      <SettingRow description={zh ? '允许智能体发起外部网络请求' : 'Allow agents to make outbound network requests'} label={zh ? '网络访问' : 'Network access'}><SelectControl ariaLabel="Default network access" onChange={() => undefined} options={[["hosts", zh ? '仅批准的主机' : 'Approved hosts only'], ["ask", zh ? '每次询问' : 'Ask every time']]} value="hosts" /></SettingRow>
      <SettingRow description={zh ? '允许智能体执行 Shell 命令' : 'Allow agents to execute shell commands'} label={zh ? 'Shell 执行' : 'Shell execution'}><SelectControl ariaLabel="Default shell access" onChange={() => undefined} options={[["ask", zh ? '每次询问' : 'Ask every time'], ["deny", zh ? '禁止' : 'Deny']]} value="ask" /></SettingRow>
      <SettingRow description={zh ? '只读文件操作无需确认' : 'Skip confirmation for read-only file operations'} label={zh ? '自动批准读取' : 'Auto-approve reads'}><Toggle checked={reads} label="Auto-approve reads" onChange={setReads} /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '会话安全' : 'SESSION SECURITY'}>
      <SettingRow description={zh ? 'Pivot 关闭时清除会话数据' : 'Wipe session data when Pivot closes'} label={zh ? '退出时清除' : 'Clear on exit'}><Toggle checked={clearOnExit} label="Clear on exit" onChange={setClearOnExit} /></SettingRow>
      <SettingRow description={zh ? '空闲后要求重新验证身份' : 'Require re-authentication after inactivity'} label={zh ? '空闲时锁定' : 'Lock on idle'}><Toggle checked={lock} label="Lock on idle" onChange={setLock} /></SettingRow>
      <SettingRow description={zh ? '激活空闲锁定前的等待时间' : 'Time before idle lock activates'} label={zh ? '空闲超时' : 'Idle timeout'}><SelectControl ariaLabel="Idle timeout" onChange={() => undefined} options={[["5", "5 minutes"], ["15", "15 minutes"], ["30", "30 minutes"]]} value="15" /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '危险区域' : 'DANGER ZONE'}><SettingRow description={zh ? '删除全部会话、产物和缓存数据。此操作无法撤销。' : 'Delete all sessions, artifacts, and cached data. This cannot be undone.'} label={zh ? '清除所有数据' : 'Clear all data'}><ActionButton>{zh ? '全部清除' : 'Clear All'}</ActionButton></SettingRow></SettingsSection>
  </SettingsPage>
}

export function DataStorageSettingsPage(): ReactElement {
  const { locale } = useLocale(); const zh = locale === 'zh-CN'
  const [cleanup, setCleanup] = useStoredSetting('storage-auto-cleanup', true)
  const [retention, setRetention] = useStoredSetting('storage-retention', '90')
  const [cacheLimit, setCacheLimit] = useStoredSetting('storage-cache-limit', '10')
  const [modelRetention, setModelRetention] = useStoredSetting('storage-model-retention', '30')
  const [exportFormat, setExportFormat] = useStoredSetting('storage-export-format', 'json')
  const storageRows = [
    [zh ? '会话数据' : 'Session data', zh ? '对话历史和上下文' : 'Conversation history and context', '2.4 GB'],
    [zh ? '产物缓存' : 'Artifact cache', zh ? '生成的文件和输出' : 'Generated files and outputs', '890 MB'],
    [zh ? '模型缓存' : 'Model cache', zh ? '下载的模型权重' : 'Downloaded model weights', '4.1 GB'],
    [zh ? '插件数据' : 'Plugin data', zh ? '插件配置和状态' : 'Plugin configuration and state', '156 MB'],
    [zh ? '扩展缓存' : 'Extension cache', zh ? '下载的市场包' : 'Downloaded marketplace packages', '847 MB'],
    [zh ? '本地模型' : 'Local models', zh ? 'Cookbook 部署的模型文件' : 'Cookbook deployed model files', '12.6 GB'],
  ]
  return <SettingsPage description={zh ? '查看空间占用，并管理缓存路径、保留周期和数据导出。' : 'Review storage use and manage cache paths, retention, and data exports.'} title={zh ? '数据与存储' : 'Data & Storage'}>
    <div className="pv-storage-overview"><span><small>{zh ? '已用存储总量' : 'Total storage used'}</small><strong>21.0 GB</strong></span><div>{storageRows.map(([name, , size]) => <span key={name}>{name} <b>{size}</b></span>)}</div></div>
    <SettingsSection title={zh ? '存储类别' : 'STORAGE'}>
      {storageRows.map(([title, description, size]) => <SettingRow description={description} key={title} label={title}><span className="pv-storage-size">{size}</span></SettingRow>)}
    </SettingsSection>
    <SettingsSection title={zh ? '数据管理' : 'DATA MANAGEMENT'}>
      <SettingRow description={zh ? '缓存下载和产物的位置' : 'Location for cached downloads and artifacts'} label={zh ? '缓存目录' : 'Cache directory'}><code className="pv-path-value">~/.pivot/cache/</code><ActionButton>{zh ? '浏览' : 'Browse'}</ActionButton></SettingRow>
      <SettingRow description={zh ? '市场扩展的安装位置' : 'Install location for marketplace extensions'} label={zh ? '扩展目录' : 'Extension directory'}><code className="pv-path-value">~/.pivot/extensions/</code><ActionButton>{zh ? '浏览' : 'Browse'}</ActionButton></SettingRow>
      <SettingRow description={zh ? 'Cookbook 本地模型的存储路径' : 'Storage path for Cookbook local models'} label={zh ? '模型目录' : 'Model directory'}><code className="pv-path-value">~/.pivot/models/</code><ActionButton>{zh ? '浏览' : 'Browse'}</ActionButton></SettingRow>
      <SettingRow description={zh ? '自动移除旧会话数据' : 'Remove old session data automatically'} label={zh ? '自动清理' : 'Auto-cleanup'}><Toggle checked={cleanup} label="Auto-cleanup" onChange={setCleanup} /></SettingRow>
      <SettingRow description={zh ? '会话数据的保留时长' : 'Keep session data for'} label={zh ? '保留期' : 'Retention period'}><SelectControl ariaLabel="Retention period" onChange={setRetention} options={[["30", zh ? '30 天' : '30 days'], ["90", zh ? '90 天' : '90 days'], ["180", zh ? '180 天' : '180 days'], ["forever", zh ? '永久' : 'Forever']]} value={retention} /></SettingRow>
      <SettingRow description={zh ? '缓存可使用的最大磁盘空间' : 'Maximum disk space for caches'} label={zh ? '缓存限制' : 'Cache limit'}><SelectControl ariaLabel="Cache limit" onChange={setCacheLimit} options={[['5', '5 GB'], ['10', '10 GB'], ['25', '25 GB']]} value={cacheLimit} /></SettingRow>
      <SettingRow description={zh ? '移除全部缓存产物' : 'Remove all cached artifacts'} label={zh ? '清除产物缓存' : 'Clear artifact cache'}><ActionButton>{zh ? '清除缓存' : 'Clear Cache'}</ActionButton></SettingRow>
      <SettingRow description={zh ? '移除下载的市场包' : 'Remove downloaded marketplace packages'} label={zh ? '清除扩展缓存' : 'Clear extension cache'}><ActionButton>{zh ? '清除' : 'Clear'}</ActionButton></SettingRow>
      <SettingRow description={zh ? '移除 Cookbook 部署的模型文件' : 'Remove Cookbook deployed model files'} label={zh ? '清除本地模型' : 'Clear local models'}><ActionButton>{zh ? '清除' : 'Clear'}</ActionButton></SettingRow>
      <SettingRow description={zh ? '未使用模型的自动移除时长' : 'Auto-remove unused models after'} label={zh ? '模型保留期' : 'Model retention'}><SelectControl ariaLabel="Model retention" onChange={setModelRetention} options={[['7', '7 days'], ['30', '30 days'], ['90', '90 days']]} value={modelRetention} /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '导出' : 'EXPORT'}>
      <SettingRow description={zh ? '下载全部会话数据' : 'Download all session data'} label={zh ? '导出会话' : 'Export sessions'}><ActionButton>{zh ? '导出' : 'Export'}</ActionButton></SettingRow>
      <SettingRow description={zh ? '导出数据的格式' : 'Format for exported data'} label={zh ? '导出格式' : 'Export format'}><SelectControl ariaLabel="Export format" onChange={setExportFormat} options={[['json', 'JSON'], ['markdown', 'Markdown'], ['zip', 'ZIP']]} value={exportFormat} /></SettingRow>
    </SettingsSection>
  </SettingsPage>
}

export function UpdatesSettingsPage(): ReactElement {
  const { locale } = useLocale(); const zh = locale === 'zh-CN'
  const state = useUpdateStore((store) => store.state)
  const load = useUpdateStore((store) => store.load)
  const check = useUpdateStore((store) => store.check)
  const [automatic, setAutomatic] = useStoredSetting('updates-automatic', true)
  const [channel, setChannel] = useStoredSetting('updates-channel', 'stable')
  const [frequency, setFrequency] = useStoredSetting('updates-frequency', 'daily')
  const [prerelease, setPrerelease] = useStoredSetting('updates-prerelease', false)
  useEffect(() => { void load() }, [load])
  const status = state?.status ?? 'unavailable'
  return <SettingsPage description={zh ? '管理发布通道、检查频率和已安装组件版本。' : 'Manage release channels, update frequency, and installed component versions.'} title={zh ? '更新' : 'Updates'}>
    <SettingsSection title={zh ? '当前版本' : 'CURRENT VERSION'}>
      <SettingRow description={zh ? '桌面应用' : 'Desktop application'} label="Pivot"><span>{APP_VERSION}</span></SettingRow>
      <SettingRow description={zh ? 'AI 编排运行时' : 'AI orchestration runtime'} label={zh ? '核心引擎' : 'Core engine'}><span>{APP_VERSION}</span></SettingRow>
      <SettingRow description={zh ? '桌面框架' : 'Desktop framework'} label="Electron"><span>{ELECTRON_RUNTIME_VERSION}</span></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '更新设置' : 'UPDATE SETTINGS'}>
      <SettingRow description={zh ? '自动下载并安装更新' : 'Download and install updates automatically'} label={zh ? '自动更新' : 'Auto-update'}><Toggle checked={automatic} label="Auto-update" onChange={setAutomatic} /></SettingRow>
      <SettingRow description={zh ? '要跟随的发布通道' : 'Release channel to follow'} label={zh ? '更新通道' : 'Update channel'}><SelectControl ariaLabel="Update channel" onChange={setChannel} options={[["stable", zh ? '稳定版' : 'Stable'], ["beta", zh ? '测试版' : 'Beta']]} value={channel} /></SettingRow>
      <SettingRow description={zh ? '检查更新的频率' : 'How often to check for updates'} label={zh ? '检查频率' : 'Check frequency'}><SelectControl ariaLabel="Update frequency" onChange={setFrequency} options={[["startup", zh ? '每次启动' : 'Every launch'], ["daily", zh ? '每天' : 'Daily'], ["weekly", zh ? '每周' : 'Weekly']]} value={frequency} /></SettingRow>
      <SettingRow description={zh ? '接收 Beta 和 RC 更新' : 'Receive beta and RC updates'} label={zh ? '包含预发布版本' : 'Include pre-releases'}><Toggle checked={prerelease} label="Include pre-releases" onChange={setPrerelease} /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '操作' : 'ACTIONS'}>
      <SettingRow description={state?.message} label={zh ? '检查更新' : 'Check for updates'}><ActionButton disabled={status === 'checking' || status === 'downloading'} onClick={() => void check()}>{zh ? '立即检查' : 'Check Now'}</ActionButton></SettingRow>
      <SettingRow description={zh ? '查看当前版本的变更日志' : 'View changelog for current version'} label={zh ? '发行说明' : 'Release notes'}><ActionButton>{zh ? '查看说明' : 'View Notes'}</ActionButton></SettingRow>
    </SettingsSection>
  </SettingsPage>
}

export function ShortcutsSettingsPage(): ReactElement {
  const { locale } = useLocale(); const zh = locale === 'zh-CN'
  const groups = [
    [zh ? '通用' : 'GENERAL', [[zh ? '新建会话' : 'New session', ['⌘', 'N']], [zh ? '打开项目' : 'Open project', ['⌘', 'O']], [zh ? '设置' : 'Settings', ['⌘', ',']], [zh ? '命令面板' : 'Command palette', ['⌘', 'K']], [zh ? '快速切换' : 'Quick switch', ['⌘', 'P']]]],
    [zh ? '会话' : 'SESSION', [[zh ? '发送消息' : 'Send message', ['⌘', '↵']], [zh ? '新建一行' : 'New line', ['Shift', '↵']], [zh ? '停止生成' : 'Stop generation', ['Esc']], [zh ? '附加文件' : 'Attach file', ['⌘', 'U']], [zh ? '切换侧栏' : 'Toggle sidebar', ['⌘', 'B']]]],
    [zh ? '编辑器' : 'EDITOR', [[zh ? '保存文件' : 'Save file', ['⌘', 'S']], [zh ? '在文件中查找' : 'Find in file', ['⌘', 'F']], [zh ? '切换终端' : 'Toggle terminal', ['⌘', '`']], [zh ? '接受差异' : 'Accept diff', ['⌘', 'Y']], [zh ? '拒绝差异' : 'Reject diff', ['⌘', '⌫']]]],
  ] as Array<[string, Array<[string, string[]]>]>
  return <SettingsPage description={zh ? '查看 Pivot、会话和编辑器中的键盘操作。' : 'Review keyboard actions across Pivot, sessions, and the editor.'} title={zh ? '快捷键' : 'Shortcuts'}>{groups.map(([title, shortcuts]) => <SettingsSection key={title} title={title}>{shortcuts.map(([label, keys]) => <SettingRow key={label} label={label}><span className="pv-key-sequence">{keys.map((key) => <kbd key={key}>{key}</kbd>)}</span></SettingRow>)}</SettingsSection>)}</SettingsPage>
}

export function AdvancedSettingsPage(): ReactElement {
  const { locale } = useLocale(); const zh = locale === 'zh-CN'
  const [hardware, setHardware] = useStoredSetting('advanced-hardware', true)
  const [priority, setPriority] = useStoredSetting('advanced-priority', 'normal')
  const [memory, setMemory] = useStoredSetting('advanced-memory', '4')
  const [threads, setThreads] = useStoredSetting('advanced-threads', 'auto')
  const [devMode, setDevMode] = useStoredSetting('advanced-dev-mode', false)
  const [apiLogs, setApiLogs] = useStoredSetting('advanced-api-logs', false)
  const [artifacts, setArtifacts] = useStoredSetting('experimental-streaming-artifacts', false)
  const [speculative, setSpeculative] = useStoredSetting('experimental-speculative-decoding', false)
  const [multiAgent, setMultiAgent] = useStoredSetting('experimental-multi-agent', false)
  return <SettingsPage description={zh ? '调整性能、开发者工具和实验性能力。' : 'Tune performance, developer tools, and experimental capabilities.'} title={zh ? '高级' : 'Advanced'}>
    <SettingsSection title={zh ? '性能' : 'PERFORMANCE'}>
      <SettingRow description={zh ? '使用 GPU 进行渲染' : 'Use GPU for rendering'} label={zh ? '硬件加速' : 'Hardware acceleration'}><Toggle checked={hardware} label="Hardware acceleration" onChange={setHardware} /></SettingRow>
      <SettingRow description={zh ? '操作系统进程调度优先级' : 'OS process scheduling priority'} label={zh ? '进程优先级' : 'Process priority'}><SelectControl ariaLabel="Process priority" onChange={setPriority} options={[["low", zh ? '低' : 'Low'], ["normal", zh ? '普通' : 'Normal'], ["high", zh ? '高' : 'High']]} value={priority} /></SettingRow>
      <SettingRow description={zh ? '最大内存占用' : 'Maximum RAM usage'} label={zh ? '内存限制' : 'Memory limit'}><SelectControl ariaLabel="Memory limit" onChange={setMemory} options={[["4", "4 GB"], ["8", "8 GB"], ["16", "16 GB"]]} value={memory} /></SettingRow>
      <SettingRow description={zh ? '并行任务所使用的工作线程数' : 'Worker threads for parallel tasks'} label={zh ? '线程池大小' : 'Thread pool size'}><SelectControl ariaLabel="Thread pool size" onChange={setThreads} options={[['auto', zh ? '自动' : 'Auto'], ['2', '2'], ['4', '4'], ['8', '8']]} value={threads} /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '开发者' : 'DEVELOPER'}>
      <SettingRow description={zh ? '显示调试面板和日志' : 'Show debug panels and logs'} label={zh ? '开发者模式' : 'Developer mode'}><Toggle checked={devMode} label="Developer mode" onChange={setDevMode} /></SettingRow>
      <SettingRow description={zh ? '打开 Chromium 开发者工具' : 'Open Chromium developer tools'} label="DevTools"><ActionButton>{zh ? '打开开发者工具' : 'Open DevTools'}</ActionButton></SettingRow>
      <SettingRow description={zh ? '记录所有 API 请求与响应正文' : 'Log all API request/response bodies'} label={zh ? '详细 API 日志' : 'Verbose API logs'}><Toggle checked={apiLogs} label="Verbose API logs" onChange={setApiLogs} /></SettingRow>
      <SettingRow description={zh ? '编辑原始配置 JSON' : 'Edit raw configuration JSON'} label={zh ? '配置文件' : 'Config file'}><ActionButton>{zh ? '打开配置' : 'Open Config'}</ActionButton></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '实验性' : 'EXPERIMENTAL'}>
      <SettingRow description={zh ? '产物生成时实时显示' : 'Show artifacts as they generate'} label={zh ? '流式产物' : 'Streaming artifacts'}><Toggle checked={artifacts} label="Streaming artifacts" onChange={setArtifacts} /></SettingRow>
      <SettingRow description={zh ? '预先生成可能的后续内容' : 'Pre-generate likely continuations'} label={zh ? '推测解码' : 'Speculative decoding'}><Toggle checked={speculative} label="Speculative decoding" onChange={setSpeculative} /></SettingRow>
      <SettingRow description={zh ? '允许智能体生成子智能体' : 'Allow agents to spawn sub-agents'} label={zh ? '多智能体编排' : 'Multi-agent orchestration'}><Toggle checked={multiAgent} label="Multi-agent orchestration" onChange={setMultiAgent} /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '危险区域' : 'DANGER ZONE'}>
      <SettingRow description={zh ? '将全部设置恢复为默认值' : 'Restore all settings to defaults'} label={zh ? '重置所有设置' : 'Reset all settings'}><ActionButton>{zh ? '重置' : 'Reset'}</ActionButton></SettingRow>
      <SettingRow description={zh ? '删除全部会话、缓存和配置' : 'Delete all sessions, caches, and config'} label={zh ? '清除所有数据' : 'Clear all data'}><ActionButton>{zh ? '全部清除' : 'Clear All'}</ActionButton></SettingRow>
    </SettingsSection>
  </SettingsPage>
}

export function AboutSettingsPage(): ReactElement {
  const { locale } = useLocale(); const zh = locale === 'zh-CN'
  const platform = navigator.platform || (zh ? '未知平台' : 'Unknown platform')
  return <section className="pv-about-page">
    <div className="pv-about-hero"><div className="pv-about-logo"><Cpu size={28} /></div><div><h1>Pivot</h1><strong>{zh ? '统一 AI 工作台' : 'Unified AI Workstation'}</strong><span>Version {APP_VERSION}</span></div><ActionButton onClick={() => void navigator.clipboard.writeText(`Pivot ${APP_VERSION} · ${platform}`)}>{zh ? '复制版本信息' : 'Copy Version Info'}</ActionButton></div>
    <div className="pv-about-columns">
      <div>
        <SettingsSection title={zh ? '系统' : 'SYSTEM'}><SettingRow label={zh ? '平台' : 'Platform'}><code>{platform}</code></SettingRow><SettingRow label="CPU"><code>{navigator.hardwareConcurrency || '—'} logical cores</code></SettingRow><SettingRow label="GPU"><code>{zh ? '由系统管理' : 'Managed by system'}</code></SettingRow><SettingRow label={zh ? '内存' : 'Memory'}><code>{zh ? '由系统管理' : 'Managed by system'}</code></SettingRow></SettingsSection>
        <SettingsSection title={zh ? '致谢' : 'CREDITS'}><p>{zh ? '创建者' : 'Created by'} · Heptachron</p><p>{zh ? '设计' : 'Design'} · Pivot Design Team</p><p>{zh ? '工程' : 'Engineering'} · Pivot Core Team</p><p>{zh ? '特别感谢' : 'Special thanks'} · {zh ? '开源社区' : 'Open source community'}</p></SettingsSection>
      </div>
      <div>
        <SettingsSection title={zh ? '链接' : 'LINKS'}><SettingRow label={zh ? '文档' : 'Documentation'}><ActionButton>{zh ? '打开文档' : 'Open Docs'}</ActionButton></SettingRow><SettingRow label={zh ? '发行说明' : 'Release Notes'}><ActionButton>{zh ? '查看' : 'View'}</ActionButton></SettingRow><SettingRow label={zh ? '报告问题' : 'Report Issue'}><ActionButton>{zh ? '报告' : 'Report'}</ActionButton></SettingRow><SettingRow label={zh ? '许可证' : 'Licenses'}><ActionButton>{zh ? '查看' : 'View'}</ActionButton></SettingRow></SettingsSection>
        <SettingsSection title={zh ? '社区' : 'COMMUNITY'}><SettingRow label="GitHub"><ActionButton>{zh ? '加星' : 'Star us'}</ActionButton></SettingRow><SettingRow label="Discord"><ActionButton>{zh ? '加入' : 'Join'}</ActionButton></SettingRow><SettingRow label="Twitter/X"><ActionButton>{zh ? '关注' : 'Follow'}</ActionButton></SettingRow></SettingsSection>
      </div>
    </div>
    <p className="pv-about-footer">{zh ? 'Pivot 是基于 MIT 许可证发布的开源软件 · 永久免费 · 由 Heptachron 制作' : 'Pivot is open source software distributed under the MIT License · Free forever · Made by Heptachron'}</p>
  </section>
}
