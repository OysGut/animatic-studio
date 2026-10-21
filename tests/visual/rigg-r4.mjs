/** Rigg runde 4: PDF, arkramme, feltvalg og tiling.
 * ENV_FILE=.env [UI_LANG=en] node tests/visual/rigg-r3.mjs [baseUrl] [fixture.json] [utmappe]
 * Alle serverfunksjoner og Supabase mockes; ingen betalte tjenester brukes.
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(`${process.env.NODE_PATH ?? "/tmp/pw/node_modules"}/../package.json`)("playwright");
import { deflateSync } from "node:zlib";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { uiLang } from "./ui-lang.mjs";
import { readFileSync, mkdirSync } from "node:fs";
const [base = "http://127.0.0.1:8080", fixturePath = "/tmp/claude-0/visual-fixture.json", out = "/tmp/claude-0/rigg-r4"] = process.argv.slice(2);
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
const SERVER_PREFS = {}, COMMANDS = [], WRITES = [];
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
    if (path.startsWith("/rest/v1/rpc/")) return json(null);
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


browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/bin/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 }, colorScheme: "dark" });
await mock(ctx);
const page = await ctx.newPage();
page.setDefaultTimeout(12000);
const errors = [], downloads = [];
page.on("download", d => downloads.push(d.suggestedFilename()));
await page.addInitScript(() => { window.__inspectionPrintCalls = 0; window.print = () => { window.__inspectionPrintCalls++; }; });
page.on("pageerror", (e) => errors.push(String(e)));
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
await page.goto(base + P + "/rigg", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.locator('section[data-testid="rig-contour"]').first().waitFor({ state: "visible", timeout: 60000 });
await page.getByTestId("inspect-open-rig").waitFor({ state: "visible", timeout: 60000 });
// De faktiske åpneknappene heter inspect-open-rig og inspect-open-panel.
const dialog = page.getByTestId("inspect-window");
await step("åpner inspeksjon uten utskrift",async()=>{await page.getByTestId("inspect-open-rig").click();await dialog.waitFor();assert(downloads.length===0,"Uventet PDF");});
await step("ark og informasjonsfelt vises",async()=>{await dialog.getByTestId("print-preview").waitFor();assert(await dialog.getByTestId("print-fields").isVisible(),"Felter mangler");});
await step("teknisk referanse er av som standard",async()=>{assert(!await dialog.getByTestId("print-reference").isChecked(),"Mål inkludert som standard");});
await step("feltvalg endrer forhåndsvisningen",async()=>{await dialog.getByTestId("print-field-film").uncheck();assert(!(await dialog.getByTestId("print-preview").innerText()).includes(project.name),"Utelatt tittel finnes fortsatt");});
await step("kalibreringsmålestokk vises",async()=>{await dialog.getByTestId("print-calibration").check();assert((await dialog.getByTestId("print-preview").innerText()).includes("100"),"100 mm mangler");});
await step("retning og marger kan endres",async()=>{await dialog.getByTestId("print-orientation").selectOption("landscape");await dialog.getByTestId("print-margin-top").fill("12");assert(await dialog.getByTestId("print-margin-top").inputValue()==="12","Marg mangler");});
await step("egendefinert ark gir tiling og oversikt",async()=>{await dialog.getByTestId("print-calibration").uncheck();await dialog.getByTestId("print-paper").selectOption("custom");await dialog.getByTestId("print-custom-width").fill("80");await dialog.getByTestId("print-custom-height").fill("180");assert(await dialog.getByTestId("print-preview").locator("svg").count()>1,"Tiling mangler");});
await step("lav kilde-DPI varsles bare i bildemodus",async()=>{await dialog.getByTestId("inspect-dpi-warning").waitFor();await dialog.getByTestId("inspect-mode").selectOption("outline");assert(await dialog.getByTestId("inspect-dpi-warning").count()===0,"Vektor-DPI-varsel");});
await step("Lag PDF gir ekte PDF uten prosjektendringer",async()=>{await dialog.getByTestId("print-paper").selectOption("A4");const downloadPromise=page.waitForEvent("download");await dialog.getByTestId("print-create-pdf").click();const download=await downloadPromise;const path=await download.path();assert(path&&readFileSync(path).subarray(0,5).toString()==="%PDF-","Ugyldig PDF");assert(COMMANDS.length===0&&WRITES.length===0,"Prosjektdata endret");});
await page.screenshot({path:`${out}/pdf-${lang}.png`});
await step("feltvalget huskes ved gjenåpning",async()=>{await dialog.getByTestId("inspect-close").click();await page.getByTestId("inspect-open-rig").click();assert(!await dialog.getByTestId("print-field-film").isChecked(),"Valget glemt");});
await step("bildemodus laster ned kildebildet i PDF",async()=>{await dialog.getByTestId("inspect-mode").selectOption("line");const next=page.waitForEvent("download");await dialog.getByTestId("print-create-pdf").click();const download=await next;const path=await download.path();assert(path&&readFileSync(path).includes(Buffer.from("/Subtype /Image")),"Bilde mangler");});
await step("ingen nettleserfeil eller utskrift",async()=>{assert(errors.length===0,errors.join(" | "));assert(await page.evaluate(()=>window.__inspectionPrintCalls)===0,"Utskrift startet");assert(JSON.stringify(rows)===rowsBefore,"Rader endret");});
await ctx.close();
} catch(e) { check(false,e.stack??String(e)); }
finally { if(browser)await browser.close();console.log(`RESULTAT: ${pass} bestått, ${fail} feilet; rigg runde 4; språk=${uiLang("nb")}`);process.exitCode=fail?1:0; }
