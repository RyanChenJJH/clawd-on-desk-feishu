# Feishu Remote Approval V2-5 Doctor Diagnostics Log

Date: 2026-06-13

## Scope

This log covers Version 2 stage V2-5: Doctor diagnostics and safer runtime
status reporting for Feishu / Lark remote approval.

No multi-recipient behavior, Direct Send, remote shell, Feishu Approval API
workflow, app auto-registration, or token/credential UX change was implemented
in this stage.

No real App ID, App Secret, open_id, user_id, chat_id, receive_id, token, or
message id is recorded here.

## What Changed

- Added `src/feishu-approval-runtime-status.js`.
  - Builds a Doctor-friendly diagnostic from normalized Feishu settings,
    credential presence, and current runner status.
  - Reports `disabled` as an OK/off state so Feishu remains default-off and
    quiet unless explicitly enabled.
  - Reports setup warnings for missing credentials, recipient, or allowed
    approver when Feishu approval is enabled.
  - Redacts recent runtime errors before they enter Doctor output.
- Updated `src/doctor.js`.
  - Includes a `feishu-approval` check in the aggregate Doctor result.
  - The check can be dependency-injected in tests and receives Feishu runtime
    status from IPC options.
- Updated `src/doctor-ipc.js` and `src/main.js`.
  - Doctor IPC now passes Feishu credential status and runner status into the
    Doctor aggregation path.
  - Main process wires those helpers from the Feishu approval runtime without
    changing Telegram, local bubble, DND, or agent hook behavior.
- Updated `src/doctor-report.js`.
  - Adds Feishu/Lark-shaped redaction for app ids, app secrets, recipient ids,
    open/user/chat ids, and message ids.
  - Existing home path, app path, token, and IP redaction remains intact.
- Updated `src/feishu-approval-main.js`.
  - Sanitizes `lastError.message` before returning Feishu runtime status to
    Settings/Doctor consumers.

## Guardrails Preserved

- Feishu approval remains default-off.
- When Feishu approval is disabled, Doctor reports the feature as off instead
  of as a problem.
- Doctor diagnostics are read-only and do not start, stop, allow, deny, or
  resolve any permission request.
- Local permission bubble behavior is unchanged.
- DND behavior is unchanged.
- Telegram approval behavior is unchanged.
- Agent hook protocols were not touched.
- Diagnostic reports and runtime status sanitize Feishu/Lark identifier and
  credential-shaped values before display.

## TDD Slices

### Runtime Diagnostic Module

Red:

```bash
node --test test\feishu-approval-runtime-status.test.js
```

Initial result: failed because there was no Feishu Doctor diagnostic module.

Green:

- Added `buildFeishuApprovalDiagnostic()`.
- Added `checkFeishuApprovalStatus()`.
- Covered disabled/off and enabled-but-incomplete setup states.

### Doctor Aggregation

Red:

```bash
node --test test\doctor.test.js
```

Initial result: failed because aggregate Doctor checks did not include
`feishu-approval`.

Green:

- Added the Feishu check to `runDoctorChecks()`.
- Covered warning overall status when Feishu is enabled but incomplete.

### Doctor IPC and Main Wiring

Red:

```bash
node --test test\doctor-ipc.test.js
node --test test\feishu-approval-main-wiring.test.js
```

Initial result: failed because Doctor IPC did not receive Feishu runtime helpers
and `main.js` did not pass them into `registerDoctorIpc()`.

Green:

- Threaded `getFeishuApprovalCredentialsStatus()` and
  `getFeishuApprovalStatus()` through Doctor IPC.
- Wired those helpers from main process registration.

### Redaction

Red:

```bash
node --test test\doctor-report.test.js
node --test test\feishu-approval-main.test.js
```

Initial result: failed because Feishu-shaped ids and runtime `lastError.message`
could remain visible in report/status text.

Green:

- Extended Doctor report redaction for Feishu/Lark id and credential shapes.
- Sanitized Feishu runtime status `lastError.message` before it reaches UI or
  Doctor consumers.

## Validation

Passed focused V2-5 regression:

```bash
node --test test\feishu-approval-runtime-status.test.js test\doctor.test.js test\doctor-ipc.test.js test\feishu-approval-main-wiring.test.js test\doctor-report.test.js test\feishu-approval-main.test.js
```

Result:

- 29 tests
- 29 passing

