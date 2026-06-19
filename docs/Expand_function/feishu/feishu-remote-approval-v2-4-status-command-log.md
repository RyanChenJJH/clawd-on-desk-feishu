# Feishu Remote Approval V2-4 Status Command Log

Date: 2026-06-13

## Scope

This log covers Version 2 stage V2-4: Feishu / Lark remote approval status
query support.

No Doctor diagnostics, multi-recipient behavior, Direct Send, remote shell,
Feishu Approval API workflow, app auto-registration, or token/credential UX
change was implemented in this stage.

No real App ID, App Secret, open_id, user_id, chat_id, receive_id, token, or
message id is recorded here.

## What Changed

- Updated `src/remote-approval/status.js`.
  - Added safe status text formatting for remote approval status summaries.
  - Redacts common token forms and Feishu/Lark id-like values from recent error
    messages before formatting status output.
  - Keeps the existing summary object free of raw provider secrets.
- Updated `src/feishu-approval-runner.js`.
  - Subscribes to SDK `message` events.
  - Handles authorized `/status` text commands with a sanitized plain-text
    status reply.
  - Ignores unauthorized `/status` senders.
  - Respects `statusCommandEnabled=false`.
  - Supports `/status card` to send a refreshable status card.
  - Handles status-card `Refresh status` callbacks without resolving or
    modifying pending permission approvals.
- Updated `src/feishu-card-builder.js`.
  - Added a status card builder with a `clawd.status` refresh callback.
  - Added status callback parsing separate from approval callback parsing, so
    status cards cannot be mistaken for approval decisions.
- Updated `src/feishu-approval-main.js` and `src/main.js`.
  - Pass a small `getStatusSummary()` dependency into the Feishu runner.
  - Main process builds the summary from DND state, pending permission count,
    Feishu status, and Telegram status through the remote approval provider
    registry and safe status summarizer.
- Updated Feishu settings normalization.
  - Added `statusCommandEnabled`, defaulting to `true` inside
    `feishuApproval`.
  - Overall Feishu approval still remains default-off because
    `feishuApproval.enabled` defaults to `false`.
  - Settings UI save paths preserve `statusCommandEnabled` even though there is
    not yet a dedicated UI control for it.

## Guardrails Preserved

- Feishu approval remains default-off.
- `/status` only works after the Feishu runner is already enabled and active.
- Remote status command failures do not allow, deny, or otherwise resolve a
  permission request.
- Unauthorized Feishu users do not receive remote approval status output.
- Local permission bubble behavior is unchanged.
- DND behavior is read and reported only; it is not changed.
- Telegram approval behavior is unchanged.
- Agent hook protocols were not touched.
- Status output is sanitized and does not include configured recipient ids,
  approver ids, app secrets, or tokens.

## TDD Slices

### Authorized `/status`

Red:

```bash
node --test test\feishu-approval-runner.test.js
```

Initial result: failed because the runner did not subscribe to Feishu `message`
events or send status replies.

Green:

- Added message command parsing to the runner.
- Added `formatRemoteApprovalStatusText()`.
- Injected a `getStatusSummary()` function into the runner.

### Unauthorized and Disabled Status Commands

Added runner tests for:

- Unauthorized sender is ignored.
- `statusCommandEnabled=false` suppresses status replies.

### Status Cards

Added card builder and runner tests for:

- `/status card` sends a status card with a refresh callback.
- The refresh callback updates the card with the latest safe status.
- Unauthorized refresh clicks are ignored.
- Status callbacks are distinct from approval callbacks.

### Main-Process Status Summary Injection

Added main runtime and wiring tests for:

- `createFeishuApprovalMain()` passes `getStatusSummary` to the runner.
- `main.js` wires `buildFeishuStatusCommandSummary()` into Feishu runtime
  creation.

### Settings Persistence

Added settings tests for:

- `statusCommandEnabled` default and validation.
- prefs normalization preserves the field.
- Settings renderer Feishu save paths preserve an existing
  `statusCommandEnabled=false`.

## Validation

Passed focused V2-4 regression:

```bash
node --test test\remote-approval-status.test.js test\feishu-card-builder.test.js test\feishu-approval-runner.test.js test\feishu-approval-main.test.js test\feishu-approval-main-wiring.test.js test\feishu-approval-settings.test.js test\prefs.test.js test\settings-actions.test.js test\settings-renderer-browser-env.test.js test\permission-telegram-approval.test.js test\remote-approval-broker.test.js test\remote-approval-provider-registry.test.js test\remote-approval-payload.test.js test\completion-notify-integration.test.js
```

Result:

- 497 tests
- 497 passing

Passed syntax checks:

```bash
node --check src\remote-approval\status.js
node --check src\feishu-card-builder.js
node --check src\feishu-approval-runner.js
node --check src\feishu-approval-main.js
node --check src\feishu-approval-settings.js
node --check src\settings-tab-telegram-approval.js
node --check src\main.js
```

Passed:

```bash
git diff --check
```

Result: no whitespace errors. Git printed only existing Windows line-ending
warnings.

## Not Run

Full `npm test` was not run in this stage. Earlier handoff notes recorded that
`npm.cmd test` timed out after 300 seconds in this environment without visible
failures before the timeout.

Real Feishu/Lark QA was not run for `/status`, `/status card`, or status-card
refresh callbacks in this stage. The implementation is covered through the
fake-channel runner tests and SDK event-shape parser tests.
