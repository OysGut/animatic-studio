/** Rigg runde 5: utskriftsjobb med 20 kopier, QR-kode, oppslag via /k/$code og manuell kode.
 * ENV_FILE=.env [UI_LANG=en] node tests/visual/rigg-r5.mjs [baseUrl] [fixture.json] [utmappe]
 * Alle serverfunksjoner og Supabase mockes; ingen betalte tjenester brukes.
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(`${process.env.NODE_PATH ?? "/tmp/pw/node_modules"}/../package.json`)("playwright");
import { deflateSync } from "node:zlib";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { uiLang } from "./ui-lang.mjs";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const [base = "http://localhost:8080", fixturePath = "/tmp/claude-0/visual-fixture.json", out = "/tmp/claude-0/rigg-r5"] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (ok, description) => {
  console.log(`${ok ? " ok" : " FEIL"} ${description}`);
  ok ? pass++ : fail++;
};
let browser;
try {
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE ?? ".env", "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const USER = { id: "00000000-0000-7000-8000-a11ce0000001", email: "mars@example.no", aud: "authenticated", role: "authenticated" };
const project = fx.project, P = `/prosjekt/${project.id}`, lang = uiLang("nb");
mkdirSync(out, { recursive: true });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const spec = {
 format: "1",
 camera: { sensorWidthMm: 36, sensorHeightMm: 24, focalLengthMm: 50, cameraHeightMm: 900, mode: "fixed" },
 plates: [
  { id: id(1), name: "Bord", heightMm: 0, glassThicknessMm: null },
  { id: id(2), name: "Plate 1", heightMm: 100, glassThicknessMm: 4 },
  { id: id(3), name: "Plate 2", heightMm: 200, glassThicknessMm: 4 },
 ],
 calibration: { cameraHeightMm: 900, focalLengthMm: 50, sensorWidthMm: 36, sensorHeightMm: 24, referencePlateId: id(1), pxPerMm: 3, calibratedAt: "2026-10-01T10:00:00Z", valid: true },
};
const layer = fx.rows.composition_layers.find((l) => l.asset_id && !l.removed);
if (!layer) throw new Error("Fixture mangler bakgrunnslag");
const comp0 = fx.rows.compositions.find((c) => c.id === layer.composition_id);
const occ0 = fx.rows.scene_occurrences.find((o) => o.variant_id === comp0?.variant_id && o.active !== false);
const variant0 = fx.rows.scene_variants.find((v) => v.id === comp0?.variant_id);
if (!occ0 || !variant0) throw new Error("Fixture mangler forekomst for laget");
const TARGET = { sceneId: variant0.scene_id, frame: 0 };
const JOB_ELEMENT = { id: "" };
const rows = { ...fx.rows,
 rig_templates: [{ id: id(10), project_id: project.id, revision: 1, name: "R1 mal", spec, removed: false }],
 rig_setups: [{ id: id(11), project_id: project.id, revision: 1, scene_id: null, template_id: id(10), name: "R1 rigg", spec, removed: false }],
 composition_layers: fx.rows.composition_layers.map((l) => l.id === layer.id ? { ...l, rig_plate_id: id(2), rig_plate_depth_mm: 0, parallax: 2 } : l),
};
// Lite, ugjennomsiktig PNG: lys bakgrunn og mørk figur gir ekte lokalt forslag.
function chunk(type, data) {
 const bytes = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
 for (const byte of bytes) { crc ^= byte; for (let i=0;i<8;i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
 const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
 length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
 return Buffer.concat([length, bytes, checksum]);
}
const header = Buffer.alloc(13); header.writeUInt32BE(32, 0); header.writeUInt32BE(32, 4); header[8]=8; header[9]=6;
const pixels = Buffer.alloc(32 * (1 + 32*4));
for (let y=0;y<32;y++) for (let x=0;x<32;x++) {
 const offset = y*129+1+x*4, v = x>7 && x<24 && y>7 && y<24 ? 30 : 240;
 pixels.set([v,v,v,255], offset);
}
const testImage = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR",header), chunk("IDAT",deflateSync(pixels)), chunk("IEND",Buffer.alloc(0))]);
const SERVER_PREFS = {}, COMMANDS = [], WRITES = [], RPCS = [], COPIES = [];
const rowsBefore = JSON.stringify(rows);
function serverFnName(url) {
  try {
    const b64 = new URL(url).pathname.split("/_serverFn/")[1];
    return JSON.parse(Buffer.from(decodeURIComponent(b64), "base64url").toString("utf8")).export;
  } catch {
    return "?";
  }
}
async function mock(ctx) {
  await ctx.route(`${supaUrl}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const json = (b, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
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
    if (path.startsWith("/storage/v1/object/sign/")) {
      return route.fulfill({ status: 200, contentType: "image/png", body: testImage });
    }
    const table = path.replace("/rest/v1/", "");
    if (path.startsWith("/rest/v1/") && !path.startsWith("/rest/v1/rpc/") && !["GET", "HEAD"].includes(req.method())) WRITES.push({table, method:req.method(), body:req.postData()});
    if (table === "rpc/my_account")
      return json({
        status: "active",
        is_admin: false,
        permanent_admin: false,
        locale: null,
        display_name: "Mars",
        privacy_version: 1,
        accepted_version: 1,
        created_at: "2026-10-01T10:00:00Z",
        ui_prefs: SERVER_PREFS,
      });
    if (table === "rpc/set_my_ui_prefs") {
      const body = JSON.parse(req.postData() ?? "{}");
      for (const [k, v] of Object.entries(body.p_prefs ?? {})) {
        if (v === null) delete SERVER_PREFS[k];
        else SERVER_PREFS[k] = v;
      }
      return json(null);
    }
    if (table === "schema_version") return json([{ version: VISUAL_SCHEMA_VERSION }]);
    if (table === "projects") {
      if (single) return json(project);
      return json([{ ...project, project_members: [{ role: "owner", user_id: USER.id }] }]);
    }
    if (table === "project_members")
      return json([{ user_id: USER.id, role: "owner", joined_at: "2026-10-08T10:00:00Z" }]);
    if (table === "profiles") return json([{ user_id: USER.id, display_name: "Mars" }]);
    if (table === "rpc/issue_print_copies") { const b = JSON.parse(req.postData() ?? "{}"); RPCS.push({ name: "issue", body: b }); const before = COPIES.length; const save = COMMANDS.filter((c) => c.includes("SavePrintJob")).at(-1) ?? ""; JOB_ELEMENT.id = (() => { const i = save.indexOf('"k":["layerId"'); if (i < 0) return ""; const keys = JSON.parse(save.slice(i + 4, save.indexOf("]", i) + 1)); const vals = [...save.slice(i).matchAll(/\{"t":(\d+)(?:,"s":"([^"]*)")?/g)].slice(0, keys.length).map((m) => m[2]); return vals[keys.indexOf("id")] ?? ""; })(); if (!JOB_ELEMENT.id) return json({ message: "job missing" }, 400); if (!COPIES.length) for (let i = 0; i < 20; i++) COPIES.push({ copy_id: id(500 + i), element_id: JOB_ELEMENT.id, copy_number: i + 1, key: `k${String(i).padStart(2, "0")}${"A".repeat(40)}`, short_code: `ABCD${String(i).padStart(2, "0")}EF`.replace(/[^0-9A-Z]/g, "0").slice(0, 8) }); return json(COPIES.length - before); }
    if (table === "rpc/print_copy_codes") return json(COPIES);
    if (table === "rpc/lookup_print_copy") {
      const b = JSON.parse(req.postData() ?? "{}"); RPCS.push({ name: "lookup", body: b });
      const hit = COPIES.find((c) => c.key === b.p_code || c.short_code === b.p_code);
      return json(hit ? [{ project_id: project.id, scene_id: TARGET.sceneId, frame: TARGET.frame, layer_id: layer.id, copy_number: hit.copy_number }] : []);
    }
    if (path.startsWith("/rest/v1/rpc/")) return json(null);
    // Filtrerte enkeltoppslag (id=eq.x, variant_id=eq.x) for oppslaget fra kopikoden
    const eqs = [...url.searchParams.entries()].filter(([k, v]) => !["select", "limit", "offset", "order"].includes(k) && v.startsWith("eq."));
    if (rows[table] && eqs.length) {
      const hits = rows[table].filter((r) => eqs.every(([k, v]) => String(r[k]) === v.slice(3)));
      return single ? json(hits[0] ?? null) : json(hits);
    }
    if (path.startsWith("/realtime/")) return route.abort();
    if (rows[table] && single) return json(rows[table][0] ?? null);
    if (rows[table]) {
      const off = Number(url.searchParams.get("offset") ?? 0);
      return json(off > 0 ? [] : rows[table]);
    }
    return json([]);
  });
  await ctx.route("**/_serverFn/**", (route) => {
    const name = serverFnName(route.request().url());
    const json = (result) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result, context: {} }),
      });
    if (/runCommand/.test(name)) {
      COMMANDS.push(route.request().postData() ?? "");
      return json({ ok: true, changeId: "x", affected: [], inverse: null, revisions: {} });
    }
    if (/projectAiProviders/.test(name)) return json({ providers: [], missing: false });
    if (/pumpProjectQueue/.test(name)) return json({ sent: 0 });
    return route.abort();
  });
}


browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/bin/chromium" }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 }, colorScheme: "dark", acceptDownloads: true });
await mock(ctx);
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text()); });
await page.addInitScript(([key, user, language]) => {
 if (sessionStorage.getItem("rigg-init")) return;
 localStorage.setItem(key, JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now()/1000)+86400, user }));
 localStorage.setItem("animatic:lang", language);
 sessionStorage.setItem("rigg-init", "1");
}, [`sb-${ref}-auth-token`, USER, lang]);
async function step(description, action) {
 try { await action(); check(true, description); }
 catch (e) { check(false, `${description}: ${e.message}`); }
}
const assert = (value, message) => { if (!value) throw new Error(message); };
const nb = lang === "nb";
await page.goto(base + P + "/rigg", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.getByTestId("inspect-open-rig").waitFor({ state: "visible", timeout: 60000 });
const dialog = page.getByTestId("inspect-window");
await page.getByTestId("inspect-open-rig").click();
await dialog.waitFor();
const job = dialog.getByTestId("print-job");
await step("utskriftsjobben vises i inspeksjonsvinduet", async () => { await job.waitFor(); });
await step("«denne framen × 20» gir ett element og 20 kopier i summen", async () => {
  await dialog.getByTestId("inspect-mode").selectOption("outline");
  // Stort egendefinert ark: hver figur får plass uten tiling, så antall figurer kan telles direkte.
  await dialog.getByTestId("print-paper").selectOption("custom");
  await dialog.getByTestId("print-custom-width").fill("1000");
  await dialog.getByTestId("print-custom-height").fill("1400");
  await job.getByTestId("print-job-n").fill("20");
  await job.getByTestId("print-job-add-frame").click();
  await job.getByTestId("print-job-elements").waitFor();
  assert((await job.getByTestId("print-job-elements").locator("li").count()) === 1, "ett element");
  const totals = await job.getByTestId("print-job-totals").innerText();
  assert(new RegExp(nb ? "1 elementer · 20 kopier" : "1 items · 20 copies").test(totals), totals);
});
await step("forhåndsvisningen viser de første arkene med figurer og QR-felt", async () => {
  await job.getByTestId("print-job-preview").waitFor();
  assert((await job.getByTestId("print-job-preview-figure").count()) > 0, "ingen figurer");
  assert((await job.getByTestId("print-job-preview").locator("svg").count()) <= 3, "bare de første arkene");
});
await step("QR på figuren varsler om synlighet i opptak", async () => {
  await job.getByTestId("print-job-qr").selectOption("figure");
  await job.getByTestId("print-job-qr-visible").waitFor();
  await job.getByTestId("print-job-qr").selectOption("outside");
});
await step("tosidig: testark kan lastes ned og forskyvning lagres per skriver", async () => {
  await job.getByTestId("print-job-duplex").check();
  await job.getByTestId("print-job-printer").fill("Kontor");
  await job.getByTestId("print-job-offset-x").fill("1.5");
  const dl = page.waitForEvent("download");
  await job.getByTestId("print-job-test-sheet").click();
  const d = await dl; const p = await d.path();
  assert(p && readFileSync(p).subarray(0, 5).toString() === "%PDF-", "testark er ikke PDF");
  for (let i = 0; i < 30 && !SERVER_PREFS.rigDuplexOffsets; i++) await page.waitForTimeout(200);
  assert(SERVER_PREFS.rigDuplexOffsets?.Kontor?.x === 1.5, `forskyvning ikke lagret: ${JSON.stringify(SERVER_PREFS.rigDuplexOffsets)}`);
  await job.getByTestId("print-job-duplex").uncheck();
});
let pdfText = "";
await step("«Lag PDF» lagrer jobben som én kommando og gir én PDF med 20 figurer og QR", async () => {
  await job.screenshot({ path: `${out}/before-create-${lang}.png` });
  const dl = page.waitForEvent("download", { timeout: 30000 });
  await job.getByTestId("print-job-create").click({ timeout: 5000 }).catch(async (e) => { dl.catch(() => {}); throw new Error(`${e.message.split("\n")[0]} | ${await job.getByTestId("print-job-create").evaluate((b) => b.getAttributeNames().join(","))}`); });
  const d = await dl.catch(async (e) => { throw new Error(`${e.message.split("\n")[0]} | ${await job.getByTestId("print-job-message").innerText().catch(() => "")} | el=${JOB_ELEMENT.id} | ${COMMANDS.at(-1)?.slice(0, 300)}`); }); const p = await d.path();
  pdfText = readFileSync(p).toString("latin1");
  assert(pdfText.startsWith("%PDF-"), "ikke PDF");
  const save = COMMANDS.filter((c) => c.includes("SavePrintJob"));
  assert(save.length === 1, `SavePrintJob ${save.length}`);
  const frames = (pdfText.match(/\((?:Frame|Image|Fotograma|Bild|Quadro|Fotogramma) 0 /g) ?? []).length;
  assert(frames === 20, `figurer i PDF: ${frames}`);
  assert(pdfText.includes("ABCD-00EF") || pdfText.includes("(ABCD-"), "kort kode mangler under QR");
  assert(RPCS.filter((r) => r.name === "issue").length >= 1, "kopiene ble ikke laget");
  assert(!pdfText.includes(COPIES[0].key), "nøkkelen står i klartekst i PDF-en (skal bare være i QR)");
});
await step("jobben kan skrives ut på nytt med samme koder", async () => {
  assert((await job.getByTestId("print-job-create").innerText()).length > 0, "knapp");
  const keys = JSON.stringify(COPIES.map((c) => c.key));
  const dl = page.waitForEvent("download", { timeout: 30000 });
  await job.getByTestId("print-job-create").click();
  await dl;
  assert(JSON.stringify(COPIES.map((c) => c.key)) === keys && COPIES.length === 20, "kodene endret seg");
});
await page.screenshot({ path: `${out}/job-${lang}.png` });
await step("QR-lenken /k/<nøkkel> åpner riktig scene, frame og lag", async () => {
  await page.goto(`${base}/k/${COPIES[3].key}`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/scene\?/, { timeout: 30000 });
  const u = new URL(page.url());
  assert(u.pathname === `${P}/scene` && u.searchParams.get("scene") === occ0.id && u.searchParams.get("lag") === layer.id && u.searchParams.get("at") === "0", u.toString());
});
await step("ukjent kode gir nøytral feilside uten prosjektdata", async () => {
  await page.goto(`${base}/k/${"x".repeat(43)}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("copy-route-failed").waitFor({ timeout: 30000 });
  const text = await page.locator("main").innerText();
  assert(!text.includes(project.name), "prosjektnavn vises");
});
await step("manuell kode (små bokstaver, bindestrek, O for 0) fra telefonsiden", async () => {
  const typed = `${COPIES[5].short_code.slice(0, 4).toLowerCase()}-${COPIES[5].short_code.slice(4)}`.replace(/0/g, "o");
  await page.getByTestId("copy-code-input").fill(typed);
  await page.getByTestId("copy-code-go").click();
  await page.waitForURL(/\/scene\?/, { timeout: 30000 });
  const sent = RPCS.filter((r) => r.name === "lookup").at(-1)?.body?.p_code;
  assert(sent === COPIES[5].short_code, `normalisert kode: ${sent}`);
});
await step("manuell kode fra prosjektsiden", async () => {
  await page.goto(base + P, { waitUntil: "domcontentloaded" });
  await page.getByTestId("copy-code-input").waitFor({ timeout: 60000 });
  await page.getByTestId("copy-code-input").fill(COPIES[7].short_code);
  await page.getByTestId("copy-code-go").click();
  await page.waitForURL(/\/scene\?/, { timeout: 30000 });
});
await step("ingen nettleserfeil", async () => { assert(errors.length === 0, errors.join(" | ")); });
await ctx.close();
} catch(e) { check(false,e.stack??String(e)); }
finally { if(browser)await browser.close();console.log(`RESULTAT: ${pass} bestått, ${fail} feilet; rigg runde 5; språk=${uiLang("nb")}`);process.exitCode=fail?1:0; }
