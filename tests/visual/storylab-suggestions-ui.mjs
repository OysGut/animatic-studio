/**
 * Nettlesertest SL6: forslag, eksplisitt overføring, filtrering, angre og engelsk.
 * Oppsett og seroval-dekoding er kopiert fra storylab-ui.mjs:
 * Supabase og serverfunksjonene mockes (ingenting lagres eller betales), også generateText med faste svar.
 *   ENV_FILE=…/.env node storylab-suggestions-ui.mjs <baseUrl> <fixture.json> [utmappe]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/storylab-suggestions",
] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE, "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const USER = {
  id: "00000000-0000-7000-8000-a11ce0000001",
  email: "mars@example.no",
  aud: "authenticated",
  role: "authenticated",
};
const project = fx.project;
const P = `/prosjekt/${project.id}`;
const MAJA = fx.rows.assets.find((a) => a.name === "Maja");
const ANNE = fx.rows.assets.find((a) => a.name === "Bestemor Anne");
const SECRET = "MAJAS-HEMMELIGHET: hun knuste vasen";
const rows = { ...fx.rows };
const SCENE_OCC = fx.rows.scene_occurrences.find((o) => {
  const blocks = fx.rows.script_blocks.filter((b) => b.scene_variant_id === o.variant_id || b.variant_id === o.variant_id);
  return blocks.some((b) => b.kind === "character" && /MAJA/i.test(b.text)) && blocks.some((b) => b.kind === "character" && /BESTEMOR ANNE/i.test(b.text));
});
if (!SCENE_OCC) throw new Error("Fixture mangler scene med Maja og Bestemor Anne");
const SCENE_ID = SCENE_OCC.scene_id;
const SCENE_BLOCKS = fx.rows.script_blocks.filter((b) => b.scene_variant_id === SCENE_OCC.variant_id || b.variant_id === SCENE_OCC.variant_id);
rows.story_facts = [...(rows.story_facts ?? []), { id: "00000000-0000-7000-8000-000000000999", revision: 1, project_id: project.id, text: SECRET, kind: "secret", at_scene_id: null, known_by: [{ assetId: MAJA.id, fromSceneId: null }], removed: false }];


/** Serverens tilstand for denne kjøringen (nullstilles per nettleser). */
let S;
function reset() {
  S = { sessions: new Map(), suggestions: [], commands: [], gen: [], seq: 0, delay: 0, active: 0, maxActive: 0 };
}
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
const sid = () => `00000000-0000-7000-8000-${String(++S.seq).padStart(12, "0")}`;
const summary = (s) => {
  const { context, turns, ...rest } = s;
  return rest;
};
const PROFILE_JSON = JSON.stringify({
  psychology: { facade: "Tøff og frekk", reality: "Redd for å miste bestemor", hiddenMotives: ["Vil være voksen"] },
  speech: { level: "child", mood: "utålmodig" },
  person: { values: ["Ærlighet"] },
  notes: "Generert",
});

async function mock(ctx) {
  await ctx.route(`${supaUrl}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const json = (b, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (path.startsWith("/auth/v1/user")) return json(USER);
    if (path.startsWith("/auth/v1/")) return json({});
    if (path.startsWith("/storage/v1/object/sign/") && req.method() === "POST") {
      const body = JSON.parse(req.postData() ?? "{}");
      return json((body.paths ?? []).map((p) => ({ path: p, signedURL: `/object/sign/assets/${p}?token=t`, error: null })));
    }
    if (path.startsWith("/storage/v1/object/sign/"))
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>` });
    const table = path.replace("/rest/v1/", "");
    if (table === "rpc/my_account")
      return json({ status: "active", is_admin: false, permanent_admin: false, locale: null, display_name: "Mars", privacy_version: 1, accepted_version: 1, created_at: "2026-10-01T10:00:00Z", ui_prefs: {} });
    if (table === "schema_version") return json([{ version: 39 }]);
    if (table === "projects") {
      if (single) return json(project);
      return json([{ ...project, project_members: [{ role: "owner", user_id: USER.id }] }]);
    }
    if (table === "project_members") return json([{ user_id: USER.id, role: "owner", joined_at: "2026-10-08T10:00:00Z" }]);
    if (table === "profiles") return json([{ user_id: USER.id, display_name: "Mars" }]);
    if (path.startsWith("/rest/v1/rpc/")) return json(null);
    if (path.startsWith("/realtime/")) return route.abort();
    if (rows[table] && single) return json(rows[table][0] ?? null);
    if (rows[table]) {
      const off = Number(url.searchParams.get("offset") ?? 0);
      return json(off > 0 ? [] : rows[table]);
    }
    return json([]);
  });
  await ctx.route("**/_serverFn/**", async (route) => {
    const name = serverFnName(route.request().url());
    const body = route.request().postData() ?? "";
    const d = dataOf(body);
    const json = (result) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, context: {} }) });
    const now = new Date().toISOString();
    if (/runCommand/.test(name)) {
      S.commands.push(d);
      return json({ ok: true, changeId: "x", affected: [], inverse: null, revisions: {} });
    }
    if (/projectAiProviders/.test(name)) return json({ providers: [], missing: false });
    if (/listTextChoices/.test(name)) return json({ providers: [], missing: false });
    if (/generateText/.test(name)) {
      S.gen.push({ task: d.task, system: d.system ?? "", messages: d.messages }); S.active++; S.maxActive = Math.max(S.maxActive, S.active);
      if (S.delay) await new Promise((resolve) => setTimeout(resolve, S.delay));
      const text =
        d.task === "storylab_profile"
          ? PROFILE_JSON
          : d.task === "storylab_analysis"
            ? (String(d.system).includes("Line to assess") || String(d.system).includes("supplied line")
              ? JSON.stringify({ verdict: "no", reasons: [{ text: "Replikken passer ikke", evidence: ["profile.speech.level", "knowledge"] }], rewrite: "Kanskje vi skal vente?" })
              : JSON.stringify({ points: ["credibility", "motivation", "conflict", "subtext", "relationships", "emotional_arc", "knowledge", "consequence", "rhythm", "weaknesses"].map((aspect) => ({ aspect, finding: "Et konkret funn", evidence: [SCENE_BLOCKS.find((b) => b.kind === "dialogue").id], suggestion: "Et forslag", uncertain: aspect === "knowledge" })) }))
            : `Svar ${S.gen.length}`;
      S.active--; return json({ ok: true, text, provider: "lovable", model: "built-in", usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.0012, usedFallback: true, reason: "fallback", keyOwner: "lovable", jobId: "j" });
    }
    if (/createStorySession/.test(name)) {
      const s = { id: sid(), kind: d.kind, title: d.title, status: "active", parentSessionId: null, fromTurn: null, costUsd: 0, createdBy: USER.id, createdAt: now, updatedAt: now, context: d.context, turns: [] };
      S.sessions.set(s.id, s);
      return json({ ok: true, session: s });
    }
    if (/appendStoryTurns/.test(name)) {
      const s = S.sessions.get(d.sessionId);
      if (!s) return json({ ok: false, message: "Økten finnes ikke" });
      const ids = new Set(s.turns.map((t) => t.id));
      s.turns.push(...(d.turns ?? []).filter((t) => !ids.has(t.id)));
      if (d.status) s.status = d.status;
      s.costUsd += d.addCostUsd ?? 0;
      s.updatedAt = now;
      return json({ ok: true, turns: s.turns.length, costUsd: s.costUsd });
    }
    if (/forkStorySession/.test(name)) {
      const p = S.sessions.get(d.sessionId);
      const s = { ...p, title: d.title ?? p.title, id: sid(), parentSessionId: p.id, fromTurn: d.fromTurn, turns: p.turns.slice(0, d.fromTurn + 1), status: "paused", updatedAt: now };
      S.sessions.set(s.id, s);
      return json({ ok: true, session: s });
    }
    if (/getStorySession/.test(name)) {
      const s = S.sessions.get(d.sessionId);
      return json(s ? { ok: true, session: s } : { ok: false, message: "Økten finnes ikke" });
    }
    if (/listStorySessions/.test(name)) return json({ ok: true, sessions: [...S.sessions.values()].map(summary).reverse() });
    if (/listStorySuggestions/.test(name)) return json({ ok: true, suggestions: S.suggestions.filter((s) => (!d.status || s.status === d.status) && (!d.kind || s.kind === d.kind) && (!d.sessionId || s.sessionId === d.sessionId)) });
    if (/setSuggestionStatus/.test(name)) { const s = S.suggestions.find((s) => s.id === d.suggestionId); if (!s) return json({ ok: false, message: "Missing suggestion" }); s.status = d.status; return json({ ok: true }); }
    if (/saveStorySuggestion/.test(name)) {
      const id = sid(); S.suggestions.push({ ...d, id, status: "open", createdAt: now, createdBy: USER.id });
      return json({ ok: true, id });
    }
    if (/pumpProjectQueue/.test(name)) return json({ sent: 0 });
    return route.abort();
  });
}

const browser = await chromium
  .launch({ headless: true });
let pass = 0,
  fail = 0;
const check = (ok, text) => {
  console.log(`  ${ok ? "ok" : "FEIL"} ${text}`);
  ok ? pass++ : fail++;
};

async function run(name, act, { lang = "nb", path = "?forslag=open" } = {}) {
  reset(); seedSuggestions();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 }, colorScheme: "dark" });
  await mock(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const exp = Math.floor(Date.now() / 1000) + 86400;
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v, l]) => {
    localStorage.setItem(k, v);
    localStorage.setItem("animatic:lang", l);
  }, [`sb-${ref}-auth-token`, JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: USER }), lang]);
  await page.goto(base + P + "/storylab" + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  try {
    await act(page);
  } catch (e) {
    errors.push("act: steget kunne ikke gjennomføres");
    await page.screenshot({ path: `${out}/${name}-feil.png` }).catch(() => {});
  }
  console.log(name, errors.length ? "FEIL: " + errors.join(" | ").slice(0, 800) : "ok");
  if (errors.length) fail++;
  await ctx.close();
}


const waitUntil = async (condition, label, timeout = 20000) => {
  const start = Date.now();
  while (!condition()) { if (Date.now() - start > timeout) throw new Error(label); await new Promise((resolve) => setTimeout(resolve, 40)); }
};
async function confirm(page) { await page.getByTestId("storylab-suggestions-confirm").click(); }

const DIALOGUE = SCENE_BLOCKS.find((b) => b.kind === "dialogue");
if (!DIALOGUE) throw new Error("Fixture lacks dialogue");
function seedSuggestions() {
  const sessionId = sid();
  const turn = { id: "source-turn", kind: "analysis", speaker: "analyst", text: "Analyse", at: new Date().toISOString() };
  S.sessions.set(sessionId, { id: sessionId, kind: "group", title: "Kilde", status: "paused", context: { participants: [MAJA.id, ANNE.id], mode: "improv", seed: 42, profiles: {} }, turns: [turn], costUsd: 0, createdBy: USER.id, createdAt: turn.at, updatedAt: turn.at, parentSessionId: null, fromTurn: null });
  const add = (kind, payload) => S.suggestions.push({ id: sid(), kind, payload: { sceneId: SCENE_ID, ...payload }, sessionId, turnId: turn.id, status: "open", createdAt: turn.at, createdBy: USER.id });
  add("line", { blockId: DIALOGUE.id, original: DIALOGUE.text, suggestion: "Ny replikkomskriving" });
  add("line", { speaker: MAJA.id, text: "Improvisert replikk" });
  add("scene_draft", { turns: [{ speaker: MAJA.id, text: "Utkast en" }, { speaker: ANNE.id, text: "Utkast to" }] });
  add("profile_change", { assetId: MAJA.id, patch: { notes: "Nye profilnotater", speech: { wordChoice: "Presist" } } });
  add("analysis", { finding: "Nytt funn", suggestion: "Nytt råd", evidence: [DIALOGUE.id] });
}
const card = (page, i) => page.locator(`[data-testid="storylab-suggestion"][data-suggestion-id="${S.suggestions[i].id}"]`);
async function preview(page, i) {
  await page.getByTestId("storylab-suggestions").waitFor();
  await card(page, i).getByTestId("storylab-suggestion-apply").click();
  await page.getByTestId("storylab-suggestion-preview").waitFor();
}
async function apply(page, i) {
  await page.getByTestId("storylab-suggestion-confirm").click();
  await waitUntil(() => S.suggestions[i].status === "applied", "status applied");
  await card(page, i).waitFor();
}
await run("liste, filtre, kilde, forkast og gjenåpne", async (page) => {
  const panel = page.getByTestId("storylab-suggestions"); await panel.waitFor();
  await card(page, 4).waitFor();
  check(await panel.getByTestId("storylab-suggestion").count() === 5, "listen viser fem åpne forslag");
  await panel.getByRole("combobox", { name: "Type", exact: true }).selectOption("analysis");
  check(await panel.getByTestId("storylab-suggestion").count() === 1, "typefilter begrenser listen");
  await card(page, 4).getByTestId("storylab-suggestion-discard").click();
  await waitUntil(() => S.suggestions[4].status === "discarded", "discard");
  await panel.getByRole("combobox", { name: "Status", exact: true }).selectOption("discarded");
  await card(page, 4).getByTestId("storylab-suggestion-reopen").click();
  await waitUntil(() => S.suggestions[4].status === "open", "reopen");
  check(S.suggestions[4].status === "open", "forkast og gjenåpne endrer status");
  await panel.getByRole("combobox", { name: "Status", exact: true }).selectOption("open");
  await card(page, 4).getByRole("button", { name: /Fra økten/ }).click();
  await page.locator('[data-turn-id="source-turn"]').waitFor();
  check(await page.locator('[data-turn-id="source-turn"]').count() > 0, "kildelenken åpner lagret tur uten AI-kall");
  check(S.gen.length === 0, "forslagsarbeid bruker ikke betalt AI");
});
await run("omskriving med diff og angre", async (page) => {
  await preview(page, 0);
  check(await page.getByTestId("storylab-word-diff").locator("ins").count() > 0, "forhåndsvisningen viser ordvis diff");
  check(S.commands.length === 0, "forhåndsvisning endrer ikke manus");
  await apply(page, 0);
  check(S.commands[0].command.type === "EditBlockText" && S.commands[0].command.blockId === DIALOGUE.id && S.commands[0].command.text === "Ny replikkomskriving", "bekreftelse sender riktig EditBlockText");
  check(await card(page, 0).getByRole("link").count() > 0, "brukt forslag har manuslenke");
  await card(page, 0).getByTestId("storylab-suggestion-undo").click();
  await waitUntil(() => S.suggestions[0].status === "open", "undo opens");
  check(S.commands.at(-1).command.text === DIALOGUE.text, "angre tilbakefører originaltekst og gjenåpner forslaget");
});
await run("improvisert replikk etter valgt blokk", async (page) => {
  await preview(page, 1);
  await page.getByTestId("storylab-placement").getByRole("combobox", { name: "Etter blokk", exact: true }).selectOption(SCENE_BLOCKS[0].id);
  await apply(page, 1);
  const cs = S.commands.map((d) => d.command);
  check(cs.length === 2 && cs.every((c) => c.type === "InsertBlock"), "replikk gir to InsertBlock");
  check(cs[0].block.kind === "character" && cs[0].block.text === MAJA.name.toUpperCase() && cs[1].block.kind === "dialogue", "talernavn kommer fra biblioteket");
  check(cs[0].block.orderKey > SCENE_BLOCKS[0].order_key && cs[0].block.orderKey < cs[1].block.orderKey, "nye blokker sorteres etter valgt blokk");
});
await run("sceneutkast", async (page) => {
  await preview(page, 2); await apply(page, 2);
  check(S.commands.length === 4 && S.commands.every((d) => d.command.type === "InsertBlock"), "utkast legger inn fire blokker uten sletting");
});
await run("profil med valgte felt", async (page) => {
  await preview(page, 3);
  const fields = page.getByTestId("storylab-suggestion-preview").locator("[data-field]");
  await fields.filter({ has: page.locator('[type="checkbox"]') }).first().getByRole("checkbox").uncheck();
  await apply(page, 3);
  const c = S.commands[0].command;
  check(c.type === "SetStoryProfile" && c.assetId === MAJA.id, "profil går gjennom SetStoryProfile");
  check(c.profile.notes === "Nye profilnotater" && c.profile.speech.wordChoice !== "Presist", "bare valgt profilfelt overføres");
});
await run("analyse som systemnotat", async (page) => {
  await preview(page, 4); await apply(page, 4);
  const c = S.commands[0].command;
  check(c.type === "AddAnnotations" && c.annotations[0].source === "system" && c.annotations[0].blockId === DIALOGUE.id, "analyse festes som systemnotat på sitert blokk");
  check(c.annotations[0].text.includes("Nytt funn") && c.annotations[0].text.includes("Nytt råd"), "notatet beholder funn, forslag og kilde");
});
await run("manusets forslagsteller", async (page) => {
  await page.goto(base + P + "/manus?scene=" + SCENE_OCC.id, { waitUntil: "networkidle" });
  const link = page.getByTestId("script-storylab-suggestions"); await link.waitFor();
  check((await link.textContent()).includes("5"), "inspektøren viser fem åpne forslag");
  await link.click(); await page.getByTestId("storylab-suggestions").waitFor();
  check(await page.getByTestId("storylab-suggestion").count() === 5, "inspektørlenken filtrerer på scenen");
});
await run("engelsk", async (page) => {
  await preview(page, 0);
  check(await page.getByRole("heading", { name: "Preview transfer" }).isVisible(), "engelsk forhåndsvisning");
  await apply(page, 0);
  check(await card(page, 0).getByRole("button", { name: "Undo", exact: true }).isVisible(), "engelsk angreknapp");
}, { lang: "en" });
await browser.close();
console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
process.exitCode = fail ? 1 : 0;
