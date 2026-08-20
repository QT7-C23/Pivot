import { FolderOpen } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react'
import type { AgentCliProfile, AgentCliProfileId } from '../../shared/types/domain'
import type { ProjectCreationRequest } from '../../shared/project-creation'
import { useLocale } from '../i18n/locale-context'

interface NewProjectDialogProps {
  busy: boolean
  error: string | null
  isOpen: boolean
  onBrowse: (defaultPath?: string) => Promise<string | null>
  onCancel: () => void
  onCreate: (request: ProjectCreationRequest, profileId: AgentCliProfileId) => Promise<void>
  profiles: AgentCliProfile[]
}

const COPY = {
  en: { browse: 'Browse', cancel: 'Cancel', create: 'Create Project', description: 'Description (Optional)', descriptionHint: 'Brief description of your project...', git: 'Initialize Git repository', location: 'Project Location', model: 'Default AI Model', name: 'Project Name', noLocation: 'Choose a parent folder', noRuntime: 'No runtime available', origin: 'Remote Origin URL (Optional)', originHint: 'https://github.com/username/repo.git', subtitle: 'Set up your environment workspace and connect an AI runtime.', template: 'Template', title: 'Create New Project' },
  'zh-CN': { browse: '浏览', cancel: '取消', create: '创建项目', description: '描述（可选）', descriptionHint: '简要描述你的项目…', git: '初始化 Git 仓库', location: '项目位置', model: '默认 AI 模型', name: '项目名称', noLocation: '选择父文件夹', noRuntime: '暂无可用运行时', origin: '远程 Origin URL（可选）', originHint: 'https://github.com/username/repo.git', subtitle: '设置项目工作区并连接 AI 运行时。', template: '模板', title: '创建新项目' },
  ja: { browse: '参照', cancel: 'キャンセル', create: 'プロジェクトを作成', description: '説明（任意）', descriptionHint: 'プロジェクトの簡単な説明…', git: 'Git リポジトリを初期化', location: 'プロジェクトの場所', model: '既定の AI モデル', name: 'プロジェクト名', noLocation: '親フォルダーを選択', noRuntime: '利用可能なランタイムがありません', origin: 'Remote Origin URL（任意）', originHint: 'https://github.com/username/repo.git', subtitle: 'ワークスペースを設定し、AI ランタイムに接続します。', template: 'テンプレート', title: '新しいプロジェクト' },
  de: { browse: 'Durchsuchen', cancel: 'Abbrechen', create: 'Projekt erstellen', description: 'Beschreibung (optional)', descriptionHint: 'Kurze Projektbeschreibung …', git: 'Git-Repository initialisieren', location: 'Projektordner', model: 'Standard-KI-Modell', name: 'Projektname', noLocation: 'Übergeordneten Ordner wählen', noRuntime: 'Keine Laufzeit verfügbar', origin: 'Remote-Origin-URL (optional)', originHint: 'https://github.com/username/repo.git', subtitle: 'Arbeitsbereich einrichten und eine KI-Laufzeit verbinden.', template: 'Vorlage', title: 'Neues Projekt erstellen' },
} as const

export function NewProjectDialog({
  busy,
  error,
  isOpen,
  onBrowse,
  onCancel,
  onCreate,
  profiles,
}: NewProjectDialogProps): ReactElement | null {
  const { locale } = useLocale()
  const copy = COPY[locale === 'zh-CN' || locale === 'ja' || locale === 'de' ? locale : 'en']
  const nameRef = useRef<HTMLInputElement>(null)
  const [description, setDescription] = useState('')
  const [initializeGit, setInitializeGit] = useState(true)
  const [parentPath, setParentPath] = useState('')
  const [profileId, setProfileId] = useState<AgentCliProfileId>('local')
  const [projectName, setProjectName] = useState('my-ai-project')
  const [remoteOriginUrl, setRemoteOriginUrl] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setProfileId(profiles.find((profile) => profile.isSelected)?.id ?? profiles[0]?.id ?? 'local')
    const frame = requestAnimationFrame(() => nameRef.current?.focus())
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [busy, isOpen, onCancel, profiles])

  if (!isOpen) return null
  const canCreate = Boolean(projectName.trim() && parentPath.trim() && profiles.length && !busy)

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!canCreate) return
    await onCreate({
      description,
      initializeGit,
      parentPath,
      projectName,
      remoteOriginUrl: initializeGit && remoteOriginUrl.trim() ? remoteOriginUrl : undefined,
      schemaVersion: 1,
    }, profileId)
  }

  return (
    <div className="pv-new-project-backdrop" data-figma-screen="597:5842" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
      <form aria-labelledby="pv-new-project-title" aria-modal="true" className="pv-new-project-dialog" onSubmit={(event) => void submit(event)} role="dialog">
        <header><h1 id="pv-new-project-title">{copy.title}</h1><p>{copy.subtitle}</p></header>
        <div className="pv-new-project-fields">
          <label>{copy.name}<input data-new-project-field="name" maxLength={80} onChange={(event) => setProjectName(event.target.value)} ref={nameRef} required value={projectName} /></label>
          <label>{copy.location}<span className="pv-new-project-location"><input data-new-project-field="parent" onChange={(event) => setParentPath(event.target.value)} placeholder={copy.noLocation} required value={parentPath} /><button onClick={() => void onBrowse(parentPath || undefined).then((selected) => { if (selected) setParentPath(selected) })} type="button"><FolderOpen size={14} />{copy.browse}</button></span></label>
          <label>{copy.template}<select aria-label={copy.template} defaultValue="blank" disabled><option value="blank">Blank Project</option></select></label>
          <label>{copy.model}<select aria-label={copy.model} disabled={!profiles.length} onChange={(event) => setProfileId(event.target.value as AgentCliProfileId)} value={profiles.length ? profileId : ''}>{profiles.length ? profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>) : <option value="">{copy.noRuntime}</option>}</select></label>
          <label className="wide">{copy.description}<textarea maxLength={2_000} onChange={(event) => setDescription(event.target.value)} placeholder={copy.descriptionHint} value={description} /></label>
        </div>
        <section className="pv-new-project-git">
          <label><input checked={initializeGit} onChange={(event) => { setInitializeGit(event.target.checked); if (!event.target.checked) setRemoteOriginUrl('') }} type="checkbox" />{copy.git}</label>
          <label>{copy.origin}<input disabled={!initializeGit} onChange={(event) => setRemoteOriginUrl(event.target.value)} placeholder={copy.originHint} type="url" value={remoteOriginUrl} /></label>
        </section>
        {error && <p className="pv-new-project-error" role="alert">{error}</p>}
        <footer><button disabled={busy} onClick={onCancel} type="button">{copy.cancel}</button><button className="primary" disabled={!canCreate} type="submit">{busy ? `${copy.create}…` : copy.create}</button></footer>
      </form>
    </div>
  )
}
