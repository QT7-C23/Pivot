import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import type { ReactElement } from 'react'
import { useEffect, useRef } from 'react'

export { monaco }

interface MonacoWorkerEnvironment {
  getWorker: (_workerId: string, label: string) => Worker
}

const globalMonaco = globalThis as typeof globalThis & {
  MonacoEnvironment?: MonacoWorkerEnvironment
}

globalMonaco.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') {
      return new JsonWorker()
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new CssWorker()
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new HtmlWorker()
    }
    if (label === 'typescript' || label === 'javascript') {
      return new TsWorker()
    }

    return new EditorWorker()
  },
}

interface CodeEditorProps {
  filePath: string | null
  onChange?: (value: string) => void
  readOnly?: boolean
  value: string
}

export function CodeEditor({ filePath, onChange, readOnly = false, value }: CodeEditorProps): ReactElement {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const modelRef = useRef<monaco.editor.ITextModel | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!hostRef.current) {
      return undefined
    }

    const model = monaco.editor.createModel(value, languageFromPath(filePath))
    const editor = monaco.editor.create(hostRef.current, {
      automaticLayout: true,
      fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
      fontSize: 13,
      lineHeight: 20,
      minimap: { enabled: false },
      model,
      padding: { top: 12 },
      readOnly,
      scrollBeyondLastLine: false,
      theme: monacoThemeFromDocument(),
      wordWrap: 'on',
    })
    const subscription = model.onDidChangeContent(() => {
      onChangeRef.current?.(model.getValue())
    })

    editorRef.current = editor
    modelRef.current = model

    return () => {
      subscription.dispose()
      editor.dispose()
      model.dispose()
      editorRef.current = null
      modelRef.current = null
    }
  }, [])

  useEffect(() => {
    const model = modelRef.current
    if (!model) {
      return
    }

    monaco.editor.setModelLanguage(model, languageFromPath(filePath))
    if (model.getValue() !== value) {
      model.setValue(value)
    }
  }, [filePath, value])

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly })
  }, [readOnly])

  useEffect(() => observeMonacoTheme((theme) => monaco.editor.setTheme(theme)), [])

  return <div className="code-editor-host" ref={hostRef} />
}

export function monacoThemeFromDocument(): 'vs' | 'vs-dark' {
  const theme = document.documentElement.dataset.theme
  if (theme === 'light') return 'vs'
  if (theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches) return 'vs'
  return 'vs-dark'
}

export function observeMonacoTheme(apply: (theme: 'vs' | 'vs-dark') => void): () => void {
  const observer = new MutationObserver(() => apply(monacoThemeFromDocument()))
  observer.observe(document.documentElement, { attributeFilter: ['data-theme'], attributes: true })
  return () => observer.disconnect()
}

export function languageFromPath(filePath: string | null): string {
  const extension = filePath?.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'css':
      return 'css'
    case 'html':
      return 'html'
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'json':
      return 'json'
    case 'md':
    case 'markdown':
      return 'markdown'
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return 'typescript'
    case 'xml':
      return 'xml'
    case 'yaml':
    case 'yml':
      return 'yaml'
    default:
      return 'plaintext'
  }
}
