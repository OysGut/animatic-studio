#!/usr/bin/env node
/**
 * SSR-røyktest (24.10): bygger produksjonsbygget, starter serverbygget i
 * Worker-kjøretiden (wrangler dev) og henter sider uten innlogging.
 * Feiler ved status 500 eller «The page could not be shown».
 *
 *   npm run test:ssr            (bygger først)
 *   SSR_SKIP_BUILD=1 npm run test:ssr
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const PORT = Number(process.env.SSR_PORT ?? 8799);
const PATHS = ["/", "/nb", "/konto", "/koble", "/prosjekt/00000000-0000-7000-8000-000000000001", "/prosjekt/00000000-0000-7000-8000-000000000001/storyboard"];
const BAD_TEXT = ["The page could not be shown", "\"unhandled\":true"];
const findConfig = () => [".output/server/wrangler.json", "dist/server/wrangler.json"].find((p) => existsSync(p)) ?? ".output/server/wrangler.json";
let CONFIG = findConfig();

if (!process.env.SSR_SKIP_BUILD) {
  console.log("· vite build");
  const b = spawnSync("npx", ["vite", "build"], { stdio: "inherit" });
  if (b.status !== 0) { console.error("FEIL: vite build feilet"); process.exit(1); }
}
CONFIG = findConfig(); // the build may write to .output/ or dist/ depending on the preset
if (!existsSync(CONFIG)) { console.error(`FEIL: fant ikke ${CONFIG}`); process.exit(1); }

const log = [];
// Lokal wrangler hvis den finnes; ellers en midlertidig utenfor prosjektet (ingen pakkeendring).
const local = resolve("node_modules/.bin/wrangler");
const [cmd, pre, cwd] = existsSync(local) ? [local, [], process.cwd()] : ["npx", ["--yes", "wrangler@4"], tmpdir()];
const server = spawn(cmd, [...pre, "dev", "--config", resolve(CONFIG), "--port", String(PORT), "--ip", "127.0.0.1", "--log-level", "error"], {
  cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }, detached: true,
});
server.stdout.on("data", (d) => log.push(String(d)));
server.stderr.on("data", (d) => log.push(String(d)));
const stop = () => { try { process.kill(-server.pid, "SIGTERM"); } catch { /* allerede stoppet */ } };

const base = `http://127.0.0.1:${PORT}`;
let up = false;
for (let i = 0; i < 120 && !up; i++) {
  try { await fetch(base + "/", { redirect: "manual" }); up = true; } catch { await new Promise((r) => setTimeout(r, 1000)); }
}
if (!up) { stop(); console.error("FEIL: serveren startet ikke\n" + log.join("").slice(-4000)); process.exit(1); }

let failed = 0;
for (const p of PATHS) {
  const res = await fetch(base + p, { redirect: "manual" });
  const body = await res.text();
  const bad = res.status >= 500 || BAD_TEXT.some((s) => body.includes(s));
  console.log(`${bad ? " FEIL" : " ok"} ${p} → ${res.status}`);
  if (bad) failed++;
}
const errLines = log.join("").split("\n").filter((l) => /TypeError|ReferenceError|is not iterable|before initialization/.test(l));
if (errLines.length) { failed++; console.error(" FEIL i serverloggen:\n" + errLines.slice(0, 20).join("\n")); }
stop();
console.log(`RESULTAT: ${PATHS.length - Math.min(failed, PATHS.length)} bestått, ${failed} feilet`);
process.exit(failed ? 1 : 0);
