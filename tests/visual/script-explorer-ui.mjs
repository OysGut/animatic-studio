/** MU1: deterministic fixture and mocked services. No real AI calls or project writes.
 * ENV_FILE=… node tests/visual/script-explorer-ui.mjs <baseUrl> <fixture.json> [out]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
const [base = "http://127.0.0.1:8080", fixturePath = "/tmp/claude-0/visual-fixture.json", out = "/tmp/claude-0/script-explorer"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE, "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const USER = { id: "00000000-0000-7000-8000-a11ce0000001", email: "mars@example.no", aud: "authenticated", role: "authenticated" };
const P = `/prosjekt/${fx.project.id}`;
const main = fx.rows.productions.find((p) => p.kind === "main");
const occurrences = fx.rows.scene_occurrences.filter((o) => o.production_id === main.id && o.active).sort((a, b) => a.order_key.localeCompare(b.order_key));
if (occurrences.length < 2) throw new Error("Fixture needs two active scenes");
const [FIRST, SECOND] = occurrences;
const variantOfBlock = (b) => b.scene_variant_id ?? b.variant_id;
const FIRST_BLOCKS = fx.rows.script_blocks.filter((b) => variantOfBlock(b) === FIRST.variant_id && !b.removed).sort((a, b) => a.order_key.localeCompare(b.order_key));
const SECOND_BLOCKS = fx.rows.script_blocks.filter((b) => variantOfBlock(b) === SECOND.variant_id && !b.removed).sort((a, b) => a.order_key.localeCompare(b.order_key));
const TOKEN = "MU1-SØKEORD";
const SECOND_BLOCK = SECOND_BLOCKS.find((b) => b.kind === "action") ?? SECOND_BLOCKS[0];
const FIRST_CHARACTER = FIRST_BLOCKS.find((b) => b.kind === "character");
if (!SECOND_BLOCK || !FIRST_CHARACTER) throw new Error("Fixture needs action and character blocks");
const CHARACTER = FIRST_CHARACTER.text.replace(/\s*\([^)]*\)/g, "").trim().toUpperCase();
const rows = { ...fx.rows, script_blocks: fx.rows.script_blocks.map((b) => b.id === SECOND_BLOCK.id ? { ...b, text: `${TOKEN}. ${CHARACTER} kommer inn.` } : variantOfBlock(b) === SECOND.variant_id && b.kind === "character" ? { ...b, text: "MU1-ANNEN" } : b) };
rows.script_block_revisions = fx.rows.script_block_revisions.map((revision) => {
  const block = rows.script_blocks.find((b) => b.id === revision.block_id && b.current_rev === revision.rev);
  return block ? { ...revision, text: block.text } : revision;
});
let commands = [];
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
    if (table === "schema_version") return json([{ version: 40 }]);
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
    if (/generateText/.test(name)) throw new Error("MU1 must never call AI");
    return json({ ok: true, lock: null });
  });
}
let pass = 0, fail = 0;
const check = (condition, description) => { console.log(`  ${condition ? "ok" : "FEIL"} ${description}`); condition ? pass++ : fail++; };
const browser = await chromium.launch({ headless: true });
async function run(label, fn, { lang = "nb", role = "owner" } = {}) {
  commands = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 1800 }, colorScheme: "dark" });
  await mock(context, role);
  const page = await context.newPage(); const errors = [];
  context.on("page", (p) => p.on("pageerror", (e) => errors.push(String(e))));
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const exp = Math.floor(Date.now() / 1000) + 86400;
    await page.evaluate(([key, value, language]) => { localStorage.setItem(key, value); localStorage.setItem("animatic:lang", language); }, [`sb-${ref}-auth-token`, JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: USER }), lang]);
    await page.goto(`${base}${P}/scene?scene=${FIRST.id}`, { waitUntil: "networkidle" });
    await page.getByTestId("script-explorer-button").waitFor();
    await fn(page, context);
    check(errors.length === 0, `${label}: ingen kjørefeil`);
  } catch (error) { fail++; console.log(`  FEIL ${label}: ${String(error).split("\n")[0]}`); await page.screenshot({ path: `${out}/${label}-failed.png` }).catch(() => {}); }
  await context.close();
}
const currentScene = (page) => page.getByRole("button", { name: /^(Velg scene|Choose scene)/ }).first();
const pick = async (page, index) => { await currentScene(page).click(); await page.getByRole("option").nth(index).click(); };
const status = (page) => page.getByTestId("script-explorer-status");
const waitScene = async (page, scene) => {
  const variant = fx.rows.scene_variants.find((v) => v.id === scene.variant_id);
  const location = variant.heading_location;
  await status(page).filter({ hasText: location }).waitFor();
};
await run("popup-search-pin", async (page, context) => {
  await page.getByTestId("script-explorer-button").click();
  const explorer = page.getByTestId("script-explorer"); await explorer.waitFor();
  check(await explorer.getAttribute("aria-modal") === "false", "A: globus åpner ikke-modal popup");
  const rect = await explorer.boundingBox();
  check(rect?.width === 560 && rect?.height === 760 && rect?.x === 704 && rect?.y === 76, "popupstandard: 560 × 760, 16 px fra høyre og under prosjektfanene");
  await page.setViewportSize({ width: 640, height: 600 });
  const resized = await explorer.boundingBox();
  check(resized && resized.x >= 0 && resized.y >= 0 && resized.x + resized.width <= 640 && resized.y + resized.height <= 600 && resized.height === 460, "popupen holdes innenfor vinduet ved størrelsesendring");
  await page.setViewportSize({ width: 1280, height: 1800 });
  await waitScene(page, FIRST);
  await pick(page, 1); await waitScene(page, SECOND);
  check(await status(page).getAttribute("data-mode") === "follow", "B: scenebytte følges uten å fange fokus");
  await pick(page, 0); await waitScene(page, FIRST);
  const beforeUrl = page.url(), beforeScene = await currentScene(page).getAttribute("aria-label");
  await explorer.getByTestId("script-explorer-search").fill(TOKEN);
  const hit = explorer.getByTestId("script-explorer-hit").filter({ hasText: TOKEN }).first();
  await hit.locator("summary").click();
  check(await hit.getByTestId("script-explorer-context").isVisible(), "utvidet kontekst er synlig");
  check(await hit.getByTestId("script-explorer-context").locator("[data-block-id]").count() === Math.min(SECOND_BLOCKS.length, SECOND_BLOCKS.indexOf(SECOND_BLOCK) + 3), "kontekst viser inntil to blokker på hver side");
  await hit.getByRole("button", { name: "Åpne", exact: true }).click();
  await waitScene(page, SECOND);
  check(page.url() === beforeUrl && await currentScene(page).getAttribute("aria-label") === beforeScene, "C: søket endrer ikke hovededitorens URL eller scene");
  check(await explorer.locator(`[data-block="${SECOND_BLOCK.id}"] mark`).count() > 0, "treffordet markeres i originaltypografien");
  await explorer.getByTestId("script-explorer-back").click(); await waitScene(page, FIRST);
  check(await status(page).getAttribute("data-mode") === "follow", "Tilbake til aktiv scene gjenopptar følging");
  await explorer.getByTestId("script-explorer-search").fill("");
  await explorer.getByTestId("script-explorer-character").selectOption(CHARACTER);
  check(await explorer.getByText("Deltar", { exact: true }).isVisible() && await explorer.getByText("Omtales", { exact: true }).isVisible(), "karakteroversikt har Deltar og Omtales");
  check(await explorer.getByTestId("script-explorer-hit").filter({ hasText: TOKEN }).count() > 0, "omtale fra annen scene finnes");
  await explorer.getByTestId("script-explorer-character").selectOption("");
  await explorer.getByTestId("script-explorer-search").fill(TOKEN);
  const chosen = explorer.getByTestId("script-explorer-hit").first(); await chosen.locator("summary").click(); await chosen.getByRole("button", { name: "Åpne", exact: true }).click();
  const popupPromise = page.waitForEvent("popup"); await explorer.getByTestId("script-explorer-pin").click();
  const pinned = await popupPromise; await pinned.getByTestId("script-explorer-status").waitFor();
  const url = new URL(pinned.url());
  check(url.searchParams.get("q") === TOKEN && url.searchParams.get("scene") === SECOND.id && url.searchParams.get("blokk") === SECOND_BLOCK.id, "D: festet vindu bevarer søk og valgt treff");
  check(url.searchParams.get("modus") === "search" && !!url.searchParams.get("kilde"), "Fest bevarer modus og kildevindu");
  check(await page.getByTestId("script-explorer").count() === 0, "popupen lukkes når vinduet er åpnet");
  await pinned.getByTestId("script-explorer-back").click(); await waitScene(pinned, FIRST);
  await pick(page, 1); await waitScene(pinned, SECOND);
  check(await status(pinned).getAttribute("data-mode") === "follow", "E: festet vindu følger hovedvinduets scenebytte");
  await page.getByTestId("script-explorer-button").click();
  const sameWindowCount = context.pages().length;
  await page.getByTestId("script-explorer-pin").click();
  await pinned.waitForLoadState("domcontentloaded");
  check(context.pages().length === sameWindowCount, "Fest gjenbruker eksisterende vindu");
  await pinned.close();
  await page.getByTestId("script-explorer-button").click();
  const editorBefore = await currentScene(page).getAttribute("aria-label");
  await page.getByTestId("script-explorer-close").click();
  check(await page.getByTestId("script-explorer").count() === 0 && await currentScene(page).getAttribute("aria-label") === editorBefore, "F: X lukker uten å endre editoren");
  await page.keyboard.press("Control+Shift+F"); await page.getByTestId("script-explorer").waitFor();
  await page.keyboard.press("Escape");
  check(await page.getByTestId("script-explorer").count() === 0, "snarvei åpner og Esc lukker popupen");
});
await run("notes", async (page) => {
  await page.getByTestId("script-explorer-button").click();
  const explorer = page.getByTestId("script-explorer"); await waitScene(page, FIRST);
  const block = FIRST_BLOCKS.find((b) => b.kind === "action") ?? FIRST_BLOCKS[0];
  await explorer.locator(`[data-block="${block.id}"]`).first().click();
  await explorer.getByTestId("script-explorer-note").getByRole("button", { name: "Legg til notat", exact: true }).click();
  await explorer.getByTestId("script-explorer-note").getByRole("textbox").fill("MU1 notat uten manusendring");
  await explorer.getByRole("button", { name: "Lagre notat", exact: true }).click();
  await page.waitForTimeout(700);
  const note = commands.find((c) => c.type === "AddAnnotations");
  check(note?.annotations[0]?.blockId === block.id && note.annotations[0].quote === "" && note.annotations[0].start === 0 && note.annotations[0].end === 0, "notatet lagres på valgt blokk med samme felt som manuset");
  check(commands.length > 0 && commands.every((c) => c.type === "AddAnnotations"), "ingen redigeringskommando sendes");
  await page.screenshot({ path: `${out}/notes.png` });
});
await run("english", async (page) => {
  await page.getByTestId("script-explorer-button").click();
  const explorer = page.getByTestId("script-explorer");
  check(await explorer.getByTestId("script-explorer-pin").innerText() === "Pin", "engelsk Fest");
  check((await status(page).innerText()).includes("Follow active scene"), "engelsk status");
  await explorer.getByTestId("script-explorer-character").selectOption(CHARACTER);
  check(await explorer.getByText("Participates", { exact: true }).isVisible() && await explorer.getByText("Mentioned", { exact: true }).isVisible(), "engelsk karakteroversikt");
}, { lang: "en" });
await run("viewer", async (page) => {
  await page.getByTestId("script-explorer-button").click(); await waitScene(page, FIRST);
  check(await page.getByTestId("script-explorer-note").count() === 0, "lesetilgang gir ingen notatknapp");
}, { role: "viewer" });
console.log(`RESULTAT ${pass} bestått, ${fail} feilet`);
await browser.close();
process.exitCode = fail ? 1 : 0;
