import type { ReactElement } from 'react'

export function EditorLoadingState(): ReactElement {
  return (
    <section aria-busy="true" className="editor-workspace editor-loading-state">
      <div className="panel editor-panel">
        <div className="editor-loading-header" />
        <div className="editor-loading-lines"><span /><span /><span /><span /></div>
      </div>
    </section>
  )
}

export function SettingsLoadingState(): ReactElement {
  return <section aria-busy="true" className="pv-settings-loading" />
}
