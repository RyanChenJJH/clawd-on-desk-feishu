# Feishu Remote Approval Bugfix Log: Card Action Callback and Settings Layout

Date: 2026-06-13

## Scope

This log covers two Version 1 issues found after configuring a real Feishu custom app bot and recipient:

1. The test card was delivered to Feishu, but clicking **Allow once** or **Deny** did not complete the pending approval.
2. The expanded Feishu application credentials row in Settings collapsed text into a narrow vertical layout.

No real App ID, App Secret, open_id, user_id, chat_id, or receive_id values are recorded in this document.

## Diagnosis

### Card button callbacks

The fake-channel tests used a legacy string callback payload shaped like:

```text
clawd:approval:<nonce>:<allow|deny>
```

The real Feishu SDK normalizes card action events with `action.value` as an arbitrary value. For interactive cards this value can be an object, not only a string. The runner subscribed to the right `cardAction` event, but `parseFeishuCardAction()` only accepted the legacy string format, so real object callback payloads were ignored and the pending test approval never resolved.

### Settings credentials layout

The Feishu stored credentials row reused the generic horizontal settings row plus the Telegram token stored-row styling. With action buttons on the right, the `.row-text` area could be squeezed into a very narrow column, which made localized text and the masked secret render one glyph per line. Feishu edit rows already inherited a safer vertical layout; the stored credentials row needed the same scoped treatment.

## Fix

### Card callbacks

- Changed `callbackValue()` to emit a structured payload:

```js
{ type: "clawd.approval", nonce, action }
```

- Kept backward compatibility for existing or fake-channel payloads that still use the legacy string form.
- Added parser support for real SDK object callback values and nested legacy string values.
- Left Feishu runner, main lifecycle, Telegram behavior, local permission bubbles, DND behavior, and first-decision-wins broker semantics unchanged.

### Settings layout

- Added scoped CSS for `.feishu-approval-credentials-stored-row` so stored credentials use a vertical row layout.
- Allowed the Feishu credentials action buttons to wrap on a full-width control row.
- Kept `.feishu-approval-secret-masked` on one line to avoid one-character-per-line masked secrets.

## Tests Added

- `test/feishu-card-builder.test.js`
  - Verifies new cards contain structured callback payloads.
  - Verifies parser accepts real object callback values.
  - Verifies legacy string callback values still work.
- `test/feishu-approval-runner.test.js`
  - Verifies the Settings test-card path resolves from a structured card action payload.
- `test/settings-renderer-browser-env.test.js`
  - Guards Feishu stored credentials rows against collapsing into single-glyph columns.

## Validation

Commands run:

```bash
node --test test\feishu-card-builder.test.js test\settings-renderer-browser-env.test.js
node --test test\feishu-approval-runner.test.js test\remote-approval-broker.test.js test\permission-telegram-approval.test.js
node --check src\feishu-card-builder.js
git diff --check
```

Results:

- Feishu card builder and Settings renderer targeted tests passed.
- Feishu runner, remote approval broker, and Telegram approval coexistence tests passed.
- `src/feishu-card-builder.js` passed syntax check.
- `git diff --check` reported no whitespace errors. Git only printed existing Windows line-ending warnings.

Secret hygiene:

- Searched the repository for fragments of the provided real credentials and recipient identifiers.
- No matches were found.

## Real-World QA Status

The code path is ready for another Settings **Send Test** run against the configured Feishu app. The expected result is:

1. Feishu receives the Clawd test approval card.
2. Clicking **Allow once** resolves the Settings test as allowed and updates the card.
3. Clicking **Deny** resolves the Settings test as denied and updates the card.

If a future real-card click still does not resolve, inspect the raw SDK `cardAction` event shape before changing the broker or permission fan-out path.
