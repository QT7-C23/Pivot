import { CircleDot, Orbit, Settings } from 'lucide-react'
import type { ReactElement } from 'react'
import type { SessionRecord } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'

interface TitleBarProps {
  activeSession: SessionRecord | null
  onOpenSettings: () => void
}

export function TitleBar({ activeSession, onOpenSettings }: TitleBarProps): ReactElement {
  const { t } = useLocale()
  return (
    <header className="pivot-titlebar">
      <div className="title-identity">
        <div aria-hidden="true" className="brand-mark compact">
          <Orbit size={16} strokeWidth={2.1} />
        </div>
        <div className="title-copy">
          <strong>Pivot</strong>
          <span aria-hidden="true">/</span>
          <span>{activeSession?.projectPath ?? t('title.noWorkspace')}</span>
        </div>
      </div>
      <div className="title-actions">
        <span className="runtime-ready"><CircleDot size={11} /> {t('title.ready')}</span>
        <button aria-label={t('settings.shortcuts.openSettings')} className="icon-button title-icon" onClick={onOpenSettings} type="button">
          <Settings size={15} />
        </button>
      </div>
    </header>
  )
}
