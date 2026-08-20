import { randomBytes } from 'node:crypto'
import type {
  AxisGuardedSafeWriteResult,
} from '../../shared/axis-engine-contracts'
import type { AxisAuthorityAuditPort } from './axis-authority-audit-registry'
import { AxisBlackboardSafeWriteEvidenceRecorder } from './axis-blackboard-safe-write-evidence'
import { AxisCheckpointReceiptIssuer, type AxisCheckpointStorePort } from './axis-checkpoint-receipt-issuer'
import { AxisExecutionAuthorityService } from './axis-execution-authority'
import { AxisExecutionRecoveryCoordinator } from './axis-execution-recovery'
import { AxisExecutionTransactionJournal } from './axis-execution-transaction-journal'
import { AxisExternalFileFingerprintAdapter } from './axis-external-file-fingerprint-adapter'
import type { AxisFileFingerprintPortFactory } from './axis-file-fingerprint-ports'
import { AxisGateEvidenceRegistry } from './axis-gate-evidence-registry'
import { AxisGateRunner, type AxisGateCommandRunPort } from './axis-gate-runner'
import type { AxisGateProfilePort } from './axis-gate-profile-port'
import {
  AxisGuardedSafeWriteHarness,
  type AxisGuardedSafeWriteRequest,
  type AxisRealExecutionFeaturePort,
} from './axis-guarded-safe-write'
import { AxisMainPermissionGrantCollector, type AxisToolPermissionPort } from './axis-permission-grant-collector'
import { AxisPhysicalRollbackExecutor, type AxisCheckpointRollbackStore } from './axis-physical-rollback-executor'
import type { AxisProjectFileIdentityPort } from './axis-file-lease-ports'
import type { AxisFileLeasePortFactory } from './axis-file-lease-ports'
import type { AxisProjectBindingReaderPort } from './axis-project-binding-ports'
import type { AxisGuardedSafeWriteExecutionPort } from './axis-guarded-safe-write-ports'
import { AxisSafeWriteWorker } from './axis-safe-write-worker'
import { AxisSemanticReviewCoordinator } from './axis-semantic-review-coordinator'
import { AxisSemanticReviewEvidenceRegistry } from './axis-semantic-review-evidence-registry'
import { AxisSemanticReviewUsageRegistry } from './axis-semantic-review-usage-registry'
import { AxisSemanticReviewTelemetryService, type AxisSemanticReviewTelemetryReaderPort } from './axis-semantic-review-telemetry-service'
import type { AxisSemanticReviewerPort } from './axis-semantic-review-port'
import { AxisMainSemanticReviewSnapshotAdapter } from './axis-semantic-review-snapshot'
import { SqliteAxisBlackboardStore } from './sqlite-axis-blackboard-store'

type AxisCheckpointRuntimeStore = AxisCheckpointStorePort & AxisCheckpointRollbackStore

export interface AxisProductionGuardedRuntime {
  close(): void
  deleteForSession(sessionId: string): void
  execute(request: AxisGuardedSafeWriteRequest): Promise<AxisGuardedSafeWriteResult>
  openExecutionPort(): AxisGuardedSafeWriteExecutionPort
  openSemanticReviewTelemetryReaderPort(): AxisSemanticReviewTelemetryReaderPort | null
  readonly ready: Promise<void>
}

export interface AxisProductionGuardedRuntimeOptions {
  authorityAudit: AxisAuthorityAuditPort
  checkpoints: AxisCheckpointRuntimeStore
  commandRunner: AxisGateCommandRunPort
  databasePath?: string
  feature: AxisRealExecutionFeaturePort
  fileLeases: AxisFileLeasePortFactory
  gateProfiles: AxisGateProfilePort
  fileFingerprints?: AxisFileFingerprintPortFactory
  identity: AxisProjectFileIdentityPort
  permissions: AxisToolPermissionPort
  projectBindings: AxisProjectBindingReaderPort
  semanticReview?: {
    correctness: AxisSemanticReviewerPort
    security?: AxisSemanticReviewerPort
    timeoutMs?: number
  }
  secrets?: {
    authority?: Uint8Array
    fingerprint?: Uint8Array
  }
}

export function resolveAxisRealExecutionFeature(
  env: Readonly<Record<string, string | undefined>>,
): AxisRealExecutionFeaturePort {
  const value = env['PIVOT_AXIS_REAL_EXECUTION']
  if (value !== undefined && value !== '0' && value !== '1') {
    throw new Error('PIVOT_AXIS_REAL_EXECUTION must be 0 or 1')
  }
  const enabled = value === '1'
  return Object.freeze({
    isRealExecutionEnabled: () => enabled,
  })
}

export function createAxisProductionGuardedRuntime(
  options: AxisProductionGuardedRuntimeOptions,
): AxisProductionGuardedRuntime | null {
  if (!options.feature.isRealExecutionEnabled()) return null

  const databasePath = options.databasePath ?? ':memory:'
  const blackboards = new SqliteAxisBlackboardStore(databasePath)
  const transactions = new AxisExecutionTransactionJournal(databasePath)
  const gateEvidence = new AxisGateEvidenceRegistry(databasePath)
  const semanticReviewEvidence = options.semanticReview
    ? new AxisSemanticReviewEvidenceRegistry(databasePath)
    : null
  const semanticReviewUsage = options.semanticReview
    ? new AxisSemanticReviewUsageRegistry(databasePath)
    : null
  let closed = false

  try {
    const rollback = new AxisPhysicalRollbackExecutor({
      checkpoints: options.checkpoints,
    })
    const fingerprints = options.fileFingerprints
      ?? new AxisExternalFileFingerprintAdapter({
        identity: options.identity,
        projectBindings: options.projectBindings,
        proofSecret: options.secrets?.fingerprint ?? randomBytes(32),
      })
    const authority = new AxisExecutionAuthorityService({
      audit: options.authorityAudit,
      projectBindings: options.projectBindings,
      realExecutionEnabled: () => options.feature.isRealExecutionEnabled(),
      secret: options.secrets?.authority ?? randomBytes(32),
    })
    const harness = new AxisGuardedSafeWriteHarness({
      authority,
      blackboardEvidence: new AxisBlackboardSafeWriteEvidenceRecorder({
        blackboards,
      }),
      checkpointIssuer: new AxisCheckpointReceiptIssuer({
        checkpoints: options.checkpoints,
      }),
      feature: options.feature,
      fileFingerprints: fingerprints,
      fileLeases: options.fileLeases,
      gates: new AxisGateRunner({
        evidence: gateEvidence,
        profiles: options.gateProfiles,
        runner: options.commandRunner,
      }),
      grantCollector: new AxisMainPermissionGrantCollector({
        permissions: options.permissions,
        projectRootForSession: (sessionId) => (
          options.projectBindings.findBySession(sessionId)?.projectRoot ?? null
        ),
      }),
      projectBindings: options.projectBindings,
      rollback,
      semanticReview: options.semanticReview && semanticReviewEvidence
        ? new AxisSemanticReviewCoordinator({
            correctness: options.semanticReview.correctness,
            evidence: semanticReviewEvidence,
            security: options.semanticReview.security,
            timeoutMs: options.semanticReview.timeoutMs,
            usage: semanticReviewUsage ?? undefined,
          })
        : undefined,
      semanticReviewSnapshots: options.semanticReview
        ? new AxisMainSemanticReviewSnapshotAdapter(options.checkpoints)
        : undefined,
      transactions,
      worker: new AxisSafeWriteWorker({
        audit: options.authorityAudit,
        authority,
      }),
    })
    const recovery = new AxisExecutionRecoveryCoordinator({
      journal: transactions,
      rollback,
    })
    const ready = recovery.recoverPending().then(() => undefined)
    const execute = async (
      request: AxisGuardedSafeWriteRequest,
    ): Promise<AxisGuardedSafeWriteResult> => {
      await ready
      const binding = {
        runId: request.runId,
        sessionId: request.sessionId,
      }
      if (!blackboards.getFull(binding)) blackboards.create(binding)
      return harness.execute(request)
    }

    return {
      close() {
        if (closed) return
        closed = true
        gateEvidence.close()
        semanticReviewEvidence?.close()
        semanticReviewUsage?.close()
        transactions.close()
        blackboards.close()
      },
      deleteForSession(sessionId) {
        transactions.deleteForSession(sessionId)
        gateEvidence.deleteForSession(sessionId)
        semanticReviewEvidence?.deleteForSession(sessionId)
        semanticReviewUsage?.deleteForSession(sessionId)
        blackboards.deleteForSession(sessionId)
      },
      execute,
      openExecutionPort() {
        return Object.freeze({ execute })
      },
      openSemanticReviewTelemetryReaderPort() {
        return semanticReviewEvidence && semanticReviewUsage
          ? new AxisSemanticReviewTelemetryService({
              decisions: semanticReviewEvidence.openReaderPort(),
              usage: semanticReviewUsage.openReaderPort(),
            })
          : null
      },
      ready,
    }
  } catch (error) {
    gateEvidence.close()
    semanticReviewEvidence?.close()
    semanticReviewUsage?.close()
    transactions.close()
    blackboards.close()
    throw error
  }
}
