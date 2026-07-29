/**
 * Local dev: ensure FastAPI is reachable, then start Next.js.
 * Use `npm run dev:web` for frontend-only when the API is already running elsewhere.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const healthUrl = "http://127.0.0.1:8011/health";

async function apiHealthy() {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

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

function startBackend() {
  console.log("\n[dev] FastAPI not running on 8011 — starting backend…\n");
  const child = spawn(
    "node",
    [
      join(repoRoot, "scripts", "venv-exec.mjs"),
      "-m",
      "uvicorn",
      "main:app",
      "--app-dir",
      "backend",
      "--host",
      "127.0.0.1",
      "--reload",
      "--reload-dir",
      "backend",
      "--reload-delay",
      "2",
      "--port",
      "8011",
    ],
    { cwd: repoRoot, stdio: "inherit", env: process.env },
  );
  child.on("error", (err) => {
    console.error("[dev] Failed to start backend:", err.message);
    process.exit(1);
  });
  return child;
}

async function waitForApi(maxMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await apiHealthy()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

const backend = await apiHealthy() ? null : startBackend();
if (backend) {
  const ok = await waitForApi();
  if (!ok) {
    console.error("\n[dev] Timed out waiting for http://127.0.0.1:8011/health");
    console.error("      Try: npm run dev:all\n");
    backend.kill("SIGTERM");
    process.exit(1);
  }
}

const next = spawn("npx", ["next", "dev", "--webpack"], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

const shutdown = () => {
  next.kill("SIGTERM");
  if (backend) backend.kill("SIGTERM");
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

next.on("exit", (code) => {
  if (backend) backend.kill("SIGTERM");
  process.exit(code ?? 0);
});
