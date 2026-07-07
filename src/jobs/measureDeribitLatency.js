import { measureDeribitLatency } from "../data/deribitLive.js";

const args = parseArgs(process.argv.slice(2));
if (args.proxy) {
  process.env.DERIBIT_PROXY_URL = args.proxy;
}
if (args.endpoint) {
  process.env.DERIBIT_ENDPOINT = args.endpoint;
}
const symbols = (args.symbols ?? args.symbol ?? "BTC,ETH")
  .split(",")
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);
const samples = Number(args.samples ?? 5);

for (const symbol of symbols) {
  try {
    const report = await measureDeribitLatency({ symbol, samples });
    console.log(
      `${symbol} book_summary samples=${samples} min=${report.minMs}ms p50=${report.p50Ms}ms max=${report.maxMs}ms contracts=${report.samples.at(-1)?.contracts ?? 0}`,
    );
  } catch (error) {
    process.exitCode = 1;
    console.error(`${symbol} book_summary failed: ${error.message}`);
  }
}

function parseArgs(argv) {
  return Object.fromEntries(
    argv
      .filter((arg) => arg.startsWith("--"))
      .map((arg) => {
        const [key, value = "true"] = arg.slice(2).split("=");
        return [key, value];
      }),
  );
}
