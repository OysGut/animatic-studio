/**
 * Nettlesertest DEC-0094 (fase 2, bolk C): lydeditoren i lydvinduet – takes og komposisjon i samme vindu,
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
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { uiLang } from "./ui-lang.mjs";
const EN = uiLang("nb") === "en";
import { readFileSync, mkdirSync } from "node:fs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/dec0094",
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
    if (table === "schema_version") return json([{ version: VISUAL_SCHEMA_VERSION }]);
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
async function run(name, act, { lang: askedLang = "nb", width = 1600, height = 900, path = "", mobile = false } = {}) {
  const lang = uiLang(askedLang);
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




const LINEASSET = fx.rows.assets.find((a) => a.name === "Maja – Hører du det");
const lenOf = async (page) => Number(/\(([\d.]+) s\)/.exec(await page.getByTestId("audio-editor-length").innerText())?.[1] ?? "NaN");

await run(
  "e01-lydeditor",
  async (page) => {
    await page.getByRole("button", { name: EN ? /Record audio: Recordings for “Maja – Hører du det”/ : /Ta opp lyd: Opptak til «Maja – Hører du det»/ }).click();
    await page.waitForTimeout(900);
    const dlg = page.getByTestId("audio-takes-dialog");
    // Et nytt opptak på PC, så det finnes to takes
    await dlg.getByTestId("pc-rec-start").click();
    await page.waitForTimeout(1500);
    await dlg.getByTestId("pc-rec-stop").click();
    await page.waitForTimeout(700);
    await dlg.getByTestId("pc-rec-keep").click();
    await page.waitForTimeout(1500);
    check((await dlg.getByTestId("audio-takes-list").locator("li").count()) === 2, "to takes i vinduet");
    await dlg.getByTestId("audio-take-edit").last().click();
    await page.waitForTimeout(1500);
    const ed = dlg.getByTestId("audio-editor");
    check(await ed.isVisible(), "lydeditoren åpnes i samme vindu som takene (REQ-0691)");
    check((await ed.getByTestId("audio-editor-seg").count()) === 1, "den eksisterende lyden er én del på dialogsporet");
    const painted = await ed.locator("[data-testid=audio-editor-seg] canvas").evaluate((c) => {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    });
    check(painted > 200, `bølgeformen er tegnet (${painted} punkter)`);
    const before = await lenOf(page);
    check(Math.abs(before - 3.5) < 0.05, `lengden er opptakets (${before} s)`);
    await page.screenshot({ path: `${out}/e01a-editor.png` });
    const block = ed.getByTestId("audio-editor-seg").first();
    const box = await block.boundingBox();
    if (!box) throw new Error("mangler lydsegment");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    const movedAt = Number(await block.getAttribute("data-at-ms"));
    check(movedAt > 0, `dra flytter delen (${movedAt} ms)`);
    await ed.getByTestId("audio-editor-undo").click();
    check(Number(await block.getAttribute("data-at-ms")) === 0, "én angring gjenoppretter hele draget");
    check(await ed.getByTestId("audio-editor-undo").isDisabled(), "pekerbevegelsene opprettet ikke ekstra angresteg");
    await ed.getByRole("button", { name: EN ? "Redo" : "Gjør om", exact: true }).click();
    check(Number(await block.getAttribute("data-at-ms")) === movedAt, "gjør om gjenoppretter draget");
    await ed.getByTestId("audio-editor-undo").click();
    // Sett inn det nye opptaket etter
    await ed.getByTestId("audio-editor-take").selectOption({ index: 1 });
    await ed.getByTestId("audio-editor-after").click();
    await page.waitForTimeout(300);
    const after = await lenOf(page);
    check(after > before + 0.5, `«Sett inn etter» gjør lyden lengre (${before} → ${after} s)`);
    check((await ed.getByTestId("audio-editor-seg").count()) === 2, "to deler på sporet");
    await ed.getByTestId("audio-editor-undo").click();
    await page.waitForTimeout(200);
    check(Math.abs((await lenOf(page)) - before) < 0.01, "angre gir den forrige lyden tilbake (REQ-0695)");
    await ed.getByRole("button", { name: EN ? "Redo" : "Gjør om" }).click();
    await page.waitForTimeout(200);
    check(Math.abs((await lenOf(page)) - after) < 0.01, "gjør om");
    // Legg oppå
    await ed.getByTestId("audio-editor-over").click();
    await page.waitForTimeout(200);
    check(await ed.getByTestId("audio-editor-track-1").locator("[data-testid=audio-editor-seg]").count() === 1, "«Legg oppå» gir et eget spor");
    await ed.getByTestId("audio-editor-undo").click();
    // Marker et område ved å dra i linjalen og erstatt det
    const r = await ed.getByTestId("audio-editor-ruler").boundingBox();
    await page.mouse.move(r.x + r.width * 0.1, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.2, r.y + r.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    check(await ed.getByTestId("audio-editor-range-mark").isVisible(), "området er markert");
    const segsBefore = await ed.getByTestId("audio-editor-seg").count();
    await ed.getByTestId("audio-editor-range").click();
    await page.waitForTimeout(300);
    check((await ed.getByTestId("audio-editor-seg").count()) > segsBefore, "«Erstatt området» deler lyden og setter inn opptaket (REQ-0692)");
    await page.screenshot({ path: `${out}/e01b-omrade.png` });
    // Trim: velg første del og sett lengden
    await ed.getByTestId("audio-editor-seg").first().click();
    await ed.getByTestId("audio-editor-seg-length").fill("0.4");
    await ed.getByTestId("audio-editor-seg-length").press("Enter");
    await page.waitForTimeout(200);
    check((await ed.getByTestId("audio-editor-seg-length").inputValue()) === "0.4", "delen er trimmet");
    // Avspilling (samme miks som lagres)
    // (fjern områdevalget ved å klikke i linjalen, så hele komposisjonen spilles)
    await page.mouse.click(r.x + 2, r.y + r.height / 2);
    await ed.getByTestId("audio-editor-play").click();
    await page.waitForTimeout(400);
    check((EN ? /Stop/ : /Stopp/).test(await ed.getByTestId("audio-editor-play").innerText()), "forhåndsavspilling av komposisjonen");
    await ed.getByTestId("audio-editor-play").click();
    // Lagre som ny versjon: komposisjonen sendes med
    const uploadsBefore = PC.uploads;
    const n0 = COMMANDS.length;
    await ed.getByTestId("audio-editor-save").click();
    await page.waitForTimeout(2500);
    const sent = COMMANDS.slice(n0).join(" ");
    check(PC.uploads === uploadsBefore + 1, "miksen lastes opp som WAV");
    check(/AddAssetVersion/.test(sent) && /segments/.test(sent) && /sourceInMs/.test(sent), "ny versjon med komposisjonen (REQ-0693)");
    check(!/UpdateAudioClips|SetAudioClips/.test(sent), "ingen lydklipp i scenen endres når komposisjonen lagres (REQ-0694)");
    await page.screenshot({ path: `${out}/e01c-lagret.png` });
    // Eksport: hele som WAV, så MP3
    await ed.getByTestId("audio-export").locator("summary").click();
    // (Playwright gir «download» som navn for filnavn med æ/ø/å; vanlige nettlesere bruker navnet)
    await ed.getByTestId("audio-export").getByRole("textbox").fill("maja-replikk");
    const [dl] = await Promise.all([page.waitForEvent("download"), ed.getByTestId("audio-export-download").click()]);
    const wavPath = await dl.path();
    const { readFileSync } = await import("node:fs");
    const w = readFileSync(wavPath);
    check(w.subarray(0, 4).toString() === "RIFF" && w.readUInt32LE(24) === 48000, `WAV, 48 kHz (${dl.suggestedFilename()})`);
    await ed.getByTestId("audio-export-format").selectOption("mp3");
    const [dl2] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), ed.getByTestId("audio-export-download").click()]);
    const m = readFileSync(await dl2.path());
    const isMp3 = m.subarray(0, 3).toString() === "ID3" || (m[0] === 0xff && (m[1] & 0xe0) === 0xe0);
    check(dl2.suggestedFilename().endsWith(".mp3") && isMp3 && m.length > 1000, `MP3 (${m.length} byte)`);
    await ed.getByTestId("audio-export-what").selectOption("take");
    await ed.getByTestId("audio-export-format").selectOption("wav");
    const [dl3] = await Promise.all([page.waitForEvent("download"), ed.getByTestId("audio-export-download").click()]);
    const t = readFileSync(await dl3.path());
    const takeSec = t.readUInt32LE(40) / 2 / 48000;
    check(Math.abs(takeSec - 3.5) < 0.05, `ett take eksporteres for seg (${takeSec.toFixed(2)} s)`);
    await page.screenshot({ path: `${out}/e01d-eksport.png` });
  },
  { path: `/bibliotek?asset=${LINEASSET.id}` },
);

console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
await browser.close();
