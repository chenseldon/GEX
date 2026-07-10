import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const probePath = resolve(__dirname, "../../scripts/akshare_probe.py");
const pythonBin = process.env.PYTHON_BIN ?? "python";
const timeoutMs = parseTimeoutMs(process.env.AKSHARE_PROBE_TIMEOUT_MS);
const child = spawn(pythonBin, [probePath, ...process.argv.slice(2)], {
  stdio: "inherit",
  windowsHide: true,
});
let timedOut = false;

const timeout = setTimeout(() => {
  timedOut = true;
  console.error(`AKShare probe timed out after ${timeoutMs}ms`);
  child.kill();
}, timeoutMs);
timeout.unref();

child.on("error", (error) => {
  clearTimeout(timeout);
  console.error(`Failed to start AKShare probe: ${error.message}`);
  process.exitCode = 1;
});

child.on("close", (code, signal) => {
  clearTimeout(timeout);
  if (timedOut) {
    process.exitCode = 1;
    return;
  }
  if (typeof code === "number") {
    process.exitCode = code;
    return;
  }
  console.error(`AKShare probe exited from signal: ${signal}`);
  process.exitCode = 1;
});

function parseTimeoutMs(value) {
  const parsed = Number(value ?? 120000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120000;
}
