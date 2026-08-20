import { ArrowRight, Bot, FolderOpen, KeyRound, Sparkles } from 'lucide-react'
import type { ReactElement } from 'react'
import { useLocale } from '../i18n/locale-context'
import { SpotlightSurface } from './spotlight-surface'

export function WelcomeScreen({
  onChooseProject,
  onOpenSettings,
  onStart,
}: {
  onChooseProject: () => Promise<void>
  onOpenSettings: () => void
  onStart: () => void
}): ReactElement {
  const { t } = useLocale()
  return (
    <main className="welcome-screen">
      <div className="welcome-brand"><div className="welcome-logo"><Bot size={25} /></div><h1>Pivot</h1><p>{t('welcome.subtitle')}</p><span>{t('welcome.tagline')}</span></div>
      <section className="welcome-entry-panel">
        <SpotlightSurface className="welcome-entry-card">
          <Sparkles size={22} />
          <h2>{t('welcome.conversation')}</h2>
          <p>{t('welcome.conversationDescription')}</p>
          <button className="primary-button" onClick={onStart} type="button">{t('welcome.startConversation')}<ArrowRight size={14} /></button>
        </SpotlightSurface>
      </section>
      <section className="welcome-shortcuts">
        <div><Sparkles size={15} /><strong>{t('welcome.tryAsking')}</strong><span>{t('welcome.examples')}</span></div>
        <button onClick={onOpenSettings} type="button"><KeyRound size={14} />{t('welcome.configureKey')}</button>
        <button onClick={() => void onChooseProject()} type="button"><FolderOpen size={14} />{t('welcome.openProject')}</button>
      </section>
    </main>
  )
}
