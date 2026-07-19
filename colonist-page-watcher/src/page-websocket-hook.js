(() => {
  if (window.__COLONIST_WATCHER_WS_HOOKED__) return;
  window.__COLONIST_WATCHER_WS_HOOKED__ = true;

  const NativeWebSocket = window.WebSocket;
  const MAX_PAYLOAD_CHARS = 20000;

  function now() {
    return new Date().toISOString();
  }

  function truncate(value) {
    const text = String(value ?? "");
    if (text.length <= MAX_PAYLOAD_CHARS) return { text, truncated: false };
    return { text: text.slice(0, MAX_PAYLOAD_CHARS), truncated: true };
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }

  async function serializePayload(payload) {
    try {
      if (typeof payload === "string") {
        const result = truncate(payload);
        return { kind: "text", text: result.text, truncated: result.truncated, size: payload.length };
      }
      if (payload instanceof ArrayBuffer) {
        const bytes = new Uint8Array(payload);
        return { kind: "arraybuffer", base64: bytesToBase64(bytes.slice(0, MAX_PAYLOAD_CHARS)), truncated: bytes.length > MAX_PAYLOAD_CHARS, size: bytes.length };
      }
      if (ArrayBuffer.isView(payload)) {
        const bytes = new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
        return { kind: payload.constructor?.name || "typedarray", base64: bytesToBase64(bytes.slice(0, MAX_PAYLOAD_CHARS)), truncated: bytes.length > MAX_PAYLOAD_CHARS, size: bytes.length };
      }
      if (payload instanceof Blob) {
        const text = await payload.slice(0, MAX_PAYLOAD_CHARS).text();
        const result = truncate(text);
        return { kind: "blob", text: result.text, truncated: payload.size > MAX_PAYLOAD_CHARS || result.truncated, size: payload.size, type: payload.type };
      }
      const result = truncate(Object.prototype.toString.call(payload));
      return { kind: "unknown", text: result.text, truncated: result.truncated };
    } catch (error) {
      return { kind: "serialization_error", text: String(error?.message || error), truncated: false };
    }
  }

  function postFrame(frame) {
    window.postMessage({ source: "COLONIST_WATCHER_WS", frame }, "*");
  }

  async function postPayloadFrame(socket, direction, payload) {
    const serialized = await serializePayload(payload);
    postFrame({
      capturedAt: now(),
      direction,
      url: socket.__colonistWatcherUrl,
      readyState: socket.readyState,
      protocol: socket.protocol,
      extensions: socket.extensions,
      ...serialized,
    });
  }

  function WatcherWebSocket(url, protocols) {
    const socket = protocols === undefined
      ? new NativeWebSocket(url)
      : new NativeWebSocket(url, protocols);
    socket.__colonistWatcherUrl = String(url);

    postFrame({
      capturedAt: now(),
      direction: "open",
      url: socket.__colonistWatcherUrl,
      readyState: socket.readyState,
      protocols: protocols === undefined ? undefined : protocols,
    });

    socket.addEventListener("message", (event) => {
      postPayloadFrame(socket, "in", event.data);
    });
    socket.addEventListener("close", (event) => {
      postFrame({
        capturedAt: now(),
        direction: "close",
        url: socket.__colonistWatcherUrl,
        readyState: socket.readyState,
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
    });
    socket.addEventListener("error", () => {
      postFrame({
        capturedAt: now(),
        direction: "error",
        url: socket.__colonistWatcherUrl,
        readyState: socket.readyState,
      });
    });

    return socket;
  }

  WatcherWebSocket.prototype = NativeWebSocket.prototype;
  Object.setPrototypeOf(WatcherWebSocket, NativeWebSocket);
  Object.defineProperty(WatcherWebSocket, "CONNECTING", { value: NativeWebSocket.CONNECTING });
  Object.defineProperty(WatcherWebSocket, "OPEN", { value: NativeWebSocket.OPEN });
  Object.defineProperty(WatcherWebSocket, "CLOSING", { value: NativeWebSocket.CLOSING });
  Object.defineProperty(WatcherWebSocket, "CLOSED", { value: NativeWebSocket.CLOSED });

  const nativeSend = NativeWebSocket.prototype.send;
  NativeWebSocket.prototype.send = function sendWithCapture(payload) {
    postPayloadFrame(this, "out", payload);
    return nativeSend.call(this, payload);
  };

  window.WebSocket = WatcherWebSocket;
  postFrame({ capturedAt: now(), direction: "hooked", url: location.href, readyState: null });
})();
