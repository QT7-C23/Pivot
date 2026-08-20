import { Check, ChevronRight, PackageOpen, Search, X } from 'lucide-react'
import { useEffect, useState, type ReactElement, type ReactNode } from 'react'

export function SettingsPage({ actions, children, description, title }: { actions?: ReactNode; children: ReactNode; description: string; title: string }): ReactElement {
  return <div className="pv-settings-page"><header className="pv-settings-page-header"><h1>{title}</h1>{actions}</header>{description && <p className="pv-settings-page-description">{description}</p>}{children}</div>
}

export function SettingsSection({ children, title }: { children: ReactNode; title: string }): ReactElement {
  return <section className="pv-settings-section"><h2>{title}</h2><div className="pv-settings-section-body">{children}</div></section>
}

export function SettingsEmptyState({ description, title }: { description: string; title: string }): ReactElement {
  return <section className="pv-settings-empty" role="status">
    <span aria-hidden="true"><PackageOpen size={24} strokeWidth={1.5} /></span>
    <strong>{title}</strong>
    <p>{description}</p>
  </section>
}

export function SearchControl({
  ariaLabel,
  className = '',
  disabled = false,
  onChange,
  placeholder,
  value,
}: {
  ariaLabel: string
  className?: string
  disabled?: boolean
  onChange: (value: string) => void
  placeholder: string
  value: string
}): ReactElement {
  return <label className={`pv-search-control ${className}`} data-state={disabled ? 'disabled' : value ? 'filled' : 'default'} role="search">
    <Search aria-hidden="true" size={16} strokeWidth={1.8} />
    <input aria-label={ariaLabel} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} spellCheck={false} value={value} />
    {value && !disabled && <button aria-label={`Clear ${ariaLabel}`} onClick={() => onChange('')} type="button"><X size={13} /></button>}
  </label>
}

export function SettingRow({ action, children, description, icon, label }: { action?: ReactNode; children?: ReactNode; description?: string; icon?: ReactNode; label: string }): ReactElement {
  return <div className="pv-setting-row"><div className="pv-setting-copy">{icon}<span><strong>{label}</strong>{description && <small>{description}</small>}</span></div><div className="pv-setting-action">{children ?? action}</div></div>
}

export function Toggle({ checked, disabled = false, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }): ReactElement {
  return <button aria-checked={checked} aria-label={label} className={`pv-toggle ${checked ? 'active' : ''}`} disabled={disabled} onClick={() => onChange(!checked)} role="switch" type="button"><i /></button>
}

export function SelectControl({ ariaLabel, disabled = false, onChange, options, value }: { ariaLabel: string; disabled?: boolean; onChange: (value: string) => void; options: Array<[string, string]>; value: string }): ReactElement {
  return <select aria-label={ariaLabel} className="pv-settings-select" disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>{options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}</select>
}

export function SegmentedControl({ ariaLabel, onChange, options, value }: { ariaLabel: string; onChange: (value: string) => void; options: Array<[string, string]>; value: string }): ReactElement {
  return <div aria-label={ariaLabel} className="pv-segmented" role="radiogroup">{options.map(([optionValue, label]) => <button aria-checked={optionValue === value} className={optionValue === value ? 'active' : ''} key={optionValue} onClick={() => onChange(optionValue)} role="radio" type="button">{optionValue === value && <Check size={12} />}{label}</button>)}</div>
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warning' | 'danger' }): ReactElement { return <span className={`pv-settings-tag ${tone}`}>{children}</span> }

export function ActionButton({
  children,
  disabled,
  onClick,
  primary = false,
  variant,
}: {
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
  primary?: boolean
  variant?: 'danger' | 'ghost' | 'primary' | 'secondary'
}): ReactElement {
  const resolvedVariant = variant ?? (primary ? 'primary' : 'secondary')
  return <button className={`pv-settings-button ${resolvedVariant}`} disabled={disabled} onClick={onClick} type="button">{children}</button>
}

export function ListItem({ actions, description, icon, meta, title }: { actions?: ReactNode; description?: string; icon?: ReactNode; meta?: ReactNode; title: string }): ReactElement {
  return <article className="pv-settings-list-item"><div className="pv-settings-list-icon">{icon}</div><div className="pv-settings-list-copy"><strong>{title}</strong>{description && <small>{description}</small>}{meta && <div>{meta}</div>}</div>{actions && <div className="pv-settings-list-actions">{actions}</div>}</article>
}

export function LinkRow({ description, label, onClick }: { description?: string; label: string; onClick?: () => void }): ReactElement {
  return <button className="pv-settings-link-row" onClick={onClick} type="button"><span><strong>{label}</strong>{description && <small>{description}</small>}</span><ChevronRight size={14} /></button>
}

export function useStoredSetting<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(`pivot:settings:${key}`)
      return stored === null ? initialValue : JSON.parse(stored) as T
    } catch { return initialValue }
  })
  useEffect(() => { window.localStorage.setItem(`pivot:settings:${key}`, JSON.stringify(value)) }, [key, value])
  return [value, setValue]
}
