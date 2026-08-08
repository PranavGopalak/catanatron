"use strict";

const MAX_BASE64_CHARS = 700000;

class ColonistWebSocketCapture {
  constructor(webContents, { onFrame = () => {}, onStatus = () => {} } = {}) {
    this.webContents = webContents;
    this.onFrame = onFrame;
    this.onStatus = onStatus;
    this.socketUrls = new Map();
    this.enabled = false;
    this.attached = false;
    this.framesCaptured = 0;
    this.droppedFrames = 0;
    this.lastError = null;
    this.boundMessage = this.handleMessage.bind(this);
    this.boundDetach = this.handleDetach.bind(this);
  }

  status() {
    return {
      enabled: this.enabled,
      attached: this.attached,
      framesCaptured: this.framesCaptured,
      droppedFrames: this.droppedFrames,
      lastError: this.lastError,
    };
  }

  emitStatus() {
    this.onStatus(this.status());
  }

  async enable() {
    this.enabled = true;
    if (this.attached) {
      this.emitStatus();
      return this.status();
    }
    try {
      if (!this.webContents.debugger.isAttached()) this.webContents.debugger.attach("1.3");
      this.webContents.debugger.on("message", this.boundMessage);
      this.webContents.debugger.on("detach", this.boundDetach);
      await this.webContents.debugger.sendCommand("Network.enable");
      this.attached = true;
      this.lastError = null;
    } catch (error) {
      this.attached = false;
      this.lastError = String(error?.message || error);
    }
    this.emitStatus();
    return this.status();
  }

  async disable() {
    this.enabled = false;
    this.socketUrls.clear();
    try {
      const debuggerApi = this.webContents.debugger;
      if (debuggerApi.isAttached()) debuggerApi.detach();
      debuggerApi.removeListener("message", this.boundMessage);
      debuggerApi.removeListener("detach", this.boundDetach);
    } catch (_error) {}
    this.attached = false;
    this.emitStatus();
    return this.status();
  }

  handleDetach(_event, reason) {
    this.attached = false;
    if (this.enabled) this.lastError = `Capture detached: ${reason || "unknown reason"}`;
    this.emitStatus();
  }

  handleMessage(_event, method, params = {}) {
    if (!this.enabled) return;
    if (method === "Network.webSocketCreated") {
      this.socketUrls.set(params.requestId, params.url || "");
      return;
    }
    if (method === "Network.webSocketClosed") {
      this.socketUrls.delete(params.requestId);
      return;
    }
    const direction = method === "Network.webSocketFrameReceived"
      ? "in"
      : method === "Network.webSocketFrameSent"
        ? "out"
        : null;
    if (!direction || Number(params.response?.opcode) !== 2) return;
    const base64 = String(params.response?.payloadData || "");
    if (!base64 || base64.length > MAX_BASE64_CHARS) {
      this.droppedFrames += 1;
      this.emitStatus();
      return;
    }
    this.framesCaptured += 1;
    this.onFrame({
      capturedAt: new Date().toISOString(),
      direction,
      url: this.socketUrls.get(params.requestId) || "",
      kind: "arraybuffer",
      base64,
      size: Math.floor((base64.length * 3) / 4),
    });
    if (this.framesCaptured % 25 === 0) this.emitStatus();
  }
}

module.exports = { ColonistWebSocketCapture, MAX_BASE64_CHARS };
