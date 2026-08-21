import { AlertTriangle, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import type { ProviderConfig, ProviderConfigInput, ProviderConnectionResult } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'
import { useProviderStore } from '../stores/provider.store'
import {
  AddConnectionDialog,
  ProviderRemovalDialog,
  ProviderRestoreToast,
  ProviderUndoBanner,
  type ConnectionPreset,
} from './provider-connection-overlays'
import { ActionButton, SelectControl, SettingRow, SettingsSection, Tag, Toggle, useStoredSetting } from './settings-controls'

type ProviderTab = 'connections' | 'routing' | 'monitor'
type ProviderState = 'active' | 'auth-failed' | 'disabled' | 'model-unavailable' | 'not-configured' | 'rate-limited' | 'testing' | 'unreachable'
type ProviderView = Omit<ProviderConfigInput, 'apiKey'> & { capabilities: string[]; context: string; scope: string }

const PROVIDERS: ProviderView[] = [
  { id: 'anthropic', kind: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'configured-model', scope: 'Global', context: 'Provider defined', capabilities: ['Chat', 'Completion', 'Vision', 'Tool Use', 'Streaming'] },
  { id: 'openai', kind: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'configured-model', scope: 'Global', context: 'Provider defined', capabilities: ['Chat', 'Vision', 'Tool Use', 'Streaming'] },
  { id: 'google', kind: 'custom', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'configured-model', scope: 'Global', context: 'Provider defined', capabilities: ['Chat', 'Vision', 'Image'] },
  { id: 'mistral', kind: 'custom', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', scope: 'Global', context: '128K context', capabilities: ['Chat', 'Completion', 'Tool Use', 'Streaming'] },
  { id: 'bedrock', kind: 'custom', label: 'AWS Bedrock', baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com', model: 'configured-in-aws', scope: 'Global', context: 'Provider defined', capabilities: ['Chat', 'Completion', 'Tool Use'] },
  { id: 'ollama', kind: 'custom', label: 'Local Ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.3', scope: 'Project', context: '128K context', capabilities: ['Chat', 'Completion', 'Embedding'] },
]

const MODELS: Record<string, string[]> = {
  anthropic: ['claude-opus-4', 'claude-sonnet-4', 'claude-haiku-3.5'],
  openai: ['gpt-5', 'gpt-5-mini', 'o3', 'gpt-4o', 'text-embedding-3'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'imagen-4'],
  mistral: ['mistral-large-latest'],
  bedrock: ['configured-in-aws'],
  ollama: ['llama3.3', 'qwen3-coder', 'nomic-embed'],
}

const ADD_CONNECTION_PRESETS: ConnectionPreset[] = [
  { baseUrl: 'https://api.anthropic.com/v1', description: 'Claude models — Opus, Sonnet, Haiku', id: 'anthropic', kind: 'anthropic', label: 'Anthropic', model: 'claude-sonnet-4' },
  { baseUrl: 'https://api.openai.com/v1', description: 'GPT and o-series models', id: 'openai', kind: 'openai', label: 'OpenAI', model: 'gpt-5' },
  { baseUrl: 'http://localhost:11434/v1', description: 'OpenAI-compatible local or hosted endpoint', id: 'custom', kind: 'custom', label: 'Custom Endpoint', model: 'local-model' },
]

export function ModelsProvidersSettings(): ReactElement {
  const { locale } = useLocale(); const zh = locale === 'zh-CN'
  const configs = useProviderStore((state) => state.configs)
  const load = useProviderStore((state) => state.load)
  const [tab, setTab] = useState<ProviderTab>('connections')
  useEffect(() => { void load() }, [load])
  return <section className="pv-provider-settings" data-figma-screen={tab === 'routing' ? '1171:11360' : '1171:9637'}>
    <header className="pv-provider-page-intro"><h1>{zh ? '模型与提供商' : 'Models & Providers'}</h1><p>{zh ? '连接模型服务，并管理路由规则、默认模型和连接状态。' : 'Connect model services and manage routing rules, defaults, and connection health.'}</p></header>
    <nav className="pv-provider-tabs">{([['connections', zh ? '连接' : 'Connections'], ['routing', zh ? '路由' : 'Routing'], ['monitor', zh ? '监控' : 'Monitor']] as Array<[ProviderTab, string]>).map(([id, label]) => <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)} type="button">{label}</button>)}</nav>
    {tab === 'connections' ? <Connections configs={configs} zh={zh} /> : tab === 'routing' ? <Routing configs={configs} zh={zh} /> : <Monitor configs={configs} zh={zh} />}
  </section>
}

function Connections({ configs, zh }: { configs: ProviderConfig[]; zh: boolean }): ReactElement {
  const error = useProviderStore((state) => state.error)
  const loading = useProviderStore((state) => state.isLoading)
  const pendingRemovals = useProviderStore((state) => state.pendingRemovals)
  const results = useProviderStore((state) => state.testResults)
  const save = useProviderStore((state) => state.save)
  const test = useProviderStore((state) => state.test)
  const remove = useProviderStore((state) => state.remove)
  const undoRemove = useProviderStore((state) => state.undoRemove)
  const [selectedId, setSelectedId] = useState('anthropic')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [showAddConnection, setShowAddConnection] = useState(false)
  const [removalTarget, setRemovalTarget] = useState<ProviderConfig | null>(null)
  const [restoredLabel, setRestoredLabel] = useState('')
  const [disabled, setDisabled] = useStoredSetting<string[]>('provider-disabled', ['google'])
  const catalog = useMemo(() => {
    const presetIds = new Set(PROVIDERS.map((item) => item.id))
    const presets = PROVIDERS.map((preset) => ({ ...preset, ...configs.find((item) => item.id === preset.id) }))
    const customConnections: ProviderView[] = configs.filter((item) => !presetIds.has(item.id)).map((item) => ({
      ...item,
      capabilities: ['Chat', 'Completion', 'Tool Use', 'Streaming'],
      context: 'Custom context',
      scope: 'Global',
    }))
    return [...presets, ...customConnections].filter((item) => `${item.label} ${item.model}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'configured' && configs.find((entry) => entry.id === item.id)?.hasApiKey) || (filter === 'local' && item.baseUrl.includes('localhost'))))
  }, [configs, filter, query])
  const provider = catalog.find((item) => item.id === selectedId) ?? catalog[0] ?? PROVIDERS[0]
  const saved = configs.find((item) => item.id === provider.id)
  const state = providerState(saved, results[provider.id], disabled.includes(provider.id), loading)
  const pendingRemoval = Object.values(pendingRemovals).sort((a, b) => b.expiresAt - a.expiresAt)[0]
  useEffect(() => {
    if (!restoredLabel) return undefined
    const timer = window.setTimeout(() => setRestoredLabel(''), 3_000)
    return () => window.clearTimeout(timer)
  }, [restoredLabel])
  async function credential(): Promise<void> {
    const apiKey = window.prompt(zh ? `输入 ${provider.label} 的 API 密钥` : `Enter the API key for ${provider.label}`)
    if (apiKey) await save({ apiKey, baseUrl: provider.baseUrl, id: provider.id, kind: provider.kind, label: provider.label, model: provider.model })
  }
  async function connect(input: ProviderConfigInput): Promise<ProviderConnectionResult | null> {
    const savedConnection = await save(input)
    return savedConnection ? test(savedConnection.id) : null
  }
  function undoPendingRemoval(): void {
    if (!pendingRemoval) return
    setRestoredLabel(pendingRemoval.config.label)
    undoRemove(pendingRemoval.config.id)
    setSelectedId(pendingRemoval.config.id)
  }
  return <div className="pv-provider-connections">
    <aside className="pv-provider-catalog"><header><strong>{zh ? '连接' : 'Connections'}</strong><button onClick={() => setShowAddConnection(true)} type="button"><Plus size={12} />{zh ? '添加' : 'Add'}</button></header><div className="pv-provider-catalog-tools"><label className="pv-provider-search"><Search size={13} /><input onChange={(event) => setQuery(event.target.value)} placeholder={zh ? '搜索连接…' : 'Search connections…'} value={query} /></label><select onChange={(event) => setFilter(event.target.value)} value={filter}><option value="all">{zh ? '全部' : 'All'}</option><option value="configured">{zh ? '已配置' : 'Configured'}</option><option value="local">{zh ? '本地' : 'Local'}</option></select></div>
      <div className="pv-provider-list">{catalog.map((item) => { const itemState = providerState(configs.find((entry) => entry.id === item.id), results[item.id], disabled.includes(item.id), false); return <button className={provider.id === item.id ? 'active' : ''} key={item.id} onClick={() => setSelectedId(item.id)} type="button"><ProviderMark provider={item} /><span><span><i className={`state ${itemState}`} /><strong>{item.label}</strong><em>{item.scope}</em></span><small>{item.kind === 'custom' ? 'OpenAI-compatible' : item.kind === 'anthropic' ? 'Anthropic' : 'OpenAI'}</small><small className={`provider-status ${itemState}`}>{stateLabel(itemState, zh)} <b>{results[item.id] ? (zh ? '本次会话已测试' : 'Tested this session') : (zh ? '本次会话未测试' : 'Not tested this session')}</b></small></span></button> })}</div>
    </aside>
    <ProviderDetail onCredential={() => void credential()} onDisable={(value) => setDisabled(value ? [...new Set([...disabled, provider.id])] : disabled.filter((id) => id !== provider.id))} onRemove={() => saved && !saved.isActive && setRemovalTarget(saved)} onTest={() => saved && void test(saved.id)} provider={provider} saved={saved} state={state} zh={zh} />
    {error && <div className="pv-provider-global-error" role="alert"><AlertTriangle size={14} />{error}</div>}
    {pendingRemoval && <ProviderUndoBanner onUndo={undoPendingRemoval} removal={pendingRemoval} zh={zh} />}
    {restoredLabel && <ProviderRestoreToast label={restoredLabel} zh={zh} />}
    {showAddConnection && <AddConnectionDialog existingIds={[...configs.map((item) => item.id), ...Object.keys(pendingRemovals)]} onClose={() => setShowAddConnection(false)} onConnect={connect} onConnected={setSelectedId} presets={ADD_CONNECTION_PRESETS} zh={zh} />}
    {removalTarget && <ProviderRemovalDialog onCancel={() => setRemovalTarget(null)} onConfirm={() => { void remove(removalTarget.id); setRemovalTarget(null) }} provider={removalTarget} zh={zh} />}
  </div>
}

function ProviderDetail({ onCredential, onDisable, onRemove, onTest, provider, saved, state, zh }: { onCredential: () => void; onDisable: (disabled: boolean) => void; onRemove: () => void; onTest: () => void; provider: ProviderView; saved?: ProviderConfig; state: ProviderState; zh: boolean }): ReactElement {
  const issue = state === 'auth-failed' ? (zh ? '身份验证失败。API 密钥可能无效或已过期，请更新凭据。' : 'Authentication failed. The API key may be invalid or expired. Please update your credentials.') : state === 'disabled' ? (zh ? '此连接已禁用。该提供商的模型不会用于路由或直接使用。' : "This connection is disabled. Models from this provider won't be available for routing or direct use.") : state === 'unreachable' ? (zh ? '无法访问端点。请检查网络连接或确认端点 URL 正确。' : 'Endpoint unreachable. Check your network connection or verify the endpoint URL is correct.') : null
  const endpoint = provider.baseUrl.replace(/^https?:\/\//, '').replace(/\/v\d.*$/, '')
  return <main className="pv-provider-detail" data-figma-screen={providerFigmaScreen(provider.id, state)}><div className="pv-provider-detail-content"><header className="pv-provider-detail-header"><ProviderMark large provider={provider} /><i className={`state ${state}`} /><h2>{provider.label}</h2>{state !== 'active' && state !== 'disabled' && <Tag tone={state === 'not-configured' ? 'warning' : 'danger'}>{stateLabel(state, zh)}</Tag>}<Toggle checked={state !== 'disabled'} label="Enable connection" onChange={(value) => onDisable(!value)} /></header>
    {issue && <div className={`pv-provider-state-message ${state}`}><AlertTriangle size={14} /><p>{issue}</p></div>}
    <ProviderSection title={zh ? '连接详情' : 'CONNECTION DETAILS'}><Kv label={zh ? '类型' : 'Type'} value={zh ? '提供商适配器' : 'Provider adapter'} /><Kv label={zh ? '端点' : 'Endpoint'} value={endpoint} /><Kv label={zh ? '凭据' : 'Credential'} value={saved?.hasApiKey ? (zh ? '已安全存储' : 'Stored securely') : (zh ? '未设置' : 'Not set')} /><Kv label={zh ? '状态' : 'Status'} value={stateLabel(state, zh)} />{state !== 'not-configured' && state !== 'auth-failed' && <Kv label={zh ? '范围' : 'Scope'} value={provider.scope} />}{state === 'not-configured' && <div className="pv-provider-connect"><p>{zh ? `添加 ${provider.label} API 密钥以启用此连接并访问可用模型。` : `Add your ${provider.label} API key to enable this connection and access available models.`}</p><ActionButton onClick={onCredential} primary>{zh ? '连接' : 'Connect'}</ActionButton></div>}</ProviderSection>
    {state !== 'not-configured' && state !== 'auth-failed' && state !== 'unreachable' && <><ProviderSection title={zh ? '能力' : 'CAPABILITIES'}><div className="pv-provider-capabilities">{provider.capabilities.map((item) => <span key={item}>{item}</span>)}</div></ProviderSection><ProviderSection title={zh ? '可用模型' : 'AVAILABLE MODELS'}><div className="pv-provider-models">{(MODELS[provider.id] ?? [provider.model]).map((model) => <div key={model}><strong>{model}</strong><small>{provider.context}</small></div>)}</div></ProviderSection></>}
    {state === 'not-configured' ? <ProviderSection title={zh ? '可用模型' : 'AVAILABLE MODELS'}><p className="pv-provider-empty">{zh ? '连接后查看可用模型。' : 'Connect to see available models.'}</p></ProviderSection> : <ProviderSection title={zh ? '操作' : 'ACTIONS'}><div className="pv-provider-actions"><ActionButton onClick={onCredential}>{state === 'auth-failed' ? (zh ? '更新密钥' : 'Update Key') : (zh ? '管理凭据' : 'Manage Credential')}</ActionButton><ActionButton onClick={onTest}>{state === 'testing' ? (zh ? '取消测试' : 'Cancel Test') : (zh ? '测试连接' : 'Test Connection')}</ActionButton>{state !== 'auth-failed' && state !== 'unreachable' && <><ActionButton onClick={onTest}>{zh ? '刷新模型' : 'Refresh Models'}</ActionButton><ActionButton onClick={() => onDisable(true)}>{zh ? '禁用' : 'Disable'}</ActionButton></>}</div></ProviderSection>}
    {state !== 'not-configured' && state !== 'auth-failed' && state !== 'unreachable' && <ProviderSection title={zh ? '使用位置' : 'USED BY'}><p className="pv-provider-empty">{zh ? '当前没有可验证的路由或自动化引用。' : 'No verified routing or automation references are available.'}</p></ProviderSection>}
    {saved?.hasApiKey && <section className="pv-provider-danger"><h3>{zh ? '危险区域' : 'DANGER ZONE'}</h3><div><p>{zh ? '移除此连接已保存的 API 密钥。' : 'Remove the stored API key for this connection.'}</p><ActionButton disabled={saved.isActive} onClick={onRemove} variant="danger">{zh ? '移除凭据' : 'Remove Credential'}</ActionButton></div></section>}
  </div></main>
}

function Routing({ configs, zh }: { configs: ProviderConfig[]; zh: boolean }): ReactElement {
  const ready = configs.filter((item) => item.hasApiKey); const fallback = ready[0]?.id ?? ''
  const [scope, setScope] = useStoredSetting('routing-scope', 'global'); const [prompt, setPrompt] = useStoredSetting('routing-prompt-fallback', true); const [cross, setCross] = useStoredSetting('routing-cross-provider', false); const [costs, setCosts] = useStoredSetting('routing-show-costs', true); const [budgetAlert, setBudgetAlert] = useStoredSetting('routing-budget-alert', true); const [tokenTracking, setTokenTracking] = useStoredSetting('routing-token-tracking', true); const [local, setLocal] = useStoredSetting('routing-prefer-local', true)
  const tasks = ['Chat / Q&A', 'Research', 'Code generation', 'Code review', 'Document', 'Image generation', 'Embedding', 'Audio']
  return <main className="pv-provider-subpage routing"><h1>{zh ? '路由' : 'Routing'}</h1><div className="pv-provider-scope-tabs">{[['global', 'Global'], ['workspace', 'Workspace'], ['project', 'Project']].map(([id, label]) => <button className={scope === id ? 'active' : ''} key={id} onClick={() => setScope(id)} type="button">{label}</button>)}</div><SettingsSection title="TASK-BASED ROUTING RULES"><div className="pv-routing-table"><div className="header"><span>Task Type</span><span>Provider / Model</span><span>Fallback</span><span>Priority</span></div>{tasks.map((task, index) => <div key={task}><strong>{task}</strong><SelectControl ariaLabel={task} onChange={() => undefined} options={ready.length ? ready.map((item) => [item.id, `${item.label} / ${item.model}`]) : [['', 'Not configured']]} value={fallback} /><span>{index === 5 || index === 7 ? '—' : ready[0]?.model ?? '—'}</span><Tag>{index < 3 ? 'High' : index < 5 ? 'Medium' : 'Low'}</Tag></div>)}</div><button className="pv-settings-add-row" type="button"><span>+</span>Add Rule</button></SettingsSection><SettingsSection title="FALLBACK POLICY"><p className="pv-provider-policy-copy">When a routed model is unavailable, Pivot asks before switching to a fallback. Auto-fallback never sends content to another provider silently.</p><SettingRow description="Always ask before sending content to a different provider" label="Prompt before fallback"><Toggle checked={prompt} label="Prompt before fallback" onChange={setPrompt} /></SettingRow><SettingRow description="Allow fallback to models from different providers" label="Cross-provider fallback"><Toggle checked={cross} label="Cross-provider fallback" onChange={setCross} /></SettingRow><SettingRow description="Number of retries before triggering fallback" label="Retry attempts"><SelectControl ariaLabel="Retry attempts" onChange={() => undefined} options={[['1', '1'], ['3', '3'], ['5', '5']]} value="3" /></SettingRow><SettingRow description="Seconds to wait before considering a model unavailable" label="Timeout threshold"><SelectControl ariaLabel="Timeout threshold" onChange={() => undefined} options={[['15', '15s'], ['30', '30s'], ['60', '60s']]} value="30" /></SettingRow></SettingsSection><SettingsSection title="COST & USAGE"><SettingRow description="Display estimated API cost per task in routing selector" label="Show cost estimates"><Toggle checked={costs} label="Show cost estimates" onChange={setCosts} /></SettingRow><SettingRow description="Notify when estimated spend exceeds threshold" label="Monthly budget alert"><span className="pv-settings-inline-control"><Toggle checked={budgetAlert} label="Monthly budget alert" onChange={setBudgetAlert} /><SelectControl ariaLabel="Monthly budget threshold" onChange={() => undefined} options={[['25', '$25.00'], ['50', '$50.00'], ['100', '$100.00']]} value="50" /></span></SettingRow><SettingRow description="Track and display token consumption per provider" label="Token usage tracking"><Toggle checked={tokenTracking} label="Token usage tracking" onChange={setTokenTracking} /></SettingRow><SettingRow description="Route to local models first when capable to reduce API costs" label="Prefer local models"><Toggle checked={local} label="Prefer local models" onChange={setLocal} /></SettingRow></SettingsSection></main>
}

function Monitor({ configs, zh }: { configs: ProviderConfig[]; zh: boolean }): ReactElement {
  const selected = configs.find((item) => item.isActive) ?? configs[0]; const models = selected ? (MODELS[selected.id] ?? [selected.model]) : MODELS.anthropic
  return <main className="pv-provider-subpage monitor"><h1>{zh ? '模型与默认值' : 'Models & Defaults'}</h1><div className="pv-provider-selector"><span><small>{zh ? '提供商' : 'Provider'}</small><strong>{selected?.label ?? 'Anthropic'}</strong></span><Tag tone={selected ? 'accent' : 'warning'}>{selected ? (zh ? '已连接' : 'Connected') : (zh ? '未配置' : 'Not configured')}</Tag><small>{models.length} {zh ? '个模型可用' : 'models available'}</small></div>{models.map((model, index) => <ModelCard active={index < 2} key={model} model={model} zh={zh} />)}</main>
}

function ModelCard({ active, model, zh }: { active: boolean; model: string; zh: boolean }): ReactElement {
  const [streaming, setStreaming] = useStoredSetting(`model-${model}-streaming`, true)
  return <section className="pv-model-default-card"><header><span>{model.includes('opus') ? 'O' : model.includes('sonnet') ? 'S' : 'H'}</span><div><strong>{model}</strong><small>200K context</small></div><Tag tone={active ? 'accent' : 'neutral'}>{active ? 'Active' : 'Idle'}</Tag></header><div><SettingRow description="Controls randomness of model output" label="Default Temperature"><input className="pv-settings-input" defaultValue={model.includes('sonnet') ? '0.3' : '0.7'} /></SettingRow><SettingRow description="Maximum tokens per response" label="Max Output Tokens"><input className="pv-settings-input" defaultValue={model.includes('sonnet') ? '8192' : '4096'} /></SettingRow><SettingRow description="Nucleus sampling threshold" label="Top P"><input className="pv-settings-input" defaultValue="0.95" /></SettingRow><SettingRow description="Reduces repetition in generated text" label="Frequency Penalty"><input className="pv-settings-input" defaultValue="0.0" /></SettingRow><SettingRow description="Default system prompt for this model" label="System Prompt"><SelectControl ariaLabel={`${model} prompt`} onChange={() => undefined} options={[['workspace', 'Workspace default'], ['code', 'Code assistant']]} value={model.includes('sonnet') ? 'code' : 'workspace'} /></SettingRow><SettingRow description="Max concurrent requests to this model" label="Rate Limit"><input className="pv-settings-input" defaultValue="5" /></SettingRow><SettingRow description="Routing priority when multiple models qualify" label="Priority"><SelectControl ariaLabel={`${model} priority`} onChange={() => undefined} options={[['high', 'High'], ['low', 'Low']]} value={active ? 'high' : 'low'} /></SettingRow><SettingRow description="Enable streaming responses from this model" label="Streaming"><Toggle checked={streaming} label={`${model} streaming`} onChange={setStreaming} /></SettingRow></div></section>
}

function ProviderSection({ children, title }: { children: ReactNode; title: string }): ReactElement { return <section className="pv-provider-section"><h3>{title}</h3>{children}</section> }
function Kv({ label, value }: { label: string; value: string }): ReactElement { return <div className="pv-provider-kv"><span>{label}</span><strong>{value}</strong></div> }
function ProviderMark({ large = false, provider }: { large?: boolean; provider: ProviderView }): ReactElement { return <span className={`pv-provider-mark ${large ? 'large' : ''}`}>{provider.label.slice(0, 1)}</span> }
function providerState(saved: ProviderConfig | undefined, result: ProviderConnectionResult | undefined, disabled: boolean, loading: boolean): ProviderState { if (disabled) return 'disabled'; if (loading) return 'testing'; if (!saved?.hasApiKey) return 'not-configured'; if (!result || result.ok) return 'active'; if (result.status === 401 || result.status === 403) return 'auth-failed'; if (result.status === 429) return 'rate-limited'; if (result.status === 404) return 'model-unavailable'; return 'unreachable' }
function providerFigmaScreen(id: string, state: ProviderState): string {
  if (id.startsWith('anthropic') && state === 'rate-limited') return '1406:12069'
  if (id.startsWith('openai') && state === 'auth-failed') return '1406:12440'
  if (id.startsWith('anthropic')) return '1405:10653'
  if (id.startsWith('openai')) return '1405:11063'
  if (id.startsWith('google')) return '1405:11501'
  if (id.startsWith('mistral')) return '1405:11877'
  if (id.startsWith('bedrock')) return '1406:11244'
  if (id.startsWith('ollama')) return '1406:11690'
  return '1171:9637'
}
function stateLabel(state: ProviderState, zh: boolean): string { const labels: Record<ProviderState, [string, string]> = { active: ['活跃', 'Active'], 'auth-failed': ['认证失败', 'Auth failed'], disabled: ['已禁用', 'Disabled'], 'model-unavailable': ['服务降级', 'Degraded'], 'not-configured': ['未配置', 'Not configured'], 'rate-limited': ['频率受限', 'Rate limited'], testing: ['测试中…', 'Testing…'], unreachable: ['无法访问', 'Unreachable'] }; return labels[state][zh ? 0 : 1] }
