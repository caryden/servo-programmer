const VID = 0x0471;
const PID = 0x13aa;
const REPORT_ID = 0x04;
const REPORT_SIZE = 64;
const PAYLOAD_SIZE = REPORT_SIZE - 1;

const CMD_IDENTIFY = 0x8a;
const CMD_READ = 0xcd;
const MAX_CHUNK = 0x3b;
const CONFIG_BLOCK_SIZE = 95;
const CHUNK_SLEEP_MS = 25;
const REPLY_TIMEOUT_MS = 1000;

const requestButton = document.querySelector("#requestDevice");
const reconnectButton = document.querySelector("#reconnect");
const openButton = document.querySelector("#openDevice");
const identifyButton = document.querySelector("#identifyDevice");
const readConfigButton = document.querySelector("#readConfig");
const closeButton = document.querySelector("#closeDevice");

const environmentEl = document.querySelector("#environment");
const deviceInfoEl = document.querySelector("#deviceInfo");
const latestReplyEl = document.querySelector("#latestReply");
const logEl = document.querySelector("#log");

let device = null;

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  logEl.textContent += `[${timestamp}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function hex(value, width = 2) {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

function hexDump(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function summarizeCollections(selectedDevice) {
  return selectedDevice.collections.map((collection) => ({
    usagePage: hex(collection.usagePage, 4),
    usage: hex(collection.usage, 4),
    inputReports: collection.inputReports.map((report) => report.reportId),
    outputReports: collection.outputReports.map((report) => report.reportId),
    featureReports: collection.featureReports.map((report) => report.reportId),
  }));
}

function renderEnvironment() {
  const hasHid = "hid" in navigator;
  const lines = [
    `Secure context: ${window.isSecureContext}`,
    `WebHID available: ${hasHid}`,
    `User agent: ${navigator.userAgent}`,
  ];
  environmentEl.textContent = lines.join("\n");
}

function renderDevice() {
  if (!device) {
    deviceInfoEl.textContent = "No device selected.";
    return;
  }

  const info = {
    productName: device.productName,
    vendorId: hex(device.vendorId, 4),
    productId: hex(device.productId, 4),
    opened: device.opened,
    collections: summarizeCollections(device),
  };
  deviceInfoEl.textContent = JSON.stringify(info, null, 2);
}

function setButtons() {
  const hasDevice = Boolean(device);
  const isOpen = Boolean(device?.opened);
  openButton.disabled = !hasDevice || isOpen;
  identifyButton.disabled = !isOpen;
  readConfigButton.disabled = !isOpen;
  closeButton.disabled = !isOpen;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildPayload(command, address = 0x0000, length = 0x00, body = new Uint8Array()) {
  if (body.length > MAX_CHUNK) {
    throw new Error(`payload body too large: ${body.length} > ${MAX_CHUNK}`);
  }

  const payload = new Uint8Array(PAYLOAD_SIZE);
  payload[0] = command;
  payload[1] = (address >> 8) & 0xff;
  payload[2] = address & 0xff;
  payload[3] = length & 0xff;
  payload.set(body, 4);
  return payload;
}

function waitForInputReport(timeoutMs = REPLY_TIMEOUT_MS) {
  if (!device) {
    throw new Error("No device selected.");
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      device?.removeEventListener("inputreport", onInputReport);
      reject(new Error(`Timed out waiting for input report after ${timeoutMs} ms`));
    }, timeoutMs);

    function onInputReport(event) {
      if (event.device !== device) {
        return;
      }

      window.clearTimeout(timer);
      device?.removeEventListener("inputreport", onInputReport);

      const bytes = new Uint8Array(
        event.data.buffer.slice(event.data.byteOffset, event.data.byteOffset + event.data.byteLength),
      );
      resolve({
        reportId: event.reportId,
        data: bytes,
      });
    }

    device.addEventListener("inputreport", onInputReport);
  });
}

async function transfer(payload, timeoutMs = REPLY_TIMEOUT_MS) {
  if (!device?.opened) {
    throw new Error("Device is not open.");
  }

  const replyPromise = waitForInputReport(timeoutMs);
  await device.sendReport(REPORT_ID, payload);
  return replyPromise;
}

function modeLabel(modeByte) {
  if (modeByte === 0x03) return "servo_mode";
  if (modeByte === 0x04) return "cr_mode";
  return "unknown";
}

async function identify() {
  const reply = await transfer(buildPayload(CMD_IDENTIFY, 0x0000, 0x04));
  const statusHi = reply.data[0] ?? 0xff;
  const statusLo = reply.data[1] ?? 0xff;
  const modeByte = reply.data[4] ?? null;

  const parsed = {
    reportId: hex(reply.reportId),
    statusHi: hex(statusHi),
    statusLo: hex(statusLo),
    present: statusLo !== 0xfa,
    modeByte: modeByte === null ? null : hex(modeByte),
    mode: modeByte === null ? "unknown" : modeLabel(modeByte),
    rawData: hexDump(reply.data),
  };

  latestReplyEl.textContent = JSON.stringify(parsed, null, 2);
  log(`identify reply: statusHi=${parsed.statusHi} statusLo=${parsed.statusLo} mode=${parsed.mode}`);
  return parsed;
}

async function readChunk(address, length) {
  await sleep(CHUNK_SLEEP_MS);
  const reply = await transfer(buildPayload(CMD_READ, address, length));
  const statusHi = reply.data[0] ?? 0xff;
  const statusLo = reply.data[1] ?? 0xff;

  if (statusHi !== 0x01 || statusLo !== 0x00) {
    throw new Error(
      `read chunk nack at ${hex(address, 4)}: statusHi=${hex(statusHi)} statusLo=${hex(statusLo)}`,
    );
  }

  return reply.data.slice(4, 4 + length);
}

function modelIdFromConfig(config) {
  let out = "";
  for (let offset = 0x40; offset < 0x48; offset += 1) {
    const value = config[offset];
    if (value === undefined || value === 0x00) {
      break;
    }
    out += String.fromCharCode(value);
  }
  return out;
}

async function readFullConfig() {
  const chunk0 = await readChunk(0x0000, MAX_CHUNK);
  const chunk1 = await readChunk(MAX_CHUNK, CONFIG_BLOCK_SIZE - MAX_CHUNK);
  const config = new Uint8Array(CONFIG_BLOCK_SIZE);
  config.set(chunk0, 0);
  config.set(chunk1, MAX_CHUNK);

  const parsed = {
    length: config.length,
    modelId: modelIdFromConfig(config),
    firstChunk: hexDump(chunk0),
    secondChunk: hexDump(chunk1),
  };

  latestReplyEl.textContent = JSON.stringify(parsed, null, 2);
  log(`read config: ${config.length} bytes, modelId=${parsed.modelId || "(empty)"}`);
  return parsed;
}

async function pickAuthorizedDevice() {
  const devices = await navigator.hid.getDevices();
  return devices.find((candidate) => candidate.vendorId === VID && candidate.productId === PID) ?? null;
}

async function requestDevice() {
  const devices = await navigator.hid.requestDevice({
    filters: [{ vendorId: VID, productId: PID }],
  });
  device = devices[0] ?? null;
  renderDevice();
  setButtons();
  log(device ? `selected ${device.productName}` : "requestDevice returned no selection");
}

async function reconnectAuthorized() {
  device = await pickAuthorizedDevice();
  renderDevice();
  setButtons();
  log(device ? `reused authorized device ${device.productName}` : "no authorized Axon device found");
}

async function openSelectedDevice() {
  if (!device) {
    throw new Error("No device selected.");
  }
  await device.open();
  renderDevice();
  setButtons();
  log("device opened");
}

async function closeSelectedDevice() {
  if (device?.opened) {
    await device.close();
    log("device closed");
  }
  renderDevice();
  setButtons();
}

async function runAction(fn) {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`error: ${message}`);
  }
}

requestButton.addEventListener("click", () => runAction(requestDevice));
reconnectButton.addEventListener("click", () => runAction(reconnectAuthorized));
openButton.addEventListener("click", () => runAction(openSelectedDevice));
identifyButton.addEventListener("click", () => runAction(identify));
readConfigButton.addEventListener("click", () => runAction(readFullConfig));
closeButton.addEventListener("click", () => runAction(closeSelectedDevice));

if ("hid" in navigator) {
  navigator.hid.addEventListener("disconnect", (event) => {
    if (device && event.device === device) {
      log("selected device disconnected");
      device = null;
      renderDevice();
      setButtons();
    } else {
      log(`other HID device disconnected: ${event.device.productName}`);
    }
  });
} else {
  log("WebHID is not available in this browser.");
}

renderEnvironment();
renderDevice();
setButtons();
log("ready");
