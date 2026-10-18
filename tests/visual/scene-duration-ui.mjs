/** SV1 (B-041): «Endre scenevarighet» i sceneeditoren – metodevalg uten standard, fyll, rapport, forhåndsspill,
 * for lite tid, dra i sluttpunktet, låste tidsrom, revisjonskonflikt med «Beregn på nytt», og engelsk visning.
 * Mocker serverfunksjonene (ingenting lagres, ingen AI). Stegene G–L og 13–15 er merket i loggen.
 * ENV_FILE=… node tests/visual/scene-duration-ui.mjs <baseUrl> <fixture.json> [out]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
const [base = "http://127.0.0.1:8080", fixturePath = "/tmp/claude-0/visual-fixture.json", out = "/tmp/claude-0/scene-duration"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE, "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const USER = { id: "00000000-0000-7000-8000-a11ce0000001", email: "mars@example.no", aud: "authenticated", role: "authenticated" };
const P = `/prosjekt/${fx.project.id}`;
const rows = { ...fx.rows };
let commands = [], aiCalls = [], analysisRows = [];
const hashes = {};
/** Neste runCommand svarer med revisjonskonflikt (test 15). */
let conflictNext = false;
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
    if (/runCommand/.test(name)) {
      const c = d.command ?? d.envelope?.command ?? d;
      commands.push(c);
      if (conflictNext && c?.type === "RetimeScene") { conflictNext = false; return json({ ok: false, code: "revision_conflict", message: "Noen andre har endret dette i mellomtiden" }); }
      return json({ ok: true, changeId: "sv1", affected: [], inverse: null, revisions: {} });
    }
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
const retimes = () => commands.filter((c) => c?.type === "RetimeScene");

async function open(lang) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1800 }, colorScheme: "dark" });
  await mock(context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const exp = Math.floor(Date.now() / 1000) + 86400;
  await page.evaluate(([key, value, l]) => { localStorage.setItem(key, value); localStorage.setItem("animatic:lang", l); }, [`sb-${ref}-auth-token`, JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: USER }), lang]);
  await page.goto(`${base}${P}/scene`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  return { context, page, errors };
}

async function setDuration(page, seconds) {
  const field = page.getByRole("spinbutton", { name: /Varighet \(s\)|Duration \(s\)/ });
  await field.click();
  await field.fill(String(seconds));
  await field.press("Enter");
}

async function norwegian() {
  const { context, page, errors } = await open("nb");
  try {
    const dialog = page.getByTestId("retime-dialog");
    // G: feltet «Varighet» åpner dialogen i stedet for å endre lengden stille
    const before = commands.length;
    await setDuration(page, 20);
    await dialog.waitFor({ timeout: 5000 });
    check(commands.length === before, "G: varighetsfeltet åpner dialogen og lagrer ingenting");
    // H: ingen metode er valgt på forhånd, Bruk er av
    const checked = await dialog.locator("[data-testid^=retime-method-]:checked").count();
    check(checked === 0, "H: ingen metode er forhåndsvalgt");
    check(await dialog.getByTestId("retime-apply").isDisabled(), "H: Bruk er av til metoden er valgt");
    // I: Slutt ved forlengelse krever fyll (ingen standard)
    await dialog.getByTestId("retime-method-end").check();
    check(await dialog.getByTestId("retime-fill").isVisible(), "I: fyll vises for Slutt ved forlengelse");
    check(await dialog.locator("[data-testid^=retime-fill-]:checked").count() === 0, "I: ingen fyll er forhåndsvalgt");
    check(await dialog.getByTestId("retime-keep-ambience").isChecked(), "I: «la atmosfære og musikk fortsette» er avkrysset");
    check(await dialog.getByTestId("retime-apply").isDisabled(), "I: Bruk er av til fyll er valgt");
    await dialog.getByTestId("retime-fill-black").check();
    // J: rapport, før/etter-stripe og forhåndsspill
    await dialog.getByTestId("retime-report").waitFor();
    check(/Fra .* s til 20 s/.test(await dialog.getByTestId("retime-report").innerText()), "J: rapporten viser før og etter i klartekst");
    check(await dialog.getByTestId("retime-strip-before").count() === 1 && await dialog.getByTestId("retime-strip-after").count() === 1, "J: før/etter-stripen vises");
    const sent = commands.length;
    await dialog.getByTestId("retime-preview-play").click();
    await page.waitForTimeout(400);
    check(commands.length === sent, "J: forhåndsspill lagrer ingenting");
    // K: Bruk sender én RetimeScene
    await dialog.getByTestId("retime-apply").click();
    await dialog.waitFor({ state: "hidden", timeout: 5000 });
    check(retimes().length === 1, "K: Bruk sender én samlet RetimeScene");
    const step = retimes()[0]?.steps?.find((s) => s.type === "UpdateComposition");
    check(step?.timing?.padding?.end?.fill === "black", "K: fyllet lagres i kommandoen");
    // L: Avbryt endrer ingenting
    await setDuration(page, 10);
    await dialog.waitFor();
    await dialog.getByTestId("retime-method-stretch_visual").check();
    const n = commands.length;
    await dialog.getByTestId("retime-cancel").click();
    await dialog.waitFor({ state: "hidden" });
    check(commands.length === n, "L: Avbryt endrer ingenting");
    // 13: for lite fleksibel tid gir forklaring, ingen Bruk
    await setDuration(page, 1);
    await dialog.waitFor();
    await dialog.getByTestId("retime-method-pauses").check();
    const reason = dialog.getByTestId("retime-reason");
    const tooLittle = (await reason.count()) > 0;
    check(!tooLittle || await dialog.getByTestId("retime-apply").isDisabled(), "13: ok:false gir forklaring og Bruk er av");
    await dialog.getByTestId("retime-cancel").click();
    // 14: dra i sluttpunktet åpner dialogen med ny lengde
    const handle = page.getByTestId("scene-end-handle");
    const box = await handle.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x - 80, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
    }
    await dialog.waitFor({ timeout: 5000 });
    check(await dialog.isVisible(), "14: å dra i sluttpunktet åpner dialogen");
    await dialog.getByTestId("retime-cancel").click();
    // Låste tidsrom kan settes og fjernes i tidslinjen
    await page.getByTestId("lock-range-button").click();
    await page.waitForTimeout(300);
    const locked = commands.at(-1);
    check(locked?.type === "UpdateComposition" && locked?.timing?.lockedRanges?.length >= 1, "låst tidsrom lagres på 2D-scenen");
    // 15: revisjonskonflikt avviser hele kommandoen og tilbyr «Beregn på nytt»
    conflictNext = true;
    await setDuration(page, 30);
    await dialog.waitFor();
    await dialog.getByTestId("retime-method-stretch_visual").check();
    await dialog.getByTestId("retime-apply").click();
    await dialog.getByTestId("retime-error").waitFor({ timeout: 8000 });
    check(await dialog.getByTestId("retime-recalculate").isVisible(), "15: konflikt gir «Beregn på nytt»");
    await dialog.getByTestId("retime-recalculate").click();
    check(await dialog.getByTestId("retime-apply").isEnabled(), "15: etter ny beregning kan Bruk trykkes igjen");
    await dialog.getByTestId("retime-cancel").click();
    // Egenskapspanelet har også inngangen
    const insp = page.getByTestId("inspector-change-duration");
    if (await insp.count()) {
      await insp.click();
      await dialog.waitFor();
      check(await dialog.isVisible(), "egenskapspanelet åpner dialogen");
      await dialog.getByTestId("retime-cancel").click();
    }
    check(errors.length === 0, `ingen kjørefeil (${errors.join(" | ").slice(0, 200)})`);
  } catch (error) { fail++; console.log(`  FEIL nb: ${String(error).split("\n")[0]}`); await page.screenshot({ path: `${out}/nb-failed.png` }).catch(() => {}); }
  await context.close();
}

async function english() {
  const { context, page, errors } = await open("en");
  try {
    await setDuration(page, 12);
    const dialog = page.getByTestId("retime-dialog");
    await dialog.waitFor({ timeout: 5000 });
    const text = await dialog.innerText();
    check(/Change scene duration/.test(text) && /Spread over the pauses/.test(text), "engelsk: tittel og metoder er på engelsk");
    check(!/Endre scenevarighet|Fordel på pausene/.test(text), "engelsk: ingen norsk tekst i dialogen");
    await dialog.getByTestId("retime-cancel").click();
    check(errors.length === 0, "engelsk: ingen kjørefeil");
  } catch (error) { fail++; console.log(`  FEIL en: ${String(error).split("\n")[0]}`); await page.screenshot({ path: `${out}/en-failed.png` }).catch(() => {}); }
  await context.close();
}

await norwegian();
await english();
console.log(`RESULTAT ${pass} bestått, ${fail} feilet`);
await browser.close(); process.exitCode = fail ? 1 : 0;
