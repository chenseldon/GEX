import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const collectorPath = resolve(__dirname, "../../scripts/akshare_collect.py");
const pythonBin = process.env.PYTHON_BIN ?? "python";
const forwardedArgs = process.argv.slice(2);
const timeoutMs = parseTimeoutMs(
  process.env.AKSHARE_COLLECT_TIMEOUT_MS,
  defaultTimeoutMs(forwardedArgs),
);

const child = spawn(pythonBin, [collectorPath, ...forwardedArgs], {
  stdio: "inherit",
  windowsHide: true,
});
let timedOut = false;
let forwardedSignal = null;

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

child.on("close", (code, signal) => {
  clearCollectorTimeout(timeout);
  removeSignalHandlers();
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

process.on("exit", () => {
  if (!child.killed) {
    child.kill();
  }
});

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
