# Preview security contract

Pivot Preview is a bounded browser surface for web development output. It is not a general-purpose browser and it does not inherit Pivot's Main or preload capabilities.

## URL boundary

- Remote content must use HTTPS.
- Cleartext HTTP is accepted only for loopback development hosts: `localhost`, `127.0.0.1`, and `::1`.
- `file:`, `javascript:`, `data:`, credentials embedded in URLs, and every other protocol are rejected before navigation and before external opening.
- Bare loopback addresses default to HTTP; ordinary hostnames default to HTTPS.

## Guest boundary

- Preview guests use the isolated `pivot-preview` Electron session partition.
- Node integration, worker/subframe Node integration, renderer-controlled preload, experimental features, insecure mixed content, and disabled web security are all rejected in Main.
- `will-attach-webview` validates the partition and initial URL before attachment.
- Permission checks and permission requests are denied by default; downloads and popup windows are blocked.
- Redirects and in-page navigation remain inside the same HTTPS-or-loopback URL policy.
- The only host action is the exact-field `preview:open-external` IPC contract, which repeats URL validation in Main before calling the system browser.

## Ownership

| Responsibility | Owner |
|---|---|
| URL normalization and allow policy | `src/shared/preview-url.ts` |
| Guest preference, session, and navigation enforcement | `src/main/services/preview-security.ts` |
| Typed external-open contract | `src/shared/types/ipc.ts` + `src/shared/ipc-validation.ts` |
| Navigation and device UI | `src/renderer/components/preview-workspace.tsx` |

Electron currently recommends considering alternatives to `<webview>` because its Chromium architecture is changing. Pivot keeps the integration behind these local contracts so a future migration to `WebContentsView` does not change the user-facing Preview workflow.
