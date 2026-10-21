/**
 * Ende-til-ende-eksport av animatic via brukerflaten (REQ-0004, DEC-0072): åpner monteringen med mockede
 * Supabase-svar, eksporterer filmen med «Eksporter animatic» og kontrollerer at nedlastingen er en videofil
 * med innhold. All trafikk til andre verter enn dev-serveren og Supabase-mocken stoppes, så eksporten
 * beviselig virker uten noen AI-leverandør. Kall til appens egne serverfunksjoner logges.
 *
 * Krever kjørende dev-server og Playwright med Chromium (som tests/visual/screens.mjs):
 *   ENV_FILE=…/.env MEDIABUNNY=…/node_modules/mediabunny/dist/modules/src/index.js \
 *     node export-e2e.mjs <baseUrl> <fixture.json> [film|scene]
 * Avslutter med kode 1 hvis eksporten ikke gir en videofil > 0 byte.
 */
import { chromium } from "playwright";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { readFileSync, statSync } from "node:fs";

const [
  base = "http://127.0.0.1:5173",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  scope = "film",
] = process.argv.slice(2);
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE ?? new URL("../../.env", import.meta.url), "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const USER = {
  id: "00000000-0000-7000-8000-a11ce0000001",
  email: "mars@example.no",
  aud: "authenticated",
  role: "authenticated",
};
const project = fx.project;

/** Enkel WAV (mono, 8 kHz) med en tone, så lydsporet i videoen får innhold. */
function wav(seconds) {
  const rate = 8000;
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 0.5 * 32767),
      44 + i * 2,
    );
  return buf;
}

const browser = await chromium
  .launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" })
  .catch(() => chromium.launch());
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: "dark",
  acceptDownloads: true,
});
const page = await ctx.newPage();
const errors = [];
const blocked = [];
const serverFns = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const supaHost = new URL(supaUrl).host;
const appHost = new URL(base).host;
await ctx.route("**/*", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  if (url.protocol === "data:" || url.protocol === "blob:") return route.continue();
  if (url.host === appHost) {
    if (url.pathname.includes("_serverFn")) serverFns.push(`${req.method()} ${url.pathname}`);
    return route.continue();
  }
  if (url.host !== supaHost) {
    // Ingen andre verter: ingen AI-leverandør, ingen skrifter eller sporing utenfra
    blocked.push(url.host);
    return route.abort();
  }
  const path = url.pathname;
  const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
  const cors = { "access-control-allow-origin": "*" };
  const json = (body, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: cors,
      body: JSON.stringify(body),
    });
  if (path.startsWith("/auth/v1/user")) return json(USER);
  if (path.startsWith("/auth/v1/")) return json({});
  if (path.startsWith("/storage/v1/object/sign/") && req.method() === "POST") {
    const body = JSON.parse(req.postData() ?? "{}");
    const bucket = path.split("/").pop();
    return json(
      (body.paths ?? []).map((p) => ({
        path: p,
        signedURL: `/object/sign/${bucket}/${p}?token=t`,
        error: null,
      })),
    );
  }
  if (path.startsWith("/storage/v1/object/sign/") && path.endsWith(".wav"))
    return route.fulfill({ status: 200, contentType: "audio/wav", headers: cors, body: wav(4) });
  if (path.startsWith("/storage/v1/object/sign/")) {
    const n = (path.length * 37) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="hsl(${n} 25% 22%)"/><circle cx="150" cy="120" r="60" fill="hsl(${n} 45% 70%)"/></svg>`;
    return route.fulfill({ status: 200, contentType: "image/svg+xml", headers: cors, body: svg });
  }
  const table = path.replace("/rest/v1/", "");
  if (table === "schema_version") return json([{ version: VISUAL_SCHEMA_VERSION }]);
  if (table === "projects") {
    if (single) return json(project);
    return json([{ ...project, project_members: [{ role: "owner", user_id: USER.id }] }]);
  }
  if (table === "project_members")
    return json([{ user_id: USER.id, role: "owner", joined_at: "2026-10-08T10:00:00Z" }]);
  if (table === "profiles") return json([{ user_id: USER.id, display_name: "Mars" }]);
  if (path.startsWith("/rest/v1/rpc/")) return json(null);
  if (path.startsWith("/realtime/")) return route.abort();
  if (fx.rows[table] && single) return json(fx.rows[table][0] ?? null);
  if (fx.rows[table]) {
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return json(offset > 0 ? [] : fx.rows[table]);
  }
  return json([]);
});

// Lagringsvinduet (showSaveFilePicker) avbrytes i hodeløs Chromium: bruk vanlig nedlasting
await page.addInitScript(() => {
  delete window.showSaveFilePicker;
  // B-111: standardspråket er engelsk; suiten bruker norske navn på knappene.
  try { localStorage.setItem("animatic:lang", "nb"); } catch { /* about:blank */ }
});
const exp = Math.floor(Date.now() / 1000) + 86400;
await page.addInitScript(
  ([k, v]) => localStorage.setItem(k, v),
  [
    `sb-${ref}-auth-token`,
    JSON.stringify({
      access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig",
      refresh_token: "r",
      token_type: "bearer",
      expires_in: 86400,
      expires_at: exp,
      user: USER,
    }),
  ],
);

let ok = false;
try {
  await page.goto(`${base}/prosjekt/${project.id}/montering`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  if (scope === "scene")
    await page.getByRole("group", { name: "Scener i filmen" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "Eksporter animatic" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("radio", { name: scope === "scene" ? /^Valgt scene/ : /^Hele filmen/ })
    .check();
  await dialog.getByRole("radio", { name: /^Halv størrelse/ }).check();
  const checks = await dialog
    .getByRole("region", { name: "Kontroll før eksport" })
    .or(dialog.locator('section[aria-label="Kontroll før eksport"]'))
    .innerText()
    .catch(() => "");
  const t0 = Date.now();
  const dl = page.waitForEvent("download", { timeout: 600000 }).catch(() => null);
  await dialog
    .getByRole("button", { name: /Eksporter/ })
    .last()
    .click();
  await page.getByText(/^Ferdig:/).waitFor({ timeout: 600000 });
  const d = await dl;
  console.log("omfang:", scope, "| tid:", Date.now() - t0, "ms");
  // Filnavnet slik dialogen viser det (Playwright kan gi «download» for blob-lenker når ruting er på)
  console.log("dialog:", (await page.getByText(/^Ferdig:/).innerText()).replace(/\s+/g, " "));
  console.log("kontroll før eksport:", checks.replace(/\s+/g, " ").slice(0, 300));
  if (!d) throw new Error("Ingen nedlasting");
  const p = await d.path();
  const size = statSync(p).size;
  console.log("nedlasting:", d.suggestedFilename(), size, "byte");
  if (process.env.MEDIABUNNY) {
    const mod = await import(process.env.MEDIABUNNY);
    const mb = mod.BufferSource ? mod : mod.default;
    const input = new mb.Input({
      source: new mb.BufferSource(readFileSync(p)),
      formats: mb.ALL_FORMATS,
    });
    const track = await input.getPrimaryVideoTrack();
    const stats = await track.computePacketStats();
    const at = await input.getPrimaryAudioTrack();
    console.log("video:", {
      width: track.displayWidth,
      height: track.displayHeight,
      duration: Number((await input.computeDuration()).toFixed(3)),
      frames: stats.packetCount,
      codec: track.codec,
      audio: at ? at.codec : "ingen",
    });
  }
  ok = size > 0;
} catch (e) {
  console.error("FEIL:", e);
  await page.screenshot({ path: "/tmp/claude-0/export-e2e-feil.png" }).catch(() => undefined);
}
console.log("serverfunksjoner kalt:", serverFns.length ? serverFns : "ingen");
console.log("stoppet trafikk til:", [...new Set(blocked)]);
if (errors.length) console.log("konsollfeil:", errors.slice(0, 10));
await browser.close();
console.log(ok ? "RESULTAT: videofil > 0 byte" : "RESULTAT: feilet");
process.exit(ok ? 0 : 1);
