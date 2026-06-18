"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  loadFeishuSdk,
  normalizeSpikeConfig,
  runFeishuSdkSpike,
  validateSpikeConfig,
} = require("../src/feishu-sdk-spike");

function loadEnvFile(filePath) {
  if (!filePath) return {};
  const envPath = path.resolve(filePath);
  let text = "";
  try {
    text = fs.readFileSync(envPath, "utf8");
  } catch (err) {
    return { __error: `Could not read env file: ${err && err.message ? err.message : err}` };
  }
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function main() {
  const envFileArg = process.argv.find((arg) => arg.startsWith("--env-file="));
  const envFilePath = envFileArg ? envFileArg.slice("--env-file=".length) : process.env.CLAWD_FEISHU_SPIKE_ENV_FILE;
  const fileEnv = loadEnvFile(envFilePath);
  if (fileEnv.__error) {
    console.error(fileEnv.__error);
    process.exitCode = 1;
    return;
  }

  const mergedEnv = { ...process.env, ...fileEnv };
  const config = normalizeSpikeConfig({}, mergedEnv);
  console.log("Feishu spike config:", JSON.stringify(config.safeSummary, null, 2));

  const sdkStatus = loadFeishuSdk();
  if (sdkStatus.status !== "ok") {
    console.error(sdkStatus.message);
    process.exitCode = 1;
    return;
  }
  console.log("Feishu SDK capabilities:", JSON.stringify(sdkStatus.capabilities, null, 2));

  const valid = validateSpikeConfig(config);
  if (valid.status !== "ok") {
    console.error(valid.message);
    if (valid.code === "UNSUPPORTED_RECEIVE_ID_TYPE") {
      console.error("For this phase 1 Channel spike, set CLAWD_FEISHU_RECEIVE_ID_TYPE=chat_id.");
    }
    process.exitCode = 1;
    return;
  }

  console.log("Connecting long-connection channel and sending a v2 approval card...");
  console.log("Tap Allow once or Deny in Feishu before the timeout.");
  const result = await runFeishuSdkSpike(config, { sdk: sdkStatus.sdk });
  if (result.status === "ok") {
    console.log(`Feishu approval callback received: ${result.decision}`);
    return;
  }
  console.error(`Feishu spike failed: ${result.code || result.status} ${result.message || ""}`.trim());
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
