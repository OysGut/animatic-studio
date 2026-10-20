/**
 * Felles oppsett for MTS-nettlesertestene (mts-engine, mts-lower-thirds, mts-nondestructive). Kopi av oppsettet
 * i asset-studio-ui.mjs: mockede serverfunksjoner (ingenting lagres, ingen AI), mocket lagring (også
 * opplasting av malminiatyren) og fast fixture fra make-mts-fixture.ts.
 *   bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json
 *   ENV_FILE=… node tests/visual/mts-engine.mjs <baseUrl> /tmp/claude-0/mts-fixture.json [out]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";

export function harness(defaultOut) {
  const [base = "http://127.0.0.1:8080", fixturePath = "/tmp/claude-0/mts-fixture.json", out = defaultOut] = process.argv.slice(2);
  mkdirSync(out, { recursive: true });
  const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
  const env = readFileSync(process.env.ENV_FILE, "utf8");
  const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
  const ref = new URL(supaUrl).hostname.split(".")[0];
  const USER = { id: "00000000-0000-7000-8000-a11ce0000001", email: "mars@example.no", aud: "authenticated", role: "authenticated" };
  const P = `/prosjekt/${fx.project.id}`;
  const rows = fx.rows;
  const state = { commands: [], uploads: [], uploadBodies: [], rpcs: [], batches: [] };

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
      // Opplasting (malminiatyren): samme svar som Supabase Storage
      if (path.startsWith("/storage/v1/object/") && (request.method() === "POST" || request.method() === "PUT")) {
        const key = path.replace("/storage/v1/object/", "");
        state.uploads.push(key);
        state.uploadBodies.push(request.postDataBuffer());
        return json({ Key: key, Id: "00000000-0000-7000-8000-0000a7999999" });
      }
      if (path.startsWith("/storage/v1/") && /\.(wav|mp3|webm|m4a|ogg)/.test(path)) {
        const rate = 8000, samples = rate * 6, wav = Buffer.alloc(44 + samples * 2);
        wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
        for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i / 8) * 5000), 44 + i * 2);
        return route.fulfill({ status: 200, contentType: "audio/wav", headers: { "Access-Control-Allow-Origin": "*" }, body: wav });
      }
      if (path.startsWith("/storage/v1/")) return route.fulfill({ status: 200, contentType: "image/svg+xml", headers: { "Access-Control-Allow-Origin": "*" }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320"><rect width="240" height="320" fill="#277b85"/><rect x="0" y="210" width="240" height="110" fill="#f3b84a"/><circle cx="120" cy="95" r="55" fill="#f4c9a0"/><path d="M45 210Q120 115 195 210" fill="#e86265"/><circle cx="102" cy="90" r="6"/><circle cx="138" cy="90" r="6"/></svg>' });
      const table = path.replace("/rest/v1/", "");
      if (table === "rpc/my_account") return json({ status: "active", is_admin: false, permanent_admin: false, locale: null, display_name: "Mars", privacy_version: 1, accepted_version: 1, created_at: "2026-10-01T10:00:00Z", ui_prefs: {} });
      if (table === "schema_version") return json([{ version: VISUAL_SCHEMA_VERSION }]);
      if (table === "projects") return json(single ? fx.project : [{ ...fx.project, project_members: [{ user_id: USER.id, role }] }]);
      if (table === "project_members") return json([{ user_id: USER.id, role, joined_at: "2026-10-08T10:00:00Z" }]);
      if (table === "profiles") return json([{ user_id: USER.id, display_name: "Mars" }]);
      if (path.startsWith("/rest/v1/rpc/")) { let body = null; try { body = JSON.parse(request.postData() ?? "null"); } catch { body = null; } state.rpcs.push({ name: path.slice("/rest/v1/rpc/".length), body }); return json(null); }
      if (path.startsWith("/realtime/")) return route.abort();
      return json(single ? rows[table]?.[0] ?? null : Number(url.searchParams.get("offset") ?? 0) > 0 ? [] : rows[table] ?? []);
    });
    await context.route("**/_serverFn/**", async (route) => {
      const name = serverFnName(route.request().url()); const d = dataOf(route.request().postData() ?? "{}");
      const json = (result) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, context: {} }) });
      if (/runCommand/.test(name)) {
        state.commands.push(d.command ?? d.envelope?.command ?? d);
        return json({ ok: true, changeId: "mts", affected: [], inverse: null, revisions: {} });
      }
      if (/pumpProjectQueue/.test(name)) return json({ sent: 0 });
      if (/^listDialogueBatches(?:_|$)/.test(name)) return json(state.batches);
      if (/^createDialogueBatch(?:_|$)/.test(name)) {
        state.rpcs.push({ name: "createDialogueBatch", body: d });
        const existing = state.batches.find(b => b.requestId === d.requestId);
        if (existing) return json({ id: existing.id });
        const id = `00000000-0000-7000-8000-${String(610000 + state.batches.length).padStart(12,"0")}`;
        state.batches.push({ id, requestId: d.requestId, status: "running", pause_reason: null, voice: d.voice, items: d.lines.map((l,i) => ({ id: `${id}:${i}`, block_id: l.key.split(":")[1], occurrence_id: l.key.split(":")[0], language: l.language, status: "waiting", error: null, retryable: true })) });
        return json({ id });
      }
      if (/^advanceDialogueBatch(?:_|$)/.test(name)) { state.rpcs.push({ name: "advanceDialogueBatch", body:d }); const b=state.batches.find(b=>b.id===d.batchId); if(b){for(const item of b.items.slice(0,2))item.status="done";b.status=b.items.every(i=>i.status==="done")?"done":"running";} return json({processed:2}); }
      if (/^undoDialogueBatchJob(?:_|$)/.test(name)) { state.rpcs.push({ name: "undoDialogueBatchJob", body: d }); return json({ undone: 1 }); }
      if (/^reconfirmDialogueBatch(?:_|$)/.test(name)) { state.rpcs.push({ name: "reconfirmDialogueBatch", body: d }); return json({ ok: true }); }
      if (/^resumeDialogueBatch(?:_|$)/.test(name)) { state.rpcs.push({name:"resumeDialogueBatch",body:d});return json({ok:true}); }
      // P8: stilharmonisering (mock – ingen AI)
      if (/^generateImage(?:_|$)/.test(name)) { state.rpcs.push({ name: "generateImage", body: d }); const n = state.rpcs.filter(r => r.name === "generateImage").length; return json({ ok: true, versionId: `00000000-0000-7000-8000-${String(800000 + n).padStart(12, "0")}`, model: d.model || "openai/gpt-image-2", jobId: "00000000-0000-7000-8000-000000080000", media: { path: `${fx.project.id}/assets/generated/${d.assetId}/mock-${n}.png`, mimeType: "image/png", width: 1024, height: 1536, byteSize: 2048, sha256: "c".repeat(64) } }); }
      // M6: tekst-AI (mock – ingen AI). Svarer med ID-ene som står i prompten.
      if (/^generateText(?:_|$)/.test(name)) {
        state.rpcs.push({ name: "generateText", body: d });
        const user = d.messages?.[d.messages.length - 1]?.content ?? "";
        let text = "{}";
        if (/update animatic material/.test(d.system ?? "")) {
          const images = [...user.matchAll(/assetId ([0-9a-f-]{36})/g)].map((m) => ({ assetId: m[1], prompt: "The character looks up at the snowy sky, same design as before." }));
          const shots = [...user.matchAll(/blockId ([0-9a-f-]{36})/g)].map((m) => ({ blockId: m[1], text: "Close-up: she looks up as the snow begins." }));
          text = JSON.stringify({ images, shots });
        } else if (/resolve references/.test(d.system ?? "")) {
          const links = [...user.matchAll(/ITEM key=(\S+)\nWORD: [^\n]*\nCANDIDATES: ([0-9a-f-]{36})/g)].map((m) => ({ key: m[1], assetId: m[2] }));
          text = JSON.stringify({ links });
        }
        return json({ ok: true, text, provider: "lovable", model: "built-in", usage: { inputTokens: 10, outputTokens: 10 }, costUsd: 0, usedFallback: false, reason: "pref", keyOwner: "lovable", jobId: "00000000-0000-7000-8000-000000090000" });
      }
      if (/^listHarmonizeBatches(?:_|$)/.test(name)) return json(state.batches);
      if (/^createHarmonizeBatch(?:_|$)/.test(name)) {
        state.rpcs.push({ name: "createHarmonizeBatch", body: d });
        const existing = state.batches.find(b => b.requestId === d.requestId);
        if (existing) return json({ id: existing.id });
        const id = `00000000-0000-7000-8000-${String(650000 + state.batches.length).padStart(12, "0")}`;
        state.batches.push({ id, requestId: d.requestId, status: "running", pause_reason: null, style_profile_id: d.styleProfileId, reference_version_id: d.referenceVersionId, model: "m", items: d.items.map((i, k) => ({ id: `${id}:${k}`, asset_id: i.assetId, source_version_id: i.sourceVersionId, version_id: `v${k}`, status: "waiting", error: null, retryable: true })) });
        return json({ id });
      }
      if (/^advanceHarmonizeBatch(?:_|$)/.test(name)) { state.rpcs.push({ name: "advanceHarmonizeBatch", body: d }); const b = state.batches.find(b => b.id === d.batchId); if (b) { for (const item of b.items.slice(0, 2)) item.status = "done"; b.status = b.items.every(i => i.status === "done") ? "done" : "running"; } return json({ processed: 2 }); }
      if (/^resumeHarmonizeBatch(?:_|$)/.test(name)) { state.rpcs.push({ name: "resumeHarmonizeBatch", body: d }); return json({ ok: true }); }
      if (/^listVoices(?:_|$)/.test(name)) return json({ ok: true, voices: [{ voiceId: "mock_voice", name: "Test voice", description: "Custom voice", previewUrl: null }, { voiceId: "other_voice", name: "Alternative voice", description: "", previewUrl: null }] });
      if (/^listSpeechModels(?:_|$)/.test(name)) return json({ ok: true, models: [{ modelId: "eleven_v3", name: "Eleven v3", languages: [{ code: "no", name: "Norwegian" }, { code: "es", name: "Spanish" }], maxCharacters: 5000, costMultiplier: 1 }] });
      if (/^generateSpeech(?:_|$)/.test(name)) { state.rpcs.push({ name: "generateSpeech", body: d }); return json({ ok: true, assetId: "00000000-0000-7000-8000-00000000d401", versionId: "00000000-0000-7000-8000-00000000d402", text: "Mock dialogue", scriptRevision: d.scriptRevision, costUsd: 0.001, media: { path: `${fx.project.id}/mock-speech.wav`, mimeType: "audio/wav", width: null, height: null, byteSize: 96044, sha256: "a".repeat(64) } }); }
      if (/projectAiProviders|listTextChoices/.test(name)) return json({ providers: [], missing: false });
      if (/listStorySessions/.test(name)) return json({ ok: true, sessions: [] });
      if (/listStorySuggestions/.test(name)) return json({ ok: true, suggestions: [] });
      if (/listEntityAnalysis/.test(name)) return json({ rows: [] });
      return json({ ok: true, lock: null });
    });
  }

  let pass = 0, fail = 0;
  const check = (condition, description) => { console.log(`  ${condition ? "ok" : "FEIL"} ${description}`); condition ? pass++ : fail++; };
  let browser;

  /** Åpner sceneeditoren for sceneforekomsten (occurrenceId, som `?scene=` tar) på språket. */
  async function open(sceneId, lang = "nb", role = "owner") {
    browser ??= await chromium.launch({ headless: true, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 1800 }, colorScheme: "dark", permissions: ["microphone"] });
    await mock(context, role);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const exp = Math.floor(Date.now() / 1000) + 86400;
    await page.evaluate(([key, value, l]) => { localStorage.setItem(key, value); localStorage.setItem("animatic:lang", l); }, [`sb-${ref}-auth-token`, JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: USER }), lang]);
    await page.goto(`${base}${P}/scene?scene=${sceneId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    return { context, page, errors };
  }

  async function scenario(name, sceneId, lang, fn) {
    state.commands = [];
    state.uploads = [];
    state.uploadBodies = [];
    state.rpcs = [];
    state.batches = [];
    let ctx;
    try {
      ctx = await open(sceneId, lang);
      await fn(ctx.page);
      check(ctx.errors.length === 0, `${name}: ingen kjørefeil (${ctx.errors.join(" | ").slice(0, 200)})`);
    } catch (error) {
      fail++;
      console.log(`  FEIL ${name}: ${String(error).split("\n")[0]}`);
      await ctx?.page.screenshot({ path: `${out}/${name}-failed.png` }).catch(() => {});
    }
    await ctx?.context.close();
  }

  /** Velger laget med radens valgknapp (aria-pressed). Midt på raden ligger flytt-/slettknappene, som vises ved peker over. */
  const selectLayer = async (page, layerId) => {
    const row = page.locator(`[data-layer-row="${layerId}"]`).first();
    await row.locator("button[aria-pressed]").first().click();
    await row.locator('button[aria-pressed="true"]').first().waitFor({ timeout: 5000 });
  };
  const waitHidden = (loc) => loc.waitFor({ state: "hidden", timeout: 5000 });
  /** Åpner «Tekst»-menyen og velger et punkt; venter til menyen er lukket. */
  async function menu(page, testId) {
    await page.getByTestId("mts-text-menu").click();
    await page.getByTestId(testId).click();
    await waitHidden(page.getByTestId(testId));
  }
  /** Feltene for laget i siste UpdateLayers/AddLayers som rører det. */
  function lastFields(layerId) {
    for (let i = state.commands.length - 1; i >= 0; i--) {
      const c = state.commands[i];
      const steps = c?.type === "ApplyTemplate" ? c.steps : [c];
      for (const st of [...(steps ?? [])].reverse()) {
        const l = (st?.layers ?? []).find((x) => x.layerId === layerId);
        if (l) return l.fields;
      }
    }
    return null;
  }
  /** Spør etter `cond` med jevne mellomrom til den er sann eller tiden går ut (for kontroller som venter på en sendt kommando). */
  async function eventually(cond, ms = 3000) {
    const end = Date.now() + ms;
    for (;;) {
      let v = false;
      try { v = await cond(); } catch { v = false; }
      if (v) return true;
      if (Date.now() >= end) return false;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  async function finish() {
    console.log(`RESULTAT ${pass} bestått, ${fail} feilet`);
    await browser?.close();
    process.exitCode = fail ? 1 : 0;
  }
  return { fx, M: fx.mts, rows, state, check, scenario, selectLayer, waitHidden, menu, lastFields, eventually, finish, out, base, P };
}
