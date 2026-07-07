import { diagnoseDeribitConnectivity } from "../integrations/deribitDiagnostics.js";

const args = parseArgs(process.argv.slice(2));
if (args.proxy) {
  process.env.DERIBIT_PROXY_URL = args.proxy;
}
if (args.endpoint) {
  process.env.DERIBIT_ENDPOINT = args.endpoint;
}

const report = await diagnoseDeribitConnectivity({
  endpoint: args.endpoint ?? process.env.DERIBIT_ENDPOINT,
  symbol: args.symbol ?? "BTC",
  proxyUrl: args.proxy ?? process.env.DERIBIT_PROXY_URL ?? null,
});

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.summary === "ok" ? 0 : 1;

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (!match) continue;
    parsed[match[1]] = match[2];
  }
  return parsed;
}
