import { collectDeribitSnapshot, defaultDeribitSymbols } from "../data/deribitCollector.js";

const args = parseArgs(process.argv.slice(2));
const symbols = args.symbols ?? defaultDeribitSymbols();
const intervalMs = Number(args.interval ?? 0);

async function runOnce() {
  const results = await collectDeribitSnapshot({ symbols });
  for (const result of results) {
    console.log(
      `${result.symbol} ${result.observedAt} instruments=${result.instruments} tickers=${result.tickers} warnings=${result.warnings.length}`,
    );
  }
}

if (args.once || intervalMs <= 0) {
  await runOnce().catch(handleFatalError);
} else {
  await runOnce().catch(handleFatalError);
  setInterval(() => {
    runOnce().catch(handleFatalError);
  }, intervalMs);
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === "--once") {
      parsed.once = true;
      continue;
    }
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (!match) continue;
    const [, key, value] = match;
    parsed[key] = key === "symbols"
      ? value.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
      : value;
  }
  return parsed;
}

function handleFatalError(error) {
  const cause = error?.cause?.message ? `: ${error.cause.message}` : "";
  console.error(`Deribit collection failed: ${error.message}${cause}`);
  process.exitCode = 1;
}
