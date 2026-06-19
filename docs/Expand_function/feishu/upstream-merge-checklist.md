# Feishu Remote Approval Upstream Merge Checklist

Date: 2026-06-13

This checklist is for merging future upstream Clawd changes back into the
Feishu/Lark remote approval fork. It is intentionally operational: follow it
before, during, and after a merge.

Do not write real App ID, App Secret, open_id, user_id, chat_id, receive_id,
token, or message id values into commits, docs, tests, screenshots, or merge
notes.

## Merge Principles

- Preserve upstream behavior first, then re-attach fork-only providers through
  the smallest integration points.
- Keep Feishu approval optional and default-off.
- Keep Telegram, local permission bubble, DND, and agent hooks behavior
  unchanged unless a merge conflict is explicitly in that upstream area.
- Prefer code under `src/remote-approval/` for fork-specific remote approval
  behavior.
- Avoid broad rewrites in upstream-hot files when a small adapter call is
  enough.

## Expected Conflict Hotspots

Review these files first after `git merge` or `git rebase` reports conflicts:

- `src/main.js`
- `src/permission.js`
- `src/prefs.js`
- `src/settings-actions.js`
- `src/settings-tab-telegram-approval.js`
- `package.json`

Then review fork-owned or mostly fork-owned remote approval files:

- `src/remote-approval/`
- `src/feishu-approval-main.js`
- `src/feishu-approval-runner.js`
- `src/feishu-approval-settings.js`
- `src/feishu-card-builder.js`
- `src/feishu-approval-runtime-status.js`
- `src/feishu-approval-credentials.js`

## Pre-Merge Snapshot

Before merging upstream:

1. Record current branch and commit:

```bash
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

2. Run the focused remote approval suite:

```bash
node --test test\remote-approval-broker.test.js test\remote-approval-provider-registry.test.js test\remote-approval-payload.test.js test\permission-remote-approval.test.js test\permission-telegram-approval.test.js test\completion-notify-integration.test.js test\feishu-card-builder.test.js test\feishu-approval-settings.test.js test\feishu-approval-runner.test.js test\feishu-approval-main.test.js test\feishu-approval-runtime-status.test.js test\doctor.test.js test\doctor-ipc.test.js test\doctor-report.test.js test\settings-renderer-browser-env.test.js
```

3. If time allows, run the full suite:

```bash
npm test
```

## Conflict Resolution Order

1. Resolve `package.json` first.
   - Keep upstream dependency changes.
   - Keep `@larksuiteoapi/node-sdk` only if Feishu runtime still imports it.
   - Do not add secrets or environment defaults.
2. Resolve `src/prefs.js` and `src/settings-actions.js`.
   - Preserve the Settings controller/store as the only write path.
   - Keep `feishuApproval.enabled` defaulting to `false`.
   - Keep credentials outside prefs.
   - Preserve `feishuApproval.recipients` as optional additive config.
3. Resolve `src/permission.js`.
   - Preserve upstream local permission bubble semantics.
   - DND must still avoid making allow/deny decisions for the user.
   - Remote approval must remain an optional provider path, not the primary
     local approval implementation.
4. Resolve `src/main.js`.
   - Re-attach Feishu runtime creation through a narrow block.
   - Re-attach remote approval provider registry registration.
   - Re-attach completion notifier and Doctor helper wiring.
5. Resolve `src/settings-tab-telegram-approval.js`.
   - Preserve upstream Settings UI structure.
   - Re-attach the Feishu card as one Remote Approval channel.
   - Preserve `recipients[]` through save paths even if the UI only edits the
     legacy single-recipient fields.
6. Resolve files under `src/remote-approval/`.
   - Prefer these modules as the home for shared broker, provider, decision,
     payload, and status logic.

## Temporary Feishu Provider Disable

When diagnosing a merge regression, first prove whether it is Feishu-specific.

Use a prefs snapshot or Settings update equivalent to:

```txt
feishuApproval.enabled=false
```

Then restart Clawd and retry the failing scenario.

Expected behavior with Feishu disabled:

- No Feishu WebSocket channel starts.
- No Feishu approval card or completion notification is sent.
- Telegram behavior remains unchanged.
- local permission bubble behavior remains unchanged.
- DND behavior remains unchanged.
- agent hooks continue to report state and permission requests as before.

If the bug disappears only when Feishu is disabled, inspect:

- `src/feishu-approval-main.js`
- `src/feishu-approval-runner.js`
- `src/remote-approval/provider-registry.js`
- `src/remote-approval/broker.js`
- `src/permission.js`

If the bug remains with Feishu disabled, treat it as a shared or upstream merge
issue first.

## Required Post-Merge Regression

Run the focused suite first:

```bash
node --test test\remote-approval-broker.test.js test\remote-approval-provider-registry.test.js test\remote-approval-payload.test.js test\permission-remote-approval.test.js test\permission-telegram-approval.test.js test\completion-notify-integration.test.js test\feishu-card-builder.test.js test\feishu-approval-settings.test.js test\feishu-approval-runner.test.js test\feishu-approval-main.test.js test\feishu-approval-runtime-status.test.js test\doctor.test.js test\doctor-ipc.test.js test\doctor-report.test.js test\settings-renderer-browser-env.test.js
```

Then run the full suite:

```bash
npm test
```

If the full suite is too slow or times out in the local Windows environment,
record the timeout and run at least:

```bash
node --test test\server.test.js test\state.test.js test\settings-actions.test.js test\prefs.test.js test\menu.test.js test\tick.test.js test\session-hud.test.js test\dashboard.test.js
```

## Manual Smoke After Merge

Use placeholders or a private local environment only. Do not paste real ids into
docs or test files.

- Feishu disabled:
  - Start Clawd.
  - Confirm no Feishu network runtime starts.
  - Confirm local permission bubble still appears for supported agents.
- Telegram only:
  - Enable Telegram approval.
  - Confirm Telegram approval still receives and resolves a permission request.
- Feishu basic approval:
  - Enable Feishu with private local credentials.
  - Send one permission request.
  - Confirm only the configured approver can resolve it.
- Feishu rich approval:
  - Trigger an agent that supports permission suggestions.
  - Confirm suggestion buttons render and invalid indexes are ignored.
- Feishu completion notification:
  - Keep notification default off.
  - Enable notification explicitly.
  - Confirm send failure does not change session state.
- Feishu status command:
  - Send `/status` from an allowed approver.
  - Confirm output contains DND, pending approvals, Telegram, and Feishu status.
  - Send `/status` from an unauthorized user and confirm it is ignored.
- Multi-recipient:
  - Configure more than one placeholder recipient in a private prefs file.
  - Confirm all targets receive the card.
  - Confirm the first valid decision wins.
- DND:
  - Turn DND on.
  - Confirm DND still does not make allow/deny decisions.

## Final Review

- `git diff --check`
- Confirm no real Feishu/Lark ids or credentials are present in changed files.
- Confirm docs mention placeholders only.
- Confirm new code remains modular and primarily under Feishu or
  `src/remote-approval/` modules.
- Confirm any changes to upstream-hot files are small wiring edits with tests.

## v3 additions (2026-06-17) — answering + Expired fix

New fork surface to re-attach after an upstream merge (see
`feishu-remote-approval-v3-*` docs):

- **Config** (`src/feishu-approval-settings.js`): `elicitationEnabled` (default
  off) and `approvalTimeoutSeconds` (default 600, clamp [30,1800]) — added to
  default/normalize/validate. The 90s hardcoded timeout is gone; the runner
  derives the wait from config unless an explicit `approvalTimeoutMs` is
  injected (tests only).
- **Resolved-card states** (`src/feishu-card-builder.js`): `timed_out` /
  `answered_elsewhere` / `superseded` / `answered` (plus legacy `expired`). The
  abort cause travels via `AbortSignal.reason`; `broker.js` `settle` aborts
  others with `"superseded"`, and `permission.js cancelRemoteApproval` aborts
  with `"answered_elsewhere"`.
- **Elicitation (AskUserQuestion in Feishu)**: card builder
  `buildFeishuQuestionCard` + `elicitCallbackValue` + `parseFeishuElicitAction`;
  runner `requestElicitation` (option click OR free-text reply); permission
  `maybeStartRemoteElicitation` (parallel to `maybeStartRemoteApproval`, reuses
  the fanout via a `requestApproval→requestElicitation` adapter); main wiring
  `getRemoteElicitationClients` + route `startRemoteElicitation`.
- **SAFETY INVARIANT (regression-locked, do not break on merge)**: a provider
  resolving `null` (Feishu timeout/abort/send-failure) must NEVER settle the
  broker / allow the local tool. Guarded by `remote-approval-broker.test.js`
  ("a provider resolving null … never settles the request").
- **Diagnostics**: `resolvePermissionEntry` logs a `resolve source:` line
  (behavior/reason/remotePending) — keep it; it pinpoints local auto-allow.
- **Remaining (not yet built)**: settings-tab UI controls + 5-lang i18n for the
  two new config fields (P6); runtime repro of the local auto-allow path (P7).

## v0.10.0 upstream merge (2026-06-19)

Merged upstream `rullerzhou-afk/clawd-on-desk` v0.10.0 (#523, 73 commits) into the
Feishu fork. Integration branch `merge/upstream-v0.10` (merge commit ae5b73d,
parents 7c92ec5 + 15f041f).

**Actual conflicts this round — only 3** (most expected hotspots above auto-merged):

- `src/main.js` — fork added `powerMonitor` to the electron require (used by the
  health-reminder idle check); upstream inserted the XWayland relaunch block right
  after it. Resolution: **union** (keep the powerMonitor require line + the full
  upstream block). `permission.js`, `settings-actions.js`,
  `settings-tab-telegram-approval.js`, and `package.json` all auto-merged cleanly.
- `src/prefs.js` — both sides defined the v11 -> v12 migration (fork: Feishu
  settings via schema defaults; upstream: `showDock` backfill). Resolution: fold
  into ONE v12 block (keep upstream's `showDock` backfill; Feishu fields via
  `validate()`). `CURRENT_VERSION` stays 12 — do NOT double-bump.
- `src/settings-renderer.js` — NEW hotspot: upstream replaced the emoji sidebar
  `icon:` glyphs with inline SVGs resolved through a new `src/settings-icons.js`
  (`ClawdSettingsIcons.getIcon(tabId)`). Resolution: drop the emoji `icon:` field,
  keep the `healthReminder` tab entry, AND add a `healthReminder` SVG to
  `src/settings-icons.js`; add it to `test/settings-icons.test.js` SIDEBAR_TAB_IDS.

**New upstream-merge hotspots to remember next time:**

- `src/settings-renderer.js` + `src/settings-icons.js` + `test/settings-icons.test.js`
  (SVG sidebar icons — any new fork tab needs an icon entry here, not an emoji).
- `src/prefs.js` migration-version collisions (coordinate the `CURRENT_VERSION` bump).

**Worktree gotcha:** `test/feishu-upstream-merge-checklist.test.js` reads THIS file,
which is gitignored — a fresh `git worktree` won't have it. Copy `docs/Expand_function/`
into the worktree before running the focused suite there.

**Verification (Windows, node v24):** conflict-validation 437/437, focused approval
274/274, health-reminder 160/160, safety invariant green, full suite 4407 pass /
13 skipped (platform-guarded) / 1 PRE-EXISTING env failure
(`agent-installation-detector` "bare Hermes home" — fails identically on pre-merge
7c92ec5 because this machine has Hermes installed; not a merge regression). App boot
smoke (clean throwaway profile, Feishu default-off): booted OK, state server up, no
Feishu runtime started.

**Pending (owner: user):** real-account Feishu walkthrough + visual health-reminder
check (use placeholders/private local env only), then fast-forward
`feature/health-reminder` -> `merge/upstream-v0.10` and `main` -> upstream v0.10.0.

