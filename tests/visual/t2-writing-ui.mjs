/**
 * T2: AI-skrivehjelp i manuset. Fast fixture og mockede serverfunksjoner (scriptAssist gir faste svar,
 * ingen ekte AI, ingenting lagres).
 *   bun tests/visual/make-fixture.ts /tmp/claude-0/visual-fixture.json
 *   ENV_FILE=… node tests/visual/t2-writing-ui.mjs <baseUrl> /tmp/claude-0/visual-fixture.json [out]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { uiLang } from "./ui-lang.mjs";

const [base = "http://127.0.0.1:8080", fixturePath = "/tmp/claude-0/visual-fixture.json", out = "/tmp/claude-0/t2-writing"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE, "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const USER = { id: "00000000-0000-7000-8000-a11ce0000001", email: "mars@example.no", aud: "authenticated", role: "authenticated" };
const P = `/prosjekt/${fx.project.id}`;
const main = fx.rows.productions.find((p) => p.kind === "main");
const occurrences = fx.rows.scene_occurrences
  .filter((o) => o.production_id === main.id && o.active && (o.kind ?? "scene") === "scene")
  .sort((a, b) => a.order_key.localeCompare(b.order_key));
if (occurrences.length < 2) throw new Error("Fixture needs two active scenes");
const [FIRST, SECOND] = occurrences;
const variantOfBlock = (b) => b.scene_variant_id ?? b.variant_id;
const blocksOf = (occ) => fx.rows.script_blocks.filter((b) => variantOfBlock(b) === occ.variant_id && !b.removed).sort((a, b) => a.order_key.localeCompare(b.order_key));
const FIRST_BLOCKS = blocksOf(FIRST);
const ACTION = FIRST_BLOCKS.find((b) => b.kind === "action") ?? FIRST_BLOCKS[0];
const SECOND_BLOCK = blocksOf(SECOND)[0];
const CHAR_BLOCK = FIRST_BLOCKS.find((b) => b.kind === "character");
if (!ACTION || !SECOND_BLOCK) throw new Error("Fixture needs blocks in both scenes");
const REWRITTEN = "T2-OMSKREVET tekst fra mocken.";
const NODE_ID = "00000000-0000-7000-8000-c00000000t21".replace("t", "0");

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

/** Faste AI-svar per oppgave (samme JSON-form som promptene ber om). */
function reply(kind) {
  if (kind === "rewrite") return { blocks: [{ ref: "b1", text: REWRITTEN }] };
  if (kind === "polish") return { blocks: [{ ref: "b1", text: "T2-VASKET tekst." }] };
  if (kind === "translate") return { blocks: [{ ref: "b1", text: "T2 English draft one." }, { ref: "b2", text: "T2 English draft two." }] };
  if (kind === "next_line") return { line: "T2-REPLIKK fra mocken.", parenthetical: "lavt" };
  return { heading: { intExt: "EXT.", location: "Låven", time: "Natt" }, blocks: [{ kind: "action", text: "T2-SCENE: snøen faller." }] };
}

const S = { commands: [], assist: [] };
let rows = fx.rows;

async function mock(context) {
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
    if (table === "projects") return json(single ? fx.project : [{ ...fx.project, project_members: [{ user_id: USER.id, role: "owner" }] }]);
    if (table === "project_members") return json([{ user_id: USER.id, role: "owner", joined_at: "2026-10-08T10:00:00Z" }]);
    if (table === "profiles") return json([{ user_id: USER.id, display_name: "Mars" }]);
    if (path.startsWith("/rest/v1/rpc/")) return json(null);
    if (path.startsWith("/realtime/")) return route.abort();
    return json(single ? rows[table]?.[0] ?? null : Number(url.searchParams.get("offset") ?? 0) > 0 ? [] : rows[table] ?? []);
  });
  await context.route("**/_serverFn/**", async (route) => {
    const name = serverFnName(route.request().url()); const d = dataOf(route.request().postData() ?? "{}");
    const json = (result) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, context: {} }) });
    if (/scriptAssist/.test(name)) {
      const kind = d.request?.kind;
      S.assist.push(kind);
      return json({ ok: true, text: JSON.stringify(reply(kind)), provider: "anthropic", model: "mock-model", usage: { inputTokens: 100, outputTokens: 50 }, costUsd: 0.0012, usedFallback: false, reason: "chosen", keyOwner: "self", jobId: "00000000-0000-7000-8000-00000000j001".replace("j", "0") });
    }
    if (/runCommand/.test(name)) {
      S.commands.push(d.command ?? d);
      return json({ ok: true, changeId: "t2", affected: [], inverse: null, revisions: {} });
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
const check = (ok, text) => { console.log(`  ${ok ? "ok" : "FEIL"} ${text}`); ok ? pass++ : fail++; };
async function eventually(fn, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    try { if (await fn()) return true; } catch { /* prøv igjen */ }
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
}
const cmds = (type) => S.commands.filter((c) => c?.type === type);
const browser = await chromium.launch({ headless: true });

async function scenario(name, fn, { lang: askedLang = "nb", blokk = ACTION.id, nodes = [], mutate } = {}) {
  const lang = uiLang(askedLang); // UI_LANG=en kjører alle scenarioene på engelsk
  S.commands = []; S.assist = [];
  rows = { ...fx.rows, story_canvas_nodes: nodes };
  if (mutate) rows = mutate(rows);
  const context = await browser.newContext({ viewport: { width: 1280, height: 1800 }, colorScheme: "dark" });
  await mock(context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  try {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const exp = Math.floor(Date.now() / 1000) + 86400;
    await page.evaluate(([key, value, l]) => { localStorage.setItem(key, value); localStorage.setItem("animatic:lang", l); }, [`sb-${ref}-auth-token`, JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: USER }), lang]);
    const target = `${base}${P}/manus?scene=${FIRST.id}&blokk=${blokk}`;
    // Første lasting kan avbrytes mens dev-serveren bygger: prøv én gang til
    await page.goto(target, { waitUntil: "networkidle" }).catch(() => page.goto(target, { waitUntil: "networkidle" }));
    await page.waitForTimeout(2000);
    await fn(page);
    check(errors.length === 0, `${name}: ingen kjørefeil (${errors.join(" | ").slice(0, 200)})`);
  } catch (error) {
    fail++;
    console.log(`  FEIL ${name}: ${String(error).split("\n")[0]}`);
    await page.screenshot({ path: `${out}/${name}-failed.png` }).catch(() => {});
  }
  await context.close();
}

const tid = (page, id) => page.getByTestId(id);
const visible = (page, id) => tid(page, id).first().isVisible();
async function openAssist(page) {
  await tid(page, "script-tab-assist").click();
  await tid(page, "assist-panel").waitFor({ timeout: 5000 });
}
/** Første kall i økten: kostnadsbekreftelse vises; bekreft. */
async function confirmCost(page) {
  await tid(page, "assist-cost").waitFor({ timeout: 5000 });
  await tid(page, "assist-confirm").click();
}
async function rewrite(page, { confirm = true } = {}) {
  await openAssist(page);
  await tid(page, "assist-rewrite").click();
  if (confirm) await confirmCost(page);
  await tid(page, "assist-diff").waitFor({ timeout: 5000 });
}

// 1. Kostnadsbekreftelse + Skriv om → diff → Bruk
await scenario("rewrite-apply", async (page) => {
  await openAssist(page);
  check(await tid(page, "assist-target-count").isVisible(), "skrivehjelpen viser antall valgte linjer");
  await tid(page, "assist-rewrite").click();
  check(await eventually(() => visible(page, "assist-cost")), "kostnadsbekreftelse vises ved første kall");
  check(S.assist.length === 0, "ingen AI-kall før bekreftelse");
  await tid(page, "assist-confirm").click();
  check(await eventually(() => visible(page, "assist-diff")), "diff vises etter svaret");
  check(S.assist.length === 1 && S.assist[0] === "rewrite", "ett scriptAssist-kall med kind=rewrite");
  const diffText = await tid(page, "assist-diff").innerText();
  check(diffText.includes("T2-OMSKREVET"), "diff viser ny tekst");
  check(await visible(page, "assist-total"), "løpende sum vises");
  check(S.commands.length === 0, "ingenting skrevet før «Bruk»");
  await tid(page, "assist-apply").click();
  check(await eventually(() => cmds("EditBlockText").length === 1), "«Bruk» sender én EditBlockText");
  const e = cmds("EditBlockText")[0];
  check(e?.blockId === ACTION.id && e?.text === REWRITTEN, "EditBlockText gjelder valgt linje med ny tekst");
  check(S.commands.length === 1, "ingen andre kommandoer");
  check(await eventually(async () => !(await visible(page, "assist-diff"))), "forslaget lukkes etter «Bruk»");
  // Andre kall i økten: ingen ny kostnadsbekreftelse
  await tid(page, "assist-polish").click();
  check(await eventually(() => S.assist.length === 2), "andre kall går uten ny bekreftelse");
  check(!(await visible(page, "assist-cost")), "kostnadsbekreftelse vises ikke igjen");
});

// 2. Bruk valgte (oversettelse, to linjer → én), status uncertain
const FIRST_IDS = new Set(FIRST_BLOCKS.map((b) => b.id));
const untranslated = (r) => ({ ...r, translations: (r.translations ?? []).filter((t) => !FIRST_IDS.has(t.block_id)) });
await scenario("translate-selected", async (page) => {
  // Marker to linjer og bruk høyreklikkmenyen (menyen tar med de markerte linjene)
  const [a, b] = FIRST_BLOCKS.filter((x) => x.kind === "action" || x.kind === "dialogue").map((x) => x.id);
  await page.evaluate(([a, b]) => {
    const ea = document.querySelector(`[data-block="${a}"]`); const eb = document.querySelector(`[data-block="${b}"]`);
    const r = document.createRange(); r.setStartBefore(ea); r.setEndAfter(eb);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    const box = ea.getBoundingClientRect();
    ea.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: box.x + 5, clientY: box.y + 5 }));
  }, [a, b]);
  await tid(page, "assist-context-menu").waitFor({ timeout: 5000 });
  await tid(page, "assist-menu-translate").click();
  await confirmCost(page);
  check(await eventually(() => visible(page, "assist-diff")), "oversettelsesforslag vises");
  const picks = tid(page, "assist-diff-pick");
  const n = await picks.count();
  check(n >= 2, `forslaget har flere linjer (${n})`);
  await picks.nth(1).uncheck();
  await tid(page, "assist-apply-selected").click();
  check(await eventually(() => cmds("AddTranslations").length === 1), "«Bruk valgte» sender én AddTranslations");
  const items = cmds("AddTranslations")[0]?.items ?? [];
  check(items.length === n - 1, "bare de valgte linjene kommer med");
  check(items.every((i) => i.fields.status === "uncertain" && i.fields.language === "en"), "oversettelsen lagres som uncertain på engelsk");
  check(cmds("EditBlockText").length === 0, "norsk tekst endres ikke");
}, { mutate: untranslated });

// 3. Lagre som forsøksvis redigering
await scenario("trial-edit", async (page) => {
  await rewrite(page);
  await tid(page, "assist-trial").click();
  check(await eventually(() => S.commands.length > 0), "lagring sender kommando");
  check(JSON.stringify(S.commands).includes("trial_edit"), "notatet er av typen trial_edit");
  check(cmds("EditBlockText").length === 0, "manusteksten endres ikke");
});

// 4. Forkast
await scenario("discard", async (page) => {
  await rewrite(page);
  await tid(page, "assist-discard").click();
  check(await eventually(async () => !(await visible(page, "assist-diff"))), "forslaget forsvinner");
  await page.waitForTimeout(300);
  check(S.commands.length === 0, "«Forkast» sender ingen kommando");
});

// 5. Konflikt: linjen endres før «Bruk»
await scenario("conflict", async (page) => {
  await rewrite(page);
  // Linjen endres i inspektøren mens forslaget ligger i panelet
  await tid(page, "script-tab-inspector").click();
  const editor = page.getByRole("textbox", { name: /^(Tekst|Text)$/ }).first();
  await editor.waitFor({ timeout: 5000 });
  await editor.fill(`${ACTION.text} endret`);
  await editor.press("Control+Enter");
  await tid(page, "script-tab-assist").click();
  check(await eventually(() => cmds("EditBlockText").length === 1), "linjen er endret i manuset");
  check(await eventually(() => visible(page, "assist-conflict-note")), "konflikt vises");
  check(await tid(page, "assist-apply").isDisabled(), "«Bruk» er sperret ved konflikt");
  check(cmds("EditBlockText").length === 1, "forslaget er ikke skrevet");
});

// 6. Neste replikk
await scenario("next-line", async (page) => {
  await openAssist(page);
  await tid(page, "assist-next-line").click();
  await confirmCost(page);
  check(await eventually(() => visible(page, "assist-diff")), "replikkforslag vises");
  check(S.assist[0] === "next_line", "kind=next_line");
  await tid(page, "assist-apply").click();
  check(await eventually(() => cmds("InsertBlock").length >= 3), "«Bruk» setter inn karakter, parentes og replikk");
  const kinds = cmds("InsertBlock").slice().sort((a, b) => a.block.orderKey.localeCompare(b.block.orderKey)).map((c) => c.block.kind);
  check(JSON.stringify(kinds) === JSON.stringify(["character", "parenthetical", "dialogue"]), "rekkefølge karakter → parentes → replikk ut fra orderKey");
});

// 7. Scene fra node, med advarsel når noden er brukt
const sceneNode = { id: NODE_ID, revision: 1, project_id: fx.project.id, kind: "scene", title: "EXT. LÅVEN - NATT", body: "Snøen faller", x: 0, y: 0, w: 220, h: 120, color: null, group_id: null, asset_id: null, scene_id: FIRST.scene_id, removed: false };
await scenario("scene-from-node", async (page) => {
  await openAssist(page);
  await tid(page, "assist-scene-node").selectOption(NODE_ID);
  check(await eventually(() => visible(page, "assist-node-used")), "advarsel: noden er allerede brukt");
  await tid(page, "assist-scene").click();
  await page.waitForTimeout(300);
  check(S.assist.length === 0 && !(await visible(page, "assist-cost")), "uten bekreftelse lages ingen ny scene");
  await tid(page, "assist-node-confirm").check();
  await tid(page, "assist-scene").click();
  await confirmCost(page);
  check(await eventually(() => visible(page, "assist-diff")), "sceneforslag vises");
  await tid(page, "assist-apply").click();
  check(await eventually(() => cmds("CreateScene").length === 1), "«Bruk» lager én ny scene");
  check(!S.commands.some((c) => /Variant/.test(c?.type ?? "")), "ingen scenevariant lages");
  check(!cmds("EditBlockText").length, "den eksisterende scenen endres ikke");
}, { nodes: [sceneNode] });

// 8. Formatsjekk uten AI-kall + Alt+Shift+F
const lower = (r) => CHAR_BLOCK ? { ...r, script_blocks: r.script_blocks.map((b) => b.id === CHAR_BLOCK.id ? { ...b, text: CHAR_BLOCK.text.toLowerCase() } : b) } : r;
await scenario("format", async (page) => {
  await openAssist(page);
  await tid(page, "assist-format").click();
  await page.waitForTimeout(500);
  check(S.assist.length === 0, "formatsjekken kaller ikke AI");
  check(!(await visible(page, "assist-cost")), "ingen kostnadsbekreftelse for formatsjekk");
  check(await eventually(() => visible(page, "assist-diff")), "formatfeilen vises som forslag");
  await tid(page, "assist-apply").click();
  check(await eventually(() => cmds("EditBlockText").length === 1), "«Bruk» retter formatet med EditBlockText");
}, { mutate: lower });

// 9. Hurtigtaster
await scenario("shortcuts", async (page) => {
  await page.locator(`[data-block="${ACTION.id}"]`).first().click();
  await page.keyboard.press("Alt+Shift+F");
  check(await eventually(() => visible(page, "assist-panel")), "Alt+Shift+F åpner skrivehjelpen");
  check(S.assist.length === 0, "Alt+Shift+F kaller ikke AI");
  check(await eventually(() => visible(page, "assist-diff")), "Alt+Shift+F viser formatforslaget");
  await tid(page, "assist-discard").click();
  await page.locator(`[data-block="${ACTION.id}"]`).first().click();
  await page.keyboard.press("Alt+Shift+R");
  check(await eventually(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "assist-instruction")), "Alt+Shift+R går til omskrivingsønsket");
  // I et tekstfelt virker ikke hurtigtastene
  await page.keyboard.press("Alt+Shift+N");
  await page.waitForTimeout(300);
  check(!(await visible(page, "assist-cost")), "hurtigtast virker ikke mens et tekstfelt har fokus");
  await page.locator(`[data-block="${ACTION.id}"]`).first().click();
  await page.keyboard.press("Alt+Shift+N");
  const okN = await eventually(() => visible(page, "assist-cost"));
  check(okN, "Alt+Shift+N starter neste replikk (kostnadsbekreftelse)");
}, { mutate: lower });

// 10. «Forkast forslaget?» ved bytte av scene
await scenario("leave-dialog", async (page) => {
  await rewrite(page);
  await page.locator(`[data-block="${SECOND_BLOCK.id}"]`).first().click();
  check(await eventually(() => visible(page, "assist-leave-dialog")), "spørsmålet «Forkast forslaget?» vises");
  check(await visible(page, "assist-leave-trial") && await visible(page, "assist-leave-discard") && await visible(page, "assist-leave-cancel"), "tre valg vises");
  await tid(page, "assist-leave-cancel").click();
  check(await eventually(async () => !(await visible(page, "assist-leave-dialog"))), "«Avbryt» lukker spørsmålet");
  check(await visible(page, "assist-diff"), "forslaget ligger der fortsatt");
  await page.locator(`[data-block="${SECOND_BLOCK.id}"]`).first().click();
  await tid(page, "assist-leave-discard").click();
  check(await eventually(async () => !(await visible(page, "assist-diff"))), "«Forkast» fjerner forslaget");
  check(S.commands.length === 0, "ingen kommando ved forkasting");
});

// 11. Engelsk visning
await scenario("english", async (page) => {
  await openAssist(page);
  const tab = await tid(page, "script-tab-assist").innerText();
  check(/writing/i.test(tab), `fanen er på engelsk (${tab})`);
  await tid(page, "assist-rewrite").click();
  await tid(page, "assist-cost").waitFor({ timeout: 5000 });
  const cost = await tid(page, "assist-cost").innerText();
  check(!/[æøå]/i.test(cost), "kostnadsbekreftelsen er på engelsk");
  await tid(page, "assist-confirm").click();
  await tid(page, "assist-diff").waitFor({ timeout: 5000 });
  const actions = await tid(page, "assist-proposal").innerText();
  check(/Use/.test(actions) && /Discard/.test(actions), "knappene er på engelsk");
  await page.screenshot({ path: `${out}/english.png` });
}, { lang: "en" });

await browser.close();
console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
process.exit(fail ? 1 : 0);
