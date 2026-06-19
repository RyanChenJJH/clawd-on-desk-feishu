# Feishu Remote Approval Phase 4 Runner Log

Date: 2026-06-13

## Scope

This log covers first-version Phase 4: add a modular Feishu approval card builder and runner, verified through fake-channel tests.

The runner is not wired into `main.js` or the live permission path yet. Feishu remains default-off, no Feishu network connection is started by existing application startup, and no second-version features were implemented.

## What Changed

- Added `src/feishu-card-builder.js`.
- Added `src/feishu-approval-runner.js`.
- Added `test/feishu-card-builder.test.js`.
- Added `test/feishu-approval-runner.test.js`.
- Added `test/fakes/feishu-channel.js`.

## Behavior

The card builder now owns Feishu MVP card shape:

- Builds v2 interactive cards with `schema: "2.0"`.
- Renders only first-version actions: `Allow once` and `Deny`.
- Encodes callbacks as `clawd:approval:<nonce>:allow|deny`.
- Parses SDK `cardAction` event shape into nonce, action, message id, chat id, open id, and user id.
- Builds button-free resolved cards for allowed, denied, or expired states.

The runner now exposes the Phase 4 API:

- `isEnabled()`
- `start()`
- `stop()`
- `requestApproval(payload, { signal })`
- `sendTestCard()`
- `getStatus()`

Runner behavior covered by fake-channel tests:

- Starts only when Feishu config is enabled and credentials, recipient, and allowed approver are present.
- Sends the approval card to the configured `receiveId` using the configured `receiveIdType`.
- Resolves matching authorized callbacks to `{ action: "allow" }` or `{ action: "deny" }`.
- Ignores unauthorized clicks and waits for an authorized callback.
- Resolves `null` on timeout, abort, send failure, or stop.
- Clears pending approvals on stop.
- Best-effort updates the card to a button-free resolved/expired state.
- Provides an SDK channel factory that lazy-builds `createLarkChannel({ transport: "websocket" })` without connecting it during construction.

## Guardrails Preserved

- No `main.js` runtime wiring was added in this phase.
- Existing Telegram provider behavior is unchanged.
- Existing local permission bubble behavior is unchanged.
- Existing DND and agent hook behavior is unchanged.
- No completion notification, Direct Send, multi-approver voting, or other second-version capability was added.

## Test Results

Passed:

```bash
node --test test\feishu-approval-runner.test.js test\feishu-card-builder.test.js
```

Result: 11 passing tests.

Passed focused regression suite:

```bash
node --test test\feishu-card-builder.test.js test\feishu-approval-runner.test.js test\feishu-approval-settings.test.js test\prefs.test.js test\settings-actions.test.js test\remote-approval-broker.test.js test\feishu-sdk-spike.test.js test\telegram-approval-settings.test.js test\telegram-native-runner.test.js
```

Result: 359 tests, 358 passing, 1 skipped POSIX-only test.

Passed syntax checks:

```bash
node --check src\feishu-card-builder.js
node --check src\feishu-approval-runner.js
node --check src\feishu-approval-settings.js
node --check src\main.js
node --check src\permission.js
node --check src\prefs.js
node --check src\settings-actions.js
```

Full-suite status:

- `npm test` in PowerShell is blocked by the local execution policy for `npm.ps1`.
- `npm.cmd test` was attempted with a 300 second timeout. It did not show a test failure before the tool timeout, but the full suite did not complete in this environment.
- `node --test test\permission-telegram-approval.test.js` is still blocked by the local Electron package installation: `node_modules/electron/index.js` reports `Electron failed to install correctly` because the Electron binary/path metadata is missing.

## Next Step

Proceed to first-version Phase 5: add Settings UI and i18n for Feishu configuration and test-card controls, still keeping the live permission path unwired until the UI and runner lifecycle are ready.
