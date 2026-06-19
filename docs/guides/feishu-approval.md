# Feishu / Lark Approval

[Back to setup guide](setup-guide.md)

Feishu / Lark Approval is an optional remote approval path for existing Clawd
permission bubbles. When a supported agent asks for tool permission, Clawd keeps
the local desktop bubble and also sends an interactive card through your
self-built Feishu or Lark app bot. The first explicit Allow once or Deny decision
resolves the same pending permission.

This is approval-only. It does not create a Feishu chat bridge, remote shell,
prompt-submission path, completion notification, Direct Send flow, multi-person
voting flow, or Feishu Approval API workflow.

## Supported Paths

- Claude Code and CodeBuddy normal permission requests.
- Codex CLI official `PermissionRequest` hooks when Codex permission handling is
  in intercept mode.

Feishu cards are not sent for DND/native-fallback cases, disabled agents, hidden
permission bubbles, opencode, elicitation prompts, passive notifications, or
headless sessions.

## Feishu App Setup

Create a dedicated self-built app in the Feishu or Lark developer console:

1. Enable the app bot.
2. Grant the bot permission to send interactive cards/messages to the target
   chat or user.
3. Subscribe the app to the `card.action.trigger` event.
4. Publish or reinstall the app after changing permissions or event
   subscriptions.
5. Install the app into the tenant and, for group delivery, into the target
   group chat.
6. Collect the target receive id and the approver id you want Clawd to trust.

The Settings card supports these receive id types:

| Type | Use when |
|---|---|
| `chat_id` | Sending approval cards to a group or chat, usually an id beginning with `oc_`. |
| `open_id` | Sending approval cards directly to a user by app-scoped open id, usually an id beginning with `ou_`. |
| `user_id` | Sending approval cards directly by tenant user id. In real API testing, this path required the app scope `contact:user.employee_id:readonly`; use `chat_id` or `open_id` if you do not want to add that contact scope. |

Allowed approver validation is separate from delivery. Fill at least one of
`Allowed open_id` or `Allowed user_id`; card clicks from other users are ignored.

## Clawd Setup

Open **Settings -> Remote Approval -> Feishu / Lark**.

1. **Credentials.** Paste the app's App ID and App Secret. The secret is stored
   outside `clawd-prefs.json` in Clawd's user-data `feishu-approval.env` file.
   After saving, the UI only shows a masked credential summary.
2. **Recipient.** Pick Feishu or Lark, select the receive id type, enter the
   receive id, and enter the allowed approver id.
3. **Enable & Test.** Enable Feishu approval, then click **Send test**.

The test sends a standalone approval card. Tap Allow once or Deny in Feishu /
Lark within the timeout. It is not attached to any live agent permission request.

## Runtime Behavior

- The desktop permission bubble remains the local fallback.
- Feishu timeout or network/API failure does not deny or allow the tool. The
  local bubble stays usable and the agent's existing fallback behavior remains
  unchanged.
- If Telegram approval is also enabled, Telegram, Feishu, and the desktop bubble
  share the same pending permission. The first explicit decision wins.
- If the desktop bubble or another remote provider resolves first, Clawd aborts
  the in-flight Feishu approval request.
- Repeated or late Feishu taps after a request is already handled do not resolve
  the permission twice.
- Feishu SDK logging is silenced inside Clawd, and Clawd logs redact saved
  credentials and configured ids.

## Troubleshooting

| Symptom | Check |
|---|---|
| Channel connects, but **Send test** says the target is invalid | The receive id may not exist for this app/tenant, the selected id type may be wrong, or the app is not installed where that target is visible. |
| **Send test** reports missing `contact:user.employee_id:readonly` | You are likely using `user_id` delivery. Add the contact scope and reinstall/publish the app, or switch to `chat_id` / `open_id`. |
| No card callback arrives | Confirm `card.action.trigger` is subscribed, the app was republished/reinstalled after event changes, and the approver id in Settings matches the clicking user. |
| No card is delivered | Confirm the bot is enabled, installed in the target chat or tenant, has message/card send permission, and the region matches Feishu vs Lark. |
| Test times out | The card was sent, but no allowed approver clicked Allow once or Deny before the timeout. |

