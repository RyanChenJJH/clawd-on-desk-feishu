# Feishu Remote Approval Phase 3 Settings Log

Date: 2026-06-13

## Scope

This log covers first-version Phase 3: add Feishu approval settings normalization, credentials-file helpers, and Settings command hooks without starting any Feishu network runner.

No Feishu WebSocket/channel runtime, no Settings UI card, no permission-chain Feishu provider, and no second-version features were implemented in this phase.

## What Changed

- Added `src/feishu-approval-settings.js`.
- Added `test/feishu-approval-settings.test.js`.
- Updated `src/prefs.js` to add a default-off `feishuApproval` prefs object and bump prefs version from 11 to 12.
- Updated `test/prefs.test.js` to cover Feishu defaults and normalization.
- Updated `src/settings-actions.js` to expose Feishu approval config and credential commands through the existing settings action system.
- Updated `test/settings-actions.test.js` to cover those commands.
- Updated `src/main.js` with Feishu credential/status helper functions used by settings actions.

## Behavior

Feishu approval remains disabled by default:

- `enabled: false`
- `region: "feishu"`
- `receiveIdType: "chat_id"`
- `receiveId: ""`
- `allowedOpenId: ""`
- `allowedUserId: ""`
- `notifyOnComplete: false`

The MVP keeps `notifyOnComplete` forced to `false`; completion notification is reserved for later and is not part of the first version.

Credential storage follows the Telegram pattern: app secrets are not stored in prefs. The helper writes `CLAWD_FEISHU_APP_ID` and `CLAWD_FEISHU_APP_SECRET` to `userData/feishu-approval.env`; status checks only inspect file existence and mtime, and credential info returns only the app id plus a masked secret.

Settings commands added:

- `feishuApproval.setCredentials`
- `feishuApproval.deleteCredentialsFile`
- `feishuApproval.status`
- `feishuApproval.credentialsInfo`
- `feishuApproval.test`

`feishuApproval.test` is intentionally a safe stub for now. In Phase 3 it reports that the real runner is not wired yet and points operators to the Phase 1 spike script. This avoids hidden network behavior before the runner lifecycle and UI phases are ready.

## Guardrails Preserved

- Feishu remains default-off and does not start any network connection.
- Telegram remote approval behavior is not changed by this phase.
- Local permission bubble, DND behavior, and agent hook behavior are not changed by this phase.
- Feishu credentials are kept out of persisted prefs.
- Second-version behaviors such as completion notification and direct send are not implemented.

## Test Results

Passed:

```bash
node --test test\feishu-approval-settings.test.js
```

Result: 8 passing tests.

Passed previously in the same focused set:

```bash
node --test test\feishu-approval-settings.test.js test\prefs.test.js test\settings-actions.test.js
```

Result before the ASCII mask refinement: 289 passing tests.

Still blocked:

- `test\permission-telegram-approval.test.js` cannot run in this environment because local `node_modules/electron` is missing its downloaded binary (`path.txt` absent).
- Full `npm test` remains blocked by the same Electron installation issue.

## Next Step

Proceed to first-version Phase 4: add a modular Feishu approval runner and card builder with fake-channel tests before wiring it into `main.js` or the live permission path.
