"use strict";

// Health Reminder runtime orchestrator (fork extension).
//
// Owns the per-reminder timers and decides, on each fire, whether to show the
// (independent, persistent) bubble and whether the pet body is free to play the
// reminder's body animation. All side-effecting collaborators — the clock,
// timers, config/state providers, and the bubble/animation actors — are injected
// so the scheduling + gating logic is unit-testable without Electron.
//
//   showBubble(reminder)        — show/stack the persistent health bubble
//   dismissBubble(id)           — remove a health bubble
//   playBodyAnimation(reminder) — play the body animation on the pet (idle only)
//
// The bubble is independent of the upstream permission/notification bubbles, so
// task reminders and health reminders never interrupt or dismiss each other.

const { computeNextFire, adaptiveIntervalMinutes, deferPastQuietHours } = require("./health-reminder/scheduler");
const { shouldFire, canPlayBodyAnimation } = require("./health-reminder/gate");

const MS_PER_MINUTE = 60 * 1000;

function createHealthReminderRuntime(deps = {}) {
  const now = deps.now || (() => Date.now());
  const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer || ((handle) => clearTimeout(handle));
  const getConfig = deps.getConfig || (() => ({ enabled: false, reminders: [] }));
  const getDisplayState = deps.getDisplayState || (() => "idle");
  const isDnd = deps.isDnd || (() => false);
  const showBubble = deps.showBubble || (() => {});
  const dismissBubble = deps.dismissBubble || (() => {});
  const playBodyAnimation = deps.playBodyAnimation || (() => {});
  const playSound = deps.playSound || (() => {});
  const isUserActive = deps.isUserActive || (() => true);
  const recordStat = deps.recordStat || (() => {}); // V2-P7, only called when statsEnabled
  // V3: task cards take priority over health bubbles. When a task bubble is
  // present, health reminders defer; an open health bubble exits the moment a
  // task arrives and is re-queued (NOT acknowledged) until the task clears.
  const hasActiveTaskBubble = deps.hasActiveTaskBubble || (() => false);

  const timers = new Map(); // reminderId -> timer handle
  const lastFired = new Map(); // reminderId -> ts
  const snoozeStreak = new Map(); // reminderId -> consecutive snoozes (V2-P5 adaptiveInterval)
  const openBubbles = new Map(); // reminderId -> { reminder, pendingBodyAnim }
  const deferredQueue = new Map(); // reminderId -> reminder (waiting for task cards to clear)
  let displayState = getDisplayState();
  let started = false;

  function clearAllTimers() {
    for (const handle of timers.values()) clearTimer(handle);
    timers.clear();
  }

  function config() {
    return getConfig() || { enabled: false, reminders: [] };
  }

  function isMasterEnabled() {
    return config().enabled === true;
  }

  function allReminders() {
    const reminders = config().reminders;
    return Array.isArray(reminders) ? reminders : [];
  }

  function enabledReminders() {
    if (!isMasterEnabled()) return [];
    return allReminders().filter((reminder) => reminder && reminder.enabled !== false);
  }

  function findReminder(id) {
    return allReminders().find((reminder) => reminder && reminder.id === id) || null;
  }

  function gateContext() {
    const cfg = config();
    return {
      dnd: isDnd(),
      respectDnd: cfg.respectDnd !== false,
      quietHours: cfg.quietHours,
      onlyWhenActive: cfg.onlyWhenActive === true,
      userActive: isUserActive(),
    };
  }

  // V2-P5 adaptiveInterval: when on, stretch an interval reminder's cadence by
  // its consecutive-snooze streak. Returns the reminder unchanged otherwise.
  function effectiveReminder(reminder) {
    const cfg = config();
    const schedule = reminder.schedule || {};
    if (!cfg.adaptiveInterval || schedule.type !== "interval") return reminder;
    const minutes = adaptiveIntervalMinutes(
      schedule.intervalMinutes,
      snoozeStreak.get(reminder.id) || 0,
      { enabled: true }
    );
    if (minutes === schedule.intervalMinutes) return reminder;
    return { ...reminder, schedule: { ...schedule, intervalMinutes: minutes } };
  }

  function scheduleReminder(reminder, fromTs) {
    const existing = timers.get(reminder.id);
    if (existing) clearTimer(existing);
    timers.delete(reminder.id);
    const base = Number.isFinite(fromTs) ? fromTs : now();
    let nextTs = computeNextFire(effectiveReminder(reminder), base, { lastFiredTs: lastFired.get(reminder.id) });
    if (nextTs == null) return;
    if (config().deferPastQuietHours) {
      nextTs = deferPastQuietHours(nextTs, config().quietHours, { enabled: true });
    }
    const delay = Math.max(0, nextTs - now());
    const handle = setTimer(() => {
      timers.delete(reminder.id);
      fire(reminder.id);
    }, delay);
    timers.set(reminder.id, handle);
  }

  function rescheduleAll() {
    clearAllTimers();
    for (const reminder of enabledReminders()) scheduleReminder(reminder);
  }

  // Show the bubble and, when the pet body is free, play the body animation.
  // Shared by scheduled fires and the manual test trigger.
  function present(reminder) {
    showBubble(reminder);
    if (reminder.sound) playSound(reminder.sound);
    const entry = { reminder, pendingBodyAnim: false };
    openBubbles.set(reminder.id, entry);
    if (reminder.animationKey && reminder.animationKey !== "none" && !config().reduceMotion) {
      if (canPlayBodyAnimation(displayState)) {
        playBodyAnimation(reminder);
      } else {
        entry.pendingBodyAnim = true; // replay when the body next becomes free
      }
    }
  }

  // Fired by a scheduled timer: honours the quiet/DND gate, then continues the
  // cadence regardless (so a skipped quiet-hours fire still reschedules).
  function fire(id) {
    const reminder = findReminder(id);
    if (!reminder || reminder.enabled === false || !isMasterEnabled()) return;
    lastFired.set(id, now());
    if (shouldFire(new Date(now()), gateContext())) {
      if (hasActiveTaskBubble()) {
        // Task card is showing — defer this reminder until it clears.
        deferredQueue.set(id, reminder);
      } else {
        present(reminder);
        if (config().statsEnabled) recordStat("fired", id);
      }
    }
    scheduleReminder(reminder);
  }

  // Acknowledge one reminder: drop its bubble, reset its adaptive-interval
  // streak, and resume its normal cadence. Shared by handleConfirm + dismissAllOpen.
  function confirmReminder(id) {
    openBubbles.delete(id);
    snoozeStreak.set(id, 0);
    if (config().statsEnabled) recordStat("confirmed", id);
    dismissBubble(id);
    const reminder = findReminder(id);
    if (reminder && reminder.enabled !== false) scheduleReminder(reminder);
  }

  return {
    start() {
      if (started) return;
      started = true;
      displayState = getDisplayState();
      rescheduleAll();
    },
    stop() {
      started = false;
      clearAllTimers();
    },
    refresh() {
      if (started) rescheduleAll();
    },
    // Pet display-state changed. When the body goes from busy -> free, replay any
    // body animations that were deferred while their bubble stayed open.
    notifyDisplayState(state) {
      const wasFree = canPlayBodyAnimation(displayState);
      displayState = state;
      if (!wasFree && canPlayBodyAnimation(displayState)) {
        for (const entry of openBubbles.values()) {
          if (entry.pendingBodyAnim) {
            playBodyAnimation(entry.reminder);
            entry.pendingBodyAnim = false;
          }
        }
      }
    },
    handleConfirm(id) {
      confirmReminder(id);
    },
    // "Dismiss all" (V2-P6): acknowledge every currently-open health bubble.
    dismissAllOpen() {
      for (const id of [...openBubbles.keys()]) confirmReminder(id);
    },
    // V3 task priority: a task card appeared. Every open health bubble exits
    // immediately and is re-queued (NOT acknowledged — no confirm/snooze, the
    // cadence timer is left untouched) so it can be restored when the task ends.
    onTaskActive() {
      for (const [id, entry] of openBubbles) {
        dismissBubble(id);
        deferredQueue.set(id, entry.reminder);
      }
      openBubbles.clear();
    },
    // V3 task priority: the task card(s) cleared — restore deferred reminders.
    onTaskCleared() {
      if (hasActiveTaskBubble()) return; // a task is still up; wait.
      const pending = [...deferredQueue.values()];
      deferredQueue.clear();
      if (!isMasterEnabled()) return;
      for (const reminder of pending) {
        const current = findReminder(reminder.id);
        if (current && current.enabled !== false) present(current);
      }
    },
    handleSnooze(id) {
      const reminder = findReminder(id);
      openBubbles.delete(id);
      snoozeStreak.set(id, (snoozeStreak.get(id) || 0) + 1); // feeds adaptiveInterval
      if (config().statsEnabled) recordStat("snoozed", id);
      dismissBubble(id);
      if (!reminder) return;
      const existing = timers.get(id);
      if (existing) clearTimer(existing);
      const snoozeMs = (reminder.snoozeMinutes || 10) * MS_PER_MINUTE;
      const handle = setTimer(() => { timers.delete(id); fire(id); }, snoozeMs);
      timers.set(id, handle);
    },
    // Manual "test once" from Settings — bypasses the quiet/DND gate so the user
    // can preview the reminder immediately.
    triggerTest(id) {
      const reminder = findReminder(id);
      if (!reminder) return { status: "error", message: "healthReminder.test: unknown reminder id" };
      present(reminder);
      return { status: "ok" };
    },
    getStatus() {
      return {
        started,
        scheduled: timers.size,
        openBubbles: openBubbles.size,
        displayState,
      };
    },
  };
}

module.exports = createHealthReminderRuntime;
