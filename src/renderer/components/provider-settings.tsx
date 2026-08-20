import { Check, KeyRound, PlugZap, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { ProviderConfigInput, ProviderKind } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'
import { useProviderStore } from '../stores/provider.store'

const PRESETS: Array<Omit<ProviderConfigInput, 'apiKey'>> = [
  { baseUrl: 'https://api.anthropic.com/v1', id: 'anthropic', kind: 'anthropic', label: 'Anthropic', model: 'claude-sonnet-4-5' },
  { baseUrl: 'https://api.openai.com/v1', id: 'openai', kind: 'openai', label: 'OpenAI', model: 'gpt-5' },
  { baseUrl: 'https://api.deepseek.com/v1', id: 'deepseek', kind: 'deepseek', label: 'DeepSeek', model: 'deepseek-chat' },
  { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', id: 'glm', kind: 'glm', label: 'GLM', model: 'glm-4.5' },
  { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', id: 'qwen', kind: 'qwen', label: 'Qwen', model: 'qwen3-coder-plus' },
  { baseUrl: 'https://api.moonshot.cn/v1', id: 'kimi', kind: 'kimi', label: 'Kimi', model: 'kimi-k2' },
]

export function LegacyProviderSettings(): ReactElement {
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
  const [apiKey, setApiKey] = useState('')
  const [custom, setCustom] = useState<Omit<ProviderConfigInput, 'apiKey'>>({ baseUrl: 'http://localhost:11434/v1', id: 'custom', kind: 'custom', label: 'Custom endpoint', model: 'local-model' })

  useEffect(() => { void load() }, [load])
  const selected = useMemo(() => {
    const preset = PRESETS.find((provider) => provider.id === selectedId) ?? custom
    const saved = configs.find((provider) => provider.id === selectedId)
    return saved ? { ...preset, ...saved } : preset
  }, [configs, custom, selectedId])

  function change(field: 'baseUrl' | 'label' | 'model', value: string): void {
    if (selected.kind !== 'custom') return
    setCustom((current) => ({ ...current, [field]: value }))
  }

  return (
    <section className="provider-settings">
      <div><div className="eyebrow">{t('provider.eyebrow')}</div><h3>{t('provider.title')}</h3><p>{t('provider.description')}</p></div>
      <div className="provider-grid">
        {[...PRESETS, custom].map((provider) => {
          const saved = configs.find((config) => config.id === provider.id)
          return (
            <button className={`${selectedId === provider.id ? 'active ' : ''}${saved?.isActive ? 'runtime-active' : ''}`} key={provider.id} onClick={() => { setSelectedId(provider.id); setApiKey('') }} type="button">
              <strong>{provider.label}</strong><span>{saved?.hasApiKey ? t('provider.keySaved') : t('common.notConfigured')}</span>{saved?.isActive && <Check size={13} />}
            </button>
          )
        })}
      </div>
      <div className="provider-editor">
        <label><span>{t('provider.name')}</span><input disabled={selected.kind !== 'custom'} onChange={(event) => change('label', event.target.value)} value={selected.label} /></label>
        <label><span>{t('provider.endpoint')}</span><input disabled={selected.kind !== 'custom'} onChange={(event) => change('baseUrl', event.target.value)} value={selected.baseUrl} /></label>
        <label><span>{t('provider.model')}</span><input onChange={(event) => selected.kind === 'custom' ? change('model', event.target.value) : undefined} value={selected.model} readOnly={selected.kind !== 'custom'} /></label>
        <label><span>{t('provider.apiKey')}</span><div className="secret-input"><KeyRound size={13} /><input autoComplete="off" onChange={(event) => setApiKey(event.target.value)} placeholder={configs.some((provider) => provider.id === selected.id && provider.hasApiKey) ? t('provider.savedReplace') : t('provider.enterKey')} type="password" value={apiKey} /></div></label>
      </div>
      <div className="provider-actions">
        <button className="primary-button" onClick={() => void save({ apiKey: apiKey || undefined, baseUrl: selected.baseUrl, id: selected.id, kind: selected.kind as ProviderKind, label: selected.label, model: selected.model }).then(() => setApiKey(''))} type="button"><Save size={13} />{t('provider.saveSecurely')}</button>
        <button className="secondary-button" disabled={!configs.some((provider) => provider.id === selected.id && provider.hasApiKey) || isLoading} onClick={() => void test(selected.id)} type="button"><PlugZap size={13} />{t('provider.testConnection')}</button>
        <button className="secondary-button" disabled={!configs.some((provider) => provider.id === selected.id && provider.hasApiKey)} onClick={() => void setActive(selected.id)} type="button"><Check size={13} />{t('provider.useProvider')}</button>
        {selected.kind === 'custom' && <button className="danger-button" onClick={() => void remove(selected.id)} type="button"><Trash2 size={13} />{t('common.delete')}</button>}
      </div>
      {testResults[selected.id] && <div className={testResults[selected.id]!.ok ? 'provider-test success' : 'provider-test error'}>{testResults[selected.id]!.message} · {testResults[selected.id]!.latencyMs}ms</div>}
      {error && <div className="provider-test error">{error}</div>}
    </section>
  )
}
