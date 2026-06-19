# Feishu Remote Approval V2-3 Completion Notification Log

Date: 2026-06-13

## Scope

This log covers Version 2 stage V2-3: optional Feishu / Lark completion
notifications for finished live sessions.

No Doctor diagnostics, multi-recipient behavior, Direct Send, remote shell,
Feishu Approval API workflow, app auto-registration, or token/credential UX
change was implemented in this stage.

No real App ID, App Secret, open_id, user_id, chat_id, receive_id, token, or
message id is recorded here.

## What Changed

- Updated `src/feishu-approval-settings.js`.
  - `notifyOnComplete` is now a real persisted boolean instead of being forced
    to `false`.
  - Added `completionOutputMode`, defaulting to `"off"`.
  - Accepts `"full"` and maps legacy `"tail"` to `"full"`.
- Updated `src/feishu-approval-runner.js`.
  - Added `sendNotification(text)` for plain Feishu / Lark completion messages.
  - The method is default-off, requires the runner to be active, and reports
    delivery failures without throwing.
- Updated `src/feishu-approval-main.js`.
  - Exposes the runner `sendNotification` surface through the main Feishu
    client.
- Added `src/remote-approval/completion-notifier.js`.
  - Reuses the existing completion dedupe / formatting / redaction logic behind
    a generic remote-approval notifier wrapper.
- Updated `src/main.js`.
  - Wires a Feishu completion companion into session snapshot fanout.
  - Sends only when Feishu approval is enabled, `notifyOnComplete` is true, and
    an active Feishu client exposes `sendNotification`.
- Updated `src/settings-tab-telegram-approval.js`.
  - Preserves Feishu completion fields across recipient and enable saves.
  - Adds a Feishu completion notification switch.
  - Adds a Feishu completion output selector with confirmation before enabling
    full assistant output.
- Updated `src/settings-i18n.js`.
  - Adds Feishu completion setting copy for all settings languages.

## Guardrails Preserved

- Feishu completion notifications remain default-off.
- Feishu approval must still be enabled and active before completion messages
  are sent.
- Telegram completion notifications and Direct Send were not routed through the
  new Feishu path.
- Local permission bubble behavior is unchanged.
- DND behavior and agent hook protocols were not touched.
- Remote notification delivery failure does not allow, deny, or otherwise
  resolve a permission request.
- Full assistant output requires explicit confirmation in Settings.

## Validation

Passed:

```bash
node --test test\remote-approval-payload.test.js test\permission-telegram-approval.test.js test\feishu-approval-runner.test.js test\feishu-card-builder.test.js test\remote-approval-broker.test.js test\feishu-approval-settings.test.js test\prefs.test.js test\settings-actions.test.js test\feishu-approval-main.test.js test\feishu-approval-main-wiring.test.js test\completion-notify-integration.test.js test\settings-renderer-browser-env.test.js
```

Result:

- 488 tests
- 488 passing

## Not Run

Real Feishu / Lark completion notification QA was not run in this stage. The
implementation is covered through fake-channel runner tests, main-process
wiring checks, state snapshot integration tests, and Settings renderer tests.
