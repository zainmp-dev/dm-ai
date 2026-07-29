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

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code ?? signal ?? "unknown"}`));
    });
  });
}

const healthy = await apiHealthy();

if (healthy) {
  console.log("\n[dev:all] FastAPI already running on 8011 — starting Next.js only.\n");
  await run("npm", ["run", "dev:web"]);
} else {
  await run("npm", ["run", "backend:free-port"]);
  await run("npx", [
    "concurrently",
    "-k",
    "-n",
    "api,web",
    "-c",
    "magenta,cyan",
    "npm run backend:dev",
    "npx --yes wait-on -t 120000 -i 200 http-get://127.0.0.1:8011/health && npm run dev:web",
  ]);
}
