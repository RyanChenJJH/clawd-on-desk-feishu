# Feishu Remote Approval V2-0 Checkpoint Log

Date: 2026-06-13

## Scope

This checkpoint starts Version 2 after the Version 1 Phase 1-8 work and the
post-Phase 8 Send Test callback bugfixes.

No Version 2 product capability was implemented in this checkpoint. No real App
ID, App Secret, open_id, user_id, chat_id, receive_id, token, or message id is
recorded here.

## Documents Reviewed

- `temp/feishu-remote-approval-v2-handoff.md`
- `docs/Expand_function/feishu/feishu-remote-approval-development-plan.md`
- `docs/Expand_function/feishu/feishu-remote-approval-stage-plan.md`
- `docs/Expand_function/feishu/feishu-remote-approval-v2-development-plan.md`
- `docs/Expand_function/feishu/feishu-remote-approval-v2-stage-plan.md`
- Version 1 phase logs 1-8
- Version 1 post-phase bugfix logs for card callbacks, Settings layout, Send
  Test diagnostics, and approver-id matching

## Version 1 Status

Version 1 remains the baseline:

- Feishu approval uses a self-built app bot, SDK long connection/WebSocket, and
  interactive cards.
- The MVP supports only `Allow once` and `Deny`.
- Telegram and Feishu may both be enabled; the first explicit decision wins.
- Feishu remains default-off and starts no network connection unless enabled
  and fully configured.
- Local permission bubble, DND behavior, and agent hook protocols remain the
  primary safety path and must not change in Version 2.

The latest reported real-card issue is considered fixed in code: structured card
callback values, raw `card.action.trigger` context fallback, OR-style approver
matching, and Settings Send Test diagnostic logs are covered by tests.

## Regression Run

Passed:

```bash
node --test test\feishu-approval-runner.test.js test\feishu-card-builder.test.js test\settings-renderer-browser-env.test.js test\feishu-approval-main.test.js test\feishu-approval-main-wiring.test.js test\settings-actions.test.js test\prefs.test.js test\remote-approval-broker.test.js test\permission-telegram-approval.test.js
```

Result:

- 466 tests
- 466 passing

## V2 Entry Decision

Proceed with the first Version 2 slice: remote approval modularization.

The first implementation slice should focus on `src/remote-approval/` provider
registry and wrappers for the existing Telegram and Feishu clients. It should
preserve existing behavior and keep `src/permission.js` and `src/main.js` as
thin orchestration call sites.

Do not start rich approval, completion notifications, status command,
diagnostics/Doctor, or multi-recipient behavior until later Version 2 stages.
