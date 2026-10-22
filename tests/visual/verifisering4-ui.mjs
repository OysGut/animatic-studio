/**
 * Verifiseringsrunde 4 (DEC-0076) i nettleseren. Dokumentert i docs/development/VISUAL_QA_DEC-0076.md.
 *
 *   REQ-0280  Kostnadsanslaget (CostLines) i bekreftelsene – video for én scene, video for flere scener,
 *             «Oppdater med AI», bilde og lyd: de sju elementene vises; ingenting sendes før bekreftelse.
 *   REQ-0318  «Sammenlign versjoner …»: to versjoner av en scene side ved side med felles avspillingshode.
 *   REQ-0210  Sceneeditorens avspilling: bilde, kamera/animasjon og lyd i takt (Web Audio måles mot bildet).
 *   REQ-0578  Naboscener: forrige/neste scene spilles som film med lyd og overgang; lagvelgeren viser bare
 *             scenens egne lag.
 *   REQ-0559  Dobbeltklikk på et lag i lerretet eller i laglisten åpner bildevalget for laget.
 *   REQ-0583  Lydopptak (falsk mikrofon i Chromium): start/stopp, lagt ved avspillingshodet, trimmes uten at
 *             filen endres.
 *   REQ-0214/REQ-0418  Hybrid montering og eksport: 2D-scene, importert film, AI-video og stillbilde med lyd
 *             fra flere kilder – vises i monteringen og eksporteres som én fil i riktig rekkefølge med lyd.
 *   REQ-0050  Manussidene i nettleseren: US Letter (8,5 × 11), Courier Prime 12 pt, 10 tegn per tomme,
 *             spalter for handling, replikk, karakter og parentes.
 *
 * Supabase-svarene mockes som i verifisering3-ui.mjs, og alle kall til appens serverfunksjoner besvares her
 * (leverandørlisten og lagringen av kommandoer); ingen ekte tjenester kalles. Testfilmene lages med ffmpeg.
 *
 *   ENV_FILE=…/.env node verifisering4-ui.mjs <baseUrl> <fixture.json> [utmappe]
 * Skjermbilder lagres i utmappen (standard /tmp/claude-0/qa76). Avslutter med kode 1 hvis en kontroll feiler.
 */
import { chromium } from "playwright";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, existsSync, statSync } from "node:fs";

const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/qa76",
] = process.argv.slice(2);
mkdirSync(`${out}/media`, { recursive: true });
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE ?? new URL("../../.env", import.meta.url), "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const STYLES = readFileSync(
  process.env.ENV_FILE
    ? process.env.ENV_FILE.replace(/[^/]*$/, "src/styles.css")
    : new URL("../../src/styles.css", import.meta.url),
  "utf8",
);
const USER = {
  id: "00000000-0000-7000-8000-a11ce0000001",
  email: "mars@example.no",
  aud: "authenticated",
  role: "authenticated",
};
const project = fx.project;
const P = `/prosjekt/${project.id}`;
const ONLY = process.env.ONLY?.split(",");
const id = (n) => `00000000-0000-7000-8000-${n.padStart(12, "0")}`;

// ---------- Resultater ----------

const results = [];
function check(req, name, ok, detail = "") {
  results.push({ req, name, ok: !!ok, detail });
  console.log(`${ok ? "  OK  " : "  FEIL"} [${req}] ${name}${detail ? ` – ${detail}` : ""}`);
}

// ---------- Testmateriale: filmer i rene farger med tone (ffmpeg) ----------

function makeFilm(name, color, seconds, freq) {
  const file = `${out}/media/${name}.webm`;
  if (!existsSync(file) || statSync(file).size < 1000)
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=640x360:r=25:d=${seconds}`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${freq}:sample_rate=48000:duration=${seconds}`,
      "-c:v",
      "libvpx",
      "-b:v",
      "400k",
      "-c:a",
      "libopus",
      "-shortest",
      file,
    ]);
  return readFileSync(file);
}
const RED_FILM = makeFilm("rod-12s", "0xE01010", 12, 440);
const GREEN_FILM = makeFilm("gronn-4s", "0x10C020", 4, 880);
/** Stillbildet: en blå PNG (som et ekte bilde i biblioteket). */
const BLUE_PNG = (() => {
  const file = `${out}/media/bla.png`;
  if (!existsSync(file))
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x1030E0:s=640x360",
      "-frames:v",
      "1",
      file,
    ]);
  return readFileSync(file);
})();

/** Enkel WAV (mono, 8 kHz) med en tone (som screens.mjs). */
function wav(seconds) {
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
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * t) * 0.6 * 32767), 44 + i * 2);
  }
  return buf;
}

// ---------- Fixturen med materiale av alle typer (REQ-0214/0418) og en AI-video som avviker (REQ-0280) ----------

const OCC = {
  s1: id("6"),
  s2: id("11"),
  s3: id("1c"),
  s7: id("48"),
  s8: id("53"),
  s9: id("5e"),
};
const AI_UPDATE_TAKE = id("ad0001");
const AI_FILM_TAKE = id("ad0002");
const STILL_TAKE = id("ad0003");
const STILL_PATH = fx.rows.asset_versions.find((v) =>
  /maja-kort\.png$/.test(v.media_path),
).media_path;
const AI_MEDIA = {
  fileName: "AI-video (google).mp4",
  mimeType: "video/mp4",
  byteSize: GREEN_FILM.length,
  width: 640,
  height: 360,
  fps: 25,
  durationMs: 4000,
  videoCodec: "vp8",
  hasAudio: true,
};
const takeRow = (over) => ({
  project_id: project.id,
  revision: 1,
  segment_id: null,
  status: "approved",
  produced_from: { blockRevisions: {} },
  accepted_from: {},
  audio_language: null,
  coverage: null,
  reviewed_versions: [],
  ...over,
});
const comp = fx.rows.compositions[0];
const SEG3 = id("ad0010");
// En enkel 2D-scene i scene 2 (ett lag), så sceneeditoren har både forrige og neste scene (REQ-0578)
const COMP2 = {
  ...comp,
  id: id("ad0020"),
  variant_id: id("10"),
  name: "Gårdsplassen",
  duration_frames: 100,
  produced_from: { blockRevisions: {} },
};
const sky = fx.rows.composition_layers.find((l) => l.name === "Himmel");
const rows = {
  ...fx.rows,
  compositions: [...fx.rows.compositions, COMP2],
  composition_layers: [
    ...fx.rows.composition_layers,
    { ...sky, id: id("ad0021"), composition_id: COMP2.id, name: "Tun" },
  ],
  production_segments: [
    ...fx.rows.production_segments,
    {
      ...fx.rows.production_segments[0],
      id: SEG3,
      occurrence_id: OCC.s3,
      start_ms: 0,
      end_ms: 8000,
    },
  ],
  takes: [
    ...fx.rows.takes,
    // AI-video i bruk i scene 3, laget før replikken ble endret (avvik → «Oppdater med AI»)
    takeRow({
      id: AI_UPDATE_TAKE,
      occurrence_id: OCC.s3,
      segment_id: SEG3,
      kind: "ai_video",
      duration_frames: 200,
      produced_from: {
        blockRevisions: Object.fromEntries(
          fx.rows.script_blocks.filter((b) => b.variant_id === id("1b")).map((b) => [b.id, 1]),
        ),
      },
      accepted_from: null,
      media_ref: `${project.id}/films/${AI_UPDATE_TAKE}/ai-video.mp4`,
      metadata: { ...AI_MEDIA, durationMs: 8000 },
    }),
    // AI-video i bruk i scene 8, stillbilde i bruk i scene 9 (3 s)
    takeRow({
      id: AI_FILM_TAKE,
      occurrence_id: OCC.s8,
      kind: "ai_video",
      duration_frames: 100,
      media_ref: `${project.id}/films/${AI_FILM_TAKE}/ai-video.mp4`,
      metadata: AI_MEDIA,
    }),
    takeRow({
      id: STILL_TAKE,
      occurrence_id: OCC.s9,
      kind: "still",
      duration_frames: 75,
      media_ref: STILL_PATH,
      metadata: null,
    }),
  ],
  scene_occurrences: fx.rows.scene_occurrences.map((o) =>
    o.id === OCC.s8
      ? { ...o, active_take_id: AI_FILM_TAKE }
      : o.id === OCC.s3
        ? { ...o, active_take_id: AI_UPDATE_TAKE }
        : o.id === OCC.s9
          ? { ...o, active_take_id: STILL_TAKE }
          : o,
  ),
};

// ---------- Mock og side ----------

const PROVIDERS = ["lovable", "google", "openai", "elevenlabs"];
/** Kall til serverfunksjonene (navn → antall), og kommandoene som ble lagret. */
const serverCalls = [];
const savedCommands = [];
/** Filer lastet opp i denne kjøringen (lydopptaket), så de kan hentes igjen. */
const uploaded = new Map();
/** Serverfunksjoner som starter en betalt jobb: skal aldri kalles i dette skriptet. */
const STARTERS = /generateImage|startVideoGeneration|generateSound|generateSpeech|writeImagePrompt/;

function serverFnName(url) {
  try {
    const b64 = new URL(url).pathname.split("/_serverFn/")[1];
    return JSON.parse(Buffer.from(decodeURIComponent(b64), "base64url").toString("utf8")).export;
  } catch {
    return "ukjent";
  }
}

function serveVideo(route, body) {
  const range = route.request().headers()["range"];
  const m = range && /bytes=(\d+)-(\d*)/.exec(range);
  if (m) {
    const start = Number(m[1]);
    const end = m[2] ? Math.min(Number(m[2]), body.length - 1) : body.length - 1;
    return route.fulfill({
      status: 206,
      contentType: "video/webm",
      headers: {
        "content-range": `bytes ${start}-${end}/${body.length}`,
        "accept-ranges": "bytes",
      },
      body: body.subarray(start, end + 1),
    });
  }
  return route.fulfill({
    status: 200,
    contentType: "video/webm",
    headers: { "accept-ranges": "bytes" },
    body,
  });
}

async function mock(ctx) {
  await ctx.route(`${supaUrl}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
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
      const up = uploaded.get(path.replace("/storage/v1/object/sign/", ""));
      if (up) return route.fulfill({ status: 200, contentType: "audio/webm", body: up });
      if (path.includes(`/films/${AI_UPDATE_TAKE}/`) || path.includes(`/films/${AI_FILM_TAKE}/`))
        return serveVideo(route, GREEN_FILM);
      if (path.includes("/films/")) return serveVideo(route, RED_FILM);
      if (path.endsWith(".wav"))
        return route.fulfill({
          status: 200,
          contentType: "audio/wav",
          body: wav(path.includes("maja") ? 3.5 : 20),
        });
      if (path.endsWith(STILL_PATH))
        return route.fulfill({ status: 200, contentType: "image/png", body: BLUE_PNG });
      const n = (path.length * 37) % 360;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="hsl(${n} 25% 22%)"/><circle cx="150" cy="120" r="60" fill="hsl(${n} 45% 70%)"/></svg>`;
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
    }
    // Opplasting (opptak, bilder): lagres ikke, men svaret er som Supabase sitt
    if (path.startsWith("/storage/v1/object/") && req.method() === "POST") {
      serverCalls.push(`opplasting ${path.replace("/storage/v1/object/", "")}`);
      uploaded.set(path.replace("/storage/v1/object/", ""), req.postDataBuffer());
      return json({ Key: path.replace("/storage/v1/object/", ""), Id: "x" });
    }
    const table = path.replace("/rest/v1/", "");
    if (table === "schema_version") return json([{ version: VISUAL_SCHEMA_VERSION }]);
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
      const offset = Number(url.searchParams.get("offset") ?? 0);
      return json(offset > 0 ? [] : rows[table]);
    }
    return json([]);
  });
  // Appens serverfunksjoner besvares her: ingen kall går videre til dev-serverens server (og Supabase)
  await ctx.route("**/_serverFn/**", (route) => {
    const req = route.request();
    const name = serverFnName(req.url());
    serverCalls.push(name);
    // Svaret pakkes som TanStack Start gjør det ({ result }) uten serialisering
    const json = (result) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result, context: {} }),
      });
    if (/projectAiProviders/.test(name)) return json({ providers: PROVIDERS, missing: false });
    if (/runCommand/.test(name)) {
      const body = req.postData() ?? "";
      const type = /"s":"([A-Z][A-Za-z]+)"/.exec(body.slice(body.indexOf("command")))?.[1] ?? "?";
      savedCommands.push(type);
      return json({ ok: true, changeId: "x", affected: [], inverse: null, revisions: {} });
    }
    if (/pumpProjectQueue/.test(name)) return json({ sent: 0 });
    if (/pollVideoJob/.test(name)) return json({ state: "running" });
    if (STARTERS.test(name))
      return json({ ok: false, message: "Testmiljø: ingen ekte generering" });
    return route.abort();
  });
}

const LAUNCH_ARGS = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
];
// Reserve uten fast sti beholder de falske mediene (ellers feiler opptaket i andre miljøer)
const browser = await chromium
  .launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: LAUNCH_ARGS })
  .catch(() => chromium.launch({ args: LAUNCH_ARGS }));

async function openPage(path, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "dark",
    acceptDownloads: true,
    permissions: ["microphone"],
  });
  await mock(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const exp = Math.floor(Date.now() / 1000) + 86400;
  await page.addInitScript(
    ([k, v]) => {
      localStorage.setItem(k, v);
      // B-111: engelsk er standard; suiten sjekker de norske tekstene
      localStorage.setItem("animatic:lang", "nb");
      // Lagringsvinduet avbrytes i hodeløs Chromium: bruk vanlig nedlasting (som export-e2e.mjs)
      delete window.showSaveFilePicker;
      // Lydmålinger (REQ-0210/0578): hver lydkilde som startes, med kontekstens klokke
      window.__ctxs = [];
      window.__starts = [];
      const AC = window.AudioContext;
      window.AudioContext = class extends AC {
        constructor(...a) {
          super(...a);
          window.__ctxs.push(this);
        }
      };
      const orig = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, dur) {
        if (this.context instanceof AC && !(this.context instanceof OfflineAudioContext))
          window.__starts.push({
            when,
            offset,
            dur,
            now: this.context.currentTime,
            buffer: this.buffer,
            ctx: window.__ctxs.indexOf(this.context),
          });
        return orig.call(this, when, offset, dur);
      };
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
    ],
  );
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  return { ctx, page, errors };
}

const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });

/** Prosjektet slik appen laster det (samme adapter og domenekjerne), lest i siden. */
const LOAD_STATE = `
  const core = await import("/src/core/index.ts");
  const { loadProjectState } = await import("/src/adapters/storage/project-rows.ts");
  const { db } = await import("/src/app/db.ts");
  const s = await loadProjectState(db, ${JSON.stringify(project.id)});
  const main = core.mainProduction(s);
  const film = core.filmClips(s, main.id);
`;

// ---------- Gjennomgang av en side (fra verifisering3-ui.mjs: fonter, størrelser, farger, kontrast) ----------

const TOKEN_NAMES = [...new Set([...STYLES.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))];

async function auditWithin(page, selector) {
  return page.evaluate(
    ({ tokenNames, selector }) => {
      const root = document.querySelector(selector);
      if (!root) return null;
      const probe = document.createElement("span");
      document.body.appendChild(probe);
      const tokenRgb = new Set();
      for (const n of tokenNames) {
        probe.style.color = "";
        probe.style.color = `var(${n})`;
        const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(probe).color);
        if (m)
          tokenRgb.add(
            m[1]
              .split(",")
              .slice(0, 3)
              .map((x) => Math.round(parseFloat(x)))
              .join(","),
          );
      }
      probe.remove();
      const parse = (c) => {
        const m = /rgba?\(([^)]+)\)/.exec(c);
        if (!m) return null;
        const p = m[1]
          .split(/[ ,/]+/)
          .filter(Boolean)
          .map(parseFloat);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      };
      const lum = ({ r, g, b }) => {
        const f = (v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const over = (top, bottom) => ({
        r: top.r * top.a + bottom.r * (1 - top.a),
        g: top.g * top.a + bottom.g * (1 - top.a),
        b: top.b * top.a + bottom.b * (1 - top.a),
        a: 1,
      });
      const bgOf = (el) => {
        const layers = [];
        for (let e = el; e; e = e.parentElement) {
          const c = parse(getComputedStyle(e).backgroundColor);
          if (c && c.a > 0) {
            layers.push(c);
            if (c.a >= 1) break;
          }
        }
        let acc = { r: 15, g: 16, b: 18, a: 1 };
        for (const c of layers.reverse()) acc = over(c, acc);
        return acc;
      };
      const out = { small: [], colors: [], contrast: [], fonts: [], count: 0 };
      for (const el of root.querySelectorAll("*")) {
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join("")
          .trim();
        const r = el.getBoundingClientRect();
        if (!own || r.width === 0 || el.closest("pre, textarea, canvas, svg")) continue;
        out.count++;
        const cs = getComputedStyle(el);
        const what = `${el.tagName.toLowerCase()} «${own.slice(0, 30)}»`;
        if (parseFloat(cs.fontSize) < 11) out.small.push(`${what}: ${cs.fontSize}`);
        if (!/^"?(Inter Variable|Inter|JetBrains Mono|Courier Prime)"?/.test(cs.fontFamily))
          out.fonts.push(`${what}: ${cs.fontFamily}`);
        const c = parse(cs.color);
        if (c && !tokenRgb.has([c.r, c.g, c.b].map(Math.round).join(",")))
          out.colors.push(`${what}: ${cs.color}`);
        if (c && !el.closest("[disabled]")) {
          let o = 1;
          for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
          const bg = bgOf(el);
          const fg = over({ ...c, a: c.a * o }, bg);
          const ratio = (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
          if (ratio < 4.5) out.contrast.push(`${what}: ${ratio.toFixed(2)}:1`);
        }
      }
      return out;
    },
    { tokenNames: TOKEN_NAMES, selector },
  );
}

/** Kostnadslinjene (dt → dd) i en bekreftelse. */
async function costLinesIn(locator) {
  return locator.evaluate((el) => {
    const dl = el.querySelector('dl[aria-label="Kostnadsanslag"]');
    if (!dl) return null;
    return Object.fromEntries(
      [...dl.querySelectorAll("dt")].map((dt) => [
        dt.textContent.trim(),
        (dt.nextElementSibling?.textContent ?? "").trim(),
      ]),
    );
  });
}

function checkSeven(where, lines, { length, resolution = true }) {
  const want = [
    "Modell",
    "Innsatsnivå",
    ...(resolution ? ["Oppløsning"] : []),
    "Antall",
    ...(length ? ["Lengde"] : []),
    "Ekstrarunder",
    "Samlet anslag",
  ];
  const keys = lines ? Object.keys(lines) : [];
  check(
    "REQ-0280",
    `${where}: kostnadsanslaget viser ${want.length} elementer`,
    lines && want.every((k) => keys.includes(k) && lines[k]),
    lines ? keys.map((k) => `${k}: ${lines[k]}`).join(" · ") : "fant ikke kostnadsanslaget",
  );
}

async function checkAudit(req, where, page, selector) {
  const a = await auditWithin(page, selector);
  if (!a) return check(req, `${where}: elementet finnes`, false);
  const all = [...a.small, ...a.fonts, ...a.colors, ...a.contrast];
  check(
    req,
    `${where}: designsystemet (≥ 11 px, fonter, tokenfarger, kontrast ≥ 4,5:1)`,
    all.length === 0,
    all.length ? all.slice(0, 4).join(" | ") : `${a.count} tekstelementer`,
  );
}

const startersCalled = () => serverCalls.filter((n) => STARTERS.test(n));

// ---------- 1. REQ-0280: kostnadsanslaget i bekreftelsene ----------

async function testCostLines() {
  // a) Video for én scene («Generer scene»)
  {
    const { ctx, page } = await openPage(`${P}/montering`);
    try {
      await page
        .getByRole("button", { name: /^Scene 1: / })
        .first()
        .click();
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: /Generer scene/ }).click();
      await page.waitForTimeout(1200);
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("combobox", { name: "Videomodell" })
        .selectOption("google|veo-3.1-generate-preview");
      await dialog
        .getByRole("button", { name: /^(Generer|Lag ny)$/ })
        .first()
        .click();
      const confirm = dialog.getByRole("alertdialog", { name: "Bekreft videogenerering" });
      await confirm.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      checkSeven("Generer scene (Google Veo)", await costLinesIn(confirm), { length: true });
      await shot(page, "v4-01-kostnad-generer-scene");
      await checkAudit(
        "REQ-0280",
        "Generer scene – bekreftelsen",
        page,
        '[aria-label="Bekreft videogenerering"]',
      );
      check(
        "REQ-0280",
        "Generer scene: ingenting sendt før bekreftelse",
        startersCalled().length === 0,
      );
      await confirm.getByRole("button", { name: "Avbryt" }).click();
    } finally {
      await ctx.close();
    }
  }
  // b) Video for flere scener
  {
    const { ctx, page } = await openPage(`${P}/montering`);
    try {
      // Ligger i «Mer»-menyen i monteringens verktøylinje (DEC-0078, KI-183)
      await page.getByRole("button", { name: /^Mer\b/ }).click();
      await page.getByRole("menuitem", { name: /^Video for flere scener/ }).click();
      await page.waitForTimeout(800);
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("combobox", { name: "Videomodell" })
        .selectOption("google|veo-3.1-generate-preview");
      await dialog.getByRole("button", { name: "Velg alle uten video" }).click();
      await dialog.getByRole("button", { name: /^Lag video \(/ }).click();
      const confirm = dialog.getByRole("alertdialog", { name: "Bekreft videogenerering" });
      await confirm.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const lines = await costLinesIn(confirm);
      checkSeven("Video for flere scener", lines, { length: true });
      check(
        "REQ-0280",
        "Video for flere scener: antall segmenter og scener",
        /\d+ genereringer \(\d+ segmenter\)/.test(lines?.["Antall"] ?? ""),
        lines?.["Antall"],
      );
      await shot(page, "v4-02-kostnad-flere-scener");
      await checkAudit(
        "REQ-0280",
        "Video for flere scener – bekreftelsen",
        page,
        '[aria-label="Bekreft videogenerering"]',
      );
      check(
        "REQ-0280",
        "Video for flere scener: ingenting sendt før bekreftelse",
        startersCalled().length === 0,
      );
    } finally {
      await ctx.close();
    }
  }
  // c) «Oppdater med AI» ved avvik (AI-videoen i scene 3 er laget før replikken ble endret)
  {
    const { ctx, page } = await openPage(`${P}/montering`);
    try {
      await page
        .getByRole("button", { name: /^Scene 3: / })
        .first()
        .click();
      await page.waitForTimeout(600);
      const btn = page.getByRole("button", { name: /Oppdater med AI \(/ });
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      const confirm = page.getByRole("alertdialog", { name: "Bekreft ny video" });
      await confirm.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      checkSeven("Oppdater med AI", await costLinesIn(confirm), { length: true });
      const box = confirm.locator("textarea").first();
      check(
        "REQ-0489",
        "Oppdater med AI: beskrivelsen vises i et felt som kan endres",
        await box.isEditable(),
      );
      await shot(page, "v4-03-kostnad-oppdater-med-ai");
      await checkAudit(
        "REQ-0280",
        "Oppdater med AI – bekreftelsen",
        page,
        '[aria-label="Bekreft ny video"]',
      );
      check(
        "REQ-0280",
        "Oppdater med AI: ingenting sendt før bekreftelse",
        startersCalled().length === 0,
      );
    } catch (e) {
      check("REQ-0280", "Oppdater med AI kunne åpnes", false, String(e).split("\n")[0]);
    } finally {
      await ctx.close();
    }
  }
  // d) Bilde (bildevalget for et lag i sceneeditoren), med OpenAI og med innebygd Lovable AI
  {
    const { ctx, page } = await openPage(`${P}/scene`);
    try {
      await page
        .locator('section[aria-label="Lag"]')
        .first()
        .getByRole("button", { name: /Maja/ })
        .first()
        .dblclick();
      await page.waitForTimeout(800);
      const region = page.getByRole("region", { name: "Nytt bilde" });
      await region.getByRole("button", { name: /^Generer …$/ }).click();
      let confirm = region.getByRole("alertdialog", { name: "Bekreft generering" });
      await confirm.scrollIntoViewIfNeeded();
      const lovable = await costLinesIn(confirm);
      check(
        "REQ-0280",
        "Bilde (innebygd Lovable AI): innsatsnivå og oppløsning i anslaget",
        lovable && "Innsatsnivå" in lovable && "Oppløsning" in lovable,
        lovable ? Object.keys(lovable).join(", ") : "fant ikke anslaget",
      );
      await shot(page, "v4-04a-kostnad-bilde-lovable");
      await confirm.getByRole("button", { name: "Avbryt" }).click();
      await region
        .getByRole("combobox", { name: "Leverandør og modell" })
        .selectOption("openai|gpt-image-2.5-flare");
      await region.getByRole("button", { name: /^Generer …$/ }).click();
      confirm = region.getByRole("alertdialog", { name: "Bekreft generering" });
      await confirm.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      checkSeven("Bilde (OpenAI)", await costLinesIn(confirm), { length: false });
      await shot(page, "v4-04-kostnad-bilde");
      await checkAudit(
        "REQ-0280",
        "Bilde – bekreftelsen",
        page,
        '[aria-label="Bekreft generering"]',
      );
      check("REQ-0280", "Bilde: ingenting sendt før bekreftelse", startersCalled().length === 0);
    } finally {
      await ctx.close();
    }
  }
  // e) Lyd (lydressursen i biblioteket)
  {
    const { ctx, page } = await openPage(`${P}/bibliotek`);
    try {
      await page
        .getByRole("button", { name: /Vind i trærne/ })
        .first()
        .click();
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: "Lag med AI" }).first().click();
      await page.waitForTimeout(800);
      const region = page.getByRole("region", { name: "Lag lyd med AI" });
      await region.getByRole("combobox", { name: "Lengde på lyden" }).selectOption("5");
      await region.getByRole("button", { name: /^Lag lyd …$/ }).click();
      const confirm = region.getByRole("alertdialog", { name: "Bekreft generering" });
      await confirm.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const lines = await costLinesIn(confirm);
      checkSeven("Lyd (ElevenLabs)", lines, { length: true, resolution: false });
      check(
        "REQ-0280",
        "Lyd: valgt lengde vises",
        lines?.["Lengde"] === "5 s hver",
        lines?.["Lengde"],
      );
      await shot(page, "v4-05-kostnad-lyd");
      await checkAudit("REQ-0280", "Lyd – bekreftelsen", page, '[aria-label="Bekreft generering"]');
      check("REQ-0280", "Lyd: ingenting sendt før bekreftelse", startersCalled().length === 0);
    } finally {
      await ctx.close();
    }
  }
}

// ---------- 2. REQ-0318: sammenligne versjoner av en scene ----------

async function testCompare() {
  const { ctx, page } = await openPage(`${P}/montering`);
  try {
    await page
      .getByRole("button", { name: /^Scene 7: / })
      .first()
      .click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /Sammenlign versjoner/ }).click();
    await page.waitForTimeout(2000);
    const dialog = page.getByRole("dialog");
    const title = (await dialog.getByRole("heading").first().innerText()).trim();
    const left = dialog.getByRole("combobox", { name: "Versjon til venstre" });
    const right = dialog.getByRole("combobox", { name: "Versjon til høyre" });
    const opts = await left.locator("option").allInnerTexts();
    check(
      "REQ-0318",
      "dialogen viser to versjoner av scenen side ved side; alle versjonstyper kan velges",
      /^Sammenlign versjoner – 7 /.test(title) &&
        (await left.count()) === 1 &&
        (await right.count()) === 1 &&
        opts.some((o) => /^Animatic/.test(o)) &&
        opts.some((o) => /\.mp4/.test(o)),
      `${title} · valg: ${opts.join(" | ")}`,
    );
    const kinds = await dialog
      .locator("dl")
      .evaluateAll((dls) => dls.map((d) => d.querySelector("dd")?.textContent ?? ""));
    check(
      "REQ-0318",
      "ulike versjoner til venstre og høyre (klippet versjon i bruk og importert film)",
      kinds.length === 2 && kinds[0] !== kinds[1],
      kinds.join(" | "),
    );
    /** Fargen midt i hver side (lerretet i filmvisningen). */
    const sides = () =>
      dialog.evaluate((d) =>
        [...d.querySelectorAll("canvas")].slice(0, 2).map((c) => {
          const x = c.getContext("2d");
          const p = x
            ? [...x.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data]
            : null;
          return p;
        }),
      );
    const here = () =>
      dialog
        .locator("dl")
        .evaluateAll((dls) => dls.map((d) => d.querySelectorAll("dd")[3]?.textContent ?? ""));
    await shot(page, "v4-06-sammenlign-versjoner");
    await checkAudit("REQ-0318", "Sammenlign versjoner", page, '[role="dialog"]');
    // Felles avspilling: begge sider følger samme hode
    const slider = dialog.getByRole("slider", { name: "Felles avspillingshode" });
    await slider.fill("100");
    await page.waitForTimeout(1500);
    const h1 = await here();
    check(
      "REQ-0318",
      "felles avspillingshode: begge sider står på samme tid",
      h1[0] === h1[1] && h1[0] !== "00:00:00:00",
      h1.join(" | "),
    );
    await dialog.getByRole("button", { name: /Spill begge/ }).click();
    await page.waitForTimeout(1500);
    const h2 = await here();
    await dialog.getByRole("button", { name: /Pause/ }).click();
    check(
      "REQ-0318",
      "«Spill begge» spiller begge sider samtidig",
      h2[0] === h2[1] && h2[0] !== h1[0],
      `${h1[0]} → ${h2.join(" | ")}`,
    );
    const px = await sides();
    const red = (p) => p && p[0] > 150 && p[1] < 90 && p[2] < 90;
    check(
      "REQ-0318",
      "den importerte filmen vises på sin side (bildet tegnes)",
      px.some(red),
      JSON.stringify(px),
    );
    await dialog
      .getByRole("combobox", { name: "Hvordan versjonene følger hverandre" })
      .selectOption("relative");
    await page.waitForTimeout(800);
    const h3 = await here();
    check(
      "REQ-0318",
      "«samme andel av lengden» gir egen tid per side",
      h3[0] !== h3[1],
      h3.join(" | "),
    );
    await shot(page, "v4-07-sammenlign-andel");
    // Bare visning: ingen kommando er sendt
    check(
      "REQ-0318",
      "sammenligningen endrer ingenting (ingen kommando sendt)",
      savedCommands.length === 0,
      savedCommands.join(", "),
    );
  } finally {
    await ctx.close();
  }
}

// ---------- 3. REQ-0210 og REQ-0578: avspilling med lyd i takt ----------

/** Lydkildene startet siden `since`, sammenholdt med lydklippene (samme beregning som appen). */
async function audioSession(page, since, itemsExpr) {
  return page.evaluate(
    async ({ since, itemsExpr, LOAD_STATE }) => {
      const fn = new Function(
        "since",
        `return (async () => { ${LOAD_STATE}
        const { audioBank } = await import("/src/app/audio/use-audio-playback.ts");
        const items = ${itemsExpr};
        const { createSignedUrls, ASSET_BUCKET } = await import("/src/adapters/browser/storage-files.ts");
        const paths = [...new Set(items.filter(x => x.version).map(x => x.version.mediaPath))];
        const urls = await createSignedUrls(ASSET_BUCKET, paths, 600);
        await audioBank.loadAll(Object.fromEntries(urls.map(x => [x.path, x.signedUrl])));
        const starts = window.__starts.slice(since);
        // HMR can create another AudioBank for the unversioned dynamic import used by this probe.
        // Compare every decoded sample, not object identity, so we still prove the exact source audio.
        const sameAudio = (a, b) => {
          if (!a || !b || a.sampleRate !== b.sampleRate || a.length !== b.length || a.numberOfChannels !== b.numberOfChannels) return false;
          if (a === b) return true;
          for (let channel = 0; channel < a.numberOfChannels; channel++) {
            const x = a.getChannelData(channel), y = b.getChannelData(channel);
            for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
          }
          return true;
        };
        // Samme lydfil kan brukes av flere klipp (f.eks. to deler av en film): alle kandidatene tas med
        return starts.map((st) => {
          const cands = items
            .filter((x) => x.version && sameAudio(audioBank.get(x.version.mediaPath), st.buffer))
            .map((it) => ({ start: it.start, sourceIn: it.sourceIn, name: it.clip.name || it.clip.kind }));
          return { when: st.when, offset: st.offset, now: st.now, ctx: st.ctx, cands, item: cands[0] ?? null };
        });
      })()`,
      );
      return fn(since);
    },
    { since, itemsExpr, LOAD_STATE },
  );
}

/** Kontroll: alle kildene i en økt har samme startAt, og forskyvningen i filen stemmer med avspillingshodet. */
function checkSession(req, label, starts, fromSec, tol = 0.06) {
  // Bare den første økten (en løkke eller et hopp starter en ny økt med ny klokke)
  const first = starts[0]?.now ?? 0;
  const expectOffset = (it) => it.sourceIn + Math.max(0, fromSec - it.start);
  const matched = starts
    .filter((s) => s.item && Math.abs(s.now - first) < 0.15)
    .map((s) => ({
      ...s,
      // Klippet som passer best (samme fil i flere klipp)
      item: [...s.cands].sort(
        (a, b) => Math.abs(s.offset - expectOffset(a)) - Math.abs(s.offset - expectOffset(b)),
      )[0],
    }));
  const startAts = matched.map((s) => s.when - Math.max(0, s.item.start - fromSec));
  const offsetErr = matched.map((s) =>
    Math.abs(s.offset - (s.item.sourceIn + Math.max(0, fromSec - s.item.start))),
  );
  const spread = startAts.length ? Math.max(...startAts) - Math.min(...startAts) : 0;
  check(
    req,
    `${label}: lydklippene legges inn på riktig sted (felles start, riktig sted i filen)`,
    matched.length >= 2 && spread < tol && offsetErr.every((e) => e < tol),
    `${matched.length} kilder i økten · spredning ${(spread * 1000).toFixed(0)} ms · maks avvik i filen ${(Math.max(0, ...offsetErr) * 1000).toFixed(0)} ms · ${matched.map((s) => s.item.name).join(", ")}`,
  );
  return startAts.length ? Math.min(...startAts) : null;
}

const parseTc = (t, fps = 25) => {
  const m = /(\d+):(\d+):(\d+):(\d+)/.exec(t ?? "");
  return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * fps + +m[4] : null;
};


/**
 * KI-SL-1: venter til lydfilene for scenen (og naboscenene) er hentet og dekodet før avspillingen startes.
 * På en treg maskin startet testen avspillingen før dekodingen var ferdig; da ble lydkildene aldri startet i
 * første økt, og kontrollene for REQ-0210/0578 feilet selv om appen var riktig.
 */
async function waitForAudio(page, occId, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ready = await page
      .evaluate(
        async ({ occId, LOAD_STATE }) => {
          const fn = new Function(
            "occId",
            `return (async () => { ${LOAD_STATE}
            const { audioBank } = await import("/src/app/audio/use-audio-playback.ts");
            const items = core.sceneWindowAudio(s, film, occId, s.project.fps, "nb").filter((x) => x.version);
            return items.length > 0 && items.every((x) => audioBank.get(x.version.mediaPath));
          })()`,
          );
          return fn(occId);
        },
        { occId, LOAD_STATE },
      )
      .catch(() => false);
    if (ready) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function testPlayback() {
  const { ctx, page } = await openPage(`${P}/scene?scene=${OCC.s1}`);
  try {
    await page.waitForTimeout(1500);
    await waitForAudio(page, OCC.s1);
    const tid = page.locator('[aria-label="Tid"]');
    const canvasHash = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("canvas")]
          .filter((c) => c.width > 100)
          .map((c) => {
            const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
            let h = 0;
            if (d) for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0;
            return h;
          })
          .join(","),
      );
    const since = await page.evaluate(() => window.__starts.length);
    const hash0 = await canvasHash();
    await page.getByRole("button", { name: "Spill av" }).first().click();
    const samples = [];
    const hashes = new Set([hash0]);
    // Scenen er 4 s og spilles i løkke: stopp i god tid før slutten, også på en treg maskin (pause før løkken
    // begynner på nytt, ellers står avspillingshodet før klippene og neste kontroll blir meningsløs)
    const t0 = Date.now();
    for (let i = 0; i < 12 && Date.now() - t0 < 2600; i++) {
      await page.waitForTimeout(220);
      const s = await page.evaluate(() => ({
        t: performance.now(),
        audio: window.__ctxs.length ? window.__ctxs[window.__ctxs.length - 1].currentTime : null,
        tc: document.querySelector('[aria-label="Tid"]')?.textContent ?? "",
      }));
      samples.push(s);
      hashes.add(await canvasHash());
    }
    await shot(page, "v4-08-sceneeditor-avspilling");
    await page.getByRole("button", { name: "Pause" }).first().click();
    const starts = await audioSession(
      page,
      since,
      `core.sceneWindowAudio(s, film, ${JSON.stringify(OCC.s1)}, s.project.fps, "nb")`,
    );
    const startAt = checkSession("REQ-0210", "fra starten", starts, 0);
    const frames = samples.map((x) => parseTc(x.tc));
    check(
      "REQ-0210",
      "bildet går fremover under avspilling og lerretet endres (kamera/animasjon)",
      frames.at(-1) > frames[0] && hashes.size >= 3,
      `bilde ${frames[0]} → ${frames.at(-1)} · ${hashes.size} ulike lerretsbilder`,
    );
    if (startAt !== null) {
      const drift = samples
        .filter((x) => x.audio !== null)
        .map((x) => Math.abs(parseTc(x.tc) / 25 - (x.audio - startAt)));
      check(
        "REQ-0210",
        "bilde og lyd er i takt under avspilling (lydklokke mot bildet)",
        drift.length > 5 && Math.max(...drift) < 0.2,
        `maks avvik ${(Math.max(...drift) * 1000).toFixed(0)} ms over ${drift.length} målinger`,
      );
    }
    // Ny start midt i scenen: klippene som allerede har begynt, starter like langt inn i filen
    const at = parseTc(await tid.innerText());
    const since2 = await page.evaluate(() => window.__starts.length);
    await page.getByRole("button", { name: "Spill av" }).first().click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Pause" }).first().click();
    const starts2 = await audioSession(
      page,
      since2,
      `core.sceneWindowAudio(s, film, ${JSON.stringify(OCC.s1)}, s.project.fps, "nb")`,
    );
    checkSession("REQ-0210", `fortsatt fra ${(at / 25).toFixed(2)} s`, starts2, at / 25);
    check(
      "REQ-0210",
      "et klipp som allerede har begynt, starter inne i filen (ikke fra start)",
      starts2.some((s) => s.item && s.offset > s.item.sourceIn + 0.1),
      starts2.map((s) => `${s.item?.name}: ${s.offset.toFixed(2)} s`).join(", "),
    );
  } finally {
    await ctx.close();
  }
}

async function testNeighbours() {
  const { ctx, page } = await openPage(`${P}/scene?scene=${OCC.s2}`);
  try {
    await page.getByRole("button", { name: "Naboscener" }).click();
    await page.waitForTimeout(800);
    await waitForAudio(page, OCC.s2);
    const strip = page.locator('[aria-label="Naboscener"]');
    const parts = await strip.locator("div.flex.h-full").allInnerTexts();
    check(
      "REQ-0578",
      "stripen viser forrige, denne og neste scene",
      parts.length === 3 &&
        /^Forrige:/.test(parts[0]) &&
        /^Denne:/.test(parts[1]) &&
        /^Neste:/.test(parts[2]),
      parts.join(" | "),
    );
    // Rett før slutten av forrige scene, så spilles inn i scenen som redigeres
    const box = await strip.locator("div.relative.flex").boundingBox();
    const geo = await strip
      .locator("div.flex.h-full")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    await page.mouse.click(box.x + geo[0] - 40, box.y + box.height / 2);
    await page.waitForTimeout(800);
    const overlay = page.locator('[aria-label="Naboscener som film"]');
    const label1 = await overlay.innerText().catch(() => "");
    check(
      "REQ-0578",
      "avspillingshodet kan stå i forrige scene (vises som film, bare visning)",
      /Forrige scene · bare visning/.test(label1),
      label1,
    );
    await shot(page, "v4-09-naboscener-forrige");
    const layersBefore = await page.locator('[aria-label="Lagene, forreste øverst"] > li').count();
    const since = await page.evaluate(() => window.__starts.length);
    const t0 = (await strip.innerText()).match(/([\d,]+) s \//)?.[1];
    await page.getByRole("button", { name: "Spill i sammenheng" }).click();
    const seen = new Set();
    let dark = Infinity;
    for (let i = 0; i < 14; i++) {
      await page.waitForTimeout(200);
      seen.add((await overlay.innerText().catch(() => "")).trim() || "(denne scenen)");
      const lum = await overlay
        .evaluate((o) => {
          const c = o.querySelector("canvas");
          const d = c?.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
          if (!d) return null;
          let s = 0;
          for (let j = 0; j < d.length; j += 4 * 17) s += d[j] + d[j + 1] + d[j + 2];
          return s / (d.length / (4 * 17)) / 3;
        })
        .catch(() => null);
      if (lum !== null) dark = Math.min(dark, lum);
    }
    await shot(page, "v4-10-naboscener-spiller");
    await page.getByRole("button", { name: "Pause" }).last().click();
    const t1 = (await strip.innerText()).match(/([\d,]+) s \//)?.[1];
    check(
      "REQ-0578",
      "avspillingen går fra forrige scene inn i scenen som redigeres",
      seen.has("Forrige scene · bare visning") && [...seen].some((x) => !/Forrige/.test(x)),
      `${t0} s → ${t1} s · ${[...seen].join(" → ")}`,
    );
    check(
      "REQ-0578",
      "overgangen (dypp til svart før scene 2) vises i sammenhengen",
      dark < 20,
      `mørkeste bilde: ${dark.toFixed(1)}`,
    );
    const range = await page.evaluate(
      async ({ LOAD_STATE, occ }) => {
        const fn = new Function(
          "occ",
          `return (async () => { ${LOAD_STATE}
          const r = core.neighbourRange(film, occ);
          return { startFrame: r.startFrame };
        })()`,
        );
        return fn(occ);
      },
      { LOAD_STATE, occ: OCC.s2 },
    );
    const from = Number(String(t0).replace(",", ".")) + range.startFrame / 25;
    const starts = await audioSession(
      page,
      since,
      `(() => { const r = core.neighbourRange(film, ${JSON.stringify(OCC.s2)}); return [...core.filmAudio(s, r.clips, s.project.fps, "nb"), ...core.filmTakeAudio(r.clips, s.project.fps)]; })()`,
    );
    // Stripen viser tiden med én desimal: toleransen tar med avrundingen (± 50 ms)
    checkSession("REQ-0578", "naboscener", starts, from, 0.09);
    // Lagvelgeren: bare lagene i scenen som redigeres (scene 2 har ett lag; scene 1 har seks)
    const layersAfter = await page
      .locator('[aria-label="Lagene, forreste øverst"] > li')
      .allInnerTexts();
    check(
      "REQ-0578",
      "lagvelgeren viser bare scenens eget lag, ikke lagene i naboscenen (scene 1)",
      layersBefore === 1 && layersAfter.length === 1 && /Tun/.test(layersAfter[0]),
      `${layersBefore} lag før · etter avspilling: ${layersAfter.map((x) => x.split("\n")[0]).join(", ")}`,
    );
  } finally {
    await ctx.close();
  }
  // Scene 1 med naboscener: lagvelgeren har scenens egne seks lag, og neste scene kan spilles
  const { ctx: c2, page: p2 } = await openPage(`${P}/scene?scene=${OCC.s1}`);
  try {
    const n = await p2.locator('[aria-label="Lagene, forreste øverst"] > li').count();
    const own = rows.composition_layers.filter(
      (l) => l.composition_id === comp.id && !l.removed,
    ).length;
    check(
      "REQ-0578",
      "scene 1: lagvelgeren viser bare scenens egne lag",
      n === own,
      `${n} av ${own}`,
    );
    await p2.screenshot({ path: `${out}/v4-11-naboscener-scene1.png` });
  } finally {
    await c2.close();
  }
}

// ---------- 4. REQ-0559: dobbeltklikk på et lag ----------

async function testLayerDoubleClick() {
  const { ctx, page } = await openPage(`${P}/scene?scene=${OCC.s1}`);
  try {
    const list = page.locator('[aria-label="Lagene, forreste øverst"]');
    // Første knapp med navn (gruppene har en pil foran navnet, DEC-0088)
    const first = list.getByRole("button").filter({ hasText: /\S/ }).first();
    const name = (await first.innerText()).trim().split("\n")[0];
    await first.dblclick();
    await page.waitForTimeout(800);
    const title1 = await page
      .getByRole("dialog")
      .getByRole("heading")
      .first()
      .innerText()
      .catch(() => "");
    check(
      "REQ-0559",
      "dobbeltklikk i laglisten åpner bildevalget for laget",
      title1.includes(`«${name}»`),
      `${name} → ${title1}`,
    );
    await shot(page, "v4-12-lag-bildevalg-liste");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    // Lerretet: dobbeltklikk midt på scenen
    // Lerretet er det største (scenen); dobbeltklikk der et lag med bilde ligger (midt i hvert lag prøves)
    const b = await page.evaluate(() => {
      const c = [...document.querySelectorAll("canvas")].sort(
        (a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight,
      )[0];
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    let title2 = "";
    let where = "";
    for (const [fx2, fy] of [
      [0.5, 0.5],
      [0.7, 0.43],
      [0.35, 0.41],
      [0.5, 0.85],
      [0.15, 0.2],
    ]) {
      await page.mouse.dblclick(b.x + b.width * fx2, b.y + b.height * fy);
      await page.waitForTimeout(700);
      title2 = await page
        .getByRole("dialog")
        .getByRole("heading")
        .first()
        .innerText({ timeout: 500 })
        .catch(() => "");
      where = `${fx2}, ${fy}`;
      if (title2) break;
    }
    const selected = (
      await list
        .locator('button[aria-pressed="true"]')
        .first()
        .innerText()
        .catch(() => "")
    )
      .trim()
      .split("\n")[0];
    check(
      "REQ-0559",
      "dobbeltklikk på laget i lerretet åpner bildevalget for det laget (og velger det)",
      /^Bilde for «/.test(title2) && !!selected && title2.includes(`«${selected}»`),
      `${title2} · valgt i listen: ${selected} · punkt ${where}`,
    );
    await shot(page, "v4-13-lag-bildevalg-lerret");
  } finally {
    await ctx.close();
  }
}

// ---------- 5. REQ-0583: lydopptak med (falsk) mikrofon ----------

async function testRecording() {
  const { ctx, page } = await openPage(`${P}/scene?scene=${OCC.s1}`);
  try {
    // Avspillingshodet til 2 s: spill av og stopp
    await page.getByRole("button", { name: "Spill av" }).first().click();
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: "Pause" }).first().click();
    const at = parseTc(await page.locator('[aria-label="Tid"]').innerText());
    const before = savedCommands.length;
    // Ved 1280 px kan opptaksknappen ligge i verktøylinjens «Mer …»-meny (U2)
    const recBtn = () => page.getByRole("button", { name: /^(Opptak|Ta opp en replikk eller lyd fra avspillingshodet)$/ }).or(page.getByRole("menuitem", { name: /^(Opptak|Ta opp en replikk eller lyd fra avspillingshodet)$/ }));
    if (!(await recBtn().count())) await page.getByRole("button", { name: "Mer …" }).first().click();
    await recBtn().first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Opptak (dato og tid)").fill("Prøveopptak");
    await dialog
      .getByRole("checkbox", { name: /Spill av scenen/ })
      .uncheck()
      .catch(() => undefined);
    await dialog.getByRole("button", { name: /^Ta opp$/ }).click();
    await page.waitForTimeout(2200);
    const rec = await dialog.innerText();
    check(
      "REQ-0583",
      "opptaket startes i sceneeditoren (mikrofon)",
      /Tar opp/.test(rec),
      rec.replace(/\s+/g, " ").slice(0, 120),
    );
    await shot(page, "v4-14-opptak-pagar");
    await dialog.getByRole("button", { name: /^Stopp$/ }).click();
    await page.waitForTimeout(800);
    await dialog.getByRole("button", { name: "Legg i scenen" }).click();
    await page.waitForTimeout(2500);
    const added = savedCommands.slice(before);
    check(
      "REQ-0583",
      "opptaket stoppes og lagres som lydressurs og lydklipp",
      ["CreateAssets", "AddAudioClips"].every((t) => added.includes(t)) &&
        serverCalls.some((c) => /opplasting assets\//.test(c)),
      added.join(", "),
    );
    // Etter lagringen åpnes lydprofilen for det nye klippet
    const profile = await page
      .getByRole("dialog")
      .getByRole("heading")
      .first()
      .innerText()
      .catch(() => "");
    check(
      "REQ-0583",
      "lydprofilen for opptaket åpnes etter lagringen",
      /Lydprofil – Prøveopptak/.test(profile),
      profile,
    );
    await shot(page, "v4-15-opptak-lydprofil");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const clip = page.getByRole("button", { name: /^Prøveopptak, / });
    check("REQ-0583", "klippet vises i scenens lydspor", (await clip.count()) === 1);
    await shot(page, "v4-16-opptak-i-scenen");
    // Trim og utvid igjen i monteringen: bare klippets inn/ut endres, filen lastes ikke opp på nytt
    const uploads = serverCalls.filter((c) => /opplasting/.test(c)).length;
    await page
      .getByRole("navigation", { name: "Arbeidsflater" })
      .getByRole("link", { name: "Montering" })
      .click();
    await page.waitForTimeout(1800);
    await page
      .getByRole("button", { name: /^Scene 1: / })
      .first()
      .click();
    await page.waitForTimeout(500);
    await page
      .getByRole("button", { name: /Prøveopptak/ })
      .first()
      .click();
    await page.waitForTimeout(600);
    const startField = await page
      .getByLabel(/^Start i scenen \(s\)/)
      .first()
      .inputValue();
    check(
      "REQ-0583",
      "opptaket ligger ved avspillingshodet der opptaket startet",
      Math.abs(Number(startField) - at / 25) < 0.05,
      `hode ${(at / 25).toFixed(2)} s · klippet starter ${startField} s`,
    );
    const length = page.getByLabel(/^Lengde \(s\)/).first();
    const full = await length.inputValue();
    await length.fill("0.5");
    await length.press("Enter");
    await page.waitForTimeout(400);
    const cut = await length.inputValue();
    await length.fill(full);
    await length.press("Enter");
    await page.waitForTimeout(400);
    const back = await length.inputValue();
    const updates = savedCommands.slice(before).filter((t) => t === "UpdateAudioClips").length;
    check(
      "REQ-0583",
      "opptaket kan kuttes og utvides igjen uten at filen endres (ingen ny opplasting)",
      cut === "0.5" &&
        back === full &&
        updates >= 2 &&
        serverCalls.filter((c) => /opplasting/.test(c)).length === uploads,
      `lengde ${full} → ${cut} → ${back} s · ${updates} endringer av klippet`,
    );
    await shot(page, "v4-17-opptak-trimmet");
  } catch (e) {
    check("REQ-0583", "opptaket kunne gjennomføres", false, String(e).split("\n").slice(0, 3).join(" "));
  } finally {
    await ctx.close();
  }
}

// ---------- 6. REQ-0214/REQ-0418: hybrid montering og eksport ----------

function classify([r, g, b]) {
  if (r > 150 && g < 90 && b < 90) return "rød";
  if (g > 140 && r < 90 && b < 110) return "grønn";
  if (b > 150 && r < 90 && g < 110) return "blå";
  return "annet";
}

async function testHybrid() {
  const { ctx, page } = await openPage(`${P}/montering`);
  try {
    const info = await page.evaluate(async (LOAD_STATE) => {
      const fn = new Function(`return (async () => { ${LOAD_STATE}
        return film.map((c) => ({ occ: c.occurrenceId, number: c.productionNumber, frames: c.durationFrames,
          source: c.take ? c.take.kind : (c.compositionId ? "2d" : "tittelkort") }));
      })()`);
      return fn();
    }, LOAD_STATE);
    const pick = [OCC.s1, OCC.s7, OCC.s8, OCC.s9].map((o) => info.find((c) => c.occ === o));
    check(
      "REQ-0214",
      "monteringen har 2D-scene, importert film, AI-video og stillbilde (3 s)",
      pick.map((c) => c?.source).join(",") === "2d,imported_film,ai_video,still" &&
        pick[3].frames === 75,
      pick.map((c) => `${c?.number}: ${c?.source} ${c?.frames} b`).join(" · "),
    );
    // Visning i monteringen: hver scene tegnes med sitt materiale
    const colors = [];
    const want = ["rød", "grønn", "blå"];
    for (const [i, c] of pick.slice(1).entries()) {
      await page
        .getByRole("button", { name: new RegExp(`^Scene ${c.number}: `) })
        .first()
        .click();
      // Spill litt inn i scenen (forbi en ev. overgang i starten), og vent til bildet er tegnet (høyst 8 s)
      await page.getByRole("button", { name: "Spill av" }).first().click();
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: "Pause" }).first().click();
      let got = "ingen";
      for (let k = 0; k < 16 && got !== want[i]; k++) {
        await page.waitForTimeout(500);
        const px = await page.evaluate(() => {
          const cs = [...document.querySelectorAll("canvas")].filter((x) => x.width > 200);
          const c = cs[0];
          const d = c
            ?.getContext("2d")
            ?.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
          return d ? [...d] : null;
        });
        got = px ? classify(px) : "ingen";
      }
      colors.push(got);
      if (i === 0) await shot(page, "v4-18a-montering-film");
    }
    await shot(page, "v4-18-montering-stillbilde");
    check(
      "REQ-0214",
      "monteringen viser importert film, AI-video og stillbilde",
      colors.join(",") === "rød,grønn,blå",
      colors.join(", "),
    );
    // Eksport av de fire scenene
    await page.getByRole("button", { name: "Eksporter animatic" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: /^Valgte scener/ }).check();
    const list = dialog.getByRole("list", { name: "Scener i eksporten" });
    await dialog.getByRole("button", { name: "Ingen" }).click();
    for (const c of pick)
      await list.getByRole("checkbox", { name: new RegExp(`^${c.number} `) }).check();
    await dialog.getByRole("radio", { name: /^Halv størrelse/ }).check();
    await shot(page, "v4-19-eksport-valg");
    const dl = page.waitForEvent("download", { timeout: 600000 }).catch(() => null);
    await dialog
      .getByRole("button", { name: /Eksporter/ })
      .last()
      .click();
    await page.getByText(/^Ferdig:/).waitFor({ timeout: 600000 });
    const d = await dl;
    if (!d) throw new Error("Ingen nedlasting");
    const file = `${out}/media/hybrid-eksport-${Date.now()}`;
    await d.saveAs(file);
    const dur = Number(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        file,
      ])
        .toString()
        .trim(),
    );
    const expected = pick.reduce((t, c) => t + c.frames, 0) / 25;
    check(
      "REQ-0418",
      "eksporten er én fil med hele lengden",
      Math.abs(dur - expected) < 0.6,
      `${dur.toFixed(2)} s (forventet ${expected.toFixed(2)} s) · ${d.suggestedFilename()}`,
    );
    // Bildene: fire bilder i sekundet, farge midt i bildet
    const raw = execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        file,
        "-vf",
        "fps=4,scale=16:9",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ],
      { maxBuffer: 1 << 26 },
    );
    const seq = [];
    for (let i = 0; i + 16 * 9 * 3 <= raw.length; i += 16 * 9 * 3) {
      const o = i + (4 * 16 + 8) * 3;
      seq.push(classify([raw[o], raw[o + 1], raw[o + 2]]));
    }
    const runs = [];
    for (const c of seq)
      if (runs.at(-1)?.c === c) runs.at(-1).n++;
      else runs.push({ c, n: 1 });
    const order = runs.filter((r) => r.n >= 2).map((r) => r.c);
    const secs = (c) => runs.filter((r) => r.c === c).reduce((t, r) => t + r.n, 0) / 4;
    check(
      "REQ-0418",
      "rekkefølgen i filen: 2D-scene → importert film → AI-video → stillbilde",
      order.join(",") === "annet,rød,grønn,blå",
      `${runs.map((r) => `${r.c}×${r.n}`).join(" ")}`,
    );
    check(
      "REQ-0214",
      "lengdene: filmen (klippet versjon, 9 s), AI-video 4 s, stillbilde 3 s",
      Math.abs(secs("rød") - pick[1].frames / 25) <= 0.75 &&
        Math.abs(secs("grønn") - 4) <= 0.75 &&
        Math.abs(secs("blå") - 3) <= 0.75,
      `rød ${secs("rød")} s · grønn ${secs("grønn")} s · blå ${secs("blå")} s`,
    );
    // Lyden: nivå per del (2D-scenen har dialog og musikk, filmene egen lyd, scene 7 også vind)
    const pcm = execFileSync(
      "ffmpeg",
      ["-v", "error", "-i", file, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
      { maxBuffer: 1 << 26 },
    );
    const rms = (a, b) => {
      let s = 0;
      let n = 0;
      for (let i = Math.floor(a * 8000); i < Math.min(pcm.length / 2, Math.floor(b * 8000)); i++) {
        const v = pcm.readInt16LE(i * 2) / 32768;
        s += v * v;
        n++;
      }
      return n ? Math.sqrt(s / n) : 0;
    };
    let t = 0;
    const levels = pick.map((c) => {
      const a = t + 0.3;
      t += c.frames / 25;
      return rms(a, t - 0.3);
    });
    check(
      "REQ-0418",
      "lydsporet har lyd i 2D-scenen, den importerte filmen og AI-videoen",
      levels[0] > 0.01 && levels[1] > 0.01 && levels[2] > 0.01,
      levels.map((l, i) => `${pick[i].source}: ${l.toFixed(3)}`).join(" · "),
    );
  } catch (e) {
    check("REQ-0418", "hybrid eksport kunne gjennomføres", false, String(e).split("\n")[0]);
    await shot(page, "v4-feil-hybrid").catch(() => undefined);
  } finally {
    await ctx.close();
  }
}

// ---------- 7. REQ-0050: manussidene i nettleseren ----------

async function testScriptPages() {
  const { ctx, page } = await openPage(`${P}/manus`);
  try {
    const kinds = Object.fromEntries(fx.rows.script_blocks.map((b) => [b.id, b.kind]));
    const r = await page.evaluate((kinds) => {
      const sheet = document.querySelector('section[aria-label^="Side "]');
      if (!sheet) return null;
      const cs = getComputedStyle(sheet);
      const em = parseFloat(cs.fontSize);
      const rect = sheet.getBoundingClientRect();
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = `${cs.fontSize} ${cs.fontFamily}`;
      const tenChars = ctx.measureText("MMMMMMMMMM").width / em;
      const lefts = {};
      const tops = [];
      for (const span of sheet.querySelectorAll("span[data-line]")) {
        const k =
          kinds[span.getAttribute("data-block")] ??
          (span.id.startsWith("scene-") ? "heading" : null);
        const l = parseFloat(span.style.left);
        if (k && Number.isFinite(l)) (lefts[k] ??= new Set()).add(Math.round((l / 0.6) * 10) / 10);
        tops.push(parseFloat(span.style.top));
      }
      return {
        ratio: rect.width / rect.height,
        widthEm: rect.width / em,
        font: cs.fontFamily,
        lineHeight: parseFloat(cs.lineHeight),
        fontSize: em,
        tenChars,
        lefts: Object.fromEntries(Object.entries(lefts).map(([k, v]) => [k, [...v]])),
        tops: tops.filter(Number.isFinite),
        sheets: document.querySelectorAll('section[aria-label^="Side "]').length,
      };
    }, kinds);
    await shot(page, "v4-20-manusside");
    check(
      "REQ-0050",
      "sidene er US Letter (8,5 × 11) i Courier Prime",
      r &&
        Math.abs(r.ratio - 8.5 / 11) < 0.002 &&
        /Courier Prime/.test(r.font) &&
        Math.abs(r.widthEm - 51) < 0.05,
      r
        ? `forhold ${r.ratio.toFixed(4)} · ${r.font.split(",")[0]} · bredde ${r.widthEm.toFixed(2)} em`
        : "ingen side",
    );
    check(
      "REQ-0050",
      "10 tegn per tomme (1 tegn = 0,6 em) og enkel linjeavstand",
      r && Math.abs(r.tenChars - 6) < 0.05 && Math.abs(r.lineHeight - r.fontSize) < 0.01,
      r
        ? `10 tegn = ${r.tenChars.toFixed(3)} em · linjehøyde ${r.lineHeight} px = skriftstørrelse ${r.fontSize} px`
        : "",
    );
    const want = { heading: 15, action: 15, character: 35, dialogue: 25, parenthetical: 29 };
    const okCols =
      r &&
      Object.entries(want).every(
        ([k, v]) => !r.lefts[k] || r.lefts[k].every((x) => Math.abs(x - v) < 0.2),
      );
    check(
      "REQ-0050",
      'innrykk: scenehode/handling 1,5", replikk 2,5", parentes 2,9", karakter 3,5"',
      okCols && r.lefts.dialogue && r.lefts.character,
      r ? JSON.stringify(r.lefts) : "",
    );
    check(
      "REQ-0050",
      "linjene står på hele linjer (1 em) fra toppen",
      r && r.tops.every((t) => Math.abs(t - Math.round(t)) < 0.001),
      r ? `${r.tops.length} linjer på side 1` : "",
    );
  } finally {
    await ctx.close();
  }
}

// ---------- Kjør ----------

const tests = [
  ["kostnad", testCostLines],
  ["sammenlign", testCompare],
  ["avspilling", testPlayback],
  ["naboscener", testNeighbours],
  ["lag", testLayerDoubleClick],
  ["opptak", testRecording],
  ["hybrid", testHybrid],
  ["manus", testScriptPages],
];
for (const [name, fn] of tests) {
  if (ONLY && !ONLY.includes(name)) continue;
  console.log(`\n== ${name} ==`);
  try {
    await fn();
  } catch (e) {
    check(name, "uventet feil", false, String(e).split("\n")[0]);
  }
}
await browser.close();

check(
  "REQ-0029",
  "ingen betalt generering ble startet i noen av gjennomgangene",
  startersCalled().length === 0,
  startersCalled().join(", "),
);
const fnCounts = {};
for (const c of serverCalls)
  fnCounts[c.replace(/^opplasting .*/, "opplasting")] =
    (fnCounts[c.replace(/^opplasting .*/, "opplasting")] ?? 0) + 1;
console.log("\nserverfunksjoner besvart av skriptet:", fnCounts);

const failed = results.filter((r) => !r.ok);
const reqs = [...new Set(results.map((r) => r.req))].sort();
console.log("\nOppsummering per krav:");
for (const q of reqs) {
  const rs = results.filter((r) => r.req === q);
  const bad = rs.filter((r) => !r.ok).length;
  console.log(`  ${bad ? "FEILET " : "BESTÅTT"} ${q}: ${rs.length - bad}/${rs.length} kontroller`);
}
console.log(
  failed.length
    ? `RESULTAT: ${failed.length} av ${results.length} kontroller feilet`
    : `RESULTAT: alle ${results.length} kontroller bestått`,
);
process.exit(failed.length || results.length === 0 ? 1 : 0);
