"use strict";

function platformUi(platform = process.platform) {
  if (platform === "darwin") {
    return Object.freeze({
      deviceNoun: "Mac",
      shortcutLabel: "Command + Shift + H",
      shortcutGlyphs: "⌘ ⇧ H",
    });
  }
  if (platform === "win32") {
    return Object.freeze({
      deviceNoun: "PC",
      shortcutLabel: "Ctrl + Shift + H",
      shortcutGlyphs: "Ctrl ⇧ H",
    });
  }
  return Object.freeze({
    deviceNoun: "computer",
    shortcutLabel: "Ctrl + Shift + H",
    shortcutGlyphs: "Ctrl ⇧ H",
  });
}

module.exports = { platformUi };
