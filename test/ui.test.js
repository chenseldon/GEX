import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../src/public/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/public/app.js", import.meta.url), "utf8");
const renderedSurface = `${html}\n${app}`;

test("V2 shell exposes GammaFlip-style advanced studio controls", () => {
  [
    'rel="icon"',
    'id="ctxTrigger"',
    'id="ctxModal"',
    'id="reachPanel"',
    'id="productSwitchButton"',
    'id="productMenu"',
    'id="reachHorizonTabs"',
    'id="reachImpactTabs"',
    'id="reachDirectionTabs"',
    'id="reachComputeButton"',
    'id="chartControlsPanel"',
    'id="showPositiveToggle"',
    'id="showNegativeToggle"',
    'id="showAbsoluteToggle"',
    'id="showRegimeToggle"',
    'id="studioModeSummary"',
    'id="studioCategoryDetails"',
    'id="layerChips"',
    'id="expiryViewTabs"',
    'id="expiryMetricTabs"',
    'id="expiryDteTicks"',
    'id="historyWindowTabs"',
    'id="historyGexTabs"',
    'data-history-window="90d"',
    'data-history-gex="abs"',
    'class="studio-chart interactive-chart"',
    'id="tmControlsBar"',
    'id="termViewToggle"',
    'id="settingsDialog"',
    'id="menuPanel"',
    'id="helpDrawer"',
  ].forEach((needle) => {
    assert.match(renderedSurface, new RegExp(escapeRegExp(needle)));
  });
});

test("Studio chart supports GammaFlip-style chart interactions", () => {
  [
    "selectedMarkerId",
    "crosshair",
    "panOffset",
    "bindStudioChartInteractions",
    "pointermove",
    "wheel",
    "data-action=\"reset-chart\"",
    "data-marker-id",
    "renderLayerChips",
    "data-layer",
    "renderStudioTermStructureChart",
    "GEX Term Structure",
    "Positioning",
    "Max Expiration",
    "renderExpiryLevelsChart",
    "renderExpiryPositioningChart",
    "GEX NET by Expiration",
    "25Δ RR by Expiration",
    "renderHistoryHeatmapChart",
    "historyHeatmapData",
    "GEX Heatmap",
    "GEX ($M)",
    "data.gexType === \"abs\"",
    "renderForecastMonteCarloChart",
    "monteCarloForecastData",
    "resolveForecastInput",
    "__GEX_FORECAST_DATA__",
    "forecastCache",
    "cumulativeProbability",
    "forecastPriceFromPointer",
    "forecast-path",
    "Terminal density",
  ].forEach((needle) => {
    assert.match(app, new RegExp(escapeRegExp(needle)));
  });
});

test("Live snapshot resumes after history, symbol, and expiry changes", () => {
  [
    "function activateLiveSnapshot()",
    "state.crosshair = null;",
    "let queuedLoadData = false;",
    "queuedLoadData = true;",
    "if (queuedLoadData) {",
    "activateLiveSnapshot();\n      renderStudio();\n      await loadData();\n      return;",
    "els.expirySelect.addEventListener(\"change\"",
    "button.addEventListener(\"click\", async () => {\n    state.expiry = value;\n    activateLiveSnapshot();",
  ].forEach((needle) => {
    assert.match(app, new RegExp(escapeRegExp(needle)));
  });
});

test("V2 shell mirrors observed GammaFlip picker and reach vocabulary", () => {
  [
    "GEX Studio",
    "Dashboard",
    "Settles 08:00 UTC",
    "Hold <kbd>Alt</kbd> to see the chart",
    "Monte Carlo",
    "Horizon — how far ahead",
    "GEX impact — how strongly gamma pins or amplifies moves",
    "Direction — which side to measure",
    "▶ Compute",
  ].forEach((needle) => {
    assert.match(renderedSurface, new RegExp(escapeRegExp(needle)));
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
