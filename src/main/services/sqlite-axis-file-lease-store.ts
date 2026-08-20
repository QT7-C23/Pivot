import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import {
  AxisFileIdentitySchema,
  AxisFileLeaseAcquireRequestSchema,
  AxisFileLeaseBatchAcquireRequestSchema,
  AxisFileLeaseBatchReleaseRequestSchema,
  AxisFileLeaseBatchRenewRequestSchema,
  AxisFileLeaseBatchVerifyRequestSchema,
  AxisFileLeaseBindingSchema,
  AxisFileLeaseReleaseRequestSchema,
  AxisFileLeaseRenewRequestSchema,
  AxisFileLeaseRunBindingSchema,
  AxisFileLeaseSessionBindingSchema,
  AxisFileLeaseSchema,
  type AxisFileIdentity,
  type AxisFileLease,
  type AxisFileLeaseAcquireRequest,
  type AxisFileLeaseBatchAcquireRequest,
  type AxisFileLeaseBatchReleaseRequest,
  type AxisFileLeaseBatchRenewRequest,
  type AxisFileLeaseBatchVerifyRequest,
  type AxisFileLeaseBinding,
  type AxisFileLeaseReleaseRequest,
  type AxisFileLeaseRenewRequest,
  type AxisFileLeaseRunBinding,
  type AxisFileLeaseSessionBinding,
} from '../../shared/axis-file-lease-contracts'
import {
  AxisFileLeaseConflictError,
  type AxisFileLeaseAdminPort,
  type AxisFileLeasePortFactory,
  type AxisProjectFileIdentityPort,
  type AxisTaskFileLeasePort,
} from './axis-file-lease-ports'

interface AxisFileLeaseRow {
  acquired_at: string
  expires_at: string
  file_key: string
  lease_id: string
  project_id: string
  project_relative_path: string
  run_id: string
  session_id: string
  status: 'active' | 'released' | 'expired'
  task_id: string
  updated_at: string
  version: number
}

export class SqliteAxisFileLeaseStore implements AxisFileLeaseAdminPort, AxisFileLeasePortFactory {
  private readonly clock: () => Date
  private readonly db: Database
  private readonly identity: AxisProjectFileIdentityPort

  constructor(
    identity: AxisProjectFileIdentityPort,
    databasePath = ':memory:',
    options: { clock?: () => Date } = {},
  ) {
    this.clock = options.clock ?? (() => new Date())
    this.identity = identity
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS axis_file_leases (
        lease_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        file_key TEXT NOT NULL,
        project_relative_path TEXT NOT NULL,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'released', 'expired'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_axis_file_leases_active_file
        ON axis_file_leases(project_id, file_key) WHERE status = 'active';
      CREATE INDEX IF NOT EXISTS idx_axis_file_leases_owner
        ON axis_file_leases(project_id, run_id, session_id, task_id, status);
      CREATE INDEX IF NOT EXISTS idx_axis_file_leases_expiry
        ON axis_file_leases(status, expires_at);
    `)
  }

  openTaskPort(bindingInput: AxisFileLeaseBinding): AxisTaskFileLeasePort {
    const binding = AxisFileLeaseBindingSchema.parse(bindingInput)
    return Object.freeze({
      acquire: (request: AxisFileLeaseAcquireRequest) => this.acquire(binding, request),
      acquireAll: (request: AxisFileLeaseBatchAcquireRequest) => this.acquireAll(binding, request),
      listOwn: () => this.listOwn(binding),
      release: (request: AxisFileLeaseReleaseRequest) => this.release(binding, request),
      releaseAll: (request: AxisFileLeaseBatchReleaseRequest) => this.releaseAll(binding, request),
      renew: (request: AxisFileLeaseRenewRequest) => this.renew(binding, request),
      renewAll: (request: AxisFileLeaseBatchRenewRequest) => this.renewAll(binding, request),
      verifyAll: (request: AxisFileLeaseBatchVerifyRequest) => this.verifyAll(binding, request),
    })
  }

  async listActive(projectIdInput: string): Promise<AxisFileLease[]> {
    const projectId = AxisFileLeaseBindingSchema.shape.projectId.parse(projectIdInput)
    this.expireDue(this.clock().toISOString())
    return (this.db.prepare(`
      SELECT * FROM axis_file_leases
      WHERE project_id = ? AND status = 'active'
      ORDER BY project_relative_path ASC, lease_id ASC
    `).all(projectId) as AxisFileLeaseRow[]).map(parseRow)
  }

  releaseForRun(bindingInput: AxisFileLeaseRunBinding): number {
    const binding = AxisFileLeaseRunBindingSchema.parse(bindingInput)
    const timestamp = this.clock().toISOString()
    this.expireDue(timestamp)
    return this.db.prepare(`
      UPDATE axis_file_leases
      SET status = 'released', version = version + 1, updated_at = ?
      WHERE run_id = ? AND session_id = ? AND status = 'active'
    `).run(timestamp, binding.runId, binding.sessionId).changes
  }

  releaseForSession(bindingInput: AxisFileLeaseSessionBinding): number {
    const binding = AxisFileLeaseSessionBindingSchema.parse(bindingInput)
    const timestamp = this.clock().toISOString()
    this.expireDue(timestamp)
    return this.db.prepare(`
      UPDATE axis_file_leases
      SET status = 'released', version = version + 1, updated_at = ?
      WHERE session_id = ? AND status = 'active'
    `).run(timestamp, binding.sessionId).changes
  }

  close(): void {
    this.db.close()
  }

  private async acquire(
    binding: AxisFileLeaseBinding,
    requestInput: AxisFileLeaseAcquireRequest,
  ): Promise<AxisFileLease> {
    const request = AxisFileLeaseAcquireRequestSchema.parse(requestInput)
    const [lease] = await this.acquireAll(binding, {
      filePaths: [request.filePath],
      ttlMs: request.ttlMs,
    })
    if (!lease) throw new Error('Axis file lease acquisition returned no lease')
    return lease
  }

  private async acquireAll(
    binding: AxisFileLeaseBinding,
    requestInput: AxisFileLeaseBatchAcquireRequest,
  ): Promise<AxisFileLease[]> {
    const request = AxisFileLeaseBatchAcquireRequestSchema.parse(requestInput)
    const resolved = await Promise.all(request.filePaths.map(async (filePath) => (
      AxisFileIdentitySchema.parse(await this.identity.resolve(binding, filePath))
    )))
    const identities = [...new Map(
      resolved.map((identity) => [identity.fileKey, identity]),
    ).values()].sort((left, right) => left.fileKey.localeCompare(right.fileKey))

    return this.db.transaction(() => {
      const timestamp = this.clock().toISOString()
      this.expireDue(timestamp)

      for (const identity of identities) {
        const conflict = this.findActive(binding.projectId, identity.fileKey)
        if (conflict) throw new AxisFileLeaseConflictError(conflict)
      }

      const leases = identities.map((identity) => AxisFileLeaseSchema.parse({
        acquiredAt: timestamp,
        expiresAt: new Date(Date.parse(timestamp) + request.ttlMs).toISOString(),
        fileKey: identity.fileKey,
        leaseId: `file-lease-${randomUUID()}`,
        projectId: binding.projectId,
        projectRelativePath: identity.projectRelativePath,
        runId: binding.runId,
        schemaVersion: 1,
        sessionId: binding.sessionId,
        status: 'active',
        taskId: binding.taskId,
        updatedAt: timestamp,
        version: 1,
      }))
      for (const lease of leases) {
        try {
          this.insertLease(lease)
        } catch (error) {
          const concurrentConflict = this.findActive(binding.projectId, lease.fileKey)
          if (concurrentConflict && concurrentConflict.leaseId !== lease.leaseId) {
            throw new AxisFileLeaseConflictError(concurrentConflict)
          }
          throw error
        }
      }
      return leases
    })()
  }

  private async listOwn(binding: AxisFileLeaseBinding): Promise<AxisFileLease[]> {
    this.expireDue(this.clock().toISOString())
    return (this.db.prepare(`
      SELECT * FROM axis_file_leases
      WHERE project_id = ? AND run_id = ? AND session_id = ? AND task_id = ? AND status = 'active'
      ORDER BY file_key ASC, lease_id ASC
    `).all(
      binding.projectId,
      binding.runId,
      binding.sessionId,
      binding.taskId,
    ) as AxisFileLeaseRow[]).map(parseRow)
  }

  private async renew(
    binding: AxisFileLeaseBinding,
    requestInput: AxisFileLeaseRenewRequest,
  ): Promise<AxisFileLease> {
    const request = AxisFileLeaseRenewRequestSchema.parse(requestInput)
    const [lease] = await this.renewAll(binding, {
      leases: [{
        expectedVersion: request.expectedVersion,
        leaseId: request.leaseId,
      }],
      ttlMs: request.ttlMs,
    })
    if (!lease) throw new Error('Axis file lease renewal returned no lease')
    return lease
  }

  private async renewAll(
    binding: AxisFileLeaseBinding,
    requestInput: AxisFileLeaseBatchRenewRequest,
  ): Promise<AxisFileLease[]> {
    const request = AxisFileLeaseBatchRenewRequestSchema.parse(requestInput)
    return this.db.transaction(() => {
      const timestamp = this.clock().toISOString()
      this.expireDue(timestamp)
      const mutations = [...request.leases].sort(
        (left, right) => left.leaseId.localeCompare(right.leaseId),
      )
      const current = mutations.map((mutation) => {
        const lease = this.requireOwnedLease(binding, mutation.leaseId)
        this.assertActiveVersion(lease, mutation.expectedVersion)
        return lease
      })
      const next = current.map((lease) => AxisFileLeaseSchema.parse({
        ...lease,
        expiresAt: new Date(Date.parse(timestamp) + request.ttlMs).toISOString(),
        updatedAt: timestamp,
        version: lease.version + 1,
      }))
      for (const [index, lease] of next.entries()) {
        const mutation = mutations[index]
        if (!mutation) throw new Error('Axis file lease renewal mutation is missing')
        const result = this.db.prepare(`
          UPDATE axis_file_leases
          SET expires_at = @expiresAt, updated_at = @updatedAt, version = @version
          WHERE lease_id = @leaseId AND status = 'active' AND version = @expectedVersion
        `).run({ ...toRowInput(lease), expectedVersion: mutation.expectedVersion })
        if (result.changes !== 1) {
          throw new Error(`Axis file lease version conflict: ${lease.leaseId}`)
        }
      }
      return next
    })()
  }

  private async release(
    binding: AxisFileLeaseBinding,
    requestInput: AxisFileLeaseReleaseRequest,
  ): Promise<AxisFileLease> {
    const request = AxisFileLeaseReleaseRequestSchema.parse(requestInput)
    const [lease] = await this.releaseAll(binding, {
      leases: [{
        expectedVersion: request.expectedVersion,
        leaseId: request.leaseId,
      }],
    })
    if (!lease) throw new Error('Axis file lease release returned no lease')
    return lease
  }

  private async verifyAll(
    binding: AxisFileLeaseBinding,
    requestInput: AxisFileLeaseBatchVerifyRequest,
  ): Promise<AxisFileLease[]> {
    const request = AxisFileLeaseBatchVerifyRequestSchema.parse(requestInput)
    return this.db.transaction(() => {
      this.expireDue(this.clock().toISOString())
      const verified = [...request.leases]
        .sort((left, right) => left.leaseId.localeCompare(right.leaseId))
        .map((mutation) => {
          const lease = this.requireOwnedLease(binding, mutation.leaseId)
          this.assertActiveVersion(lease, mutation.expectedVersion)
          return lease
        })
      return verified.sort((left, right) => left.fileKey.localeCompare(right.fileKey))
    })()
  }

  private async releaseAll(
    binding: AxisFileLeaseBinding,
    requestInput: AxisFileLeaseBatchReleaseRequest,
  ): Promise<AxisFileLease[]> {
    const request = AxisFileLeaseBatchReleaseRequestSchema.parse(requestInput)
    return this.db.transaction(() => {
      const timestamp = this.clock().toISOString()
      this.expireDue(timestamp)
      const mutations = [...request.leases].sort(
        (left, right) => left.leaseId.localeCompare(right.leaseId),
      )
      const current = mutations.map((mutation) => {
        const lease = this.requireOwnedLease(binding, mutation.leaseId)
        this.assertActiveVersion(lease, mutation.expectedVersion)
        return lease
      })
      const next = current.map((lease) => AxisFileLeaseSchema.parse({
        ...lease,
        status: 'released',
        updatedAt: timestamp,
        version: lease.version + 1,
      }))
      for (const [index, lease] of next.entries()) {
        const mutation = mutations[index]
        if (!mutation) throw new Error('Axis file lease release mutation is missing')
        const result = this.db.prepare(`
          UPDATE axis_file_leases
          SET status = 'released', updated_at = @updatedAt, version = @version
          WHERE lease_id = @leaseId AND status = 'active' AND version = @expectedVersion
        `).run({ ...toRowInput(lease), expectedVersion: mutation.expectedVersion })
        if (result.changes !== 1) {
          throw new Error(`Axis file lease version conflict: ${lease.leaseId}`)
        }
      }
      return next
    })()
  }

  private insertLease(lease: AxisFileLease): void {
    this.db.prepare(`
      INSERT INTO axis_file_leases (
        lease_id, project_id, file_key, project_relative_path,
        run_id, session_id, task_id, acquired_at, expires_at,
        updated_at, version, status
      ) VALUES (
        @leaseId, @projectId, @fileKey, @projectRelativePath,
        @runId, @sessionId, @taskId, @acquiredAt, @expiresAt,
        @updatedAt, @version, @status
      )
    `).run(toRowInput(lease))
  }

  private assertActiveVersion(lease: AxisFileLease, expectedVersion: number): void {
    if (lease.status !== 'active') {
      throw new Error(`Axis file lease is not active: ${lease.status}`)
    }
    if (lease.version !== expectedVersion) {
      throw new Error(
        `Axis file lease version conflict: expected ${expectedVersion}, current ${lease.version}`,
      )
    }
  }

  private expireDue(timestamp: string): void {
    this.db.prepare(`
      UPDATE axis_file_leases
      SET status = 'expired', version = version + 1, updated_at = ?
      WHERE status = 'active' AND expires_at <= ?
    `).run(timestamp, timestamp)
  }

  private findActive(projectId: string, fileKey: string): AxisFileLease | null {
    const row = this.db.prepare(`
      SELECT * FROM axis_file_leases
      WHERE project_id = ? AND file_key = ? AND status = 'active'
    `).get(projectId, fileKey) as AxisFileLeaseRow | undefined
    return row ? parseRow(row) : null
  }

  private requireOwnedLease(
    binding: AxisFileLeaseBinding,
    leaseId: string,
  ): AxisFileLease {
    const row = this.db.prepare(`
      SELECT * FROM axis_file_leases
      WHERE lease_id = ? AND project_id = ? AND run_id = ? AND session_id = ? AND task_id = ?
    `).get(
      leaseId,
      binding.projectId,
      binding.runId,
      binding.sessionId,
      binding.taskId,
    ) as AxisFileLeaseRow | undefined
    if (!row) throw new Error(`Axis file lease is not owned by the bound task: ${leaseId}`)
    return parseRow(row)
  }
}

function toRowInput(lease: AxisFileLease): Record<string, number | string> {
  return {
    acquiredAt: lease.acquiredAt,
    expiresAt: lease.expiresAt,
    fileKey: lease.fileKey,
    leaseId: lease.leaseId,
    projectId: lease.projectId,
    projectRelativePath: lease.projectRelativePath,
    runId: lease.runId,
    sessionId: lease.sessionId,
    status: lease.status,
    taskId: lease.taskId,
    updatedAt: lease.updatedAt,
    version: lease.version,
  }
}

function parseRow(row: AxisFileLeaseRow): AxisFileLease {
  return AxisFileLeaseSchema.parse({
    acquiredAt: row.acquired_at,
    expiresAt: row.expires_at,
    fileKey: row.file_key,
    leaseId: row.lease_id,
    projectId: row.project_id,
    projectRelativePath: row.project_relative_path,
    runId: row.run_id,
    schemaVersion: 1,
    sessionId: row.session_id,
    status: row.status,
    taskId: row.task_id,
    updatedAt: row.updated_at,
    version: row.version,
  })
}
