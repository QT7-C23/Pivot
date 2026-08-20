import { BookOpen, FileCode2, FileText, FolderOpen, Search } from 'lucide-react'
import { useMemo, useState, type ReactElement } from 'react'
import type { FileTreeEntry } from '../../shared/types/domain'

export function DocsFilesWorkspace({ files, onChooseProject, onOpenFile, projectPath }: { files: readonly FileTreeEntry[]; onChooseProject: () => void; onOpenFile: (path: string) => void; projectPath: string }): ReactElement {
  const [query, setQuery] = useState('')
  const documents = useMemo(() => files.filter((entry) => entry.type === 'file' && isDocument(entry.name)).filter((entry) => !query.trim() || `${entry.name} ${entry.path}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 30), [files, query])
  return (
    <section className="pv-docs-workspace" data-figma-screen="549:3877">
      <aside className="pv-docs-sidebar">
        <header><BookOpen size={16} /><strong>Docs &amp; Files</strong></header>
        <label><Search size={14} /><input aria-label="Search project documents" onChange={(event) => setQuery(event.target.value)} placeholder="Search docs..." type="search" value={query} /></label>
        <h2>DOCUMENTATION</h2><button className="active" type="button">Getting Started</button><button type="button">API Reference</button><button type="button">Guides &amp; Tutorials</button>
        <h2>PROJECT FILES</h2><button type="button">Recent Files</button><button type="button">Repositories</button><button type="button">Snippets</button>
      </aside>
      <main className="pv-docs-main">
        <header><div><small>HOME › GETTING STARTED</small><h1>Docs &amp; Files</h1><p>Explore guides, API references, and documentation from your current Pivot workspace.</p></div><button onClick={onChooseProject} type="button"><FolderOpen size={14} />{projectPath ? 'Change Project' : 'Open Project'}</button></header>
        <section className="pv-docs-start"><h2>Get started with PIVOT</h2><p>Use the production workspace as the source of truth.</p><div><article><FileText size={18} /><strong>Project documents</strong><small>Markdown, text, and configuration files from the active project.</small></article><article><FileCode2 size={18} /><strong>Open in workspace</strong><small>Documents open through the existing project file capability.</small></article><article><BookOpen size={18} /><strong>Help center</strong><small>Product guidance links to real settings and routes.</small></article></div></section>
        <section className="pv-docs-recent"><header><h2>RECENT PROJECT DOCUMENTS</h2><span>{projectPath || 'No project open'}</span></header>{documents.map((entry) => <button key={entry.path} onClick={() => onOpenFile(entry.path)} type="button"><FileText size={16} /><span><strong>{entry.name}</strong><small>{entry.path}</small></span><em>Open document</em></button>)}{documents.length === 0 && <div className="pv-docs-empty"><BookOpen size={24} /><strong>{projectPath ? 'No matching documents' : 'Open a project to browse its documents'}</strong><p>{projectPath ? 'Try a different search or expand a project folder.' : 'Pivot will use its existing project-scoped file access.'}</p></div>}</section>
      </main>
    </section>
  )
}

function isDocument(name: string): boolean { return /(?:^|\.)(?:md|mdx|txt|json|ya?ml|toml|tsx?|jsx?|css|html)$/i.test(name) }
