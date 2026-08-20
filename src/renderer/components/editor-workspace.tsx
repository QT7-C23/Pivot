import { Eye } from 'lucide-react'
import type { ReactElement } from 'react'
import { CodeEditor } from './CodeEditor'

interface EditorWorkspaceProps {
  activeFileContent: string
  activeFilePath: string | null
}

export function EditorWorkspace({
  activeFileContent,
  activeFilePath,
}: EditorWorkspaceProps): ReactElement {
  return (
    <section className="editor-workspace">
      <div className="panel editor-panel">
        <div className="editor-panel-header">
          <div>
            <span className="eyebrow">Editor</span>
            <h3>{activeFilePath ?? 'No file selected'}</h3>
          </div>
          <div className="editor-actions">
            <span className="preview-pill"><Eye size={13} />Read-only preview</span>
          </div>
        </div>
        <CodeEditor filePath={activeFilePath} readOnly value={activeFileContent} />
      </div>
    </section>
  )
}
