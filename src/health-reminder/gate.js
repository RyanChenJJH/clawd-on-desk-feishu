"use strict";

// Pure logic: the two "gates" that protect the user's focus.
//   - shouldFire: may a reminder fire at all right now? (DND + quiet hours)
//   - canPlayBodyAnimation: is the pet body free to play a one-shot health
//     animation? (only when idle/resting — never preempts a task animation)
// No Electron / Node-host dependencies.

const { isWithinQuietHours } = require("./quiet-hours");

// The only display states in which the pet body is free to play a one-shot
// health animation. Everything else (task states working/thinking/juggling,
// one-shot states attention/error/sweeping/notification/carrying, and the
// sleep-transition states yawning/dozing/collapsing/waking) is treated as
// "busy" so a reminder never preempts it. Unknown states default to busy.
const BODY_FREE_STATES = new Set(["idle", "sleeping"]);

function shouldFire(now, context = {}) {
  if (context.respectDnd && context.dnd) return false;
  // onlyWhenActive (V2-P5, opt-in): suppress while the user is away. Only acts
  // when explicitly told the user is inactive, so an absent flag never blocks.
  if (context.onlyWhenActive && context.userActive === false) return false;
  if (isWithinQuietHours(now, context.quietHours)) return false;
  return true;
}

function canPlayBodyAnimation(displayState) {
  return BODY_FREE_STATES.has(displayState);
}

module.exports = { shouldFire, canPlayBodyAnimation, BODY_FREE_STATES };
