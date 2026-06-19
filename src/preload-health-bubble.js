"use strict";

// Preload for the independent health-reminder bubble window. Exposes a tiny,
// locked-down API: receive a reminder to show, and report the user's choice
// (confirm / snooze) back to the main process.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("healthBubbleAPI", {
  onShow: (cb) => {
    ipcRenderer.on("health-bubble:show", (_event, payload) => cb(payload));
  },
  confirm: (id) => ipcRenderer.send("health-bubble:confirm", id),
  snooze: (id) => ipcRenderer.send("health-bubble:snooze", id),
  reportHeight: (height) => ipcRenderer.send("health-bubble:height", height),
});
