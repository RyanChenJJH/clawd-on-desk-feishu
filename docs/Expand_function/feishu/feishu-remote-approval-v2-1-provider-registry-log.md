# Feishu Remote Approval V2-1 Provider Registry Log

Date: 2026-06-13

## Scope

This log covers Version 2 stage V2-1: introduce the remote approval module
directory and provider registry while preserving Version 1 behavior.

No rich approval, completion notification, status command, Doctor diagnostics,
multi-recipient behavior, remote shell, Direct Send, or Feishu Approval API flow
was implemented in this stage.

No real App ID, App Secret, open_id, user_id, chat_id, receive_id, token, or
message id is recorded here.

## TDD Slices

### Provider Registry

Red:

```bash
node --test test\remote-approval-provider-registry.test.js
```

Initial result: failed because `src/remote-approval/provider-registry.js` did
not exist.

Green:

- Added `src/remote-approval/provider-registry.js`.
- Added `src/remote-approval/providers/telegram-provider.js`.
- Added `src/remote-approval/providers/feishu-provider.js`.
- Added `test/remote-approval-provider-registry.test.js`.

Covered behavior:

- Telegram and Feishu clients are exposed through the same provider interface.
- Disabled or missing providers are skipped.
- Provider requests remain lazy and delegate to the existing channel clients.

### Broker Directory Migration

Red:

```bash
node --test test\remote-approval-broker.test.js
```

Initial result: failed after moving the test import to
`src/remote-approval/broker.js`, because the new module did not exist.

Green:

- Added `src/remote-approval/decision.js`.
- Added `src/remote-approval/broker.js`.
- Kept `src/remote-approval-broker.js` as a compatibility shim.
- Updated `test/remote-approval-broker.test.js` to use the new module path.

Covered behavior remained unchanged:

- Provider fan-out.
- First explicit decision wins.
- Abort of losing providers.
- Late decision ignored.
- Provider failures logged without auto-allow or auto-deny.

### Main / Permission Thin Wiring

Red:

```bash
node --test test\feishu-approval-main-wiring.test.js
```

Initial result: failed after the wiring guard required provider registry usage.

Green:

- Updated `src/main.js` so `getRemoteApprovalClients()` composes Telegram and
  Feishu through the provider registry.
- Updated `src/permission.js` to use the new broker path and use the provider
  registry for the legacy Telegram fallback path.
- Kept Feishu default-off behavior and existing runtime readiness checks.

### Safe Status Summary

Red:

```bash
node --test test\remote-approval-status.test.js
```

Initial result: failed because `src/remote-approval/status.js` did not exist.

Green:

- Added `src/remote-approval/status.js`.
- Added `test/remote-approval-status.test.js`.

Covered behavior:

- Remote approval status summaries include only safe fields.
- Raw provider fields such as token, recipient id, or app secret are not copied
  into the summary object.

## Files Added

- `src/remote-approval/broker.js`
- `src/remote-approval/decision.js`
- `src/remote-approval/provider-registry.js`
- `src/remote-approval/status.js`
- `src/remote-approval/providers/telegram-provider.js`
- `src/remote-approval/providers/feishu-provider.js`
- `test/remote-approval-provider-registry.test.js`
- `test/remote-approval-status.test.js`

## Files Updated

- `src/main.js`
- `src/permission.js`
- `src/remote-approval-broker.js`
- `test/remote-approval-broker.test.js`
- `test/feishu-approval-main-wiring.test.js`

## Guardrails Preserved

- Feishu remains default-off.
- Telegram approval behavior remains on the same underlying runner/sidecar
  clients.
- Local permission bubble behavior remains unchanged.
- DND behavior remains unchanged.
- Existing agent hook protocols were not touched.
- The old broker import path remains available as a compatibility shim.
- New provider wrappers do not start network connections by themselves.

## Validation

Passed focused V2-1 regression:

```bash
node --test test\remote-approval-provider-registry.test.js test\remote-approval-status.test.js test\remote-approval-broker.test.js test\permission-telegram-approval.test.js test\feishu-approval-main.test.js test\feishu-approval-main-wiring.test.js test\feishu-approval-runner.test.js test\feishu-card-builder.test.js
```

Result:

- 43 tests
- 43 passing

Passed wider Version 1 / Version 2 targeted regression:

```bash
node --test test\feishu-approval-runner.test.js test\feishu-card-builder.test.js test\settings-renderer-browser-env.test.js test\feishu-approval-main.test.js test\feishu-approval-main-wiring.test.js test\settings-actions.test.js test\prefs.test.js test\remote-approval-broker.test.js test\remote-approval-provider-registry.test.js test\remote-approval-status.test.js test\permission-telegram-approval.test.js
```

Result:

- 468 tests
- 468 passing

Passed syntax checks:

```bash
node --check src\remote-approval\broker.js
node --check src\remote-approval\decision.js
node --check src\remote-approval\provider-registry.js
node --check src\remote-approval\status.js
node --check src\remote-approval\providers\telegram-provider.js
node --check src\remote-approval\providers\feishu-provider.js
node --check src\main.js
node --check src\permission.js
```

Passed:

```bash
git diff --check
```

Result: no whitespace errors. Git printed only the existing Windows line-ending
warnings.

## Not Run

Full `npm test` was not rerun in this stage. Previous Phase 8 notes recorded
that `npm.cmd test` timed out after 300 seconds in this environment without
visible failures before the timeout.

Real Feishu QA was not rerun because this stage only moves remote approval
module boundaries and provider wrappers; it does not change Feishu card sending
or callback parsing behavior.
