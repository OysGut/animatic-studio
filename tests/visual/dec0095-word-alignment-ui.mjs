/**
 * Nettlesertest DEC-0095 (fase 2, bolk D): ord-til-lyd i lydeditoren – replikken som ord, valg av tjeneste
 * (huskes), kostnadsgodkjenning før analysen, ord markerer lyden (ett og flere ord), avspilling med kontekst,
 * usikre ord, kobling for hånd, status for tekst mot lyd og fremheving over opptaksknappene.
 * Bygger på dec0094-audio-editor-ui.mjs (samme mocking).
 *
 * Opprinnelig DEC-0094 (fase 2, bolk C): lydeditoren i lydvinduet – takes og komposisjon i samme vindu,
 * bølgeformer, sett inn etter, angre/gjør om, områdevalg og «Erstatt området», trim, konflikt med andre
 * replikker, lagre som ny versjon med komposisjonen, og eksport til WAV og MP3 (hele, område og ett take).
 * Bygger på dec0093-audio-ui.mjs (samme mocking) og serverer ekte WAV-filer for lydopptakene.
 *
 * Opprinnelig DEC-0093 (fase 2, bolk B): lydopptak – mikrofonikonet i lydressursen, inspektøren for en replikk
 * og lydklippet; lydvinduet med PC-opptak og QR-koden samtidig, opptak med falsk mikrofon, «Behold» som nytt
 * take; mobilsiden for en replikk med hele replikken, takes som bare ligger på telefonen til de velges, og
 * romlyd. Bygger på dec0090-mobile-ui.mjs (samme mocking).
 *
 * Opprinnelig DEC-0090 (fase 2, bolk A): mobilbroen – «Importer fra mobil» med QR-koden med en gang, kameraikon
 * i ressurs, sceneeditor og bildevalg for lag, mobilsiden (velg bilder, hurtigfoto med kamera, video, «Del
 * lenke», utløpt lenke), og «Mobilimport» i biblioteket med filtre og tilbakekalling. Mocker Supabase og
 * serverfunksjonene (ingenting lagres eller betales). Kameraet er Chromiums falske kamera.
 *   ENV_FILE=…/.env node dec0090-mobile-ui.mjs <baseUrl> <fixture.json> [utmappe]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/dec0095",
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
const OCC1 = "00000000-0000-7000-8000-000000000006";
const SESSION = "00000000-0000-7000-8000-00000000e001";
const SHARED = "00000000-0000-7000-8000-00000000e002";
const NOW = new Date().toISOString();
const SESSIONS = [
  {
    id: SESSION, project_id: project.id, kind: "personal", parent_id: null, created_by: "00000000-0000-7000-8000-a11ce0000001",
    creator_name: "Mars", context: { type: "asset", assetId: MAJA.id }, label: "Bilder av Maja", media_kinds: ["image", "video"],
    expires_at: new Date(Date.now() + 3600_000).toISOString(), revoked_at: null, max_files: 1000, max_bytes: 1e10,
    files_count: 2, bytes_total: 2000, last_seen_at: NOW, created_at: NOW,
  },
  {
    id: SHARED, project_id: project.id, kind: "shared", parent_id: SESSION, created_by: "00000000-0000-7000-8000-a11ce0000001",
    creator_name: "Mars", context: { type: "asset", assetId: MAJA.id }, label: "Bilder av Maja", media_kinds: ["image", "video"],
    expires_at: new Date(Date.now() + 6 * 86400_000).toISOString(), revoked_at: null, max_files: 200, max_bytes: 5e9,
    files_count: 1, bytes_total: 1000, last_seen_at: null, created_at: NOW,
  },
];
const imp = (id, kind, extra = {}) => ({
  id, project_id: project.id, session_id: SESSION, client_file_id: id, path: `${project.id}/source/mobile/${SESSION}/${id}.${kind === "video" ? "mp4" : "jpg"}`,
  kind, mime_type: kind === "video" ? "video/mp4" : "image/jpeg", byte_size: 1000, file_name: kind === "video" ? "klipp.mp4" : "maja.jpg",
  contributor_name: "", status: "done", error: null, context: { type: "asset", assetId: MAJA.id }, asset_id: MAJA.id,
  asset_version_id: kind === "image" ? "00000000-0000-7000-8000-00000000f0f0" : null, take_id: null, claimed_by: null, claimed_at: null,
  dismissed: false, created_at: NOW, confirmed_at: NOW, ...extra,
});
const IMPORTS = [
  imp("00000000-0000-7000-8000-00000000d001", "image"),
  imp("00000000-0000-7000-8000-00000000d002", "video", { asset_version_id: null }),
  imp("00000000-0000-7000-8000-00000000d003", "image", { session_id: SHARED, contributor_name: "Fotograf Kari", asset_version_id: null, asset_id: null, context: { type: "project" } }),
];
const rows = { ...fx.rows, upload_sessions: SESSIONS, mobile_imports: IMPORTS };
const TOKEN = "T".repeat(43);
let audioSession = false;
const ALIGN = { calls: 0, approved: false, text: "" };
const uploaded = new Map();
function wav(seconds, freq = 220) {
  const rate = 8000;
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 0.5 * 32767), 44 + i * 2);
  return buf;
}
const PC = { uploads: 0 };
const MOBILE = { tickets: 0, uploads: 0, confirms: 0, shares: 0, created: 0, revoked: 0 };
let expired = false;
/** Kontoens visningsvalg (profiles.ui_prefs) slik serveren ville lagret dem. */
const SERVER_PREFS = {};
const COMMANDS = [];
function serverFnName(url) {
  try {
    const b64 = new URL(url).pathname.split("/_serverFn/")[1];
    return JSON.parse(Buffer.from(decodeURIComponent(b64), "base64url").toString("utf8")).export;
  } catch {
    return "?";
  }
}
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
      const bucket = path.split("/").pop();
      return json(
        (body.paths ?? []).map((p) => ({
          path: p,
          signedURL: `/object/sign/${bucket}/${p}?token=t`,
          error: null,
        })),
      );
    }
    if (path.startsWith("/storage/v1/object/sign/")) {
      const key = path.replace("/storage/v1/object/sign/assets/", "");
      if (uploaded.has(key)) return route.fulfill({ status: 200, contentType: "audio/wav", body: uploaded.get(key) });
      if (path.endsWith(".wav")) return route.fulfill({ status: 200, contentType: "audio/wav", body: wav(path.includes("maja") ? 3.5 : 20) });
      const n = (path.length * 37) % 360;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 300 400"><rect width="300" height="400" fill="hsl(${n} 25% 22%)"/><circle cx="150" cy="120" r="60" fill="hsl(${n} 45% 70%)"/></svg>`;
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
    }
    const table = path.replace("/rest/v1/", "");
    if (table === "rpc/my_account")
      return json({
        status: "active",
        is_admin: false,
        permanent_admin: false,
        locale: null,
        display_name: "Mars",
        privacy_version: 1,
        accepted_version: 1,
        created_at: "2026-10-01T10:00:00Z",
        ui_prefs: SERVER_PREFS,
      });
    if (table === "rpc/set_my_ui_prefs") {
      const body = JSON.parse(req.postData() ?? "{}");
      for (const [k, v] of Object.entries(body.p_prefs ?? {})) {
        if (v === null) delete SERVER_PREFS[k];
        else SERVER_PREFS[k] = v;
      }
      return json(null);
    }
    if (table === "schema_version") return json([{ version: 37 }]);
    if (path.startsWith("/storage/v1/object/assets/") && req.method() === "POST") {
      PC.uploads++;
      uploaded.set(path.replace("/storage/v1/object/assets/", ""), req.postDataBuffer() ?? Buffer.alloc(0));
      return json({ Key: path.replace("/storage/v1/object/", "") });
    }
    if (path.startsWith("/storage/v1/object/upload/sign/")) {
      MOBILE.uploads++;
      return json({ Key: path.replace("/storage/v1/object/upload/sign/", "") });
    }
    if (table === "rpc/revoke_upload_session") {
      MOBILE.revoked++;
      return json(null);
    }
    if (table === "projects") {
      if (single) return json(project);
      return json([{ ...project, project_members: [{ role: "owner", user_id: USER.id }] }]);
    }
    if (table === "project_members")
      return json([{ user_id: USER.id, role: "owner", joined_at: "2026-10-08T10:00:00Z" }]);
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
    const json = (result) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result, context: {} }),
      });
    if (/runCommand/.test(name)) {
      COMMANDS.push(route.request().postData() ?? "");
      return json({ ok: true, changeId: "x", affected: [], inverse: null, revisions: {} });
    }
    if (/projectAiProviders/.test(name)) return json({ providers: [], missing: false });
    if (/alignAudio/.test(name)) {
      ALIGN.calls++;
      const body = route.request().postData() ?? "";
      ALIGN.approved = /"approved"/.test(body);
      // Ordene i replikken med 300 ms hver; det tredje ordet mangler (usikkert)
      const words = ALIGN.text.split(/\s+/).filter(Boolean).map((w, i) => ({ text: w, start: 0.2 + i * 0.3, end: 0.45 + i * 0.3, loss: 0.2 })).filter((_, i) => i !== 2);
      return json({ ok: true, words, loss: 0.2, model: "elevenlabs/forced-alignment", text: ALIGN.text, costUsd: 0 });
    }
    if (/createUploadSession/.test(name)) {
      MOBILE.created++;
      return json({ ok: true, message: "", sessionId: SESSION, token: TOKEN, expiresAt: new Date(Date.now() + 7200_000).toISOString() });
    }
    if (/mobileSession/.test(name))
      return json(
        expired
          ? { ok: false, message: "Lenken er utløpt eller tilbakekalt. Be om en ny QR-kode." }
          : audioSession
            ? { ok: true, message: "", kind: "personal", label: "Scene 1 · MAJA", from: "Mars", mediaKinds: ["audio"], expiresAt: new Date(Date.now() + 7200_000).toISOString(), remainingFiles: 990, script: { speaker: "MAJA", parenthetical: "(hvisker)", text: "Jeg tror det er noen der ute. Vi må gå og se." } }
            : { ok: true, message: "", kind: "personal", label: "Bilder av Maja", from: "Mars", mediaKinds: ["image", "video"], expiresAt: new Date(Date.now() + 7200_000).toISOString(), remainingFiles: 990 },
      );
    if (/mobileUploadTicket/.test(name)) {
      MOBILE.tickets++;
      const body = route.request().postData() ?? "";
      const id = /"clientFileId":"([^"]+)"/.exec(body)?.[1] ?? "x";
      return json({ ok: true, message: "", path: `${project.id}/source/mobile/${SESSION}/${id}.jpg`, uploadToken: "u" });
    }
    if (/mobileConfirmUpload/.test(name)) {
      MOBILE.confirms++;
      return json({ ok: true, message: "" });
    }
    if (/mobileShareLink/.test(name)) {
      MOBILE.shares++;
      return json({ ok: true, message: "", token: "S".repeat(43), expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString() });
    }
    if (/pumpProjectQueue/.test(name)) return json({ sent: 0 });
    return route.abort();
  });
}

const ARGS = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];
const browser = await chromium
  .launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ARGS })
  .catch(() => chromium.launch({ args: ARGS }));
let pass = 0,
  fail = 0;
const check = (ok, text) => {
  console.log(`  ${ok ? "✓" : "✗"} ${text}`);
  ok ? pass++ : fail++;
};

/** Ny nettleser (tomt lokalt lager) som åpner sceneeditoren. */
async function run(name, act, { lang = "nb", width = 1600, height = 900, path = "", mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: "dark", ...(mobile ? { isMobile: true, hasTouch: true, permissions: ["camera", "microphone"] } : { permissions: ["microphone"] }) });
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
      JSON.stringify({
        access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig",
        refresh_token: "r",
        token_type: "bearer",
        expires_in: 86400,
        expires_at: exp,
        user: USER,
      }),
      lang,
    ],
  );
  await page.goto(base + (mobile ? path : P + path), { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  try {
    await act(page);
  } catch (e) {
    errors.push("act: " + e.message.split("\n")[0]);
  }
  console.log(name, errors.length ? "FEIL: " + errors.join(" | ").slice(0, 800) : "ok");
  if (errors.length) fail++;
  await ctx.close();
}





const occRow = fx.rows.scene_occurrences.find((o) => o.id === OCC1);
const CLIP = fx.rows.audio_clips.find((a) => a.occurrence_id === OCC1 && a.block_id && a.kind === "dialogue" && !a.language);
const LINE = fx.rows.script_blocks.find((b) => b.id === CLIP.block_id);
ALIGN.text = LINE.text;
const nWords = LINE.text.split(/\s+/).filter(Boolean).length;

await run(
  "w01-ord-til-lyd",
  async (page) => {
    const mic = page.getByRole("button", { name: /Ta opp lyd: Scene/ }).first();
    await mic.click();
    await page.waitForTimeout(900);
    const dlg = page.getByTestId("audio-takes-dialog");
    check(await dlg.getByTestId("line-status").isVisible(), "status for tekst mot lyd vises med tegn og tekst (REQ-0703)");
    await dlg.getByTestId("audio-take-edit").first().click();
    await page.waitForTimeout(1500);
    const panel = dlg.getByTestId("line-words");
    check(await panel.isVisible(), "replikken vises som ord i lydeditoren (REQ-0700)");
    check((await panel.getByTestId("line-word").count()) === nWords, `alle ${nWords} ordene er klikkbare`);
    check((await panel.getByTestId("line-words-service").inputValue()) === "elevenlabs", "ElevenLabs er valgt som standard");
    await panel.getByTestId("line-words-analyse").click();
    await page.waitForTimeout(200);
    check(await panel.getByTestId("line-words-cost").isVisible(), "kostnaden vises før analysen (REQ-0699)");
    check(ALIGN.calls === 0, "ingenting sendes før kostnaden er godkjent");
    const n0 = COMMANDS.length;
    await panel.getByTestId("line-words-approve").click();
    await page.waitForTimeout(1500);
    check(ALIGN.calls === 1 && ALIGN.approved, "analysen kjøres med godkjenning");
    check(/SetVersionAlignment/.test(COMMANDS.slice(n0).join(" ")), "koblingen lagres på opptaket (kan angres)");
    check((await panel.locator('[data-testid=line-word][data-state="uncertain"]').count()) === 1, "ordet tjenesten ikke fant, vises som usikkert");
    // Ett ord, så flere ord
    await panel.getByTestId("line-word").nth(0).click();
    await page.waitForTimeout(200);
    const r1 = await dlg.getByTestId("audio-editor-range-mark").boundingBox();
    check(!!r1, "T1: ett ord markerer lyden");
    await panel.getByTestId("line-word").nth(3).click({ modifiers: ["Shift"] });
    await page.waitForTimeout(200);
    const r2 = await dlg.getByTestId("audio-editor-range-mark").boundingBox();
    check(r2 && r1 && r2.width > r1.width * 2, "T2: flere ord gir det samlede området");
    check(await dlg.getByTestId("line-marked").isVisible(), "de markerte ordene fremheves i replikken over opptaksknappene (REQ-0685)");
    await panel.getByTestId("line-words-play-context").click();
    await page.waitForTimeout(300);
    check(/Stopp/.test(await dlg.getByTestId("audio-editor-play").innerText()), "T3: avspilling med kontekst");
    await dlg.getByTestId("audio-editor-play").click();
    await page.screenshot({ path: `${out}/w01a-ord.png` });
    // Kobling for hånd: velg manuelt, marker ett ord og et område
    await panel.getByTestId("line-words-service").selectOption("manual");
    await panel.getByTestId("line-word").nth(2).click();
    const r = await dlg.getByTestId("audio-editor-ruler").boundingBox();
    await page.mouse.move(r.x + r.width * 0.2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.25, r.y + r.height / 2, { steps: 4 });
    await page.mouse.up();
    const n1 = COMMANDS.length;
    await panel.getByTestId("line-words-link").click();
    await page.waitForTimeout(800);
    check(/SetVersionAlignment/.test(COMMANDS.slice(n1).join(" ")) && /manual/.test(COMMANDS.slice(n1).join(" ")), "et ord kan kobles for hånd uten analyse");
    check((await panel.locator('[data-testid=line-word][data-state="uncertain"]').count()) === 0, "ordet er ikke lenger usikkert");
    await page.screenshot({ path: `${out}/w01b-hand.png` });
  },
  { path: `/manus?scene=${OCC1}&blokk=${LINE.id}` },
);

await run(
  "w02-valget-huskes",
  async (page) => {
    await page.getByRole("button", { name: /Ta opp lyd: Scene/ }).first().click();
    await page.waitForTimeout(900);
    const dlg = page.getByTestId("audio-takes-dialog");
    await dlg.getByTestId("audio-take-edit").first().click();
    await page.waitForTimeout(1200);
    check((await dlg.getByTestId("line-words-service").inputValue()) === "manual", "valget av tjeneste huskes (REQ-0699)");
  },
  { path: `/manus?scene=${OCC1}&blokk=${LINE.id}` },
);

console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
await browser.close();
