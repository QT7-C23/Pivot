import { Check, Circle, FileCode2, X } from 'lucide-react'
import type { ReactElement } from 'react'
import type { FileReviewRecord, FileReviewResolution } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'

interface ArtifactReviewChromeProps {
  activeReview: FileReviewRecord | null
  reviews: FileReviewRecord[]
}

interface ArtifactReviewInspectorProps {
  review: FileReviewRecord | null
  resolveReview: (resolution: FileReviewResolution) => Promise<void>
}

const COPY = {
  en: { additions: 'Additions', approve: 'Approve', changes: 'Changes', deletions: 'Deletions', files: 'Files', findings: 'Review Findings', history: 'Version History', noReview: 'Select an artifact to review', pending: 'Review Pending', quality: 'Quality', reject: 'Request Changes', review: 'Review', status: 'Status' },
  'zh-CN': { additions: '新增', approve: '通过', changes: '改动', deletions: '删除', files: '文件', findings: '审查发现', history: '版本历史', noReview: '请选择要审查的成果', pending: '等待审查', quality: '质量', reject: '要求修改', review: '审查', status: '状态' },
  ja: { additions: '追加', approve: '承認', changes: '変更', deletions: '削除', files: 'ファイル', findings: 'レビュー所見', history: 'バージョン履歴', noReview: 'レビューする成果物を選択', pending: 'レビュー待ち', quality: '品質', reject: '変更を依頼', review: 'レビュー', status: '状態' },
  de: { additions: 'Ergänzungen', approve: 'Genehmigen', changes: 'Änderungen', deletions: 'Löschungen', files: 'Dateien', findings: 'Prüfergebnisse', history: 'Versionsverlauf', noReview: 'Artefakt zur Prüfung auswählen', pending: 'Prüfung ausstehend', quality: 'Qualität', reject: 'Änderungen anfordern', review: 'Prüfung', status: 'Status' },
} as const

export function ArtifactReviewContextSidebar({ activeReview, reviews }: ArtifactReviewChromeProps): ReactElement {
  const { locale } = useLocale()
  const copy = COPY[locale === 'zh-CN' || locale === 'ja' || locale === 'de' ? locale : 'en']
  const selectedFile = activeReview?.filePath ?? reviews[0]?.filePath ?? ''
  const versions = reviews.filter((review) => !selectedFile || review.filePath === selectedFile)
  const metrics = activeReview ? reviewMetrics(activeReview) : { additions: 0, deletions: 0 }

  return (
    <aside className="pv-artifact-context" data-figma-region="artifact-context">
      <header>
        <FileCode2 aria-hidden="true" size={15} />
        <span><strong>{fileName(selectedFile) || copy.noReview}</strong><small>{activeReview ? `${fileType(selectedFile)} · ${formatBytes(activeReview.currentContent)}` : ''}</small></span>
      </header>
      <section>
        <h2>{copy.history}</h2>
        <div className="pv-version-list">
          {versions.map((review, index) => (
            <div className={review.id === activeReview?.id ? 'active' : ''} key={review.id}>
              <span><strong>{`v${versions.length - index}${index === 0 ? ' (latest)' : ''}`}</strong><small>{formatRelativeDate(review.updatedAt, locale)}</small></span>
              {review.id === activeReview?.id && <Circle aria-hidden="true" fill="currentColor" size={7} strokeWidth={0} />}
            </div>
          ))}
        </div>
      </section>
      <section className="pv-artifact-facts">
        <h2>{copy.quality}</h2>
        <div><span>{copy.status}</span><strong>{activeReview?.status ?? '—'}</strong></div>
        <div><span>{copy.additions}</span><strong className="positive">+{metrics.additions}</strong></div>
        <div><span>{copy.deletions}</span><strong className="negative">-{metrics.deletions}</strong></div>
        <div><span>{copy.changes}</span><strong>{activeReview?.hunks.length ?? 0}</strong></div>
      </section>
    </aside>
  )
}

export function ArtifactReviewInspector({ review, resolveReview }: ArtifactReviewInspectorProps): ReactElement {
  const { locale } = useLocale()
  const copy = COPY[locale === 'zh-CN' || locale === 'ja' || locale === 'de' ? locale : 'en']
  const metrics = review ? reviewMetrics(review) : { additions: 0, deletions: 0 }

  return (
    <aside className="pv-artifact-inspector" data-figma-region="artifact-inspector">
      <header><strong>{copy.review}</strong></header>
      {!review ? <p className="pv-artifact-inspector-empty">{copy.noReview}</p> : (
        <>
          <section className="pv-review-summary">
            <div><strong>{review.status === 'pending' ? copy.pending : review.status}</strong><small>{review.status}</small></div>
            <dl>
              <div><dt>{copy.files}</dt><dd>1</dd></div>
              <div><dt>{copy.additions}</dt><dd className="positive">+{metrics.additions}</dd></div>
              <div><dt>{copy.deletions}</dt><dd className="negative">-{metrics.deletions}</dd></div>
            </dl>
          </section>
          <section className="pv-review-findings">
            <h2>{copy.findings}</h2>
            {review.hunks.map((hunk) => (
              <article key={hunk.id}>
                <i className={hunk.decision === 'pending' ? 'attention' : 'accent'} />
                <span><strong>{`Hunk ${hunk.index + 1}`}</strong><small>{`-${hunk.originalStart} / +${hunk.modifiedStart} · ${hunk.decision}`}</small></span>
                {hunk.decision === 'pending' && <div><button aria-label={`Reject hunk ${hunk.index + 1}`} onClick={() => void resolveReview({ decision: 'reject', hunkIndex: hunk.index })} type="button"><X size={12} /></button><button aria-label={`Accept hunk ${hunk.index + 1}`} onClick={() => void resolveReview({ decision: 'accept', hunkIndex: hunk.index })} type="button"><Check size={12} /></button></div>}
              </article>
            ))}
            {review.hunks.length === 0 && <p className="pv-artifact-inspector-empty">{copy.noReview}</p>}
          </section>
          <footer>
            <button onClick={() => void resolveReview({ decision: 'reject' })} type="button">{copy.reject}</button>
            <button className="primary" onClick={() => void resolveReview({ decision: 'accept' })} type="button">{copy.approve}</button>
          </footer>
        </>
      )}
    </aside>
  )
}

function reviewMetrics(review: FileReviewRecord): { additions: number; deletions: number } {
  return review.hunks.reduce((total, hunk) => ({ additions: total.additions + countLines(hunk.modifiedContent), deletions: total.deletions + countLines(hunk.originalContent) }), { additions: 0, deletions: 0 })
}

function countLines(value: string): number { return value ? value.split(/\r?\n/).length : 0 }
function fileName(path: string): string { return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path }
function fileType(path: string): string { return path.split('.').at(-1)?.toUpperCase() ?? 'FILE' }
function formatBytes(value: string): string { return `${Math.max(1, Math.round(new Blob([value]).size / 1024))} KB` }
function formatRelativeDate(value: string, locale: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date) : ''
}
