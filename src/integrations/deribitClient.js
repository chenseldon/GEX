const PROD_ENDPOINT = "https://www.deribit.com/api/v2";
const TESTNET_ENDPOINT = "https://test.deribit.com/api/v2";

export function createDeribitJsonRpcClient({
  endpoint = defaultDeribitEndpoint(),
  fetchImpl = globalThis.fetch,
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
