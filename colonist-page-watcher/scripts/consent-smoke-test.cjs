#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const popupHtml = read("src", "popup.html");
const popupJs = read("src", "popup.js");
const content = read("src", "content.js");
const background = read("src", "background.js");

assert(popupHtml.includes("Allow game tracking on Colonist?") && popupHtml.includes("It does not send this data to us or any third party."), "popup must prominently disclose local capture");
assert(popupHtml.includes('id="trackingConsent"'), "popup must provide affirmative consent control");
assert(popupJs.includes("colonistWatcherTrackingEnabled") && popupJs.includes("Enable tracking"), "popup must persist and render consent");
assert(content.includes("colonistWatcherTrackingEnabled: false") && content.includes("if (!trackingEnabled) return"), "content capture must default off and be gated");
assert(background.includes('details.reason === "install"') && background.includes("colonistWatcherTrackingEnabled: false"), "fresh installs must default tracking off");
console.log("consent smoke test ok");
