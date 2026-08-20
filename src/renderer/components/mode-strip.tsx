import { Eye } from 'lucide-react'
import type { ReactElement } from 'react'
import type { MessageKey } from '../i18n/locale'
import { useLocale } from '../i18n/locale-context'
import type { ChatSubmode, ReasoningEffort } from '../stores/ui.store'

const EFFORT_LABELS: Record<ReasoningEffort, MessageKey> = {
  1: 'mode.fast',
  2: 'mode.balancedFast',
  3: 'mode.moderate',
  4: 'mode.balancedDeep',
  5: 'mode.deep',
}

interface ModeStripProps {
  activeMode: ChatSubmode
  effortLevel: ReasoningEffort
  onSetEffort: (level: ReasoningEffort) => void
  onSetMode: (mode: ChatSubmode) => void
}

export function ModeStrip({ activeMode, effortLevel, onSetEffort, onSetMode }: ModeStripProps): ReactElement {
  const { t } = useLocale()
  return (
    <div className="mode-strip">
      <div aria-label={t('mode.group')} className="submode-tabs" role="group">
        <button className={activeMode === 'chat' ? 'active' : ''} onClick={() => onSetMode('chat')} type="button">
          {t('mode.chat')}
        </button>
        <button className={activeMode === 'agent' ? 'active' : ''} onClick={() => onSetMode('agent')} type="button">
          {t('mode.agent')}
        </button>
        <button className={activeMode === 'terminal' ? 'active' : ''} onClick={() => onSetMode('terminal')} type="button">
          {t('mode.terminal')}
        </button>
        <button className={activeMode === 'preview' ? 'active' : ''} onClick={() => onSetMode('preview')} type="button">
          <Eye size={13} />{t('mode.preview')}
        </button>
      </div>
      <label className="effort-strip">
        <span>{t('mode.fast')}</span>
        <input
          aria-label={t('mode.reasoning')}
          max={5}
          min={1}
          onChange={(event) => onSetEffort(Number(event.target.value) as ReasoningEffort)}
          step={1}
          type="range"
          value={effortLevel}
        />
        <output className="effort-value">{`${effortLevel} · ${t(EFFORT_LABELS[effortLevel])}`}</output>
        <span>{t('mode.deep')}</span>
      </label>
    </div>
  )
}
