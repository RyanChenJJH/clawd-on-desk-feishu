"use strict";

// Manages the independent health-reminder bubble windows. Each reminder gets its
// own frameless, non-focusable BrowserWindow. v3: all positioning is delegated
// to the pure computeHealthStackLayout engine so the stack stays inside the
// screen work area, GROWS UPWARD (newest at the baseline, older pushed up), and
// — in followPet mode — never occludes the pet. Electron deps are injected to
// keep this thin and reviewable.

const path = require("node:path");
const { computeHealthStackLayout } = require("./health-reminder/bubble-layout");

const HEALTH_BUBBLE_HTML = path.join(__dirname, "..", "pwa", "health-bubble.html");
const PRELOAD = path.join(__dirname, "preload-health-bubble.js");
const BUBBLE_WIDTH = 240;
const DEFAULT_HEIGHT = 96;
const STACK_GAP = 8;
const SCREEN_MARGIN = 12;
const MAX_VISIBLE = 3;
const DEFAULT_WORK_AREA = { x: 0, y: 0, width: 1920, height: 1080 };

function createHealthBubbleController(deps = {}) {
  const BrowserWindow = deps.BrowserWindow;
  // v3 position inputs (replace v1's getAnchorRect):
  //   getMode()       -> "followPet" | "corner"
  //   getWorkArea()   -> { x, y, width, height } of the target display's work area
  //   getPetHitRect() -> { x, y, width, height } of the pet (screen coords) | null
  const getMode = deps.getMode || (() => "followPet");
  const getWorkArea = deps.getWorkArea || (() => DEFAULT_WORK_AREA);
  const getPetHitRect = deps.getPetHitRect || (() => null);
  const getLabels = deps.getLabels || (() => ({ confirm: "Got it", snooze: "Later" }));
  const getMaxVisible = deps.getMaxVisible || (() => MAX_VISIBLE);

  const windows = new Map(); // reminderId -> { win, height }
  const order = []; // reminderId insertion order (oldest -> newest)

  function layout() {
    const mode = getMode() === "corner" ? "corner" : "followPet";
    const workArea = getWorkArea() || DEFAULT_WORK_AREA;
    const petHitRect = mode === "followPet" ? getPetHitRect() : null;
    const maxVisible = Math.max(1, getMaxVisible() || MAX_VISIBLE);

    const liveIds = order.filter((id) => {
      const entry = windows.get(id);
      return entry && entry.win && !entry.win.isDestroyed();
    });
    const bubbleHeights = liveIds.map((id) => windows.get(id).height || DEFAULT_HEIGHT);

    const { bounds } = computeHealthStackLayout({
      mode,
      workArea,
      petHitRect,
      bubbleWidth: BUBBLE_WIDTH,
      bubbleHeights,
      gap: STACK_GAP,
      margin: SCREEN_MARGIN,
      maxVisible,
    });

    liveIds.forEach((id, i) => {
      const entry = windows.get(id);
      const rect = bounds[i];
      try {
        if (!rect) {
          if (entry.win.isVisible()) entry.win.hide();
          return;
        }
        entry.win.setBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
        if (!entry.win.isVisible()) entry.win.showInactive();
      } catch { /* window torn down mid-layout */ }
    });
  }

  function show(reminder) {
    if (!BrowserWindow) return;
    if (windows.has(reminder.id)) {
      const entry = windows.get(reminder.id);
      sendShow(entry.win, reminder);
      layout();
      return;
    }
    const win = new BrowserWindow({
      width: BUBBLE_WIDTH,
      height: DEFAULT_HEIGHT,
      frame: false,
      transparent: true,
      resizable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      hasShadow: false,
      webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
    });
    win.setAlwaysOnTop(true, "screen-saver");
    win.loadFile(HEALTH_BUBBLE_HTML);
    win.webContents.once("did-finish-load", () => {
      sendShow(win, reminder);
      layout();
    });
    windows.set(reminder.id, { win, height: DEFAULT_HEIGHT });
    order.push(reminder.id);
  }

  function sendShow(win, reminder) {
    if (!win || win.isDestroyed()) return;
    const labels = getLabels();
    win.webContents.send("health-bubble:show", {
      id: reminder.id,
      title: reminder.label || "",
      message: reminder.message || "",
      confirmLabel: labels.confirm,
      snoozeLabel: labels.snooze,
    });
  }

  function setHeight(id, height) {
    const entry = windows.get(id);
    if (!entry || !Number.isFinite(height) || height <= 0) return;
    entry.height = Math.min(Math.max(Math.round(height), 48), 320);
    layout();
  }

  function dismiss(id) {
    const entry = windows.get(id);
    if (entry && !entry.win.isDestroyed()) entry.win.destroy();
    windows.delete(id);
    const idx = order.indexOf(id);
    if (idx !== -1) order.splice(idx, 1);
    layout();
  }

  function dismissAll() {
    for (const id of [...order]) dismiss(id);
  }

  return { show, dismiss, dismissAll, setHeight, reposition: layout, has: (id) => windows.has(id) };
}

module.exports = createHealthBubbleController;
