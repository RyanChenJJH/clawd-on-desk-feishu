# Feishu Remote Approval Phase 6 Main Lifecycle Log

Date: 2026-06-13

## Scope

This log covers first-version Phase 6 only: wire the Feishu approval runner into the Electron main-process lifecycle and the existing remote approval fan-out provider list.

No second-version features were implemented. This phase does not add completion notifications, Direct Send, multi-approver voting, Feishu Approval API workflow, or app auto-registration.

No real App ID, App Secret, token, receive target, approver ID, or other credential is recorded in this log.

## What Changed

- Added `src/feishu-approval-main.js` as a small main-process adapter around the existing Feishu runner.
- Added `test/feishu-approval-main.test.js` for lifecycle/provider behavior:
  - Disabled config stays stopped and exposes no remote approval provider.
  - Ready config starts the runner and exposes a `feishu` provider.
  - Incomplete config stops an existing runner.
  - Send Test starts the runner and sends a first-version test card through `sendTestCard()`.
- Added `test/feishu-approval-main-wiring.test.js` as a main-source wiring guard, matching existing repository patterns for Electron-heavy `main.js`.
- Added `readCredentialsEnvFile()` to `src/feishu-approval-settings.js` for main-process runner use.
  - Settings UI still uses `readCredentialsInfo()` and receives only masked credential data.
- Updated `src/main.js` to:
  - Create a Feishu approval runtime lazily.
  - Read raw app credentials from `userData/feishu-approval.env` only in the main process.
  - Start or stop the Feishu runner on startup and `feishuApproval` settings changes.
  - Queue runner sync after credential save/delete.
  - Stop the runner during app shutdown.
  - Route `feishuApproval.test` to the real first-version test-card path.
  - Add Feishu to `getRemoteApprovalClients()` only when the runner exposes an enabled provider.
- Updated `test/permission-telegram-approval.test.js` to:
  - Use the same Electron mock style as other permission tests so it can run in a plain Node test process.
  - Cover generic remote provider fan-out with Telegram and Feishu active at the same time.
  - Verify the first explicit decision wins and aborts the other provider.

## Behavior

Default-off behavior is preserved:

- If `feishuApproval.enabled` is false, sync returns `skipped/disabled`.
- No SDK channel is created for default-off or incomplete config.
- No network connection is attempted unless Feishu is enabled and has credentials, recipient, and at least one allowed approver ID.

Provider behavior:

- Telegram remains unchanged.
- When Telegram and Feishu are both active, the existing broker still fans out to all enabled providers and accepts the first explicit decision.
- Feishu enters the provider list only when its runner is started and enabled.

Credential behavior:

- Raw credentials are read only by the main-process runtime helper.
- Raw credentials are not returned to Settings renderer state.
- Credential save/delete triggers runtime resync without logging secret values.

Send Test behavior:

- `feishuApproval.test` now uses the Feishu runtime and `sendTestCard()`.
- The test path remains a first-version test-card path; it does not introduce completion notification or second-version workflow features.

## Guardrails Preserved

- Local permission bubble behavior remains unchanged.
- DND semantics remain unchanged; this phase only adds a provider to the existing fan-out path when active.
- Existing Telegram native/legacy behavior remains unchanged.
- Agent hook behavior remains unchanged.
- Feishu remains modular behind `src/feishu-approval-main.js` and the existing runner.
- SDK usage remains lazy through the runner, so startup does not require Feishu dependencies unless the runner starts.

## Test Results

Passed:

```bash
node --test test\feishu-approval-main.test.js
```

Result: 4 passing tests.

Passed:

```bash
node --test test\feishu-approval-main-wiring.test.js
```

Result: 1 passing test.

Passed:

```bash
node --test test\permission-telegram-approval.test.js
```

Result: 13 passing tests.

Passed:

```bash
node --test test\feishu-approval-settings.test.js
```

Result: 9 passing tests.

Passed focused regression suite:

```bash
node --test test\feishu-approval-main.test.js test\feishu-approval-main-wiring.test.js test\feishu-approval-settings.test.js test\feishu-approval-runner.test.js test\feishu-card-builder.test.js test\remote-approval-broker.test.js test\permission-telegram-approval.test.js test\settings-actions.test.js test\settings-renderer-browser-env.test.js test\telegram-native-runner.test.js
```

Result:

- 382 tests
- 382 passing

## Not Run / Still Pending

- Full `npm test` was not rerun in this phase. Earlier handoff notes say `npm.ps1` is blocked by local PowerShell execution policy and `npm.cmd test` timed out before completing in this environment.
- Real Feishu card QA was not run in this phase. The next closed-loop test still needs a receive target and allowed approver ID in addition to app credentials.

## Next Step

Proceed to the remaining first-version validation work:

- Run syntax/diff checks for the touched files.
- If a real receive target and approver ID are available, run a first-version Feishu Send Test card closed-loop check.
- Keep live permission QA focused on the first-version Allow once / Deny path and the existing first-decision-wins broker behavior.
