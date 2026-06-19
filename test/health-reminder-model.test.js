"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeReminder,
  validateReminder,
  normalizeConfig,
} = require("../src/health-reminder/reminder-model");

test("normalizeReminder fills defaults and generates an id when missing", () => {
  const r = normalizeReminder({ label: "喝水" });
  assert.equal(typeof r.id, "string");
  assert.match(r.id, /^hr_/);
  assert.equal(r.enabled, true);
  assert.equal(r.label, "喝水");
  assert.equal(r.animationKey, "none");
  assert.equal(r.snoozeMinutes, 10);
  assert.equal(r.schedule.type, "interval");
});

test("normalizeReminder preserves provided valid values", () => {
  const r = normalizeReminder({
    id: "hr_keepme",
    enabled: false,
    label: "下班",
    message: "到点下班",
    animationKey: "offwork",
    snoozeMinutes: 20,
    schedule: { type: "daily", times: ["18:30"], days: [1, 2, 3, 4, 5] },
  });
  assert.equal(r.id, "hr_keepme");
  assert.equal(r.enabled, false);
  assert.equal(r.animationKey, "offwork");
  assert.equal(r.snoozeMinutes, 20);
});

test("normalizeReminder sanitizes schedule: clamps interval, filters days/times", () => {
  const r = normalizeReminder({
    schedule: {
      type: "daily",
      intervalMinutes: 0,
      times: ["12:00", "bad", "25:00", "08:30", "12:00"],
      days: [1, 5, 9, 5, -1],
    },
  });
  assert.deepEqual(r.schedule.times, ["08:30", "12:00"]); // valid, deduped, time-sorted
  assert.deepEqual(r.schedule.days, [1, 5]); // 0..6, deduped, sorted
  assert.equal(r.schedule.intervalMinutes >= 1, true); // clamped up from 0
});

test("normalizeReminder clamps snoozeMinutes to at least 1", () => {
  assert.equal(normalizeReminder({ snoozeMinutes: 0 }).snoozeMinutes, 1);
  assert.equal(normalizeReminder({ snoozeMinutes: -5 }).snoozeMinutes, 1);
});

test("validateReminder accepts a well-formed interval reminder", () => {
  const res = validateReminder({ schedule: { type: "interval", intervalMinutes: 45 } });
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
});

test("validateReminder rejects a daily reminder with no valid times", () => {
  const res = validateReminder({ schedule: { type: "daily", times: ["nope"] } });
  assert.equal(res.ok, false);
  assert.equal(res.errors.length >= 1, true);
});

test("validateReminder rejects an interval reminder with non-positive interval", () => {
  assert.equal(validateReminder({ schedule: { type: "interval", intervalMinutes: 0 } }).ok, false);
});

test("normalizeConfig applies safe top-level defaults (master off)", () => {
  const c = normalizeConfig({});
  assert.equal(c.enabled, false);
  assert.equal(c.respectDnd, true);
  assert.equal(c.quietHours.enabled, false);
  assert.equal(c.quietHours.start, "22:00");
  assert.equal(c.quietHours.end, "08:00");
  assert.equal(c.autoCollapseMinutes, 0);
  assert.deepEqual(c.reminders, []);
  // v3: display mode defaults to followPet.
  assert.equal(c.displayMode, "followPet");
});

test("normalizeConfig normalizes displayMode to followPet|corner", () => {
  assert.equal(normalizeConfig({}).displayMode, "followPet");
  assert.equal(normalizeConfig({ displayMode: "corner" }).displayMode, "corner");
  assert.equal(normalizeConfig({ displayMode: "followPet" }).displayMode, "followPet");
  assert.equal(normalizeConfig({ displayMode: "bogus" }).displayMode, "followPet");
  assert.equal(normalizeConfig({ displayMode: 123 }).displayMode, "followPet");
});

test("normalizeConfig normalizes nested reminders and drops non-objects", () => {
  const c = normalizeConfig({ enabled: true, reminders: [{ label: "喝水" }, "garbage", null] });
  assert.equal(c.enabled, true);
  assert.equal(c.reminders.length, 1);
  assert.equal(c.reminders[0].label, "喝水");
  assert.match(c.reminders[0].id, /^hr_/);
});
