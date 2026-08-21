# Pivot Windows external release runbook

This runbook separates source control, binary distribution and Marketplace
publication. `QT7-C23/Pivot` is the public Apache-2.0 source repository.
Signed installers and public auto-update artifacts belong to GitHub Releases
in the same repository. The existing
`Pivot-Marketplace` repository remains responsible only for Marketplace
catalog and package content.

## Release boundary

- A release is initiated only by the manual `Windows external release`
  workflow in the desktop source repository.
- GitHub environment `external-release` must require a human reviewer.
- The workflow receives certificate and publishing authority only from
  GitHub encrypted secrets. No key, certificate password or token belongs in
  this repository, an issue, a release note or an application resource.
- `electron-builder.release.cjs` forces Windows signing and creates a draft
  GitHub release. A missing or invalid certificate must fail the build.
- The public repository lets installed applications read update metadata
  without a GitHub access token.
- A draft is not a delivered release. A human publishes it only after the
  checks below pass.

## One-time operator setup

1. Make `D:\Project\Tiny Agent Code` an independent Git repository. Its Git
   top level must be this exact directory, not `D:\Project`.
2. Create the desktop source repository as **Public** at `QT7-C23/Pivot`.
   Do not initialize it with a README, `.gitignore` or license on GitHub; the
   reviewed local repository already contains those files. Publish only the
   explicitly reviewed source set and keep generated output and secrets out.
3. Do not create a separate release repository or long-lived publishing PAT.
   The protected workflow uses GitHub's short-lived same-repository token with
   explicit `contents: write` permission only for the release job.
4. Choose one supported signing method before purchasing anything:

   - `pfx`: use only when the certificate provider legitimately supplies a
     CI-usable password-protected PFX/P12 under current code-signing key
     protection rules. Back it up outside every Git worktree.
   - `azure`: use Azure Trusted Signing, an Entra application/service principal
     and the `Trusted Signing Certificate Profile Signer` role. No certificate
     private key is stored in GitHub.

   Do not buy an EV USB-token/HSM product for this hosted workflow unless a
   separate self-hosted signing design has first been approved. See the
   [electron-builder Windows signing methods](https://www.electron.build/docs/features/code-signing/code-signing-win/)
   and [CA/Browser Forum requirements](https://cabforum.org/working-groups/code-signing/requirements/).
5. In the source repository, create environment `external-release`, require a
   reviewer, and add the common values:

   GitHub environments, environment secrets and deployment protection rules
   are available for public repositories on current GitHub plans. Required
   reviewers are available for public repositories on GitHub Free, Pro and
   Team. If the account UI does not offer the required reviewer gate, do not
   upload signing authority; stop and use a separately reviewed local signing
   ceremony instead.

   | Kind | Name | Value |
   | --- | --- | --- |
   | Variable | `PIVOT_SIGNING_METHOD` | exactly `pfx` or `azure` |

   For `pfx`, add only:

   | Kind | Name | Value |
   | --- | --- | --- |
   | Secret | `WIN_CSC_LINK` | base64 PFX/P12 content |
   | Secret | `WIN_CSC_KEY_PASSWORD` | PFX/P12 password |

   For `azure`, add only:

   | Kind | Name | Value |
   | --- | --- | --- |
   | Secret | `AZURE_TENANT_ID` | Entra tenant ID |
   | Secret | `AZURE_CLIENT_ID` | signing application client ID |
   | Secret | `AZURE_CLIENT_SECRET` | signing application secret |
   | Variable | `PIVOT_AZURE_ENDPOINT` | Trusted Signing regional endpoint |
   | Variable | `PIVOT_AZURE_ACCOUNT_NAME` | Trusted Signing account name |
   | Variable | `PIVOT_AZURE_CERTIFICATE_PROFILE` | certificate profile name |
   | Variable | `PIVOT_AZURE_PUBLISHER_NAME` | exact certificate publisher DN |

6. Enable GitHub private vulnerability reporting and public Issues on the
   public `Pivot` source repository.

Never paste secret values into Codex, logs, shell history, commits or release
notes. `npm.cmd run release:preflight` verifies presence only and never prints a
value. An unsupported or incomplete signing method fails closed.

## Per-release ceremony

1. Confirm `package.json`, `package-lock.json` and the shared display version
   describe the same Beta version.
2. Commit all intended changes, review the diff, run `npm.cmd run
   verify:beta2`, and make sure the worktree is clean.
3. In GitHub Actions, select `Windows external release`, choose **Run
   workflow**, and enter the exact package version such as `2.0.22-beta`.
4. Approve the protected `external-release` environment only after confirming
   the source commit and version.
5. Wait for tests, the production build, signing, packaged smoke test and
   artifact qualification to pass.
6. Open the draft under `QT7-C23/Pivot` Releases; confirm it contains the x64
   NSIS installer, `.blockmap` and Beta update YAML. GitHub's automatic source
   archives are expected; Pivot tooling must not attach additional source or
   secret-bearing artifacts.
7. Download the installer on a clean Windows account or virtual machine and
   verify it independently:

   ```powershell
   Get-AuthenticodeSignature -LiteralPath '.\Pivot-2.0.22-beta-Windows-x64.exe' |
     Format-List Status,StatusMessage,SignerCertificate,TimeStamperCertificate
   ```

   `Status` must be `Valid`, the publisher must match the purchased
   certificate, and the signature must have a trusted timestamp.
8. Install and run the packaged application. Exercise first launch, BYOK
   provider setup, project open, conversation, terminal, guarded file change,
   settings restart persistence, Marketplace browse/install/update, and
   uninstall/reinstall recovery.
9. Publish the GitHub draft as a prerelease only after all evidence is
   recorded. Never republish different bytes under the same version.

## Previous-version update and rollback qualification

External auto-update is not qualified by checking one fresh installer. It
requires two independently signed versions:

1. Install the previous signed Beta on a clean test machine and create
   representative local settings/session data.
2. Publish the next signed Beta prerelease to the `beta` channel.
3. Use Pivot's user-triggered update action, verify the downloaded signature,
   restart, and confirm data/schema recovery and the new version.
4. Simulate an interrupted or invalid download and confirm Pivot stays on the
   previous working version.
5. Test the documented rollback route by uninstalling the current version and
   installing the retained previous signed installer. Confirm user data is
   either compatible or restored from the tested backup path.
6. Record old/new versions, SHA-256 values, signer, timestamps, result and test
   machine identity in the release evidence.

The first signed Beta establishes the previous-version baseline. The following
signed patch completes the real update/rollback drill; this cannot be replaced
with mocks or an unsigned local package.

## Local qualification commands

Repository-owned configuration only (does not require secrets):

```powershell
npm.cmd run release:preflight -- --repository-only
```

Complete operator preflight (run only in a protected secret-bearing shell or
GitHub environment):

```powershell
npm.cmd run release:preflight
```

Qualify an already generated signed artifact directory:

```powershell
npm.cmd run release:qualify-artifacts
```
