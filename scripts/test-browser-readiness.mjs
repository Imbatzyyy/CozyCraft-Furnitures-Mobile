// These browser suites intercept backend requests; they create no live users,
// orders, payments or notifications. Use the real app, not the QA mock entry.
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const port = "5199";
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, APP_URL: base, PLAYWRIGHT_MODULE: process.env.PLAYWRIGHT_MODULE || new URL("../node_modules/playwright/index.mjs", import.meta.url).href };
const run = script => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [`storefront/qa/${script}`], { cwd: root, stdio: "inherit", env });
  child.once("error", reject);
  child.once("exit", code => code === 0 ? resolve() : reject(new Error(`${script} failed (${code})`)));
});
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", port, "--strictPort"], { cwd: `${root}/storefront`, stdio: "inherit" });
let serverFailure;
server.once("error", error => { serverFailure = error; });
server.once("exit", code => { serverFailure = new Error(`Fixture server exited (${code})`); });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    await delay(200);
    if (serverFailure) throw serverFailure;
    try { ready = (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
  }
  if (!ready) throw new Error("Fixture server did not become ready");
  for (const script of ["full-onboarding-audit.mjs", "low-egress-audit.mjs", "overall-reliability-audit.mjs", "app-navigation-audit.mjs", "chat-conversation-audit.mjs"]) await run(script);
} finally { server.kill("SIGTERM"); }
