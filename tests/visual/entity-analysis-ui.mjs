/** OG2: automatic recognition with the built-in AI (mocked analyzeScriptEntities/listEntityAnalysis); no paid calls.
 * ENV_FILE=… node tests/visual/entity-analysis-ui.mjs <baseUrl> <fixture.json> [out]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
const [base = "http://127.0.0.1:8080", fixturePath = "/tmp/claude-0/visual-fixture.json", out = "/tmp/claude-0/entity-analysis"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE, "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const USER = { id: "00000000-0000-7000-8000-a11ce0000001", email: "mars@example.no", aud: "authenticated", role: "authenticated" };
const P = `/prosjekt/${fx.project.id}`;
const action = fx.rows.script_blocks.find((b) => b.kind === "action");
if (!action) throw new Error("Fixture needs an action block");
const rows = { ...fx.rows, script_blocks: fx.rows.script_blocks.map((b) => b.id === action.id ? { ...b, text: "Den gamle hesten Svarten vrinsker. Katten Måns mjauer. En nisse går inn." } : b) };
rows.script_block_revisions = fx.rows.script_block_revisions.map((revision) => {
  const block = rows.script_blocks.find((b) => b.id === revision.block_id && b.current_rev === revision.rev);
  return block ? { ...revision, text: block.text } : revision;
});
let commands = [], aiCalls = [], analysisRows = [];
const hashes = {}; // hashen er unit-testet; her er den bevisst ukjent
function serverFnName(url) {
  try {
    const b64 = new URL(url).pathname.split("/_serverFn/")[1];
    return JSON.parse(Buffer.from(decodeURIComponent(b64), "base64url").toString("utf8")).export;
  } catch {
    return "?";
  }
}
/** Dataene i et serverfunksjonskall (TanStack-serialisering: let etter «data»). */
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
    if (/runCommand/.test(name)) { commands.push(d.command ?? d.envelope?.command ?? d); return json({ ok: true, changeId: "mu1", affected: [], inverse: null, revisions: {} }); }
    if (/pumpProjectQueue/.test(name)) return json({ sent: 0 });
    if (/projectAiProviders|listTextChoices/.test(name)) return json({ providers: [], missing: false });
    if (/listStorySessions/.test(name)) return json({ ok: true, sessions: [] });
    if (/listStorySuggestions/.test(name)) return json({ ok: true, suggestions: [] });
    if (/listEntityAnalysis/.test(name)) return json({ rows: analysisRows });
    if (/analyzeScriptEntities/.test(name)) {
      aiCalls.push(d);
      await new Promise((r) => setTimeout(r, 400));
      analysisRows = (d.scope?.sceneIds ?? []).map((sceneId) => ({ sceneId, contentHash: hashes[sceneId] ?? "", items: [{ name: "Svarten", kind: "animal", confidence: "high", reason: "AI: horse" }] }));
      return json({ ok: true, analyzedScenes: analysisRows.length, remainingScenes: 0, newSuggestions: 12 });
    }
    if (/generateText/.test(name)) { aiCalls.push(d); return json({ ok: true, text: JSON.stringify({ items: [{ name: "Svarten", kind: "animal", confidence: "high", reason: "Horse description", aliasOf: "hest" }, { name: "INVENTED", kind: "object", confidence: "high", reason: "Ignore invented name" }] }), costUsd: 0.001, usedFallback: true, reason: "fallback", keyOwner: "lovable" }); }
    return json({ ok: true, lock: null });
  });
}
let pass = 0, fail = 0;
const check = (condition, description) => { console.log(`  ${condition ? "ok" : "FEIL"} ${description}`); condition ? pass++ : fail++; };
const browser = await chromium.launch({ headless: true });
async function main() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1800 }, colorScheme: "dark" });
  await mock(context);
  const page = await context.newPage(); const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  try {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const exp = Math.floor(Date.now() / 1000) + 86400;
    await page.evaluate(([key, value]) => { localStorage.setItem(key, value); localStorage.setItem("animatic:lang", "nb"); }, [`sb-${ref}-auth-token`, JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: USER })]);
    await page.goto(`${base}${P}/bibliotek`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    check(aiCalls.length >= 1, "ny prosjektlasting uten lagret analyse utløser analysen automatisk");
    check(Array.isArray(aiCalls[0]?.scope?.sceneIds), "analysen sender bare scene-ID-er, ingen fri tekst");
    check(!("system" in (aiCalls[0] ?? {})) && !("messages" in (aiCalls[0] ?? {})), "ingen prompt fra klienten");
    const button = page.getByRole("button", { name: /Forslag fra manuset/ }).first();
    check(/nye forslag|Analyserer manuset/.test(await button.innerText()), "status vises i forslagsknappen");
    await button.click();
    const dialog = page.getByTestId("library-suggestions");
    await dialog.waitFor();
    check(await dialog.getByTestId("library-suggestions-cost").count() === 0, "ingen kostnadsdialog");
    check(await dialog.getByTestId("library-suggestion").count() > 0, "forslagene vises");
    check(commands.length === 0, "ingen ressurser opprettes automatisk");
    check(errors.length === 0, "ingen kjørefeil");
  } catch (error) { fail++; console.log(`  FEIL main: ${String(error).split("\n")[0]}`); await page.screenshot({ path: `${out}/main-failed.png` }).catch(() => {}); }
  await context.close();
}
await main();
console.log(`RESULTAT ${pass} bestått, ${fail} feilet`);
await browser.close(); process.exitCode = fail ? 1 : 0;
