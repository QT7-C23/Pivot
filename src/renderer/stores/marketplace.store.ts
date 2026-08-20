import { create } from 'zustand'
import {
  MarketplaceCatalogReadResultSchema,
  MarketplaceFavoriteCollectionSchema,
  type MarketplaceCatalogEntry,
  type MarketplaceCatalogReadResult,
  type MarketplaceFavoriteCollection,
} from '../../shared/marketplace-contracts'
import { createMarketplaceClient } from '../services/marketplace-client'
import {
  MarketplaceInstallationCollectionSchema,
  type MarketplaceInstallResult,
  type MarketplaceInstallationCollection,
} from '../../shared/marketplace-delivery-contracts'
import type { MarketplaceCapability } from '../../shared/marketplace-package-manifest-contracts'
import {
  MarketplaceActiveResourceCollectionSchema,
  type MarketplaceActiveResourceCollection,
  type MarketplacePluginInvocationResult,
  type MarketplaceThemeTokens,
} from '../../shared/marketplace-resource-contracts'
import {
  MarketplaceUpdateCollectionSchema,
  type MarketplaceUpdateCollection,
  type MarketplaceUpdateRecord,
} from '../../shared/marketplace-update-contracts'
import type { MarketplacePublicationQualification } from '../../shared/marketplace-publication-qualification-contracts'

interface MarketplaceStore {
  catalog: MarketplaceCatalogReadResult | null
  activeResources: MarketplaceActiveResourceCollection | null
  error: string | null
  favorites: MarketplaceFavoriteCollection | null
  installations: MarketplaceInstallationCollection | null
  isLoading: boolean
  pendingApprovals: Readonly<Record<string, readonly MarketplaceCapability[]>>
  updates: MarketplaceUpdateCollection | null
  qualification: MarketplacePublicationQualification | null
  activateEntry(entry: MarketplaceCatalogEntry): Promise<void>
  deactivateEntry(entry: MarketplaceCatalogEntry): Promise<void>
  installEntry(entry: MarketplaceCatalogEntry, approve?: boolean): Promise<MarketplaceInstallResult | null>
  load(): Promise<void>
  toggleFavorite(entry: MarketplaceCatalogEntry): Promise<void>
  uninstallEntry(entry: MarketplaceCatalogEntry): Promise<void>
  invokePlugin(entry: MarketplaceCatalogEntry): Promise<MarketplacePluginInvocationResult | null>
  updateEntry(entry: MarketplaceCatalogEntry, approve?: boolean): Promise<void>
  resolveUpdate(update: MarketplaceUpdateRecord, action: 'finalize' | 'rollback'): Promise<void>
}

const client = createMarketplaceClient()

export const useMarketplaceStore = create<MarketplaceStore>((set, get) => ({
  catalog: null,
  activeResources: null,
  error: null,
  favorites: null,
  installations: null,
  isLoading: false,
  pendingApprovals: {},
  updates: null,
  qualification: null,
  async load() {
    if (get().isLoading) return
    set({ error: null, isLoading: true })
    try {
      const [catalog, favorites, installations, activeResources, updates, qualification] = await Promise.all([
        client.readCatalog(),
        client.getFavorites(),
        client.listInstallations(),
        client.listActiveResources(),
        client.listUpdates(),
        client.qualify(),
      ])
      set({
        catalog: MarketplaceCatalogReadResultSchema.parse(catalog),
        activeResources: MarketplaceActiveResourceCollectionSchema.parse(activeResources),
        favorites: MarketplaceFavoriteCollectionSchema.parse(favorites),
        installations: MarketplaceInstallationCollectionSchema.parse(installations),
        updates: MarketplaceUpdateCollectionSchema.parse(updates),
        qualification,
        isLoading: false,
      })
      applyActiveMarketplaceTheme(activeResources)
    } catch (error) {
      set({ error: toMessage(error), isLoading: false })
    }
  },
  async activateEntry(entry) {
    const installation = get().installations?.items.find((item) => sameExactResource(item.identity, entry))
    if (!installation || get().isLoading) return
    set({ error: null, isLoading: true })
    try {
      await client.activate({ expectedInstallationRevision: installation.revision, identity: installation.identity })
      const activeResources = await client.listActiveResources()
      applyActiveMarketplaceTheme(activeResources)
      set({ activeResources, isLoading: false })
    } catch (error) { set({ error: toMessage(error), isLoading: false }) }
  },
  async deactivateEntry(entry) {
    const active = get().activeResources?.items.find((item) => sameExactResource(item.identity, entry))
    if (!active || get().isLoading) return
    set({ error: null, isLoading: true })
    try {
      const activeResources = await client.deactivate({ expectedActivationRevision: 0, identity: active.identity })
      applyActiveMarketplaceTheme(activeResources)
      set({ activeResources, isLoading: false })
    } catch (error) { set({ error: toMessage(error), isLoading: false }) }
  },
  async invokePlugin(entry) {
    const active = get().activeResources?.items.find((item) => sameExactResource(item.identity, entry))
    if (!active || active.identity.kind !== 'plugin' || get().isLoading) return null
    set({ error: null, isLoading: true })
    try {
      const result = await client.invokePlugin({ registrationId: active.registrationId })
      set({ isLoading: false })
      return result
    } catch (error) { set({ error: toMessage(error), isLoading: false }); return null }
  },
  async updateEntry(entry, approve = false) {
    const catalog = get().catalog
    const current = get().installations?.items.find((item) => sameResource(item.identity, entry))
    if (!current || get().isLoading || catalog?.status !== 'available') return
    const key = resourceKey(entry)
    const approvedCapabilities = approve ? [...(get().pendingApprovals[key] ?? [])] : []
    set({ error: null, isLoading: true })
    try {
      const result = await client.update({
        approvedCapabilities, currentIdentity: current.identity,
        expectedCatalogRevision: catalog.snapshot.revision, expectedCurrentRevision: current.revision,
        kind: entry.kind, resourceId: entry.resourceId, sourceId: entry.sourceId,
      })
      if (result.status === 'requires-approval') {
        set((state) => ({ isLoading: false, pendingApprovals: { ...state.pendingApprovals, [key]: result.declaredCapabilities } }))
        return
      }
      if (result.status === 'rejected') { set({ error: result.reason, isLoading: false }); return }
      const [installations, activeResources, updates] = await Promise.all([
        client.listInstallations(), client.listActiveResources(), client.listUpdates(),
      ])
      applyActiveMarketplaceTheme(activeResources)
      set((state) => {
        const pendingApprovals = { ...state.pendingApprovals }; delete pendingApprovals[key]
        return { activeResources, installations, isLoading: false, pendingApprovals, updates }
      })
    } catch (error) { set({ error: toMessage(error), isLoading: false }) }
  },
  async resolveUpdate(update, action) {
    if (get().isLoading) return
    set({ error: null, isLoading: true })
    try {
      const request = { expectedRevision: update.revision, updateId: update.updateId }
      if (action === 'finalize') await client.finalizeUpdate(request)
      else await client.rollbackUpdate(request)
      const [installations, activeResources, updates] = await Promise.all([
        client.listInstallations(), client.listActiveResources(), client.listUpdates(),
      ])
      applyActiveMarketplaceTheme(activeResources)
      set({ activeResources, installations, isLoading: false, updates })
    } catch (error) { set({ error: toMessage(error), isLoading: false }) }
  },
  async installEntry(entry, approve = false) {
    const catalog = get().catalog
    if (get().isLoading || catalog?.status !== 'available') return null
    const key = resourceKey(entry)
    const approvedCapabilities = approve ? [...(get().pendingApprovals[key] ?? [])] : []
    set({ error: null, isLoading: true })
    try {
      const result = await client.install({
        approvedCapabilities,
        expectedCatalogRevision: catalog.snapshot.revision,
        kind: entry.kind,
        resourceId: entry.resourceId,
        sourceId: entry.sourceId,
      })
      if (result.status === 'requires-approval') {
        set((state) => ({
          isLoading: false,
          pendingApprovals: { ...state.pendingApprovals, [key]: result.declaredCapabilities },
        }))
        return result
      }
      if (result.status === 'rejected') {
        set({ error: result.reason, isLoading: false })
        return result
      }
      const installations = MarketplaceInstallationCollectionSchema.parse(
        await client.listInstallations(),
      )
      set((state) => {
        const pendingApprovals = { ...state.pendingApprovals }
        delete pendingApprovals[key]
        return { installations, isLoading: false, pendingApprovals }
      })
      return result
    } catch (error) {
      set({ error: toMessage(error), isLoading: false })
      return null
    }
  },
  async toggleFavorite(entry) {
    const current = get().favorites
    if (!current || get().isLoading) return
    const favorite = !current.items.some((item) => (
      item.kind === entry.kind
      && item.resourceId === entry.resourceId
      && item.sourceId === entry.sourceId
    ))
    set({ error: null, isLoading: true })
    try {
      const favorites = await client.setFavorite({
        expectedRevision: current.revision,
        favorite,
        kind: entry.kind,
        resourceId: entry.resourceId,
        sourceId: entry.sourceId,
      })
      set({ favorites: MarketplaceFavoriteCollectionSchema.parse(favorites), isLoading: false })
    } catch (error) {
      try {
        const favorites = MarketplaceFavoriteCollectionSchema.parse(await client.getFavorites())
        set({ error: toMessage(error), favorites, isLoading: false })
      } catch (reloadError) {
        set({ error: `${toMessage(error)}; reload failed: ${toMessage(reloadError)}`, isLoading: false })
      }
    }
  },
  async uninstallEntry(entry) {
    if (get().isLoading) return
    const installation = get().installations?.items.find((item) => sameResource(item.identity, entry))
    if (!installation) return
    set({ error: null, isLoading: true })
    try {
      const installations = await client.uninstall({
        expectedRevision: installation.revision,
        identity: installation.identity,
      })
      const activeResources = await client.listActiveResources()
      applyActiveMarketplaceTheme(activeResources)
      set({
        activeResources,
        installations: MarketplaceInstallationCollectionSchema.parse(installations),
        isLoading: false,
      })
    } catch (error) {
      set({ error: toMessage(error), isLoading: false })
    }
  },
}))

function resourceKey(entry: Pick<MarketplaceCatalogEntry, 'kind' | 'resourceId' | 'sourceId'>): string {
  return `${entry.sourceId}:${entry.kind}:${entry.resourceId}`
}

function sameResource(
  identity: Pick<MarketplaceCatalogEntry, 'kind' | 'resourceId' | 'sourceId'>,
  entry: Pick<MarketplaceCatalogEntry, 'kind' | 'resourceId' | 'sourceId'>,
): boolean {
  return identity.sourceId === entry.sourceId && identity.kind === entry.kind
    && identity.resourceId === entry.resourceId
}

function sameExactResource(
  identity: Pick<MarketplaceCatalogEntry, 'kind' | 'resourceId' | 'sourceId' | 'version'>,
  entry: Pick<MarketplaceCatalogEntry, 'kind' | 'resourceId' | 'sourceId' | 'version'>,
): boolean {
  return sameResource(identity, entry) && identity.version === entry.version
}

const THEME_VARIABLES: Readonly<Record<keyof MarketplaceThemeTokens, string>> = {
  accentDefault: '--pv-accent-default', accentEmphasis: '--pv-accent-emphasis', accentMuted: '--pv-accent-muted',
  backgroundCanvas: '--pv-bg-canvas', backgroundElevated: '--pv-bg-elevated', backgroundSurface: '--pv-bg-surface',
  borderDefault: '--pv-border-default', textPrimary: '--pv-text-primary', textSecondary: '--pv-text-secondary',
}

export function applyActiveMarketplaceTheme(collection: MarketplaceActiveResourceCollection): void {
  if (typeof document === 'undefined') return
  for (const variable of Object.values(THEME_VARIABLES)) document.documentElement.style.removeProperty(variable)
  let theme: MarketplaceThemeTokens | null = null
  for (let index = collection.items.length - 1; index >= 0; index -= 1) {
    const item = collection.items[index]!
    if (item.identity.kind === 'theme' && item.themeTokens) { theme = item.themeTokens; break }
  }
  if (!theme) return
  for (const [token, value] of Object.entries(theme)) {
    document.documentElement.style.setProperty(THEME_VARIABLES[token as keyof MarketplaceThemeTokens], String(value))
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
