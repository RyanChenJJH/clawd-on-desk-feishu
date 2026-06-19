"use strict";

const MAX_TITLE_LEN = 160;
const MAX_DETAIL_LEN = 1800;
const MAX_SUGGESTION_LABEL_LEN = 80;
const CALLBACK_TYPE = "clawd.approval";
const STATUS_CALLBACK_TYPE = "clawd.status";
// v3: elicitation (AskUserQuestion answered in Feishu). Each option button
// carries { type:"clawd.elicit", nonce, questionIndex, optionIndex }.
const ELICIT_CALLBACK_TYPE = "clawd.elicit";
const CALLBACK_RE = /^clawd:approval:([a-z0-9_-]{4,64}):(allow|deny)$/i;
const SUGGESTION_CALLBACK_RE = /^clawd:approval:([a-z0-9_-]{4,64}):suggestion:(\d+)$/i;
const ELICIT_CALLBACK_RE = /^clawd:elicit:([a-z0-9_-]{4,64}):(\d+):(\d+)$/i;
const MAX_QUESTIONS = 8;
const MAX_OPTIONS_PER_QUESTION = 12;
const MAX_QUESTION_TEXT_LEN = 600;

function trimString(value, maxLen = 512) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function compactCardText(value, maxLen) {
  let text = typeof value === "string" ? value : String(value == null ? "" : value);
  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length > maxLen) text = `${text.slice(0, Math.max(0, maxLen - 3))}...`;
  return text;
}

function safeNonce(value) {
  const nonce = trimString(value, 64).toLowerCase();
  if (!/^[a-z0-9_-]{4,64}$/.test(nonce)) {
    throw new Error("Feishu approval nonce must be 4-64 chars of a-z, 0-9, _, or -");
  }
  return nonce;
}

function callbackValue(nonce, action, index) {
  const id = safeNonce(nonce);
  if (action === "allow" || action === "deny") {
    return {
      type: CALLBACK_TYPE,
      nonce: id,
      action,
    };
  }
  if (action === "suggestion") {
    const suggestionIndex = Number(index);
    if (!Number.isInteger(suggestionIndex) || suggestionIndex < 0) {
      throw new Error("Feishu approval suggestion index must be a non-negative integer");
    }
    return {
      type: CALLBACK_TYPE,
      nonce: id,
      action,
      index: suggestionIndex,
    };
  }
  throw new Error("Feishu approval action must be allow, deny, or suggestion");
}

function statusCallbackValue() {
  return {
    type: STATUS_CALLBACK_TYPE,
    action: "refresh",
  };
}

function elicitCallbackValue(nonce, questionIndex, optionIndex) {
  const id = safeNonce(nonce);
  const q = Number(questionIndex);
  const o = Number(optionIndex);
  if (!Number.isInteger(q) || q < 0) {
    throw new Error("Feishu elicit questionIndex must be a non-negative integer");
  }
  if (!Number.isInteger(o) || o < 0) {
    throw new Error("Feishu elicit optionIndex must be a non-negative integer");
  }
  return { type: ELICIT_CALLBACK_TYPE, nonce: id, questionIndex: q, optionIndex: o };
}

function button(text, value, type) {
  return {
    tag: "button",
    text: { tag: "plain_text", content: text },
    type,
    width: "fill",
    behaviors: [{ type: "callback", value }],
  };
}

function markdown(content) {
  return { tag: "markdown", content };
}

function buttonRow(nonce) {
  return {
    tag: "column_set",
    flex_mode: "none",
    background_style: "default",
    columns: [
      {
        tag: "column",
        width: "weighted",
        weight: 1,
        elements: [button("Allow once", callbackValue(nonce, "allow"), "primary")],
      },
      {
        tag: "column",
        width: "weighted",
        weight: 1,
        elements: [button("Deny", callbackValue(nonce, "deny"), "danger")],
      },
    ],
  };
}

function normalizeSuggestionButtons(suggestions) {
  if (!Array.isArray(suggestions)) return [];
  const out = [];
  const seen = new Set();
  for (const suggestion of suggestions) {
    if (!suggestion || typeof suggestion !== "object") continue;
    const index = Number(suggestion.index);
    if (!Number.isInteger(index) || index < 0 || seen.has(index)) continue;
    const label = compactCardText(suggestion.label, MAX_SUGGESTION_LABEL_LEN);
    if (!label) continue;
    seen.add(index);
    out.push({ index, label });
    if (out.length >= 6) break;
  }
  return out;
}

function suggestionRows(nonce, suggestions) {
  const normalized = normalizeSuggestionButtons(suggestions);
  const rows = [];
  for (let i = 0; i < normalized.length; i += 2) {
    const pair = normalized.slice(i, i + 2);
    rows.push({
      tag: "column_set",
      flex_mode: "none",
      background_style: "default",
      columns: pair.map((suggestion) => ({
        tag: "column",
        width: "weighted",
        weight: 1,
        elements: [button(
          suggestion.label,
          callbackValue(nonce, "suggestion", suggestion.index),
          "default",
        )],
      })),
    });
  }
  return rows;
}

function cardShell({ title, template = "blue", elements }) {
  return {
    schema: "2.0",
    config: { wide_screen_mode: true },
    header: {
      template,
      title: { tag: "plain_text", content: compactCardText(title, MAX_TITLE_LEN) || "Clawd approval" },
    },
    body: {
      elements: Array.isArray(elements) ? elements : [],
    },
  };
}

function buildFeishuApprovalCard({ nonce, title, detail, suggestions } = {}) {
  const id = safeNonce(nonce);
  const safeDetail = compactCardText(detail || "A Clawd permission request is waiting for your decision.", MAX_DETAIL_LEN);
  return cardShell({
    title: title || "Clawd approval request",
    template: "blue",
    elements: [
      markdown(safeDetail),
      buttonRow(id),
      ...suggestionRows(id, suggestions),
    ],
  });
}

// v3: resolved-card outcomes. The old single "expired" conflated three very
// different situations and confused users; split them into distinct labels.
// "expired" is kept as a backward-compatible alias for "timed_out".
// See docs/Expand_function/feishu/feishu-remote-approval-v3-development-plan.md §3 Part2.
const RESOLVED_STATUS = Object.freeze({
  allowed: { text: "Allowed", template: "green" },
  denied: { text: "Denied", template: "red" },
  answered: { text: "Answered", template: "green" },
  timed_out: { text: "Timed out — no response in time", template: "grey" },
  answered_elsewhere: { text: "Resolved on desktop or terminal", template: "grey" },
  superseded: { text: "Resolved via another channel", template: "grey" },
  expired: { text: "Expired", template: "grey" },
});

function optionLabel(option) {
  if (typeof option === "string") return option;
  if (option && typeof option === "object") return option.label || option.text || option.value || "";
  return "";
}

// v3: render a question's options as two-per-row buttons. optionIndex is the
// ORIGINAL index in the question's options array (so empty options don't shift
// the mapping the runner uses to resolve the chosen label).
function questionOptionRows(nonce, questionIndex, options) {
  const normalized = [];
  (Array.isArray(options) ? options : []).slice(0, MAX_OPTIONS_PER_QUESTION).forEach((option, optionIndex) => {
    const label = compactCardText(optionLabel(option), MAX_SUGGESTION_LABEL_LEN);
    if (label) normalized.push({ optionIndex, label });
  });
  const rows = [];
  for (let i = 0; i < normalized.length; i += 2) {
    const pair = normalized.slice(i, i + 2);
    rows.push({
      tag: "column_set",
      flex_mode: "none",
      background_style: "default",
      columns: pair.map(({ optionIndex, label }) => ({
        tag: "column",
        width: "weighted",
        weight: 1,
        elements: [button(label, elicitCallbackValue(nonce, questionIndex, optionIndex), "default")],
      })),
    });
  }
  return rows;
}

// v3: AskUserQuestion answered in Feishu — each option is a button; a trailing
// hint tells the approver they can reply with free text for the "Other" path.
function buildFeishuQuestionCard({ nonce, questions } = {}) {
  const id = safeNonce(nonce);
  const list = Array.isArray(questions) ? questions.slice(0, MAX_QUESTIONS) : [];
  const elements = [];
  list.forEach((question, questionIndex) => {
    const text = compactCardText((question && question.question) || "", MAX_QUESTION_TEXT_LEN);
    if (text) elements.push(markdown(`**${text}**`));
    elements.push(...questionOptionRows(id, questionIndex, question && question.options));
  });
  elements.push(markdown("💬 Reply to this message to type a custom answer."));
  return cardShell({ title: "Clawd needs your input", template: "blue", elements });
}

function buildFeishuResolvedCard({ title, detail, status } = {}) {
  const resolved = RESOLVED_STATUS[status] || RESOLVED_STATUS.denied;
  const statusText = resolved.text;
  const template = resolved.template;
  const safeDetail = compactCardText(detail || "", MAX_DETAIL_LEN);
  const lines = [`**${statusText}**`];
  if (safeDetail) lines.push("", safeDetail);
  return cardShell({
    title: title || "Clawd approval request",
    template,
    elements: [markdown(lines.join("\n"))],
  });
}

function buildFeishuStatusCard({ statusText } = {}) {
  const text = compactCardText(
    statusText || "Clawd remote approval status is unavailable.",
    MAX_DETAIL_LEN,
  );
  return cardShell({
    title: "Clawd remote approval status",
    template: "turquoise",
    elements: [
      markdown(text),
      {
        tag: "column_set",
        flex_mode: "none",
        background_style: "default",
        columns: [{
          tag: "column",
          width: "weighted",
          weight: 1,
          elements: [button("Refresh status", statusCallbackValue(), "default")],
        }],
      },
    ],
  });
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseStatusPayload(value, depth = 0) {
  if (depth > 3 || value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "clawd:status:refresh") return { action: "refresh" };
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) return null;

  const nestedString = firstString(value.value, value.callback, value.callbackValue);
  if (nestedString) {
    const parsed = parseStatusPayload(nestedString, depth + 1);
    if (parsed) return parsed;
  }

  const payload = value.clawdStatus && typeof value.clawdStatus === "object"
    ? value.clawdStatus
    : value;
  const type = firstString(payload.type, payload.kind);
  const action = firstString(payload.action, payload.command).toLowerCase();
  if (type !== STATUS_CALLBACK_TYPE && type !== "clawd:status") return null;
  return action === "refresh" ? { action } : null;
}

function firstObject(...values) {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return {};
}

function cardActionContext(event) {
  const operator = firstObject(
    event.operator,
    event.user,
    event.sender,
    event.event && event.event.operator,
    event.raw && event.raw.operator,
    event.raw && event.raw.user,
  );
  const context = firstObject(
    event.context,
    event.event && event.event.context,
    event.raw && event.raw.context,
  );
  return {
    messageId: firstString(
      event.messageId,
      event.message_id,
      event.openMessageId,
      event.open_message_id,
      context.open_message_id,
      event.raw && event.raw.open_message_id,
    ),
    chatId: firstString(
      event.chatId,
      event.chat_id,
      event.openChatId,
      event.open_chat_id,
      context.open_chat_id,
      event.raw && event.raw.open_chat_id,
    ),
    openId: firstString(operator.openId, operator.open_id, operator.openid, event.openId, event.open_id),
    userId: firstString(operator.userId, operator.user_id, event.userId, event.user_id),
  };
}

function parseCallbackPayload(value, depth = 0) {
  if (depth > 3 || value == null) return null;
  if (typeof value === "string") {
    const match = value.match(CALLBACK_RE);
    if (match) return { nonce: match[1], action: match[2].toLowerCase() };
    const suggestionMatch = value.match(SUGGESTION_CALLBACK_RE);
    if (!suggestionMatch) return null;
    const index = Number(suggestionMatch[2]);
    return Number.isInteger(index) && index >= 0
      ? { nonce: suggestionMatch[1], action: "suggestion", index }
      : null;
  }
  if (typeof value !== "object" || Array.isArray(value)) return null;

  const nestedString = firstString(value.value, value.callback, value.callbackValue);
  if (nestedString) {
    const parsed = parseCallbackPayload(nestedString, depth + 1);
    if (parsed) return parsed;
  }

  const payload = value.clawdApproval && typeof value.clawdApproval === "object"
    ? value.clawdApproval
    : (value.approval && typeof value.approval === "object" ? value.approval : value);
  const type = firstString(payload.type, payload.kind);
  if (type !== CALLBACK_TYPE && type !== "clawd:approval") return null;
  const nonce = firstString(payload.nonce, payload.id, payload.requestId).toLowerCase();
  const action = firstString(payload.action, payload.decision).toLowerCase();
  if (!/^[a-z0-9_-]{4,64}$/.test(nonce)) return null;
  if (action === "allow" || action === "deny") return { nonce, action };
  if (action !== "suggestion") return null;
  const index = Number(payload.index);
  return Number.isInteger(index) && index >= 0 ? { nonce, action, index } : null;
}

function parseFeishuCardAction(event) {
  if (!event || typeof event !== "object") return null;
  const callback = parseCallbackPayload(event.value)
    || parseCallbackPayload(event.action && event.action.value)
    || parseCallbackPayload(event.event && event.event.action && event.event.action.value)
    || parseCallbackPayload(event.raw && event.raw.action && event.raw.action.value);
  if (!callback) return null;
  return {
    nonce: callback.nonce,
    action: callback.action,
    ...(callback.action === "suggestion" ? { index: callback.index } : {}),
    ...cardActionContext(event),
  };
}

function parseElicitPayload(value, depth = 0) {
  if (depth > 3 || value == null) return null;
  if (typeof value === "string") {
    const match = value.match(ELICIT_CALLBACK_RE);
    if (!match) return null;
    const questionIndex = Number(match[2]);
    const optionIndex = Number(match[3]);
    return Number.isInteger(questionIndex) && questionIndex >= 0 && Number.isInteger(optionIndex) && optionIndex >= 0
      ? { nonce: match[1].toLowerCase(), questionIndex, optionIndex }
      : null;
  }
  if (typeof value !== "object" || Array.isArray(value)) return null;

  const nestedString = firstString(value.value, value.callback, value.callbackValue);
  if (nestedString) {
    const parsed = parseElicitPayload(nestedString, depth + 1);
    if (parsed) return parsed;
  }

  const payload = value.clawdElicit && typeof value.clawdElicit === "object" ? value.clawdElicit : value;
  const type = firstString(payload.type, payload.kind);
  if (type !== ELICIT_CALLBACK_TYPE && type !== "clawd:elicit") return null;
  const nonce = firstString(payload.nonce, payload.id, payload.requestId).toLowerCase();
  if (!/^[a-z0-9_-]{4,64}$/.test(nonce)) return null;
  const questionIndex = Number(payload.questionIndex);
  const optionIndex = Number(payload.optionIndex);
  return Number.isInteger(questionIndex) && questionIndex >= 0 && Number.isInteger(optionIndex) && optionIndex >= 0
    ? { nonce, questionIndex, optionIndex }
    : null;
}

function parseFeishuElicitAction(event) {
  if (!event || typeof event !== "object") return null;
  const callback = parseElicitPayload(event.value)
    || parseElicitPayload(event.action && event.action.value)
    || parseElicitPayload(event.event && event.event.action && event.event.action.value)
    || parseElicitPayload(event.raw && event.raw.action && event.raw.action.value);
  if (!callback) return null;
  return {
    nonce: callback.nonce,
    questionIndex: callback.questionIndex,
    optionIndex: callback.optionIndex,
    ...cardActionContext(event),
  };
}

function parseFeishuStatusAction(event) {
  if (!event || typeof event !== "object") return null;
  const callback = parseStatusPayload(event.value)
    || parseStatusPayload(event.action && event.action.value)
    || parseStatusPayload(event.event && event.event.action && event.event.action.value)
    || parseStatusPayload(event.raw && event.raw.action && event.raw.action.value);
  if (!callback) return null;
  return {
    action: callback.action,
    ...cardActionContext(event),
  };
}

module.exports = {
  buildFeishuApprovalCard,
  buildFeishuResolvedCard,
  buildFeishuStatusCard,
  buildFeishuQuestionCard,
  callbackValue,
  elicitCallbackValue,
  compactCardText,
  parseFeishuCardAction,
  parseFeishuElicitAction,
  parseFeishuStatusAction,
};
