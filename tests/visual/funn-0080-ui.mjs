/**
 * Skjermbilder av ønskene fra Mars 13.–14.10 (DEC-0080). Mocker Supabase og serverfunksjoner (AI-svar
 * er faste eksempler; ingenting betales).
 *   ENV_FILE=…/.env node funn-0080-ui.mjs <baseUrl> <fixture.json> [utmappe]
 * Dokumentert i docs/development/VISUAL_QA_DEC-0080.md.
 */
import { chromium } from "playwright";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
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
      return json({
        providers: ["lovable", "google", "openai", "fal", "elevenlabs"],
        missing: false,
      });
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
let passed = 0, failed = 0;
async function shot(name, path, act, viewport = { width: 1440, height: 900 }) {
  if (ONLY && !ONLY.includes(name)) return;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: "dark" });
  await mock(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const exp = Math.floor(Date.now() / 1000) + 86400;
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("animatic:lang", "nb"); },
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
  errors.length ? failed++ : passed++;
  await ctx.close();
}

const layerDbl = async (page) => {
  await page
    .locator('section[aria-label="Lag"]')
    .first()
    .getByRole("button", { name: /Maja/ })
    .first()
    .dblclick();
  await page.waitForTimeout(800);
};
const openBig = async (page) => {
  await layerDbl(page);
  await page
    .getByRole("button", { name: /Vis v\d+ stort/ })
    .first()
    .click();
  await page.waitForTimeout(1200);
};
const selectMaja = async (page) => {
  await page
    .locator('section[aria-label="Lag"]')
    .first()
    .getByRole("button", { name: /Maja/ })
    .first()
    .click();
  await page.waitForTimeout(500);
};
await shot("g01-lagnavn-bredere", `${P}/scene`, async (page) => {
  const sep = page.getByRole("separator", { name: "Bredden på lagnavnene" });
  const b = await sep.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 160, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
});
await shot("g02-stil-oppaa-bildevalg", `${P}/scene`, async (page) => {
  await layerDbl(page);
  await page
    .getByRole("button", { name: /Filmens visuelle stil» …/ })
    .first()
    .click();
  await page.waitForTimeout(800);
});
await shot("g02b-tilbake-i-bildevalg", `${P}/scene`, async (page) => {
  await layerDbl(page);
  await page
    .getByRole("button", { name: /Filmens visuelle stil» …/ })
    .first()
    .click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Avbryt" }).last().click();
  await page.waitForTimeout(600);
});
await shot("g03-stor-visning-tilpass", `${P}/scene`, openBig);
await shot("g04-dobbeltklikk-flis", `${P}/scene`, async (page) => {
  await layerDbl(page);
  await page
    .getByRole("button", { name: /^Bruk versjon/ })
    .first()
    .dblclick()
    .catch(async () => {
      await page.locator('button[title^="Bruk versjon"]').first().dblclick();
    });
  await page.waitForTimeout(1200);
});
await shot("g05-utsnitt", `${P}/scene`, async (page) => {
  await openBig(page);
  await page.getByRole("button", { name: /Utsnitt/ }).click();
  const st = await page.getByTestId("lightbox-stage").boundingBox();
  const cx = st.x + st.width / 2;
  const cy = st.y + st.height / 2;
  await page.mouse.move(cx - 80, cy - 160);
  await page.mouse.down();
  for (const [dx, dy] of [
    [60, -190],
    [120, -150],
    [110, -40],
    [40, 0],
    [-60, -20],
    [-100, -100],
    [-80, -160],
  ])
    await page.mouse.move(cx + dx, cy + dy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
});
await shot("g06-del-opp-i-ruter", `${P}/scene`, async (page) => {
  await openBig(page);
  await page.getByRole("button", { name: /Del opp i ruter/ }).click();
  await page.getByLabel("Kolonner").fill("3");
  await page.getByLabel("Rader").fill("2");
  await page.waitForTimeout(300);
});
await shot("g07-lag-andre-vinkler", `${P}/scene`, async (page) => {
  await openBig(page);
  await page.getByLabel("Vinkelen bildet viser").selectOption("three_quarter");
  await page.getByRole("button", { name: /Lag andre vinkler/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Vis beskrivelsen som sendes/ }).click();
  await page.waitForTimeout(300);
});
await shot("g07b-vinkler-bekreft", `${P}/scene`, async (page) => {
  await openBig(page);
  await page.getByRole("button", { name: /Lag andre vinkler/ }).click();
  await page.getByRole("radio", { name: /Ett bilde per vinkel/ }).check();
  await page.getByRole("button", { name: /^Lag \d+ bilder/ }).click();
  await page.waitForTimeout(300);
});
await shot("g08-oppskaler", `${P}/scene`, async (page) => {
  await openBig(page);
  await page
    .getByRole("button", { name: /^Oppskaler …$/ })
    .first()
    .click();
  await page.waitForTimeout(400);
});
await shot("g09-frilegg-zoom", `${P}/scene`, async (page) => {
  await openBig(page);
  await page
    .getByRole("button", { name: /^Frilegg/ })
    .first()
    .click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Zoom inn" }).last().click();
  await page.getByRole("button", { name: "Zoom inn" }).last().click();
  await page.waitForTimeout(400);
});
await shot("g10-skvist-og-forstoerret", `${P}/scene`, async (page) => {
  await selectMaja(page);
  const sx = page.locator('label:has-text("Skalering X") input[type="number"]');
  await sx.fill("300");
  await sx.press("Enter");
  await page.waitForTimeout(400);
  const sy = page.locator('label:has-text("Skalering Y") input[type="number"]');
  await sy.fill("220");
  await sy.press("Enter");
  await page.waitForTimeout(500);
  await sx.scrollIntoViewIfNeeded();
});
await shot("g11-speilvend-fra-her", `${P}/scene`, async (page) => {
  await selectMaja(page);
  await page.getByLabel("Hvordan speilvendingen virker").selectOption("smooth");
  await page.getByLabel("Hvordan speilvendingen virker").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
});
await shot("g12-sidehaandtak", `${P}/scene`, async (page) => {
  await selectMaja(page);
  await page.waitForTimeout(400);
});
await shot("g13-manus-lesevisning", `${P}/manus`, async (page) => {
  await page.getByRole("button", { name: /^Visning/ }).click();
  await page.getByLabel("Vis kun valgt scene").check();
  await page.keyboard.press("Escape");
  await page
    .getByText(/^INT\. STUA - HJEMME HOS M/)
    .first()
    .click();
  await page.waitForTimeout(800);
});
await shot("g13b-manus-lesevisning-lys", `${P}/manus`, async (page) => {
  await page.getByRole("button", { name: /^Visning/ }).click();
  await page.getByLabel("Vis kun valgt scene").check();
  await page.getByLabel("Sort tekst på hvit bakgrunn").check();
  await page.keyboard.press("Escape");
  await page
    .getByText(/^INT\. STUA - HJEMME HOS M/)
    .first()
    .click();
  await page.waitForTimeout(800);
});
await shot("g14-stilanalyse", P, async (page) => {
  await page
    .getByRole("button", { name: /^(Lag|Rediger) …$/ })
    .first()
    .click();
  await page.waitForTimeout(600);
  // Velg to forbildebilder om ingen er valgt
  const boxes = page.locator('fieldset:has-text("Forbildebilder") input[type="checkbox"]');
  for (let i = 0; i < Math.min(2, await boxes.count()); i++)
    if (!(await boxes.nth(i).isChecked())) await boxes.nth(i).check();
  await page.getByRole("button", { name: /Analyser stilen/ }).click();
  await page.getByRole("button", { name: "Ja, analyser" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("region", { name: "Stilanalyse" }).scrollIntoViewIfNeeded();
});
await shot("g15-faktaark", `${P}/bibliotek`, async (page) => {
  await page.getByRole("button", { name: /^Maja/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Lag utkast fra manuset/ }).click();
  await page.getByRole("button", { name: "Ja, lag utkast" }).click();
  await page.waitForTimeout(1000);
  await page.getByRole("region", { name: /Visuelt faktaark/ }).scrollIntoViewIfNeeded();
});
await shot("g16-bestillingen-kort", `${P}/scene`, async (page) => {
  await layerDbl(page);
  await page.getByLabel("Beskrivelse for AI-generering").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
});
await shot("g17-bibliotek-bildeverktoy", `${P}/bibliotek`, async (page) => {
  await page.getByRole("button", { name: /^Maja/ }).first().click();
  await page.waitForTimeout(500);
  await page
    .getByRole("button", { name: /Bildeverktøy/ })
    .first()
    .click();
  await page.waitForTimeout(1200);
});
await browser.close();
console.log(`RESULTAT ${passed} bestått, ${failed} feilet`);
process.exitCode = failed ? 1 : 0;
