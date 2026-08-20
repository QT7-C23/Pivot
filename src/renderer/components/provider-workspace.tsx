import { Check, ChevronDown, KeyRound, PlugZap, Save, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { ProviderConfigInput, ProviderKind } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'
import { useProviderStore } from '../stores/provider.store'
import { SpotlightButton } from './spotlight-surface'

type ProviderDefinition = Omit<ProviderConfigInput, 'apiKey'>

const PRESETS: ProviderDefinition[] = [
  { baseUrl: 'https://api.anthropic.com/v1', id: 'anthropic', kind: 'anthropic', label: 'Anthropic', model: 'claude-sonnet-4-5' },
  { baseUrl: 'https://api.openai.com/v1', id: 'openai', kind: 'openai', label: 'OpenAI', model: 'gpt-5' },
  { baseUrl: 'https://api.deepseek.com/v1', id: 'deepseek', kind: 'deepseek', label: 'DeepSeek', model: 'deepseek-chat' },
  { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', id: 'glm', kind: 'glm', label: 'GLM', model: 'glm-4.5' },
  { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', id: 'qwen', kind: 'qwen', label: 'Qwen', model: 'qwen3-coder-plus' },
  { baseUrl: 'https://api.moonshot.cn/v1', id: 'kimi', kind: 'kimi', label: 'Kimi', model: 'kimi-k2' },
]

const CUSTOM_PROVIDER: ProviderDefinition = {
  baseUrl: 'http://localhost:11434/v1', id: 'custom', kind: 'custom', label: 'Custom endpoint', model: 'local-model',
}

export function ProviderSettings(): ReactElement {
  const { t } = useLocale()
  const configs = useProviderStore((state) => state.configs)
  const error = useProviderStore((state) => state.error)
  const isLoading = useProviderStore((state) => state.isLoading)
  const load = useProviderStore((state) => state.load)
  const remove = useProviderStore((state) => state.remove)
  const save = useProviderStore((state) => state.save)
  const setActive = useProviderStore((state) => state.setActive)
  const test = useProviderStore((state) => state.test)
  const testResults = useProviderStore((state) => state.testResults)
  const [selectedId, setSelectedId] = useState('anthropic')
  const [draft, setDraft] = useState<Partial<ProviderDefinition>>({})
  const [apiKey, setApiKey] = useState('')

  useEffect(() => { void load() }, [load])

  const definition = useMemo(() => PRESETS.find((provider) => provider.id === selectedId) ?? CUSTOM_PROVIDER, [selectedId])
  const saved = configs.find((provider) => provider.id === selectedId)
  const selected = { ...definition, ...saved, ...draft }
  const isCustom = selected.kind === 'custom'
  const canTestOrActivate = Boolean(saved?.hasApiKey)

  function selectProvider(id: string): void {
    setSelectedId(id)
    setDraft({})
    setApiKey('')
  }

  function change(field: 'baseUrl' | 'label' | 'model', value: string): void {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  async function saveSelected(): Promise<void> {
    await save({ apiKey: apiKey || undefined, baseUrl: selected.baseUrl, id: selected.id, kind: selected.kind as ProviderKind, label: selected.label, model: selected.model })
    setApiKey('')
    setDraft({})
  }

  async function deleteCustomProvider(): Promise<void> {
    if (!saved || saved.isActive || !window.confirm(t('provider.deleteConfirm'))) return
    await remove(saved.id)
    selectProvider('anthropic')
  }

  return (
    <section className="provider-settings">
      <div className="provider-summary">
        <div><span className="eyebrow">{t('provider.eyebrow')}</span><h3>{t('provider.choose')}</h3><p>{t('provider.chooseHint')}</p></div>
        <div className="provider-security"><ShieldCheck size={16} /><span>{t('provider.description')}</span></div>
      </div>

      <div aria-label={t('provider.choose')} className="provider-catalog" role="list">
        {[...PRESETS, CUSTOM_PROVIDER].map((provider) => {
          const stored = configs.find((config) => config.id === provider.id)
          const status = stored?.isActive ? t('provider.active') : stored?.hasApiKey ? t('provider.configured') : t('common.notConfigured')
          return <SpotlightButton aria-pressed={selectedId === provider.id} className={`${selectedId === provider.id ? 'selected ' : ''}${stored?.isActive ? 'runtime-active' : ''}`} key={provider.id} onClick={() => selectProvider(provider.id)} role="listitem" type="button">
            <span className="provider-monogram">{provider.kind === 'custom' ? '+' : provider.label.slice(0, 1)}</span>
            <span className="provider-card-copy"><strong>{provider.label}</strong><small>{provider.kind === 'custom' ? t('provider.custom') : t('provider.preset')}</small></span>
            <span className="provider-card-status">{stored?.isActive && <Check size={12} />}{status}</span>
          </SpotlightButton>
        })}
      </div>

      <section className="provider-config-card">
        <header className="provider-config-heading">
          <div><span className="eyebrow">{isCustom ? t('provider.custom') : t('provider.preset')}</span><h3>{selected.label}</h3></div>
          <span className={`provider-state ${saved?.isActive ? 'active' : ''}`}>{saved?.isActive ? t('provider.active') : saved?.hasApiKey ? t('provider.configured') : t('provider.setupRequired')}</span>
        </header>

        <div className="provider-editor essential-fields">
          {isCustom && <label><span>{t('provider.name')}</span><input onChange={(event) => change('label', event.target.value)} value={selected.label} /></label>}
          <label><span>{t('provider.apiKey')}</span><div className="secret-input"><KeyRound size={14} /><input autoComplete="off" onChange={(event) => setApiKey(event.target.value)} placeholder={saved?.hasApiKey ? t('provider.savedReplace') : t('provider.enterKey')} type="password" value={apiKey} /></div></label>
          <label><span>{t('provider.model')}</span><input onChange={(event) => change('model', event.target.value)} value={selected.model} /></label>
        </div>

        <details className="provider-advanced">
          <summary><span>{t('provider.advanced')}</span><small>{t('provider.advancedHint')}</small><ChevronDown size={15} /></summary>
          <div className="provider-editor"><label><span>{t('provider.endpoint')}</span><input readOnly={!isCustom} onChange={(event) => change('baseUrl', event.target.value)} value={selected.baseUrl} /></label></div>
        </details>

        <footer className="provider-actions">
          <div className="provider-primary-actions">
            <button className="primary-button" onClick={() => void saveSelected()} type="button"><Save size={14} />{t('provider.saveSecurely')}</button>
            <button className="secondary-button" disabled={!canTestOrActivate || isLoading} onClick={() => void test(selected.id)} type="button"><PlugZap size={14} />{t('provider.testConnection')}</button>
            <button className="secondary-button" disabled={!canTestOrActivate || saved?.isActive} onClick={() => void setActive(selected.id)} type="button"><Check size={14} />{saved?.isActive ? t('provider.active') : t('provider.useProvider')}</button>
          </div>
          {isCustom && saved && <button className="provider-delete-button" disabled={saved.isActive} onClick={() => void deleteCustomProvider()} title={saved.isActive ? t('provider.activeCannotDelete') : t('common.delete')} type="button"><Trash2 size={14} />{t('common.delete')}</button>}
        </footer>

        {testResults[selected.id] && <div className={testResults[selected.id]!.ok ? 'provider-test success' : 'provider-test error'}>{testResults[selected.id]!.message} · {testResults[selected.id]!.latencyMs}ms</div>}
        {error && <div className="provider-test error">{error}</div>}
      </section>
    </section>
  )
}
