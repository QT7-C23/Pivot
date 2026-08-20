# Application update release channel

This document is the stable entry point for Pivot's desktop update path.

## Ownership and contract

- `ApplicationUpdateService` is the only owner of `electron-updater` in Electron Main.
- Renderer code receives `ApplicationUpdateState` through the exact `update:*` IPC contract and the `update:state` signal. It never imports or configures the updater directly.
- The state machine is `unavailable → idle → checking → available → downloading → downloaded`, with `up-to-date` and retryable `error` outcomes.
- `autoDownload` is disabled. Check, download, and restart-to-install are separate user actions in Settings → About.

## Release metadata gate

Pivot enables updates only in a packaged application that contains `resources/app-update.yml`. Electron Builder creates that file when a publish provider is configured. Development builds, directory/portable builds without metadata, and the current local NSIS build report `unavailable` and do not contact a feed.

The application intentionally does not call `setFeedURL`. Release provider configuration belongs to Electron Builder's publish metadata so generated channel files and artifacts stay consistent.

## Release operator checklist

1. Configure an Electron Builder publish provider and credentials in the release environment; do not commit credentials.
2. Provide a Windows code-signing certificate and production application icon.
3. Build and publish the installer plus its generated update metadata to the same release.
4. Test check, download, and restart installation from the previous signed version against a staged channel.
5. Confirm failures remain retryable and no download starts before explicit user action.

Until those external release inputs exist, the honest supported behavior is the localized “release channel not configured” state.
