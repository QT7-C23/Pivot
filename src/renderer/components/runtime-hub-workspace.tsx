import { Check, RefreshCcw, TerminalSquare } from 'lucide-react'
import type { ReactElement } from 'react'
import type { AxisSemanticReviewTelemetryPage } from '../../shared/axis-semantic-review-telemetry-contracts'
import type {
  AgentAdapterInfo,
  AgentCliMaintenanceAction,
  AgentCliMaintenanceResult,
  AgentCliProfile,
  AgentCliProfileId,
} from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'

const RUNTIME_COPY = {
  en: { runtimes: 'RUNTIMES', hub: 'Runtime Hub', count: (value: number) => `${value} runtimes`, pivotRuntime: 'PIVOT RUNTIME', cliRuntime: 'LOCAL CLI RUNTIME', builtInRuntime: 'Built-in local runtime', builtIn: 'Built-in', localCli: 'Local CLI', adapter: 'Adapter', status: 'Status', command: 'Command', contract: 'Execution contract', ready: 'Ready', loading: 'Loading', current: 'Current session', configured: 'Configured', machine: 'Local machine', maintenance: 'CLI maintenance', maintenanceHint: 'Version and update actions run only when an executable is discoverable. Missing CLIs show an installation or path recovery state.', refresh: 'Refresh version', update: 'Update CLI', unavailable: 'CLI unavailable', result: 'Maintenance result', install: (name: string) => `Install ${name} or configure its executable path, then retry.`, exit: (code: number | null) => `Exit code ${code}` },
  'zh-CN': { runtimes: '运行时', hub: '运行时中心', count: (value: number) => `${value} 个运行时`, pivotRuntime: 'PIVOT 思考引擎', cliRuntime: '本地 CLI 运行时', builtInRuntime: '软件内置本地运行时', builtIn: '内置', localCli: '本地 CLI', adapter: '适配器', status: '状态', command: '命令', contract: '执行合同', ready: '就绪', loading: '加载中', current: '当前会话', configured: '已配置', machine: '本机', maintenance: 'CLI 维护', maintenanceHint: '仅在发现可执行文件后才运行版本和更新操作；缺失的 CLI 会显示安装或路径恢复指引。', refresh: '刷新版本', update: '更新 CLI', unavailable: 'CLI 不可用', result: '维护结果', install: (name: string) => `请安装 ${name} 或配置其可执行文件路径，然后重试。`, exit: (code: number | null) => `退出码 ${code}` },
  ja: { runtimes: 'ランタイム', hub: 'ランタイムハブ', count: (value: number) => `${value} ランタイム`, pivotRuntime: 'PIVOT 推論エンジン', cliRuntime: 'ローカル CLI ランタイム', builtInRuntime: '内蔵ローカルランタイム', builtIn: '内蔵', localCli: 'ローカル CLI', adapter: 'アダプター', status: '状態', command: 'コマンド', contract: '実行契約', ready: '準備完了', loading: '読込中', current: '現在のセッション', configured: '設定済み', machine: 'ローカルマシン', maintenance: 'CLI メンテナンス', maintenanceHint: '実行ファイルを検出した場合のみ更新を実行します。見つからない CLI にはインストールまたはパスの復旧手順を表示します。', refresh: 'バージョン更新', update: 'CLI を更新', unavailable: 'CLI を利用できません', result: 'メンテナンス結果', install: (name: string) => `${name} をインストールするか実行ファイルのパスを設定してください。`, exit: (code: number | null) => `終了コード ${code}` },
  de: { runtimes: 'LAUFZEITEN', hub: 'Runtime Hub', count: (value: number) => `${value} Laufzeiten`, pivotRuntime: 'PIVOT DENK-ENGINE', cliRuntime: 'LOKALE CLI-LAUFZEIT', builtInRuntime: 'Integrierte lokale Laufzeit', builtIn: 'Integriert', localCli: 'Lokale CLI', adapter: 'Adapter', status: 'Status', command: 'Befehl', contract: 'Ausführungsvertrag', ready: 'Bereit', loading: 'Lädt', current: 'Aktuelle Sitzung', configured: 'Konfiguriert', machine: 'Lokaler Rechner', maintenance: 'CLI-Wartung', maintenanceHint: 'Versions- und Updateaktionen laufen nur bei gefundener ausführbarer Datei. Fehlende CLIs zeigen Installations- oder Pfadhilfe.', refresh: 'Version aktualisieren', update: 'CLI aktualisieren', unavailable: 'CLI nicht verfügbar', result: 'Wartungsergebnis', install: (name: string) => `${name} installieren oder den Pfad konfigurieren und erneut versuchen.`, exit: (code: number | null) => `Exit-Code ${code}` },
} as const

interface RuntimeHubWorkspaceProps {
  adapterInfo: AgentAdapterInfo | null
  lastMaintenanceResult: AgentCliMaintenanceResult | null
  maintenanceInProgress: string | null
  profiles: AgentCliProfile[]
  runCliMaintenance: (profileId: AgentCliProfileId, action: AgentCliMaintenanceAction) => Promise<void>
  selectCliProfile: (profileId: AgentCliProfileId) => Promise<void>
  semanticReviewTelemetryError: string | null
  semanticReviewTelemetryLoading: boolean
  semanticReviewTelemetryPage: AxisSemanticReviewTelemetryPage | null
}

export function RuntimeHubWorkspace({
  adapterInfo,
  lastMaintenanceResult,
  maintenanceInProgress,
  profiles,
  runCliMaintenance,
  selectCliProfile,
  semanticReviewTelemetryError,
  semanticReviewTelemetryLoading,
  semanticReviewTelemetryPage,
}: RuntimeHubWorkspaceProps): ReactElement {
  const { locale } = useLocale()
  const copy = RUNTIME_COPY[locale === 'zh-CN' || locale === 'ja' || locale === 'de' ? locale : 'en']
  const selected = profiles.find((profile) => profile.isSelected) ?? profiles[0]
  return (
    <div className="pv-runtime-hub">
      <aside className="pv-runtime-list">
        <header><span>{copy.runtimes}</span><h1>{copy.hub}</h1><p>{copy.count(profiles.length)}</p></header>
        <div>
          {profiles.map((profile) => (
            <button className={profile.isSelected ? 'active' : ''} key={profile.id} onClick={() => void selectCliProfile(profile.id)} type="button">
              <span className="pv-status-dot" /><strong>{runtimeLabel(profile)}</strong>{profile.isSelected && <Check size={13} />}
            </button>
          ))}
        </div>
      </aside>
      <section className="pv-runtime-detail">
        <header className="pv-runtime-header">
          <div><span>{selected?.id === 'local' ? copy.pivotRuntime : copy.cliRuntime}</span><h2>{selected ? runtimeLabel(selected) : adapterInfo?.label ?? 'Pivot Engine'}</h2><p>{selected?.adapterCommand ?? adapterInfo?.command ?? copy.builtInRuntime}</p></div>
          <span className="pv-runtime-badge"><span className="pv-status-dot" />{selected?.id === 'local' ? copy.builtIn : copy.localCli}</span>
        </header>
        <div className="pv-runtime-content">
          <section className="pv-metric-grid">
            <article><span>{copy.adapter}</span><strong>{adapterInfo?.kind ?? 'local'}</strong><small>{copy.contract}</small></article>
            <article><span>{copy.status}</span><strong>{adapterInfo ? copy.ready : copy.loading}</strong><small>{copy.current}</small></article>
            <article><span>{copy.command}</span><strong>{selected?.adapterCommand ? copy.configured : copy.builtIn}</strong><small>{copy.machine}</small></article>
          </section>
          <section className="pv-runtime-card">
            <div data-recovery-copy="true"><TerminalSquare size={18} /><span><h3>{copy.maintenance}</h3><p>{copy.maintenanceHint}</p></span></div>
            <div className="pv-runtime-actions">
              <button disabled={!selected?.versionCommand || maintenanceInProgress !== null} onClick={() => selected && void runCliMaintenance(selected.id, 'version')} type="button"><RefreshCcw className={maintenanceInProgress?.endsWith(':version') ? 'spin' : ''} size={14} />{copy.refresh}</button>
              <button disabled={!selected?.updateCommand || maintenanceInProgress !== null} onClick={() => selected && void runCliMaintenance(selected.id, 'update')} type="button"><RefreshCcw className={maintenanceInProgress?.endsWith(':update') ? 'spin' : ''} size={14} />{copy.update}</button>
            </div>
          </section>
          {lastMaintenanceResult && (
            <section className={lastMaintenanceResult.unavailable ? 'pv-runtime-result unavailable' : 'pv-runtime-result'}>
              <strong>{lastMaintenanceResult.unavailable ? copy.unavailable : copy.result}</strong>
              <p>{lastMaintenanceResult.unavailable ? copy.install(selected ? runtimeLabel(selected) : copy.localCli) : lastMaintenanceResult.output || copy.exit(lastMaintenanceResult.exitCode)}</p>
            </section>
          )}
          <section aria-live="polite" className="pv-runtime-card pv-review-telemetry">
            <div><span><h3>Semantic review evidence</h3><p>Read-only Reviewer decisions and measured usage for the active session.</p></span></div>
            {semanticReviewTelemetryLoading ? (
              <p className="pv-review-telemetry-empty">Loading review evidence…</p>
            ) : semanticReviewTelemetryError ? (
              <p className="pv-review-telemetry-empty">{semanticReviewTelemetryError}</p>
            ) : !semanticReviewTelemetryPage?.available ? (
              <p className="pv-review-telemetry-empty">
                {semanticReviewTelemetryPage?.unavailableReason === 'disabled' ? 'Guarded execution is disabled.' : 'Semantic Reviewer is not configured.'}
              </p>
            ) : semanticReviewTelemetryPage.items.length === 0 ? (
              <p className="pv-review-telemetry-empty">No semantic review evidence for this session.</p>
            ) : (
              <div className="pv-review-telemetry-list">
                {semanticReviewTelemetryPage.items.map((item) => (
                  <article key={item.evidenceId}>
                    <strong>{item.kind} · {item.status}</strong>
                    <span title={item.summary} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.summary}</span>
                    <small>{item.reviewer.providerId} / {item.reviewer.modelId}{item.usage ? ` · ${item.usage.inputTokens + item.usage.outputTokens} tokens` : ''}</small>
                  </article>
                ))}
                {semanticReviewTelemetryPage.truncated && <small>Showing the latest 50 review decisions.</small>}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  )
}

function runtimeLabel(profile: AgentCliProfile): string {
  return profile.id === 'local' ? 'Pivot Engine' : profile.label
}
