# Pivot Axis reviewed proposal receipt foundation

Status: default-off Main-issued review binding wired into Guarded Safe Write; successful completion evidence UI remains  
Code baseline: Beta-0.1.49 (`0.1.49-beta` package SemVer)

## Scope

This slice binds one model-produced, user-reviewed full-content proposal to the later guarded submission. It closes the stale-review gap between proposal source capture and execution without giving Renderer or Worker a signing key, Fingerprint Port, filesystem capability, database handle or Admin Port.

It remains a default-off guarded workflow behind `PIVOT_AXIS_REAL_EXECUTION=1`. The Receipt is authorization evidence for the reviewed proposal boundary; it does not replace Permission, Lease, Checkpoint, Execution Authority, Gate or rollback.

## Contracts and Ports

`src/shared/axis-reviewed-proposal-contracts.ts` defines a strict short-lived Receipt containing:

- Main issuer, schema version, receipt/proposal identity and issue/expiry time;
- project/run/session/task ownership and authoritative expected Run revision;
- exact file identity and project-relative path;
- the complete review-time existing/missing Fingerprint state;
- SHA-256 of each exact proposed replacement content;
- HMAC-SHA-256 signature.

Unknown fields and forged root, authority, command or sibling proof fields are rejected. File keys, paths and project-relative paths must each be unique.

Main consumers depend on:

- `AxisReviewedProposalReceiptIssuerPort` for pre-model baseline capture and post-model issuance;
- `AxisReviewedProposalReceiptVerifierPort` for submission verification;
- `AxisVerifiedReviewedProposal` for the narrow internal claims passed to the execution Port.

Only `createAxisGuardedIpcRuntime` constructs `AxisExternalFileFingerprintAdapter` and `AxisReviewedProposalReceiptService`. It shares the same Fingerprint adapter with the production guarded runtime while exposing only a frozen issuer Port to proposal composition and a verifier Port to submission composition.

## Ordering

Proposal:

`authoritative Run/task/project → Fingerprint baseline capture → bounded source read and cross-check → proposal-only model → atomic usage accounting → strict exact proposal → baseline re-verification → Main Receipt issuance`

Submission and execution:

`strict IPC → Receipt signature/time/ownership/revision/content validation → current full Fingerprint recapture → baseline compare → atomic Task claim → Permission → Lease acquire → Fingerprint capture → Receipt baseline compare → Checkpoint → Execution Authority → coordination reverify → transaction/write`

The first compare rejects already-stale reviews before Task claim or permission. The second compare closes the race between pre-claim verification and post-Lease capture; a mismatch releases acquired Leases and creates no Checkpoint, transaction or Worker write.

## Failure evidence

Real filesystem tests reject:

- modified content;
- deletion;
- creation of a target reviewed as missing;
- same-content physical replacement;
- edited proposed content;
- stale Run revision or cross-session/task ownership;
- expired or tampered Receipt.

Registered Main-handler tests obtain a real model proposal and HMAC Receipt before testing permission, rollback, recovery and cleanup behavior. A production-build Electron test changes the reviewed file after Diff Review and proves:

- no permission request appears;
- the Run remains `planned`;
- the Task remains `pending`;
- the external content is preserved.

## Explicit non-delivery

- The feature remains default-off and requires explicit proposal review and approval.
- No successful completion evidence UI or Blackboard evidence presentation exists.
- No packaged release-process E2E was generated.
- Gate commands remain Main-fixed; trusted per-project Gate profile discovery is separate.
- Dynamic Pivot action handlers and autonomous guarded execution remain separate slices.

## Verification

- `tests/shared/axis-reviewed-proposal-contracts.test.ts`
- `tests/shared/axis-reviewed-proposal-boundaries.test.ts`
- `tests/main/axis-reviewed-proposal-receipt.test.ts`
- `tests/main/axis-safe-write-proposal.test.ts`
- `tests/main/axis-guarded-safe-write-submission.test.ts`
- `tests/main/axis-guarded-safe-write.test.ts`
- `tests/main/axis-production-guarded-runtime.test.ts`
- `tests/main/axis-guarded-ipc-system.test.ts`
- `tests/renderer/axis-shadow-store.test.ts`
- `tests/renderer/axis-guarded-write-approval.test.ts`
- `tests/e2e/pivot-core-flows.spec.ts`

Beta-0.1.48 verification: 138 test files / 562 tests, TypeScript, production build, performance budget, Electron native dependency check and both guarded Electron paths pass. No installer or portable package was generated.
