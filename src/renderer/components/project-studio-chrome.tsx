import { Eye, GitBranch, ListChecks, MessageSquare, PlayCircle, Share2, TerminalSquare } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { useLocale } from '../i18n/locale-context'

export type ProjectStudioTab = 'chat' | 'tasks' | 'diff' | 'runs' | 'preview' | 'terminal'

interface ProjectStudioChromeProps {
  activeTab: ProjectStudioTab
  children: ReactNode
  figmaScreen: string
  onSelectTab: (tab: ProjectStudioTab) => void
  onShare: () => void
  projectName: string
  workspaceName: string
}

const TABS = [
  { id: 'chat', icon: MessageSquare, label: { en: 'Chat', 'zh-CN': '聊天' } },
  { id: 'tasks', icon: ListChecks, label: { en: 'Tasks', 'zh-CN': '任务' } },
  { id: 'diff', icon: GitBranch, label: { en: 'Diff', 'zh-CN': '差异' } },
  { id: 'runs', icon: PlayCircle, label: { en: 'Runs', 'zh-CN': '运行' } },
  { id: 'preview', icon: Eye, label: { en: 'Preview', 'zh-CN': '预览' } },
  { id: 'terminal', icon: TerminalSquare, label: { en: 'Terminal', 'zh-CN': '终端' } },
] as const

export function ProjectStudioChrome({ activeTab, children, figmaScreen, onSelectTab, onShare, projectName, workspaceName }: ProjectStudioChromeProps): ReactElement {
  const { locale } = useLocale()
  const language = locale === 'zh-CN' ? 'zh-CN' : 'en'
  return <section className="pv-project-studio" data-figma-screen={figmaScreen}>
    <header className="pv-project-studio-header">
      <div><span>{workspaceName}</span><b>/</b><strong>{projectName}</strong></div>
      <button onClick={onShare} type="button"><Share2 aria-hidden="true" size={13} />{language === 'zh-CN' ? '分享' : 'Share'}</button>
    </header>
    <nav aria-label={language === 'zh-CN' ? '项目视图' : 'Project views'} className="pv-project-studio-tabs">
      {TABS.map(({ id, icon: Icon, label }) => <button aria-current={activeTab === id ? 'page' : undefined} className={activeTab === id ? 'active' : ''} data-project-tab={id} key={id} onClick={() => onSelectTab(id)} type="button"><Icon aria-hidden="true" size={16} /><span>{label[language]}</span></button>)}
    </nav>
    <div className="pv-project-studio-content">{children}</div>
  </section>
}
