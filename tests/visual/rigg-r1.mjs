/** B-087 runde 1: Rigg og riggkoblinger i sceneeditoren.
 * ENV_FILE=.env [UI_LANG=en] node tests/visual/rigg-r1.mjs [baseUrl] [fixture.json] [utmappe]
 * Alle serverfunksjoner og Supabase mockes; ingen betalte tjenester brukes.
 */
import { chromium } from "playwright";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { uiLang } from "./ui-lang.mjs";
import { readFileSync, mkdirSync } from "node:fs";
const [base = "http://127.0.0.1:8080", fixturePath = "/tmp/claude-0/visual-fixture.json", out = "/tmp/claude-0/rigg-r1"] = process.argv.slice(2);
let pass = 0, fail = 0;
const check = (ok, description) => {
  console.log(`${ok ? " ok" : " FEIL"} ${description}`);
  ok ? pass++ : fail++;
};
let browser;
try {
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE, "utf8");
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
const layer = fx.rows.composition_layers.find((l) => l.kind === "background");
if (!layer) throw new Error("Fixture mangler bakgrunnslag");
const rows = { ...fx.rows,
 rig_templates: [{ id: id(10), project_id: project.id, revision: 1, name: "R1 mal", spec, removed: false }],
 rig_setups: [{ id: id(11), project_id: project.id, revision: 1, scene_id: null, template_id: id(10), name: "R1 rigg", spec, removed: false }],
 composition_layers: fx.rows.composition_layers.map((l) => l.id === layer.id ? { ...l, rig_plate_id: id(2), rig_plate_depth_mm: 0, parallax: 2 } : l),
};
const SERVER_PREFS = {}, COMMANDS = [];
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
      const n = (path.length * 37) % 360;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 300 400"><rect width="300" height="400" fill="hsl(${n} 25% 22%)"/><circle cx="150" cy="120" r="60" fill="hsl(${n} 45% 70%)"/></svg>`;
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
    }
    const table = path.replace("/rest/v1/", "");
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


browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: "dark" });
await mock(ctx);
const page = await ctx.newPage();
page.setDefaultTimeout(12000);
const errors = [];
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
await page.goto(base + P + "/rigg", { waitUntil: "networkidle" });
for (const testId of ["rig-side-view", "rig-plates", "rig-camera", "rig-calibration-status", "rig-templates"]) {
 await step(`${testId} vises (${lang})`, async () => { await page.getByTestId(testId).waitFor({ state: "visible" }); });
}
await step("mm ↔ inches endrer viste kameraverdier uten å endre geometrien", async () => {
 const units = page.locator('select[id="rig-units"]');
 const height = page.getByTestId("rig-camera").locator('[id="rig-height"]');
 await units.selectOption("mm");
 assert(await height.inputValue() === "900", "Forventet 900 mm");
 await units.selectOption("in");
 assert(await height.inputValue() === (900/25.4).toFixed(2), "Feil verdi i inches");
 await units.selectOption("mm");
 assert(await height.inputValue() === "900", "Millimeterverdien ble ikke gjenopprettet");
});
await step("kalibreringsstatus endres når kamerahøyden endres", async () => {
 const status = page.getByTestId("rig-calibration-status");
 const before = await status.innerText();
 const height = page.getByTestId("rig-camera").locator('[id="rig-height"]');
 await height.fill("950"); await height.press("Tab");
 assert((await status.innerText()) !== before, "Status ble ikke ugyldig");
 await height.fill("900"); await height.press("Tab");
 assert((await status.innerText()) === before, "Kalibreringen ble ikke gjenopprettet");
});
await step("3D-plassholderen har deaktivert knapp", async () => {
 const placeholder = page.getByTestId("rig-print-placeholder");
 await placeholder.waitFor({ state: "visible" });
 assert(await placeholder.getByRole("button").isDisabled(), "3D-knappen er aktiv");
});
await step("Lagre som mal oppretter AddRigTemplate med gyldig riggmodell", async () => {
 const templates = page.getByTestId("rig-templates");
 const save = templates.getByRole("button").last();
 assert(await save.isDisabled(), "Tomt malnavn skal sperres");
 await templates.getByRole("textbox").fill("R1 nettlesermal");
 assert(await save.isEnabled(), "Lagre som mal er deaktivert");
 await save.click();
 for (let i = 0; i < 40 && !COMMANDS.some((c) => c.includes("AddRigTemplate")); i++) await page.waitForTimeout(100);
 const command = COMMANDS.find((c) => c.includes("AddRigTemplate"));
 const alertText = await page.locator('[role="alert"]').allInnerTexts();
 // Nyttelasten er TanStack-dehydrert: nøkler og verdier ligger i k/v-lister, ikke som "nøkkel":"verdi".
 assert(command?.includes("AddRigTemplate") && command.includes("R1 nettlesermal") && command.includes("sensorWidthMm") && command.includes('"format"'), "Malens kommando eller modell mangler (innhold: " + String(command).slice(0, 300) + ")");
});
await page.screenshot({ path: `${out}/rigg-${lang}.png`, fullPage: true });
await page.goto(base + P + "/scene", { waitUntil: "domcontentloaded" });
await step("lagpanelet viser platevelger og fysisk størrelse", async () => {
 // Avviksmerket ligger inne i lagets valgknapp: ingen språkavhengig lagtekst.
 const badge = page.getByTestId(`rig-parallax-override-${layer.id}`);
 await badge.waitFor({ state: "visible" });
 await page.getByRole("button").filter({ has: badge }).click();
 const section = page.getByTestId("rig-layer-section");
 await section.waitFor({ state: "visible" });
 assert(await section.getByTestId("rig-plate-select").inputValue() === id(2), "Feil tilkoblet plate");
 const size = section.getByTestId("rig-physical-size");
 await size.waitFor({ state: "visible" });
 assert(/\d/.test(await size.innerText()), "Fysisk størrelse mangler tall");
});
await step("overstyrt parallakse viser avviksmerke, platebytte oppdaterer laget", async () => {
 const badge = page.getByTestId(`rig-parallax-override-${layer.id}`);
 assert(await badge.isVisible(), "Avviksmerke mangler ved parallakse 2 mot beregnet 1,125");
 const select = page.getByTestId("rig-plate-select");
 await select.selectOption(id(3));
 assert(await select.inputValue() === id(3), "Platebytte ble ikke brukt");
 await page.getByTestId("rig-physical-size").waitFor({ state: "visible" });
});
await page.screenshot({ path: `${out}/lag-${lang}.png`, fullPage: true });
check(errors.length === 0, `ingen nettleserfeil${errors.length ? ": " + errors.join(" | ") : ""}`);
await ctx.close();
} catch (e) { check(false, e.stack ?? String(e)); }
finally {
 if (browser) await browser.close();
 console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
 process.exitCode = fail ? 1 : 0;
}
