"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { computeHealthStackLayout } = require("../src/health-reminder/bubble-layout");

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1080 };

function rectInside(rect, wa, margin = 0) {
  return rect.x >= wa.x + margin - 0.001
    && rect.y >= wa.y + margin - 0.001
    && rect.x + rect.width <= wa.x + wa.width - margin + 0.001
    && rect.y + rect.height <= wa.y + wa.height - margin + 0.001;
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test("corner mode anchors a single bubble at the bottom-right of the work area", () => {
  const { bounds, visibleCount } = computeHealthStackLayout({
    mode: "corner",
    workArea: WORK_AREA,
    bubbleWidth: 240,
    bubbleHeights: [96],
    gap: 8,
    margin: 12,
    maxVisible: 3,
  });
  assert.equal(visibleCount, 1);
  assert.equal(bounds.length, 1);
  assert.ok(rectInside(bounds[0], WORK_AREA, 12));
  // bottom-right: right edge near work-area right, bottom near work-area bottom
  assert.equal(bounds[0].x, 1920 - 12 - 240);
  assert.equal(bounds[0].y + bounds[0].height, 1080 - 12);
});

test("stack grows upward: newest (last) sits lowest, older pushed up, no overlap", () => {
  const { bounds } = computeHealthStackLayout({
    mode: "corner",
    workArea: WORK_AREA,
    bubbleWidth: 240,
    bubbleHeights: [80, 90, 100], // oldest -> newest
    gap: 8,
    margin: 12,
    maxVisible: 3,
  });
  // newest (index 2) is the lowest on screen (largest y)
  assert.ok(bounds[2].y > bounds[1].y);
  assert.ok(bounds[1].y > bounds[0].y);
  // newest bottom is the baseline
  assert.equal(bounds[2].y + bounds[2].height, 1080 - 12);
  // stacked with the gap, no overlap
  assert.equal(bounds[1].y + bounds[1].height, bounds[2].y - 8);
  assert.equal(bounds[0].y + bounds[0].height, bounds[1].y - 8);
  for (const b of bounds) assert.ok(rectInside(b, WORK_AREA, 12));
});

test("caps visible to maxVisible, hiding the oldest (lowest indices)", () => {
  const { bounds, visibleCount } = computeHealthStackLayout({
    mode: "corner",
    workArea: WORK_AREA,
    bubbleWidth: 240,
    bubbleHeights: [80, 80, 80, 80, 80], // 5 reminders
    gap: 8,
    margin: 12,
    maxVisible: 3,
  });
  assert.equal(visibleCount, 3);
  // oldest two hidden
  assert.equal(bounds[0], null);
  assert.equal(bounds[1], null);
  // newest three visible
  assert.ok(bounds[2] && bounds[3] && bounds[4]);
});

test("reduces visible count further when even maxVisible would overflow the top", () => {
  const smallArea = { x: 0, y: 0, width: 400, height: 240 };
  const { bounds, visibleCount } = computeHealthStackLayout({
    mode: "corner",
    workArea: smallArea,
    bubbleWidth: 240,
    bubbleHeights: [100, 100, 100],
    gap: 8,
    margin: 12,
    maxVisible: 3,
  });
  // 240 tall area, margins 12 => ~216 usable; only 2 x100 (+gap) fit, not 3.
  assert.ok(visibleCount < 3);
  for (const b of bounds) if (b) assert.ok(rectInside(b, smallArea, 12), JSON.stringify(b));
});

// The pet hit-rect is {left,top,right,bottom} everywhere in the app
// (getHitRectScreen / permission.js). These tests feed THAT real shape so the
// layout can't silently regress to reading {x,y,width,height} and falling back
// to the corner (the v3.2 bug).
function petBox(pet) {
  return { x: pet.left, y: pet.top, width: pet.right - pet.left, height: pet.bottom - pet.top };
}

test("followPet places the stack just beside the pet (real {left,top,right,bottom} hit rect)", () => {
  const pet = { left: 900, top: 500, right: 1020, bottom: 620 };
  const { bounds } = computeHealthStackLayout({
    mode: "followPet",
    workArea: WORK_AREA,
    petHitRect: pet,
    bubbleWidth: 240,
    bubbleHeights: [96, 96],
    gap: 8,
    margin: 12,
    maxVisible: 3,
  });
  // followPet actually followed: to the RIGHT of the pet, NOT the screen corner.
  assert.equal(bounds[1].x, pet.right + 8, "stack should sit just right of the pet");
  assert.notEqual(bounds[1].x, 1920 - 12 - 240, "must not fall back to the screen corner");
  for (const b of bounds) {
    assert.ok(rectInside(b, WORK_AREA, 12));
    assert.ok(!rectsIntersect(b, petBox(pet)), `bubble ${JSON.stringify(b)} overlaps pet`);
  }
});

test("followPet flips to the pet's left when the pet sits near the right edge", () => {
  const pet = { left: 1700, top: 900, right: 1820, bottom: 1020 };
  const { bounds } = computeHealthStackLayout({
    mode: "followPet",
    workArea: WORK_AREA,
    petHitRect: pet,
    bubbleWidth: 240,
    bubbleHeights: [96],
    gap: 8,
    margin: 12,
    maxVisible: 3,
  });
  // no room on the pet's right, so it flips to the pet's left (still beside the pet).
  assert.equal(bounds[0].x, pet.left - 8 - 240, "stack should flip to the pet's left");
  assert.ok(rectInside(bounds[0], WORK_AREA, 12));
  assert.ok(!rectsIntersect(bounds[0], petBox(pet)));
});

test("returns an empty layout for no reminders", () => {
  const { bounds, visibleCount } = computeHealthStackLayout({
    mode: "corner",
    workArea: WORK_AREA,
    bubbleWidth: 240,
    bubbleHeights: [],
  });
  assert.deepEqual(bounds, []);
  assert.equal(visibleCount, 0);
});
