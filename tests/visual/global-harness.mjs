/**
 * Felles oppsett for nettlesertestene for den globale pakken (GP2–GP5): samme mønster som
 * library-suggestions-ui.mjs (syntetisk fixture, mocket backend og mockede serverfunksjoner, ingen betalte
 * kall). Hver suite gir egne svar for tabeller, databasefunksjoner og serverfunksjoner.
 * ENV_FILE=… node tests/visual/<suite>.mjs <baseUrl> <fixture.json> [out]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";

export const USER = { id: "00000000-0000-7000-8000-a11ce0000001", email: "mars@example.no", aud: "authenticated", role: "authenticated" };

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
export function dataOf(body) {
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

/**
 * @param {{ tables?: (table: string, url: URL, method: string, body: any) => any, rpc?: (name: string, body: any) => any, serverFn?: (name: string, data: any) => any }} hooks
 */
export function setup(hooks = {}) {
  const [base = "http://127.0.0.1:8080", fixturePath = "/tmp/claude-0/visual-fixture.json", out = "/tmp/claude-0/global"] = process.argv.slice(2);
  mkdirSync(out, { recursive: true });
  const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
  const env = readFileSync(process.env.ENV_FILE, "utf8");
  const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
  const ref = new URL(supaUrl).hostname.split(".")[0];
  const P = `/prosjekt/${fx.project.id}`;
  const log = { commands: [], serverFns: [], rpcs: [] };
  let pass = 0, fail = 0;
  const check = (condition, description) => { console.log(`  ${condition ? "ok" : "FEIL"} ${description}`); condition ? pass++ : fail++; };

  async function mock(context, role) {
    await context.route(`${supaUrl}/**`, async (route) => {
      const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
      const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      const single = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object");
      if (path.startsWith("/auth/v1/user")) return json(USER);
      if (path.startsWith("/auth/v1/")) return json({});
      if (path.startsWith("/storage/v1/object/upload/sign/") && request.method() === "PUT") {
        return json({ Key: decodeURIComponent(path.slice("/storage/v1/object/upload/sign/".length)) });
      }
      if (path.startsWith("/storage/v1/object/sign/") && request.method() === "POST") {
        const body = JSON.parse(request.postData() ?? "{}");
        return json((body.paths ?? []).map((p) => ({ path: p, signedURL: `/object/sign/assets/${p}?token=t`, error: null })));
      }
      if (path.startsWith("/storage/v1/")) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' });
      const table = path.replace("/rest/v1/", "");
      let body = null; try { body = JSON.parse(request.postData() ?? "null"); } catch { body = null; }
      if (table.startsWith("rpc/")) {
        const name = table.slice(4);
        log.rpcs.push({ name, body });
        const r = hooks.rpc?.(name, body);
        if (r !== undefined) return json(r);
        if (name === "my_account") return json({ status: "active", is_admin: false, permanent_admin: false, locale: null, display_name: "Mars", privacy_version: 1, accepted_version: 1, created_at: "2026-10-01T10:00:00Z", ui_prefs: {} });
        return json(null);
      }
      const custom = hooks.tables?.(table, url, request.method(), body, single);
      if (custom !== undefined) return json(custom);
      if (table === "schema_version") return json([{ version: VISUAL_SCHEMA_VERSION }]);
      if (table === "projects") return json(single ? fx.project : [{ ...fx.project, project_members: [{ user_id: USER.id, role }] }]);
      if (table === "project_members") return json([{ user_id: USER.id, role, joined_at: "2026-10-08T10:00:00Z" }]);
      if (table === "profiles") return json([{ user_id: USER.id, display_name: "Mars" }]);
      if (path.startsWith("/realtime/")) return route.abort();
      return json(single ? fx.rows[table]?.[0] ?? null : Number(url.searchParams.get("offset") ?? 0) > 0 ? [] : fx.rows[table] ?? []);
    });
    await context.route("**/_serverFn/**", async (route) => {
      const name = serverFnName(route.request().url()); const d = dataOf(route.request().postData() ?? "{}");
      const json = (result) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, context: {} }) });
      log.serverFns.push({ name, data: d });
      const r = hooks.serverFn?.(name, d);
      if (r !== undefined) return json(r);
      if (/runCommand/.test(name)) { log.commands.push(d.command ?? d.envelope?.command ?? d); return json({ ok: true, changeId: `c${log.commands.length}`, affected: [], inverse: null, revisions: {} }); }
      if (/pumpProjectQueue/.test(name)) return json({ sent: 0 });
      if (/projectAiProviders|listTextChoices/.test(name)) return json({ providers: [], missing: false });
      if (/listStorySessions/.test(name)) return json({ ok: true, sessions: [] });
      if (/listStorySuggestions/.test(name)) return json({ ok: true, suggestions: [] });
      if (/listEntityAnalysis/.test(name)) return json({ rows: [] });
      return json({ ok: true, lock: null });
    });
  }

  const browserP = chromium.launch({ headless: true });
  async function run(label, path, fn, { lang = "nb", role = "owner", viewport = { width: 1280, height: 1800 }, signedIn = true } = {}) {
    log.commands = []; log.serverFns = []; log.rpcs = [];
    const browser = await browserP;
    const context = await browser.newContext({ viewport, colorScheme: "dark" });
    await mock(context, role);
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    try {
      await page.goto(base, { waitUntil: "domcontentloaded" });
      const exp = Math.floor(Date.now() / 1000) + 86400;
      await page.evaluate(([key, value, language, auth]) => {
        if (auth) localStorage.setItem(key, value);
        localStorage.setItem("animatic:lang", language);
      }, [`sb-${ref}-auth-token`, JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: USER }), lang, signedIn]);
      await page.goto(`${base}${path.replace("$P", P)}`, { waitUntil: "networkidle" });
      await fn(page);
      await page.screenshot({ path: `${out}/${label}.png` });
    } catch (e) {
      check(false, `${label}: ${(e && e.message) || e}`);
      await page.screenshot({ path: `${out}/${label}-feil.png` }).catch(() => {});
    } finally {
      check(errors.length === 0, `${label}: ingen sidefeil${errors.length ? ` (${errors[0]})` : ""}`);
      await context.close();
    }
  }
  async function done() {
    console.log(`RESULTAT ${pass} bestått, ${fail} feilet`);
    await (await browserP).close();
    process.exitCode = fail ? 1 : 0;
  }
  /** Vent til en dialog er lukket (ingen åpne dialoger). */
  async function dialogsClosed(page) {
    await page.waitForFunction(() => !document.querySelector('[role="dialog"][data-state="open"]'), null, { timeout: 5000 });
  }
  return { fx, P, log, check, run, done, dialogsClosed };
}
