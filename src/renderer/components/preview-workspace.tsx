import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  LoaderCircle,
  Monitor,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Tablet,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { normalizePreviewUrl } from '../../shared/preview-url'
import { useLocale } from '../i18n/locale-context'
import { useUIStore, type PreviewDevice } from '../stores/ui.store'

const DEVICE_OPTIONS: ReadonlyArray<{
  device: PreviewDevice
  icon: typeof Monitor
  labelKey: 'preview.device.desktop' | 'preview.device.tablet' | 'preview.device.mobile'
}> = [
  { device: 'desktop', icon: Monitor, labelKey: 'preview.device.desktop' },
  { device: 'tablet', icon: Tablet, labelKey: 'preview.device.tablet' },
  { device: 'mobile', icon: Smartphone, labelKey: 'preview.device.mobile' },
]

export function PreviewWorkspace(): ReactElement {
  const { t } = useLocale()
  const deviceLabels: Record<PreviewDevice, string> = {
    desktop: t('preview.device.desktop'),
    tablet: t('preview.device.tablet'),
    mobile: t('preview.device.mobile'),
  }
  const previewDevice = useUIStore((state) => state.previewDevice)
  const previewUrl = useUIStore((state) => state.previewUrl)
  const setPreviewDevice = useUIStore((state) => state.setPreviewDevice)
  const setPreviewUrl = useUIStore((state) => state.setPreviewUrl)
  const hostRef = useRef<HTMLDivElement>(null)
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [address, setAddress] = useState(previewUrl)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  function syncNavigationState(webview = webviewRef.current): void {
    if (!webview) return
    try {
      setCanGoBack(webview.canGoBack())
      setCanGoForward(webview.canGoForward())
    } catch {
      setCanGoBack(false)
      setCanGoForward(false)
    }
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    const webview = document.createElement('webview') as Electron.WebviewTag
    webview.className = 'preview-webview'
    webview.setAttribute('partition', 'pivot-preview')
    webview.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no, sandbox=yes')
    webview.setAttribute('src', previewUrl)

    const handleStart = (): void => {
      setError(null)
      setIsLoading(true)
    }
    const handleStop = (): void => {
      setIsLoading(false)
      syncNavigationState(webview)
    }
    const handleNavigate = (event: Electron.DidNavigateEvent): void => {
      const nextUrl = normalizePreviewUrl(event.url)
      if (nextUrl) {
        setAddress(nextUrl)
        setPreviewUrl(nextUrl)
      }
      syncNavigationState(webview)
    }
    const handleFail = (event: Electron.DidFailLoadEvent): void => {
      if (event.errorCode === -3) return
      setIsLoading(false)
      setError(t('preview.failed', { error: event.errorDescription }))
    }

    webview.addEventListener('did-start-loading', handleStart)
    webview.addEventListener('did-stop-loading', handleStop)
    webview.addEventListener('did-navigate', handleNavigate)
    webview.addEventListener('did-navigate-in-page', handleNavigate)
    webview.addEventListener('did-fail-load', handleFail)
    host.append(webview)
    webviewRef.current = webview

    return () => {
      webview.removeEventListener('did-start-loading', handleStart)
      webview.removeEventListener('did-stop-loading', handleStop)
      webview.removeEventListener('did-navigate', handleNavigate)
      webview.removeEventListener('did-navigate-in-page', handleNavigate)
      webview.removeEventListener('did-fail-load', handleFail)
      webview.remove()
      webviewRef.current = null
    }
  }, [])

  async function navigate(event?: FormEvent): Promise<void> {
    event?.preventDefault()
    const nextUrl = normalizePreviewUrl(address)
    if (!nextUrl) {
      setError(t('preview.invalidUrl'))
      return
    }
    setAddress(nextUrl)
    setPreviewUrl(nextUrl)
    setError(null)
    setIsLoading(true)
    try {
      await webviewRef.current?.loadURL(nextUrl)
    } catch (loadError) {
      setIsLoading(false)
      setError(t('preview.failed', { error: loadError instanceof Error ? loadError.message : String(loadError) }))
    }
  }

  function goBack(): void {
    if (webviewRef.current?.canGoBack()) webviewRef.current.goBack()
  }

  function goForward(): void {
    if (webviewRef.current?.canGoForward()) webviewRef.current.goForward()
  }

  function reload(): void {
    setError(null)
    webviewRef.current?.reload()
  }

  return (
    <section className="preview-workspace">
      <header className="preview-toolbar">
        <div className="preview-history-controls">
          <ToolbarButton disabled={!canGoBack} label={t('preview.back')} onClick={goBack}><ArrowLeft size={14} /></ToolbarButton>
          <ToolbarButton disabled={!canGoForward} label={t('preview.forward')} onClick={goForward}><ArrowRight size={14} /></ToolbarButton>
          <ToolbarButton label={t('preview.reload')} onClick={reload}>{isLoading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}</ToolbarButton>
        </div>
        <form className="preview-address" onSubmit={(event) => void navigate(event)}>
          <span aria-hidden="true" className="preview-protocol-dot" />
          <input aria-label={t('preview.address')} onChange={(event) => setAddress(event.target.value)} spellCheck={false} value={address} />
          <button type="submit">{t('preview.go')}</button>
        </form>
        <div aria-label={t('preview.device')} className="preview-device-switcher" role="group">
          {DEVICE_OPTIONS.map(({ device, icon: Icon }) => (
            <button aria-label={deviceLabels[device]} aria-pressed={previewDevice === device} className={previewDevice === device ? 'active' : ''} key={device} onClick={() => setPreviewDevice(device)} title={deviceLabels[device]} type="button"><Icon size={14} /></button>
          ))}
        </div>
        <ToolbarButton label={t('preview.openExternal')} onClick={() => void window.pivot.invoke('preview:open-external', { url: previewUrl })}><ExternalLink size={14} /></ToolbarButton>
      </header>
      <div className={`preview-canvas device-${previewDevice}`}>
        <div className="preview-frame-shell">
          <div className="preview-frame-meta"><span>{deviceLabels[previewDevice]}</span><small>{previewDevice === 'desktop' ? '100%' : previewDevice === 'tablet' ? '768 px' : '390 px'}</small></div>
          <div className="preview-webview-host" ref={hostRef} />
          {error && <div className="preview-state error"><RotateCcw size={22} /><strong>{t('preview.unavailable')}</strong><p>{error}</p><button onClick={() => void navigate()} type="button">{t('preview.tryAgain')}</button></div>}
        </div>
      </div>
    </section>
  )
}

function ToolbarButton({
  children,
  disabled = false,
  label,
  onClick,
}: {
  children: ReactElement
  disabled?: boolean
  label: string
  onClick: () => void
}): ReactElement {
  return <button aria-label={label} className="preview-toolbar-button" disabled={disabled} onClick={onClick} title={label} type="button">{children}</button>
}
