"use strict";

(function initSettingsTabTelegramApproval(root) {
  let state = null;
  let coreRef = null;
  let helpers = null;
  let ops = null;

  const view = {
    status: null,
    statusSeq: 0,
    statusLoading: false,
    statusForceRenderPending: false,
    tokenInfo: null,
    tokenInfoSeq: 0,
    tokenInfoLoading: false,
    tokenInfoForceRenderPending: false,
    tokenPending: false,
    tokenEditing: false,
    configPending: false,
    testPending: false,
    formDraft: null,
    formDirty: false,
    feishuStatus: null,
    feishuStatusSeq: 0,
    feishuStatusLoading: false,
    feishuStatusForceRenderPending: false,
    feishuCredentialsInfo: null,
    feishuCredentialsInfoSeq: 0,
    feishuCredentialsInfoLoading: false,
    feishuCredentialsInfoForceRenderPending: false,
    feishuCredentialsPending: false,
    feishuCredentialsEditing: false,
    feishuConfigPending: false,
    feishuTestPending: false,
    feishuTestLogs: null,
    feishuFormDraft: null,
    feishuFormDirty: false,
  };

  function t(key) {
    return helpers.t(key);
  }

  function currentConfig() {
    const cfg = state.snapshot && state.snapshot.tgApproval;
    return {
      enabled: !!(cfg && cfg.enabled),
      allowedTgUserId: cfg && typeof cfg.allowedTgUserId === "string" ? cfg.allowedTgUserId : "",
      targetSessionKey: cfg && typeof cfg.targetSessionKey === "string" ? cfg.targetSessionKey : "",
      // Preserve notifyOnComplete across saves: recipient/toggle payloads are
      // built from this object, so omitting it would let normalize() reset a
      // user's explicit bare-ping choice on the next save.
      notifyOnComplete: !!(cfg && cfg.notifyOnComplete === true),
      completionOutputMode: cfg && (cfg.completionOutputMode === "full" || cfg.completionOutputMode === "tail")
        ? "full"
        : "off",
      r3DirectSendEnabled: !!(cfg && cfg.r3DirectSendEnabled === true),
    };
  }

  function currentFeishuConfig() {
    const cfg = state.snapshot && state.snapshot.feishuApproval;
    const out = {
      enabled: !!(cfg && cfg.enabled),
      region: cfg && cfg.region === "lark" ? "lark" : "feishu",
      receiveIdType: cfg && ["chat_id", "open_id", "user_id"].includes(cfg.receiveIdType)
        ? cfg.receiveIdType
        : "chat_id",
      receiveId: cfg && typeof cfg.receiveId === "string" ? cfg.receiveId : "",
      allowedOpenId: cfg && typeof cfg.allowedOpenId === "string" ? cfg.allowedOpenId : "",
      allowedUserId: cfg && typeof cfg.allowedUserId === "string" ? cfg.allowedUserId : "",
      notifyOnComplete: !!(cfg && cfg.notifyOnComplete === true),
      completionOutputMode: cfg && (cfg.completionOutputMode === "full" || cfg.completionOutputMode === "tail")
        ? "full"
        : "off",
      statusCommandEnabled: !(cfg && cfg.statusCommandEnabled === false),
      // v3: carried through every save so a partial save never resets it.
      elicitationEnabled: !!(cfg && cfg.elicitationEnabled === true),
    };
    if (cfg && Array.isArray(cfg.recipients)) {
      out.recipients = cfg.recipients
        .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
        .map((entry) => ({
          receiveIdType: ["chat_id", "open_id", "user_id"].includes(entry.receiveIdType)
            ? entry.receiveIdType
            : "chat_id",
          receiveId: typeof entry.receiveId === "string" ? entry.receiveId : "",
          allowedOpenId: typeof entry.allowedOpenId === "string" ? entry.allowedOpenId : "",
          allowedUserId: typeof entry.allowedUserId === "string" ? entry.allowedUserId : "",
        }));
    }
    return out;
  }

  function getFormDraft() {
    if (!view.formDraft || !view.formDirty) {
      const cfg = currentConfig();
      view.formDraft = { allowedTgUserId: cfg.allowedTgUserId };
    }
    return view.formDraft;
  }

  function setFormDraftValue(key, value) {
    const draft = getFormDraft();
    draft[key] = value;
    view.formDirty = true;
  }

  function resetFormDraft() {
    view.formDraft = null;
    view.formDirty = false;
  }

  function getFeishuFormDraft() {
    if (!view.feishuFormDraft || !view.feishuFormDirty) {
      const cfg = currentFeishuConfig();
      view.feishuFormDraft = {
        region: cfg.region,
        receiveIdType: cfg.receiveIdType,
        receiveId: cfg.receiveId,
        allowedOpenId: cfg.allowedOpenId,
        allowedUserId: cfg.allowedUserId,
      };
    }
    return view.feishuFormDraft;
  }

  function setFeishuFormDraftValue(key, value) {
    const draft = getFeishuFormDraft();
    draft[key] = value;
    view.feishuFormDirty = true;
  }

  function resetFeishuFormDraft() {
    view.feishuFormDraft = null;
    view.feishuFormDirty = false;
  }

  function callCommand(action, payload) {
    if (!window.settingsAPI || typeof window.settingsAPI.command !== "function") {
      ops.showToast(t("toastSaveFailed") + "settings API unavailable", { error: true });
      return Promise.resolve({ status: "error" });
    }
    return window.settingsAPI.command(action, payload).catch((err) => ({
      status: "error",
      message: err && err.message,
    }));
  }

  function refreshStatus({ forceRender = false } = {}) {
    if (view.statusLoading) {
      if (forceRender) view.statusForceRenderPending = true;
      return;
    }
    view.statusLoading = true;
    const seq = ++view.statusSeq;
    callCommand("telegramApproval.status").then((result) => {
      if (seq !== view.statusSeq) return;
      view.statusLoading = false;
      const previousStatus = view.status;
      const hadStatus = !!previousStatus;
      const updated = result && result.status === "ok";
      const nextStatus = updated ? result.state || null : previousStatus;
      const shouldForceRender = forceRender || view.statusForceRenderPending;
      view.statusForceRenderPending = false;
      const changed = updated && statusRenderKey(previousStatus) !== statusRenderKey(nextStatus);
      if (updated) view.status = result.state || null;
      if ((shouldForceRender || (updated && (!hadStatus || changed))) && state.activeTab === "telegram-approval") {
        ops.requestRender({ content: true });
      }
    });
  }

  function refreshTokenInfo({ forceRender = false } = {}) {
    if (view.tokenInfoLoading) {
      if (forceRender) view.tokenInfoForceRenderPending = true;
      return;
    }
    view.tokenInfoLoading = true;
    const seq = ++view.tokenInfoSeq;
    callCommand("telegramApproval.tokenInfo").then((result) => {
      if (seq !== view.tokenInfoSeq) return;
      view.tokenInfoLoading = false;
      const previous = view.tokenInfo;
      const updated = result && result.status === "ok";
      const next = updated ? { configured: !!result.configured, masked: result.masked || "" } : previous;
      const shouldForceRender = forceRender || view.tokenInfoForceRenderPending;
      view.tokenInfoForceRenderPending = false;
      const changed = updated && tokenInfoRenderKey(previous) !== tokenInfoRenderKey(next);
      if (updated) view.tokenInfo = next;
      if ((shouldForceRender || (updated && changed)) && state.activeTab === "telegram-approval") {
        ops.requestRender({ content: true });
      }
    });
  }

  function refreshFeishuStatus({ forceRender = false } = {}) {
    if (view.feishuStatusLoading) {
      if (forceRender) view.feishuStatusForceRenderPending = true;
      return;
    }
    view.feishuStatusLoading = true;
    const seq = ++view.feishuStatusSeq;
    callCommand("feishuApproval.status").then((result) => {
      if (seq !== view.feishuStatusSeq) return;
      view.feishuStatusLoading = false;
      const previousStatus = view.feishuStatus;
      const updated = result && result.status === "ok";
      const nextStatus = updated ? result.state || null : previousStatus;
      const shouldForceRender = forceRender || view.feishuStatusForceRenderPending;
      view.feishuStatusForceRenderPending = false;
      const changed = updated && feishuStatusRenderKey(previousStatus) !== feishuStatusRenderKey(nextStatus);
      if (updated) view.feishuStatus = result.state || null;
      if ((shouldForceRender || (updated && changed)) && state.activeTab === "telegram-approval") {
        ops.requestRender({ content: true });
      }
    });
  }

  function refreshFeishuCredentialsInfo({ forceRender = false } = {}) {
    if (view.feishuCredentialsInfoLoading) {
      if (forceRender) view.feishuCredentialsInfoForceRenderPending = true;
      return;
    }
    view.feishuCredentialsInfoLoading = true;
    const seq = ++view.feishuCredentialsInfoSeq;
    callCommand("feishuApproval.credentialsInfo").then((result) => {
      if (seq !== view.feishuCredentialsInfoSeq) return;
      view.feishuCredentialsInfoLoading = false;
      const previous = view.feishuCredentialsInfo;
      const updated = result && result.status === "ok";
      const next = updated
        ? {
            configured: !!result.configured,
            appId: typeof result.appId === "string" ? result.appId : "",
            maskedAppSecret: typeof result.maskedAppSecret === "string" ? result.maskedAppSecret : "",
          }
        : previous;
      const shouldForceRender = forceRender || view.feishuCredentialsInfoForceRenderPending;
      view.feishuCredentialsInfoForceRenderPending = false;
      const changed = updated && feishuCredentialsInfoRenderKey(previous) !== feishuCredentialsInfoRenderKey(next);
      if (updated) view.feishuCredentialsInfo = next;
      if ((shouldForceRender || (updated && changed)) && state.activeTab === "telegram-approval") {
        ops.requestRender({ content: true });
      }
    });
  }

  function statusRenderKey(status) {
    const s = status && typeof status === "object" ? status : {};
    return [
      s.status || "",
      s.transport || "",
      s.enabled === true ? "1" : "0",
      s.configured === true ? "1" : "0",
      s.reason || "",
      s.message || "",
      s.tokenStored === true ? "1" : "0",
    ].join("");
  }

  function tokenInfoRenderKey(info) {
    const i = info && typeof info === "object" ? info : {};
    return [i.configured === true ? "1" : "0", i.masked || ""].join("");
  }

  function feishuStatusRenderKey(status) {
    const s = status && typeof status === "object" ? status : {};
    return [
      s.status || "",
      s.enabled === true ? "1" : "0",
      s.configured === true ? "1" : "0",
      s.reason || "",
      s.message || "",
      s.credentialsStored === true ? "1" : "0",
      s.region || "",
      s.receiveIdType || "",
    ].join("");
  }

  function feishuCredentialsInfoRenderKey(info) {
    const i = info && typeof info === "object" ? info : {};
    return [
      i.configured === true ? "1" : "0",
      i.appId || "",
      i.maskedAppSecret || "",
    ].join("");
  }

  function normalizeFeishuTestLogs(logs) {
    if (!Array.isArray(logs)) return [];
    return logs
      .map((entry) => {
        if (typeof entry === "string") {
          const message = entry.trim().slice(0, 320);
          return message ? { level: "info", message } : null;
        }
        const src = entry && typeof entry === "object" ? entry : {};
        const level = ["debug", "info", "warn", "error"].includes(src.level) ? src.level : "info";
        const message = typeof src.message === "string" ? src.message.trim().slice(0, 320) : "";
        return message ? { level, message } : null;
      })
      .filter(Boolean)
      .slice(-60);
  }

  function fallbackFeishuTestLog(result) {
    if (result && result.status === "ok") {
      return [{ level: "info", message: t("feishuApprovalTestSent") }];
    }
    const message = result && result.message ? result.message : t("feishuApprovalTestFailed");
    return [{ level: "error", message }];
  }

  function render(parent) {
    refreshStatus();
    refreshTokenInfo();
    refreshFeishuStatus();
    refreshFeishuCredentialsInfo();

    const h1 = document.createElement("h1");
    h1.textContent = t("remoteApprovalTitle");
    parent.appendChild(h1);

    const subtitle = document.createElement("p");
    subtitle.className = "subtitle";
    subtitle.textContent = t("remoteApprovalSubtitle");
    parent.appendChild(subtitle);

    // v0.9.0 migration: native vs sidecar transport selector. Lives ABOVE the
    // legacy Telegram card so users see migration progress before the legacy
    // setup steps.
    parent.appendChild(buildTelegramMigrationCard());

    // Each remote approval channel renders as its own collapsible card so the
    // page can stay tidy as external approval channels grow.
    parent.appendChild(buildTelegramChannelCard());
    parent.appendChild(buildFeishuChannelCard());
    parent.appendChild(buildHardwareBuddyChannelCard());
  }

  // ── v0.9.0 migration card ──────────────────────────────────────────────────
  let migrationSnapshot = null;
  let migrationCardEl = null;
  let migrationPending = false;
  let migrationSnapshotSeq = 0;

  function migrationState() {
    return migrationSnapshot && typeof migrationSnapshot.state === "string"
      ? migrationSnapshot.state
      : "";
  }

  function isNativeMigrationSelected() {
    const s = migrationState();
    return s === "NATIVE_ACTIVE"
      || s === "TESTING_NATIVE"
      || !!(migrationSnapshot && migrationSnapshot.transport === "native");
  }

  function isNativeMigrationActive() {
    const s = migrationState();
    const owner = migrationSnapshot && migrationSnapshot.ownerSnapshot
      ? migrationSnapshot.ownerSnapshot
      : {};
    return s === "NATIVE_ACTIVE" || s === "TESTING_NATIVE" || owner.nativePolling === true;
  }

  function canStartNativeFromSwitch() {
    const s = migrationState();
    return s === "IDLE" || s === "NEEDS_SETUP" || s === "LEGACY_ACTIVE";
  }

  function statusIndicatesNativeApprovalActive() {
    const s = view.status || {};
    return s.transport === "native"
      && (s.enabled === true || s.status === "running" || s.status === "starting");
  }

  function effectiveTelegramApprovalEnabled(cfg) {
    return !!(cfg && cfg.enabled) || isNativeMigrationActive() || statusIndicatesNativeApprovalActive();
  }

  function migrationSnapshotRenderKey(snapshot) {
    const snap = snapshot && typeof snapshot === "object" ? snapshot : {};
    const owner = snap.ownerSnapshot && typeof snap.ownerSnapshot === "object"
      ? snap.ownerSnapshot
      : {};
    return [
      snap.state || "",
      snap.transport || "",
      owner.nativePolling === true ? "1" : "0",
      owner.sidecarRunning === true ? "1" : "0",
      snap.nativeVerifiedAt || "",
    ].join("\x1f");
  }

  function buildTelegramMigrationCard() {
    migrationCardEl = document.createElement("div");
    migrationCardEl.className = "tg-migration-card";
    renderMigrationCard();
    refreshMigrationSnapshot();
    return migrationCardEl;
  }

  function refreshMigrationSnapshot() {
    if (migrationPending) return;
    const seq = ++migrationSnapshotSeq;
    callCommand("telegramMigration.snapshot").then((res) => {
      if (seq !== migrationSnapshotSeq || migrationPending) return;
      if (res && res.status === "ok") {
        const previousKey = migrationSnapshotRenderKey(migrationSnapshot);
        migrationSnapshot = res.snapshot;
        renderMigrationCard();
        if (migrationSnapshotRenderKey(migrationSnapshot) !== previousKey
          && state.activeTab === "telegram-approval") {
          ops.requestRender({ content: true });
        }
      }
    });
  }

  function migrationDispatch(eventType, extra = {}) {
    if (migrationPending) return;
    migrationPending = true;
    renderMigrationCard();
    callCommand("telegramMigration.dispatch", { type: eventType, ...extra }).then((res) => {
      migrationPending = false;
      if (res && res.snapshot) migrationSnapshot = res.snapshot;
      if (res && res.status !== "ok" && res.errorCode) {
        ops.showToast(`Telegram migration: ${res.errorCode}`, { error: true });
      }
      renderMigrationCard();
      // Status of the legacy sidecar may change as a side-effect (start/stop).
      refreshStatus({ forceRender: true });
    });
  }

  function renderMigrationCard() {
    if (!migrationCardEl) return;
    migrationCardEl.innerHTML = "";
    const snap = migrationSnapshot;
    if (!snap) {
      migrationCardEl.textContent = "Loading migration status…";
      return;
    }
    const state = snap.state;
    const title = document.createElement("h3");
    title.textContent = "Telegram bot transport (v0.9.0 spike)";
    migrationCardEl.appendChild(title);

    const stateLine = document.createElement("p");
    stateLine.className = "tg-migration-state";
    stateLine.textContent = `State: ${state}` +
      (snap.runtimeStatus && snap.runtimeStatus.status === "failed"
        ? ` (runtime: failed — ${snap.runtimeStatus.reason || "unknown"})`
        : "");
    migrationCardEl.appendChild(stateLine);

    const ownerLine = document.createElement("p");
    ownerLine.className = "tg-migration-owner";
    const o = snap.ownerSnapshot || {};
    ownerLine.textContent = `Owner: sidecar=${o.sidecarRunning ? "running" : "stopped"}, native=${o.nativePolling ? "polling" : "stopped"}`;
    migrationCardEl.appendChild(ownerLine);

    const body = document.createElement("div");
    body.className = "tg-migration-body";
    migrationCardEl.appendChild(body);

    const importErr = snap.migrationInfo && snap.migrationInfo.importError;
    if (importErr && state === "LEGACY_ACTIVE") {
      const banner = document.createElement("div");
      banner.className = "tg-migration-banner";
      banner.textContent = `Native config import failed: ${importErr}`;
      body.appendChild(banner);
      body.appendChild(migrationButton("Retry import", () =>
        migrationDispatch("USER_TEST_NATIVE")));
    }

    switch (state) {
      case "IDLE":
      case "NEEDS_SETUP":
        body.appendChild(migrationCopy(
          "Configure the Telegram bot below, then choose how to run it:",
        ));
        body.appendChild(migrationButton("Test native bot and switch", () =>
          migrationDispatch("USER_TEST_NATIVE")));
        body.appendChild(migrationButton("Enable legacy sidecar", () =>
          migrationDispatch("USER_ENABLE_LEGACY")));
        break;
      case "LEGACY_ACTIVE":
        if (snap.runtimeStatus && snap.runtimeStatus.status === "failed") {
          body.appendChild(migrationCopy("Legacy sidecar is not running."));
          body.appendChild(migrationButton("Retry legacy sidecar", () =>
            migrationDispatch("USER_ENABLE_LEGACY")));
        }
        if (!snap.nativeVerifiedAt) {
          body.appendChild(migrationCopy(
            "Native Telegram bot is available. Test it to switch over — legacy stays as fallback.",
          ));
          body.appendChild(migrationButton("Test native and switch", () =>
            migrationDispatch("USER_TEST_NATIVE")));
        } else {
          body.appendChild(migrationCopy("Legacy sidecar is active."));
        }
        body.appendChild(migrationButton("Disable Telegram approval", () =>
          migrationDispatch("USER_DISABLE")));
        break;
      case "TESTING_NATIVE":
        body.appendChild(migrationCopy("Waiting for your Telegram tap… (60s timeout)"));
        break;
      case "NATIVE_ACTIVE":
        body.appendChild(migrationCopy(
          "Native Telegram is active. Legacy files kept for rollback.",
        ));
        body.appendChild(migrationButton("Roll back to legacy", () =>
          migrationDispatch("USER_ROLLBACK_TO_LEGACY")));
        body.appendChild(migrationButton("Delete legacy token file", deleteLegacyTokenFile));
        body.appendChild(migrationButton("Disable Telegram approval", () =>
          migrationDispatch("USER_DISABLE")));
        break;
      case "SWITCHING_TO_LEGACY":
        body.appendChild(migrationCopy("Switching to legacy approval…"));
        break;
    }
    if (migrationPending) {
      const pending = document.createElement("p");
      pending.className = "tg-migration-pending";
      pending.textContent = "Working…";
      migrationCardEl.appendChild(pending);
    }
  }

  function migrationCopy(text) {
    const p = document.createElement("p");
    p.className = "tg-migration-copy";
    p.textContent = text;
    return p;
  }

  function migrationButton(label, handler) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tg-migration-btn";
    btn.textContent = label;
    btn.disabled = migrationPending;
    btn.addEventListener("click", handler);
    return btn;
  }

  function deleteLegacyTokenFile() {
    if (migrationPending) return;
    migrationPending = true;
    renderMigrationCard();
    callCommand("telegramApproval.deleteTokenFile").then((res) => {
      migrationPending = false;
      if (res && res.status === "ok") {
        ops.showToast(res.deleted === false
          ? "Telegram token file was already removed."
          : "Telegram token file deleted.");
      } else {
        ops.showToast((res && res.message) || "Telegram token file delete failed", { error: true });
      }
      view.tokenInfo = null;
      view.status = null;
      renderMigrationCard();
      refreshTokenInfo({ forceRender: true });
      refreshStatus({ forceRender: true });
      refreshMigrationSnapshot();
    });
  }

  function buildTelegramChannelCard() {
    const kind = deriveCardKind();
    // Default-collapse the card once the sidecar is actually running — the
    // user no longer needs to see the setup steps. localStorage persists any
    // manual expand/collapse from there.
    const defaultCollapsed = kind === "running";

    return helpers.buildCollapsibleGroup({
      id: "remote-approval.telegram",
      headerContent: buildChannelHeader(t("telegramApprovalChannelName"), kind),
      defaultCollapsed,
      className: "remote-approval-channel-card tg-approval-channel-card",
      children: [
        buildChannelStatusRow(kind),
        helpers.buildSection(t("telegramApprovalStep1Title"), [buildTokenRow()]),
        helpers.buildSection(t("telegramApprovalStep2Title"), [buildRecipientRow()]),
        buildStep3Section(),
      ],
    });
  }

  function buildHardwareBuddyChannelCard() {
    return root.ClawdSettingsHardwareBuddyPanel.build(coreRef, {
      id: "remote-approval.hardware-buddy",
      activeTabId: "telegram-approval",
      className: "remote-approval-channel-card",
    });
  }

  function buildFeishuChannelCard() {
    const kind = deriveFeishuCardKind();
    return helpers.buildCollapsibleGroup({
      id: "remote-approval.feishu",
      headerContent: buildChannelHeader(t("feishuApprovalChannelName"), kind),
      defaultCollapsed: kind === "running",
      className: "remote-approval-channel-card feishu-approval-channel-card",
      children: [
        buildFeishuStatusRow(kind),
        helpers.buildSection(t("feishuApprovalStep1Title"), [buildFeishuCredentialsRow()]),
        helpers.buildSection(t("feishuApprovalStep2Title"), [buildFeishuRecipientRow()]),
        buildFeishuStep3Section(),
      ],
    });
  }

  function buildChannelHeader(channelName, kind) {
    const wrap = document.createElement("div");
    wrap.className = "tg-approval-channel-header";

    const nameEl = document.createElement("span");
    nameEl.className = "tg-approval-channel-name";
    nameEl.textContent = channelName;
    wrap.appendChild(nameEl);

    const badge = document.createElement("span");
    badge.className = "tg-approval-channel-badge " + statusBadgeClass(kind);
    const dot = document.createElement("span");
    dot.className = "tg-approval-channel-badge-dot";
    badge.appendChild(dot);
    const badgeText = document.createElement("span");
    badgeText.textContent = t("telegramApprovalCardKind_" + kind);
    badge.appendChild(badgeText);
    wrap.appendChild(badge);

    return wrap;
  }

  function buildChannelStatusRow(kind) {
    const row = document.createElement("div");
    row.className = "tg-approval-channel-status-row " + statusBadgeClass(kind);
    const text = document.createElement("span");
    text.className = "tg-approval-channel-status-text";
    text.textContent = deriveCardMessage(kind);
    row.appendChild(text);
    return row;
  }

  function statusBadgeClass(kind) {
    switch (kind) {
      case "running": return "tg-approval-badge-running";
      case "starting": return "tg-approval-badge-starting";
      case "failed": return "tg-approval-badge-failed";
      case "ready": return "tg-approval-badge-ready";
      case "incomplete":
      default: return "tg-approval-badge-incomplete";
    }
  }

  // ── Status helpers ──

  function deriveCardKind() {
    const s = view.status || {};
    if (s.status === "running") return "running";
    if (s.status === "starting") return "starting";
    if (s.status === "failed") return "failed";
    if (s.configured === true) return "ready";
    return "incomplete";
  }

  function deriveCardMessage(kind) {
    const s = view.status || {};
    if (kind === "failed") {
      return s.message || t("telegramApprovalCardFailed");
    }
    if (kind === "running") return t("telegramApprovalCardRunning");
    if (kind === "starting") return t("telegramApprovalCardStarting");
    if (kind === "ready") return t("telegramApprovalCardReadyToEnable");
    // incomplete — pick the most actionable missing piece
    const tokenOk = !!(view.tokenInfo && view.tokenInfo.configured) || s.tokenStored === true;
    const cfg = currentConfig();
    const recipientOk = !!cfg.allowedTgUserId;
    if (!tokenOk && !recipientOk) return t("telegramApprovalCardMissingBoth");
    if (!tokenOk) return t("telegramApprovalCardMissingToken");
    if (!recipientOk) return t("telegramApprovalCardMissingRecipient");
    return t("telegramApprovalCardReadyToEnable");
  }

  function feishuCredentialsConfigured() {
    return !!(view.feishuCredentialsInfo && view.feishuCredentialsInfo.configured)
      || !!(view.feishuStatus && view.feishuStatus.credentialsStored === true);
  }

  function feishuRecipientConfigured() {
    return !!String(currentFeishuConfig().receiveId || "").trim();
  }

  function feishuApproverConfigured() {
    const cfg = currentFeishuConfig();
    return !!String(cfg.allowedOpenId || "").trim() || !!String(cfg.allowedUserId || "").trim();
  }

  function isFeishuReady() {
    return feishuCredentialsConfigured() && feishuRecipientConfigured() && feishuApproverConfigured();
  }

  function deriveFeishuCardKind() {
    const s = view.feishuStatus || {};
    if (s.status === "running") return "running";
    if (s.status === "starting") return "starting";
    if (s.status === "failed") return "failed";
    if (isFeishuReady()) return "ready";
    return "incomplete";
  }

  function deriveFeishuCardMessage(kind) {
    const s = view.feishuStatus || {};
    if (kind === "failed") return s.message || t("feishuApprovalCardFailed");
    if (kind === "running") return t("feishuApprovalCardRunning");
    if (kind === "starting") return t("feishuApprovalCardStarting");
    if (kind === "ready") return t("feishuApprovalCardReadyToEnable");
    const missing = [];
    if (!feishuCredentialsConfigured()) missing.push(t("feishuApprovalPrereqMissingCredentials"));
    if (!feishuRecipientConfigured()) missing.push(t("feishuApprovalPrereqMissingRecipient"));
    if (!feishuApproverConfigured()) missing.push(t("feishuApprovalPrereqMissingApprover"));
    return missing.length
      ? t("feishuApprovalPrereqDesc") + " " + missing.join(", ")
      : t("feishuApprovalCardReadyToEnable");
  }

  function buildFeishuStatusRow(kind) {
    const row = document.createElement("div");
    row.className = "tg-approval-channel-status-row " + statusBadgeClass(kind);
    const text = document.createElement("span");
    text.className = "tg-approval-channel-status-text";
    text.textContent = deriveFeishuCardMessage(kind);
    row.appendChild(text);
    return row;
  }

  function buildFeishuCredentialsRow() {
    const info = view.feishuCredentialsInfo;
    const configured = !!(info && info.configured);
    if (configured && !view.feishuCredentialsEditing) {
      return buildFeishuCredentialsStoredRow(info);
    }
    return buildFeishuCredentialsEditRow({ configured, info });
  }

  function buildFeishuCredentialsStoredRow(info) {
    const row = document.createElement("div");
    row.className = "row tg-approval-token-stored-row feishu-approval-credentials-stored-row";

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label tg-approval-token-stored-label";
    label.textContent = t("feishuApprovalCredentialsConfiguredLabel");
    const masked = document.createElement("span");
    masked.className = "tg-approval-token-masked feishu-approval-secret-masked";
    masked.textContent = info && info.maskedAppSecret ? info.maskedAppSecret : t("feishuApprovalSecretConfiguredNoMask");
    label.appendChild(masked);
    const desc = document.createElement("span");
    desc.className = "row-desc";
    const appId = info && info.appId ? info.appId : t("feishuApprovalAppIdUnknown");
    desc.textContent = t("feishuApprovalCredentialsConfiguredDesc").replace("{appId}", appId);
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control tg-approval-input-row";
    const replaceBtn = document.createElement("button");
    replaceBtn.type = "button";
    replaceBtn.className = "soft-btn";
    replaceBtn.textContent = t("feishuApprovalReplaceCredentials");
    replaceBtn.disabled = view.feishuCredentialsPending;
    replaceBtn.addEventListener("click", () => {
      view.feishuCredentialsEditing = true;
      ops.requestRender({ content: true });
    });
    ctrl.appendChild(replaceBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "soft-btn danger feishu-approval-delete-credentials";
    deleteBtn.textContent = t("feishuApprovalDeleteCredentials");
    deleteBtn.disabled = view.feishuCredentialsPending;
    deleteBtn.addEventListener("click", () => {
      view.feishuCredentialsPending = true;
      ops.requestRender({ content: true });
      callCommand("feishuApproval.deleteCredentialsFile").then((result) => {
        view.feishuCredentialsPending = false;
        if (!result || result.status !== "ok") {
          ops.showToast((result && result.message) || t("feishuApprovalCredentialsDeleteFailed"), { error: true });
          ops.requestRender({ content: true });
          return;
        }
        ops.showToast(t("feishuApprovalCredentialsDeleted"));
        view.feishuCredentialsInfo = null;
        view.feishuStatus = null;
        refreshFeishuCredentialsInfo({ forceRender: true });
        refreshFeishuStatus({ forceRender: true });
      });
    });
    ctrl.appendChild(deleteBtn);
    row.appendChild(ctrl);
    return row;
  }

  function buildFeishuCredentialsEditRow({ configured, info }) {
    const row = document.createElement("div");
    row.className = "row tg-approval-token-edit-row feishu-approval-credentials-edit-row";

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("feishuApprovalCredentialsLabel");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = configured
      ? t("feishuApprovalCredentialsReplaceHint")
      : t("feishuApprovalCredentialsHint");
    text.appendChild(label);
    if (configured && info && info.appId) {
      const current = document.createElement("span");
      current.className = "tg-approval-token-current";
      current.textContent = t("feishuApprovalCredentialsCurrent").replace("{appId}", info.appId);
      text.appendChild(current);
    }
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control tg-approval-input-row";
    const appIdInput = document.createElement("input");
    appIdInput.type = "text";
    appIdInput.spellcheck = false;
    appIdInput.placeholder = t("feishuApprovalAppIdPlaceholder");
    appIdInput.className = "tg-approval-input feishu-approval-app-id-input";
    appIdInput.value = info && info.appId ? info.appId : "";

    const secretInput = document.createElement("input");
    secretInput.type = "password";
    secretInput.autocomplete = "off";
    secretInput.spellcheck = false;
    secretInput.placeholder = t("feishuApprovalAppSecretPlaceholder");
    secretInput.className = "tg-approval-input feishu-approval-app-secret-input";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "soft-btn accent feishu-approval-save-credentials";
    saveBtn.textContent = view.feishuCredentialsPending ? t("telegramApprovalSaving") : t("feishuApprovalSaveCredentials");
    saveBtn.disabled = view.feishuCredentialsPending;
    saveBtn.addEventListener("click", () => {
      const appId = String(appIdInput.value || "").trim();
      const appSecret = String(secretInput.value || "").trim();
      if (!appId || !appSecret) {
        ops.showToast(t("feishuApprovalCredentialsEmpty"), { error: true });
        return;
      }
      view.feishuCredentialsPending = true;
      ops.requestRender({ content: true });
      callCommand("feishuApproval.setCredentials", { appId, appSecret }).then((result) => {
        view.feishuCredentialsPending = false;
        if (!result || result.status !== "ok") {
          ops.showToast((result && result.message) || t("feishuApprovalCredentialsSaveFailed"), { error: true });
          ops.requestRender({ content: true });
          return;
        }
        ops.showToast(t("feishuApprovalCredentialsSaved"));
        appIdInput.value = "";
        secretInput.value = "";
        view.feishuCredentialsEditing = false;
        view.feishuCredentialsInfo = null;
        view.feishuStatus = null;
        refreshFeishuCredentialsInfo({ forceRender: true });
        refreshFeishuStatus({ forceRender: true });
      });
    });

    ctrl.appendChild(appIdInput);
    ctrl.appendChild(secretInput);
    ctrl.appendChild(saveBtn);
    if (configured) {
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "soft-btn";
      cancelBtn.textContent = t("telegramApprovalCancel");
      cancelBtn.disabled = view.feishuCredentialsPending;
      cancelBtn.addEventListener("click", () => {
        view.feishuCredentialsEditing = false;
        ops.requestRender({ content: true });
      });
      ctrl.appendChild(cancelBtn);
    }
    row.appendChild(ctrl);
    return row;
  }

  function buildFeishuRecipientRow() {
    const draft = getFeishuFormDraft();
    const row = document.createElement("div");
    row.className = "row tg-approval-recipient-row feishu-approval-recipient-row";

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("feishuApprovalRecipientLabel");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = t("feishuApprovalRecipientHint");
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control tg-approval-input-row";

    const regionSelect = document.createElement("select");
    regionSelect.className = "tg-approval-input tg-approval-output-select feishu-approval-region-select";
    for (const value of ["feishu", "lark"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = t("feishuApprovalRegion_" + value);
      regionSelect.appendChild(option);
    }
    regionSelect.value = draft.region || "feishu";
    regionSelect.addEventListener("change", () => setFeishuFormDraftValue("region", regionSelect.value));

    const receiveIdTypeSelect = document.createElement("select");
    receiveIdTypeSelect.className = "tg-approval-input tg-approval-output-select feishu-approval-receive-id-type-select";
    for (const value of ["chat_id", "open_id", "user_id"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = t("feishuApprovalReceiveIdType_" + value);
      receiveIdTypeSelect.appendChild(option);
    }
    receiveIdTypeSelect.value = draft.receiveIdType || "chat_id";
    receiveIdTypeSelect.addEventListener("change", () => setFeishuFormDraftValue("receiveIdType", receiveIdTypeSelect.value));

    const receiveIdInput = document.createElement("input");
    receiveIdInput.type = "text";
    receiveIdInput.spellcheck = false;
    receiveIdInput.placeholder = t("feishuApprovalReceiveIdPlaceholder");
    receiveIdInput.className = "tg-approval-input feishu-approval-receive-id-input";
    receiveIdInput.value = draft.receiveId || "";
    receiveIdInput.addEventListener("input", () => setFeishuFormDraftValue("receiveId", receiveIdInput.value));

    const allowedOpenIdInput = document.createElement("input");
    allowedOpenIdInput.type = "text";
    allowedOpenIdInput.spellcheck = false;
    allowedOpenIdInput.placeholder = t("feishuApprovalAllowedOpenIdPlaceholder");
    allowedOpenIdInput.className = "tg-approval-input feishu-approval-allowed-open-id-input";
    allowedOpenIdInput.value = draft.allowedOpenId || "";
    allowedOpenIdInput.addEventListener("input", () => setFeishuFormDraftValue("allowedOpenId", allowedOpenIdInput.value));

    const allowedUserIdInput = document.createElement("input");
    allowedUserIdInput.type = "text";
    allowedUserIdInput.spellcheck = false;
    allowedUserIdInput.placeholder = t("feishuApprovalAllowedUserIdPlaceholder");
    allowedUserIdInput.className = "tg-approval-input feishu-approval-allowed-user-id-input";
    allowedUserIdInput.value = draft.allowedUserId || "";
    allowedUserIdInput.addEventListener("input", () => setFeishuFormDraftValue("allowedUserId", allowedUserIdInput.value));

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "soft-btn accent feishu-approval-save-recipient";
    saveBtn.textContent = view.feishuConfigPending ? t("telegramApprovalSaving") : t("feishuApprovalSaveRecipient");
    saveBtn.disabled = view.feishuConfigPending;
    saveBtn.addEventListener("click", () => {
      const nextDraft = getFeishuFormDraft();
      const receiveId = String(nextDraft.receiveId || "").trim();
      const allowedOpenId = String(nextDraft.allowedOpenId || "").trim();
      const allowedUserId = String(nextDraft.allowedUserId || "").trim();
      if (!receiveId) {
        ops.showToast(t("feishuApprovalReceiveIdEmpty"), { error: true });
        return;
      }
      if (!allowedOpenId && !allowedUserId) {
        ops.showToast(t("feishuApprovalApproverEmpty"), { error: true });
        return;
      }
      const current = currentFeishuConfig();
      const next = {
        enabled: current.enabled,
        region: nextDraft.region === "lark" ? "lark" : "feishu",
        receiveIdType: ["chat_id", "open_id", "user_id"].includes(nextDraft.receiveIdType)
          ? nextDraft.receiveIdType
          : "chat_id",
        receiveId,
        allowedOpenId,
        allowedUserId,
        notifyOnComplete: current.notifyOnComplete,
        completionOutputMode: current.completionOutputMode,
        statusCommandEnabled: current.statusCommandEnabled,
        elicitationEnabled: current.elicitationEnabled,
      };
      if (Array.isArray(current.recipients)) next.recipients = current.recipients;
      saveFeishuConfig(next);
    });

    ctrl.appendChild(regionSelect);
    ctrl.appendChild(receiveIdTypeSelect);
    ctrl.appendChild(receiveIdInput);
    ctrl.appendChild(allowedOpenIdInput);
    ctrl.appendChild(allowedUserIdInput);
    ctrl.appendChild(saveBtn);
    row.appendChild(ctrl);
    return row;
  }

  function buildFeishuStep3Section() {
    const credentialsConfigured = feishuCredentialsConfigured();
    const recipientConfigured = feishuRecipientConfigured();
    const approverConfigured = feishuApproverConfigured();
    const ready = credentialsConfigured && recipientConfigured && approverConfigured;
    const rows = [];
    if (!ready) {
      rows.push(buildFeishuPrerequisitesRow({ credentialsConfigured, recipientConfigured, approverConfigured }));
    }
    rows.push(buildFeishuEnabledRow({ ready }));
    rows.push(buildFeishuElicitationRow({ ready }));
    rows.push(buildFeishuCompletionNotifyRow({ ready }));
    rows.push(buildFeishuCompletionOutputRow({ ready }));
    rows.push(buildFeishuTestRow({ ready }));
    if (view.feishuTestLogs && view.feishuTestLogs.length) {
      rows.push(buildFeishuTestLogRow());
    }
    return helpers.buildSection(t("feishuApprovalStep3Title"), rows);
  }

  function buildFeishuPrerequisitesRow({ credentialsConfigured, recipientConfigured, approverConfigured }) {
    const row = document.createElement("div");
    row.className = "row tg-approval-prereq-row feishu-approval-prereq-row";
    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("feishuApprovalPrereqLabel");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    const missing = [];
    if (!credentialsConfigured) missing.push(t("feishuApprovalPrereqMissingCredentials"));
    if (!recipientConfigured) missing.push(t("feishuApprovalPrereqMissingRecipient"));
    if (!approverConfigured) missing.push(t("feishuApprovalPrereqMissingApprover"));
    desc.textContent = t("feishuApprovalPrereqDesc") + " " + missing.join(", ");
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);
    return row;
  }

  function buildFeishuEnabledRow({ ready }) {
    const cfg = currentFeishuConfig();
    const row = document.createElement("div");
    row.className = "row feishu-approval-enabled-row";
    if (!ready) row.classList.add("tg-approval-row-disabled");

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("feishuApprovalToggle");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = t("feishuApprovalToggleDesc");
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control";
    const sw = document.createElement("div");
    sw.className = "switch";
    sw.setAttribute("role", "switch");
    sw.setAttribute("tabindex", "0");
    helpers.setSwitchVisual(sw, cfg.enabled === true, { pending: view.feishuConfigPending });
    if (!ready || view.feishuConfigPending) {
      sw.classList.add("disabled");
      sw.setAttribute("aria-disabled", "true");
      sw.removeAttribute("tabindex");
    } else {
      const toggle = () => {
        saveFeishuConfig({ ...cfg, enabled: cfg.enabled !== true }, { resetDraft: false });
      };
      sw.addEventListener("click", toggle);
      sw.addEventListener("keydown", (ev) => {
        if (ev.key === " " || ev.key === "Enter") {
          ev.preventDefault();
          toggle();
        }
      });
    }
    ctrl.appendChild(sw);
    row.appendChild(ctrl);
    return row;
  }

  function buildFeishuCompletionNotifyRow({ ready }) {
    const cfg = currentFeishuConfig();
    const row = document.createElement("div");
    row.className = "row feishu-approval-notify-completion-row";
    if (!ready) row.classList.add("tg-approval-row-disabled");

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("feishuApprovalNotifyOnComplete");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = t("feishuApprovalNotifyOnCompleteDesc");
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control";
    const sw = document.createElement("div");
    sw.className = "switch";
    sw.setAttribute("role", "switch");
    sw.setAttribute("tabindex", "0");
    helpers.setSwitchVisual(sw, cfg.notifyOnComplete === true, { pending: view.feishuConfigPending });
    if (!ready || view.feishuConfigPending) {
      sw.classList.add("disabled");
      sw.setAttribute("aria-disabled", "true");
      sw.removeAttribute("tabindex");
    } else {
      const toggle = () => {
        saveFeishuConfig({ ...cfg, notifyOnComplete: cfg.notifyOnComplete !== true }, { resetDraft: false });
      };
      sw.addEventListener("click", toggle);
      sw.addEventListener("keydown", (ev) => {
        if (ev.key === " " || ev.key === "Enter") {
          ev.preventDefault();
          toggle();
        }
      });
    }
    ctrl.appendChild(sw);
    row.appendChild(ctrl);
    return row;
  }

  // v3: answer Claude's AskUserQuestion prompts in Feishu (opt-in, default off).
  function buildFeishuElicitationRow({ ready }) {
    const cfg = currentFeishuConfig();
    const row = document.createElement("div");
    row.className = "row feishu-approval-elicitation-row";
    if (!ready) row.classList.add("tg-approval-row-disabled");

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("feishuApprovalElicitation");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = t("feishuApprovalElicitationDesc");
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control";
    const sw = document.createElement("div");
    sw.className = "switch";
    sw.setAttribute("role", "switch");
    sw.setAttribute("tabindex", "0");
    helpers.setSwitchVisual(sw, cfg.elicitationEnabled === true, { pending: view.feishuConfigPending });
    if (!ready || view.feishuConfigPending) {
      sw.classList.add("disabled");
      sw.setAttribute("aria-disabled", "true");
      sw.removeAttribute("tabindex");
    } else {
      const toggle = () => {
        saveFeishuConfig({ ...cfg, elicitationEnabled: cfg.elicitationEnabled !== true }, { resetDraft: false });
      };
      sw.addEventListener("click", toggle);
      sw.addEventListener("keydown", (ev) => {
        if (ev.key === " " || ev.key === "Enter") {
          ev.preventDefault();
          toggle();
        }
      });
    }
    ctrl.appendChild(sw);
    row.appendChild(ctrl);
    return row;
  }

  function buildFeishuCompletionOutputRow({ ready }) {
    const cfg = currentFeishuConfig();
    const mode = ["off", "full"].includes(cfg.completionOutputMode)
      ? cfg.completionOutputMode
      : "off";
    const row = document.createElement("div");
    row.className = "row feishu-approval-completion-output-row";
    if (!ready) row.classList.add("tg-approval-row-disabled");

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("feishuApprovalCompletionOutput");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = t("feishuApprovalCompletionOutputDesc");
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control";
    const select = document.createElement("select");
    select.className = "tg-approval-input feishu-approval-output-select";
    select.disabled = !ready || view.feishuConfigPending;
    for (const value of ["off", "full"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = t("feishuApprovalCompletionOutput_" + value);
      select.appendChild(option);
    }
    select.value = mode;
    select.addEventListener("change", () => {
      const nextMode = ["off", "full"].includes(select.value) ? select.value : "off";
      if (nextMode === mode) return;
      if (nextMode === "full") {
        const ok = window.confirm(t("feishuApprovalCompletionOutputFullConfirm"));
        if (!ok) {
          select.value = mode;
          return;
        }
      }
      saveFeishuConfig({ ...cfg, completionOutputMode: nextMode }, { resetDraft: false });
    });
    ctrl.appendChild(select);
    row.appendChild(ctrl);
    return row;
  }

  function buildFeishuTestRow({ ready }) {
    const row = document.createElement("div");
    row.className = "row feishu-approval-test-row";
    if (!ready) row.classList.add("tg-approval-row-disabled");

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("feishuApprovalTest");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = t("feishuApprovalTestDesc");
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "soft-btn accent feishu-approval-test-button";
    btn.textContent = view.feishuTestPending ? t("feishuApprovalTesting") : t("feishuApprovalSendTest");
    btn.disabled = view.feishuTestPending || !ready;
    if (btn.disabled && !view.feishuTestPending) btn.title = deriveFeishuCardMessage("incomplete");
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      view.feishuTestPending = true;
      view.feishuTestLogs = [{ level: "info", message: t("feishuApprovalTestLogPending") }];
      ops.requestRender({ content: true });
      callCommand("feishuApproval.test").then((result) => {
        view.feishuTestPending = false;
        const logs = normalizeFeishuTestLogs(result && result.logs);
        view.feishuTestLogs = logs.length ? logs : fallbackFeishuTestLog(result);
        if (result && result.status === "ok") {
          ops.showToast(t("feishuApprovalTestSent"));
        } else {
          ops.showToast((result && result.message) || t("feishuApprovalTestFailed"), { error: true });
        }
        view.feishuStatus = null;
        refreshFeishuStatus({ forceRender: true });
      });
    });
    ctrl.appendChild(btn);
    row.appendChild(ctrl);
    return row;
  }

  // ── Step 1: Bot Token ──

  function buildFeishuTestLogRow() {
    const row = document.createElement("div");
    row.className = "row feishu-approval-test-log-row";

    const panel = document.createElement("div");
    panel.className = "feishu-approval-test-log";

    const title = document.createElement("div");
    title.className = "feishu-approval-test-log-title";
    title.textContent = t("feishuApprovalTestLogTitle");
    panel.appendChild(title);

    for (const entry of view.feishuTestLogs || []) {
      const line = document.createElement("div");
      line.className = "feishu-approval-test-log-line feishu-approval-test-log-" + entry.level;
      const level = document.createElement("span");
      level.className = "feishu-approval-test-log-level";
      level.textContent = entry.level.toUpperCase();
      const message = document.createElement("span");
      message.className = "feishu-approval-test-log-message";
      message.textContent = entry.message;
      line.appendChild(level);
      line.appendChild(message);
      panel.appendChild(line);
    }

    row.appendChild(panel);
    return row;
  }

  function buildTokenRow() {
    const info = view.tokenInfo;
    const configured = !!(info && info.configured);
    if (configured && !view.tokenEditing) {
      return buildTokenStoredRow(info);
    }
    return buildTokenEditRow({ configured, masked: info ? info.masked : "" });
  }

  function buildTokenStoredRow(info) {
    const row = document.createElement("div");
    row.className = "row tg-approval-token-stored-row";

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label tg-approval-token-stored-label";
    label.textContent = t("telegramApprovalTokenConfiguredLabel");
    const masked = document.createElement("span");
    masked.className = "tg-approval-token-masked";
    masked.textContent = info && info.masked ? info.masked : t("telegramApprovalTokenConfiguredNoMask");
    label.appendChild(masked);
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = t("telegramApprovalTokenConfiguredDesc");
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "soft-btn";
    btn.textContent = t("telegramApprovalReplaceToken");
    btn.addEventListener("click", () => {
      view.tokenEditing = true;
      ops.requestRender({ content: true });
    });
    ctrl.appendChild(btn);
    row.appendChild(ctrl);
    return row;
  }

  function buildTokenEditRow({ configured, masked }) {
    const row = document.createElement("div");
    row.className = "row tg-approval-token-edit-row";

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("telegramApprovalBotToken");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.innerHTML = configured
      ? escapeWithLink(t("telegramApprovalTokenReplaceHintHtml"))
      : escapeWithLink(t("telegramApprovalBotTokenHintHtml"));
    text.appendChild(label);
    if (configured && masked) {
      const current = document.createElement("span");
      current.className = "tg-approval-token-current";
      current.textContent = t("telegramApprovalTokenCurrent").replace("{masked}", masked);
      text.appendChild(current);
    }
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control tg-approval-input-row";
    const input = document.createElement("input");
    input.type = "password";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = t("telegramApprovalBotTokenPlaceholder");
    input.className = "tg-approval-input";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "soft-btn accent";
    saveBtn.textContent = view.tokenPending ? t("telegramApprovalSaving") : t("telegramApprovalSaveToken");
    saveBtn.disabled = view.tokenPending;
    saveBtn.addEventListener("click", () => {
      const token = input.value.trim();
      if (!token) {
        ops.showToast(t("telegramApprovalTokenEmpty"), { error: true });
        return;
      }
      view.tokenPending = true;
      ops.requestRender({ content: true });
      callCommand("telegramApproval.setToken", { token }).then((result) => {
        view.tokenPending = false;
        if (!result || result.status !== "ok") {
          ops.showToast((result && result.message) || t("telegramApprovalTokenSaveFailed"), { error: true });
          ops.requestRender({ content: true });
          return;
        }
        ops.showToast(t("telegramApprovalTokenSaved"));
        input.value = "";
        view.tokenEditing = false;
        view.tokenInfo = null;
        view.status = null;
        refreshTokenInfo({ forceRender: true });
        refreshStatus({ forceRender: true });
      });
    });

    ctrl.appendChild(input);
    ctrl.appendChild(saveBtn);

    if (configured) {
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "soft-btn";
      cancelBtn.textContent = t("telegramApprovalCancel");
      cancelBtn.disabled = view.tokenPending;
      cancelBtn.addEventListener("click", () => {
        view.tokenEditing = false;
        ops.requestRender({ content: true });
      });
      ctrl.appendChild(cancelBtn);
    }

    row.appendChild(ctrl);
    return row;
  }

  // ── Step 2: Recipient ──

  function buildRecipientRow() {
    const draft = getFormDraft();
    const row = document.createElement("div");
    row.className = "row tg-approval-recipient-row";

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("telegramApprovalRecipientLabel");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.innerHTML = escapeWithLink(t("telegramApprovalRecipientHintHtml"));
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control tg-approval-input-row";
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.spellcheck = false;
    input.placeholder = t("telegramApprovalRecipientPlaceholder");
    input.className = "tg-approval-input";
    input.value = draft.allowedTgUserId || "";
    input.addEventListener("input", () => setFormDraftValue("allowedTgUserId", input.value));

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "soft-btn accent";
    saveBtn.textContent = view.configPending ? t("telegramApprovalSaving") : t("telegramApprovalSaveRecipient");
    saveBtn.disabled = view.configPending;
    saveBtn.addEventListener("click", () => {
      const raw = String(getFormDraft().allowedTgUserId || "").trim();
      if (!raw) {
        ops.showToast(t("telegramApprovalRecipientEmpty"), { error: true });
        return;
      }
      if (!/^[1-9]\d{4,19}$/.test(raw)) {
        ops.showToast(t("telegramApprovalRecipientInvalid"), { error: true });
        return;
      }
      saveConfig({
        enabled: currentConfig().enabled,
        allowedTgUserId: raw,
        // UI never asks for chat id separately. We mirror user id into the
        // session key — main-side normalizeTelegramSessionKey adds the
        // `telegram:` prefix. Private-chat scenarios always have chat_id ===
        // user_id in Telegram, so this is correct for the supported path.
        targetSessionKey: raw,
        notifyOnComplete: currentConfig().notifyOnComplete,
        completionOutputMode: currentConfig().completionOutputMode,
        r3DirectSendEnabled: currentConfig().r3DirectSendEnabled,
      });
    });

    ctrl.appendChild(input);
    ctrl.appendChild(saveBtn);
    row.appendChild(ctrl);
    return row;
  }

  // ── Step 3: Enable + Test ──

  function buildStep3Section() {
    const tokenConfigured = !!(view.tokenInfo && view.tokenInfo.configured)
      || (view.status && view.status.tokenStored === true);
    const cfg = currentConfig();
    const recipientConfigured = !!cfg.allowedTgUserId;
    const ready = tokenConfigured && recipientConfigured;

    const rows = [];
    if (!ready) {
      rows.push(buildPrerequisitesRow({ tokenConfigured, recipientConfigured }));
    }
    rows.push(buildEnabledRow({ ready }));
    rows.push(buildCompletionOutputRow());
    rows.push(buildDirectSendRow({ ready }));
    rows.push(buildTestRow({ ready }));
    return helpers.buildSection(t("telegramApprovalStep3Title"), rows);
  }

  function buildPrerequisitesRow({ tokenConfigured, recipientConfigured }) {
    const row = document.createElement("div");
    row.className = "row tg-approval-prereq-row";
    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("telegramApprovalPrereqLabel");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    const missing = [];
    if (!tokenConfigured) missing.push(t("telegramApprovalPrereqMissingToken"));
    if (!recipientConfigured) missing.push(t("telegramApprovalPrereqMissingRecipient"));
    desc.textContent = t("telegramApprovalPrereqDesc") + " " + missing.join("、");
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);
    return row;
  }

  function buildEnabledRow({ ready }) {
    const cfg = currentConfig();
    const effectiveEnabled = effectiveTelegramApprovalEnabled(cfg);
    const row = document.createElement("div");
    row.className = "row";
    if (!ready) row.classList.add("tg-approval-row-disabled");

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("telegramApprovalToggle");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = t("telegramApprovalToggleDesc");
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control";
    const sw = document.createElement("div");
    sw.className = "switch";
    sw.setAttribute("role", "switch");
    sw.setAttribute("tabindex", "0");
    helpers.setSwitchVisual(sw, effectiveEnabled, { pending: view.configPending || migrationPending });
    const canToggle = ready && !migrationPending && (effectiveEnabled || migrationSnapshot);
    if (!canToggle) {
      sw.classList.add("disabled");
      sw.setAttribute("aria-disabled", "true");
      sw.removeAttribute("tabindex");
    } else {
      const toggle = () => {
        const turningOff = effectiveEnabled === true;
        // Stop-the-bleed (zombie switch — see docs audit-r1a-notification-switch-2026-05-30):
        // this toggle only writes tgApproval.enabled, but v0.9.0 native runtime
        // (completion notifications + approval transport) is owned by the migration
        // state machine and never reads that field. Turning the switch OFF must also
        // dispatch USER_DISABLE, otherwise the native poller + completion pings keep
        // running and the user thinks they switched it off when they didn't. The
        // ON path now goes through the same native Test flow as the migration
        // card instead of reviving the legacy sidecar flag.
        if (turningOff) {
          if (cfg.enabled === true) {
            saveConfig({ ...cfg, enabled: false }, { resetDraft: false });
          }
          migrationDispatch("USER_DISABLE");
          return;
        }
        if (migrationSnapshot && canStartNativeFromSwitch()) {
          ops.requestRender({ content: true });
          migrationDispatch("USER_TEST_NATIVE");
          return;
        }
      };
      sw.addEventListener("click", toggle);
      sw.addEventListener("keydown", (ev) => {
        if (ev.key === " " || ev.key === "Enter") {
          ev.preventDefault();
          toggle();
        }
      });
    }
    ctrl.appendChild(sw);
    row.appendChild(ctrl);
    return row;
  }

  function buildDirectSendRow({ ready }) {
    const cfg = currentConfig();
    const row = document.createElement("div");
    row.className = "row tg-approval-direct-send-row";
    if (!ready) row.classList.add("tg-approval-row-disabled");

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("telegramApprovalDirectSend");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = t("telegramApprovalDirectSendDesc");
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control";
    const sw = document.createElement("div");
    sw.className = "switch";
    sw.setAttribute("role", "switch");
    sw.setAttribute("tabindex", "0");
    helpers.setSwitchVisual(sw, cfg.r3DirectSendEnabled === true, { pending: view.configPending });
    if (!ready || view.configPending) {
      sw.classList.add("disabled");
      sw.setAttribute("aria-disabled", "true");
      sw.removeAttribute("tabindex");
    } else {
      const toggle = () => {
        saveConfig({ ...cfg, r3DirectSendEnabled: cfg.r3DirectSendEnabled !== true }, { resetDraft: false });
      };
      sw.addEventListener("click", toggle);
      sw.addEventListener("keydown", (ev) => {
        if (ev.key === " " || ev.key === "Enter") {
          ev.preventDefault();
          toggle();
        }
      });
    }
    ctrl.appendChild(sw);
    row.appendChild(ctrl);
    return row;
  }

  function buildCompletionOutputRow() {
    const cfg = currentConfig();
    const mode = ["off", "full"].includes(cfg.completionOutputMode)
      ? cfg.completionOutputMode
      : "off";
    const row = document.createElement("div");
    row.className = "row tg-approval-completion-output-row";

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("telegramApprovalCompletionOutput");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = t("telegramApprovalCompletionOutputDesc");
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control";
    const select = document.createElement("select");
    select.className = "tg-approval-input tg-approval-output-select";
    select.disabled = view.configPending;
    for (const value of ["off", "full"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = t("telegramApprovalCompletionOutput_" + value);
      select.appendChild(option);
    }
    select.value = mode;
    select.addEventListener("change", () => {
      const nextMode = ["off", "full"].includes(select.value) ? select.value : "off";
      if (nextMode === mode) return;
      if (nextMode === "full") {
        const ok = window.confirm(t("telegramApprovalCompletionOutputFullConfirm"));
        if (!ok) {
          select.value = mode;
          return;
        }
      }
      saveConfig({ ...cfg, completionOutputMode: nextMode }, { resetDraft: false });
    });
    ctrl.appendChild(select);
    row.appendChild(ctrl);
    return row;
  }

  function buildTestRow({ ready }) {
    const s = view.status || {};
    const runtimeReady = s.configured === true;
    const nativeStatus = s.transport === "native" || isNativeMigrationSelected();
    const nativeReady = !nativeStatus || (migrationState() === "NATIVE_ACTIVE" && s.status === "running");
    const testDisabled = view.testPending || !ready || !runtimeReady || !nativeReady;
    const row = document.createElement("div");
    row.className = "row";
    if (!ready) row.classList.add("tg-approval-row-disabled");

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("telegramApprovalTest");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = t("telegramApprovalTestDesc");
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "soft-btn accent";
    btn.textContent = view.testPending ? t("telegramApprovalTesting") : t("telegramApprovalSendTest");
    btn.disabled = testDisabled;
    if (testDisabled && !view.testPending) {
      btn.title = (s.message && String(s.message)) || t("telegramApprovalCardMissingBoth");
    }
    btn.addEventListener("click", () => {
      if (testDisabled) return;
      view.testPending = true;
      ops.requestRender({ content: true });
      callCommand("telegramApproval.test").then((result) => {
        view.testPending = false;
        if (result && result.status === "ok") {
          ops.showToast(t("telegramApprovalTestSent"));
        } else {
          ops.showToast((result && result.message) || t("telegramApprovalTestFailed"), { error: true });
        }
        view.status = null;
        refreshStatus({ forceRender: true });
      });
    });
    ctrl.appendChild(btn);
    row.appendChild(ctrl);
    return row;
  }

  // ── Save / shared ──

  function saveFeishuConfig(next, options = {}) {
    if (!window.settingsAPI || typeof window.settingsAPI.update !== "function") {
      ops.showToast(t("toastSaveFailed") + "settings API unavailable", { error: true });
      return;
    }
    view.feishuConfigPending = true;
    ops.requestRender({ content: true });
    window.settingsAPI.update("feishuApproval", next).then((result) => {
      view.feishuConfigPending = false;
      if (!result || result.status !== "ok") {
        ops.showToast((result && result.message) || t("toastSaveFailed"), { error: true });
        ops.requestRender({ content: true });
        return;
      }
      ops.showToast(t("feishuApprovalConfigSaved"));
      if (options.resetDraft !== false) resetFeishuFormDraft();
      view.feishuStatus = null;
      refreshFeishuStatus({ forceRender: true });
    }).catch((err) => {
      view.feishuConfigPending = false;
      ops.showToast(t("toastSaveFailed") + (err && err.message), { error: true });
      ops.requestRender({ content: true });
    });
  }

  function saveConfig(next, options = {}) {
    if (!window.settingsAPI || typeof window.settingsAPI.update !== "function") {
      ops.showToast(t("toastSaveFailed") + "settings API unavailable", { error: true });
      return;
    }
    view.configPending = true;
    ops.requestRender({ content: true });
    window.settingsAPI.update("tgApproval", next).then((result) => {
      view.configPending = false;
      if (!result || result.status !== "ok") {
        ops.showToast((result && result.message) || t("toastSaveFailed"), { error: true });
        ops.requestRender({ content: true });
        return;
      }
      ops.showToast(t("telegramApprovalConfigSaved"));
      if (options.resetDraft !== false) resetFormDraft();
      view.status = null;
      refreshStatus({ forceRender: true });
    }).catch((err) => {
      view.configPending = false;
      ops.showToast(t("toastSaveFailed") + (err && err.message), { error: true });
      ops.requestRender({ content: true });
    });
  }

  // ── Helpers ──

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // i18n hint strings use a constrained mini-syntax: literal text plus
  // [text](https://...) link tokens. We escape the literal text and only
  // expand whitelisted https://t.me/* links so a malicious translation can't
  // inject arbitrary HTML.
  function escapeWithLink(text) {
    const raw = String(text == null ? "" : text);
    const parts = [];
    let lastIdx = 0;
    const re = /\[([^\]]+)\]\((https:\/\/t\.me\/[A-Za-z0-9_./?#=&-]+)\)/g;
    let match;
    while ((match = re.exec(raw)) !== null) {
      parts.push(escapeHtml(raw.slice(lastIdx, match.index)));
      parts.push(`<a href="${escapeHtml(match[2])}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[1])}</a>`);
      lastIdx = match.index + match[0].length;
    }
    parts.push(escapeHtml(raw.slice(lastIdx)));
    return parts.join("");
  }

  function init(core) {
    coreRef = core;
    state = core.state;
    helpers = core.helpers;
    ops = core.ops;
    core.tabs["telegram-approval"] = { render };
  }

  root.ClawdSettingsTabTelegramApproval = { init };
})(globalThis);
