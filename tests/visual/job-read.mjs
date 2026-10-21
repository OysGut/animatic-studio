/** B-095: personlig lest-status for AI-feil. Ingen ekte serverendringer eller betalte kall.
 * ENV_FILE=.env [UI_LANG=en] NODE_PATH=/tmp/pw/node_modules node tests/visual/job-read.mjs [base] [fixture] [utmappe]
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(`${process.env.NODE_PATH ?? "/tmp/pw/node_modules"}/../package.json`)("playwright");
import { readFileSync, mkdirSync } from "node:fs";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { uiLang } from "./ui-lang.mjs";
const [base = "http://127.0.0.1:8080", fixturePath = "/tmp/claude-0/visual-fixture.json", out = "/tmp/claude-0/job-read"] = process.argv.slice(2);
const lang = uiLang("nb");
let pass = 0, fail = 0, browser;
const check = (ok, description) => { console.log(`${ok ? " ok" : " FEIL"} ${description}`); ok ? pass++ : fail++; };
const assert = (ok, message) => { if (!ok) throw new Error(message); };
async function step(description, action) { try { await action(); check(true, description); } catch (e) { check(false, `${description}: ${e.message}`); } }
async function until(fn, message) { for (let i = 0; i < 60; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); } throw new Error(message); }
try {
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE ?? ".env", "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const USER = { id: "00000000-0000-7000-8000-a11ce0000001", email: "mars@example.no", aud: "authenticated", role: "authenticated" };
const project = fx.project, rows = fx.rows, SERVER_PREFS = {}, COMMANDS = [], WRITES = [];
const job = n => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, project_id: project.id, kind: "image", status: "failed", provider: "mock", model: `B095-${n}`, params: {}, error: "B095 mock failure", created_at: new Date(Date.now()-120000).toISOString(), finished_at: new Date(Date.now()-60000).toISOString() });
const jobs = [job(951), job(952)];
mkdirSync(out, { recursive: true });
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
      return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4X8AAAAASUVORK5CYII=", "base64") });
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
    if (table === "generation_jobs") return route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/0" }, body: req.method() === "HEAD" ? "" : JSON.stringify(jobs) });
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
await ctx.addInitScript(([key, user, language]) => {
 if (sessionStorage.getItem("job-read-init")) return;
 localStorage.setItem(key, JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now()/1000)+86400, user }));
 localStorage.setItem("animatic:lang", language);
 sessionStorage.setItem("job-read-init", "1");
}, [`sb-${ref}-auth-token`, USER, lang]);
const page = await ctx.newPage(), errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.setDefaultTimeout(30000);
const status = page.getByTestId("generation-status");
const count = async n => until(async () => (await status.innerText()).match(/\d+/)?.[0] === String(n), `forventet teller ${n}`);
// Ikonet er aria-hidden og har verken rolle eller testid i dagens appkode.
// Ikke bruk SVG-geometri, CSS-klasser eller oversatt tekst som reserve-selektor.
const triangle = async visible => {
 const icon = status.getByTestId("generation-status-warning");
 assert(await icon.count() > 0 || !visible, "mangler data-testid på varseltrekanten (forventet generation-status-warning)");
 assert(await icon.isVisible() === visible, "varseltrekant har feil synlighet");
};
await page.goto(`${base}/prosjekt/${project.id}`, { waitUntil: "domcontentloaded", timeout: 90000 });
await status.waitFor();
await step("mislykkede jobber gir teller 2", () => count(2));
await step("mislykket jobb tenner varseltrekanten", () => triangle(true));
const readBtn = n => page.getByTestId(`job-mark-read-${jobs[n].id}`);
await step("Merk som lest demper én jobb og senker telleren", async () => {
 // Åpne listen hvis den ikke er åpen (sjekken skjer før klikk, så den aldri lukkes igjen).
 await until(async () => {
   if (await readBtn(0).count() === 0) await status.click();
   return (await readBtn(0).count()) > 0;
 }, "jobblisten åpnet ikke");
 await readBtn(0).click();
 await count(1);
 const li = page.getByText(jobs[0].model).locator("xpath=ancestor::li[1]");
 await until(async () => Number(await li.evaluate(el => getComputedStyle(el).opacity)) < 1, "lest jobb er ikke nedtonet");
 await until(() => SERVER_PREFS.aiJobsRead?.readIds?.includes(jobs[0].id), "aiJobsRead.readIds ble ikke lagret på kontoen");
});
await step("Merk alle som lest fjerner uleste feil i begge visninger", async () => {
 await page.getByTestId("jobs-mark-all-read").click();
 await until(() => Boolean(SERVER_PREFS.aiJobsRead?.readBefore), "aiJobsRead.readBefore ble ikke lagret");
 assert(await page.getByTestId("jobs-mark-all-read").count() === 0, "fortsatt uleste feil i listen");
 await until(async () => (await page.getByTestId("todo-jobs-mark-all-read").count()) === 0, "fortsatt uleste feil i TODO");
 assert(!(await status.innerText()).match(/\d+/), "telleren er ikke nullstilt");
});
await step("Merk alle slukker varseltrekanten", () => triangle(false));
await step("ny feil etter Merk alle gir teller 1 og ulest jobb", async () => {
 const next = job(953); next.finished_at = new Date(Date.parse(SERVER_PREFS.aiJobsRead.readBefore)+1000).toISOString(); jobs.unshift(next);
 // Reload utløser en ny listing og kontrollerer samtidig persistert lest-status.
 await page.reload({ waitUntil: "domcontentloaded" });
 await status.waitFor(); await count(1); await status.click();
 await page.getByTestId(`job-mark-read-${next.id}`).waitFor();
 assert(await page.getByTestId(`job-mark-read-${jobs[1].id}`).count() === 0, "gammel feil ble ulest igjen");
});
await step("ny feil tenner varseltrekanten igjen", () => triangle(true));
await page.screenshot({ path: `${out}/job-read-${lang}.png`, fullPage: true });
await step("ingen nettleserfeil eller jobbskriving", async () => { assert(!errors.length, errors.join(" | ")); assert(!WRITES.some(w => w.table === "generation_jobs"), "jobbrader ble endret"); });
await ctx.close();
} catch (e) { check(false, e.stack ?? String(e)); }
finally { if (browser) await browser.close(); console.log(`RESULTAT: ${pass} bestått, ${fail} feilet; B-095; språk=${lang}`); process.exitCode = fail ? 1 : 0; }
