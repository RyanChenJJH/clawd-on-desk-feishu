"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildFeishuApprovalCard,
  buildFeishuResolvedCard,
  buildFeishuStatusCard,
  buildFeishuQuestionCard,
  elicitCallbackValue,
  callbackValue,
  parseFeishuCardAction,
  parseFeishuElicitAction,
  parseFeishuStatusAction,
} = require("../src/feishu-card-builder");

test("buildFeishuApprovalCard creates a v2 card with allow once and deny callbacks", () => {
  const card = buildFeishuApprovalCard({
    nonce: "n123",
    title: "codex requests Bash",
    detail: "Summary: Run tests",
  });

  assert.equal(card.schema, "2.0");
  assert.equal(card.header.title.content, "codex requests Bash");
  assert.match(card.body.elements[0].content, /Summary: Run tests/);

  const buttonRow = card.body.elements.find((element) => element.tag === "column_set");
  const buttons = buttonRow.columns.map((column) => column.elements[0]);
  assert.deepEqual(buttons.map((button) => button.text.content), ["Allow once", "Deny"]);
  assert.deepEqual(buttons.map((button) => button.behaviors[0]), [
    { type: "callback", value: { type: "clawd.approval", nonce: "n123", action: "allow" } },
    { type: "callback", value: { type: "clawd.approval", nonce: "n123", action: "deny" } },
  ]);
});

test("parseFeishuCardAction accepts SDK cardAction events and callback values", () => {
  assert.deepEqual(parseFeishuCardAction({
    messageId: "om_1",
    chatId: "oc_1",
    operator: { openId: "ou_1", userId: "u_1" },
    action: { value: "clawd:approval:n123:deny", tag: "button" },
  }), {
    nonce: "n123",
    action: "deny",
    messageId: "om_1",
    chatId: "oc_1",
    openId: "ou_1",
    userId: "u_1",
  });

  assert.equal(parseFeishuCardAction({ action: { value: "other" } }), null);
});

test("parseFeishuCardAction accepts object callback values from real card actions", () => {
  assert.deepEqual(parseFeishuCardAction({
    messageId: "om_1",
    chatId: "oc_1",
    operator: { openId: "ou_1", userId: "u_1" },
    action: {
      value: { type: "clawd.approval", nonce: "n123", action: "allow" },
      tag: "button",
    },
  }), {
    nonce: "n123",
    action: "allow",
    messageId: "om_1",
    chatId: "oc_1",
    openId: "ou_1",
    userId: "u_1",
  });

  assert.deepEqual(parseFeishuCardAction({
    messageId: "om_2",
    chatId: "oc_1",
    operator: { openId: "ou_1" },
    action: {
      value: { value: "clawd:approval:n456:deny" },
      tag: "button",
    },
  }).action, "deny");
});

test("parseFeishuCardAction accepts raw card.action.trigger context fields", () => {
  assert.deepEqual(parseFeishuCardAction({
    context: {
      open_message_id: "om_raw",
      open_chat_id: "oc_raw",
    },
    operator: {
      open_id: "ou_raw",
      user_id: "u_raw",
    },
    action: {
      value: { type: "clawd.approval", nonce: "nraw", action: "deny" },
      tag: "button",
    },
  }), {
    nonce: "nraw",
    action: "deny",
    messageId: "om_raw",
    chatId: "oc_raw",
    openId: "ou_raw",
    userId: "u_raw",
  });
});

test("callbackValue and resolved cards are button-free", () => {
  assert.deepEqual(callbackValue("n123", "allow"), {
    type: "clawd.approval",
    nonce: "n123",
    action: "allow",
  });

  const card = buildFeishuResolvedCard({
    title: "codex requests Bash",
    detail: "Summary: Run tests",
    status: "denied",
  });

  assert.equal(JSON.stringify(card).includes("behaviors"), false);
  assert.match(card.body.elements[0].content, /Denied/);
});

test("buildFeishuResolvedCard distinguishes timed_out / answered_elsewhere / superseded", () => {
  const timedOut = buildFeishuResolvedCard({ title: "t", detail: "d", status: "timed_out" });
  assert.match(timedOut.body.elements[0].content, /timed out/i);
  assert.doesNotMatch(timedOut.body.elements[0].content, /^\*\*Expired\*\*/);

  const elsewhere = buildFeishuResolvedCard({ title: "t", detail: "d", status: "answered_elsewhere" });
  assert.match(elsewhere.body.elements[0].content, /desktop or terminal/i);

  const superseded = buildFeishuResolvedCard({ title: "t", detail: "d", status: "superseded" });
  assert.match(superseded.body.elements[0].content, /another channel/i);

  // Backward compatibility: the legacy "expired" status still renders.
  const legacy = buildFeishuResolvedCard({ title: "t", detail: "d", status: "expired" });
  assert.match(legacy.body.elements[0].content, /Expired/);

  // None of the resolved cards carry action buttons.
  for (const c of [timedOut, elsewhere, superseded, legacy]) {
    assert.equal(JSON.stringify(c).includes("behaviors"), false);
  }
});

test("buildFeishuQuestionCard renders one button per option with elicit callbacks", () => {
  const card = buildFeishuQuestionCard({
    nonce: "nq01",
    questions: [
      { question: "Pick a color", options: ["Red", "Green", { label: "Blue" }] },
    ],
  });

  assert.ok(JSON.stringify(card).includes("Pick a color"));
  const buttons = card.body.elements.flatMap((el) =>
    el.tag === "column_set" ? el.columns.flatMap((c) => c.elements) : []);
  assert.equal(buttons.length, 3);
  assert.equal(buttons[0].text.content, "Red");
  assert.deepEqual(buttons[0].behaviors[0].value, {
    type: "clawd.elicit", nonce: "nq01", questionIndex: 0, optionIndex: 0,
  });
  assert.deepEqual(buttons[2].behaviors[0].value, {
    type: "clawd.elicit", nonce: "nq01", questionIndex: 0, optionIndex: 2,
  });
  assert.equal(buttons[2].text.content, "Blue");
  // The free-text "Other / manual input" path is advertised on the card.
  assert.match(JSON.stringify(card), /repl/i);
});

test("buildFeishuQuestionCard keeps per-question option indexes across multiple questions", () => {
  const card = buildFeishuQuestionCard({
    nonce: "nq02",
    questions: [
      { question: "Q1", options: ["a", "b"] },
      { question: "Q2", options: ["c", "d", "e"] },
    ],
  });
  const values = card.body.elements
    .filter((el) => el.tag === "column_set")
    .flatMap((el) => el.columns.flatMap((c) => c.elements))
    .map((b) => b.behaviors[0].value);
  assert.deepEqual(values.filter((v) => v.questionIndex === 0).map((v) => v.optionIndex), [0, 1]);
  assert.deepEqual(values.filter((v) => v.questionIndex === 1).map((v) => v.optionIndex), [0, 1, 2]);
});

test("elicitCallbackValue validates indexes and parseFeishuElicitAction round-trips", () => {
  const value = elicitCallbackValue("nq03", 1, 2);
  assert.deepEqual(value, { type: "clawd.elicit", nonce: "nq03", questionIndex: 1, optionIndex: 2 });
  assert.throws(() => elicitCallbackValue("nq03", -1, 0));
  assert.throws(() => elicitCallbackValue("bad nonce!", 0, 0));

  const parsed = parseFeishuElicitAction({
    messageId: "om_1",
    chatId: "oc_1",
    operator: { openId: "ou_a", userId: "u_a" },
    action: { value },
  });
  assert.equal(parsed.nonce, "nq03");
  assert.equal(parsed.questionIndex, 1);
  assert.equal(parsed.optionIndex, 2);
  assert.equal(parsed.openId, "ou_a");
  assert.equal(parsed.userId, "u_a");
});

test("parseFeishuElicitAction ignores approval/status actions", () => {
  assert.equal(parseFeishuElicitAction({ action: { value: "clawd:approval:n123:allow" } }), null);
  assert.equal(parseFeishuElicitAction({ action: { value: "clawd:status:refresh" } }), null);
});

test("buildFeishuApprovalCard renders rich approval suggestion callbacks", () => {
  const card = buildFeishuApprovalCard({
    nonce: "nrich",
    title: "claude-code requests Bash",
    detail: "Summary: Run tests",
    suggestions: [
      { index: 0, label: "Always Bash" },
      { index: 3, label: "Auto edits" },
    ],
  });

  const buttons = card.body.elements
    .filter((element) => element.tag === "column_set")
    .flatMap((row) => row.columns)
    .flatMap((column) => column.elements)
    .filter((element) => element.tag === "button");

  assert.deepEqual(buttons.map((button) => button.text.content), [
    "Allow once",
    "Deny",
    "Always Bash",
    "Auto edits",
  ]);
  assert.deepEqual(buttons.slice(2).map((button) => button.behaviors[0].value), [
    { type: "clawd.approval", nonce: "nrich", action: "suggestion", index: 0 },
    { type: "clawd.approval", nonce: "nrich", action: "suggestion", index: 3 },
  ]);

  assert.deepEqual(parseFeishuCardAction({
    operator: { openId: "ou_allowed" },
    action: {
      value: { type: "clawd.approval", nonce: "nrich", action: "suggestion", index: 3 },
    },
  }), {
    nonce: "nrich",
    action: "suggestion",
    index: 3,
    messageId: "",
    chatId: "",
    openId: "ou_allowed",
    userId: "",
  });
});

test("buildFeishuStatusCard creates a refreshable status card without approval callbacks", () => {
  const card = buildFeishuStatusCard({
    statusText: "Clawd remote approval status\nDND: off",
  });
  const json = JSON.stringify(card);

  assert.equal(card.schema, "2.0");
  assert.match(card.body.elements[0].content, /DND: off/);
  assert.equal(json.includes("clawd.approval"), false);
  assert.match(json, /clawd.status/);
  assert.match(json, /Refresh status/);
});

test("parseFeishuStatusAction accepts refresh callbacks with operator context", () => {
  assert.deepEqual(parseFeishuStatusAction({
    messageId: "om_status",
    chatId: "oc_status",
    operator: { openId: "ou_allowed", userId: "u_allowed" },
    action: {
      value: { type: "clawd.status", action: "refresh" },
      tag: "button",
    },
  }), {
    action: "refresh",
    messageId: "om_status",
    chatId: "oc_status",
    openId: "ou_allowed",
    userId: "u_allowed",
  });
  assert.equal(parseFeishuStatusAction({
    action: { value: { type: "clawd.approval", nonce: "n123", action: "allow" } },
  }), null);
});
