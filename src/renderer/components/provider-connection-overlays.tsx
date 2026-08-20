import { AlertTriangle, Check, LoaderCircle, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { ProviderConfig, ProviderConfigInput, ProviderConnectionResult, ProviderKind } from '../../shared/types/domain'
import type { PendingProviderRemoval } from '../stores/provider.store'
import { ActionButton } from './settings-controls'

export interface ConnectionPreset {
  baseUrl: string
  description: string
  id: string
  kind: ProviderKind
  label: string
  model: string
}

export function AddConnectionDialog({
  existingIds,
  onClose,
  onConnect,
  onConnected,
  presets,
  zh,
}: {
  existingIds: string[]
  onClose: () => void
  onConnect: (input: ProviderConfigInput) => Promise<ProviderConnectionResult | null>
  onConnected: (id: string) => void
  presets: ConnectionPreset[]
  zh: boolean
}): ReactElement {
  const copy = zh ? {
    add: '添加连接', choose: '选择要连接到 Pivot 的模型服务。', cancel: '取消', next: '下一步',
    apiKey: 'API 密钥', configure: '配置', connect: '连接', back: '返回', name: '连接名称（可选）',
    nameHint: '例如：工作、个人', advanced: '自定义端点（高级）', endpoint: '端点 URL', model: '默认模型',
    testing: '正在测试连接', testingHint: 'Pivot 正在验证凭据和模型端点。', success: '连接成功',
    successHint: '凭据已安全保存，这个连接现在可以使用。', done: '完成', keyRequired: '请输入 API 密钥。',
    failed: '连接测试失败，请检查密钥、端点和模型。',
  } : {
    add: 'Add Connection', choose: 'Choose a provider to connect to Pivot.', cancel: 'Cancel', next: 'Next',
    apiKey: 'API Key', configure: 'Configure', connect: 'Connect', back: 'Back', name: 'Connection name (optional)',
    nameHint: 'e.g. Work, Personal', advanced: 'Custom endpoint (advanced)', endpoint: 'Endpoint URL', model: 'Default model',
    testing: 'Testing connection', testingHint: 'Pivot is validating the credential and model endpoint.', success: 'Connection successful',
    successHint: 'The credential is stored securely and this connection is ready to use.', done: 'Done', keyRequired: 'Enter an API key.',
    failed: 'Connection test failed. Check the key, endpoint, and model.',
  }
  const [step, setStep] = useState<'choose' | 'configure' | 'testing' | 'success'>('choose')
  const [selectedId, setSelectedId] = useState(presets[0]?.id ?? '')
  const [apiKey, setApiKey] = useState('')
  const [connectionName, setConnectionName] = useState('')
  const [baseUrl, setBaseUrl] = useState(presets[0]?.baseUrl ?? '')
  const [model, setModel] = useState(presets[0]?.model ?? '')
  const [error, setError] = useState('')
  const selected = presets.find((preset) => preset.id === selectedId) ?? presets[0]!
  const connectionId = useMemo(
    () => uniqueConnectionId(selected.id, connectionName, existingIds),
    [connectionName, existingIds, selected.id],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && step !== 'testing') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, step])

  function selectPreset(id: string): void {
    const preset = presets.find((candidate) => candidate.id === id)
    if (!preset) return
    setSelectedId(id)
    setBaseUrl(preset.baseUrl)
    setModel(preset.model)
  }

  async function connect(): Promise<void> {
    if (!apiKey.trim()) {
      setError(copy.keyRequired)
      return
    }
    setError('')
    setStep('testing')
    const label = connectionName.trim() ? `${selected.label} — ${connectionName.trim()}` : selected.label
    const result = await onConnect({
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
      id: connectionId,
      kind: selected.kind,
      label,
      model: model.trim(),
    })
    if (!result?.ok) {
      setError(result?.message || copy.failed)
      setStep('configure')
      return
    }
    onConnected(connectionId)
    setStep('success')
  }

  return <div className="pv-modal-backdrop" data-figma-screen={step === 'choose' ? '126:5889' : step === 'configure' ? '126:5922' : step === 'testing' ? '126:5945' : '126:5969'}>
    <section aria-labelledby="add-connection-title" aria-modal="true" className="pv-modal pv-connection-dialog" role="dialog">
      {step === 'choose' && <>
        <DialogHeader description={copy.choose} onClose={onClose} title={copy.add} />
        <div className="pv-adapter-list">{presets.map((preset) => <button aria-pressed={preset.id === selected.id} className={preset.id === selected.id ? 'active' : ''} key={preset.id} onClick={() => selectPreset(preset.id)} type="button"><strong>{preset.label}</strong><span>{preset.description}</span></button>)}</div>
        <DialogFooter><ActionButton onClick={onClose} variant="ghost">{copy.cancel}</ActionButton><ActionButton onClick={() => setStep('configure')} variant="primary">{copy.next}</ActionButton></DialogFooter>
      </>}
      {step === 'configure' && <>
        <DialogHeader description={`${copy.configure} ${selected.label}`} onClose={onClose} title={`${copy.configure} ${selected.label}`} />
        <div className="pv-connection-form">
          <label><span>{copy.apiKey}</span><input autoComplete="off" autoFocus onChange={(event) => setApiKey(event.target.value)} placeholder="••••••••••••••••" type="password" value={apiKey} /></label>
          <label><span>{copy.name}</span><input onChange={(event) => setConnectionName(event.target.value)} placeholder={copy.nameHint} value={connectionName} /></label>
          <details><summary>{copy.advanced}</summary><label><span>{copy.endpoint}</span><input onChange={(event) => setBaseUrl(event.target.value)} value={baseUrl} /></label><label><span>{copy.model}</span><input onChange={(event) => setModel(event.target.value)} value={model} /></label></details>
          {error && <p className="pv-dialog-error"><AlertTriangle size={14} />{error}</p>}
        </div>
        <DialogFooter><ActionButton onClick={() => setStep('choose')} variant="ghost">{copy.back}</ActionButton><ActionButton disabled={!baseUrl.trim() || !model.trim()} onClick={() => void connect()} variant="primary">{copy.connect}</ActionButton></DialogFooter>
      </>}
      {step === 'testing' && <div className="pv-dialog-status"><LoaderCircle className="spin" size={28} /><h2>{copy.testing}</h2><p>{copy.testingHint}</p></div>}
      {step === 'success' && <><div className="pv-dialog-status success"><span><Check size={18} /></span><h2>{copy.success}</h2><p>{copy.successHint}</p></div><DialogFooter><ActionButton onClick={onClose} variant="primary">{copy.done}</ActionButton></DialogFooter></>}
    </section>
  </div>
}

export function ProviderRemovalDialog({
  onCancel,
  onConfirm,
  provider,
  zh,
}: {
  onCancel: () => void
  onConfirm: () => void
  provider: ProviderConfig
  zh: boolean
}): ReactElement {
  const title = zh ? `移除 ${provider.label} 的凭据？` : `Remove credential for ${provider.label}?`
  return <div className="pv-modal-backdrop" data-figma-screen="126:6003">
    <section aria-labelledby="remove-provider-title" aria-modal="true" className="pv-modal pv-remove-provider-dialog" role="alertdialog">
      <div className="pv-remove-dialog-heading"><span><AlertTriangle size={16} /></span><h2 id="remove-provider-title">{title}</h2></div>
      <p>{zh ? '这会移除已保存的端点配置和系统密钥。使用此连接的任务将回退到默认 Runtime。' : 'This removes the saved endpoint configuration and keychain credential. Tasks using it will fall back to the default runtime.'}</p>
      <div className="pv-remove-impact"><strong>{zh ? '受影响的资源' : 'Affected resources'}</strong><span>• {zh ? '使用此连接的路由规则' : 'Routing rules using this connection'}</span><span>• {zh ? '引用此模型的自动化' : 'Automations referencing this model'}</span><span>• {zh ? '系统密钥链中的凭据' : 'Credential stored in the system keychain'}</span></div>
      <DialogFooter><ActionButton onClick={onCancel} variant="ghost">{zh ? '取消' : 'Cancel'}</ActionButton><ActionButton onClick={onConfirm} variant="danger">{zh ? '移除凭据' : 'Remove Credential'}</ActionButton></DialogFooter>
    </section>
  </div>
}

export function ProviderUndoBanner({
  onUndo,
  removal,
  zh,
}: {
  onUndo: () => void
  removal: PendingProviderRemoval
  zh: boolean
}): ReactElement {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [])
  const seconds = Math.max(0, Math.ceil((removal.expiresAt - now) / 1000))
  return <div aria-live="polite" className="pv-provider-undo" data-figma-screen="126:6015"><X aria-hidden="true" size={12} /><span>{zh ? `“${removal.config.label}”的凭据已移除` : `Credential for “${removal.config.label}” removed`}</span><time>{seconds}s</time><ActionButton onClick={onUndo} variant="primary"><RotateCcw size={13} />{zh ? '撤销' : 'Undo'}</ActionButton></div>
}

export function ProviderRestoreToast({ label, zh }: { label: string; zh: boolean }): ReactElement {
  return <div aria-live="polite" className="pv-success-toast"><span><Check size={12} /></span>{zh ? `“${label}”已恢复` : `“${label}” restored`}</div>
}

function DialogHeader({ description, onClose, title }: { description: string; onClose: () => void; title: string }): ReactElement {
  return <header className="pv-dialog-header"><div><h2 id="add-connection-title">{title}</h2><p>{description}</p></div><button aria-label="Close" onClick={onClose} type="button"><X size={15} /></button></header>
}

function DialogFooter({ children }: { children: ReactElement | ReactElement[] }): ReactElement {
  return <footer className="pv-dialog-footer">{children}</footer>
}

function uniqueConnectionId(baseId: string, connectionName: string, existingIds: string[]): string {
  if (!existingIds.includes(baseId)) return baseId
  const suffix = connectionName.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const candidate = `${baseId}-${suffix || 'connection'}`
  if (!existingIds.includes(candidate)) return candidate
  let index = 2
  while (existingIds.includes(`${candidate}-${index}`)) index += 1
  return `${candidate}-${index}`
}
