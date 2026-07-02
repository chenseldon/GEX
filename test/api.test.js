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
