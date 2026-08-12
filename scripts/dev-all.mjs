/**
 * Start Next.js + FastAPI for local dev without killing a healthy API on 8011.
 * If FastAPI is already up, only starts Next.js (avoids SIGKILL races from kill-port).
 */
import { spawn } from "node:child_process";
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

function startBackend() {
  console.log("\n[dev:all] Starting FastAPI on 8011…\n");
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
    console.error("[dev:all] Failed to start backend:", err.message);
    process.exit(1);
  });
  return child;
}

function startNext() {
  const child = spawn("npx", ["next", "dev", "--webpack"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  child.on("error", (err) => {
    console.error("[dev:all] Failed to start Next.js:", err.message);
    process.exit(1);
  });
  return child;
}

async function waitForApi(maxMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await apiHealthy()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

function freePorts() {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [join(repoRoot, "scripts", "backend-free-port.mjs")], {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`backend-free-port exited with code ${code}`));
    });
  });
}

const healthy = await apiHealthy();

if (healthy) {
  console.log("\n[dev:all] FastAPI already running on 8011 — starting Next.js only.\n");
  const next = startNext();
  next.on("exit", (code) => process.exit(code ?? 0));
} else {
  await freePorts();
  const backend = startBackend();
  const ok = await waitForApi();
  if (!ok) {
    console.error("\n[dev:all] Timed out waiting for http://127.0.0.1:8011/health\n");
    backend.kill("SIGTERM");
    process.exit(1);
  }
  console.log("\n[dev:all] FastAPI ready — starting Next.js…\n");
  const next = startNext();

  const shutdown = () => {
    next.kill("SIGTERM");
    backend.kill("SIGTERM");
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  next.on("exit", (code) => {
    backend.kill("SIGTERM");
    process.exit(code ?? 0);
  });
}
