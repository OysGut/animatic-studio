/**
 * Skjermbilder av ønskene fra Mars 13.–14.10 (DEC-0080). Mocker Supabase og serverfunksjoner (AI-svar
 * er faste eksempler; ingenting betales).
 *   ENV_FILE=…/.env node funn-0080-ui.mjs <baseUrl> <fixture.json> [utmappe]
 * Dokumentert i docs/development/VISUAL_QA_DEC-0080.md.
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/funn80",
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
const ANITA = "00000000-0000-7000-8000-a11ce0000002";
const OLA = "00000000-0000-7000-8000-a11ce0000003";
const OTHER = "00000000-0000-7000-8000-0000000b0001";
const mainProd = fx.rows.productions.find((p) => p.kind === "main");
const PRODS = [
  { ...mainProd, description: "Hovedfilmen, ca. 24 min. Klippet til NRK-versjonen." },
  { id: "p-2", project_id: project.id, kind: "trailer", name: "Trailer", parent_production_id: mainProd.id, created_at: "2026-10-01T10:00:00Z", description: "90 sekunder til festivalpåmeldingen." },
  { id: "p-3", project_id: project.id, kind: "spinoff", name: "Nissens jul", parent_production_id: mainProd.id, created_at: "2026-10-05T10:00:00Z", description: "" },
  { id: "p-4", project_id: project.id, kind: "teaser", name: "Teaser til sosiale medier", parent_production_id: "p-2", created_at: "2026-10-09T10:00:00Z", description: "Kvadratisk, 15 sek." },
  { id: "p-5", project_id: OTHER, kind: "main", name: "Hovedfilm", parent_production_id: null, created_at: "2026-09-02T09:00:00Z", description: "Pilot for ny serie. Jeg går gjennom manuset." },
];
const P = `/prosjekt/${project.id}`;
const ONLY = process.env.ONLY?.split(",");

const maja = fx.rows.assets.find((a) => a.name.startsWith("Maja"));
const majaVar = fx.rows.asset_variants.filter((v) => v.asset_id === maja.id);
const majaVers = fx.rows.asset_versions.filter((v) => majaVar.some((x) => x.id === v.variant_id));
const firstVer = majaVers.sort((a, b) => b.number - a.number)[0];
const jobs = [
  {
    id: "00000000-0000-7000-8000-00000000a001",
    project_id: project.id,
    kind: "image",
    provider: "google",
    model: "gemini-3-pro-image",
    prompt:
      'FILM\nA 2D animated film.\n\nTHIS IMAGE\nDesign a character: Maja, ten years old, red woollen cap, grey coat, curious eyes looking up at the sky.\n\nIN THE SCREENPLAY\n- "Maja står ved vinduet og ser ut på snøen."',
    asset_id: maja.id,
    status: "done",
    error: null,
    result_path: firstVer.media_path,
    created_at: "2026-10-13T10:12:00Z",
    finished_at: "2026-10-13T10:12:30Z",
    created_by: USER.id,
    cost_usd: 0.14,
  },
];
const rows = { ...fx.rows, generation_jobs: jobs };

function wav(seconds) {
  const rate = 8000,
    n = Math.round(seconds * rate),
    buf = Buffer.alloc(44 + n * 2);
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
    const e = 0.25 + 0.75 * Math.abs(Math.sin(t * 1.7));
    buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * t) * e * 0.8 * 32767), 44 + i * 2);
  }
  return buf;
}
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
    if (path.startsWith("/storage/v1/object/sign/") && path.endsWith(".wav"))
      return route.fulfill({
        status: 200,
        contentType: "audio/wav",
        body: wav(path.includes("maja") ? 3.5 : 20),
      });
    if (path.startsWith("/storage/v1/object/sign/")) {
      const n = (path.length * 37) % 360;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 300 400"><rect width="300" height="400" fill="hsl(${n} 25% 22%)"/><circle cx="150" cy="120" r="60" fill="hsl(${n} 45% 70%)"/><path d="M60 380 Q150 170 240 380Z" fill="hsl(${n} 45% 60%)"/></svg>`;
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
    }
    const table = path.replace("/rest/v1/", "");
    if (table === "schema_version") return json([{ version: 31 }]);
    if (table === "projects") {
      if (single) return json(project);
      if (url.searchParams.get("id")?.startsWith("eq."))
        return json([{ ...project, project_members: [{ role: "owner", user_id: USER.id }] }]);
      return json([
        { ...project, project_members: [{ role: "owner", user_id: USER.id }, { role: "editor", user_id: ANITA }] },
        {
          id: OTHER,
          name: "Fjellet som flyttet seg",
          created_at: "2026-09-02T09:00:00Z",
          project_members: [
            { role: "owner", user_id: ANITA },
            { role: "editor", user_id: USER.id },
            { role: "viewer", user_id: OLA },
          ],
        },
      ]);
    }
    if (table === "productions" && url.searchParams.get("project_id")?.startsWith("in."))
      return json(PRODS);
    if (table === "project_members")
      return json([{ user_id: USER.id, role: "owner", joined_at: "2026-10-08T10:00:00Z" }]);
    if (table === "profiles") return json([{ user_id: USER.id, display_name: "Mars" }, { user_id: ANITA, display_name: "Anita Killi" }, { user_id: OLA, display_name: "Ola Nordmann" }]);
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
    if (/projectAiProviders/.test(name))
      return json({ providers: ["lovable", "google", "openai", "fal", "elevenlabs"], missing: false });
    if (/writeImagePrompt/.test(name)) {
      const body = route.request().postData() ?? "";
      if (body.includes('"style"'))
        return json({
          ok: true,
          model: "google/gemini-3.1-pro-preview",
          jobId: "j-style",
          prompt: JSON.stringify({
            en: {
              summary: "Flat 2D cut-paper look with soft painted textures",
              technique: "Digital cut paper over gouache washes",
              line: "No outlines; shapes are defined by colour and value",
              shapes: "Round, simple heads; about 1:4 head-to-body; small hands",
              colour: "Muted winter blues and off-whites with warm amber accents",
              lighting: "Flat, soft shading, no hard cast shadows",
              texture: "Visible paper grain and dry-brush edges",
              detail: "Low detail; one or two textures per shape",
              composition: "Centred, frontal staging with generous negative space",
              breaks: "Photorealism, 3D rendering, gradients, thin uniform vector lines",
            },
            nb: {
              summary: "Flat 2D-utklippsstil med myke, malte teksturer",
              technique: "Digitalt papirklipp over gouache-lasering",
              line: "Ingen konturer; formene avgrenses av farge og valør",
              shapes: "Runde, enkle hoder; ca. 1:4 hode–kropp; små hender",
              colour: "Dempet vinterblått og brukket hvitt med varme ravgule aksenter",
              lighting: "Flatt, mykt skygge, ingen harde slagskygger",
              texture: "Synlig papirstruktur og tørrpenselkanter",
              detail: "Lite detaljer; én eller to teksturer per form",
              composition: "Sentrert, frontal oppstilling med god luft",
              breaks: "Fotorealisme, 3D, gradienter, tynne jevne vektorlinjer",
            },
            colours: ["#1b2a3a", "#f1ece2", "#d9a441", "#8fa4bb", "#6b4b3a"],
          }),
        });
      if (body.includes('"visual"'))
        return json({
          ok: true,
          model: "google/gemini-3.1-pro-preview",
          jobId: "j-visual",
          prompt:
            "- ten-year-old girl, slim and a little small for her age\n- long dark-blond braid (cut short later in the story)\n- red woollen cap and grey wool coat\n- curious, wide eyes; often looks up\n- moves quickly, a bit restless",
        });
      return json({ ok: false, message: "ikke i testen" });
    }
    if (/listVoices/.test(name))
      return json({
        ok: true,
        voices: [
          { voiceId: "v1", name: "Ingrid", description: "norsk, varm", previewUrl: null },
          { voiceId: "v2", name: "Halvard", description: "eldre, rolig", previewUrl: null },
          { voiceId: "v3", name: "Solveig", description: "ung, lys", previewUrl: null },
        ],
      });
    if (/runCommand/.test(name))
      return json({ ok: true, changeId: "x", affected: [], inverse: null, revisions: {} });
    if (/pumpProjectQueue/.test(name)) return json({ sent: 0 });
    return route.abort();
  });
}
const browser = await chromium
  .launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" })
  .catch(() => chromium.launch());
async function shot(name, path, act, viewport = { width: 1440, height: 900 }) {
  if (ONLY && !ONLY.includes(name)) return;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: "dark" });
  await mock(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const exp = Math.floor(Date.now() / 1000) + 86400;
  await page.addInitScript(
    ([k, v]) => localStorage.setItem(k, v),
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
  try {
    await act?.(page);
  } catch (e) {
    errors.push("act: " + e.message);
  }
  await page.screenshot({ path: `${out}/${name}.png` });
  if (process.env.DBG)
    console.log(
      await page.evaluate(
        () =>
          [...document.querySelectorAll("textarea")]
            .map((t) => t.value.slice(0, 100).replace(/\n/g, " "))
            .join(" || ") +
          " ## " +
          [...document.querySelectorAll("span")]
            .map((x) => x.textContent)
            .filter((t) => /Siste beskrivelse/.test(t))
            .join("|"),
      ),
    );
  console.log(name, errors.length ? "FEIL: " + errors.join(" | ").slice(0, 600) : "ok");
  await ctx.close();
}


const NBWORD = /[æøåÆØÅ]|\b(og|ikke|eller|med|til|som|av|er|du|kan|skal|ingen|alle|denne|nytt|nye|lagre|slett|velg|legg|bruk|lukk|avbryt|ferdig|mangler|fra|uten|når|bare|lag|bilde|bilder|scener|scenen|manus|ressurser|versjon|endre|vis|skjul|tilbake|neste|kopier|eier|redaktør|leser|klikk|oppdater|valgt|feil|lyd|opptak|notat)\b/i;
async function scan(page, name) {
  const texts = await page.evaluate(() => {
    const out = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const el = w.currentNode.parentElement;
      if (!el || el.closest("textarea,[contenteditable],script,style,[data-user-content]")) continue;
      const t = w.currentNode.textContent.trim();
      if (t) out.add(t);
    }
    for (const el of document.querySelectorAll("[title],[aria-label],[placeholder]"))
      for (const a of ["title", "aria-label", "placeholder"]) {
        const v = el.getAttribute(a);
        if (v) out.add(a + "=" + v);
      }
    return [...out];
  });
  const hits = texts.filter((t) => NBWORD.test(t));
  console.log(`--- ${name}: ${hits.length} mulige norske tekster`);
  for (const h of hits) console.log("   " + h.slice(0, 140));
}
async function en(name, path, lang = "en", act) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  await mock(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  if (process.env.DBG) {
    page.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 300)));
    page.on("response", (r) => r.url().includes("/rest/v1/") && console.log(r.status(), r.url().slice(0, 160)));
  }
  const exp = Math.floor(Date.now() / 1000) + 86400;
  await page.addInitScript(
    ([k, v, l]) => {
      localStorage.setItem(k, v);
      localStorage.setItem("animatic:lang", l);
    },
    [`sb-${ref}-auth-token`, JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: USER }), lang],
  );
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);
  try { await act?.(page); } catch (e) { errors.push("act: " + e.message); }
  await page.screenshot({ path: `${out}/${name}.png` });
  if (lang === "en") await scan(page, name);
  console.log(name, errors.length ? "FEIL: " + errors.join(" | ").slice(0, 600) : "ok");
  await ctx.close();
}
const only = process.env.ONLY?.split(",");
const pages = [
  ["projects-nb", "/", "nb"],
  ["projects-en", "/", "en"],
  ["overview-en", P, "en"],
  ["overview-nb", P, "nb"],
  ["script-en", P + "/manus", "en"],
  ["scene-en", P + "/scene", "en"],
  ["assembly-en", P + "/montering", "en"],
  ["library-en", P + "/bibliotek", "en"],
  ["release-en", P + "/utgivelse", "en"],
];
for (const [n, p, l] of pages) if (!only || only.includes(n)) await en(n, p, l);
await browser.close();
