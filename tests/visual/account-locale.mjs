/**
 * Nettlesertest for B-097: registrering krever land, landdialogen for eksisterende brukere,
 * region-innstillingene på kontosiden, «Sist endret» i scenevelgeren og landstatistikken på adminsiden.
 * Mocker Supabase og serverfunksjonene; ingenting lagres eller betales.
 *   ENV_FILE=…/.env [UI_LANG=en] node account-locale.mjs <baseUrl> <fixture.json> [utmappe]
 */
import { chromium } from "playwright";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { readFileSync, mkdirSync } from "node:fs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/account-locale",
] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const LANG = process.env.UI_LANG === "en" ? "en" : "nb";
const EN = LANG === "en";
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE, "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const project = fx.project;
const P = `/prosjekt/${project.id}`;
const BASE_USER = {
  id: "00000000-0000-7000-8000-a11ce0000001",
  email: "mars@example.no",
  aud: "authenticated",
  role: "authenticated",
};

function serverFnName(url) {
  try {
    const b64 = new URL(url).pathname.split("/_serverFn/")[1];
    return JSON.parse(Buffer.from(decodeURIComponent(b64), "base64url").toString("utf8")).export;
  } catch {
    return "?";
  }
}

async function mock(ctx, st) {
  await ctx.route(`${supaUrl}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const json = (b, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (path.startsWith("/auth/v1/signup")) {
      st.signups.push(JSON.parse(req.postData() ?? "{}"));
      return json({ user: { ...st.user, user_metadata: {} }, session: null });
    }
    if (path.startsWith("/auth/v1/user")) return json(st.user);
    if (path.startsWith("/auth/v1/")) return json({});
    if (path.startsWith("/realtime/")) return route.abort();
    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.replace("/rest/v1/rpc/", "");
      const body = JSON.parse(req.postData() ?? "{}");
      st.rpc.push({ fn, body });
      if (fn === "my_account")
        return json({
          status: "active",
          is_admin: st.admin,
          permanent_admin: st.admin,
          locale: null,
          display_name: "Mars",
          privacy_version: 1,
          accepted_version: 1,
          created_at: "2026-10-01T10:00:00Z",
          ui_prefs: st.prefs,
          country: st.country,
        });
      if (fn === "set_my_country") {
        st.country = body.p_country;
        return json(null);
      }
      if (fn === "set_my_ui_prefs") {
        for (const [k, v] of Object.entries(body.p_prefs ?? {})) {
          if (v === null) delete st.prefs[k];
          else st.prefs[k] = v;
        }
        return json(null);
      }
      if (fn === "scene_last_changes") {
        const now = Date.now();
        return json(
          fx.rows.scenes.map((s, i) => ({
            scene_id: s.id,
            changed_at: new Date(now - (i === 0 ? 3 : 60 * 24 * 30) * 60_000).toISOString(),
            actor_id: "00000000-0000-7000-8000-a11ce0000002",
            actor_name: "Anita Killi",
            logged: i === 0,
          })),
        );
      }
      if (fn === "admin_country_counts")
        return json([
          { country: "NO", users: 12 },
          { country: "SE", users: 3 },
          { country: null, users: 2 },
        ]);
      return json(null);
    }
    const table = path.replace("/rest/v1/", "");
    if (table === "schema_version") return json([{ version: VISUAL_SCHEMA_VERSION }]);
    if (table === "projects") {
      if (single) return json(project);
      return json([{ ...project, project_members: [{ role: "owner", user_id: st.user.id }] }]);
    }
    if (table === "project_members")
      return json([{ user_id: st.user.id, role: "owner", joined_at: "2026-10-08T10:00:00Z" }]);
    if (table === "profiles") return json([{ user_id: st.user.id, display_name: "Mars" }]);
    if (fx.rows[table] && single) return json(fx.rows[table][0] ?? null);
    if (fx.rows[table]) {
      const off = Number(url.searchParams.get("offset") ?? 0);
      return json(off > 0 ? [] : fx.rows[table]);
    }
    return json([]);
  });
  await ctx.route("**/_serverFn/**", (route) => {
    const name = serverFnName(route.request().url());
    const json = (result) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, context: {} }) });
    if (/fetchAdminOverview/.test(name))
      return json({ ok: true, purged: 0, permanentEmail: BASE_USER.email, users: [], projects: [] });
    if (/fetchAiUsage/.test(name)) return json({ ok: true, rows: [], projectNames: {}, userNames: {} });
    if (/fetchUsdNokRates/.test(name)) return json({ ok: true, rates: [] });
    if (/projectAiProviders/.test(name)) return json({ providers: [], missing: false });
    if (/pumpProjectQueue/.test(name)) return json({ sent: 0 });
    // B-110: registreringen henter et pass fra serveren før signUp (CAPTCHA av i testen)
    if (/^captchaConfig/.test(name)) return json({ enabled: false, siteKey: null });
    if (/^requestSignupPass/.test(name)) return json({ ok: true });
    return route.abort();
  });
}

const browser = await chromium
  .launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" })
  .catch(() => chromium.launch());
let pass = 0,
  fail = 0;
const check = (ok, text) => {
  console.log(`  ${ok ? "✓" : "✗"} ${text}`);
  ok ? pass++ : fail++;
};

async function run(name, path, act, opts = {}) {
  const st = {
    user: opts.user ?? BASE_USER,
    country: opts.country === undefined ? "NO" : opts.country,
    prefs: { ...(opts.prefs ?? {}) },
    admin: opts.admin ?? false,
    rpc: [],
    signups: [],
  };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  await mock(ctx, st);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const exp = Math.floor(Date.now() / 1000) + 86400;
  await page.addInitScript(
    ([k, v, l, s]) => {
      if (sessionStorage.getItem("init")) return;
      if (s) localStorage.setItem(k, v);
      localStorage.setItem("animatic:lang", l);
      sessionStorage.setItem("init", "1");
    },
    [
      `sb-${ref}-auth-token`,
      JSON.stringify({
        access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig",
        refresh_token: "r",
        token_type: "bearer",
        expires_in: 86400,
        expires_at: exp,
        user: st.user,
      }),
      LANG,
      opts.signedIn !== false,
    ],
  );
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  try {
    await act(page, st);
  } catch (e) {
    errors.push("act: " + (process.env.DEBUG ? e.message.slice(0, 1500) : e.message.split("\n")[0]));
    fail++;
  }
  await page.screenshot({ path: `${out}/${name}-${LANG}.png` });
  console.log(name, errors.length ? "FEIL: " + errors.join(" | ").slice(0, 800) : "ok");
  await ctx.close();
}

// 1. Registrering krever land
await run(
  "l01-signup",
  "/",
  async (page, st) => {
    await page.getByTestId("auth-mode-toggle").click();
    await page.locator("#email").fill("ny@example.no");
    await page.locator("#password").fill("hemmelig-passord-123");
    await page.getByTestId("signup-privacy").click();
    await page.getByTestId("auth-submit").click();
    await page.waitForTimeout(600);
    check(st.signups.length === 0, "registreringen sendes ikke uten land");
    check(
      (await page.getByTestId("signup-country").getAttribute("aria-invalid")) === "true",
      "landvalget markeres som ugyldig",
    );
    await page.getByTestId("signup-country").click();
    await page.getByTestId("signup-country-search").fill(EN ? "Norw" : "Norg");
    check(await page.getByTestId("signup-country-option-NO").isVisible(), "søket finner Norge på språket i grensesnittet");
    check(
      (await page.getByTestId("signup-country-option-NO").innerText()).includes(EN ? "Norway" : "Norge"),
      "landnavnet følger språket",
    );
    await page.getByTestId("signup-country-option-NO").click();
    await page.getByTestId("auth-submit").click();
    await page.waitForTimeout(1000);
    check(st.signups.length === 1, "registreringen sendes når land er valgt");
    check(st.signups[0]?.data?.country === "NO", "landet følger med registreringen");
  },
  { signedIn: false },
);

// 2. Eksisterende bruker uten land må velge før de går videre
await run(
  "l02-gate",
  "/",
  async (page, st) => {
    const gate = page.getByTestId("country-gate");
    check(await gate.isVisible(), "dialogen vises for bruker uten land");
    check(await page.getByTestId("country-gate-save").isDisabled(), "lagre er av til land er valgt");
    await page.keyboard.press("Escape");
    await page.mouse.click(5, 5);
    await page.waitForTimeout(300);
    check(await gate.isVisible(), "dialogen kan ikke lukkes uten valg");
    await page.getByTestId("country-gate-picker").click();
    await page.waitForTimeout(300);
    await page.getByTestId("country-gate-picker-search").fill("SE");
    await page.getByTestId("country-gate-picker-option-SE").click();
    await page.getByTestId("country-gate-save").click();
    await page.waitForTimeout(1200);
    check(st.rpc.some((r) => r.fn === "set_my_country" && r.body.p_country === "SE"), "valgt land lagres");
    check(!(await gate.isVisible().catch(() => false)), "dialogen lukkes etter valg");
  },
  { country: null },
);

// 2b. Land fra registreringen lagres uten dialog
await run(
  "l03-signup-meta",
  "/",
  async (page, st) => {
    await page.waitForTimeout(800);
    check(st.rpc.some((r) => r.fn === "set_my_country" && r.body.p_country === "DE"), "land fra registreringen lagres ved første innlogging");
    check(!(await page.getByTestId("country-gate").isVisible().catch(() => false)), "ingen dialog når landet var valgt ved registrering");
  },
  { country: null, user: { ...BASE_USER, user_metadata: { country: "DE" } } },
);

// 3. Kontosiden: land, klokke, datoformat og forhåndsvisning
await run("l04-account", "/konto", async (page, st) => {
  check(await page.getByTestId("region-settings").isVisible(), "kontosiden har land, klokke og datoformat");
  check((await page.getByTestId("account-country").getAttribute("data-value")) === "NO", "landet vises");
  const exact = page.getByTestId("region-preview-exact").last();
  const before = await exact.innerText();
  check(/\d{2}\.\d{2}/.test(before) || /\d/.test(before), "forhåndsvisningen viser dato og tid");
  await page.getByTestId("account-clock").selectOption("12");
  await page.getByTestId("account-date-format").selectOption("ymd-iso");
  await page.waitForTimeout(400);
  const after = await exact.innerText();
  check(/AM|PM|a\.m\.|p\.m\./i.test(after), "12-timersklokke vises i forhåndsvisningen");
  check(/\d{2}-\d{2}/.test(after), "datoformatet 2026-12-31 vises i forhåndsvisningen");
  await page.waitForTimeout(1500);
  const saved = st.rpc.filter((r) => r.fn === "set_my_ui_prefs").map((r) => JSON.stringify(r.body));
  check(saved.some((s) => s.includes('"12"')) && saved.some((s) => s.includes("ymd-iso")), "valgene lagres på kontoen");
  await page.getByTestId("account-country").click();
  await page.getByTestId("account-country-search").fill("US");
  await page.getByTestId("account-country-option-US").click();
  await page.waitForTimeout(800);
  check(st.rpc.some((r) => r.fn === "set_my_country" && r.body.p_country === "US"), "landet kan endres på kontosiden");
});

// 4. «Sist endret» i scenevelgeren
await run("l05-scene-picker", P + "/scene", async (page) => {
  await page.waitForTimeout(1500);
  await page.getByTestId("scene-picker-trigger").click();
  await page.waitForTimeout(600);
  const cells = page.getByTestId("scene-last-changed");
  check((await cells.count()) >= 2, "scenelisten har kolonnen «Sist endret»");
  const texts = await cells.allInnerTexts();
  check(texts.some((x) => (EN ? /\d min ago/ : /\d min siden/).test(x)), "nylig endring vises relativt");
  check(texts.some((x) => /\d/.test(x) && !/siden|ago/.test(x)), "eldre endringer vises som dato");
  const titles = await cells.evaluateAll((els) => els.map((e) => e.getAttribute("title") ?? ""));
  if (process.env.DEBUG) console.log(texts, titles);
  check(titles.some((x) => x.includes("Anita Killi")), "verktøytipset viser hvem som endret sist");
});

// 5. Admin: bare aggregert per land
await run(
  "l06-admin",
  "/admin",
  async (page) => {
    const sec = page.getByTestId("admin-country-stats");
    await sec.scrollIntoViewIfNeeded();
    check(await sec.isVisible(), "adminsiden viser brukere per land");
    const rows = page.getByTestId("admin-country-row");
    check((await rows.count()) === 3, "én rad per land, også uten land");
    const text = await sec.innerText();
    check(text.includes("12") && text.includes(EN ? "Norway" : "Norge"), "antall og landnavn vises");
    check(!/@/.test(text), "ingen e-postadresser i tabellen");
  },
  { admin: true },
);

await browser.close();
console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
