import { AlertTriangle, Check, KeyRound, Plus, RefreshCcw, Search, Server, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { ProviderConfig, ProviderConfigInput, ProviderKind } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'
import { useProviderStore } from '../stores/provider.store'
import { useProviderModelProbeStore } from '../stores/provider-model-probe.store'
import { useAxisReviewerSettingsStore } from '../stores/axis-reviewer-settings.store'
import { ActionButton, SelectControl, SettingRow, SettingsSection, Tag, Toggle, useStoredSetting } from './settings-controls'

type ProviderDefinition = Omit<ProviderConfigInput, 'apiKey'>
type ProviderTab = 'connections' | 'routing' | 'monitor'

const PRESETS: ProviderDefinition[] = [
  { baseUrl: 'https://api.anthropic.com/v1', id: 'anthropic', kind: 'anthropic', label: 'Anthropic', model: 'claude-sonnet-4-5' },
  { baseUrl: 'https://api.openai.com/v1', id: 'openai', kind: 'openai', label: 'OpenAI', model: 'gpt-5' },
  { baseUrl: 'https://api.deepseek.com/v1', id: 'deepseek', kind: 'deepseek', label: 'DeepSeek', model: 'deepseek-chat' },
  { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', id: 'glm', kind: 'glm', label: 'GLM', model: 'glm-4.5' },
  { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', id: 'qwen', kind: 'qwen', label: 'Qwen', model: 'qwen3-coder-plus' },
  { baseUrl: 'https://api.moonshot.cn/v1', id: 'kimi', kind: 'kimi', label: 'Kimi', model: 'kimi-k2' },
]

const PROVIDER_MODELS: Record<ProviderKind, string[]> = {
  anthropic: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'],
  openai: ['gpt-5', 'gpt-5-mini', 'o3'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  glm: ['glm-4.5', 'glm-4.5-air'],
  qwen: ['qwen3-coder-plus', 'qwen3-max'],
  kimi: ['kimi-k2', 'kimi-k2-thinking'],
  custom: [],
}

export function ModelsProvidersSettings(): ReactElement {
  const { locale } = useLocale()
  const zh = locale === 'zh-CN'
  const configs = useProviderStore((state) => state.configs)
  const load = useProviderStore((state) => state.load)
  const [tab, setTab] = useState<ProviderTab>('connections')
  useEffect(() => { void load() }, [load])

  return <section className="pv-provider-settings" data-figma-screen="126:4263">
    <nav aria-label={zh ? '模型与提供商页面' : 'Models and providers views'} className="pv-provider-tabs">
      {([['connections', zh ? '连接' : 'Connections'], ['routing', zh ? '路由' : 'Routing'], ['monitor', zh ? '监控' : 'Monitor']] as Array<[ProviderTab, string]>).map(([id, label]) => <button aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)} type="button">{label}</button>)}
    </nav>
    {tab === 'connections' && <ConnectionsPanel configs={configs} zh={zh} />}
    {tab === 'routing' && <RoutingPanel configs={configs} zh={zh} />}
    {tab === 'monitor' && <MonitorPanel configs={configs} zh={zh} />}
  </section>
}

function ConnectionsPanel({ configs, zh }: { configs: ProviderConfig[]; zh: boolean }): ReactElement {
  const error = useProviderStore((state) => state.error)
  const isLoading = useProviderStore((state) => state.isLoading)
  const remove = useProviderStore((state) => state.remove)
  const save = useProviderStore((state) => state.save)
  const setActive = useProviderStore((state) => state.setActive)
  const test = useProviderStore((state) => state.test)
  const testResults = useProviderStore((state) => state.testResults)
  const [selectedId, setSelectedId] = useState('anthropic')
  const modelProbe = useProviderModelProbeStore((state) => state.results[selectedId])
  const modelProbeError = useProviderModelProbeStore((state) => state.errors[selectedId])
  const loadingModels = useProviderModelProbeStore((state) => Boolean(state.loading[selectedId]))
  const probe = useProviderModelProbeStore((state) => state.probe)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'configured' | 'local'>('all')
  const [draft, setDraft] = useState<Partial<ProviderDefinition>>({})
  const [apiKey, setApiKey] = useState('')

  const catalog = useMemo(() => {
    const known = PRESETS.map((preset) => configs.find((config) => config.id === preset.id) ?? preset)
    const custom = configs.filter((config) => !PRESETS.some((preset) => preset.id === config.id))
    return [...known, ...custom].filter((provider) => {
      const matchesQuery = `${provider.label} ${provider.model}`.toLowerCase().includes(query.toLowerCase())
      const stored = configs.find((config) => config.id === provider.id)
      return matchesQuery && (filter === 'all' || (filter === 'configured' && stored?.hasApiKey) || (filter === 'local' && provider.kind === 'custom'))
    })
  }, [configs, filter, query])

  const definition = PRESETS.find((provider) => provider.id === selectedId)
  const saved = configs.find((provider) => provider.id === selectedId)
  const selected: ProviderDefinition = {
    baseUrl: draft.baseUrl ?? saved?.baseUrl ?? definition?.baseUrl ?? 'http://localhost:11434/v1',
    id: selectedId,
    kind: (draft.kind ?? saved?.kind ?? definition?.kind ?? 'custom') as ProviderKind,
    label: draft.label ?? saved?.label ?? definition?.label ?? (zh ? '自定义连接' : 'Custom connection'),
    model: draft.model ?? saved?.model ?? definition?.model ?? 'local-model',
  }
  const result = testResults[selectedId]
  const status = result ? (result.ok ? 'connected' : result.status === 429 ? 'limited' : 'failed') : saved?.isActive ? 'connected' : saved?.hasApiKey ? 'configured' : 'missing'

  function select(id: string): void { setSelectedId(id); setDraft({}); setApiKey('') }
  function addCustom(): void {
    const id = `custom-${Date.now()}`
    setSelectedId(id)
    setDraft({ id, kind: 'custom', label: zh ? '新建自定义连接' : 'New custom connection', baseUrl: 'http://localhost:11434/v1', model: 'local-model' })
    setApiKey('')
  }
  async function saveSelected(): Promise<void> { await save({ ...selected, apiKey: apiKey || undefined }); setApiKey(''); setDraft({}) }
  async function deleteSelected(): Promise<void> {
    if (!saved || saved.isActive || !window.confirm(zh ? '删除这个连接？' : 'Delete this connection?')) return
    await remove(saved.id)
    select('anthropic')
  }

  return <div className="pv-provider-connections">
    <aside className="pv-provider-catalog">
      <header><div><strong>{zh ? '连接' : 'Connections'}</strong><small>{configs.filter((item) => item.hasApiKey).length} {zh ? '个已配置' : 'configured'}</small></div><button aria-label={zh ? '添加连接' : 'Add connection'} onClick={addCustom} type="button"><Plus size={14} /></button></header>
      <label className="pv-provider-search"><Search size={13} /><input onChange={(event) => setQuery(event.target.value)} placeholder={zh ? '搜索连接' : 'Search connections'} value={query} /></label>
      <div className="pv-provider-filters">{(['all', 'configured', 'local'] as const).map((id) => <button className={filter === id ? 'active' : ''} key={id} onClick={() => setFilter(id)} type="button">{id === 'all' ? (zh ? '全部' : 'All') : id === 'configured' ? (zh ? '已配置' : 'Ready') : (zh ? '本地' : 'Local')}</button>)}</div>
      <div className="pv-provider-list">{catalog.map((provider) => {
        const stored = configs.find((config) => config.id === provider.id)
        return <button className={selectedId === provider.id ? 'active' : ''} key={provider.id} onClick={() => select(provider.id)} type="button"><span className="pv-provider-mark">{provider.kind === 'custom' ? <Server size={14} /> : provider.label.slice(0, 1)}</span><span><strong>{provider.label}</strong><small>{provider.model}</small></span><i className={stored?.isActive ? 'online' : stored?.hasApiKey ? 'ready' : ''} /></button>
      })}</div>
    </aside>

    <div className="pv-provider-detail">
      <header className="pv-provider-detail-header"><div className="pv-provider-title"><span className="pv-provider-mark large">{selected.kind === 'custom' ? <Server size={18} /> : selected.label.slice(0, 1)}</span><div><h2>{selected.label}</h2><span><Tag tone={status === 'connected' ? 'accent' : status === 'limited' ? 'warning' : status === 'failed' ? 'danger' : 'neutral'}>{status === 'connected' ? (zh ? '已连接' : 'Connected') : status === 'limited' ? (zh ? '频率受限' : 'Rate limited') : status === 'failed' ? (zh ? '连接失败' : 'Connection failed') : status === 'configured' ? (zh ? '已配置' : 'Configured') : (zh ? '未配置' : 'Not configured')}</Tag>{saved?.isActive && <Tag tone="accent">{zh ? '默认' : 'Default'}</Tag>}</span></div></div><Toggle checked={Boolean(saved)} label={zh ? '启用连接' : 'Enable connection'} onChange={(enabled) => { if (!enabled && saved && !saved.isActive) void deleteSelected() }} /></header>
      {(error || (result && !result.ok)) && <div className="pv-provider-alert"><AlertTriangle size={15} /><span><strong>{zh ? '连接需要处理' : 'Connection needs attention'}</strong><small>{error ?? result?.message}</small></span></div>}

      <SettingsSection title={zh ? '连接详情' : 'CONNECTION DETAILS'}>
        {selected.kind === 'custom' && <SettingRow label={zh ? '名称' : 'Name'}><input className="pv-settings-input" onChange={(event) => setDraft((value) => ({ ...value, label: event.target.value }))} value={selected.label} /></SettingRow>}
        <SettingRow description={selected.kind === 'custom' ? (zh ? 'OpenAI 兼容接口或本地模型服务地址' : 'OpenAI-compatible API or local model server') : (zh ? '官方 API 地址' : 'Official API endpoint')} label={zh ? '接口地址' : 'Endpoint'}><input className="pv-settings-input wide" onChange={(event) => setDraft((value) => ({ ...value, baseUrl: event.target.value }))} readOnly={selected.kind !== 'custom'} value={selected.baseUrl} /></SettingRow>
        <SettingRow description={saved?.hasApiKey ? (zh ? '凭据已安全保存；输入新密钥可替换' : 'Credential saved securely; enter a new key to replace it') : (zh ? '密钥仅存储在本机安全凭据库' : 'Stored only in the local secure credential vault')} icon={<KeyRound size={15} />} label={zh ? '凭据' : 'Credential'}><input autoComplete="off" className="pv-settings-input" onChange={(event) => setApiKey(event.target.value)} placeholder={saved?.hasApiKey ? '••••••••••••' : (zh ? '输入 API 密钥' : 'Enter API key')} type="password" value={apiKey} /></SettingRow>
        <SettingRow label={zh ? '默认模型' : 'Default model'}><input className="pv-settings-input" list={`models-${selected.kind}`} onChange={(event) => setDraft((value) => ({ ...value, model: event.target.value }))} value={selected.model} /><datalist id={`models-${selected.kind}`}>{PROVIDER_MODELS[selected.kind].map((model) => <option key={model} value={model} />)}</datalist></SettingRow>
        <SettingRow label={zh ? '作用范围' : 'Scope'}><SelectControl ariaLabel={zh ? '作用范围' : 'Scope'} onChange={() => undefined} options={[["global", zh ? '全局' : 'Global'], ["workspace", zh ? '工作区' : 'Workspace'], ["project", zh ? '项目' : 'Project']]} value="global" /></SettingRow>
      </SettingsSection>

      <SettingsSection title={zh ? '可用模型' : 'AVAILABLE MODELS'}>
        <div className="pv-provider-model-evidence"><span>{modelProbe?.cacheState === 'stale' ? (zh ? '显示缓存结果；刷新失败' : 'Showing cached results; refresh failed') : modelProbe?.probedAt ? `${zh ? '探测于' : 'Probed'} ${new Date(modelProbe.probedAt).toLocaleString()}` : (zh ? '尚未从提供商探测' : 'Not probed from provider')}</span><ActionButton disabled={!saved?.hasApiKey || loadingModels} onClick={() => void probe(selected.id, true)}><RefreshCcw className={loadingModels ? 'spin' : ''} size={13} />{loadingModels ? (zh ? '正在探测' : 'Probing') : (zh ? '刷新模型' : 'Refresh models')}</ActionButton></div>
        {modelProbeError && <div className="pv-provider-alert"><AlertTriangle size={15} /><span><strong>{zh ? '模型探测失败' : 'Model probe failed'}</strong><small>{modelProbeError}</small></span></div>}
        {modelProbe && !modelProbe.available && <div className="pv-provider-empty">{modelProbe.unavailableReason === 'not-configured' ? (zh ? '请先保存凭据' : 'Save credentials first') : (zh ? '提供商暂时不可用' : 'Provider is currently unavailable')}</div>}
        {modelProbe?.available && modelProbe.models.length === 0 && <div className="pv-provider-empty">{zh ? '提供商没有返回模型' : 'Provider returned no models'}</div>}
        <div className="pv-provider-models">{(modelProbe?.available ? modelProbe.models : PROVIDER_MODELS[selected.kind]).map((model) => <div key={model}><span><strong>{model}</strong><small>{model === selected.model ? (zh ? '默认模型' : 'Default model') : (zh ? '提供商报告可用' : 'Reported by provider')}</small></span>{model === selected.model && <Check size={14} />}</div>)}</div>
        {modelProbe?.truncated && <small className="pv-provider-truncated">{zh ? '结果已限制为前 100 项' : 'Results limited to the first 100 models'}</small>}
      </SettingsSection>

      <footer className="pv-provider-actions">
        <ActionButton onClick={() => void saveSelected()} primary>{zh ? '保存连接' : 'Save connection'}</ActionButton>
        <ActionButton disabled={!saved?.hasApiKey || isLoading} onClick={() => void test(selected.id)}><RefreshCcw className={isLoading ? 'spin' : ''} size={13} />{zh ? '测试连接' : 'Test connection'}</ActionButton>
        <ActionButton disabled={!saved?.hasApiKey || saved.isActive} onClick={() => void setActive(selected.id)}>{zh ? '设为默认' : 'Make default'}</ActionButton>
        {selected.kind === 'custom' && saved && <ActionButton disabled={saved.isActive} onClick={() => void deleteSelected()}><Trash2 size={13} />{zh ? '删除' : 'Delete'}</ActionButton>}
      </footer>
    </div>
  </div>
}

function RoutingPanel({ configs, zh }: { configs: ProviderConfig[]; zh: boolean }): ReactElement {
  const ready = configs.filter((provider) => provider.hasApiKey)
  const fallback = ready[0]?.id ?? ''
  const [scope, setScope] = useStoredSetting('routing-scope', 'global')
  const [crossProvider, setCrossProvider] = useStoredSetting('routing-cross-provider', false)
  const [preferLocal, setPreferLocal] = useStoredSetting('routing-prefer-local', true)
  const reviewerConfig = useAxisReviewerSettingsStore((state) => state.config)
  const reviewerEvidence = useAxisReviewerSettingsStore((state) => state.evidence)
  const reviewerError = useAxisReviewerSettingsStore((state) => state.error)
  const reviewerLoading = useAxisReviewerSettingsStore((state) => state.loading)
  const loadReviewerSettings = useAxisReviewerSettingsStore((state) => state.load)
  const qualifyReviewer = useAxisReviewerSettingsStore((state) => state.qualify)
  const updateReviewer = useAxisReviewerSettingsStore((state) => state.update)
  const reviewerProvider = ready.find((provider) => provider.isActive) ?? ready[0]
  const [reviewerModel, setReviewerModel] = useState('')
  useEffect(() => { void loadReviewerSettings() }, [loadReviewerSettings])
  const tasks = [[zh ? '对话与问答' : 'Chat & Q/A', 'general'], [zh ? '研究' : 'Research', 'research'], [zh ? '代码生成' : 'Code generation', 'code'], [zh ? '代码审查' : 'Code review', 'review'], [zh ? '文档' : 'Documents', 'document']]
  return <div className="pv-provider-subpage" data-figma-screen="216:4078">
    <div className="pv-provider-scope-tabs">{[['global', zh ? '全局' : 'Global'], ['workspace', zh ? '工作区' : 'Workspace'], ['project', zh ? '项目' : 'Project']].map(([id, label]) => <button className={scope === id ? 'active' : ''} key={id} onClick={() => setScope(id)} type="button">{label}</button>)}</div>
    <SettingsSection title={zh ? '按任务路由' : 'TASK-BASED ROUTING RULES'}><div className="pv-routing-table"><div className="header"><span>{zh ? '任务' : 'Task'}</span><span>{zh ? '提供商' : 'Provider'}</span><span>{zh ? '模型' : 'Model'}</span><span>{zh ? '回退' : 'Fallback'}</span></div>{tasks.map(([label, id]) => <div key={id}><strong>{label}</strong><SelectControl ariaLabel={`${label} provider`} onChange={() => undefined} options={ready.length ? ready.map((provider) => [provider.id, provider.label]) : [['', zh ? '未配置' : 'Not configured']]} value={fallback} /><span>{ready[0]?.model ?? '—'}</span><Tag>{zh ? '自动' : 'Auto'}</Tag></div>)}</div></SettingsSection>
    <SettingsSection title={zh ? '回退策略' : 'FALLBACK POLICY'}>
      <SettingRow description={zh ? '主模型不可用时允许切换到其他提供商' : 'Allow another provider when the primary model is unavailable'} label={zh ? '跨提供商回退' : 'Cross-provider fallback'}><Toggle checked={crossProvider} label="Cross-provider fallback" onChange={setCrossProvider} /></SettingRow>
      <SettingRow description={zh ? '本地模型可用时优先使用，减少网络请求' : 'Use available local models first to reduce network requests'} label={zh ? '优先本地模型' : 'Prefer local models'}><Toggle checked={preferLocal} label="Prefer local models" onChange={setPreferLocal} /></SettingRow>
      <SettingRow label={zh ? '请求超时' : 'Request timeout'}><SelectControl ariaLabel="Request timeout" onChange={() => undefined} options={[["30", "30 s"], ["60", "60 s"], ["120", "120 s"]]} value="60" /></SettingRow>
    </SettingsSection>
    <SettingsSection title={zh ? '独立审查模型' : 'INDEPENDENT REVIEWER'}>
      <SettingRow description={zh ? '先执行一次无工具结构化资格验证；费用上限为 $0.01。' : 'Run one no-tool structured qualification first; cost is capped at $0.01.'} label={zh ? '正确性审查模型' : 'Correctness Reviewer'}><input className="pv-settings-input" disabled={!reviewerProvider} onChange={(event) => setReviewerModel(event.target.value)} placeholder={zh ? '输入不同于 Worker 的模型 ID' : 'Enter a model ID distinct from the Worker'} value={reviewerModel} /></SettingRow>
      {reviewerError && <div className="pv-provider-alert"><AlertTriangle size={15} /><span><strong>{zh ? '审查模型配置失败' : 'Reviewer setup failed'}</strong><small>{reviewerError}</small></span></div>}
      {reviewerEvidence && <div className="pv-provider-empty">{zh ? `资格已通过，有效至 ${new Date(reviewerEvidence.expiresAt).toLocaleString()}` : `Qualified until ${new Date(reviewerEvidence.expiresAt).toLocaleString()}`}</div>}
      <div className="pv-provider-actions"><ActionButton disabled={!reviewerProvider || !reviewerModel.trim() || reviewerLoading} onClick={() => reviewerProvider && void qualifyReviewer(reviewerProvider.id, reviewerModel.trim())}>{zh ? '验证资格' : 'Qualify'}</ActionButton>{reviewerConfig?.routing.enabled ? <ActionButton disabled={reviewerLoading} onClick={() => void updateReviewer({ correctness: null, correctnessFallback: null, enabled: false, security: null, securityFallback: null })}>{zh ? '禁用审查' : 'Disable review'}</ActionButton> : <ActionButton disabled={!reviewerConfig || !reviewerEvidence || reviewerLoading} onClick={() => reviewerEvidence && void updateReviewer({ correctness: { modelId: reviewerEvidence.modelId, providerId: reviewerEvidence.providerId }, correctnessFallback: null, enabled: true, security: null, securityFallback: null })} primary>{zh ? '启用审查' : 'Enable review'}</ActionButton>}</div>
      <small className="pv-provider-truncated">{zh ? '保存后在下次 Runtime 启动时生效；当前事务不会热替换模型。' : 'Takes effect on the Next Runtime start; the current transaction is never hot-swapped.'}</small>
    </SettingsSection>
  </div>
}

function MonitorPanel({ configs, zh }: { configs: ProviderConfig[]; zh: boolean }): ReactElement {
  const selected = configs.find((provider) => provider.isActive) ?? configs[0]
  const [streaming, setStreaming] = useStoredSetting('models-streaming', true)
  const [temperature, setTemperature] = useStoredSetting('models-temperature', 0.7)
  return <div className="pv-provider-subpage" data-figma-screen="227:4311">
    <div className="pv-monitor-summary"><div><span className={selected ? 'online' : ''} /><span><strong>{selected?.label ?? (zh ? '没有已配置的提供商' : 'No configured provider')}</strong><small>{selected ? `${selected.model} · ${zh ? '已连接' : 'Connected'}` : (zh ? '请先在连接页添加凭据' : 'Add credentials in Connections first')}</small></span></div><Tag tone={selected ? 'accent' : 'warning'}>{selected ? (zh ? '可用' : 'Available') : (zh ? '需配置' : 'Setup required')}</Tag></div>
    <SettingsSection title={zh ? '模型默认值' : 'MODEL DEFAULTS'}>
      <SettingRow description={zh ? '对支持的模型启用增量输出' : 'Enable incremental output for supported models'} label={zh ? '流式输出' : 'Streaming'}><Toggle checked={streaming} label="Streaming" onChange={setStreaming} /></SettingRow>
      <SettingRow description={temperature.toFixed(1)} label={zh ? '温度' : 'Temperature'}><input aria-label="Temperature" className="pv-range" max="2" min="0" onChange={(event) => setTemperature(Number(event.target.value))} step="0.1" type="range" value={temperature} /></SettingRow>
      <SettingRow label={zh ? '最大输出令牌' : 'Maximum output tokens'}><SelectControl ariaLabel="Maximum output tokens" onChange={() => undefined} options={[["4096", "4,096"], ["8192", "8,192"], ["16384", "16,384"]]} value="8192" /></SettingRow>
      <SettingRow label={zh ? '系统提示词' : 'System prompt'}><textarea className="pv-settings-textarea" placeholder={zh ? '可选：为此模型设置默认指令' : 'Optional default instruction for this model'} /></SettingRow>
    </SettingsSection>
  </div>
}
