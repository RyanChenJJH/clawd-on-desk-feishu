# Feishu Remote Approval V2-8 Final Validation Log

Date: 2026-06-13

## Scope

This log covers Version 2 stage V2-8: final automated validation for the
Feishu / Lark remote approval V2 work.

No runtime feature, Direct Send, remote shell, Feishu Approval API workflow,
app auto-registration, or token/credential UX change was implemented in this
stage.

No real App ID, App Secret, open_id, user_id, chat_id, receive_id, token, or
message id is recorded here.

## Validation Summary

Full suite command:

```bash
npm.cmd test
```

Result in this Windows environment:

- 4049 tests discovered
- 4023 passing
- 14 failing
- 12 skipped
- Exit code: 1

Observed failures:

- 13 failures in `test\hermes-plugin.test.js`
  - Each failed because the test helper launched `python` and the child process
    returned `status=null`.
  - Local environment check:
    - `python --version` failed because `python` is not installed or not on
      PATH.
    - `py --version` reported no installed Python.
  - These failures are outside the Feishu remote approval code path.
- 1 failure in `test\shared-process.test.js`
  - `walks from startPid and populates pidChain`
  - The assertion saw an empty `pidChain` in this Windows environment.
  - This is outside the Feishu remote approval code path.

## Focused Remote Approval Regression

Command:

```bash
node --test test\remote-approval-broker.test.js test\remote-approval-provider-registry.test.js test\remote-approval-payload.test.js test\permission-remote-approval.test.js test\permission-telegram-approval.test.js test\completion-notify-integration.test.js
```

Result:

- 27 tests
- 27 passing

Covered:

- Remote approval broker first-decision-wins behavior.
- Rich suggestion support only from capable providers.
- Abort handling and late decision ignore behavior.
- Telegram and Feishu provider registry.
- Permission fanout through Telegram and Feishu without replacing local
  permission bubble semantics.
- Completion notification integration.

## Focused Feishu Regression

Command:

```bash
node --test test\feishu-card-builder.test.js test\feishu-approval-settings.test.js test\feishu-approval-runner.test.js test\feishu-approval-main.test.js test\feishu-approval-runtime-status.test.js test\feishu-upstream-merge-checklist.test.js
```

Result:

- 46 tests
- 46 passing

Covered:

- Basic Feishu card approval.
- Rich approval suggestions.
- Invalid suggestion index ignore behavior.
- Status command and status card refresh.
- Completion notification default-off behavior.
- Multi-recipient approval cards and completion notification fan-out.
- Multi-approver first valid decision wins behavior.
- Unauthorized approver ignore behavior.
- Settings normalization, readiness, and credential separation.
- Doctor diagnostic status for Feishu.
- Upstream merge checklist coverage.

## Settings / Doctor / Prefs Regression

Command:

```bash
node --test test\doctor.test.js test\doctor-ipc.test.js test\doctor-report.test.js test\settings-renderer-browser-env.test.js test\prefs.test.js test\settings-actions.test.js
```

Result:

- 447 tests
- 447 passing

Covered:

- Feishu Doctor aggregation and IPC wiring.
- Doctor report redaction for Feishu/Lark-shaped identifiers and credentials.
- Settings UI Feishu channel rendering and save paths.
- Feishu credential commands without storing raw app secrets in prefs.
- Feishu multi-recipient config preservation through Settings saves.
- prefs normalization and settings action validation.

## Core Clawd Regression

Command:

```bash
node --test test\server.test.js test\state.test.js test\settings-actions.test.js test\prefs.test.js test\menu.test.js test\tick.test.js test\session-hud.test.js test\dashboard.test.js
```

Result:

- 557 tests
- 557 passing

Covered:

- Server and state behavior.
- DND behavior.
- Settings actions and prefs.
- Menu behavior.
- Tick and sleep/mini mode behavior.
- Session HUD and Dashboard behavior.

## Syntax and Diff Checks

Syntax checks were run for touched runtime files:

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

Result: all passed.

Diff check:

```bash
git diff --check
```

Result: exit code 0.

Notes:

- Git reported LF/CRLF replacement warnings for existing working-copy files.
- No whitespace errors were reported.

## Guardrails Verified

- Feishu approval remains default-off.
- Feishu credentials remain outside prefs.
- Runtime status and Doctor report output redact Feishu/Lark-shaped ids and
  credential-shaped values.
- Telegram approval tests pass.
- Local permission fanout tests pass and preserve local permission bubble
  semantics.
- DND tests pass and DND still does not make allow/deny decisions.
- Core state, tick, Session HUD, Dashboard, prefs, and settings action tests
  pass.
- Agent hook behavior was not modified in V2-8.

## Residual Risk

- Full `npm.cmd test` is not green in this local environment because Python is
  unavailable for Hermes plugin tests and one process-tree test did not observe
  a pid chain.
- These failures should be re-run in an environment with Python installed and
  normal process metadata access before release sign-off.
- Manual smoke with a real private Feishu/Lark app was not run in this stage.

