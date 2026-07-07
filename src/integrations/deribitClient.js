import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

const PROD_ENDPOINT = "https://www.deribit.com/api/v2";
const TESTNET_ENDPOINT = "https://test.deribit.com/api/v2";
const DEFAULT_LOCAL_PROXY_URL = "http://127.0.0.1:7897";

export function createDeribitJsonRpcClient({
  endpoint = defaultDeribitEndpoint(),
  fetchImpl = createDeribitFetch({
    proxyUrl: defaultDeribitProxyUrl(),
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
    getBookSummaryByCurrency(currency, kind = "option") {
      return call("public/get_book_summary_by_currency", {
        currency,
        kind,
      });
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
    getIndexPrice(indexName) {
      return call("public/get_index_price", { index_name: indexName });
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
    proxyUrl: defaultDeribitProxyUrl(),
    timeoutMs: Number(process.env.DERIBIT_TIMEOUT_MS ?? 10_000),
  };
}

export function defaultDeribitProxyUrl() {
  const explicitProxy = process.env.DERIBIT_PROXY_URL;
  if (explicitProxy) {
    return explicitProxy;
  }

  for (const key of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"]) {
    if (process.env[key]) {
      return process.env[key];
    }
  }

  return process.env.DERIBIT_AUTO_PROXY === "0" ? null : DEFAULT_LOCAL_PROXY_URL;
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

  const agent = createDeribitProxyAgent(proxyUrl);
  return (url, options = {}) => nodeRequest(url, { ...options, agent, timeoutMs });
}

export function createDeribitProxyAgent(proxyUrl) {
  const protocol = new URL(proxyUrl).protocol;
  if (protocol === "http:" || protocol === "https:") {
    return new HttpsProxyAgent(proxyUrl);
  }
  if (protocol === "socks:" || protocol === "socks4:" || protocol === "socks4a:" || protocol === "socks5:" || protocol === "socks5h:") {
    return new SocksProxyAgent(proxyUrl);
  }
  throw new Error(`Unsupported DERIBIT_PROXY_URL protocol: ${protocol}`);
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
