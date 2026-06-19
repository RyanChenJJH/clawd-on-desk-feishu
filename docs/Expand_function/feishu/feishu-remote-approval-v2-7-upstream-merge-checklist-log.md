# Feishu Remote Approval V2-7 Upstream Merge Checklist Log

Date: 2026-06-13

## Scope

This log covers Version 2 stage V2-7: upstream merge checklist and regression
suite documentation for the Feishu / Lark remote approval fork.

No runtime behavior, Direct Send, remote shell, Feishu Approval API workflow,
app auto-registration, or token/credential UX change was implemented in this
stage.

No real App ID, App Secret, open_id, user_id, chat_id, receive_id, token, or
message id is recorded here.

## What Changed

- Added `docs/Expand_function/feishu/upstream-merge-checklist.md`.
  - Lists expected upstream conflict hotspots:
    - `src/main.js`
    - `src/permission.js`
    - `src/prefs.js`
    - `src/settings-actions.js`
    - `src/settings-tab-telegram-approval.js`
    - `package.json`
  - Documents fork-owned Feishu and `src/remote-approval/` modules to review.
  - Defines pre-merge and post-merge regression commands.
  - Documents how to temporarily disable Feishu with
    `feishuApproval.enabled=false` while isolating merge regressions.
  - Explicitly calls out Telegram, local permission bubble, DND, and agent
    hooks as behavior that must remain unchanged.
  - Includes manual smoke coverage for disabled Feishu, Telegram-only, basic
    Feishu approval, rich approval, completion notification, status command,
    multi-recipient behavior, and DND.
- Added `test/feishu-upstream-merge-checklist.test.js`.
  - Verifies the checklist contains critical conflict files, rollback wording,
    focused regression commands, and behavior guardrails.
  - Verifies the checklist does not include raw `app_secret=` or
    `CLAWD_FEISHU_APP_SECRET=` assignments.

## Guardrails Preserved

- Feishu approval remains default-off.
- This stage is documentation and test-only.
- Telegram approval behavior is unchanged.
- Local permission bubble behavior is unchanged.
- DND behavior is unchanged.
- Agent hook protocols were not touched.
- The checklist uses placeholder text only and does not include real
  credentials or ids.

## TDD Slice

### Checklist Coverage Test

Red:

```bash
node --test test\feishu-upstream-merge-checklist.test.js
```

Initial result: failed because `upstream-merge-checklist.md` did not exist.

Green:

- Added the checklist document.
- Ensured it covers high-risk conflict files, remote approval module boundaries,
  temporary Feishu disable flow, focused regression commands, and no-secret
  rules.

## Validation

Passed V2-7 document guard:

```bash
node --test test\feishu-upstream-merge-checklist.test.js
```

Result:

- 1 test
- 1 passing

