/** SV1 (B-041): «Endre scenevarighet» i sceneeditoren. Testene G–L følger PHASE3_ASSET_STUDIO_ADDENDUM.md §17
 * og 13–15 PHASE3_ASSET_STUDIO_DIFF.md. G–J og 13 kontrollerer innholdet i den sendte RetimeScene mot et fast
 * oppsett av scenen (nøkkelbilder, bildeskifte og lydklipp med pauser). Dra i sluttpunktet, låste tidsrom og
 * engelsk visning er egne kontroller. Mocker serverfunksjonene (ingenting lagres, ingen AI).
 * ENV_FILE=… node tests/visual/scene-duration-ui.mjs <baseUrl> <fixture.json> [out]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { uiLang } from "./ui-lang.mjs";
const [base = "http://127.0.0.1:8080", fixturePath = "/tmp/claude-0/visual-fixture.json", out = "/tmp/claude-0/scene-duration"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE, "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const USER = { id: "00000000-0000-7000-8000-a11ce0000001", email: "mars@example.no", aud: "authenticated", role: "authenticated" };
const P = `/prosjekt/${fx.project.id}`;
// ---------- Fast oppsett for scenen: 10 s, nøkkelbilder 1/5/9 s, bildeskifte 4 s, lyd med pauser ----------
const fpsNum = Number(fx.project.fps_num ?? fx.project.fps?.num ?? 24);
const fpsDen = Number(fx.project.fps_den ?? fx.project.fps?.den ?? 1);
const FPS = fpsNum / fpsDen;
const fr = (sec) => Math.round(sec * FPS);
const msOf = (frames) => Math.round((frames * 1000) / FPS);
const COMP = fx.rows.compositions[0];
const OCC = fx.rows.scene_occurrences.find((o) => o.variant_id === COMP.variant_id);
const BEFORE = fr(10);
const LAYER = fx.rows.composition_layers.find((l) => l.composition_id === COMP.id && l.kind !== "group" && l.asset_id);
const KEYS = [1, 5, 9].map((sec, i) => ({ frame: fr(sec), property: "x", value: 100 * i, easing: "linear" }));
const SWAP = { frame: fr(4), assetId: LAYER.asset_id, assetVariantId: LAYER.asset_variant_id ?? null, versionId: LAYER.version_id ?? null };
const TEMPLATE = fx.rows.audio_clips.find((a) => a.kind === "dialogue") ?? fx.rows.audio_clips[0];
const clip = (id, kind, name, offset_ms, length_ms) => ({ ...TEMPLATE, id, occurrence_id: OCC.id, kind, name, block_id: null, language: null, offset_ms, length_ms, source_in_ms: 0, removed: false });
const CLIPS = [
  clip("00000000-0000-7000-8000-0000005d0001", "dialogue", "Replikk A", 1000, 1000),
  clip("00000000-0000-7000-8000-0000005d0002", "sfx", "Bildeskifte-lyd", 4000, 500),
  clip("00000000-0000-7000-8000-0000005d0003", "dialogue", "Replikk C", 6000, 1000),
];
const SWAP_SOUND = CLIPS[1].id;
const rows = {
  ...fx.rows,
  compositions: fx.rows.compositions.map((c) => (c.id === COMP.id ? { ...c, duration_frames: BEFORE, timing: { lockedRanges: [], padding: { start: null, end: null } } } : c)),
  composition_layers: fx.rows.composition_layers.map((l) => (l.id === LAYER.id ? { ...l, keyframes: KEYS, image_swaps: [SWAP], motion_path: null } : l)),
  audio_clips: [...fx.rows.audio_clips.filter((a) => a.occurrence_id !== OCC.id), ...CLIPS],
  time_links: (fx.rows.time_links ?? []).filter((t) => t.occurrence_id !== OCC.id),
};
// R7: lydversjonene (DV2) til klippene som byttes ut over, ble liggende igjen uten klipp. Kjernen stopper da
// med rette alle lydklippendringer («Replikken har lydversjoner som ikke kan fjernes»), så G, I, J og 13 – som
// flytter lydklipp – fikk aldri lukket dialogen. Behold bare versjoner som har klippet sitt.
rows.dialogue_versions = (fx.rows.dialogue_versions ?? []).filter((v) => rows.audio_clips.some((a) => a.id === v.clip_id));
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
const stepOf = (cmd, type) => cmd?.steps?.find((s) => s.type === type);
const layerOf = (cmd) => stepOf(cmd, "UpdateLayers")?.layers?.find((l) => l.layerId === LAYER.id)?.fields;
const clipsOf = (cmd) => Object.fromEntries((stepOf(cmd, "UpdateAudioClips")?.clips ?? []).map((c) => [c.clipId, c.fields]));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

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
  return { context, page, errors, dialog: page.getByTestId("retime-dialog") };
}

async function setDuration(page, seconds) {
  const field = page.getByRole("spinbutton", { name: /Varighet \(s\)|Duration \(s\)/ });
  await field.click();
  await field.fill(String(seconds));
  await field.press("Enter");
}
async function cancel(dialog) {
  await dialog.getByTestId("retime-cancel").click();
  await dialog.waitFor({ state: "hidden" });
}
/** Åpner dialogen med ny lengde, velger metode (og fyll), og trykker Bruk. Gir den sendte RetimeScene. */
async function applyRetime(page, dialog, seconds, method, fill) {
  const n = retimes().length;
  await setDuration(page, seconds);
  await dialog.waitFor({ timeout: 5000 });
  await dialog.getByTestId(`retime-method-${method}`).check();
  if (fill) await dialog.getByTestId(`retime-fill-${fill}`).check();
  await dialog.getByTestId("retime-report").waitFor();
  const report = await dialog.getByTestId("retime-report").innerText();
  await dialog.getByTestId("retime-apply").click();
  await dialog.waitFor({ state: "hidden", timeout: 5000 });
  return { cmd: retimes().length > n ? retimes().at(-1) : null, report };
}

/** Kjører ett steg i en fersk side, så hvert steg starter fra det faste oppsettet. */
async function scenario(name, lang, fn) {
  const { context, page, errors, dialog } = await open(uiLang(lang));
  try {
    await fn(page, dialog);
    check(errors.length === 0, `${name}: ingen kjørefeil (${errors.join(" | ").slice(0, 200)})`);
  } catch (error) { fail++; console.log(`  FEIL ${name}: ${String(error).split("\n")[0]}`); await page.screenshot({ path: `${out}/${name}-failed.png` }).catch(() => {}); }
  await context.close();
}

// Metodevalg uten standard, fyll og rapport (forutsetning for G–L)
await scenario("valg", "nb", async (page, dialog) => {
  const before = commands.length;
  await setDuration(page, 12);
  await dialog.waitFor({ timeout: 5000 });
  check(commands.length === before, "varighetsfeltet åpner dialogen og lagrer ingenting");
  check(await dialog.locator("[data-testid^=retime-method-]:checked").count() === 0, "ingen metode er forhåndsvalgt");
  check(await dialog.getByTestId("retime-apply").isDisabled(), "Bruk er av til metoden er valgt");
  await dialog.getByTestId("retime-method-end").check();
  check(await dialog.getByTestId("retime-fill").isVisible(), "fyll vises for Slutt ved forlengelse");
  check(await dialog.locator("[data-testid^=retime-fill-]:checked").count() === 0, "ingen fyll er forhåndsvalgt");
  check(await dialog.getByTestId("retime-keep-ambience").isChecked(), "«la atmosfære og musikk fortsette» er avkrysset");
  check(await dialog.getByTestId("retime-apply").isDisabled(), "Bruk er av til fyll er valgt");
  await dialog.getByTestId("retime-fill-black").check();
  await dialog.getByTestId("retime-report").waitFor();
  check(/Fra .* s til 12 s/.test(await dialog.getByTestId("retime-report").innerText()), "rapporten viser før og etter i klartekst");
  check(await dialog.getByTestId("retime-strip-before").count() === 1 && await dialog.getByTestId("retime-strip-after").count() === 1, "før/etter-stripen vises");
  await cancel(dialog);
});

// G: forlengelse med tid i starten
await scenario("G", "nb", async (page, dialog) => {
  const { cmd } = await applyRetime(page, dialog, 12, "start", "black");
  const d = fr(12) - BEFORE;
  const comp = stepOf(cmd, "UpdateComposition");
  check(comp?.fields?.durationFrames === fr(12), "G: ny lengde er 12 s");
  const keys = layerOf(cmd)?.keyframes ?? [];
  check(keys.length === KEYS.length && KEYS.every((k) => keys.some((x) => x.frame === k.frame + d)), "G: alle nøkkelbilder er forskjøvet med differansen");
  const c = clipsOf(cmd);
  check(CLIPS.every((a) => c[a.id]?.offsetMs === a.offset_ms + msOf(d)), "G: alle lydstarter er forskjøvet med differansen");
  check(comp?.timing?.padding?.start?.fill === "black", "G: fyllet er satt i starten");
});

// H: forkorting ved å trimme slutten
await scenario("H", "nb", async (page, dialog) => {
  const { cmd, report } = await applyRetime(page, dialog, 8, "end");
  const keys = layerOf(cmd)?.keyframes ?? [];
  check(!keys.some((k) => k.frame >= fr(8)) && keys.length === KEYS.length - 1, "H: nøkkelbildet etter den nye slutten er trimmet");
  check(/trimmes eller fjernes|trimmed or removed/.test(report), "H: trimmingen står i rapporten");
  const removed = stepOf(cmd, "SetAudioClipsRemoved")?.clipIds ?? [];
  const c = clipsOf(cmd);
  const speech = CLIPS.filter((a) => a.kind === "dialogue");
  check(speech.every((a) => !removed.includes(a.id) && (c[a.id] === undefined || c[a.id].lengthMs === a.length_ms)), "H: ingen tale er kuttet");
});

// I: forlengelse med proporsjonal fordeling mellom eksisterende pauser
await scenario("I", "nb", async (page, dialog) => {
  const { cmd } = await applyRetime(page, dialog, 12, "pauses");
  const c = clipsOf(cmd);
  const at = (a) => c[a.id]?.offsetMs ?? a.offset_ms;
  const len = (a) => c[a.id]?.lengthMs ?? a.length_ms;
  // Mellomrommene før: 1,0 / 2,0 / 1,5 / 3,0 s (7,5 s fleksibelt); 2 s mer gir faktor 9,5 / 7,5
  const k = 9.5 / 7.5;
  const tol = 2 * (1000 / FPS);
  const g1 = at(CLIPS[0]);
  const g2 = at(CLIPS[1]) - (at(CLIPS[0]) + len(CLIPS[0]));
  const g3 = at(CLIPS[2]) - (at(CLIPS[1]) + len(CLIPS[1]));
  check(near(g1, 1000 * k, tol) && near(g2, 2000 * k, tol) && near(g3, 1500 * k, tol), `I: mellomrommene vokser proporsjonalt (${g1} / ${g2} / ${g3} ms)`);
  check(CLIPS.every((a) => len(a) === a.length_ms), "I: lydklippene har uendret lengde");
});

// J: forkorting proporsjonalt uten at talelyd eller video strekkes
await scenario("J", "nb", async (page, dialog) => {
  const { cmd } = await applyRetime(page, dialog, 8, "pauses");
  check(cmd !== null, "J: forkortingen sendes");
  const c = clipsOf(cmd);
  check(CLIPS.every((a) => c[a.id] === undefined || c[a.id].lengthMs === a.length_ms), "J: taleklippene har uendret lengde");
  check(!(cmd?.steps ?? []).some((s) => /ClipPart/.test(s.type)), "J: videodelene har uendret lengde");
});

// K: for lite fleksibel tid gir tydelig varsel, ingen skjult redigering
await scenario("K", "nb", async (page, dialog) => {
  const n = commands.length;
  await setDuration(page, 2);
  await dialog.waitFor();
  await dialog.getByTestId("retime-method-pauses").check();
  await dialog.getByTestId("retime-reason").waitFor({ timeout: 3000 });
  check((await dialog.getByTestId("retime-reason").innerText()).trim().length > 0, "K: varselet forklarer hvorfor");
  check(await dialog.getByTestId("retime-apply").isDisabled(), "K: Bruk er av");
  await cancel(dialog);
  check(commands.length === n, "K: ingenting er sendt");
});

// L: forhåndsvise, avbryte og angre
await scenario("L", "nb", async (page, dialog) => {
  await setDuration(page, 12);
  await dialog.waitFor();
  await dialog.getByTestId("retime-method-stretch_visual").check();
  const sent = commands.length;
  await dialog.getByTestId("retime-preview-play").click();
  await page.waitForTimeout(400);
  check(commands.length === sent, "L: forhåndsspill lagrer ingenting");
  await cancel(dialog);
  check(commands.length === sent, "L: Avbryt endrer ingenting");
  const { cmd } = await applyRetime(page, dialog, 12, "stretch_visual");
  check(cmd !== null, "L: Bruk sender RetimeScene");
  const n = retimes().length;
  await page.getByRole("button", { name: /^Angre|^Undo/ }).first().click();
  await page.waitForTimeout(800);
  const inv = retimes().length > n ? retimes().at(-1) : null;
  check(stepOf(inv, "UpdateComposition")?.fields?.durationFrames === BEFORE, "L: angre etter Bruk sender inversen (tilbake til 10 s)");
});

// 13: en tidsendring for hele scenen flytter tilhørende hendelser synkront
await scenario("13", "nb", async (page, dialog) => {
  const { cmd } = await applyRetime(page, dialog, 12, "start", "freeze");
  const swap = (layerOf(cmd)?.swaps ?? [])[0];
  const sound = clipsOf(cmd)[SWAP_SOUND];
  const swapMs = swap ? msOf(swap.frame - SWAP.frame) : NaN;
  const soundMs = sound ? sound.offsetMs - CLIPS[1].offset_ms : NaN;
  check(near(swapMs, soundMs, 1000 / FPS), `13: bildeskiftet og lyden flyttes like mye (${swapMs} / ${soundMs} ms)`);
});

// 14: forkorting som ikke går, gir varsel og ingen delvis oppdatering
await scenario("14", "nb", async (page, dialog) => {
  const n = commands.length;
  await setDuration(page, 1.5);
  await dialog.waitFor();
  await dialog.getByTestId("retime-method-end").check();
  await dialog.getByTestId("retime-reason").waitFor({ timeout: 3000 });
  check(/tale|speech|kuttet|cut/i.test(await dialog.getByTestId("retime-reason").innerText()), "14: varselet sier at tale ville blitt kuttet");
  check(await dialog.getByTestId("retime-apply").isDisabled(), "14: Bruk er av");
  await cancel(dialog);
  check(commands.length === n, "14: ingen delvis oppdatering er sendt");
});

// 15: samtidige oppdateringer fra to vinduer – revisjonskonflikt avviser hele kommandoen
await scenario("15", "nb", async (page, dialog) => {
  conflictNext = true;
  await setDuration(page, 12);
  await dialog.waitFor();
  await dialog.getByTestId("retime-method-stretch_visual").check();
  await dialog.getByTestId("retime-apply").click();
  await dialog.getByTestId("retime-error").waitFor({ timeout: 8000 });
  check(await dialog.isVisible(), "15: dialogen står åpen, ingenting er overskrevet stille");
  check(await dialog.getByTestId("retime-recalculate").isVisible(), "15: konflikt gir «Beregn på nytt»");
  await dialog.getByTestId("retime-recalculate").click();
  check(await dialog.getByTestId("retime-apply").isEnabled(), "15: etter ny beregning kan Bruk trykkes igjen");
  await cancel(dialog);
});

// Egne kontroller: dra i sluttpunktet, «Fra manus», låste tidsrom, egenskapspanelet
await scenario("tidslinje", "nb", async (page, dialog) => {
  const handle = page.getByTestId("scene-end-handle");
  const box = await handle.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 80, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
  }
  await dialog.waitFor({ timeout: 5000 });
  check(await dialog.isVisible(), "dra i sluttpunktet åpner dialogen");
  await cancel(dialog);
  const fromScript = page.getByRole("button", { name: /^Fra manus$|^From script$/ });
  if (await fromScript.count()) {
    const n = commands.length;
    await fromScript.click();
    await page.waitForTimeout(300);
    check((await dialog.isVisible()) || commands.length === n + 1, "«Fra manus» åpner dialogen når scenen har innhold med tidspunkter");
    if (await dialog.isVisible()) await cancel(dialog);
  }
  await page.getByTestId("lock-range-button").click();
  await page.waitForTimeout(300);
  let last = commands.at(-1);
  check(last?.type === "UpdateComposition" && last?.timing?.lockedRanges?.length === 1, "knappen lager et låst tidsrom");
  const end = page.getByTestId("locked-range-end").first();
  const eb = await end.boundingBox();
  if (eb) {
    await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
    await page.mouse.down();
    await page.mouse.move(eb.x + 60, eb.y + eb.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  }
  last = commands.at(-1);
  const r = last?.timing?.lockedRanges?.[0];
  check(last?.type === "UpdateComposition" && r && r.endFrame - r.startFrame > fr(1), "kanten på et låst tidsrom kan dras (én UpdateComposition)");
  const ruler = page.getByTestId("timeline-ruler");
  const rb = await ruler.boundingBox();
  if (rb) {
    const y = rb.y + rb.height / 2;
    const x0 = rb.x + rb.width * 0.7;
    await page.keyboard.down("Shift");
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.move(x0 + 40, y, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await page.waitForTimeout(300);
  }
  last = commands.at(-1);
  check(last?.type === "UpdateComposition" && last?.timing?.lockedRanges?.length === 2, "Shift + dra over linjalen lager et låst tidsrom");
  const insp = page.getByTestId("inspector-change-duration");
  if (await insp.count()) {
    await insp.click();
    await dialog.waitFor();
    check(await dialog.isVisible(), "egenskapspanelet åpner dialogen");
    await cancel(dialog);
  }
});

await scenario("engelsk", "en", async (page, dialog) => {
  await setDuration(page, 12);
  await dialog.waitFor({ timeout: 5000 });
  const text = await dialog.innerText();
  check(/Change scene duration/.test(text) && /Spread over the pauses/.test(text), "engelsk: tittel og metoder er på engelsk");
  check(!/Endre scenevarighet|Fordel på pausene/.test(text), "engelsk: ingen norsk tekst i dialogen");
  await cancel(dialog);
});

console.log(`RESULTAT ${pass} bestått, ${fail} feilet`);
await browser.close(); process.exitCode = fail ? 1 : 0;
