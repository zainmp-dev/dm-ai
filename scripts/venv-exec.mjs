/**
 * Run a command with the repo's .venv Python (Windows + Unix).
 * Usage: node scripts/venv-exec.mjs -m uvicorn ...
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function venvPython() {
  const candidates =
    process.platform === "win32"
      ? [join(repoRoot, ".venv", "Scripts", "python.exe")]
      : [join(repoRoot, ".venv", "bin", "python")];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return process.platform === "win32" ? "python" : "python3";
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("venv-exec: missing command arguments");
  process.exit(1);
}

const child = spawn(venvPython(), args, {
  cwd: repoRoot,
  stdio: "inherit",
  shell: false,
});

child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
