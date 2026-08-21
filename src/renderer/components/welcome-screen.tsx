import {
  Bell,
  CircleX,
  FolderOpen,
  Lightbulb,
  Moon,
  Puzzle,
  Save,
  Settings,
  Store,
  Terminal,
} from 'lucide-react'
import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import {
  DEFAULT_APPLICATION_PREFERENCE_VALUES,
  type ApplicationPreferenceValues,
} from '../../shared/application-preferences'
import pivotLogoMark from '../assets/pivot-logo-mark.png'
import { useApplicationPreferencesStore } from '../stores/application-preferences.store'
import { useUIStore } from '../stores/ui.store'
import { Button } from './ui-button'

type OnboardingStep = 'welcome' | 'setup' | 'ready'

const FIGMA_SCREEN: Record<OnboardingStep, string> = {
  welcome: '1285:8199',
  setup: '1291:8035',
  ready: '1291:8129',
}

export function WelcomeScreen({
  onBrowseMarketplace,
  onChooseProject,
  onOpenSettings,
  onStart,
}: {
  onBrowseMarketplace: () => void
  onChooseProject: () => Promise<void>
  onOpenSettings: () => void
  onStart: () => void
}): ReactElement {
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const preferences = useApplicationPreferencesStore((state) => state.preferences)
  const error = useApplicationPreferencesStore((state) => state.error)
  const isLoading = useApplicationPreferencesStore((state) => state.isLoading)
  const loadPreferences = useApplicationPreferencesStore((state) => state.load)
  const updatePreferences = useApplicationPreferencesStore((state) => state.update)
  const setTheme = useUIStore((state) => state.setTheme)
  const values = preferences?.values ?? DEFAULT_APPLICATION_PREFERENCE_VALUES

  useEffect(() => {
    if (!preferences) void loadPreferences()
  }, [loadPreferences, preferences])

  function updatePreference<K extends keyof ApplicationPreferenceValues>(
    key: K,
    value: ApplicationPreferenceValues[K],
  ): void {
    if (!preferences) return
    if (key === 'theme') setTheme(value as ApplicationPreferenceValues['theme'])
    void updatePreferences({ [key]: value })
  }

  return (
    <main className="welcome-screen pv-onboarding" data-figma-screen={FIGMA_SCREEN[step]}>
      <header className="pv-onboarding-header">
        <img alt="" height="21" src={pivotLogoMark} width="28" />
        <strong>Pivot</strong>
      </header>

      {step === 'welcome' && (
        <section className="pv-onboarding-main welcome-entry-card">
          <OnboardingHero
            description="Your AI-powered development companion. Write, debug, and ship code faster with intelligent assistance."
            title="Welcome to Pivot"
          />
          <div className="pv-onboarding-feature-grid">
            <FeatureCard icon={<Terminal size={20} />} title="Intelligent Code Assistant">
              Context-aware AI that understands your codebase, models, and development workflow.
            </FeatureCard>
            <FeatureCard icon={<Puzzle size={20} />} title="Seamless Integrations">
              Connect your terminal, preferred runtimes, project files, and delivery tools.
            </FeatureCard>
            <FeatureCard icon={<CircleX size={20} />} title="Extensible Marketplace">
              Add verified plugins, community skills, prompts, models, and interface themes.
            </FeatureCard>
          </div>
          <OnboardingActions backLabel="Skip for now" onBack={onStart} onNext={() => setStep('setup')} primaryLabel="Set Up Your Workspace" />
          <Stepper active={0} />
        </section>
      )}

      {step === 'setup' && (
        <section className="pv-onboarding-main">
          <OnboardingHero description="Choose real application preferences. You can change them later in Settings." title="Set Up Your Workspace" />
          {error && <p className="pv-onboarding-error" role="alert">{error}</p>}
          <div className="pv-onboarding-preference-grid">
            <PreferenceCard checked={values.restoreSessions} description="Restore your open sessions the next time Pivot starts." disabled={isLoading || !preferences} icon={<Save size={18} />} label="Restore Sessions" onChange={(checked) => updatePreference('restoreSessions', checked)} />
            <PreferenceCard checked={values.notificationLevel !== 'none'} description="Receive desktop notifications for important agent results." disabled={isLoading || !preferences} icon={<Bell size={18} />} label="Notifications" onChange={(checked) => updatePreference('notificationLevel', checked ? 'failures' : 'none')} />
            <PreferenceCard checked={values.theme === 'dark'} description="Use Pivot's dark semantic color mode." disabled={isLoading || !preferences} icon={<Moon size={18} />} label="Dark Mode" onChange={(checked) => updatePreference('theme', checked ? 'dark' : 'light')} />
            <PreferenceCard checked={values.startMinimized} description="Start Pivot quietly in the system tray." disabled={isLoading || !preferences} icon={<Lightbulb size={18} />} label="Start Minimized" onChange={(checked) => updatePreference('startMinimized', checked)} />
          </div>
          <OnboardingActions backLabel="Go back" onBack={() => setStep('welcome')} onNext={() => setStep('ready')} primaryLabel="Finish Setup" />
          <Stepper active={1} />
        </section>
      )}

      {step === 'ready' && (
        <section className="pv-onboarding-main">
          <OnboardingHero description="Your preferences are saved. Choose a real destination to begin working in Pivot." title="You're All Set!" />
          <div className="pv-onboarding-feature-grid pv-onboarding-destinations">
            <button onClick={() => void onChooseProject()} type="button"><FolderOpen size={19} /><strong>Start a New Project</strong><span>Open an existing repository or choose a workspace folder.</span></button>
            <button onClick={onBrowseMarketplace} type="button"><Store size={19} /><strong>Browse the Marketplace</strong><span>Discover verified resources available to this Pivot installation.</span></button>
            <button onClick={onOpenSettings} type="button"><Settings size={19} /><strong>Review Settings</strong><span>Configure providers, runtimes, privacy, and application behavior.</span></button>
          </div>
          <OnboardingActions backLabel="Go back" onBack={() => setStep('setup')} onNext={onStart} primaryLabel="Get Started" />
          <Stepper active={2} />
        </section>
      )}
    </main>
  )
}

function OnboardingHero({ description, title }: { description: string; title: string }): ReactElement {
  return <div className="pv-onboarding-hero"><h1>{title}</h1><p>{description}</p></div>
}

function FeatureCard({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }): ReactElement {
  return <article className="pv-onboarding-card"><i aria-hidden="true">{icon}</i><strong>{title}</strong><p>{children}</p></article>
}

function PreferenceCard({ checked, description, disabled, icon, label, onChange }: { checked: boolean; description: string; disabled: boolean; icon: ReactNode; label: string; onChange: (checked: boolean) => void }): ReactElement {
  return <article className="pv-onboarding-preference"><i aria-hidden="true">{icon}</i><span><strong>{label}</strong><small>{description}</small></span><label className="pv-onboarding-toggle"><input aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span aria-hidden="true" /></label></article>
}

function OnboardingActions({ backLabel, onBack, onNext, primaryLabel }: { backLabel: string; onBack: () => void; onNext: () => void; primaryLabel: string }): ReactElement {
  return <div className="pv-onboarding-actions"><Button className="primary-button" onClick={onNext}>{primaryLabel}</Button><button className="pv-onboarding-link" onClick={onBack} type="button">{backLabel}</button></div>
}

function Stepper({ active }: { active: number }): ReactElement {
  return <div aria-label={`Onboarding step ${active + 1} of 3`} className="pv-onboarding-stepper">{[0, 1, 2].map((index) => <i className={index === active ? 'active' : ''} key={index} />)}</div>
}
