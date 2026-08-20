import type { MarketplaceCatalogReaderPort } from './marketplace-ports'
import {
  createMarketplaceCatalogRuntime,
  type MarketplaceCatalogRuntime,
} from './marketplace-catalog-runtime'
import type { MarketplaceTrustedCatalogConfig } from './marketplace-catalog-trust-registry'
import { getOfficialMarketplaceCatalogTrustConfig } from './marketplace-official-catalog-trust'

const ENABLED_ENV_NAME = 'PIVOT_MARKETPLACE_CATALOG_ENABLED'

export interface MarketplaceProductionCatalogRuntime {
  close(): void
  readonly reader: MarketplaceCatalogReaderPort | null
  readonly state: Readonly<{
    available: boolean
    reason: 'unconfigured' | null
  }>
}

export function resolveMarketplaceProductionCatalogConfig(
  env: Readonly<Record<string, string | undefined>>,
): MarketplaceTrustedCatalogConfig | null {
  const enabled = env[ENABLED_ENV_NAME]
  if (enabled === undefined || enabled === '0') return null
  if (enabled !== '1') {
    throw new Error(`${ENABLED_ENV_NAME} must be 0 or 1`)
  }
  return getOfficialMarketplaceCatalogTrustConfig()
}

export function createMarketplaceProductionCatalogRuntime(options: {
  clock?: () => Date
  databasePath: string
  env: Readonly<Record<string, string | undefined>>
  fetchImpl?: typeof fetch
  maxBytes?: number
  timeoutMs?: number
}): MarketplaceProductionCatalogRuntime {
  const config = resolveMarketplaceProductionCatalogConfig(options.env)
  const runtime = createMarketplaceCatalogRuntime({
    clock: options.clock,
    databasePath: options.databasePath,
    fetchImpl: options.fetchImpl,
    maxBytes: options.maxBytes,
    source: config,
    timeoutMs: options.timeoutMs,
  })
  return wrapRuntime(runtime)
}

function wrapRuntime(runtime: MarketplaceCatalogRuntime | null): MarketplaceProductionCatalogRuntime {
  if (!runtime) {
    return Object.freeze({
      close: () => undefined,
      reader: null,
      state: Object.freeze({ available: false, reason: 'unconfigured' as const }),
    })
  }
  return Object.freeze({
    close: () => runtime.close(),
    reader: runtime.reader,
    state: Object.freeze({ available: true, reason: null }),
  })
}
