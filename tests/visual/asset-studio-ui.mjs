/** AS1–AS3: Asset Studio. Kontrollene er merket etter akseptansekriteriene i PHASE3_ASSET_STUDIO_DIFF.md G
 * (1–8 og 15). Fast oppsett: laget med ressurs får fire varianter med ett bilde hver, og scenen har en replikk
 * for karakteren og musikk. Mocker serverfunksjonene (ingenting lagres, ingen AI). Venter på at dialoger er
 * lukket før neste klikk.
 * ENV_FILE=… node tests/visual/asset-studio-ui.mjs <baseUrl> <fixture.json> [out]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
const [base = "http://127.0.0.1:8080", fixturePath = "/tmp/claude-0/visual-fixture.json", out = "/tmp/claude-0/asset-studio"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE, "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const USER = { id: "00000000-0000-7000-8000-a11ce0000001", email: "mars@example.no", aud: "authenticated", role: "authenticated" };
const P = `/prosjekt/${fx.project.id}`;
const COMP = fx.rows.compositions[0];
const OCC = fx.rows.scene_occurrences.find((o) => o.variant_id === COMP.variant_id);
const LAYER = fx.rows.composition_layers.find((l) => l.composition_id === COMP.id && l.kind !== "group" && l.asset_id);
const ASSET = fx.rows.assets.find((a) => a.id === LAYER.asset_id);
const V0 = fx.rows.asset_variants.find((v) => v.asset_id === ASSET.id);
const VER0 = fx.rows.asset_versions.find((v) => v.variant_id === V0.id);
// Fire varianter med ett bilde hver (kriterium 1)
const id = (n) => `00000000-0000-7000-8000-0000a5${String(n).padStart(6, "0")}`;
const VARIANTS = [1, 2, 3].map((i) => ({ ...V0, id: id(i), name: `Variant ${i + 1}`, approved_version_id: id(9 + i) }));
const VERSIONS = VARIANTS.map((v, i) => ({ ...VER0, id: id(10 + i), variant_id: v.id, number: 1, view: ["side", "back", "three_quarter"][i] }));
const TEMPLATE = fx.rows.audio_clips.find((a) => a.kind === "dialogue") ?? fx.rows.audio_clips[0];
const LINE = fx.rows.script_blocks.find((b) => b.variant_id === OCC.variant_id && b.kind === "dialogue");
const CHAR = fx.rows.script_blocks.find((b) => b.variant_id === OCC.variant_id && b.kind === "character" && b.order_key < LINE.order_key);
const clip = (cid, kind, name, offset_ms, block_id) => ({ ...TEMPLATE, id: cid, occurrence_id: OCC.id, kind, name, block_id, language: null, offset_ms, length_ms: 1000, source_in_ms: 0, removed: false, muted: false });
const DLG = id(20), MUSIC = id(21);
const rows = {
  ...fx.rows,
  // Karakterens navn er taleren i replikken (lydgrupper og manusmarkering)
  assets: fx.rows.assets.map((a) => (a.id === ASSET.id ? { ...a, kind: "character", name: CHAR ? CHAR.text : a.name } : a)),
  asset_variants: [...fx.rows.asset_variants, ...VARIANTS],
  asset_versions: [...fx.rows.asset_versions, ...VERSIONS],
  composition_layers: fx.rows.composition_layers.map((l) => (l.id === LAYER.id ? { ...l, image_swaps: [], locked: false, active_from: null, active_to: null, keyframes: [{ frame: 0, property: "x", value: 0, easing: "linear" }, { frame: 48, property: "x", value: 200, easing: "linear" }] } : l)),
  audio_clips: [...fx.rows.audio_clips.filter((a) => a.occurrence_id !== OCC.id), clip(DLG, "dialogue", "Replikk", 500, LINE?.id ?? null), clip(MUSIC, "music", "Musikk", 0, null)],
};
let commands = [];
/** Neste UpdateSceneDraft svarer med revisjonskonflikt (kriterium 15). */
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
      if (conflictNext && c?.type === "UpdateSceneDraft") { conflictNext = false; return json({ ok: false, code: "revision_conflict", message: "Noen andre har endret dette i mellomtiden" }); }
      return json({ ok: true, changeId: "as", affected: [], inverse: null, revisions: {} });
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
const browser = await chromium.launch({ headless: true });
const drafts = () => commands.filter((c) => c?.type === "UpdateSceneDraft");
const layerSteps = (cmd) => (cmd?.steps ?? []).filter((s) => s.type === "UpdateLayers").map((s) => s.layers.find((l) => l.layerId === LAYER.id)?.fields).filter(Boolean);
const lastLayer = (cmd) => layerSteps(cmd).at(-1);

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
  return { context, page, errors, studio: page.getByTestId("asset-studio") };
}

/** Åpner Asset Studio for laget via knappen i egenskapspanelet. */
async function openStudio(page, studio) {
  await page.locator(`[data-layer-row="${LAYER.id}"]`).first().click();
  await page.getByTestId("open-asset-studio").click();
  await studio.waitFor({ timeout: 5000 });
}
async function waitHidden(loc) { await loc.waitFor({ state: "hidden", timeout: 5000 }); }
/** Drar en miniatyr fra variantstripen til en posisjon (0–1) på segmentsporet. */
async function dropVersion(page, versionId, at) {
  const seg = page.getByTestId("asset-studio-segments");
  const box = await seg.boundingBox();
  await page.getByTestId("asset-studio-version").and(page.locator(`[data-version-id="${versionId}"]`)).dragTo(seg, { targetPosition: { x: box.width * at, y: box.height / 2 } });
  await page.waitForTimeout(150);
}
async function save(page, studio) {
  await page.getByTestId("asset-studio-save").click();
}

async function scenario(name, lang, fn) {
  commands = [];
  conflictNext = false;
  const { context, page, errors, studio } = await open(lang);
  try {
    await openStudio(page, studio);
    await fn(page, studio);
    check(errors.length === 0, `${name}: ingen kjørefeil (${errors.join(" | ").slice(0, 200)})`);
  } catch (error) { fail++; console.log(`  FEIL ${name}: ${String(error).split("\n")[0]}`); await page.screenshot({ path: `${out}/${name}-failed.png` }).catch(() => {}); }
  await context.close();
}

await scenario("skall", "nb", async (page, studio) => {
  check(await studio.isVisible(), "knappen «Asset Studio» åpner studioet");
  for (const t of ["asset-studio-variants", "asset-studio-preview", "asset-studio-timeline", "asset-studio-properties", "asset-studio-script", "asset-studio-save", "asset-studio-cancel"])
    check(await page.getByTestId(t).count() > 0, `studioet har ${t}`);
  const before = commands.length;
  await page.getByTestId("asset-studio-range-clear").isVisible();
  await page.getByTestId("asset-studio-cancel").click();
  await waitHidden(studio);
  check(commands.length === before, "Avbryt med tomt utkast lukker uten spørsmål og sender ingenting");
  // Alt + dobbeltklikk åpner også studioet
  const canvas = page.locator("canvas").first();
  const b = await canvas.boundingBox();
  const view = await canvas.evaluate((el) => ({ x: Number(el.dataset.viewX), y: Number(el.dataset.viewY), zoom: Number(el.dataset.viewZoom) }));
  // The fixture's x key at frame zero is 0; y comes from the layer transform.
  await canvas.dblclick({ position: { x: view.x, y: view.y + LAYER.transform.y * view.zoom }, modifiers: ["Alt"] });
  await page.waitForTimeout(300);
  check(await studio.count() > 0, "Alt + dobbeltklikk på laget åpner Asset Studio");
});

await scenario("kriterium-1-2", "nb", async (page, studio) => {
  check(await page.getByTestId("asset-studio-version").count() >= 4, "1: variantstripen viser bildene fra alle fire variantene");
  check(await page.getByTestId("asset-studio-version-view").count() >= 3, "1: miniatyrene er merket med vinkel");
  await dropVersion(page, VERSIONS[0].id, 0.25);
  await dropVersion(page, VERSIONS[1].id, 0.5);
  await dropVersion(page, VERSIONS[2].id, 0.75);
  check(await page.getByTestId("asset-studio-segment").count() === 4, "1: fire bildesegmenter på objektets tidslinje");
  check(commands.length === 0, "B5: ingenting sendes før «Oppdater scenen og lukk»");
  // Krysstoning på segment 2
  await page.getByTestId("asset-studio-segment").nth(1).click();
  await page.getByTestId("asset-studio-transition").selectOption("crossfade");
  await save(page, studio);
  await waitHidden(studio);
  const cmd = drafts().at(-1);
  const f = lastLayer(cmd);
  check(drafts().length === 1, "én UpdateSceneDraft sendes");
  check(f?.swaps?.length === 3 && new Set(f.swaps.map((w) => w.assetId)).size === 1 && f.swaps[0].assetId === ASSET.id, "1: tre bildeskifter på det samme laget, med samme ressurs (ingen ny karakter)");
  check((cmd?.steps ?? []).every((s) => s.type !== "AddLayers"), "1: ingen nye lag");
  check(f?.keyframes?.length === 2, "2: nøkkelbildeanimasjonen er uendret gjennom byttene");
  check(f?.swaps?.some((w) => w.transition?.kind === "crossfade"), "2: krysstoning er lagret på bildeskiftet");
});

await scenario("kriterium-3", "nb", async (page, studio) => {
  const seg = page.getByTestId("asset-studio-range");
  const box = await seg.boundingBox();
  const end = page.getByTestId("asset-studio-range-end");
  const eb = await end.boundingBox();
  await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, eb.y + eb.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  await save(page, studio);
  await waitHidden(studio);
  const cmd = drafts().at(-1);
  const f = lastLayer(cmd);
  check(f?.activeRange && f.activeRange.to < f.activeRange.from + 1000 && f.activeRange.from === 0, "3: å dra i enden av tidsområdet gir aktivt område på laget");
  check((cmd?.steps ?? []).every((s) => s.type !== "UpdateComposition"), "3: scenens varighet endres ikke");
});

await scenario("kriterium-4", "nb", async (page, studio) => {
  check(await page.getByTestId("asset-studio-preview").getAttribute("data-mode") === "object", "4: «Bare objektet» er standard");
  await page.getByTestId("asset-studio-view-scene").click();
  check(await page.getByTestId("asset-studio-preview").getAttribute("data-mode") === "scene", "4: «Hele scenen» viser kameravisningen");
  await page.getByTestId("asset-studio-play-object").click();
  await page.getByTestId("asset-studio-play").click();
  await page.waitForTimeout(400);
  await page.getByTestId("asset-studio-play").click();
  check(true, "4: objektets område kan spilles av");
  await page.getByTestId("asset-studio-play-scene").click();
  check(await page.getByTestId("asset-studio-play-scene").getAttribute("aria-pressed") !== "false", "4: hele scenen kan velges som avspillingsområde");
});

await scenario("kriterium-5-6", "nb", async (page, studio) => {
  const scene = page.getByTestId("asset-studio-audio-scene");
  const own = page.getByTestId("asset-studio-audio-asset");
  check(/Musikk/.test(await scene.innerText()), "5: musikken står under «Scenens lyd»");
  check(/Replikk/.test(await own.innerText()) && !/Musikk/.test(await own.innerText()), "5: replikklyden står under karakterens lyd");
  await page.locator(`[data-testid="asset-studio-audio-preview-toggle"][data-clip-id="${MUSIC}"]`).uncheck();
  await page.getByTestId("asset-studio-cancel").click();
  await waitHidden(studio);
  check(commands.length === 0, "6: demping for forhåndslytting endrer ikke den lagrede scenen (ingen spørsmål, ingenting sendt)");
  // Lagre demping eksplisitt
  await openStudio(page, studio);
  await page.locator(`[data-testid="asset-studio-audio-preview-toggle"][data-clip-id="${MUSIC}"]`).uncheck();
  await page.getByTestId("asset-studio-save-mute").click();
  await save(page, studio);
  await waitHidden(studio);
  const st = (drafts().at(-1)?.steps ?? []).find((s) => s.type === "UpdateAudioClips");
  check(st?.clips?.length === 1 && st.clips[0].clipId === MUSIC && st.clips[0].fields.muted === true, "6: «Lagre demping i scenen» lagrer bare det valgte klippet");
});

await scenario("kriterium-7-8", "nb", async (page, studio) => {
  await dropVersion(page, VERSIONS[0].id, 0.5);
  // Forsøksvis manusredigering: lagres med en gang som notat
  const trial = page.getByTestId("asset-studio-trial-edit").first();
  await trial.click();
  await page.getByTestId("asset-studio-trial-suggestion").fill("En helt ny replikk");
  await page.getByTestId("asset-studio-trial-save").click();
  await waitHidden(page.getByTestId("asset-studio-trial-form"));
  const note = commands.find((c) => c?.type === "AddAnnotations");
  check(note?.annotations?.[0]?.kind === "trial_edit" && note.annotations[0].suggestedText === "En helt ny replikk", "8: forsøksvis manusendring sendes med en gang som notat med forslag");
  check(note?.annotations?.[0]?.quote?.length > 0, "8: notatet har originalteksten");
  check(!commands.some((c) => c?.type === "EditBlockText"), "8: manuset endres ikke");
  await page.getByTestId("asset-studio-cancel").click();
  const confirm = page.getByTestId("asset-studio-cancel-confirm");
  await confirm.waitFor();
  check(await confirm.isVisible(), "Avbryt med endringer spør først");
  await page.getByTestId("asset-studio-cancel-discard").click();
  await waitHidden(confirm);
  await waitHidden(studio);
  check(drafts().length === 0, "7: Avbryt sender ikke utkastet");
  check(commands.some((c) => c?.type === "AddAnnotations"), "7/8: notatet er beholdt etter Avbryt");
});

await scenario("tastatur", "nb", async (page, studio) => {
  await dropVersion(page, VERSIONS[1].id, 0.5);
  check(await page.getByTestId("asset-studio-segment").count() === 2, "segmentet er lagt til");
  await studio.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(100);
  check(await page.getByTestId("asset-studio-segment").count() === 1, "⌘/Ctrl + Z angrer i utkastet");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForTimeout(100);
  check(await page.getByTestId("asset-studio-segment").count() === 2, "⇧ + ⌘/Ctrl + Z gjør om i utkastet");
  check(commands.length === 0, "angre og gjør om i studioet sender ingenting");
  await page.getByTestId("asset-studio-images").click();
  const sub = page.getByRole("dialog").filter({ hasNot: page.getByTestId("asset-studio-save") }).last();
  await sub.waitFor();
  await page.keyboard.press("Escape");
  await waitHidden(sub);
  check(await studio.isVisible(), "Esc lukker underdialogen først, studioet blir stående");
  await page.keyboard.press("Escape");
  const confirm = page.getByTestId("asset-studio-cancel-confirm");
  await confirm.waitFor();
  check(await confirm.isVisible(), "Esc på studioet virker som Avbryt og spør når utkastet ikke er tomt");
});

await scenario("kriterium-15", "nb", async (page, studio) => {
  await dropVersion(page, VERSIONS[2].id, 0.5);
  conflictNext = true;
  await save(page, studio);
  const dlg = page.getByTestId("asset-studio-conflict");
  await dlg.waitFor({ timeout: 5000 });
  check(await dlg.isVisible(), "15: revisjonskonflikt viser konfliktdialogen");
  check(await studio.isVisible(), "15: studioet og utkastet blir stående (ingen stille overskriving)");
  await page.getByTestId("asset-studio-conflict-rebase").click();
  await waitHidden(dlg);
  check(await page.getByTestId("asset-studio-notice").isVisible(), "15: utkastet er lagt oppå og kan forhåndsvises før ny oppdatering");
  const n = drafts().length;
  await save(page, studio);
  await waitHidden(studio);
  check(drafts().length === n + 1, "15: ny oppdatering sendes først når brukeren trykker igjen");
});

await scenario("engelsk", "en", async (page, studio) => {
  const text = await studio.innerText();
  check(/Update the scene and close/.test(text) && /Cancel without updating the scene/.test(text) && /Object only/.test(text), "engelsk: knappene og visningene er på engelsk");
  check(!/Oppdater scenen og lukk|Bare objektet/.test(text), "engelsk: ingen norsk tekst i studioet");
});

console.log(`RESULTAT ${pass} bestått, ${fail} feilet`);
await browser.close(); process.exitCode = fail ? 1 : 0;
