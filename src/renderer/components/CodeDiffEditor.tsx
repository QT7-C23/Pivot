import type { ReactElement } from 'react'
import { useEffect, useRef } from 'react'
import { languageFromPath, monaco, monacoThemeFromDocument, observeMonacoTheme } from './CodeEditor'

export function CodeDiffEditor({
  filePath,
  modified,
  original,
}: {
  filePath: string
  modified: string
  original: string
}): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const originalModelRef = useRef<monaco.editor.ITextModel | null>(null)
  const modifiedModelRef = useRef<monaco.editor.ITextModel | null>(null)

  useEffect(() => {
    if (!hostRef.current) return undefined
    const language = languageFromPath(filePath)
    const originalModel = monaco.editor.createModel(original, language)
    const modifiedModel = monaco.editor.createModel(modified, language)
    const editor = monaco.editor.createDiffEditor(hostRef.current, {
      automaticLayout: true,
      fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
      fontSize: 13,
      lineHeight: 20,
      minimap: { enabled: false },
      originalEditable: false,
      readOnly: true,
      renderSideBySide: true,
      scrollBeyondLastLine: false,
      theme: monacoThemeFromDocument(),
    })
    editor.setModel({ modified: modifiedModel, original: originalModel })
    editorRef.current = editor
    originalModelRef.current = originalModel
    modifiedModelRef.current = modifiedModel

    return () => {
      editor.dispose()
      originalModel.dispose()
      modifiedModel.dispose()
      editorRef.current = null
      originalModelRef.current = null
      modifiedModelRef.current = null
    }
  }, [])

  useEffect(() => {
    const language = languageFromPath(filePath)
    if (originalModelRef.current) {
      monaco.editor.setModelLanguage(originalModelRef.current, language)
      if (originalModelRef.current.getValue() !== original) originalModelRef.current.setValue(original)
    }
    if (modifiedModelRef.current) {
      monaco.editor.setModelLanguage(modifiedModelRef.current, language)
      if (modifiedModelRef.current.getValue() !== modified) modifiedModelRef.current.setValue(modified)
    }
  }, [filePath, modified, original])

  useEffect(() => observeMonacoTheme((theme) => monaco.editor.setTheme(theme)), [])

  return <div className="code-editor-host diff-editor-host" ref={hostRef} />
}
