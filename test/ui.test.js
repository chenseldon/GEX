import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../src/public/index.html", import.meta.url), "utf8");

test("V2 shell exposes GammaFlip-style advanced studio controls", () => {
  [
    'rel="icon"',
    'id="ctxTrigger"',
    'id="ctxModal"',
    'id="reachPanel"',
    'id="chartControlsPanel"',
    'id="tmControlsBar"',
    'id="termViewToggle"',
    'id="settingsDialog"',
    'id="menuPanel"',
    'id="helpDrawer"',
  ].forEach((needle) => {
    assert.match(html, new RegExp(escapeRegExp(needle)));
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
