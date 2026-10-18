/**
 * Felles oppsett for MTS-nettlesertestene (mts-engine, mts-lower-thirds, mts-nondestructive). Kopi av oppsettet
 * i asset-studio-ui.mjs: mockede serverfunksjoner (ingenting lagres, ingen AI), mocket lagring (også
 * opplasting av malminiatyren) og fast fixture fra make-mts-fixture.ts.
 *   bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json
 *   ENV_FILE=… node tests/visual/mts-engine.mjs <baseUrl> /tmp/claude-0/mts-fixture.json [out]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";

export function harness(defaultOut) {
  const [base = "http://127.0.0.1:8080", fixturePath = "/tmp/claude-0/mts-fixture.json", out = defaultOut] = process.argv.slice(2);
  mkdirSync(out, { recursive: true });
  const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
  const env = readFileSync(process.env.ENV_FILE, "utf8");
  const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
  const ref = new URL(supaUrl).hostname.split(".")[0];
  const USER = { id: "00000000-0000-7000-8000-a11ce0000001", email: "mars@example.no", aud: "authenticated", role: "authenticated" };
  const P = `/prosjekt/${fx.project.id}`;
  const rows = fx.rows;
  const state = { commands: [], uploads: [] };

  function serverFnName(url) {
    try {
      const b64 = new URL(url).pathname.split("/_serverFn/")[1];
      return JSON.parse(Buffer.from(decodeURIComponent(b64), "base64url").toString("utf8")).export;
    } catch {
      return "?";
    }
  }
  function deser(n, refs = new Map()) {
    if (n === null || typeof n !== "object") return n;
    switch (n.t) {
      case 0: return Number(n.s);
      case 1: { try { return JSON.parse(`"${n.s}"`); } catch { return n.s; } }
      case 2: return ({ 0: null, 1: undefined, 2: true, 3: false })[n.s];
      case 4: return refs.get(n.i);
      case 9: { const a = []; refs.set(n.i, a); for (const v of n.a ?? []) a.push(deser(v, refs)); return a; }
      case 10: { const o = {}; refs.set(n.i, o); (n.p?.k ?? []).forEach((k, i) => { o[k] = deser(n.p.v[i], refs); }); return o; }
      default: return n.s ?? null;
    }
  }
  function dataOf(body) {
    try {
      const j = JSON.parse(body);
      const root = j && typeof j === "object" && "t" in j && typeof j.t === "object" ? deser(j.t) : j;
      const find = (x) => {
        if (!x || typeof x !== "object") return null;
        if ("data" in x && x.data && typeof x.data === "object" && !Array.isArray(x.data)) return x.data;
        for (const v of Object.values(x)) { const r = find(v); if (r) return r; }
        return null;
      };
      return find(root) ?? {};
    } catch { return {}; }
  }

  async function mock(context, role = "owner") {
    await context.route(`${supaUrl}/**`, async (route) => {
      const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
      const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      const single = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object");
      if (path.startsWith("/auth/v1/user")) return json(USER);
      if (path.startsWith("/auth/v1/")) return json({});
      if (path.startsWith("/storage/v1/object/sign/") && request.method() === "POST") {
        const body = JSON.parse(request.postData() ?? "{}");
        return json((body.paths ?? []).map((p) => ({ path: p, signedURL: `/object/sign/assets/${p}?token=t`, error: null })));
      }
      // Opplasting (malminiatyren): samme svar som Supabase Storage
      if (path.startsWith("/storage/v1/object/") && (request.method() === "POST" || request.method() === "PUT")) {
        const key = path.replace("/storage/v1/object/", "");
        state.uploads.push(key);
        return json({ Key: key, Id: "00000000-0000-7000-8000-0000a7999999" });
      }
      if (path.startsWith("/storage/v1/")) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' });
      const table = path.replace("/rest/v1/", "");
      if (table === "rpc/my_account") return json({ status: "active", is_admin: false, permanent_admin: false, locale: null, display_name: "Mars", privacy_version: 1, accepted_version: 1, created_at: "2026-10-01T10:00:00Z", ui_prefs: {} });
      if (table === "schema_version") return json([{ version: VISUAL_SCHEMA_VERSION }]);
      if (table === "projects") return json(single ? fx.project : [{ ...fx.project, project_members: [{ user_id: USER.id, role }] }]);
      if (table === "project_members") return json([{ user_id: USER.id, role, joined_at: "2026-10-08T10:00:00Z" }]);
      if (table === "profiles") return json([{ user_id: USER.id, display_name: "Mars" }]);
      if (path.startsWith("/rest/v1/rpc/")) return json(null);
      if (path.startsWith("/realtime/")) return route.abort();
      return json(single ? rows[table]?.[0] ?? null : Number(url.searchParams.get("offset") ?? 0) > 0 ? [] : rows[table] ?? []);
    });
    await context.route("**/_serverFn/**", async (route) => {
      const name = serverFnName(route.request().url()); const d = dataOf(route.request().postData() ?? "{}");
      const json = (result) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, context: {} }) });
      if (/runCommand/.test(name)) {
        state.commands.push(d.command ?? d.envelope?.command ?? d);
        return json({ ok: true, changeId: "mts", affected: [], inverse: null, revisions: {} });
      }
      if (/pumpProjectQueue/.test(name)) return json({ sent: 0 });
      if (/projectAiProviders|listTextChoices/.test(name)) return json({ providers: [], missing: false });
      if (/listStorySessions/.test(name)) return json({ ok: true, sessions: [] });
      if (/listStorySuggestions/.test(name)) return json({ ok: true, suggestions: [] });
      if (/listEntityAnalysis/.test(name)) return json({ rows: [] });
      return json({ ok: true, lock: null });
    });
  }

  let pass = 0, fail = 0;
  const check = (condition, description) => { console.log(`  ${condition ? "ok" : "FEIL"} ${description}`); condition ? pass++ : fail++; };
  let browser;

  /** Åpner sceneeditoren for sceneforekomsten (occurrenceId, som `?scene=` tar) på språket. */
  async function open(sceneId, lang = "nb", role = "owner") {
    browser ??= await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 1800 }, colorScheme: "dark" });
    await mock(context, role);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const exp = Math.floor(Date.now() / 1000) + 86400;
    await page.evaluate(([key, value, l]) => { localStorage.setItem(key, value); localStorage.setItem("animatic:lang", l); }, [`sb-${ref}-auth-token`, JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: USER }), lang]);
    await page.goto(`${base}${P}/scene?scene=${sceneId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    return { context, page, errors };
  }

  async function scenario(name, sceneId, lang, fn) {
    state.commands = [];
    state.uploads = [];
    let ctx;
    try {
      ctx = await open(sceneId, lang);
      await fn(ctx.page);
      check(ctx.errors.length === 0, `${name}: ingen kjørefeil (${ctx.errors.join(" | ").slice(0, 200)})`);
    } catch (error) {
      fail++;
      console.log(`  FEIL ${name}: ${String(error).split("\n")[0]}`);
      await ctx?.page.screenshot({ path: `${out}/${name}-failed.png` }).catch(() => {});
    }
    await ctx?.context.close();
  }

  /** Velger laget med radens valgknapp (aria-pressed). Midt på raden ligger flytt-/slettknappene, som vises ved peker over. */
  const selectLayer = async (page, layerId) => {
    const row = page.locator(`[data-layer-row="${layerId}"]`).first();
    await row.locator("button[aria-pressed]").first().click();
    await row.locator('button[aria-pressed="true"]').first().waitFor({ timeout: 5000 });
  };
  const waitHidden = (loc) => loc.waitFor({ state: "hidden", timeout: 5000 });
  /** Åpner «Tekst»-menyen og velger et punkt; venter til menyen er lukket. */
  async function menu(page, testId) {
    await page.getByTestId("mts-text-menu").click();
    await page.getByTestId(testId).click();
    await waitHidden(page.getByTestId(testId));
  }
  /** Feltene for laget i siste UpdateLayers/AddLayers som rører det. */
  function lastFields(layerId) {
    for (let i = state.commands.length - 1; i >= 0; i--) {
      const c = state.commands[i];
      const steps = c?.type === "ApplyTemplate" ? c.steps : [c];
      for (const st of [...(steps ?? [])].reverse()) {
        const l = (st?.layers ?? []).find((x) => x.layerId === layerId);
        if (l) return l.fields;
      }
    }
    return null;
  }
  /** Spør etter `cond` med jevne mellomrom til den er sann eller tiden går ut (for kontroller som venter på en sendt kommando). */
  async function eventually(cond, ms = 3000) {
    const end = Date.now() + ms;
    for (;;) {
      let v = false;
      try { v = await cond(); } catch { v = false; }
      if (v) return true;
      if (Date.now() >= end) return false;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  async function finish() {
    console.log(`RESULTAT ${pass} bestått, ${fail} feilet`);
    await browser?.close();
    process.exitCode = fail ? 1 : 0;
  }
  return { fx, M: fx.mts, rows, state, check, scenario, selectLayer, waitHidden, menu, lastFields, eventually, finish, out, base, P };
}
