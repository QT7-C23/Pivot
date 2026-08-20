import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { AxisReviewerQualificationRegistry } from '../../src/main/services/axis-reviewer-qualification-registry'
import { AxisReviewerRoutingStore } from '../../src/main/services/axis-reviewer-routing-store'

describe('Axis Reviewer settings migrations', () => {
  it('recovers a partial legacy schema through one durable versioned transaction', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'pivot-reviewer-migration-')), 'db.sqlite')
    const partial = new Database(file)
    partial.exec('CREATE TABLE axis_reviewer_qualifications (evidence_id TEXT PRIMARY KEY)')
    partial.close()

    const qualifications = new AxisReviewerQualificationRegistry(file)
    const routing = new AxisReviewerRoutingStore({
      databasePath: file,
      providers: { get: () => null },
      qualifications,
    })
    expect(routing.read()).toMatchObject({ revision: 0, routing: { enabled: false } })
    routing.close(); qualifications.close()

    const recovered = new Database(file, { readonly: true })
    expect(recovered.prepare('SELECT version FROM axis_reviewer_settings_migrations').all()).toEqual([{ version: 1 }])
    expect(recovered.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('axis_reviewer_qualifications','axis_reviewer_routing') ORDER BY name").all())
      .toEqual([{ name: 'axis_reviewer_qualifications' }, { name: 'axis_reviewer_routing' }])
    recovered.close()
  })
})
