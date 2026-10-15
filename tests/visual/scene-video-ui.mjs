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
const UPLOADS = [];
const STARTS = [];
const table0 = (p) => p.replace("/rest/v1/", "");
const BATCH = "00000000-0000-7000-8000-00000000b001";
const JOBS = [];
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
    if (path.startsWith("/storage/v1/object/assets/") && req.method() === "POST") {
      UPLOADS.push({ path: path.replace("/storage/v1/object/assets/", ""), type: req.headers()["content-type"], size: (req.postDataBuffer() ?? Buffer.alloc(0)).length });
      return json({ Key: path });
    }
    if (table0(path) === "generation_jobs") return json(JOBS);
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
    if (table === "schema_version") return json([{ version: 32 }]);
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
      return json({ providers: ["lovable", "google", "openai", "fal", "runway", "elevenlabs"], missing: false });
    if (/startVideoGeneration/.test(name)) {
      const body = route.request().postData() ?? "";
      STARTS.push(body);
      return json({ ok: true, jobId: "j" + STARTS.length, costUsd: 1.5 });
    }
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



const occ0 = fx.rows.scene_occurrences?.[0];
async function run(name, act, lang = "nb") {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  await mock(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const exp = Math.floor(Date.now() / 1000) + 86400;
  await page.addInitScript(
    ([k, v, l]) => {
      localStorage.setItem(k, v);
      localStorage.setItem("animatic:lang", l);
    },
    [`sb-${ref}-auth-token`, JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: USER }), lang],
  );
  await page.goto(base + P + "/scene", { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
  try {
    await act(page);
  } catch (e) {
    errors.push("act: " + e.message);
  }
  console.log(name, errors.length ? "FEIL: " + errors.join(" | ").slice(0, 800) : "ok");
  await ctx.close();
}
let pass = 0, fail = 0;
const check = (ok, text) => { console.log(`  ${ok ? "✓" : "✗"} ${text}`); ok ? pass++ : fail++; };

await (process.env.ONLY_H && process.env.ONLY_H !== "h01" ? async () => {} : run)("h01-knapp-og-dialog", async (page) => {
  const btn = page.getByTestId("scene-ai-video");
  check(await btn.isVisible(), "knappen «AI-video …» står i verktøylinjen");
  await page.screenshot({ path: `${out}/h01a-verktoylinje.png` });
  await btn.click();
  await page.waitForTimeout(1500);
  const dlg = page.getByRole("dialog");
  check(await dlg.getByText("Scenen vises som").isVisible(), "dialogen viser hva scenen vises som");
  check(await dlg.getByText("2D-scenen (animatic)").isVisible(), "2D-scenen er et valg");
  check(await dlg.getByRole("button", { name: /Last opp video/ }).isVisible(), "video kan lastes opp for scenen");
  check(await dlg.getByRole("button", { name: /Last ned scenen/ }).isVisible(), "scenen kan lastes ned");
  const opts = await dlg.locator("select option").allTextContents();
  check(opts.some((t) => t.includes("Kling O3 Edit")), "Kling O3 Edit kan velges");
  check(opts.some((t) => t.includes("Aleph 2") && /kreditter\/sek/.test(t)), "Aleph 2 kan velges, med kreditter");
  check(opts.some((t) => t === "2D-scenen"), "kilden kan velges (2D-scenen)");
  check(await dlg.getByText("Generell beskrivelse for hele prosjektet").isVisible(), "den globale beskrivelsen vises med avkrysning");
  const desc = dlg.getByRole("textbox", { name: "Scenebeskrivelse" });
  check(/^Scene: /.test(await desc.inputValue()), "scenebeskrivelsen er laget fra manuset");
  check(await dlg.getByText("Referansebilder", { exact: true }).isVisible(), "referansebildene vises");
  check(await dlg.getByText(/Anslått pris: \$/).isVisible(), "anslått pris vises");
  check(await dlg.getByText("Undertekster sendes aldri.").isVisible(), "undertekster sendes aldri");
  await desc.fill("Scene: Interior, Stua, dag.\nAction: Maja er redd, men nysgjerrig.");
  await dlg.getByText("Se hele beskrivelsen som sendes").click();
  await page.waitForTimeout(300);
  let pre = await dlg.locator("details pre").first().textContent();
  check(/redraw @Video1/.test(pre ?? ""), "beskrivelsen sender scenen som @Video1");
  check((pre ?? "").includes("Maja er redd, men nysgjerrig."), "scenebeskrivelsen kommer med");
  const globalShown = (await dlg.locator("[data-testid=global-style] pre").textContent()) ?? "";
  const hasGlobal = !/ingen visuell stil ennå/.test(globalShown);
  check(hasGlobal ? (pre ?? "").includes("Project style (applies to the whole film)") : !(pre ?? "").includes("Project style"), `den globale beskrivelsen er med som standard (${hasGlobal ? "prosjektet har stil" : "fiksturen har ingen stil: ingenting sendes"})`);
  await page.screenshot({ path: `${out}/h01b-dialog.png` });
  await dlg.getByRole("checkbox", { name: /Generell beskrivelse/ }).uncheck();
  await page.waitForTimeout(200);
  pre = await dlg.locator("details pre").first().textContent();
  check(!(pre ?? "").includes("Project style"), "den globale beskrivelsen kan krysses vekk");
  check((await dlg.locator("[data-testid=global-style] pre").getAttribute("aria-disabled")) === "true", "den gråes ned når den er krysset vekk");
  await dlg.getByRole("checkbox", { name: /Generell beskrivelse/ }).check();
  await dlg.getByRole("button", { name: /Lag AI-video/ }).click();
  await page.waitForTimeout(300);
  check(await dlg.getByText(/Dette koster ca\. \$/).isVisible(), "kostnaden må bekreftes før sending");
  await page.screenshot({ path: `${out}/h01c-bekreft.png` });
  await dlg.getByRole("button", { name: /Ja, lag videoen/ }).click();
  await dlg.getByText(/^Sendt|Nettleseren kan|kunne ikke/).first().waitFor({ timeout: 60000 });
  await page.screenshot({ path: `${out}/h01d-sendt.png` });
  const sentText = (await dlg.locator("[role=status],[role=alert]").allTextContents()).join(" | ");
  console.log("   status:", sentText.slice(0, 300));
  const videos = UPLOADS.filter((u) => u.path.endsWith(".mp4"));
  check(videos.length >= 1 && videos.every((u) => u.path.includes("/ai-source/") && u.size > 1000), `scenen er lastet opp som video (${videos.map((u) => u.size).join(", ")})`);
  const flat = STARTS[0] ?? "";
  check(/sourceVideoPath/.test(flat) && /ai-source/.test(flat), "jobben sendes med videoen av scenen");
  check(/"piece"/.test(flat) && /"batch"/.test(flat), "jobben har bunt og bit");
  check(/fal-ai\/kling-video\/o3\/pro\/video-to-video\/edit/.test(flat), "Kling O3 Edit er valgt");
  check(/this video has no sound/.test(flat) && /No sound\./.test(flat), "lyden sendes ikke med som standard");
  check(/"imagePaths"/.test(flat) && /"elementPaths"/.test(flat), "referansebildene sendes");
});

// En video fra 2D-scenen som er under arbeid vises i dialogen
const order = (fx.rows.scene_occurrences ?? []).filter((o) => o.active).sort((a, b) => (a.order_key < b.order_key ? -1 : 1));
for (const o of order.slice(0, 3))
  for (const i of [0, 1])
    JOBS.push({
      id: `00000000-0000-7000-8000-0000000c00${order.indexOf(o)}${i}`,
      project_id: project.id,
      kind: "video",
      provider: "fal",
      model: "fal-ai/kling-video/o3/pro/video-to-video/edit",
      prompt: "p",
      status: i === 0 ? "done" : "running",
      result_path: null,
      created_at: "2026-10-15T09:00:00Z",
      created_by: USER.id,
      occurrence_id: o.id,
      params: { source: "scene2d", batch: `b-${o.id}`, piece: i, pieces: 2, startMs: i * 2000, endMs: (i + 1) * 2000 },
    });
await run("h02-under-arbeid", async (page) => {
  await page.getByTestId("scene-ai-video").click();
  await page.waitForTimeout(1500);
  const dlg = page.getByRole("dialog");
  check(await dlg.getByTestId("scene-video-batch").first().isVisible(), "bunten vises som versjon av scenen");
  check(await dlg.getByText(/Lages … 0 av 2 ferdig/).first().isVisible(), "bunten vises som under arbeid");
  await page.screenshot({ path: `${out}/h02-under-arbeid.png` });
});
await run("h03-engelsk", async (page) => {
  await page.getByTestId("scene-ai-video").click();
  await page.waitForTimeout(1500);
  const dlg = page.getByRole("dialog");
  check(await dlg.getByText("AI video of the scene").isVisible(), "dialogen er på engelsk");
  check(await dlg.getByText("The scene is shown as").isVisible(), "«The scene is shown as»");
  await page.screenshot({ path: `${out}/h03-engelsk.png` });
}, "en");
await run("h04-status-og-lyd", async (page) => {
  const st = page.getByTestId("generation-status");
  check(await st.isVisible(), "statusen for genereringer står i toppfeltet");
  check(/lages/.test((await st.textContent()) ?? ""), `statusen viser hva som lages (${(await st.textContent())?.trim()})`);
  await st.click();
  await page.waitForTimeout(500);
  check(await page.getByText("AI-genereringer").first().isVisible(), "statusen åpner listen over genereringer");
  await page.screenshot({ path: `${out}/h04a-status.png` });
  await page.keyboard.press("Escape");
  STARTS.length = 0;
  await page.getByTestId("scene-ai-video").click();
  await page.waitForTimeout(1500);
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("checkbox", { name: /Send scenens lyd med/ }).check();
  await dlg.getByRole("button", { name: /Lag AI-video/ }).click();
  await dlg.getByRole("button", { name: /Ja, lag videoen/ }).click();
  await dlg.getByText(/^Sendt|Nettleseren kan|kunne ikke/).first().waitFor({ timeout: 60000 });
  check(/Use the sound in @Video1 for lip movement and timing/.test(STARTS[0] ?? ""), "lyden kan velges sendt med");
});
await run("h05-global-beskrivelse", async (page) => {
  await page.getByTestId("scene-ai-video").click();
  await page.waitForTimeout(1500);
  const dlg = page.getByRole("dialog");
  await dlg.locator("[data-testid=global-style]").getByRole("button", { name: /Rediger/ }).click();
  check(await dlg.getByText(/Endres globalt for hele prosjektet/).isVisible(), "redigering varsler at den endres globalt for hele prosjektet");
  await page.screenshot({ path: `${out}/h05-global-rediger.png` });
});
await run("h06-nedlasting", async (page) => {
  await page.getByTestId("scene-ai-video").click();
  await page.waitForTimeout(1200);
  await page.getByRole("dialog").getByRole("button", { name: /Last ned scenen/ }).click();
  await page.waitForTimeout(5000);
  check(/\/montering/.test(page.url()), "«Last ned scenen» åpner monteringen");
  const exp = page.getByRole("dialog");
  check(await exp.getByTestId("export-format").isVisible(), "nedlastingen har valg av filformat");
  check((await exp.getByTestId("export-format").locator("option").allTextContents()).some((t) => t.includes("WebM")), "MP4 og WebM kan velges");
  check(await exp.getByTestId("export-subtitles").isVisible(), "nedlastingen har eget valg for undertekster");
  check(await exp.getByRole("radio", { name: /Valgt scene/ }).isChecked().catch(() => false), "nedlastingen er satt til valgt scene");
  await page.screenshot({ path: `${out}/h06-nedlasting.png` });
});
console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
await browser.close();
