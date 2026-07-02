import assert from "node:assert/strict";
import test from "node:test";

import { createApiHandler } from "../src/server/api.js";

async function request(path) {
  const handler = createApiHandler();
  return handler(new Request(`http://localhost${path}`));
}

test("GET /api/instruments returns supported crypto option symbols", async () => {
  const response = await request("/api/instruments");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(
    payload.instruments.map((instrument) => instrument.symbol),
    ["BTC", "ETH", "SOL", "XRP"],
  );
});

test("GET /api/gex/summary rejects unsupported symbols", async () => {
  const response = await request("/api/gex/summary?symbol=SPX");
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.error, /Unsupported symbol/);
});

test("GET /api/gex/by-strike returns filtered expiry rows and key markers", async () => {
  const response = await request("/api/gex/by-strike?symbol=BTC&expiry=2024-07-26");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.symbol, "BTC");
  assert.equal(payload.rows.every((row) => row.expiry === "2024-07-26"), true);
  assert.equal(typeof payload.markers.gammaFlip, "number");
  assert.equal(typeof payload.markers.callWall, "number");
  assert.equal(typeof payload.markers.putWall, "number");
});

test("GET /api/data-health returns source freshness and coverage", async () => {
  const response = await request("/api/data-health");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.sources[0].name, "sample-deribit-fixture");
  assert.equal(payload.coverage.symbols, 4);
});

test("GET /api/gex/dashboard returns V2 dashboard gauges, levels, and widgets", async () => {
  const response = await request("/api/gex/dashboard?symbol=BTC");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.symbol, "BTC");
  assert.equal(payload.gauges.length, 3);
  assert.equal(payload.keyLevels.length, 6);
  assert.equal(payload.trends.points.length, 24);
  assert.equal(payload.heatmaps.net.rows.length > 0, true);
  assert.equal(payload.changeTable.rows.length > 0, true);
});

test("GET /api/gex/studio respects expiry filtering and includes summary rail", async () => {
  const response = await request("/api/gex/studio?symbol=BTC&expiry=2024-07-26&mode=snapshot");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.symbol, "BTC");
  assert.equal(payload.rows.every((row) => row.expiry === "2024-07-26"), true);
  assert.deepEqual(
    payload.summaryRail.map((card) => card.id),
    ["flip_point", "hedging_pressure", "absolute_gex"],
  );
});

test("GET /api/gex/trends rejects unsupported symbols", async () => {
  const response = await request("/api/gex/trends?symbol=DOGE");
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.error, /Unsupported symbol/);
});

test("GET /api/gex/heatmap rejects invalid heatmap types", async () => {
  const response = await request("/api/gex/heatmap?symbol=BTC&type=skew");
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.error, /type must be net or abs/);
});

test("GET /api/gex/change-table rejects invalid coverage", async () => {
  const response = await request("/api/gex/change-table?symbol=BTC&coverage=75");
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.error, /coverage must be one of/);
});
