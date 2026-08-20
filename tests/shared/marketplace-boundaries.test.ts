import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(process.cwd(), 'src')

describe('marketplace module boundaries', () => {
  it('keeps shared catalog and favorite contracts independent from runtime capabilities', () => {
    const contract = readFileSync(path.join(root, 'shared/marketplace-contracts.ts'), 'utf8')
    expect(contract).not.toMatch(/from ['"].*\/(main|renderer)\//)
    expect(contract).not.toMatch(/better-sqlite3|ipcMain|BrowserWindow|node:(fs|http|https|child_process)/)
    expect(contract).not.toMatch(/spawn\(|exec\(|writeFile\(|unlink\(/)
  })

  it('separates catalog reading from favorite reading and writing', () => {
    const ports = readFileSync(path.join(root, 'main/services/marketplace-ports.ts'), 'utf8')
    expect(ports).toContain('MarketplaceCatalogReaderPort')
    expect(ports).toContain('MarketplaceFavoriteReaderPort')
    expect(ports).toContain('MarketplaceFavoriteWriterPort')
    expect(ports).not.toMatch(/Database|better-sqlite3|Admin|install|execute/i)
  })

  it('keeps marketplace persistence out of Renderer and Worker code', () => {
    const adapter = readFileSync(path.join(root, 'main/services/sqlite-marketplace-favorite-adapter.ts'), 'utf8')
    expect(adapter).toContain("from 'better-sqlite3'")
    expect(adapter).not.toMatch(/renderer\/|worker\/|ipcMain|BrowserWindow/)

    for (const relativePath of ['renderer', 'worker']) {
      const directory = path.join(root, relativePath)
      const source = collectTypeScript(directory)
      expect(source).not.toContain('SqliteMarketplaceFavoriteAdapter')
      expect(source).not.toContain('better-sqlite3')
    }
  })

  it('keeps publishing authority in a separate developer-only composition', () => {
    const publisher = collectTypeScript(path.join(root, 'publisher'))
    const service = readFileSync(path.join(root, 'publisher/marketplace-publisher.ts'), 'utf8')
    expect(service).not.toMatch(/node:(crypto|fs|child_process)|main\/|renderer\/|worker\//)
    expect(service).toContain('signPackageArtifact')
    expect(service).toContain('MarketplacePublisherCryptoPort')
    expect(publisher).not.toMatch(/ipcMain|BrowserWindow|better-sqlite3/)

    for (const relativePath of ['main', 'renderer', 'worker']) {
      expect(collectTypeScript(path.join(root, relativePath)))
        .not.toMatch(/publisher\/marketplace-publisher|NodeMarketplacePublisherCryptoAdapter/)
    }
  })

  it('keeps package verification behind narrow Main-only ports', () => {
    const ports = readFileSync(path.join(root, 'main/services/marketplace-package-artifact-ports.ts'), 'utf8')
    const verifier = readFileSync(path.join(root, 'main/services/verified-marketplace-package-artifact-adapter.ts'), 'utf8')
    const inspection = readFileSync(path.join(root, 'main/services/node-marketplace-package-artifact-inspection-adapter.ts'), 'utf8')

    expect(ports).toContain('MarketplacePackageArtifactInspectionPort')
    expect(ports).toContain('MarketplacePackageArtifactVerificationPort')
    expect(ports).not.toMatch(/node:(fs|crypto)|better-sqlite3|ipcMain|BrowserWindow/)
    expect(verifier).toContain('MarketplaceCatalogTrustReaderPort')
    expect(verifier).toContain('MarketplacePackageArtifactInspectionPort')
    expect(verifier).not.toMatch(/node:(fs|crypto)|better-sqlite3|ipcMain|BrowserWindow/)
    expect(inspection).toMatch(/node:fs|node:crypto/)
    expect(inspection).not.toMatch(/renderer\/|worker\/|better-sqlite3|ipcMain|BrowserWindow/)

    for (const relativePath of ['renderer', 'worker']) {
      const source = collectTypeScript(path.join(root, relativePath))
      expect(source).not.toContain('MarketplacePackageArtifactVerificationPort')
      expect(source).not.toContain('NodeMarketplacePackageArtifactInspectionAdapter')
    }
  })

  it('keeps verified package download behind staging and verification ports', () => {
    const ports = readFileSync(path.join(root, 'main/services/marketplace-package-download-ports.ts'), 'utf8')
    const policy = readFileSync(path.join(root, 'main/services/verified-marketplace-package-download-adapter.ts'), 'utf8')
    const staging = readFileSync(path.join(root, 'main/services/node-https-marketplace-package-staging-adapter.ts'), 'utf8')

    expect(ports).toContain('MarketplacePackageStagingPort')
    expect(ports).toContain('MarketplacePackageDownloadPort')
    expect(ports).not.toMatch(/node:(fs|crypto)|better-sqlite3|ipcMain|BrowserWindow/)
    expect(policy).toContain('MarketplacePackageStagingPort')
    expect(policy).toContain('MarketplacePackageArtifactVerificationPort')
    expect(policy).toContain('MarketplaceCatalogTrustReaderPort')
    expect(policy).not.toMatch(/node:(fs|crypto|http|https)|better-sqlite3|ipcMain|BrowserWindow/)
    expect(staging).toMatch(/node:fs|node:crypto/)
    expect(staging).not.toMatch(/renderer\/|worker\/|better-sqlite3|ipcMain|BrowserWindow/)

    for (const relativePath of ['renderer', 'preload']) {
      const source = collectTypeScript(path.join(root, relativePath))
      expect(source).not.toContain('MarketplacePackageDownloadPort')
      expect(source).not.toContain('NodeHttpsMarketplacePackageStagingAdapter')
    }
  })

  it('keeps archive inspection and extraction behind narrow Main-only ports', () => {
    const contract = readFileSync(path.join(root, 'shared/marketplace-archive-contracts.ts'), 'utf8')
    const ports = readFileSync(path.join(root, 'main/services/marketplace-package-archive-ports.ts'), 'utf8')
    const policy = readFileSync(path.join(root, 'main/services/verified-marketplace-package-archive-adapter.ts'), 'utf8')
    const nodeAdapter = readFileSync(path.join(root, 'main/services/node-zip-marketplace-package-archive-adapter.ts'), 'utf8')

    expect(contract).not.toMatch(/from ['"].*\/(main|renderer)\//)
    expect(contract).not.toMatch(/node:(fs|path|stream)|yauzl|ipcMain|BrowserWindow/)
    expect(ports).toContain('MarketplaceArchiveInspectionPort')
    expect(ports).toContain('MarketplaceArchiveExtractionPort')
    expect(ports).toContain('MarketplacePackageArchivePreparationPort')
    expect(ports).not.toMatch(/node:(fs|path|stream)|yauzl|ipcMain|BrowserWindow/)
    expect(policy).toContain('MarketplaceArchiveInspectionPort')
    expect(policy).toContain('MarketplaceArchiveExtractionPort')
    expect(policy).not.toMatch(/node:(fs|path|stream)|yauzl|ipcMain|BrowserWindow/)
    expect(nodeAdapter).toMatch(/node:fs|node:path|yauzl/)
    expect(nodeAdapter).not.toMatch(/renderer\/|worker\/|better-sqlite3|ipcMain|BrowserWindow/)

    for (const relativePath of ['renderer', 'preload', 'worker']) {
      const source = collectTypeScript(path.join(root, relativePath))
      expect(source).not.toContain('MarketplacePackageArchivePreparationPort')
      expect(source).not.toContain('NodeZipMarketplacePackageArchiveAdapter')
    }
  })

  it('keeps package binding, capability review and installation authority Main-only', () => {
    const sharedFiles = [
      'shared/marketplace-package-manifest-contracts.ts',
      'shared/marketplace-capability-contracts.ts',
      'shared/marketplace-installation-contracts.ts',
    ].map((relativePath) => readFileSync(path.join(root, relativePath), 'utf8')).join('\n')
    const ports = [
      'main/services/marketplace-package-manifest-ports.ts',
      'main/services/marketplace-package-binding-ports.ts',
      'main/services/marketplace-capability-review-ports.ts',
      'main/services/marketplace-installation-ports.ts',
    ].map((relativePath) => readFileSync(path.join(root, relativePath), 'utf8')).join('\n')
    const policies = [
      'main/services/verified-marketplace-package-manifest-adapter.ts',
      'main/services/verified-marketplace-package-binding-adapter.ts',
      'main/services/marketplace-capability-review-adapter.ts',
      'main/services/marketplace-installation-coordinator.ts',
      'main/services/marketplace-installation-lifecycle-coordinator.ts',
    ].map((relativePath) => readFileSync(path.join(root, relativePath), 'utf8')).join('\n')
    const infrastructure = [
      'main/services/node-marketplace-package-manifest-inspection-adapter.ts',
      'main/services/node-marketplace-extracted-root-validation-adapter.ts',
      'main/services/node-marketplace-installation-storage-adapter.ts',
      'main/services/sqlite-marketplace-installation-registry-adapter.ts',
    ].map((relativePath) => readFileSync(path.join(root, relativePath), 'utf8')).join('\n')

    expect(sharedFiles).not.toMatch(/from ['"].*\/(main|renderer)\//)
    expect(sharedFiles).not.toMatch(/node:(fs|path|crypto)|better-sqlite3|ipcMain|BrowserWindow/)
    expect(ports).toMatch(/ManifestInspectionPort|PackageBindingPort|CapabilityReviewPort|InstallationStoragePort/)
    expect(ports).not.toMatch(/node:(fs|path|crypto)|better-sqlite3|ipcMain|BrowserWindow/)
    expect(policies).not.toMatch(/node:(fs|path|crypto)|better-sqlite3|ipcMain|BrowserWindow/)
    expect(infrastructure).toMatch(/node:fs|better-sqlite3/)

    for (const relativePath of ['renderer', 'preload', 'worker']) {
      const source = collectTypeScript(path.join(root, relativePath))
      expect(source).not.toMatch(/MarketplaceInstallation(Storage|Registry|Lifecycle|Recovery)Port/)
      expect(source).not.toMatch(/NodeMarketplaceInstallationStorageAdapter|SqliteMarketplaceInstallationRegistryAdapter/)
    }
  })
})

function collectTypeScript(directory: string): string {
  const { readdirSync, readFileSync, statSync } = require('node:fs') as typeof import('node:fs')
  if (!statSync(directory, { throwIfNoEntry: false })) return ''
  return readdirSync(directory).flatMap((entry) => {
    const filePath = path.join(directory, entry)
    return statSync(filePath).isDirectory()
      ? [collectTypeScript(filePath)]
      : /\.(?:ts|tsx)$/.test(entry) ? [readFileSync(filePath, 'utf8')] : []
  }).join('\n')
}
