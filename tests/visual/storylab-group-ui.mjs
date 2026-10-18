/**
 * Nettlesertest SL4: grupper, kunnskapsgrenser, målrettet regi, analyse, forklaring,
 * forgrening, stopp, gjenåpning, åtte sekvensielle kall, pause og engelsk visning.
 * Oppsett og seroval-dekoding er kopiert fra storylab-ui.mjs:
 * Supabase og serverfunksjonene mockes (ingenting lagres eller betales), også generateText med faste svar.
 *   ENV_FILE=…/.env node storylab-group-ui.mjs <baseUrl> <fixture.json> [utmappe]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/storylab-group",
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
  S = { sessions: new Map(), suggestions: [], commands: [], gen: [], seq: 0, delay: 0 };
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
      S.commands.push(body);
      return json({ ok: true, changeId: "x", affected: [], inverse: null, revisions: {} });
    }
    if (/projectAiProviders/.test(name)) return json({ providers: [], missing: false });
    if (/listTextChoices/.test(name)) return json({ providers: [], missing: false });
    if (/generateText/.test(name)) {
      S.gen.push({ task: d.task, system: d.system ?? "", messages: d.messages });
      if (S.delay) await new Promise((resolve) => setTimeout(resolve, S.delay));
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
      const ids = new Set(s.turns.map((t) => t.id));
      s.turns.push(...(d.turns ?? []).filter((t) => !ids.has(t.id)));
      if (d.status) s.status = d.status;
      s.costUsd += d.addCostUsd ?? 0;
      s.updatedAt = now;
      return json({ ok: true, turns: s.turns.length, costUsd: s.costUsd });
    }
    if (/forkStorySession/.test(name)) {
      const p = S.sessions.get(d.sessionId);
      const s = { ...p, id: sid(), parentSessionId: p.id, fromTurn: d.fromTurn, turns: p.turns.slice(0, d.fromTurn + 1), status: "paused", updatedAt: now };
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
  .launch({ headless: true });
let pass = 0,
  fail = 0;
const check = (ok, text) => {
  console.log(`  ${ok ? "ok" : "FEIL"} ${text}`);
  ok ? pass++ : fail++;
};

async function run(name, act, { lang = "nb", path = "" } = {}) {
  reset();
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

const group = (page) => page.getByTestId("storylab-group");
const participant = (page, id) => group(page).locator(`[data-testid="storylab-participant"][data-asset-id="${id}"]`);
const waitUntil = async (condition, label, timeout = 15000) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) throw new Error(label);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
};
async function idle(page) {
  await group(page).getByTestId("storylab-send").waitFor();
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-testid="storylab-group"]');
    const status = root?.querySelector('[data-testid="storylab-group-status"]');
    return status && /klar|pause|stoppet|ready|paused|stopped/i.test(status.textContent);
  });
}
async function createGroup(page, mode = "qa") {
  await page.getByTestId("storylab-new-session").click();
  await page.getByTestId("storylab-new-group").click();
  const dialog = page.getByTestId("storylab-group-dialog");
  await dialog.waitFor();
  await dialog.locator(`[data-testid="storylab-participant"][data-asset-id="${MAJA.id}"]`).check();
  await dialog.locator(`[data-testid="storylab-participant"][data-asset-id="${ANNE.id}"]`).check();
  await dialog.getByTestId("storylab-situation").fill("Middag julaften, strømmen går");
  await dialog.getByTestId(`storylab-group-mode-${mode}`).click();
  await dialog.getByTestId("storylab-session-create").click();
  await group(page).waitFor();
  return [...S.sessions.values()].at(-1);
}
async function send(page, text, first = false) {
  await group(page).getByTestId("storylab-input").fill(text);
  await group(page).getByTestId("storylab-send").click();
  if (first) await group(page).getByTestId("storylab-confirm-send").click();
  await idle(page);
}
await run("gruppe, kunnskap, regi, analyse, forgrening og gjenåpning", async (page) => {
  // Faktum lagt inn via de samme kommandoene som i SL3 (bare mocket lagring).
  await page.getByTestId("storylab-tab-facts").click();
  await page.getByTestId("storylab-fact-add").click();
  const form = page.getByTestId("storylab-fact-form");
  await form.getByRole("textbox").first().fill(SECRET);
  await form.getByLabel("Type").selectOption("secret");
  await page.getByTestId("storylab-fact-knower-add").click();
  await form.getByLabel("Karakter").selectOption(MAJA.id);
  await page.getByTestId("storylab-fact-save").click();
  const original = await createGroup(page);
  check(original.kind === "group" && original.context.participants.length === 2, "ny gruppe med Maja og Bestemor Anne");
  check(Number.isInteger(original.context.seed) && "profiles" in original.context, "seed og profiløyeblikksbilder er lagret");
  await participant(page, ANNE.id).click();
  await group(page).getByTestId("storylab-knowledge").click();
  check(!(await group(page).getByTestId("storylab-knowledge").innerText()).includes(SECRET), "Bestemors kunnskapsboks viser ikke Majas hemmelighet");
  await send(page, "Hva skjedde, bestemor?", true);
  const annePrompt = S.gen.at(-1);
  check(annePrompt.task === "storylab_group" && !JSON.stringify(annePrompt).includes(SECRET), "Bestemors gruppeprompt utelater Majas hemmelighet");
  check(original.turns.at(-1).speaker === ANNE.id && original.turns[0].to === ANNE.id, "rettet spørsmål besvares av Bestemor");
  await group(page).getByTestId("storylab-auto").click();
  const auto = await group(page).getByTestId("storylab-next-speaker").getAttribute("data-asset-id");
  await send(page, "Hva nå?");
  check(original.turns.at(-1).speaker === auto, "Auto bruker motorens foreslåtte taler");

  await group(page).getByTestId("storylab-direction-text").fill("MAJA-NESTE: er bakfull");
  await group(page).getByTestId("storylab-direction-target").selectOption(MAJA.id);
  await group(page).getByTestId("storylab-direction-scope").selectOption("next");
  await group(page).getByTestId("storylab-direction-add").click();
  await idle(page);
  await participant(page, ANNE.id).click();
  await send(page, "Bestemor?");
  check(!S.gen.at(-1).system.includes("MAJA-NESTE"), "målrettet regi sendes ikke til Bestemor");
  check(await group(page).getByTestId("storylab-direction").count() === 1, "regien består etter en annen talers replikk");
  await participant(page, MAJA.id).click();
  await send(page, "Maja?");
  check(S.gen.at(-1).system.includes("MAJA-NESTE"), "regien sendes i Majas neste kall");
  check(await group(page).getByTestId("storylab-direction").count() === 0, "next-regi forsvinner etter målets tur");
  await participant(page, MAJA.id).click();
  await send(page, "Og nå?");
  check(!S.gen.at(-1).system.includes("MAJA-NESTE"), "regien brukes ikke en gang til");
  const targetTurn = original.turns.find((t) => t.kind === "line");
  await group(page).getByTestId("storylab-explain").first().click();
  await idle(page);
  check(S.gen.at(-1).task === "storylab_analysis" && S.gen.at(-1).system.includes("third person"), "forklar deg bruker analyse i tredjeperson");
  check(original.turns.at(-1).kind === "analysis" && original.turns.at(-1).to === targetTurn.speaker, "forklaringen lagres med mål");
  await group(page).getByTestId("storylab-mode-analysis").click();
  await send(page, "Hvorfor svarer de slik?");
  check(S.gen.at(-1).system.includes("# Characters") && S.gen.at(-1).system.includes("Maja") && S.gen.at(-1).system.includes("Bestemor Anne"), "analyse får alle deltakerprofiler");
  await group(page).getByTestId("storylab-mode-analysis").click();
  await group(page).getByTestId("storylab-suggest").first().selectOption("motivation");
  await waitUntil(() => S.suggestions.length === 1, "forslag");
  check(S.suggestions[0].kind === "motivation", "lagres som valgt forslag");
  const prefix = 2;
  await group(page).getByTestId("storylab-fork").nth(prefix - 1).click();
  await waitUntil(() => S.sessions.size === 2, "forgrening");
  await group(page).waitFor();
  const branch = [...S.sessions.values()].at(-1);
  check(branch.parentSessionId === original.id && branch.turns.length === prefix, "forgrening beholder valgt prefiks");
  await page.locator(`[data-testid="storylab-session"][data-session-id="${original.id}"]`).click();
  await group(page).waitFor();
  const visible = original.turns.filter((t) => !t.id.startsWith("r:")).length;
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="storylab-group"] [data-testid="storylab-turn"]').length === n, visible);
  check(await group(page).getByTestId("storylab-turn").count() === visible, "gjenåpning viser alle lagrede turer");
  await group(page).getByTestId("storylab-stop").click();
  await idle(page);
  check(original.status === "stopped" && await group(page).getByTestId("storylab-input").isDisabled(), "stopp lagres og låser inndata");
  check(await group(page).getByTestId("storylab-fork").first().isEnabled(), "forgrening er fortsatt lov etter stopp");
  await page.screenshot({ path: `${out}/1-gruppe.png` });
}, { path: "" });

await run("improvisasjon, åttetak, fortsett og pause", async (page) => {
  const session = await createGroup(page, "improv");
  await group(page).getByTestId("storylab-run-batch").click();
  check(await group(page).getByTestId("storylab-confirm-send").isVisible(), "første bolk krever kostnadsbekreftelse");
  await group(page).getByTestId("storylab-confirm-send").click();
  await waitUntil(() => S.gen.length === 8 && session.status === "paused", "første bolk");
  await idle(page);
  check(S.gen.length === 8 && session.turns.length === 8, "bolken stopper etter nøyaktig åtte kall og lagrer alle turer");
  check(/pause/i.test(await group(page).getByTestId("storylab-group-status").innerText()), "status er pause");
  await group(page).getByTestId("storylab-resume").click();
  await waitUntil(() => S.gen.length === 16 && session.status === "paused", "andre bolk");
  await idle(page);
  check(S.gen.length === 16 && session.turns.length === 16, "Fortsett starter en ny bolk med åtte turer");
  S.delay = 700;
  await group(page).getByTestId("storylab-resume").click();
  await waitUntil(() => S.gen.length === 17, "pågående kall");
  await group(page).getByTestId("storylab-pause").click();
  await waitUntil(() => session.status === "paused" && session.turns.length === 17, "pause");
  await idle(page);
  check(S.gen.length === 17 && session.turns.length === 17, "Pause fullfører og lagrer pågående tur uten neste kall");
  check(await group(page).getByTestId("storylab-input").isEnabled(), "regissøren kan spørre under pause");
  await page.screenshot({ path: `${out}/2-improvisasjon.png` });
});

await run("engelsk gruppe", async (page) => {
  await createGroup(page, "improv");
  check(/characters/i.test(await page.getByTestId("storylab").innerText()), "engelsk panelhode");
  check(/next speaker/i.test(await group(page).getByTestId("storylab-next-speaker").innerText()), "engelsk neste taler");
  check(/run batch/i.test(await group(page).getByTestId("storylab-run-batch").innerText()), "engelsk bolkknapp");
  await page.screenshot({ path: `${out}/3-engelsk.png` });
}, { lang: "en" });
await browser.close();
console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
process.exit(fail ? 1 : 0);
