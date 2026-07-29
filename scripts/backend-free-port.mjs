/**
 * Frees 8001/8011 (Next proxy / FastAPI) and pauses so Windows can release the sockets.
 * Helps avoid EADDRINUSE (WinError 10048) when starting dev:all.
 * Skips kill when FastAPI is already healthy — avoids tearing down a running dev stack.
 */
import { execSync } from "node:child_process";

const healthUrl = "http://127.0.0.1:8011/health";

async function apiHealthy() {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function kill() {
  try {
    execSync("npx --yes kill-port 8001 8011", { stdio: "inherit" });
  } catch {
    /* kill-port exits 1 if nothing to kill */
  }
}

async function main() {
  if (await apiHealthy()) {
    console.log("FastAPI healthy on 8011 — skipping port cleanup");
    return;
  }
  kill();
  await new Promise((r) => setTimeout(r, 800));
  kill();
  // Extra delay so TIME_WAIT / socket handles on Windows are released
  await new Promise((r) => setTimeout(r, 2500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
