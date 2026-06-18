"use strict";

// Pure geometry for the health-reminder bubble stack (fork extension, v3).
//
// Mirrors the screen-aware intent of permission.js computeBubbleStackLayout but
// is tailored to health bubbles: independent cards that GROW UPWARD (the newest
// reminder sits at the baseline; older ones are pushed up), clamped fully inside
// the work area, and — in followPet mode — placed beside the pet without ever
// occluding it. No Electron deps so the rules are exhaustively unit-testable.
//
//   computeHealthStackLayout({ mode, workArea, petHitRect, bubbleWidth,
//                              bubbleHeights, gap, margin, maxVisible })
//     -> { bounds: Array<{x,y,width,height}|null>, visibleCount }
//
// bubbleHeights is in insertion order (oldest first, newest last). bounds[i]
// aligns with that input; hidden (overflow) entries are null. The oldest entries
// are the ones hidden when the stack exceeds maxVisible or the work area.

function clamp(value, lo, hi) {
  if (hi < lo) return lo;
  return Math.min(Math.max(value, lo), hi);
}

function rectInside(rect, wa, margin) {
  return rect.x >= wa.x + margin - 0.001
    && rect.y >= wa.y + margin - 0.001
    && rect.x + rect.width <= wa.x + wa.width - margin + 0.001
    && rect.y + rect.height <= wa.y + wa.height - margin + 0.001;
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function computeHealthStackLayout({
  mode = "followPet",
  workArea,
  petHitRect = null,
  bubbleWidth,
  bubbleHeights = [],
  gap = 8,
  margin = 8,
  maxVisible = 3,
} = {}) {
  const wa = workArea && Number.isFinite(workArea.width) ? workArea : { x: 0, y: 0, width: 1920, height: 1080 };
  const width = Number.isFinite(bubbleWidth) && bubbleWidth > 0 ? bubbleWidth : 240;
  const heights = Array.isArray(bubbleHeights) ? bubbleHeights : [];
  const n = heights.length;
  const bounds = new Array(n).fill(null);
  if (n === 0) return { bounds, visibleCount: 0 };

  const usableH = Math.max(0, wa.height - 2 * margin);

  // Height of the stack formed by the LAST k bubbles (newest), with gaps.
  const stackHeight = (k) => {
    let sum = 0;
    for (let i = n - k; i < n; i += 1) sum += heights[i];
    return sum + gap * Math.max(0, k - 1);
  };

  // Visible = the newest min(maxVisible, n) bubbles, reduced further if even
  // that would overflow the work area's usable height.
  let visibleCount = Math.min(Math.max(1, Math.round(maxVisible) || 1), n);
  while (visibleCount > 1 && stackHeight(visibleCount) > usableH) visibleCount -= 1;
  const totalH = stackHeight(visibleCount);

  // X must keep the card fully on-screen.
  const minX = wa.x + margin;
  const maxX = wa.x + wa.width - margin - width;
  // baseline = bottom edge of the newest bubble; the stack extends up from it.
  const minBaseline = wa.y + margin + totalH;
  const maxBaseline = wa.y + wa.height - margin;

  function place(x0, baseline) {
    const safeX = clamp(x0, minX, maxX);
    const safeBaseline = clamp(baseline, minBaseline, maxBaseline);
    return { x: safeX, baseline: safeBaseline };
  }

  let chosen = null;

  if (mode === "followPet" && petHitRect && Number.isFinite(petHitRect.left) && Number.isFinite(petHitRect.right)) {
    // The pet hit-rect is {left,top,right,bottom} app-wide (getHitRectScreen /
    // permission.js). Convert to x/y/width/height for the candidate + intersect
    // math below. (Reading petHitRect.width directly was the v3.2 bug: it was
    // always undefined, so followPet silently fell through to the corner.)
    const pet = {
      x: petHitRect.left,
      y: petHitRect.top,
      width: petHitRect.right - petHitRect.left,
      height: petHitRect.bottom - petHitRect.top,
    };
    const bottomAligned = pet.y + pet.height; // bottom of stack near bottom of pet
    const candidates = [
      { x: pet.x + pet.width + gap, baseline: bottomAligned }, // right of pet
      { x: pet.x - gap - width, baseline: bottomAligned }, // left of pet
      { x: pet.x + pet.width / 2 - width / 2, baseline: pet.y - gap }, // above pet
      { x: pet.x + pet.width / 2 - width / 2, baseline: pet.y + pet.height + gap + totalH }, // below pet
    ];
    for (const candidate of candidates) {
      const { x, baseline } = place(candidate.x, candidate.baseline);
      const rect = { x, y: baseline - totalH, width, height: totalH };
      if (rectInside(rect, wa, margin) && !rectsIntersect(rect, pet)) {
        chosen = { x, baseline };
        break;
      }
    }
  }

  if (!chosen) {
    // corner mode, or followPet fallback when the pet leaves no clear room:
    // bottom-right of the work area.
    chosen = place(maxX, maxBaseline);
  }

  // Lay the visible bubbles from newest (bottom) upward.
  let bottom = chosen.baseline;
  for (let i = n - 1; i >= n - visibleCount; i -= 1) {
    const h = heights[i];
    const y = bottom - h;
    bounds[i] = { x: Math.round(chosen.x), y: Math.round(y), width, height: h };
    bottom = y - gap;
  }

  return { bounds, visibleCount };
}

module.exports = { computeHealthStackLayout };
