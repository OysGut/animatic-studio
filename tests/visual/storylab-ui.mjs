/**
 * Nettlesertest SL2/SL3: Story Lab – fanen, karakterflaten (profilfelt lagres med SetStoryProfile),
 * «Lag profil med AI …» med forhåndsvisning og «Bruk valgte felt», fakta og hemmeligheter (en hemmelighet
 * bare Maja vet sendes aldri i prompten for Bestemor), samtale i rollen og i analyse, regi for neste replikk,
 * forgrening, forslag, åpne økten igjen og engelsk visning. Oppsettet er kopiert fra dec0096-pauses-ui.mjs:
 * Supabase og serverfunksjonene mockes (ingenting lagres eller betales), også generateStoryText med faste svar.
 *   ENV_FILE=…/.env node storylab-ui.mjs <baseUrl> <fixture.json> [utmappe]
 */
import { chromium } from "playwright";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
/** REQ-0037: forgreiningen peker på turens ID (fromTurnId); null = fra start. */
const forkAt = (p, d) => (d.fromTurnId === null || d.fromTurnId === undefined ? -1 : p.turns.findIndex((t) => t.id === d.fromTurnId));
import { readFileSync, mkdirSync } from "node:fs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/storylab",
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

/** Serverens tilstand for denne kjøringen (nullstilles per nettleser). */
let S;
function reset() {
  S = { sessions: new Map(), suggestions: [], commands: [], gen: [], seq: 0 };
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
    if (table === "schema_version") return json([{ version: VISUAL_SCHEMA_VERSION }]);
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
  await ctx.route("**/_serverFn/**", (route) => {
    const name = serverFnName(route.request().url());
    const body = route.request().postData() ?? "";
    const d = dataOf(body);
    const json = (result) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, context: {} }) });
    const now = new Date().toISOString();
    if (/runCommand/.test(name)) {
      S.commands.push(body);
      return json({ ok: true, changeId: "x", affected: [], inverse: null, revisions: {} });
    }
    if (/projectAiProviders/.test(name)) return json({ providers: [], missing: false });
    if (/listTextChoices/.test(name)) return json({ providers: [], missing: false });
    // B-105a: promptene bygges på serveren; klienten sender bare oppgavetype og parametere (request).
    if (/estimateStoryPrompt/.test(name)) return json({ ok: true, chars: 1000 });
    if (/generateStoryText/.test(name)) {
      S.gen.push({ body, task: d.task, request: d.request ?? {}, system: d.system ?? "" });
      const text =
        d.task === "storylab_profile"
          ? PROFILE_JSON
          : d.task === "storylab_analysis"
            ? "ETABLERT: Maja er redd (psychology.reality). TOLKNING: hun skjuler noe."
            : `Svar ${S.gen.length}`;
      return json({ ok: true, text, provider: "lovable", model: "built-in", usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.0012, usedFallback: true, reason: "fallback", keyOwner: "lovable", jobId: "j" });
    }
    if (/createStorySession/.test(name)) {
      const s = { id: sid(), kind: d.kind, title: d.title, status: "active", parentSessionId: null, fromTurn: null, costUsd: 0, createdBy: USER.id, createdAt: now, updatedAt: now, context: d.context, turns: [] };
      S.sessions.set(s.id, s);
      return json({ ok: true, session: s });
    }
    if (/appendStoryTurns/.test(name)) {
      const s = S.sessions.get(d.sessionId);
      if (!s) return json({ ok: false, message: "Økten finnes ikke" });
      s.turns.push(...(d.turns ?? []));
      s.costUsd += d.addCostUsd ?? 0;
      s.updatedAt = now;
      return json({ ok: true, turns: s.turns.length, costUsd: s.costUsd });
    }
    if (/forkStorySession/.test(name)) {
      const p = S.sessions.get(d.sessionId);
      const s = { ...p, id: sid(), parentSessionId: p.id, fromTurn: forkAt(p, d), turns: p.turns.slice(0, forkAt(p, d) + 1), status: "paused", updatedAt: now };
      S.sessions.set(s.id, s);
      return json({ ok: true, session: s });
    }
    if (/getStorySession/.test(name)) {
      const s = S.sessions.get(d.sessionId);
      return json(s ? { ok: true, session: s } : { ok: false, message: "Økten finnes ikke" });
    }
    if (/listStorySessions/.test(name)) return json({ ok: true, sessions: [...S.sessions.values()].map(summary).reverse() });
    if (/saveStorySuggestion/.test(name)) {
      S.suggestions.push(d);
      return json({ ok: true, id: sid() });
    }
    if (/pumpProjectQueue/.test(name)) return json({ sent: 0 });
    return route.abort();
  });
}

const browser = await chromium
  .launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" })
  .catch(() => chromium.launch());
let pass = 0,
  fail = 0;
const check = (ok, text) => {
  console.log(`  ${ok ? "✓" : "✗"} ${text}`);
  ok ? pass++ : fail++;
};

async function run(name, act, { lang = "nb", path = "" } = {}) {
  reset();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: "dark" });
  await mock(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const exp = Math.floor(Date.now() / 1000) + 86400;
  await page.addInitScript(
    ([k, v, l]) => {
      if (!sessionStorage.getItem("init")) {
        localStorage.setItem(k, v);
        localStorage.setItem("animatic:lang", l);
        sessionStorage.setItem("init", "1");
      }
    },
    [
      `sb-${ref}-auth-token`,
      JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: USER }),
      lang,
    ],
  );
  await page.goto(base + P + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  try {
    await act(page);
  } catch (e) {
    errors.push("act: " + e.message.split("\n")[0]);
    await page.screenshot({ path: `${out}/${name}-feil.png` }).catch(() => {});
  }
  console.log(name, errors.length ? "FEIL: " + errors.join(" | ").slice(0, 800) : "ok");
  if (errors.length) fail++;
  await ctx.close();
}

const pick = (page, assetId) => page.locator(`[data-testid="storylab-character"][data-asset-id="${assetId}"]`).click();
async function eventually(condition, timeout = 5000) {
  const end = Date.now() + timeout;
  do {
    if (await condition()) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < end);
  return false;
}
async function newSession(page, assetId) {
  await pick(page, assetId);
  await page.getByTestId("storylab-talk").click();
  await page.getByTestId("storylab-session-create").click();
  await page.getByTestId("storylab-conversation").waitFor();
}
async function say(page, text, first = false) {
  await page.getByTestId("storylab-input").fill(text);
  await page.getByTestId("storylab-send").click();
  if (first) await page.getByTestId("storylab-confirm-send").click();
  await page.waitForTimeout(600);
}

await run("fane og profil", async (page) => {
  const nav = page.getByRole("navigation", { name: "Arbeidsflater" });
  const links = (await nav.getByRole("link").allInnerTexts()).map((x) => x.trim());
  check(links.join("|") === "Prosjektoversikt|Manus|Story Lab|Ressursbibliotek|Sceneeditor|Rigg|Montering|Utgivelse", "fanen Story Lab står etter Manus");
  await nav.getByRole("link", { name: "Story Lab" }).click();
  await page.getByTestId("storylab").waitFor();
  check((await page.getByTestId("storylab-character").count()) === 2, "to karakterer (Maja og Bestemor Anne)");
  await pick(page, MAJA.id);
  await page.getByTestId("storylab-create-profile").click();
  await page.waitForTimeout(300);
  check((await page.getByTestId("storylab-profile-section").count()) === 5, "fem seksjoner i profilen");
  await page.locator("#sl-speech\\.mood").fill("glad");
  await page.waitForTimeout(1200);
  const saved = S.commands.filter((c) => c.includes("SetStoryProfile"));
  check(saved.some((c) => c.includes("glad")), "profilfeltet lagres med SetStoryProfile (debounced)");
  check(/Lagret/.test(await page.getByTestId("storylab-profile-status").innerText()), "«Lagret» i verktøylinjen");
  await page.locator('[data-field="psychology.hiddenMotives"] input').fill("Vil hjem");
  await page.keyboard.press("Enter");
  check((await page.locator('[data-field="psychology.hiddenMotives"] [data-testid="storylab-chip"]').count()) === 1, "liste som chips");
  await page.screenshot({ path: `${out}/1-profil.png` });

  // Lag profil med AI
  await page.getByTestId("storylab-generate").click();
  check(await eventually(async () => /anslått/.test(await page.getByTestId("storylab-generate-cost").innerText()), 5000), "anslått kostnad og modell vises");
  await page.getByTestId("storylab-generate-run").click();
  await page.getByTestId("storylab-generate-preview").waitFor();
  check(S.gen.at(-1)?.task === "storylab_profile", "generateStoryText kalles med storylab_profile");
  check(await page.getByTestId("storylab-fallback-note").isVisible(), "merknad om reserven");
  const before = S.commands.length;
  const fields = page.getByTestId("storylab-generate-field");
  const n = await fields.count();
  for (let i = 0; i < n; i++) {
    const f = await fields.nth(i).getAttribute("data-field");
    if (f !== "psychology.facade") await fields.nth(i).locator("input[type=checkbox]").uncheck();
  }
  await page.screenshot({ path: `${out}/2-forhandsvisning.png` });
  await page.getByTestId("storylab-apply").click();
  await page.waitForTimeout(300);
  const last = S.commands.slice(before).join("");
  check(last.includes("Tøff og frekk") && !last.includes("Redd for å miste bestemor"), "«Bruk valgte felt» lagrer bare det valgte feltet");
  check((await page.locator("#sl-psychology\\.facade").inputValue()) === "Tøff og frekk", "feltet er oppdatert i skjemaet");
});

await run("hemmelighet, samtale, regi, forgrening, forslag", async (page) => {
  await page.goto(base + P + "/storylab", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // Hemmelighet bare Maja vet
  await page.getByTestId("storylab-tab-facts").click();
  await page.getByTestId("storylab-fact-add").click();
  const form = page.getByTestId("storylab-fact-form");
  await form.getByRole("textbox").first().fill(SECRET);
  await form.getByLabel("Type").selectOption("secret");
  await page.getByTestId("storylab-fact-knower-add").click();
  await form.getByLabel("Karakter").selectOption(MAJA.id);
  await page.getByTestId("storylab-fact-save").click();
  await page.waitForTimeout(300);
  check((await page.getByTestId("storylab-fact").count()) === 1, "hemmeligheten står i listen");
  check(S.commands.some((c) => c.includes("AddStoryFact")), "lagres med AddStoryFact");

  // Samtale med Bestemor: hemmeligheten sendes ikke
  await newSession(page, ANNE.id);
  await page.getByTestId("storylab-knowledge").click();
  check(!(await page.getByTestId("storylab-knowledge").innerText()).includes("MAJAS"), "Bestemors kunnskapsboks viser ikke Majas hemmelighet");
  await say(page, "Hei, bestemor!", true);
  const anne = S.gen.at(-1);
  check(anne?.task === "storylab_character", "rollen bruker storylab_character");
  check(anne && anne.request.kind === "character" && anne.request.assetId === ANNE.id && !anne.body.includes("MAJAS-HEMMELIGHET") && !anne.system, "kallet for Bestemor har ingen systemtekst og ingen hemmelighet (serveren bygger prompten)");

  // Maja: hemmeligheten er med, regi for neste replikk
  await newSession(page, MAJA.id);
  await page.getByTestId("storylab-knowledge").click();
  check((await page.getByTestId("storylab-knowledge").innerText()).includes("MAJAS"), "Majas egen hemmelighet vises for Maja");
  await page.getByTestId("storylab-direction-text").fill("er bakfull");
  await page.getByTestId("storylab-direction-scope").selectOption("next");
  await page.getByTestId("storylab-direction-add").click();
  await page.waitForTimeout(300);
  check((await page.getByTestId("storylab-direction").count()) === 1, "regien vises som chip");
  await say(page, "Hva skjedde i går?", true);
  check(S.gen.at(-1).request.assetId === MAJA.id && (S.gen.at(-1).request.directions ?? []).includes("er bakfull") && !S.gen.at(-1).system, "regien sendes som parameter for Maja (hemmeligheten legges til på serveren)");
  check((await page.getByTestId("storylab-direction").count()) === 0, "regi for neste replikk forsvinner etter én tur");
  await say(page, "Og nå?");
  check(!S.gen.at(-1).body.includes("er bakfull"), "regien sendes ikke i neste kall");
  await page.getByTestId("storylab-mode-analysis").click();
  await say(page, "Hvorfor svarer hun slik?");
  check(S.gen.at(-1).task === "storylab_analysis", "analyse bruker storylab_analysis");
  check((await page.locator('[data-testid="storylab-turn"][data-mode="analysis"]').count()) >= 1, "analyseturen er merket");
  check((await page.locator('[data-testid="storylab-turn"][data-mode="role"]').count()) >= 2, "rolleturene er merket");
  check(/\$0\.00/.test(await page.getByTestId("storylab-cost").innerText()), "løpende sum vises");
  await page.screenshot({ path: `${out}/3-samtale.png` });

  // Forslag og forgrening
  await page.locator('[data-testid="storylab-turn"][data-kind="line"] [data-testid="storylab-suggest"]').first().selectOption("motivation");
  await page.waitForTimeout(300);
  check(S.suggestions.length === 1 && S.suggestions[0].kind === "motivation", "lagret som forslag med valgt type");
  const sessionsBefore = S.sessions.size;
  await page.getByTestId("storylab-fork").nth(1).click();
  await page.waitForTimeout(800);
  check(S.sessions.size === sessionsBefore + 1, "forgrening lager en ny økt");
  check((await page.getByTestId("storylab-turn").count()) === 2, "den nye økten har turene til og med den valgte");

  // Åpne den første Maja-økten igjen
  const majaFirst = [...S.sessions.values()].find((s) => s.context.assetId === MAJA.id && !s.parentSessionId);
  await page.locator(`[data-testid="storylab-session"][data-session-id="${majaFirst.id}"]`).click();
  await page.waitForTimeout(800);
  check((await page.getByTestId("storylab-turn").count()) === majaFirst.turns.filter(t => !t.id.startsWith("r:")).length && (await page.locator('[data-testid="storylab-turn"][data-mode="analysis"]').count()) >= 1, "økten åpnes igjen med turene");
});

await run(
  "engelsk og lenke fra biblioteket",
  async (page) => {
    await page.getByTestId("storylab").waitFor();
    check((await page.locator('[data-testid="storylab-character"][aria-current="true"]').getAttribute("data-asset-id")) === ANNE.id, "?karakter= velger karakteren");
    check(/characters/i.test(await page.getByTestId("storylab").innerText()), "engelsk visning");
    check(/No profile|Create empty profile/.test(await page.getByTestId("storylab").innerText()), "engelske tekster i karakterflaten");
    await page.screenshot({ path: `${out}/4-engelsk.png` });
  },
  { lang: "en", path: `/storylab?karakter=${ANNE.id}` },
);

await browser.close();
console.log(`\n${pass} bestått, ${fail} feilet`);
process.exit(fail ? 1 : 0);
