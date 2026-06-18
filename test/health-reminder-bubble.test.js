"use strict";

// V2-P6: the bubble controller stacks up to a CONFIGURABLE number of bubbles
// (v1 was a fixed 3); extras are queued (hidden) until a slot frees. dismissAll
// tears every bubble down. Electron's BrowserWindow is faked so the stacking /
// queue / teardown logic is unit-testable.

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const createHealthBubbleController = require("../src/health-reminder-bubble");
const { normalizeConfig } = require("../src/health-reminder/reminder-model");

function makeFakeBrowserWindow() {
  const instances = [];
  class FakeWin {
    constructor() {
      this.visible = false;
      this.destroyed = false;
      this.bounds = null;
      this._loadCb = null;
      // did-finish-load is async in Electron — it fires AFTER show() finishes
      // registering the window. Capture the callback; flushLoads() fires them.
      this.webContents = {
        once: (evt, cb) => { if (evt === "did-finish-load") this._loadCb = cb; },
        send: () => {},
      };
      instances.push(this);
    }
    setAlwaysOnTop() {}
    loadFile() {}
    setBounds(b) { this.bounds = b; }
    showInactive() { this.visible = true; }
    show() { this.visible = true; }
    hide() { this.visible = false; }
    isVisible() { return this.visible; }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.visible = false; }
  }
  FakeWin.instances = instances;
  FakeWin.flushLoads = () => {
    for (const w of instances) { const cb = w._loadCb; w._loadCb = null; if (cb) cb(); }
  };
  return FakeWin;
}

function showN(ctrl, FakeWin, n) {
  for (let i = 1; i <= n; i += 1) ctrl.show({ id: `hr_${i}`, label: `R${i}`, message: "" });
  FakeWin.flushLoads(); // simulate all windows finishing load -> final layout
}

describe("health bubble controller stacking", () => {
  it("shows at most maxVisible bubbles and queues the rest", () => {
    const FakeWin = makeFakeBrowserWindow();
    const ctrl = createHealthBubbleController({ BrowserWindow: FakeWin, getMaxVisible: () => 2 });
    showN(ctrl, FakeWin, 3);
    const visible = FakeWin.instances.filter((w) => w.visible).length;
    assert.equal(visible, 2, "only maxVisible (2) bubbles visible");
    assert.equal(FakeWin.instances.length, 3, "all three windows created");
  });

  it("defaults to 3 visible when no max is provided", () => {
    const FakeWin = makeFakeBrowserWindow();
    const ctrl = createHealthBubbleController({ BrowserWindow: FakeWin });
    showN(ctrl, FakeWin, 4);
    assert.equal(FakeWin.instances.filter((w) => w.visible).length, 3);
  });

  it("dismissAll destroys every bubble window", () => {
    const FakeWin = makeFakeBrowserWindow();
    const ctrl = createHealthBubbleController({ BrowserWindow: FakeWin, getMaxVisible: () => 3 });
    showN(ctrl, FakeWin, 3);
    ctrl.dismissAll();
    assert.ok(FakeWin.instances.every((w) => w.destroyed));
    assert.equal(ctrl.has("hr_1"), false);
  });

  it("frees a queued bubble when a visible one is dismissed", () => {
    const FakeWin = makeFakeBrowserWindow();
    const ctrl = createHealthBubbleController({ BrowserWindow: FakeWin, getMaxVisible: () => 2 });
    showN(ctrl, FakeWin, 3);
    ctrl.dismiss("hr_1"); // free a slot -> layout promotes the queued one
    const visible = FakeWin.instances.filter((w) => !w.destroyed && w.visible).length;
    assert.equal(visible, 2, "third bubble promoted into the freed slot");
  });
});

describe("health bubble controller v3 positioning", () => {
  const WA = { x: 0, y: 0, width: 1280, height: 800 };

  function rectsIntersect(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  it("keeps every visible bubble inside the work area and stacks newest at the bottom", () => {
    const FakeWin = makeFakeBrowserWindow();
    const ctrl = createHealthBubbleController({
      BrowserWindow: FakeWin,
      getMode: () => "corner",
      getWorkArea: () => WA,
      getMaxVisible: () => 3,
    });
    showN(ctrl, FakeWin, 2);
    const [first, second] = FakeWin.instances; // hr_1 (oldest), hr_2 (newest)
    for (const w of FakeWin.instances) {
      assert.ok(w.bounds, "bubble was positioned");
      assert.ok(w.bounds.x >= WA.x && w.bounds.x + w.bounds.width <= WA.x + WA.width, "x in work area");
      assert.ok(w.bounds.y >= WA.y && w.bounds.y + w.bounds.height <= WA.y + WA.height, "y in work area");
    }
    // newest (hr_2) sits lower on screen than the older one
    assert.ok(second.bounds.y > first.bounds.y, "newest bubble is below the older one");
  });

  it("followPet hugs the pet (real {left,top,right,bottom} rect), never the corner or over the pet", () => {
    const FakeWin = makeFakeBrowserWindow();
    // Real app shape — getHitRectScreen returns {left,top,right,bottom}.
    const pet = { left: 600, top: 380, right: 720, bottom: 500 };
    const petBox = { x: pet.left, y: pet.top, width: pet.right - pet.left, height: pet.bottom - pet.top };
    const ctrl = createHealthBubbleController({
      BrowserWindow: FakeWin,
      getMode: () => "followPet",
      getWorkArea: () => WA,
      getPetHitRect: () => pet,
      getMaxVisible: () => 3,
    });
    showN(ctrl, FakeWin, 2);
    for (const w of FakeWin.instances) {
      assert.ok(w.bounds, "bubble was positioned");
      assert.ok(!rectsIntersect(w.bounds, petBox), `bubble ${JSON.stringify(w.bounds)} overlaps pet`);
      // followed the pet: hugging its right edge, NOT the screen corner.
      assert.ok(
        w.bounds.x >= pet.right && w.bounds.x <= pet.right + 30,
        `bubble x ${w.bounds.x} should hug the pet's right edge, not jump to the corner`
      );
    }
  });
});

describe("maxVisibleBubbles config", () => {
  it("defaults to 3 and clamps to [1,5]", () => {
    assert.equal(normalizeConfig({}).maxVisibleBubbles, 3);
    assert.equal(normalizeConfig({ maxVisibleBubbles: 1 }).maxVisibleBubbles, 1);
    assert.equal(normalizeConfig({ maxVisibleBubbles: 99 }).maxVisibleBubbles, 5);
    assert.equal(normalizeConfig({ maxVisibleBubbles: 0 }).maxVisibleBubbles, 1);
  });
});
