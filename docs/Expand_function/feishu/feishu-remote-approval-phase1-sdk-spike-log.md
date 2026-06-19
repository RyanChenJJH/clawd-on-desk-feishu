# Feishu Remote Approval Phase 1 SDK Spike Log

Date: 2026-06-13

## Scope

This log covers first-version Phase 1 only: Feishu/Lark self-built app bot SDK capability spike.

No second-version features were implemented. No changes were made to `src/main.js`, `src/permission.js`, Settings UI, agent hooks, Telegram behavior, local permission bubbles, or DND behavior.

## What Changed

- Added `@larksuiteoapi/node-sdk` to project dependencies.
- Added `src/feishu-sdk-spike.js` as an isolated spike module.
- Added `tools/feishu-approval-spike.js` as a runnable real Feishu card test harness.
- Added `test/feishu-sdk-spike.test.js`.

## SDK Findings

Installed SDK version: `@larksuiteoapi/node-sdk@1.66.1`.

Verified locally:

- CommonJS `require("@larksuiteoapi/node-sdk")` works in this repository.
- SDK exports `createLarkChannel`, `Client`, `WSClient`, `EventDispatcher`, `Domain`, and `LoggerLevel`.
- `createLarkChannel({ appId, appSecret, domain, transport: "websocket" })` is available.
- `channel.send(to, { card })` is supported by the installed type definition.
- `cardAction` events normalize to `action.value` and `operator.openId/userId`.

Phase 1 spike currently limits the send target to `receiveIdType=chat_id`, because the SDK Channel API auto-detects the recipient type from the target string. `open_id/user_id` verification should happen later through the formal runner/OpenAPI path if needed.

## Spike Harness

Run with an env file outside the repo, for example:

```txt
CLAWD_FEISHU_APP_ID=cli_xxx
CLAWD_FEISHU_APP_SECRET=xxx
CLAWD_FEISHU_RECEIVE_ID_TYPE=chat_id
CLAWD_FEISHU_RECEIVE_ID=oc_xxx
CLAWD_FEISHU_ALLOWED_OPEN_ID=ou_xxx
CLAWD_FEISHU_REGION=feishu
CLAWD_FEISHU_SPIKE_TIMEOUT_MS=60000
```

Command:

```bash
node tools/feishu-approval-spike.js --env-file=C:\path\to\feishu-spike.env
```

The script prints only safe config booleans and SDK capabilities. It does not log raw App Secret, receive ID, open ID, or user ID.

## Feishu Console Checklist To Verify

- Create a self-built Feishu/Lark app.
- Enable bot capability.
- Install the app into the target tenant/chat.
- Grant message send permission for bot messages.
- Subscribe to `card.action.trigger`.
- Use v2 interactive card button callbacks.
- Add the bot to the target chat and use that chat's `chat_id`.

The exact permission names still need to be captured during real-app QA because Feishu console labels may change.

## Test Results

Passed:

```bash
node --test test\feishu-sdk-spike.test.js
```

Result: 10 passing tests.

Passed:

```bash
node --test test\feishu-sdk-spike.test.js test\telegram-approval-settings.test.js test\telegram-native-runner.test.js
```

Result: 51 passing tests, 1 skipped POSIX-only test.

Dry run without credentials:

```bash
node tools\feishu-approval-spike.js
```

Result: expected error, `Missing Feishu spike config: appId, appSecret, receiveId`; no network connection attempted.

Blocked / not completed:

- Real Feishu card send and button callback were not executed because no test App ID, App Secret, target `chat_id`, or allowed approver ID was provided.
- `test\permission-telegram-approval.test.js` could not be run in this environment because local `node_modules/electron` is missing its downloaded binary (`path.txt` absent), causing `Electron failed to install correctly`. This is an environment dependency issue, not a Feishu code-path failure.
- Full `npm test` was not run for the same Electron installation reason.

## Next Step

Run the spike harness with real Feishu test credentials. If the v2 card can be sent and `cardAction` returns Allow/Deny, proceed to first-version Phase 2: thin remote approval broker. If the SDK Channel fails in Electron/CommonJS/proxy conditions, stop before Phase 2 and evaluate the fallback OpenAPI + WebSocket approach.
