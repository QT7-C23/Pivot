import { AlertTriangle, RefreshCcw, X } from 'lucide-react'
import type { ReactElement } from 'react'
import type { AgentCliMaintenanceResult, AgentCliProfile } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'
import { ActionButton } from './settings-controls'

export function RuntimeExecutableDialog({
  busy,
  onClose,
  onRescan,
  onSwitchRuntime,
  profile,
  result,
}: {
  busy: boolean
  onClose: () => void
  onRescan: () => void
  onSwitchRuntime: () => void
  profile: AgentCliProfile | undefined
  result: AgentCliMaintenanceResult
}): ReactElement {
  const { locale } = useLocale()
  const zh = locale === 'zh-CN'
  const label = profile?.label ?? result.profileId
  const command = result.command || profile?.adapterCommand || result.profileId
  return <div className="pv-modal-backdrop" data-figma-screen="71:2336">
    <section aria-labelledby="runtime-missing-title" aria-modal="true" className="pv-modal pv-runtime-missing-dialog" role="alertdialog">
      <header>
        <span><AlertTriangle size={16} /></span>
        <h2 id="runtime-missing-title">{zh ? `${label} CLI 未找到` : `${label} CLI not found`}</h2>
        <button aria-label={zh ? '关闭' : 'Close'} onClick={onClose} type="button"><X size={15} /></button>
      </header>
      <div className="pv-runtime-missing-body">
        <p>{zh ? `Pivot 尝试调用“${command}”，但系统没有返回可执行文件路径。未修改任何文件。` : `Pivot tried to invoke “${command}”, but the system returned no executable path. No files were changed.`}</p>
        <dl>
          <div><dt>{zh ? '发生位置' : 'Location'}</dt><dd>Runtime › {label} › CLI</dd></div>
          <div><dt>{zh ? '错误原因' : 'Cause'}</dt><dd>{zh ? `可执行文件“${command}”不在 PATH 中` : `Executable “${command}” is not available on PATH`}</dd></div>
          <div><dt>{zh ? '影响范围' : 'Impact'}</dt><dd>{zh ? `${label} 的任务暂停；其他 Runtime 不受影响` : `${label} tasks are paused; other runtimes are unaffected`}</dd></div>
          <div><dt>{zh ? '已完成部分' : 'Completed'}</dt><dd>{zh ? '已排队的任务保留，不会丢失进度' : 'Queued tasks are preserved without losing progress'}</dd></div>
        </dl>
        <div className="pv-runtime-technical"><span>{zh ? '技术详情' : 'Technical details'}</span><code>{result.output || `spawn ${command} ENOENT`}</code></div>
        <p className="pv-runtime-recovery-note">{zh ? '关闭后可以从 Runtime Hub 或 Attention 历史重新打开此诊断。' : 'After closing, reopen this diagnostic from Runtime Hub or Attention history.'}</p>
      </div>
      <footer className="pv-dialog-footer">
        <ActionButton disabled={busy} onClick={onRescan} variant="primary"><RefreshCcw className={busy ? 'spin' : ''} size={13} />{zh ? '重新扫描 PATH' : 'Rescan PATH'}</ActionButton>
        <ActionButton disabled={busy || result.profileId === 'local'} onClick={onSwitchRuntime} variant="secondary">{zh ? '切换 Runtime' : 'Switch Runtime'}</ActionButton>
      </footer>
    </section>
  </div>
}
