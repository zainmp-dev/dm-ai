/**
 * Frees 8001/8011 (Next proxy / FastAPI) and pauses so Windows can release the sockets.
 * Helps avoid EADDRINUSE (WinError 10048) when starting dev:all.
 */
import { execSync } from "node:child_process";

function kill() {
  try {
    execSync("npx --yes kill-port 8001 8011", { stdio: "inherit" });
  } catch {
    /* kill-port exits 1 if nothing to kill */
  }
}

async function main() {
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
