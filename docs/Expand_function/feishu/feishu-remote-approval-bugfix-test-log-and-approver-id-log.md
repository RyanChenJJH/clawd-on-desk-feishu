# Feishu Remote Approval Bugfix Log: Send Test Diagnostics and Approver ID Matching

Date: 2026-06-13

## Scope

This log covers a Version 1 follow-up bugfix after real Feishu Send Test cards
were delivered but **Allow once** / **Deny** still appeared to do nothing.

No real App ID, App Secret, open_id, user_id, chat_id, receive_id, token, or
message id values are recorded in this document.

## Symptoms

- The Feishu test card could be delivered.
- Clicking **Allow once** or **Deny** did not visibly complete the Settings
  Send Test flow.
- Settings only showed final success / failure toast information, so it was
  impossible to tell whether Clawd:
  - started the runner,
  - sent the card,
  - received a `cardAction` callback,
  - ignored the callback due to approver mismatch,
  - or never received a callback because Feishu app-side event subscription was
    missing.

## Diagnosis

Two issues were found.

### 1. Approver IDs were treated as AND instead of OR

The Settings copy asks the user to enter at least one allowed approver id. In
practice users may fill both `allowedOpenId` and `allowedUserId`.

The runner previously required every configured id to match the callback event.
The Feishu SDK type marks `operator.userId` as optional. If the callback carried
the correct open id but omitted user id, the runner silently ignored the click.

Correct Version 1 semantics: `allowedOpenId` and `allowedUserId` are alternative
identifiers for the same approval authority. Either matching configured id is
enough to accept the click.

### 2. Send Test had no diagnostic surface

`sendTestCard()` returned only the final status. When the final status was a
timeout, the UI could not distinguish:

- no callback arrived,
- callback payload was not recognized,
- callback arrived for a stale card,
- callback arrived from a non-matching approver,
- or the card failed before waiting for a click.

## Fix

- Changed approver matching so any configured approver id can authorize a
  callback:
  - configured open id matches callback open id -> accepted
  - configured user id matches callback user id -> accepted
  - neither matches -> ignored and logged
- Added Send Test diagnostic logs to `sendTestCard()`.
- Added Settings log panel below the Feishu test row. It appears only after
  **Send test** is clicked.
- Added log entries for:
  - runner start / already running
  - card send attempt
  - card sent and waiting for Allow/Deny
  - callback payload not recognized
  - stale / unknown test card callback
  - approver mismatch
  - allowed callback received
  - timeout with `card.action.trigger` / long-connection hint
  - send failure
- Added fallback parsing for raw `card.action.trigger` context fields:
  - `context.open_message_id`
  - `context.open_chat_id`

## Tests Added / Updated

- `test/feishu-approval-runner.test.js`
  - Accepts callback when any configured approver id matches.
  - Returns diagnostic logs for Send Test.
  - Logs ignored approver callbacks and timeout.
  - Keeps send failures distinct from timeouts while returning logs.
- `test/feishu-card-builder.test.js`
  - Parses raw `card.action.trigger` context fields.
- `test/settings-renderer-browser-env.test.js`
  - Feishu Send Test log i18n keys exist in every Settings language.
  - The Feishu Send Test log panel is absent by default and appears only after a
    test run.

## Validation

Passed:

```bash
node --test test\feishu-approval-runner.test.js test\feishu-card-builder.test.js test\settings-renderer-browser-env.test.js
```

Result:

- 160 tests
- 160 passing

Passed broader Feishu / Settings / broker regression:

```bash
node --test test\feishu-approval-main.test.js test\feishu-approval-main-wiring.test.js test\settings-actions.test.js test\prefs.test.js test\remote-approval-broker.test.js test\permission-telegram-approval.test.js
```

Result:

- 306 tests
- 306 passing

Passed syntax checks:

```bash
node --check src\feishu-approval-runner.js
node --check src\feishu-card-builder.js
node --check src\settings-tab-telegram-approval.js
node --check src\settings-i18n.js
```

## Real QA Guidance

After this fix, run Settings **Send test** again and inspect the log panel.

Expected useful outcomes:

- If the log reaches **Card sent; waiting for Allow/Deny** and then times out,
  Clawd did not receive a Feishu card action callback. Check app-side
  `card.action.trigger` subscription, long-connection event configuration, and
  whether the app is installed in the target chat/tenant.
- If the log says the approver did not match, copy the operator id from a known
  valid source and update the allowed approver field.
- If the log reaches **Received allowed Feishu card action**, the test should
  resolve as allowed or denied.
