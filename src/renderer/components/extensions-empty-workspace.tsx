import { PackageOpen, Puzzle, Search, Store } from 'lucide-react'
import type { ReactElement } from 'react'
import { useLocale } from '../i18n/locale-context'

const COPY = {
  en: { browse: 'Browse Marketplace', empty: 'No extensions yet', hint: 'Extensions add integrations and new capabilities to Pivot.', installed: 'Installed', search: 'Search installed extensions…', title: 'Extensions' },
  'zh-CN': { browse: '浏览市场', empty: '尚无扩展', hint: '扩展可以为 Pivot 添加集成与新能力。', installed: '已安装', search: '搜索已安装扩展…', title: '扩展' },
  ja: { browse: 'マーケットを見る', empty: '拡張機能はまだありません', hint: '拡張機能は Pivot に連携と新しい機能を追加します。', installed: 'インストール済み', search: 'インストール済みの拡張機能を検索…', title: '拡張機能' },
  de: { browse: 'Marktplatz öffnen', empty: 'Noch keine Erweiterungen', hint: 'Erweiterungen fügen Pivot Integrationen und neue Funktionen hinzu.', installed: 'Installiert', search: 'Installierte Erweiterungen suchen…', title: 'Erweiterungen' },
} as const

export function ExtensionsEmptyWorkspace({ onBrowseMarketplace }: { onBrowseMarketplace: () => void }): ReactElement {
  const { locale } = useLocale()
  const copy = COPY[locale === 'zh-CN' || locale === 'ja' || locale === 'de' ? locale : 'en']
  return (
    <section className="pv-extensions-empty-layout" data-figma-screen="597:6403">
      <aside className="pv-extensions-empty-context">
        <header><strong>{copy.title}</strong><small>0 {copy.installed.toLocaleLowerCase(locale)}</small></header>
        <label><Search aria-hidden="true" size={13} /><input aria-label={copy.search} placeholder={copy.search} type="search" /></label>
        <h2>{copy.installed}</h2>
        <div><PackageOpen aria-hidden="true" size={16} /><span>{copy.empty}</span></div>
      </aside>
      <main className="pv-extensions-empty-state">
        <span className="pv-extensions-empty-icon"><Puzzle aria-hidden="true" size={34} strokeWidth={1.35} /></span>
        <h1>{copy.empty}</h1><p>{copy.hint}</p>
        <button onClick={onBrowseMarketplace} type="button"><Store aria-hidden="true" size={15} />{copy.browse}</button>
      </main>
    </section>
  )
}
