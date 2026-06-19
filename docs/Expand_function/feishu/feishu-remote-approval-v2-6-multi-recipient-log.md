# Feishu Remote Approval V2-6 Multi-Recipient Log

Date: 2026-06-13

## Scope

This log covers Version 2 stage V2-6: optional multi-recipient and
multi-approver support for Feishu / Lark remote approval.

No Direct Send, remote shell, Feishu Approval API workflow, app
auto-registration, or token/credential UX change was implemented in this
stage.

No real App ID, App Secret, open_id, user_id, chat_id, receive_id, token, or
message id is recorded here.

## What Changed

- Updated `src/feishu-approval-settings.js`.
  - Added optional `feishuApproval.recipients`.
  - Each recipient entry contains only:
    - `receiveIdType`
    - `receiveId`
    - `allowedOpenId`
    - `allowedUserId`
  - Existing single-recipient fields continue to work and are mapped to one
    effective recipient when `recipients` is empty.
  - Normalization strips unsupported fields, including credential-shaped
    values.
  - Readiness checks now accept either the legacy single-recipient fields or a
    valid `recipients[]` entry.
- Updated `src/feishu-approval-runner.js`.
  - Approval cards are sent to all effective recipients.
  - A request remains pending when at least one recipient send succeeds.
  - A request resolves as expired/null only when all recipient sends fail,
    timeout, abort, or shutdown occurs.
  - Any configured approver from any effective recipient can allow, deny, or
    select a suggestion.
  - Unauthorized approvers are still ignored.
  - Resolved approval cards are updated across all known delivered message ids.
  - Completion notifications now send to all effective recipients when enabled.
- Updated `src/settings-tab-telegram-approval.js`.
  - Settings UI still edits the legacy single-recipient fields.
  - If `recipients[]` exists in the snapshot, save paths preserve it so a user
    or future UI can configure multi-recipient behavior without the current UI
    deleting it.
- Updated prefs and settings tests.
  - Default Feishu config now includes `recipients: []`.
  - Persisted Feishu config can round-trip recipient entries without storing app
    credentials.

## Compatibility Strategy

- Old config remains valid:

```json
{
  "receiveIdType": "chat_id",
  "receiveId": "oc_example",
  "allowedOpenId": "ou_example",
  "allowedUserId": ""
}
```

- New config is optional and additive:

```json
{
  "recipients": [
    {
      "receiveIdType": "chat_id",
      "receiveId": "oc_example",
      "allowedOpenId": "ou_example",
      "allowedUserId": ""
    },
    {
      "receiveIdType": "open_id",
      "receiveId": "ou_target_example",
      "allowedOpenId": "",
      "allowedUserId": "u_example"
    }
  ]
}
```

The ids above are placeholders, not real Feishu/Lark identifiers.

## Guardrails Preserved

- Feishu approval remains default-off.
- Existing single-recipient behavior remains supported.
- Local permission bubble behavior is unchanged.
- DND behavior is unchanged.
- Telegram approval behavior is unchanged.
- Agent hook protocols were not touched.
- Multi-recipient sending does not auto-approve or auto-deny a request.
- Unauthorized Feishu/Lark users are still ignored.
- No credentials are stored in prefs, docs, or tests.

## TDD Slices

### Settings Schema

Red:

```bash
node --test test\feishu-approval-settings.test.js
```

Initial result: failed because `recipients[]` was not normalized, validated, or
included in readiness/redaction helpers.

Green:

- Added recipient normalization.
- Added recipient validation.
- Added effective-recipient resolution.
- Added redaction-secret extraction for recipient entries.

### Runner Multi-Recipient Approval

Red:

```bash
node --test test\feishu-approval-runner.test.js
```

Initial result: failed because approval cards were sent only to the legacy
single `receiveId`.

Green:

- Sent approval cards to all effective recipients.
- Accepted a matching open_id or user_id from any configured recipient.
- Updated resolved cards for every known delivered card message.

### Completion Notification Fan-Out

Added runner coverage proving completion notifications fan out to every
effective recipient when `notifyOnComplete=true`.

### Settings UI Preservation

Red:

```bash
node --test test\settings-renderer-browser-env.test.js
```

Initial result: failed because the recipient save button manually built a
payload and omitted `recipients[]`.

Green:

- Preserved existing `recipients[]` through Settings save paths.
- Kept the visible UI focused on the legacy fields for this stage.

## Validation

Passed focused V2-6 regression:

```bash
node --test test\feishu-approval-settings.test.js test\feishu-approval-runner.test.js test\settings-renderer-browser-env.test.js test\prefs.test.js test\settings-actions.test.js test\feishu-approval-main.test.js test\feishu-approval-runtime-status.test.js
```

Result:

- 464 tests
- 464 passing

Passed syntax checks for touched runtime files:

```bash
node --check src\feishu-approval-settings.js
node --check src\feishu-approval-runner.js
node --check src\settings-tab-telegram-approval.js
node --check src\feishu-approval-main.js
node --check src\doctor-report.js
node --check src\doctor.js
node --check src\doctor-ipc.js
node --check src\main.js
```

