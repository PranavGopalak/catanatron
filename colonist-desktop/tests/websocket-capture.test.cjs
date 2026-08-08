"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { ColonistWebSocketCapture, MAX_BASE64_CHARS } = require("../src/websocket-capture");

class FakeDebugger extends EventEmitter {
  constructor() {
    super();
    this.attached = false;
    this.commands = [];
  }

  isAttached() { return this.attached; }
  attach(version) { this.attached = true; this.version = version; }
  detach() { this.attached = false; this.emit("detach", {}, "target closed"); }
  async sendCommand(command) { this.commands.push(command); }
}

test("captures only bounded binary WebSocket frames", async () => {
  const debuggerApi = new FakeDebugger();
  const frames = [];
  const statuses = [];
  const capture = new ColonistWebSocketCapture(
    { debugger: debuggerApi },
    { onFrame: (frame) => frames.push(frame), onStatus: (status) => statuses.push(status) }
  );

  await capture.enable();
  assert.equal(capture.status().attached, true);
  assert.deepEqual(debuggerApi.commands, ["Network.enable"]);
  debuggerApi.emit("message", {}, "Network.webSocketCreated", { requestId: "socket-1", url: "wss://colonist.io/game" });
  debuggerApi.emit("message", {}, "Network.webSocketFrameReceived", { requestId: "socket-1", response: { opcode: 2, payloadData: "AQID" } });
  debuggerApi.emit("message", {}, "Network.webSocketFrameSent", { requestId: "socket-1", response: { opcode: 1, payloadData: "ignored text" } });
  debuggerApi.emit("message", {}, "Network.webSocketFrameReceived", { requestId: "socket-1", response: { opcode: 2, payloadData: "A".repeat(MAX_BASE64_CHARS + 1) } });

  assert.equal(frames.length, 1);
  assert.equal(frames[0].direction, "in");
  assert.equal(frames[0].url, "wss://colonist.io/game");
  assert.equal(frames[0].base64, "AQID");
  assert.equal(capture.status().droppedFrames, 1);
  assert(statuses.length >= 2);

  await capture.disable();
  assert.equal(capture.status().enabled, false);
  assert.equal(capture.status().attached, false);
});
