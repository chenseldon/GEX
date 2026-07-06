import { lookup } from "node:dns/promises";
import { Socket } from "node:net";

import { createDeribitJsonRpcClient, defaultDeribitEndpoint } from "./deribitClient.js";

export async function diagnoseDeribitConnectivity({
  endpoint = defaultDeribitEndpoint(),
  symbol = "BTC",
  proxyUrl = process.env.DERIBIT_PROXY_URL ?? null,
  lookupHost = defaultLookupHost,
  tcpProbe = defaultTcpProbe,
  client = createDeribitJsonRpcClient({ endpoint }),
} = {}) {
  const host = new URL(endpoint).hostname;
  const checks = {
    dns: await runCheck(async () => {
      const addresses = await lookupHost(host);
      return { addresses };
    }),
    tcp: { status: "skipped" },
    getTime: { status: "skipped" },
    getInstruments: { status: "skipped" },
  };

  if (proxyUrl) {
    checks.tcp = { status: "skipped", reason: "proxy_configured" };
  } else if (checks.dns.status === "ok") {
    checks.tcp = await runCheck(async () => {
      const result = await tcpProbe(host, 443);
      if (!result.ok) {
        throw new Error(result.error ?? "TCP connect failed");
      }
      return result;
    });
  }

  if (checks.tcp.status === "ok" || proxyUrl) {
    checks.getTime = await runCheck(async () => ({
      value: await client.call("public/get_time"),
    }));
    checks.getInstruments = await runCheck(async () => {
      const result = await client.call("public/get_instruments", {
        currency: symbol,
        kind: "option",
        expired: false,
      });
      return { count: Array.isArray(result) ? result.length : 0 };
    });
  }

  return {
    endpoint,
    host,
    proxyUrl,
    symbol,
    summary: summarize(checks),
    checks,
  };
}

async function defaultLookupHost(host) {
  return lookup(host, { all: true });
}

function defaultTcpProbe(host, port, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    const socket = new Socket();
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, error: `connect timeout after ${timeoutMs}ms` }));
    socket.once("error", (error) => finish({ ok: false, error: error.message }));
    socket.connect(port, host);
  });
}

async function runCheck(fn) {
  try {
    return {
      status: "ok",
      ...await fn(),
    };
  } catch (error) {
    return {
      status: "failed",
      error: error.message,
    };
  }
}

function summarize(checks) {
  if (checks.dns.status === "failed") return "dns_failed";
  if (checks.tcp.status === "failed") {
    return /timeout/i.test(checks.tcp.error ?? "") ? "connect_timeout" : "tcp_failed";
  }
  if (checks.getTime.status === "failed") return "api_get_time_failed";
  if (checks.getInstruments.status === "failed") return "api_get_instruments_failed";
  return "ok";
}
