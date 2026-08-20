import {
  Code2,
  FolderOpen,
  History,
  MessageSquareText,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import type { ReactElement } from 'react'
import type { MessageKey } from '../i18n/locale'
import { useLocale } from '../i18n/locale-context'
import type { WorkspaceActivity } from '../stores/ui.store'

const ACTIVITY_ITEMS: ReadonlyArray<{ activity: WorkspaceActivity; icon: LucideIcon; labelKey: MessageKey }> = [
  { activity: 'sessions', icon: MessageSquareText, labelKey: 'activity.sessions' },
  { activity: 'files', icon: FolderOpen, labelKey: 'activity.files' },
  { activity: 'plan', icon: Code2, labelKey: 'activity.currentPlan' },
  { activity: 'timeline', icon: History, labelKey: 'activity.timeline' },
]

interface ActivityRailProps {
  activeActivity: WorkspaceActivity
  onOpenSettings: () => void
  onSelectActivity: (activity: WorkspaceActivity) => void
}

export function ActivityRail({
  activeActivity,
  onOpenSettings,
  onSelectActivity,
}: ActivityRailProps): ReactElement {
  const { t } = useLocale()
  return (
    <nav aria-label={t('activity.ide')} className="activity-rail">
      <div aria-hidden="true" className="activity-spacer" />
      {ACTIVITY_ITEMS.map(({ activity, icon, labelKey }) => (
        <ActivityButton
          icon={icon}
          isActive={activeActivity === activity}
          key={activity}
          label={t(labelKey)}
          onClick={() => onSelectActivity(activity)}
        />
      ))}
      <div aria-hidden="true" className="activity-fill" />
      <ActivityButton icon={Settings} label={t('settings.title')} onClick={onOpenSettings} />
    </nav>
  )
}

function ActivityButton({
  icon: Icon,
  isActive = false,
  label,
  onClick,
}: {
  icon: LucideIcon
  isActive?: boolean
  label: string
  onClick?: () => void
}): ReactElement {
  return (
    <button
      aria-label={label}
      aria-pressed={isActive}
      className={isActive ? 'activity-button active' : 'activity-button'}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon size={19} />
    </button>
  )
}
