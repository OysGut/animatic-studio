/**
 * Nettlesertest for B-114 C0: Community-brytere. Vanlig bruker ser ingenting når alt er av; administrator
 * ser «Funksjoner» med av/beta/på og testerliste (søk på e-post). nb og en. Mocker backend; ingenting endres.
 *   ENV_FILE=…/.env node tests/visual/community-c0.mjs [baseUrl] [utmappe]
 */
import { chromium } from "playwright";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { readFileSync, mkdirSync } from "node:fs";
const [base = "http://127.0.0.1:8080", out = "/tmp/community-c0"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const env = readFileSync(process.env.ENV_FILE ?? ".env", "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const USER = { id: "00000000-0000-7000-8000-a11ce0000001", email: "oystein@gutu.no", aud: "authenticated", role: "authenticated" };
const ANITA = { user_id: "00000000-0000-7000-8000-a11ce0000002", email: "anita@trollfilm.no", display_name: "Anita Killi" };
const KEYS = ["community.abtest", "community.profiles", "community.public", "community.review", "community.sharing"];
const RPC = [];

async function mock(ctx, st) {
  await ctx.route(`${supaUrl}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (path.startsWith("/auth/v1/user")) return json(USER);
    if (path.startsWith("/auth/v1/")) return json({});
    if (path.startsWith("/realtime/")) return route.abort();
    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.replace("/rest/v1/rpc/", "");
      const body = JSON.parse(req.postData() ?? "{}");
      RPC.push({ fn, body });
      if (fn === "my_account")
        return json({ status: "active", is_admin: st.admin, permanent_admin: st.admin, locale: st.lang, display_name: "Øystein", privacy_version: 2, accepted_version: 2, created_at: "2026-09-01T10:00:00Z" });
      if (fn === "my_features") return json(Object.fromEntries(KEYS.map((k) => [k, false])));
      if (fn === "admin_list_features") {
        if (!st.admin) return json({ code: "42501", message: "Bare for administrator" }, 403);
        return json(KEYS.map((k) => ({ key: k, state: st.states[k], message: null, changed_at: null, testers: st.testers[k] ?? [] })));
      }
      if (fn === "admin_set_feature") { st.states[body.p_key] = body.p_state; return json(null); }
      if (fn === "admin_find_users") return json(body.p_query.length >= 3 && "anita@trollfilm.no".includes(body.p_query) ? [ANITA] : []);
      if (fn === "admin_set_feature_testers") { st.testers[body.p_key] = body.p_users.map((id) => (id === ANITA.user_id ? ANITA : { user_id: id })); return json(body.p_users.length); }
      if (fn === "registration_status") return json({ open: true });
      if (fn === "admin_registration_settings") return json({ open: true, message: null });
      if (fn === "project_lock_info") return json({ lock: null });
      return json(null);
    }
    const table = path.replace("/rest/v1/", "");
    if (table === "schema_version") return json([{ version: VISUAL_SCHEMA_VERSION }]);
    return json([]);
  });
  await ctx.route("**/_serverFn/**", (route) => {
    const json = (result) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, context: {} }) });
    const u = route.request().url();
    if (/AdminOverview/.test(u) || true) {
      try {
        const name = JSON.parse(Buffer.from(decodeURIComponent(new URL(u).pathname.split("/_serverFn/")[1]), "base64url").toString("utf8")).export;
        if (/fetchAdminOverview/.test(name)) return json({ ok: true, purged: 0, permanentEmail: USER.email, users: [], projects: [] });
        if (/fetchAiUsage/.test(name)) return json({ ok: true, rows: [], projectNames: {}, userNames: {} });
        if (/fetchUsdNokRates/.test(name)) return json({ ok: true, rates: [] });
      } catch { /* ukjent */ }
    }
    return route.abort();
  });
}

const browser = await chromium.launch();
let pass = 0, fail = 0;
const check = (ok, text) => { console.log(`  ${ok ? "ok" : "FEIL"} ${text}`); ok ? pass++ : fail++; };

async function run(name, path, act, { lang = "nb", admin = true } = {}) {
  const st = { admin, lang, states: Object.fromEntries(KEYS.map((k) => [k, "off"])), testers: {} };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: "dark" });
  await mock(ctx, st);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const exp = Math.floor(Date.now() / 1000) + 86400;
  await page.addInitScript(([k, v, l]) => { localStorage.setItem(k, v); localStorage.setItem("animatic:lang", l); },
    [`sb-${ref}-auth-token`, JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: USER }), lang]);
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  try { await act(page, st); } catch (e) { errors.push("act: " + e.message); fail++; }
  check(errors.length === 0, `${name}: ingen sidefeil${errors.length ? " – " + errors.join(" | ").slice(0, 400) : ""}`);
  await ctx.close();
}

await run("c0-vanlig-bruker", "/", async (page) => {
  const body = await page.locator("body").innerText();
  check(!/community/i.test(body), "vanlig bruker ser ingen Community-meny når alt er av");
  check((await page.getByTestId("admin-features").count()) === 0, "ingen funksjonsseksjon på forsiden");
  check(RPC.every((r) => r.fn !== "admin_list_features"), "vanlig side spør ikke etter adminbryterne");
  await page.screenshot({ path: `${out}/c0-01-forside.png` });
}, { admin: false });

await run("c0-admin-nb", "/admin", async (page, st) => {
  const sec = page.getByTestId("admin-features");
  check(await sec.isVisible(), "administrator ser «Funksjoner»");
  const t = await sec.innerText();
  for (const s of ["Funksjoner", "Deling", "Profiler", "Offentlig deling", "Av", "Beta", "På"]) check(t.includes(s), `nb: «${s}»`);
  for (const k of KEYS) check((await page.getByTestId(`feature-${k}-off`).getAttribute("aria-checked")) === "true", `${k} står på av`);
  await page.getByTestId("feature-community.sharing-beta").click();
  await page.waitForTimeout(1200);
  check(RPC.some((r) => r.fn === "admin_set_feature" && r.body.p_key === "community.sharing" && r.body.p_state === "beta"), "beta lagres for deling");
  const testers = page.getByTestId("feature-community.sharing-testers");
  check(await testers.isVisible(), "testerlisten vises i beta");
  await testers.getByRole("searchbox").fill("anita@");
  await page.waitForTimeout(800);
  await testers.getByRole("button", { name: /anita@trollfilm\.no/ }).click();
  await testers.getByRole("button", { name: "Lagre testere" }).click();
  await page.waitForTimeout(1200);
  check(RPC.some((r) => r.fn === "admin_set_feature_testers" && r.body.p_users.includes(ANITA.user_id)), "testeren lagres");
  check((st.testers["community.sharing"] ?? []).length === 1, "testerlisten har én tester");
  await sec.screenshot({ path: `${out}/c0-02-admin-nb.png` });
});

await run("c0-admin-en", "/admin", async (page) => {
  const t = await page.getByTestId("admin-features").innerText();
  for (const s of ["Features", "Sharing", "Review and comments", "Public sharing", "Off", "Beta", "On"]) check(t.includes(s), `en: «${s}»`);
  await page.getByTestId("admin-features").screenshot({ path: `${out}/c0-03-admin-en.png` });
}, { lang: "en" });

console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
await browser.close();
process.exit(fail ? 1 : 0);
