# Feishu Remote Approval Phase 5 Settings UI Log

Date: 2026-06-13

## Scope

This log covers first-version Phase 5 only: add Feishu Remote Approval controls to the existing Settings Remote Approval tab and add settings i18n.

No second-version features were implemented. The Feishu runner is still not wired into `main.js`, and live permission requests are still not fanned out to Feishu in this phase.

## What Changed

- Updated `src/settings-tab-telegram-approval.js` to append a Feishu channel card between Telegram and Hardware Buddy on the Remote Approval tab.
- Added Feishu UI sections:
  - App credentials: App ID, App Secret, save/replace/delete credentials.
  - Recipient: region, receive ID type, receive ID, allowed open ID, allowed user ID.
  - Enable & Test: default-disabled enable switch and Send Test button.
- Wired the UI to the existing Phase 3 settings commands:
  - `feishuApproval.status`
  - `feishuApproval.credentialsInfo`
  - `feishuApproval.setCredentials`
  - `feishuApproval.deleteCredentialsFile`
  - `feishuApproval.test`
- Preserved first-version MVP boundaries:
  - `notifyOnComplete` is always written as `false`.
  - No rich approval buttons.
  - No completion notification controls.
  - No Direct Send controls.
  - No live permission fan-out.
- Updated `src/settings-i18n.js` with Feishu Settings copy for:
  - `en`
  - `zh`
  - `zh-TW`
  - `ko`
  - `ja`
- Updated `test/settings-renderer-browser-env.test.js` with focused browser-env coverage for the Feishu card.

## Behavior

The Feishu card is default-off and incomplete until credentials, recipient, and at least one allowed approver ID are configured.

Credential behavior:

- The renderer only requests masked credential info.
- Saving credentials sends the raw App Secret only through the existing `feishuApproval.setCredentials` command.
- After save, the raw App Secret is cleared from inputs and the card renders only the masked secret.
- Deleting credentials calls `feishuApproval.deleteCredentialsFile`.

Recipient/config behavior:

- Saves only the `feishuApproval` settings key.
- Does not write to `tgApproval`.
- Keeps `notifyOnComplete: false`.
- Preserves the current Feishu enabled flag when saving recipient fields.

Enable/Test behavior:

- Enable and Send Test are disabled until Feishu credentials, receive ID, and approver ID are configured.
- Send Test calls only `feishuApproval.test`; it is still a test-card/settings command path, not the live permission path.

## Guardrails Preserved

- Telegram Settings behavior was not migrated or rewritten.
- Hardware Buddy remains on the Remote Approval tab after Feishu.
- Local permission bubble, DND, and agent hook behavior are not changed.
- Feishu remains default-off.
- No app secret is stored in prefs or intentionally rendered back into the DOM after save.
- No second-version capability was added.

## Test Results

Passed:

```bash
node --test --test-name-pattern "Feishu" test\settings-renderer-browser-env.test.js
```

Result: 5 passing tests.

Passed:

```bash
node --test test\settings-renderer-browser-env.test.js
```

Result: 141 passing tests.

Passed focused regression suite:

```bash
node --test test\settings-renderer-browser-env.test.js test\feishu-approval-settings.test.js test\feishu-approval-runner.test.js test\feishu-card-builder.test.js test\prefs.test.js test\settings-actions.test.js test\remote-approval-broker.test.js test\telegram-approval-settings.test.js test\telegram-native-runner.test.js
```

Result:

- 490 tests
- 489 passing
- 1 skipped POSIX-only test

Passed syntax checks:

```bash
node --check src\settings-tab-telegram-approval.js
node --check src\settings-i18n.js
node --check test\settings-renderer-browser-env.test.js
```

Passed:

```bash
git diff --check
```

Only LF/CRLF warnings were printed, matching the existing Windows workspace behavior noted in earlier handoffs.

## Not Run / Still Pending

- Full `npm test` was not rerun in this phase. Earlier handoff notes say `npm.ps1` is blocked by local PowerShell execution policy and `npm.cmd test` timed out before completing in this environment.
- Real Feishu App ID/App Secret QA was not run because no real credentials were provided.
- `main.js` runner lifecycle wiring and live permission fan-out remain Phase 6 work.

## Next Step

Proceed to first-version Phase 6:

- Initialize the Feishu runner in `main.js`.
- Read credentials from `userData/feishu-approval.env`.
- Start/stop the runner based on readiness.
- Add Feishu to `getRemoteApprovalClients()` only when enabled and ready.
- Keep Telegram, local permission bubble, DND, and hook behavior unchanged.
