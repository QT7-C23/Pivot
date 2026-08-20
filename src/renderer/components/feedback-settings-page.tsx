import { Paperclip, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react'
import type {
  FeedbackAttachment,
  FeedbackPriority,
  FeedbackRecord,
  FeedbackType,
} from '../../shared/feedback'
import { useLocale } from '../i18n/locale-context'
import { createFeedbackClient } from '../services/feedback-client'
import { ActionButton, SettingsPage, Tag } from './settings-controls'

const client = createFeedbackClient()

const TYPES: Array<[FeedbackType, string]> = [
  ['bug-report', 'Bug Report'],
  ['feature-request', 'Feature Request'],
  ['improvement', 'Improvement'],
  ['other', 'Other'],
]
const PRIORITIES: FeedbackPriority[] = ['low', 'medium', 'high', 'urgent']

export function FeedbackSettingsPage(): ReactElement {
  const { locale } = useLocale()
  const copy = feedbackCopy(locale)
  const [type, setType] = useState<FeedbackType>('bug-report')
  const [priority, setPriority] = useState<FeedbackPriority>('medium')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [attachments, setAttachments] = useState<FeedbackAttachment[]>([])
  const [history, setHistory] = useState<FeedbackRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !busy
  const typeLabels = useMemo(() => new Map(TYPES), [])

  useEffect(() => {
    let active = true
    void client.list().then((records) => {
      if (active) setHistory(records)
    }).catch((cause: unknown) => {
      if (active) setError(toMessage(cause))
    })
    return () => { active = false }
  }, [])

  async function chooseAttachments(): Promise<void> {
    if (busy || attachments.length >= 5) return
    setBusy(true)
    setError(null)
    try {
      const selected = await client.chooseAttachments()
      setAttachments((current) => {
        const byId = new Map(current.map((attachment) => [attachment.id, attachment]))
        selected.forEach((attachment) => byId.set(attachment.id, attachment))
        return [...byId.values()].slice(0, 5)
      })
    } catch (cause) {
      setError(toMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const record = await client.submit({
        attachmentIds: attachments.map(({ id }) => id),
        description,
        priority,
        submissionId: crypto.randomUUID(),
        title,
        type,
      })
      setHistory((current) => [record, ...current.filter(({ submissionId }) => submissionId !== record.submissionId)])
      setTitle('')
      setDescription('')
      setAttachments([])
      setNotice(copy.saved)
    } catch (cause) {
      setError(toMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function discardAttachment(attachment: FeedbackAttachment): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await client.discardAttachment(attachment.id)
      setAttachments((current) => current.filter(({ id }) => id !== attachment.id))
    } catch (cause) {
      setError(toMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return <SettingsPage description={copy.description} title={copy.title}>
    <form className="pv-feedback-form" onSubmit={(event) => void submit(event)}>
      <h2>{copy.submit}</h2>
      <label>{copy.type}<select disabled={busy} onChange={(event) => setType(event.target.value as FeedbackType)} value={type}>{TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <fieldset><legend>{copy.priority}</legend><div className="pv-feedback-priorities">{PRIORITIES.map((value) => <button aria-checked={priority === value} className={priority === value ? 'active' : ''} disabled={busy} key={value} onClick={() => setPriority(value)} role="radio" type="button">{copy.priorityLabel(value)}</button>)}</div></fieldset>
      <label>{copy.feedbackTitle}<input disabled={busy} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder={copy.titlePlaceholder} required value={title} /></label>
      <label>{copy.feedbackDescription}<textarea disabled={busy} maxLength={10_000} onChange={(event) => setDescription(event.target.value)} placeholder={copy.descriptionPlaceholder} required value={description} /></label>
      <fieldset><legend>{copy.attachments}</legend><div className="pv-feedback-dropzone"><Paperclip aria-hidden="true" size={18} /><span>{copy.attachmentHint}</span><ActionButton disabled={busy || attachments.length >= 5} onClick={() => void chooseAttachments()}>{copy.browse}</ActionButton></div>{attachments.length > 0 && <ul className="pv-feedback-attachments">{attachments.map((attachment) => <li key={attachment.id}><span>{attachment.name} · {formatBytes(attachment.byteLength)}</span><button aria-label={`${copy.remove} ${attachment.name}`} disabled={busy} onClick={() => void discardAttachment(attachment)} type="button"><X size={13} /></button></li>)}</ul>}</fieldset>
      {error && <p className="pv-feedback-message error" role="alert">{error}</p>}
      {notice && <p className="pv-feedback-message" role="status">{notice}</p>}
      <div className="pv-feedback-submit"><button className="pv-settings-button primary" disabled={!canSubmit} type="submit">{busy ? copy.saving : copy.submitButton}</button></div>
    </form>
    <section className="pv-feedback-history"><h2>{copy.history}</h2>{history.length === 0 ? <p className="pv-feedback-empty">{copy.empty}</p> : <div>{history.map((record) => <article key={record.submissionId}><strong>{record.title}</strong><Tag>{typeLabels.get(record.type) ?? record.type}</Tag><Tag tone="accent">{copy.savedLocally}</Tag><time dateTime={record.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(record.createdAt))}</time></article>)}</div>}</section>
  </SettingsPage>
}

function feedbackCopy(locale: string) {
  const zh = locale === 'zh-CN'
  return {
    attachmentHint: zh ? '选择截图、日志或文本文件，最多 5 个，每个不超过 10 MiB' : 'Choose screenshots, logs, or text files — up to 5 files, 10 MiB each',
    attachments: zh ? '附件' : 'Attachments',
    browse: zh ? '浏览' : 'Browse',
    description: zh ? '报告问题、提出功能建议，帮助我们改进 Pivot。' : 'Report issues, suggest features, and help us improve Pivot.',
    descriptionPlaceholder: zh ? '详细描述问题或建议……' : 'Describe the issue or suggestion in detail...',
    empty: zh ? '尚无本地反馈记录。' : 'No local feedback records yet.',
    feedbackDescription: zh ? '描述' : 'Description',
    feedbackTitle: zh ? '标题' : 'Title',
    history: zh ? '历史' : 'HISTORY',
    priority: zh ? '优先级' : 'Priority',
    priorityLabel: (value: FeedbackPriority) => zh ? ({ low: '低', medium: '中', high: '高', urgent: '紧急' } as const)[value] : value[0]!.toUpperCase() + value.slice(1),
    remove: zh ? '移除' : 'Remove',
    saved: zh ? '反馈已安全保存到本地 Outbox。尚未配置远程投递。' : 'Feedback saved safely to the local outbox. Remote delivery is not configured yet.',
    savedLocally: zh ? '已保存到本地' : 'Saved locally',
    saving: zh ? '保存中……' : 'Saving...',
    submit: zh ? '提交反馈' : 'SUBMIT FEEDBACK',
    submitButton: zh ? '保存反馈' : 'Save Feedback',
    title: zh ? '反馈' : 'Feedback',
    titlePlaceholder: zh ? '简要概括你的反馈' : 'Brief summary of your feedback',
    type: zh ? '类型' : 'Type',
  }
}

function formatBytes(value: number): string {
  return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KiB`
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
