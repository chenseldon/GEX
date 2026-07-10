import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildTradFiSnapshotFromAkshareReport } from "../data/akshareCollector.js";
import { createDuckDbRepository } from "../data/duckdbRepository.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const collectorPath = resolve(__dirname, "../../scripts/akshare_collect.py");
const pythonBin = process.env.PYTHON_BIN ?? "python";
const forwardedArgs = withCompactJson(process.argv.slice(2));
const timeoutMs = parseTimeoutMs(
  process.env.AKSHARE_COLLECT_TIMEOUT_MS,
  defaultTimeoutMs(forwardedArgs),
);

const repoPromise = createDuckDbRepository();
let insertQueue = Promise.resolve();
let stdoutBuffer = "";
let timedOut = false;
let forwardedSignal = null;
let reportCount = 0;

const child = spawn(pythonBin, [collectorPath, ...forwardedArgs], {
  stdio: ["ignore", "pipe", "inherit"],
  windowsHide: true,
});

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk;
  const lines = stdoutBuffer.split(/\r?\n/);
  stdoutBuffer = lines.pop() ?? "";
  for (const line of lines) {
    handleReportLine(line);
  }
});

const timeout = timeoutMs
  ? setTimeout(() => {
      timedOut = true;
      console.error(`AKShare collector timed out after ${timeoutMs}ms`);
      child.kill();
    }, timeoutMs)
  : null;
timeout?.unref();

child.on("error", (error) => {
  clearCollectorTimeout(timeout);
  console.error(`Failed to start AKShare collector: ${error.message}`);
  process.exitCode = 1;
});

child.on("close", async (code, signal) => {
  clearCollectorTimeout(timeout);
  removeSignalHandlers();
  if (stdoutBuffer.trim()) {
    handleReportLine(stdoutBuffer);
    stdoutBuffer = "";
  }
  try {
    await insertQueue;
    const repo = await repoPromise;
    repo.close();
  } catch (error) {
    console.error(`Failed to persist AKShare snapshot: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  if (timedOut) {
    process.exitCode = 1;
    return;
  }
  if (forwardedSignal) {
    process.exitCode = signalExitCode(forwardedSignal);
    return;
  }
  if (typeof code === "number") {
    process.exitCode = code;
    return;
  }
  console.error(`AKShare collector exited from signal: ${signal}`);
  process.exitCode = 1;
});

process.on("exit", () => {
  if (!child.killed) {
    child.kill();
  }
});

function handleReportLine(line) {
  const text = String(line ?? "").trim();
  if (!text) return;
  process.stdout.write(`${text}\n`);
  let report;
  try {
    report = JSON.parse(text);
  } catch (error) {
    console.error(`Ignoring non-JSON AKShare output: ${error.message}`);
    return;
  }
  reportCount += 1;
  const reportNumber = reportCount;
  insertQueue = insertQueue.then(async () => {
    const repo = await repoPromise;
    await repo.insertTradFiSnapshot(buildTradFiSnapshotFromAkshareReport(report));
    console.error(`Persisted AKShare report ${reportNumber} to DuckDB`);
  });
}

function withCompactJson(args) {
  return args.includes("--json") ? args : [...args, "--json"];
}

function parseTimeoutMs(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultTimeoutMs(args) {
  const intervalMs = parseIntervalMs(args);
  if (intervalMs > 0) {
    return null;
  }
  return 300000;
}

function parseIntervalMs(args) {
  const prefix = "--interval=";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith(prefix)) {
      return positiveNumber(arg.slice(prefix.length));
    }
    if (arg === "--interval" && index + 1 < args.length) {
      return positiveNumber(args[index + 1]);
    }
  }
  return 0;
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function clearCollectorTimeout(timeout) {
  if (timeout) {
    clearTimeout(timeout);
  }
}

const signalHandlers = new Map(
  ["SIGINT", "SIGTERM", "SIGHUP"].map((signal) => [
    signal,
    () => forwardShutdown(signal),
  ]),
);

for (const [signal, handler] of signalHandlers) {
  process.on(signal, handler);
}

function forwardShutdown(signal) {
  if (!forwardedSignal) {
    forwardedSignal = signal;
    child.kill(signal);
  }
}

function removeSignalHandlers() {
  for (const [signal, handler] of signalHandlers) {
    process.off(signal, handler);
  }
}

function signalExitCode(signal) {
  if (signal === "SIGINT") {
    return 130;
  }
  if (signal === "SIGTERM") {
    return 143;
  }
  if (signal === "SIGHUP") {
    return 129;
  }
  return 1;
}
