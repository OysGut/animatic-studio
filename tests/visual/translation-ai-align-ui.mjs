/** OG2: English import gets built-in AI link suggestions that must be approved (mocked alignTranslationWithAi).
 * ENV_FILE=… node tests/visual/translation-ai-align-ui.mjs <baseUrl> <fixture.json> [out]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
const [base = "http://127.0.0.1:8080", fixturePath = "/tmp/claude-0/visual-fixture.json", out = "/tmp/claude-0/translation-ai-align"] = process.argv.slice(2);
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
let commands = [], aiCalls = [], alignCalls = [];
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
    if (/listEntityAnalysis/.test(name)) return json({ rows: [] });
    if (/alignTranslationWithAi/.test(name)) {
      alignCalls.push(d);
      const links = (d.items ?? []).filter((it) => it.candidateOccurrenceIds?.length).map((it) => ({ index: it.index, occurrenceId: it.candidateOccurrenceIds[0], confidence: "high", reason: "Same characters" }));
      return json({ ok: true, links });
    }
    if (/analyzeScriptEntities/.test(name)) { aiCalls.push(d); return json({ ok: true, analyzedScenes: 1, remainingScenes: 0, newSuggestions: 1 }); }
    if (/generateText/.test(name)) { aiCalls.push(d); return json({ ok: true, text: JSON.stringify({ items: [{ name: "Svarten", kind: "animal", confidence: "high", reason: "Horse description", aliasOf: "hest" }, { name: "INVENTED", kind: "object", confidence: "high", reason: "Ignore invented name" }] }), costUsd: 0.001, usedFallback: true, reason: "fallback", keyOwner: "lovable" }); }
    return json({ ok: true, lock: null });
  });
}
let pass = 0, fail = 0;
const check = (condition, description) => { console.log(`  ${condition ? "ok" : "FEIL"} ${description}`); condition ? pass++ : fail++; };
const browser = await chromium.launch({ headless: true });
import { writeFileSync } from "node:fs";
const fountain = `${out}/english.fountain`;
writeFileSync(fountain, "Title: Test\n\nINT. NOWHERE AT ALL - NIGHT\n\nSomething entirely different happens here.\n\nEXT. ANOTHER UNKNOWN PLACE - DAY\n\nA stranger walks by.\n");
async function main(lang) {
  alignCalls = []; commands = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 1800 }, colorScheme: "dark" });
  await mock(context);
  const page = await context.newPage(); const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  try {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const exp = Math.floor(Date.now() / 1000) + 86400;
    await page.evaluate(([key, value, l]) => { localStorage.setItem(key, value); localStorage.setItem("animatic:lang", l); }, [`sb-${ref}-auth-token`, JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: USER }), lang]);
    await page.goto(`${base}${P}/manus`, { waitUntil: "networkidle" });
    const langSelect = page.locator("select").filter({ has: page.locator('option[value="en"]') }).first();
    await langSelect.selectOption("en");
    // ML4: knappen ligger i «Mer»-menyen når verktøylinjen er smal
    if (!(await page.getByTestId("translation-import-open").first().isVisible())) await page.getByRole("button", { name: /^(Mer|More)/ }).first().click();
    await page.getByTestId("translation-import-open").first().click();
    const target = page.getByTestId("translation-import-target");
    await target.waitFor({ timeout: 5000 });
    check((await target.getAttribute("data-language")) === "en" && /\(en\)/.test(await target.innerText()), `${lang}: R8 dialogen viser valgt målspråk`);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Velg fil|Choose file/ }).click();
    await (await chooser).setFiles(fountain);
    await page.getByTestId("translation-ai-status").waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
    check(alignCalls.length === 1, `${lang}: AI-koblingen kjøres automatisk etter regelkoblingen`);
    check(alignCalls[0]?.items?.every((it) => it.lines.every((l) => l.length <= 300)), `${lang}: bare korte utdrag sendes`);
    const aiRows = page.locator('[data-testid="translation-link"][data-ai="true"]');
    check(await aiRows.count() > 0, `${lang}: AI-forslag vises i koblingslisten`);
    check(await aiRows.first().getByRole("checkbox").isChecked() === false, `${lang}: AI-forslag er ikke godkjent på forhånd`);
    check(/AI/.test(await aiRows.first().innerText()), `${lang}: AI-forslaget er merket`);
    check(commands.length === 0, `${lang}: ingenting lagres før brukeren lagrer`);
    check(errors.length === 0, `${lang}: ingen kjørefeil`);
  } catch (error) { fail++; console.log(`  FEIL ${lang}: ${String(error).split("\n")[0]}`); await page.screenshot({ path: `${out}/${lang}-failed.png` }).catch(() => {}); }
  await context.close();
}
await main("nb");
await main("en");
console.log(`RESULTAT ${pass} bestått, ${fail} feilet`);
await browser.close(); process.exitCode = fail ? 1 : 0;
