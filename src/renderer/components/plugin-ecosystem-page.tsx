import { Boxes, Download, FileText, PackageOpen, Palette, Search, ShieldCheck, Sparkles, Star } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { MarketplaceCatalogEntry, MarketplaceResourceKind } from '../../shared/marketplace-contracts'
import { useLocale } from '../i18n/locale-context'
import { useMarketplaceStore } from '../stores/marketplace.store'
import { useProviderStore } from '../stores/provider.store'

type MarketplaceCategory = 'all' | 'favorites' | 'installed' | MarketplaceResourceKind

const MARKETPLACE_CATEGORIES: Array<{ id: MarketplaceCategory; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'plugin', label: 'Plugins' },
  { id: 'skill', label: 'Skills' }, { id: 'prompt', label: 'Prompts' },
  { id: 'theme', label: 'Themes' },
]

const MARKETPLACE_LIBRARY: Array<{ id: MarketplaceCategory; label: string }> = [
  { id: 'installed', label: 'Installed' }, { id: 'favorites', label: 'Favorites' },
]

export function PluginEcosystemPage({ onConfigure, surface = 'extensions' }: { onConfigure?: () => void; surface?: 'extensions' | 'marketplace' } = {}): ReactElement {
  return surface === 'marketplace'
    ? <MarketplaceCatalogWorkspace />
    : <InstalledProviderInventory onConfigure={onConfigure} />
}

function MarketplaceCatalogWorkspace(): ReactElement {
  const { locale } = useLocale()
  const zh = locale === 'zh-CN'
  const catalog = useMarketplaceStore((state) => state.catalog)
  const activeResources = useMarketplaceStore((state) => state.activeResources)
  const error = useMarketplaceStore((state) => state.error)
  const favorites = useMarketplaceStore((state) => state.favorites)
  const isLoading = useMarketplaceStore((state) => state.isLoading)
  const installations = useMarketplaceStore((state) => state.installations)
  const pendingApprovals = useMarketplaceStore((state) => state.pendingApprovals)
  const installEntry = useMarketplaceStore((state) => state.installEntry)
  const load = useMarketplaceStore((state) => state.load)
  const toggleFavorite = useMarketplaceStore((state) => state.toggleFavorite)
  const uninstallEntry = useMarketplaceStore((state) => state.uninstallEntry)
  const activateEntry = useMarketplaceStore((state) => state.activateEntry)
  const deactivateEntry = useMarketplaceStore((state) => state.deactivateEntry)
  const invokePlugin = useMarketplaceStore((state) => state.invokePlugin)
  const updateEntry = useMarketplaceStore((state) => state.updateEntry)
  const updates = useMarketplaceStore((state) => state.updates)
  const resolveUpdate = useMarketplaceStore((state) => state.resolveUpdate)
  const qualification = useMarketplaceStore((state) => state.qualification)
  const [category, setCategory] = useState<MarketplaceCategory>('all')
  const [query, setQuery] = useState('')
  const [sourceId, setSourceId] = useState('all')
  useEffect(() => { void load() }, [load])

  const favoriteKeys = useMemo(() => new Set((favorites?.items ?? []).map((item) => resourceKey(item))), [favorites])
  const installedKeys = useMemo(() => new Set((installations?.items ?? []).map((item) => resourceKey(item.identity))), [installations])
  const entries = catalog?.status === 'available' ? catalog.snapshot.entries : []
  const sourceIds = useMemo(() => [...new Set(entries.map((entry) => entry.sourceId))].sort(), [entries])
  const filtered = entries.filter((entry) => {
    if (category === 'favorites' && !favoriteKeys.has(resourceKey(entry))) return false
    if (category === 'installed' && !installedKeys.has(resourceKey(entry))) return false
    if (category !== 'all' && category !== 'favorites' && category !== 'installed' && entry.kind !== category) return false
    if (sourceId !== 'all' && entry.sourceId !== sourceId) return false
    const normalized = query.trim().toLocaleLowerCase(locale)
    return normalized.length === 0 || `${entry.name} ${entry.description} ${entry.publisher.name} ${entry.tags.join(' ')}`.toLocaleLowerCase(locale).includes(normalized)
  })

  return <section className="plugin-ecosystem-page surface-marketplace" data-figma-screen="818:9249">
    <aside className="pv-marketplace-sidebar">
      <header><strong>{zh ? '市场' : 'Marketplace'}</strong><small>{zh ? '经过签名验证的免费资源' : 'Verified free resources'}</small></header>
      <section className="pv-marketplace-sidebar-section"><h2>{zh ? '分类' : 'Categories'}</h2><nav aria-label={zh ? '市场分类' : 'Marketplace categories'}>{MARKETPLACE_CATEGORIES.map((item) => <button aria-current={category === item.id ? 'page' : undefined} className={category === item.id ? 'active' : ''} key={item.id} onClick={() => setCategory(item.id)} type="button"><CategoryIcon kind={item.id} /><span>{item.label}</span><em>{categoryCount(item.id, entries, favoriteKeys, installedKeys)}</em></button>)}</nav></section>
      <section className="pv-marketplace-sidebar-section"><h2>{zh ? '我的扩展' : 'My extensions'}</h2><nav aria-label={zh ? '我的市场资源' : 'My Marketplace resources'}>{MARKETPLACE_LIBRARY.map((item) => <button aria-current={category === item.id ? 'page' : undefined} className={category === item.id ? 'active' : ''} key={item.id} onClick={() => setCategory(item.id)} type="button"><CategoryIcon kind={item.id} /><span>{zh ? (item.id === 'installed' ? '已安装' : '收藏') : item.label}</span><em>{categoryCount(item.id, entries, favoriteKeys, installedKeys)}</em></button>)}</nav></section>
      <section className="plugin-policy-card"><ShieldCheck size={15} /><span><strong>{qualification?.ready ? (zh ? '发布资格已通过' : 'Publication qualified') : (zh ? '仅限免费与签名资源' : 'Free and signed only')}</strong><small>{qualification && !qualification.ready ? (zh ? `${qualification.blockers.length} 项发布阻断；详情见错误状态。` : `${qualification.blockers.length} publication blocker(s); unsigned fallback is disabled.`) : (zh ? '目录和包在 Main 中验证，Renderer 不接触文件系统。' : 'Catalog evidence is verified in Main; Renderer receives no filesystem capability.')}</small></span></section>
    </aside>
    <main className="pv-marketplace-stage">
      <header><div><h1>{zh ? '社区市场' : 'Community Marketplace'}</h1><p>{zh ? '发现经过验证、可扩展 Pivot 工作流的资源。' : 'Discover verified resources that extend your Pivot workflow.'}</p></div><div className="pv-marketplace-tools"><label><Search aria-hidden="true" size={16} /><input aria-label={zh ? '搜索市场' : 'Search Marketplace'} onChange={(event) => setQuery(event.target.value)} placeholder={zh ? '搜索资源…' : 'Search resources…'} type="search" value={query} /></label><label><span className="sr-only">{zh ? '市场来源' : 'Marketplace sources'}</span><select aria-label={zh ? '市场来源' : 'Marketplace sources'} className="pv-marketplace-source" onChange={(event) => setSourceId(event.target.value)} value={sourceId}><option value="all">{zh ? '所有来源' : 'All sources'}</option>{sourceIds.map((id) => <option key={id} value={id}>{id}</option>)}</select></label></div></header>
      {error && <p className="pv-marketplace-error" role="alert">{error}</p>}
      {isLoading && !catalog && <MarketplaceState title={zh ? '正在加载市场…' : 'Loading Marketplace…'} />}
      {catalog?.status === 'unavailable' && <MarketplaceState description={catalog.reason === 'unconfigured' ? (zh ? '当前构建未包含受信任的目录源；不会显示未经验证的资源。' : 'This build has no trusted catalog source; unverified resources are never shown.') : (catalog.message ?? (zh ? '无法读取已验证目录。' : 'The verified catalog could not be read.'))} title={catalog.reason === 'unconfigured' ? (zh ? '目录尚未配置' : 'Catalog is not configured') : (zh ? '市场暂不可用' : 'Marketplace unavailable')} />}
      {catalog?.status === 'available' && filtered.length === 0 && <MarketplaceState description={zh ? '请更换搜索词或分类。' : 'Try another search term or category.'} title={zh ? '没有匹配资源' : 'No matching resources'} />}
      {catalog?.status === 'available' && filtered.length > 0 && <section className="pv-marketplace-grid" aria-label={zh ? '市场资源' : 'Marketplace resources'}>{filtered.map((entry) => {
        const installed = installations?.items.find((item) => sameResource(item.identity, entry)) ?? null
        const approvals = pendingApprovals[resourceKey(entry)] ?? null
        const active = activeResources?.items.find((item) => sameExactResource(item.identity, entry)) ?? null
        const update = updates?.items.find((item) => sameResource(item.current.identity, entry)) ?? null
        return <MarketplaceCard active={active} approvals={approvals} disabled={isLoading} entry={entry} favorite={favoriteKeys.has(resourceKey(entry))} installed={installed} key={resourceKey(entry)} onActivate={() => void activateEntry(entry)} onDeactivate={() => void deactivateEntry(entry)} onFavorite={() => void toggleFavorite(entry)} onFinalize={() => update && void resolveUpdate(update, 'finalize')} onInstall={(approve) => void installEntry(entry, approve)} onInvoke={() => void invokePlugin(entry)} onRollback={() => update && void resolveUpdate(update, 'rollback')} onUninstall={() => { if (window.confirm(zh ? `卸载 ${entry.name}？` : `Uninstall ${entry.name}?`)) void uninstallEntry(entry) }} onUpdate={(approve) => void updateEntry(entry, approve)} update={update} />
      })}</section>}
    </main>
  </section>
}

function MarketplaceCard({ active, approvals, disabled, entry, favorite, installed, onActivate, onDeactivate, onFavorite, onFinalize, onInstall, onInvoke, onRollback, onUninstall, onUpdate, update }: { active: { registrationId: string } | null; approvals: readonly string[] | null; disabled: boolean; entry: MarketplaceCatalogEntry; favorite: boolean; installed: { identity: { version: string }; revision: number } | null; onActivate: () => void; onDeactivate: () => void; onFavorite: () => void; onFinalize: () => void; onInstall: (approve: boolean) => void; onInvoke: () => void; onRollback: () => void; onUninstall: () => void; onUpdate: (approve: boolean) => void; update: { updateId: string } | null }): ReactElement {
  const exactVersion = installed?.identity.version === entry.version
  return <article className="pv-marketplace-card"><header><span><CategoryIcon kind={entry.kind} /></span><div><strong title={entry.name}>{entry.name}</strong><small>{entry.publisher.name}</small></div><button aria-label={`${favorite ? 'Remove' : 'Add'} ${entry.name} ${favorite ? 'from' : 'to'} favorites`} aria-pressed={favorite} disabled={disabled} onClick={onFavorite} type="button"><Star fill={favorite ? 'currentColor' : 'none'} size={16} /></button></header><p>{entry.description}</p><div className="pv-marketplace-tags"><span>{entry.kind}</span>{active && <span>active</span>}{update && <span>update pending</span>}{entry.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>{approvals && <p className="pv-marketplace-capabilities" role="status">requires-approval: {approvals.length > 0 ? approvals.join(', ') : 'none'}</p>}<footer><span>v{entry.version}</span><div><button onClick={() => void window.pivot.invoke('preview:open-external', { url: entry.manifestUrl })} type="button">Manifest</button>{update ? <><button disabled={disabled} onClick={onRollback} type="button">Rollback</button><button disabled={disabled} onClick={onFinalize} type="button">Keep update</button></> : exactVersion ? <>{active ? <button disabled={disabled} onClick={onDeactivate} type="button">Deactivate</button> : <button disabled={disabled} onClick={onActivate} type="button">Activate</button>}{active && entry.kind === 'plugin' && <button disabled={disabled} onClick={onInvoke} type="button">Run</button>}<button disabled={disabled} onClick={onUninstall} type="button">Uninstall</button></> : installed ? <button disabled={disabled} onClick={() => onUpdate(Boolean(approvals))} type="button">{approvals ? 'Approve & Update' : 'Update'}</button> : <button disabled={disabled} onClick={() => onInstall(Boolean(approvals))} type="button">{approvals ? 'Approve & Install' : 'Install'}</button>}</div></footer></article>
}

function MarketplaceState({ description, title }: { description?: string; title: string }): ReactElement {
  return <div className="pv-marketplace-state"><PackageOpen aria-hidden="true" size={28} /><strong>{title}</strong>{description && <p>{description}</p>}</div>
}

function CategoryIcon({ kind }: { kind: MarketplaceCategory }): ReactElement {
  if (kind === 'installed') return <Download size={15} />
  if (kind === 'skill') return <Sparkles size={15} />
  if (kind === 'prompt') return <FileText size={15} />
  if (kind === 'theme') return <Palette size={15} />
  if (kind === 'favorites') return <Star size={15} />
  return <Boxes size={15} />
}

function categoryCount(category: MarketplaceCategory, entries: readonly MarketplaceCatalogEntry[], favorites: ReadonlySet<string>, installed: ReadonlySet<string>): number {
  if (category === 'all') return entries.length
  if (category === 'favorites') return entries.filter((entry) => favorites.has(resourceKey(entry))).length
  if (category === 'installed') return entries.filter((entry) => installed.has(resourceKey(entry))).length
  return entries.filter((entry) => entry.kind === category).length
}

function resourceKey(entry: Pick<MarketplaceCatalogEntry, 'kind' | 'resourceId' | 'sourceId'>): string {
  return `${entry.sourceId}:${entry.kind}:${entry.resourceId}`
}

function sameResource(identity: Pick<MarketplaceCatalogEntry, 'kind' | 'resourceId' | 'sourceId'>, entry: Pick<MarketplaceCatalogEntry, 'kind' | 'resourceId' | 'sourceId'>): boolean {
  return identity.sourceId === entry.sourceId && identity.kind === entry.kind && identity.resourceId === entry.resourceId
}

function sameExactResource(identity: Pick<MarketplaceCatalogEntry, 'kind' | 'resourceId' | 'sourceId' | 'version'>, entry: Pick<MarketplaceCatalogEntry, 'kind' | 'resourceId' | 'sourceId' | 'version'>): boolean {
  return sameResource(identity, entry) && identity.version === entry.version
}

function InstalledProviderInventory({ onConfigure }: { onConfigure?: () => void }): ReactElement {
  const configs = useProviderStore((state) => state.configs)
  const load = useProviderStore((state) => state.load)
  useEffect(() => { void load() }, [load])
  return <section className="plugin-ecosystem-page surface-extensions" data-figma-screen="549:3543"><main className="pv-extension-main"><header><div><h2>Installed Extensions</h2><small>Resources currently configured in this Pivot installation.</small></div><button disabled={!onConfigure} onClick={onConfigure} type="button">Configure</button></header><div className="pv-extension-list">{configs.map((config) => <article className="pv-installed-provider" key={config.id}><i className={config.isActive ? 'ready' : ''} /><span><strong>{config.model}</strong><small>{`${config.label} · ${config.kind}`}</small></span><em>{config.isActive ? 'Active' : config.hasApiKey ? 'Ready' : 'Setup'}</em></article>)}{configs.length === 0 && <div className="pv-extension-empty"><PackageOpen size={22} /><strong>No extensions installed</strong><small>Installed resources will appear here.</small></div>}</div></main></section>
}
