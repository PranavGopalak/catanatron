"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { sanitizeHudState } = require("./hud-state");

class HudStateStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, "hud-state.json");
    this.writeQueue = Promise.resolve();
  }

  read() {
    try {
      return sanitizeHudState(JSON.parse(fs.readFileSync(this.filePath, "utf8")));
    } catch (_error) {
      return sanitizeHudState(null);
    }
  }

  write(candidate) {
    const state = sanitizeHudState(candidate);
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        const temporaryPath = `${this.filePath}.tmp`;
        await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.promises.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
        await fs.promises.rename(temporaryPath, this.filePath);
      });
    return this.writeQueue.then(() => state);
  }

  reset() {
    return this.write(null);
  }
}

module.exports = { HudStateStore };
