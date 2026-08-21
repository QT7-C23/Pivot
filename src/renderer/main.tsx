import React from 'react'
import { createRoot } from 'react-dom/client'
import 'xterm/css/xterm.css'
import { App } from './pivot-app'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LocaleProvider } from './i18n/locale-context'
import './tailwind.css'
import './styles.css'
import 'highlight.js/styles/github-dark.css'
import './workbench.css'
import './inspector.css'
import './pivot-012.css'
import './pivot-v2.css'
import './pivot-design-system.css'

const storedTheme = localStorage.getItem('pivot:theme')
const hasExplicitTheme = localStorage.getItem('pivot:theme-explicit') === '1'
document.documentElement.dataset.theme = hasExplicitTheme && (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system')
  ? storedTheme
  : 'light'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Pivot renderer root not found')
}

createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
