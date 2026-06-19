# Feishu Remote Approval Phase 2 Broker Log

Date: 2026-06-13

## Scope

This log covers first-version Phase 2: introduce a thin, generic remote approval broker so Telegram and future Feishu providers can run concurrently with first-decision-wins semantics.

No Feishu runtime, settings, UI, credential storage, or permission card sending was implemented in this phase. No second-version features were implemented.

## What Changed

- Added `src/remote-approval-broker.js`.
- Added `test/remote-approval-broker.test.js`.
- Updated `src/permission.js` to call the broker instead of directly calling one Telegram client.
- Updated `src/main.js` to expose `getRemoteApprovalClients()` to the permission module.

## Behavior

The broker now owns provider fan-out:

- Sends the same summary-only approval payload to every enabled remote approval provider.
- Resolves only the first explicit valid decision.
- Aborts all other providers once a decision wins.
- Ignores late provider decisions after local/remote resolution.
- Logs provider request failures without auto-allowing or auto-denying.
- Skips disabled, malformed, or absent providers.

`permission.js` still owns permission semantics:

- `isRemoteApprovalActionable()` remains unchanged.
- Summary-only payload construction remains unchanged.
- Local permission bubble remains primary and unchanged.
- DND/headless/native fallback behavior remains unchanged.
- Rich suggestion decisions are accepted only for agents already allowed by `REMOTE_RICH_APPROVAL_AGENT_IDS`.
- Unsupported or invalid rich suggestion decisions do not win the broker race, so another provider can still return Allow/Deny.

`main.js` currently returns only Telegram as a remote approval provider. This is intentional: Feishu provider wiring starts in the later runner/settings phases after the real SDK spike is verified with credentials.

## Test Results

Passed:

```bash
node --test test\remote-approval-broker.test.js
```

Result: 6 passing tests.

Passed:

```bash
node --test test\remote-approval-broker.test.js test\feishu-sdk-spike.test.js test\telegram-approval-settings.test.js test\telegram-native-runner.test.js
```

Result: 57 passing tests, 1 skipped POSIX-only test.

Passed syntax checks:

```bash
node --check src\permission.js
node --check src\main.js
```

Still blocked:

- `test\permission-telegram-approval.test.js` still cannot run in this environment because local `node_modules/electron` is missing its downloaded binary (`path.txt` absent).
- Full `npm test` remains blocked by the same Electron installation issue.

## Next Step

Proceed to first-version Phase 3: add Feishu settings normalization and credential-file helpers, still default-off and still without starting a real Feishu approval runner.
