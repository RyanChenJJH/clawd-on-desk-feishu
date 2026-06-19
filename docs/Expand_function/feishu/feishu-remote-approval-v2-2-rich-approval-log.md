# Feishu Remote Approval V2-2 Rich Approval Log

Date: 2026-06-13

## Scope

This log covers Version 2 stage V2-2: Feishu rich approval support for existing
permission suggestions.

No completion notification, status command, Doctor diagnostics, multi-recipient
behavior, Direct Send, remote shell, Feishu Approval API workflow, or app
auto-registration was implemented in this stage.

No real App ID, App Secret, open_id, user_id, chat_id, receive_id, token, or
message id is recorded here.

## What Changed

- Added `src/remote-approval/payload.js`.
  - Extracts the shared suggestion label/button builder out of `permission.js`.
  - Keeps existing labels stable: `Always Bash`, `Always deny Read`,
    `Auto edits`, `Plan mode`.
- Updated `src/permission.js`.
  - Continues to include suggestion buttons only for
    `REMOTE_RICH_APPROVAL_AGENT_IDS`.
  - Uses the shared remote approval payload helper.
- Updated `src/feishu-card-builder.js`.
  - Feishu approval cards now render suggestion buttons after `Allow once` and
    `Deny` when the payload includes safe suggestion labels.
  - Suggestion callbacks contain only `type`, `nonce`, `action: "suggestion"`,
    and `index`.
  - Full rule content remains local in the pending permission entry.
- Updated `src/feishu-approval-runner.js`.
  - Passes `payload.suggestions` to the card builder.
  - Records the rendered suggestion indexes per pending approval.
  - Ignores forged suggestion callback indexes that were not present on the
    card.
  - Returns `{ action: "suggestion", index }` for valid authorized suggestion
    clicks.
- Updated `src/remote-approval/broker.js`.
  - Rich suggestion decisions are accepted only from providers whose capability
    declares `supportsRichApproval: true`.
- Updated provider wrappers:
  - `src/remote-approval/providers/telegram-provider.js`
  - `src/remote-approval/providers/feishu-provider.js`

## Guardrails Preserved

- Feishu remains default-off.
- Unsupported agents do not receive rich approval buttons in the remote payload.
- Invalid or forged suggestion indexes do not resolve the permission.
- Telegram rich approval behavior remains covered and unchanged.
- Local permission bubble behavior remains unchanged.
- DND behavior and agent hook protocols were not touched.
- Feishu card callbacks do not carry full permission rule content.

## Validation

Passed:

```bash
node --test test\remote-approval-payload.test.js test\permission-telegram-approval.test.js test\feishu-approval-runner.test.js test\feishu-card-builder.test.js test\remote-approval-broker.test.js
```

Result:

- 41 tests
- 41 passing

## Not Run

Real Feishu rich approval QA was not run in this stage. The implementation is
covered through fake-channel tests and preserves the same callback lifecycle as
the Version 1 Allow once / Deny path.
