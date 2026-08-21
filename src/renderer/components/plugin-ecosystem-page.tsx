import { Boxes, Download, FileText, PackageOpen, Palette, Search, Settings2, ShieldCheck, Sparkles, Star } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { MarketplaceCatalogEntry, MarketplaceResourceKind } from '../../shared/marketplace-contracts'
import { useLocale } from '../i18n/locale-context'
import { useMarketplaceStore } from '../stores/marketplace.store'

type MarketplaceCategory = 'all' | 'favorites' | 'installed' | 'model-hub' | MarketplaceResourceKind

const MARKETPLACE_CATEGORIES: Array<{ id: MarketplaceCategory; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'plugin', label: 'Plugins' },
  { id: 'skill', label: 'Skills' }, { id: 'prompt', label: 'Prompts' },
  { id: 'theme', label: 'Themes' },
  { id: 'model-hub', label: 'Model Hub' },
]

const MARKETPLACE_LIBRARY: Array<{ id: MarketplaceCategory; label: string }> = [
  { id: 'installed', label: 'Installed' }, { id: 'favorites', label: 'Favorites' },
]

export function PluginEcosystemPage({ onBrowseMarketplace, onConfigure, surface = 'extensions' }: { onBrowseMarketplace?: () => void; onConfigure?: () => void; surface?: 'extensions' | 'marketplace' } = {}): ReactElement {
  return surface === 'marketplace'
    ? <MarketplaceCatalogWorkspace />
    : <InstalledProviderInventory onBrowseMarketplace={onBrowseMarketplace} onConfigure={onConfigure} />
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
  const [selectedEntry, setSelectedEntry] = useState<MarketplaceCatalogEntry | null>(null)
  const [detailTab, setDetailTab] = useState<'overview' | 'changelog' | 'reviews' | 'support'>('overview')
  useEffect(() => { void load() }, [load])

  const favoriteKeys = useMemo(() => new Set((favorites?.items ?? []).map((item) => resourceKey(item))), [favorites])
  const installedKeys = useMemo(() => new Set((installations?.items ?? []).map((item) => resourceKey(item.identity))), [installations])
  const entries = catalog?.status === 'available' ? catalog.snapshot.entries : []
  const sourceIds = useMemo(() => [...new Set(entries.map((entry) => entry.sourceId))].sort(), [entries])
  const filtered = entries.filter((entry) => {
    if (category === 'model-hub') return false
    if (category === 'favorites' && !favoriteKeys.has(resourceKey(entry))) return false
    if (category === 'installed' && !installedKeys.has(resourceKey(entry))) return false
    if (category !== 'all' && category !== 'favorites' && category !== 'installed' && entry.kind !== category) return false
    if (sourceId !== 'all' && entry.sourceId !== sourceId) return false
    const normalized = query.trim().toLocaleLowerCase(locale)
    return normalized.length === 0 || `${entry.name} ${entry.description} ${entry.publisher.name} ${entry.tags.join(' ')}`.toLocaleLowerCase(locale).includes(normalized)
  })

  const figmaScreen = selectedEntry
    ? detailTab === 'overview' ? '818:21049' : detailTab === 'changelog' ? '818:22354' : detailTab === 'reviews' ? '818:22642' : '818:23054'
    : category === 'plugin' ? '818:22103'
      : category === 'model-hub' ? '818:10388'
        : category === 'skill' ? '818:20102'
          : category === 'prompt' ? '818:20379'
            : category === 'theme' ? '818:20645'
              : '818:9249'

  return <section className="plugin-ecosystem-page surface-marketplace" data-figma-screen={figmaScreen}>
    <aside className="pv-marketplace-sidebar">
      <header><strong>{zh ? '市场' : 'Marketplace'}</strong><small>{zh ? '经过签名验证的免费资源' : 'Verified free resources'}</small></header>
      <section className="pv-marketplace-sidebar-section"><h2>{zh ? '分类' : 'Categories'}</h2><nav aria-label={zh ? '市场分类' : 'Marketplace categories'}>{MARKETPLACE_CATEGORIES.map((item) => <button aria-current={!selectedEntry && category === item.id ? 'page' : undefined} className={!selectedEntry && category === item.id ? 'active' : ''} key={item.id} onClick={() => { setCategory(item.id); setSelectedEntry(null) }} type="button"><CategoryIcon kind={item.id} /><span>{item.label}</span><em>{categoryCount(item.id, entries, favoriteKeys, installedKeys)}</em></button>)}</nav></section>
      <section className="pv-marketplace-sidebar-section"><h2>{zh ? '我的扩展' : 'My extensions'}</h2><nav aria-label={zh ? '我的市场资源' : 'My Marketplace resources'}>{MARKETPLACE_LIBRARY.map((item) => <button aria-current={category === item.id ? 'page' : undefined} className={category === item.id ? 'active' : ''} key={item.id} onClick={() => setCategory(item.id)} type="button"><CategoryIcon kind={item.id} /><span>{zh ? (item.id === 'installed' ? '已安装' : '收藏') : item.label}</span><em>{categoryCount(item.id, entries, favoriteKeys, installedKeys)}</em></button>)}</nav></section>
      <section className="plugin-policy-card"><ShieldCheck size={15} /><span><strong>{qualification?.ready ? (zh ? '发布资格已通过' : 'Publication qualified') : (zh ? '仅限免费与签名资源' : 'Free and signed only')}</strong><small>{qualification && !qualification.ready ? (zh ? `${qualification.blockers.length} 项发布阻断；详情见错误状态。` : `${qualification.blockers.length} publication blocker(s); unsigned fallback is disabled.`) : (zh ? '目录和包在 Main 中验证，Renderer 不接触文件系统。' : 'Catalog evidence is verified in Main; Renderer receives no filesystem capability.')}</small></span></section>
    </aside>
    <main className={`pv-marketplace-stage ${selectedEntry ? 'detail' : ''}`}>
      {selectedEntry ? <MarketplaceDetail entry={selectedEntry} onBack={() => setSelectedEntry(null)} onInstall={() => void installEntry(selectedEntry, Boolean(pendingApprovals[resourceKey(selectedEntry)]))} onTabChange={setDetailTab} tab={detailTab} /> : <>
      <header><div><h1>{zh ? '社区市场' : 'Community Marketplace'}</h1><p>{zh ? '发现经过验证、可扩展 Pivot 工作流的资源。' : 'Discover verified resources that extend your Pivot workflow.'}</p></div><div className="pv-marketplace-tools"><label><Search aria-hidden="true" size={16} /><input aria-label={zh ? '搜索市场' : 'Search Marketplace'} onChange={(event) => setQuery(event.target.value)} placeholder={zh ? '搜索资源…' : 'Search resources…'} type="search" value={query} /></label><label><span className="sr-only">{zh ? '市场来源' : 'Marketplace sources'}</span><select aria-label={zh ? '市场来源' : 'Marketplace sources'} className="pv-marketplace-source" onChange={(event) => setSourceId(event.target.value)} value={sourceId}><option value="all">{zh ? '所有来源' : 'All sources'}</option>{sourceIds.map((id) => <option key={id} value={id}>{id}</option>)}</select></label></div></header>
      {error && <p className="pv-marketplace-error" role="alert">{error}</p>}
      {isLoading && !catalog && <MarketplaceState title={zh ? '正在加载市场…' : 'Loading Marketplace…'} />}
      {catalog?.status === 'unavailable' && <MarketplaceState description={catalog.reason === 'unconfigured' ? (zh ? '当前构建未包含受信任的目录源；不会显示未经验证的资源。' : 'This build has no trusted catalog source; unverified resources are never shown.') : (catalog.message ?? (zh ? '无法读取已验证目录。' : 'The verified catalog could not be read.'))} title={catalog.reason === 'unconfigured' ? (zh ? '目录尚未配置' : 'Catalog is not configured') : (zh ? '市场暂不可用' : 'Marketplace unavailable')} />}
      {category === 'model-hub' && <MarketplaceState description={zh ? '当前受信任市场合同不包含模型二进制、硬件探测或本地模型安装权限。模型连接请前往“模型与提供商”。' : 'The trusted Marketplace contract does not expose model binaries, hardware probes, or local model installation authority. Configure models under Models & Providers.'} title={zh ? 'Model Hub 尚未接入' : 'Model Hub is not connected'} />}
      {category !== 'model-hub' && catalog?.status === 'available' && filtered.length === 0 && <MarketplaceState description={zh ? '请更换搜索词或分类。' : 'Try another search term or category.'} title={zh ? '没有匹配资源' : 'No matching resources'} />}
      {catalog?.status === 'available' && filtered.length > 0 && <section className="pv-marketplace-grid" aria-label={zh ? '市场资源' : 'Marketplace resources'}>{filtered.map((entry) => {
        const installed = installations?.items.find((item) => sameResource(item.identity, entry)) ?? null
        const approvals = pendingApprovals[resourceKey(entry)] ?? null
        const active = activeResources?.items.find((item) => sameExactResource(item.identity, entry)) ?? null
        const update = updates?.items.find((item) => sameResource(item.current.identity, entry)) ?? null
        return <MarketplaceCard active={active} approvals={approvals} disabled={isLoading} entry={entry} favorite={favoriteKeys.has(resourceKey(entry))} installed={installed} key={resourceKey(entry)} onActivate={() => void activateEntry(entry)} onDeactivate={() => void deactivateEntry(entry)} onFavorite={() => void toggleFavorite(entry)} onFinalize={() => update && void resolveUpdate(update, 'finalize')} onInstall={(approve) => void installEntry(entry, approve)} onInvoke={() => void invokePlugin(entry)} onOpen={() => { setSelectedEntry(entry); setDetailTab('overview') }} onRollback={() => update && void resolveUpdate(update, 'rollback')} onUninstall={() => { if (window.confirm(zh ? `卸载 ${entry.name}？` : `Uninstall ${entry.name}?`)) void uninstallEntry(entry) }} onUpdate={(approve) => void updateEntry(entry, approve)} update={update} />
      })}</section>}
      </>}
    </main>
  </section>
}

function MarketplaceCard({ active, approvals, disabled, entry, favorite, installed, onActivate, onDeactivate, onFavorite, onFinalize, onInstall, onInvoke, onOpen, onRollback, onUninstall, onUpdate, update }: { active: { registrationId: string } | null; approvals: readonly string[] | null; disabled: boolean; entry: MarketplaceCatalogEntry; favorite: boolean; installed: { identity: { version: string }; revision: number } | null; onActivate: () => void; onDeactivate: () => void; onFavorite: () => void; onFinalize: () => void; onInstall: (approve: boolean) => void; onInvoke: () => void; onOpen: () => void; onRollback: () => void; onUninstall: () => void; onUpdate: (approve: boolean) => void; update: { updateId: string } | null }): ReactElement {
  const exactVersion = installed?.identity.version === entry.version
  return <article className="pv-marketplace-card"><header><span><CategoryIcon kind={entry.kind} /></span><div><button className="pv-marketplace-card-title" onClick={onOpen} title={entry.name} type="button">{entry.name}</button><small>{entry.publisher.name}</small></div><button aria-label={`${favorite ? 'Remove' : 'Add'} ${entry.name} ${favorite ? 'from' : 'to'} favorites`} aria-pressed={favorite} disabled={disabled} onClick={onFavorite} type="button"><Star fill={favorite ? 'currentColor' : 'none'} size={16} /></button></header><p>{entry.description}</p><div className="pv-marketplace-tags"><span>{entry.kind}</span>{active && <span>active</span>}{update && <span>update pending</span>}{entry.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>{approvals && <p className="pv-marketplace-capabilities" role="status">requires-approval: {approvals.length > 0 ? approvals.join(', ') : 'none'}</p>}<footer><span>v{entry.version}</span><div><button onClick={onOpen} type="button">Details</button><button onClick={() => void window.pivot.invoke('preview:open-external', { url: entry.manifestUrl })} type="button">Manifest</button>{update ? <><button disabled={disabled} onClick={onRollback} type="button">Rollback</button><button disabled={disabled} onClick={onFinalize} type="button">Keep update</button></> : exactVersion ? <>{active ? <button disabled={disabled} onClick={onDeactivate} type="button">Deactivate</button> : <button disabled={disabled} onClick={onActivate} type="button">Activate</button>}{active && entry.kind === 'plugin' && <button disabled={disabled} onClick={onInvoke} type="button">Run</button>}<button disabled={disabled} onClick={onUninstall} type="button">Uninstall</button></> : installed ? <button disabled={disabled} onClick={() => onUpdate(Boolean(approvals))} type="button">{approvals ? 'Approve & Update' : 'Update'}</button> : <button disabled={disabled} onClick={() => onInstall(Boolean(approvals))} type="button">{approvals ? 'Approve & Install' : 'Install'}</button>}</div></footer></article>
}

function MarketplaceDetail({ entry, onBack, onInstall, onTabChange, tab }: { entry: MarketplaceCatalogEntry; onBack: () => void; onInstall: () => void; onTabChange: (tab: 'overview' | 'changelog' | 'reviews' | 'support') => void; tab: 'overview' | 'changelog' | 'reviews' | 'support' }): ReactElement {
  const { locale } = useLocale(); const zh = locale === 'zh-CN'
  const missing = zh ? '签名目录元数据不包含此信息。Pivot 不会生成虚构内容。' : 'Signed catalog metadata does not include this information. Pivot does not generate substitute content.'
  return <section className="pv-marketplace-detail">
    <header><button className="back" onClick={onBack} type="button">← {zh ? '返回' : 'Back'}</button><span className="mark"><CategoryIcon kind={entry.kind} /></span><div><h1>{entry.name}<small>v{entry.version}</small></h1><p>{entry.publisher.name} · {entry.sourceId}</p></div><button className="install" onClick={onInstall} type="button">{zh ? '安装' : 'Install'}</button></header>
    <nav>{(['overview', 'changelog', 'reviews', 'support'] as const).map((id) => <button className={tab === id ? 'active' : ''} key={id} onClick={() => onTabChange(id)} type="button">{id[0].toUpperCase() + id.slice(1)}</button>)}</nav>
    {tab === 'overview' ? <div className="pv-marketplace-detail-overview"><main><h2>{zh ? '描述' : 'Description'}</h2><p>{entry.description}</p><h2>{zh ? '标签' : 'Tags'}</h2><div className="pv-marketplace-tags">{entry.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><h2>{zh ? '兼容性' : 'Compatibility'}</h2><p>Pivot {entry.compatibility.minPivotVersion}+{entry.compatibility.maxPivotVersion ? ` – ${entry.compatibility.maxPivotVersion}` : ''}</p></main><aside><h2>{zh ? '详情' : 'Details'}</h2><KvRow label={zh ? '版本' : 'Version'} value={entry.version} /><KvRow label={zh ? '更新' : 'Updated'} value={new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(entry.updatedAt))} /><KvRow label={zh ? '大小' : 'Size'} value={formatBytes(entry.package.byteLength)} /><KvRow label={zh ? '类型' : 'Kind'} value={entry.kind} /><KvRow label={zh ? '来源' : 'Source'} value={entry.sourceId} /><button onClick={() => void window.pivot.invoke('preview:open-external', { url: entry.manifestUrl })} type="button">{zh ? '打开已验证清单' : 'Open verified manifest'}</button></aside></div>
      : tab === 'changelog' ? <div className="pv-marketplace-detail-empty"><h2>v{entry.version}</h2><p>{missing}</p><small>{zh ? '目录仅提供当前版本与更新时间。' : 'The catalog exposes only the current version and update timestamp.'}</small></div>
        : tab === 'reviews' ? <div className="pv-marketplace-detail-empty"><h2>{zh ? '暂无已验证评价源' : 'No verified review source'}</h2><p>{missing}</p></div>
          : <div className="pv-marketplace-detail-empty"><h2>{zh ? '支持' : 'Support'}</h2><p>{missing}</p>{entry.publisher.url && <button onClick={() => void window.pivot.invoke('preview:open-external', { url: entry.publisher.url! })} type="button">{zh ? '访问发布者' : 'Visit publisher'}</button>}</div>}
  </section>
}

function KvRow({ label, value }: { label: string; value: string }): ReactElement { return <div className="pv-marketplace-detail-kv"><span>{label}</span><strong>{value}</strong></div> }
function formatBytes(bytes: number): string { return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB` }

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

function InstalledProviderInventory({ onBrowseMarketplace, onConfigure }: { onBrowseMarketplace?: () => void; onConfigure?: () => void }): ReactElement {
  const catalog = useMarketplaceStore((state) => state.catalog)
  const installations = useMarketplaceStore((state) => state.installations)
  const activeResources = useMarketplaceStore((state) => state.activeResources)
  const updates = useMarketplaceStore((state) => state.updates)
  const isLoading = useMarketplaceStore((state) => state.isLoading)
  const load = useMarketplaceStore((state) => state.load)
  const activateEntry = useMarketplaceStore((state) => state.activateEntry)
  const deactivateEntry = useMarketplaceStore((state) => state.deactivateEntry)
  const [kind, setKind] = useState<'all' | MarketplaceResourceKind>('all')
  const [status, setStatus] = useState<'all' | 'disabled' | 'enabled' | 'updates'>('all')
  const [query, setQuery] = useState('')
  useEffect(() => { void load() }, [load])
  const entries = catalog?.status === 'available' ? catalog.snapshot.entries : []
  const installed = (installations?.items ?? []).map((record) => ({ entry: entries.find((entry) => sameExactResource(record.identity, entry)) ?? null, record })).filter((item): item is { entry: MarketplaceCatalogEntry; record: typeof item.record } => Boolean(item.entry))
  const activeKeys = new Set((activeResources?.items ?? []).map((item) => resourceKey(item.identity)))
  const updateKeys = new Set((updates?.items ?? []).filter((item) => item.state === 'ready').map((item) => resourceKey(item.current.identity)))
  const visible = installed.filter(({ entry }) => {
    const key = resourceKey(entry)
    if (kind !== 'all' && entry.kind !== kind) return false
    if (status === 'enabled' && !activeKeys.has(key)) return false
    if (status === 'disabled' && activeKeys.has(key)) return false
    if (status === 'updates' && !updateKeys.has(key)) return false
    const normalized = query.trim().toLocaleLowerCase()
    return !normalized || `${entry.name} ${entry.publisher.name} ${entry.description}`.toLocaleLowerCase().includes(normalized)
  })
  const countKind = (value: MarketplaceResourceKind): number => installed.filter(({ entry }) => entry.kind === value).length
  return <section className="plugin-ecosystem-page surface-extensions pv-toolkit" data-figma-screen="1476:8909"><aside className="pv-toolkit-sidebar"><h1>Toolkit</h1><h2>EXTENSIONS</h2><nav><ToolkitFilter active={kind === 'all'} label="All Extensions" onClick={() => setKind('all')} value={installed.length} /><ToolkitFilter active={kind === 'plugin'} label="Plugins" onClick={() => setKind('plugin')} value={countKind('plugin')} /><ToolkitFilter active={kind === 'skill'} label="Skills" onClick={() => setKind('skill')} value={countKind('skill')} /><ToolkitFilter active={kind === 'prompt'} label="Prompts" onClick={() => setKind('prompt')} value={countKind('prompt')} /><ToolkitFilter active={kind === 'theme'} label="Themes" onClick={() => setKind('theme')} value={countKind('theme')} /></nav><h2>STATUS</h2><nav><ToolkitFilter active={status === 'enabled'} label="Enabled" onClick={() => setStatus(status === 'enabled' ? 'all' : 'enabled')} value={installed.filter(({ entry }) => activeKeys.has(resourceKey(entry))).length} /><ToolkitFilter active={status === 'disabled'} label="Disabled" onClick={() => setStatus(status === 'disabled' ? 'all' : 'disabled')} value={installed.filter(({ entry }) => !activeKeys.has(resourceKey(entry))).length} /><ToolkitFilter active={status === 'updates'} label="Updates Available" onClick={() => setStatus(status === 'updates' ? 'all' : 'updates')} value={updateKeys.size} /></nav></aside><main className="pv-toolkit-main"><header><div><h2>{kind === 'all' ? 'All Extensions' : `${kind[0].toUpperCase()}${kind.slice(1)}s`}</h2><small>{installed.length} installed</small></div><div><label><Search size={16} /><input aria-label="Search extensions" onChange={(event) => setQuery(event.target.value)} placeholder="Search extensions..." type="search" value={query} /></label><button type="button">Sort: <strong>Name</strong></button></div></header>{visible.length > 0 ? <div className="pv-toolkit-list">{visible.map(({ entry, record }) => { const key = resourceKey(entry); const active = activeKeys.has(key); return <article key={key}><span className={`kind ${entry.kind}`}><CategoryIcon kind={entry.kind} /></span><div><header><strong>{entry.name}</strong><small>v{record.identity.version}</small><em>{entry.kind}</em>{updateKeys.has(key) && <b>Update Available</b>}</header><small>by {entry.publisher.name}</small><p>{entry.description}</p><footer><span>{record.state}</span></footer></div><button aria-label={`${active ? 'Disable' : 'Enable'} ${entry.name}`} aria-pressed={active} className="pv-toolkit-toggle" disabled={isLoading || record.state !== 'installed'} onClick={() => void (active ? deactivateEntry(entry) : activateEntry(entry))} type="button"><i /></button><button aria-label={`Configure ${entry.name}`} disabled={!onConfigure} onClick={onConfigure} type="button"><Settings2 size={15} /></button></article> })}</div> : <div className="pv-extension-empty"><PackageOpen size={24} /><strong>No installed resources</strong><small>Only verified resources installed through Marketplace appear here.</small><button disabled={!onBrowseMarketplace} onClick={onBrowseMarketplace} type="button">Browse Marketplace</button></div>}</main></section>
}

function ToolkitFilter({ active, label, onClick, value }: { active: boolean; label: string; onClick: () => void; value: number }): ReactElement { return <button className={active ? 'active' : ''} onClick={onClick} type="button"><span>{label}</span><em>{value}</em></button> }
