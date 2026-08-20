import { lstatSync } from 'node:fs'
import path from 'node:path'
import type { MarketplaceExtractedRootValidationPort } from './marketplace-package-binding-ports'

export class NodeMarketplaceExtractedRootValidationAdapter {
  openValidationPort(): MarketplaceExtractedRootValidationPort {
    return Object.freeze({ validate: (rootPath: string) => this.validate(rootPath) })
  }

  private validate(rootPath: string): void {
    if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) {
      throw new Error('Marketplace extracted package root must be absolute')
    }
    const stats = lstatSync(path.resolve(rootPath), { bigint: true })
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error('Marketplace extracted package root must be a real directory')
    }
  }
}
