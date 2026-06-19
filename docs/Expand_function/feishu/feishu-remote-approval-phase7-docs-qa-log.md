# Feishu Remote Approval Phase 7 Docs and Real QA Log

Date: 2026-06-13

## Scope

This log covers first-version Phase 7: user-facing documentation, release note
draft updates, and Windows real Feishu Send Test QA.

No second-version features were implemented. This phase does not add completion
notifications, Direct Send, multi-approver voting, Feishu Approval API workflow,
or app auto-registration.

No real App ID, App Secret, token, receive target, approver ID, or other
credential is recorded in this log.

## What Changed

- Added `docs/guides/feishu-approval.md`.
  - Documents Feishu / Lark self-built app bot setup.
  - Documents `card.action.trigger`.
  - Documents `chat_id`, `open_id`, and `user_id` receive id choices.
  - Documents that this is approval-only: no remote shell, prompt submission,
    completion notification, Direct Send, voting, or Feishu Approval API flow.
  - Documents local desktop bubble fallback and first-decision-wins behavior
    when Telegram and Feishu are both enabled.
  - Adds troubleshooting for invalid targets, missing contact scope, missing
    callbacks, missing card delivery, and test timeout.
- Updated `docs/guides/setup-guide.md` with a Feishu / Lark Approval entry.
- Updated `docs/guides/setup-guide.zh-CN.md` with a Chinese Feishu remote
  approval entry.
- Updated `docs/guides/known-limitations.md` with Feishu app setup and v1
  approval-only limitations.
- Updated `docs/releases/release-v0.9.0.md` with Feishu v1 release-note,
  upgrade-note, docs, and known-limitations entries.

## Real QA

The user supplied real app credentials and target ids for this test run. They
were used only as transient environment variables during local commands and were
not written to repository files, docs, tests, prefs, or logs.

Observed results:

- SDK long connection startup reached `ok` with real credentials.
- Send Test using an `open_id` receive target connected but Feishu rejected card
  delivery because the target was not visible/valid for the app/tenant.
- Send Test using a `user_id` receive target connected but Feishu rejected card
  delivery because the app lacked `contact:user.employee_id:readonly`.
- The runner now reports send failures as `status: "error"` instead of waiting
  until the test card times out.
- The SDK logger is configured as silent inside Clawd so raw Feishu OpenAPI error
  objects are not dumped to the console. Clawd's own logs keep redaction.

Closed-loop Allow once / Deny card callback was not completed because both real
delivery paths were blocked by Feishu app-side target/scope configuration.

## Follow-Up Needed Outside Code

To complete a real Feishu closed-loop card test, configure one of these app-side
paths:

- Use a valid app-visible `chat_id` and install the bot into that chat.
- Use a valid app-visible `open_id` for this app/tenant.
- Or grant `contact:user.employee_id:readonly`, republish/reinstall the app, and
  retry `user_id` delivery.

After that, run Settings -> Remote Approval -> Feishu / Lark -> Send test and
tap Allow once or Deny from the configured allowed approver.

