import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import { ProxyAgent } from "proxy-agent";

const PROD_ENDPOINT = "https://www.deribit.com/api/v2";
const TESTNET_ENDPOINT = "https://test.deribit.com/api/v2";

export function createDeribitJsonRpcClient({
  endpoint = defaultDeribitEndpoint(),
  fetchImpl = createDeribitFetch({
    proxyUrl: process.env.DERIBIT_PROXY_URL,
    timeoutMs: Number(process.env.DERIBIT_TIMEOUT_MS ?? 10_000),
  }),
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch implementation is required");
  }

  let nextId = 1;

  async function call(method, params = {}) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId++,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`Deribit HTTP ${response.status} for ${method}`);
    }

    const payload = await response.json();
    if (payload.error) {
      const message = payload.error.message ?? "Unknown Deribit JSON-RPC error";
      throw new Error(`Deribit ${method} failed: ${message}`);
    }

    return payload.result;
  }

  return {
    endpoint,
    call,
    getInstruments(currency) {
      return call("public/get_instruments", {
        currency,
        kind: "option",
        expired: false,
      });
    },
    getTicker(instrumentName) {
      return call("public/ticker", { instrument_name: instrumentName });
    },
    getTradingviewChartData(params) {
      return call("public/get_tradingview_chart_data", params);
    },
    getLastTradesByInstrument(params) {
      return call("public/get_last_trades_by_instrument", params);
    },
    getHistoricalVolatility(currency) {
      return call("public/get_historical_volatility", { currency });
    },
    getOrderBook(instrumentName, depth = 20) {
      return call("public/get_order_book", {
        instrument_name: instrumentName,
        depth,
      });
    },
    authenticateClientCredentials({ clientId, clientSecret, scope } = {}) {
      if (!clientId || !clientSecret) {
        throw new Error("clientId and clientSecret are required for Deribit auth");
      }
      return call("public/auth", {
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        ...(scope ? { scope } : {}),
      });
    },
  };
}

export function defaultDeribitEndpoint() {
  if (process.env.DERIBIT_ENDPOINT) {
    return process.env.DERIBIT_ENDPOINT;
  }
  return process.env.DERIBIT_ENV === "testnet" ? TESTNET_ENDPOINT : PROD_ENDPOINT;
}

export function createDeribitTransportConfig() {
  return {
    endpoint: defaultDeribitEndpoint(),
    proxyUrl: process.env.DERIBIT_PROXY_URL ?? null,
    timeoutMs: Number(process.env.DERIBIT_TIMEOUT_MS ?? 10_000),
  };
}

export function createDeribitFetch({ proxyUrl, timeoutMs = 10_000 } = {}) {
  if (!proxyUrl) {
    return async (url, options) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await globalThis.fetch(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
    };
  }

  const agent = new ProxyAgent(proxyUrl);
  return (url, options = {}) => nodeRequest(url, { ...options, agent, timeoutMs });
}

function nodeRequest(url, { method = "GET", headers = {}, body, agent, timeoutMs }) {
  const target = new URL(url);
  const requestImpl = target.protocol === "http:" ? httpRequest : httpsRequest;

  return new Promise((resolve, reject) => {
    const req = requestImpl(
      target,
      {
        method,
        headers,
        agent,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const payload = Buffer.concat(chunks);
          resolve(new Response(payload, {
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
          }));
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error(`request timeout after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}
