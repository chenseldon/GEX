import { execFile } from "node:child_process";
import { cwd } from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
const taskName = args.name ?? "GEX Deribit Daily Snapshot";
const time = args.time ?? "07:00";
const symbols = args.symbols ?? "BTC,ETH";
const workingDirectory = args.cwd ?? cwd();
const dryRun = args["dry-run"] === "true";
const quotedWorkingDirectory = workingDirectory.replaceAll('"', '""');

const command = `cd /d ""${quotedWorkingDirectory}"" && npm.cmd run collect:deribit -- --symbols=${symbols} --once`;
const schtasksArgs = [
  "/Create",
  "/F",
  "/TN",
  taskName,
  "/SC",
  "DAILY",
  "/ST",
  time,
  "/TR",
  `cmd.exe /c "${command}"`,
];

if (process.platform !== "win32") {
  console.error("Daily scheduler creation currently supports Windows schtasks only.");
  process.exitCode = 1;
} else if (dryRun) {
  console.log(`schtasks ${schtasksArgs.map(quoteArg).join(" ")}`);
} else {
  const { stdout, stderr } = await execFileAsync("schtasks", schtasksArgs, { windowsHide: true });
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
  console.log(`Scheduled '${taskName}' at ${time} local time for symbols ${symbols}.`);
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) {
      parsed[match[1]] = match[2];
    }
  }
  return parsed;
}

function quoteArg(value) {
  return /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}
