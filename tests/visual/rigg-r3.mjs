/** Rigg runde 3: inspeksjonsvindu og flyktige målinger.
 * ENV_FILE=.env [UI_LANG=en] node tests/visual/rigg-r3.mjs [baseUrl] [fixture.json] [utmappe]
 * Alle serverfunksjoner og Supabase mockes; ingen betalte tjenester brukes.
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(`${process.env.NODE_PATH ?? "/tmp/pw/node_modules"}/../package.json`)("playwright");
import { deflateSync } from "node:zlib";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { uiLang } from "./ui-lang.mjs";
import { readFileSync, mkdirSync } from "node:fs";
const [base = "http://127.0.0.1:8080", fixturePath = "/tmp/claude-0/visual-fixture.json", out = "/tmp/claude-0/rigg-r3"] = process.argv.slice(2);
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
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: "dark" });
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
const svg = dialog.locator("svg").first();
const values = dialog.getByTestId("inspect-marker-list").locator('button[aria-pressed]');
const number = text => Number(text.match(/-?\d+(?:[.,]\d+)?/)?.[0].replace(",", "."));
async function point(x, y) {
 const box = await svg.boundingBox();
 assert(box, "SVG mangler koordinater");
 await page.mouse.click(box.x + box.width*x, box.y + box.height*y, { modifiers: [] });
}
async function waitValue(index, predicate) {
 const until = Date.now()+5000;
 while(Date.now()<until) {
  const text = await values.nth(index).innerText();
  if(predicate(text)) return text;
  await page.waitForTimeout(50);
 }
 throw new Error("Måleverdi ble ikke oppdatert");
}
await step("åpner inspeksjon fra Rigg", async () => {
 await page.getByTestId("inspect-open-rig").click();
 await dialog.waitFor({state:"visible"});
});
for (const dimension of ["width", "height"]) await step(`${dimension} vises med positiv mm-verdi`, async () => {
 const label = dialog.getByTestId(`inspect-measure-${dimension}`);
 await label.waitFor({state:"visible"});
 assert(number(await label.innerText())>0 && (await label.innerText()).includes("mm"), "Ugyldig fysisk størrelse");
});
await step("avstand mellom to punkter gir positiv verdi", async () => {
 await dialog.getByTestId("inspect-tool-distance").click();
 await point(.2,.25); await point(.4,.25);
 await values.nth(0).waitFor({state:"visible"});
 assert(number(await values.nth(0).innerText())>0, "Avstand mangler");
});
await step("drag av endepunkt endrer avstanden", async () => {
 const before = number(await values.nth(0).innerText());
 const handle = svg.locator('g[role="button"] circle').nth(1);
 const box = await handle.boundingBox(); assert(box,"Endepunkt mangler");
 await page.mouse.move(box.x+box.width/2, box.y+box.height/2);
 await page.mouse.down();
 await page.mouse.move(box.x+box.width/2+65,box.y+box.height/2+25,{steps:10});
 await page.mouse.up();
 await waitValue(0,text=>Math.abs(number(text)-before)>.1);
});
await step("vinkel mellom to linjer gir 90 grader", async () => {
 await dialog.getByTestId("inspect-tool-angle").click();
 await point(.55,.2); await point(.75,.2);
 await point(.85,.4); await point(.85,.7);
 await values.nth(1).waitFor({state:"visible"});
 const text=await values.nth(1).innerText();
 assert(text.includes("°") && Math.abs(number(text)-90)<1,"Forventet rett vinkel: "+text);
});
await step("forhold mellom to avstander gir 2 og 200 prosent", async () => {
 await dialog.getByTestId("inspect-tool-ratio").click();
 await point(.15,.8); await point(.35,.8);
 await point(.5,.9); await point(.6,.9);
 await values.nth(2).waitFor({state:"visible"});
 const text=await values.nth(2).innerText();
 assert(Math.abs(number(text)-2)<.02 && text.includes("200.0%"),"Feil forhold: "+text);
});
await step("mm konverteres til tommer og tilbake uten å endre vinkel/forhold", async () => {
 const mm=number(await values.nth(0).innerText());
 const width=number(await dialog.getByTestId("inspect-measure-width").innerText());
 const angle=await values.nth(1).innerText(), ratio=await values.nth(2).innerText();
 await dialog.getByTestId("inspect-unit-toggle").click();
 const inches=await waitValue(0,text=>text.includes("″"));
 assert(Math.abs(number(inches)-mm/25.4)<.011,"Feil avstandskonvertering");
 assert(Math.abs(number(await dialog.getByTestId("inspect-measure-width").innerText())-width/25.4)<.011,"Feil breddekonvertering");
 assert(await values.nth(1).innerText()===angle && await values.nth(2).innerText()===ratio,"Enhetsløse mål endret");
 await dialog.getByTestId("inspect-unit-toggle").click();
 await waitValue(0,text=>text.includes("mm") && number(text)===mm);
});
await page.screenshot({path:`${out}/inspeksjon-${lang}.png`,fullPage:true});
await step("lukking uten eksplisitt lagring forkaster målingene", async () => {
 assert(!await dialog.getByTestId("inspect-save-set").isEnabled(),"Navnløst sett kan lagres");
 await dialog.getByTestId("inspect-close").click();
 await dialog.waitFor({state:"hidden"});
 await page.getByTestId("inspect-open-rig").click();
 await dialog.waitFor({state:"visible"});
 assert(await values.count()===0,"Målinger overlevde lukking");
 await dialog.getByTestId("inspect-discard").click();
 await dialog.waitFor({state:"hidden"});
});
await page.goto(base + P + "/scene", {waitUntil:"domcontentloaded"});
await step("åpner og lukker inspeksjon fra lagpanelet", async () => {
 const badge=page.getByTestId(`rig-parallax-override-${layer.id}`);
 await badge.waitFor({state:"visible"});
 await page.getByRole("button").filter({has:badge}).click();
 await page.getByTestId("rig-contour-panel").getByTestId("inspect-open-panel").click();
 await dialog.waitFor({state:"visible"});
 assert(await values.count()===0,"Uventede lagrede mål");
 await dialog.getByTestId("inspect-close").click();
 await dialog.waitFor({state:"hidden"});
});
check(!COMMANDS.some(c=>c.includes("SaveMeasureSet")), "ingen SaveMeasureSet-kommando");
check(COMMANDS.length===0, "ingen prosjektkommandoer fra målingene");
check(WRITES.length===0 && JSON.stringify(rows)===rowsBefore, "ingen nye rader eller endret print-/PDF-data");
check(await page.evaluate(()=>window.__inspectionPrintCalls)===0 && downloads.length===0, "ingen utskrift eller PDF-nedlasting");
check(errors.length===0, `ingen nettleserfeil${errors.length?": "+errors.join(" | "):""}`);
await ctx.close();
} catch (e) { check(false, e.stack ?? String(e)); }
finally {
 if (browser) await browser.close();
 console.log(`RESULTAT: ${pass} bestått, ${fail} feilet; inspeksjon, målinger, drag, enheter og ingen lagring/utskrift`);
 process.exitCode = fail ? 1 : 0;
}
