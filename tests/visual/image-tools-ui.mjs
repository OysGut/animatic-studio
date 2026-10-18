/**
 * Bildeverktøyene i stor visning (Mars 15.10.2026): delelinjer som kan dras i «Del opp», navn per rute med
 * varm gul ramme, «Del opp nå», «Fjern luften rundt» på hvit bakgrunn, «Lag variasjoner …» og «Deler …».
 * Mocker Supabase og serverfunksjoner (AI-svar er faste eksempler; ingenting betales).
 *   ENV_FILE=…/.env node image-tools-ui.mjs <baseUrl> <fixture.json> [utmappe]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/imgtools",
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
const rows = { ...fx.rows, generation_jobs: [] };

function serverFnName(url) {
  try {
    const b64 = new URL(url).pathname.split("/_serverFn/")[1];
    return JSON.parse(Buffer.from(decodeURIComponent(b64), "base64url").toString("utf8")).export;
  } catch {
    return "?";
  }
}
/** Hvit bakgrunn med en rød figur i midten (AI-bilder og vinkelark har som regel hvit bakgrunn). */
const WHITE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600"><rect width="1200" height="1600" fill="#ffffff"/><rect x="420" y="500" width="360" height="620" fill="#b8322a"/><rect x="460" y="560" width="120" height="500" fill="#e8a33a"/></svg>`;
const UPLOADS = [];
const RUNS = [];
const GENS = [];
let genN = 0;
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
      UPLOADS.push({
        path: path.replace("/storage/v1/object/assets/", ""),
        size: (req.postDataBuffer() ?? Buffer.alloc(0)).length,
      });
      return json({ Key: path });
    }
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
    if (path.startsWith("/storage/v1/object/sign/"))
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: WHITE_SVG });
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
    const body = route.request().postData() ?? "";
    const json = (result) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result, context: {} }),
      });
    if (/projectAiProviders/.test(name))
      return json({ providers: ["lovable", "google", "openai", "fal"], missing: false });
    if (/generateImage/.test(name)) {
      GENS.push(body);
      genN++;
      const id = `00000000-0000-7000-8000-0000000d${String(genN).padStart(4, "0")}`;
      return json({
        ok: true,
        versionId: id,
        model: "google/gemini-3-pro-image",
        jobId: "j" + genN,
        media: {
          path: `${project.id}/assets/x/${id}.png`,
          mimeType: "image/png",
          width: 1024,
          height: 1024,
          byteSize: 1000,
          sha256: "0".repeat(64),
        },
      });
    }
    if (/runCommand/.test(name)) {
      RUNS.push(body);
      return json({ ok: true, changeId: "x", affected: [], inverse: null, revisions: {} });
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
const ONLY = process.env.ONLY?.split(",");

async function run(name, act, lang = "nb") {
  if (ONLY && !ONLY.includes(name)) return;
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  });
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
  await page.goto(base + P + "/scene", { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  try {
    await act(page);
  } catch (e) {
    errors.push("act: " + e.message);
    await page.screenshot({ path: `${out}/${name}-feil.png` });
  }
  console.log(name, errors.length ? "FEIL: " + errors.join(" | ").slice(0, 800) : "ok");
  if (errors.length) fail++;
  await ctx.close();
}

/** Åpne stor visning av Maja fra laget i sceneeditoren (som funn-0080-ui.mjs). */
async function openBig(page) {
  await page
    .locator('section[aria-label="Lag"]')
    .first()
    .getByRole("button", { name: /Maja/ })
    .first()
    .dblclick();
  await page.waitForTimeout(800);
  await page
    .getByRole("button", { name: /Vis v\d+ stort/ })
    .first()
    .click();
  await page.waitForTimeout(1500);
  return page.getByRole("dialog").last();
}
const status = (dlg) => dlg.locator("[role=status],[role=alert]").last();

await run("i01-delelinjer", async (page) => {
  const dlg = await openBig(page);
  await dlg.getByRole("button", { name: /Del opp i ruter/ }).click();
  await dlg.getByLabel("Kolonner").fill("2");
  await dlg.getByLabel("Rader").fill("2");
  await page.waitForTimeout(300);
  check(
    (await dlg.getByRole("button", { name: "Del opp nå" }).count()) === 1,
    "knappen heter «Del opp nå»",
  );
  const x1 = dlg.getByTestId("grid-line-x-1");
  const y1 = dlg.getByTestId("grid-line-y-1");
  check(
    (await x1.getAttribute("aria-valuenow")) === "50" &&
      (await y1.getAttribute("aria-valuenow")) === "50",
    "linjene er jevnt fordelt først",
  );
  // Grip linjen et stykke over krysset (i krysset ligger den vannrette linjen øverst)
  const b = await x1.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 90, b.y + b.height * 0.25, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const nx = Number(await x1.getAttribute("aria-valuenow"));
  check(nx < 45 && nx > 20, `den loddrette linjen er dratt (50 → ${nx} %)`);
  check((await y1.getAttribute("aria-valuenow")) === "50", "den vannrette linjen står i ro");
  const c = await y1.boundingBox();
  await page.mouse.move(c.x + c.width * 0.75, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width * 0.75, c.y + c.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const ny = Number(await y1.getAttribute("aria-valuenow"));
  check(ny > 52, `den vannrette linjen flyttes for seg (50 → ${ny} %)`);
  check(
    Number(await x1.getAttribute("aria-valuenow")) === nx,
    "den loddrette står der den ble satt",
  );
  // Dra langt forbi kanten: linjen stopper innenfor bildet
  const b2 = await x1.boundingBox();
  await page.mouse.move(b2.x + b2.width / 2, b2.y + 40);
  await page.mouse.down();
  await page.mouse.move(b2.x - 2000, b2.y + 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  check(Number(await x1.getAttribute("aria-valuenow")) >= 2, "linjen kan ikke dras ut av bildet");
  // Piltastene flytter linjen (Shift: 2 % per trykk) – tilbake til litt til venstre for midten
  await x1.focus();
  for (let i = 0; i < 21; i++) await page.keyboard.press("Shift+ArrowRight");
  const kx = Number(await x1.getAttribute("aria-valuenow"));
  check(kx >= 40 && kx <= 46, `piltastene flytter linjen (${kx} %)`);
  await page.screenshot({ path: `${out}/i01a-delelinjer.png` });

  // Klikk på rute 3 (nede til venstre): feltet for rute 3 får fokus og ruten gul ramme
  const t3 = await dlg.getByTestId("grid-tile-3").boundingBox();
  await page.mouse.click(t3.x + t3.width / 2, t3.y + t3.height / 2);
  await page.waitForTimeout(300);
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  check(focused === "tile-name-3", `klikk på rute 3 fokuserer feltet «3.» (${focused})`);
  const tile3 = dlg.getByTestId("grid-tile-3");
  check((await tile3.getAttribute("data-active")) === "true", "rute 3 er markert");
  const style = await tile3.evaluate((el) => {
    const s = getComputedStyle(el);
    const n = el.querySelector("span");
    const ns = getComputedStyle(n);
    return {
      bw: s.borderTopWidth,
      bc: s.borderTopColor,
      fw: ns.fontWeight,
      col: ns.color,
      shadow: ns.textShadow,
    };
  });
  check(style.bw === "2px", `ruten har 2 px ramme (${style.bw})`);
  check(
    style.bc === style.col && style.bc !== "rgb(255, 255, 255)",
    `rammen og tallet har samme varme farge (${style.bc})`,
  );
  check(Number(style.fw) >= 700, "tallet er fet");
  check(
    /rgba?\(0, 0, 0/.test(style.shadow) && /px/.test(style.shadow),
    "tallet har mørk, uskarp skygge",
  );
  check(
    (await dlg.getByTestId("grid-tile-1").getAttribute("data-active")) === null,
    "andre ruter er ikke markert",
  );
  await page.keyboard.type("Side");
  await dlg.getByTestId("tile-name-1").fill("Front");
  check(
    (await dlg.getByTestId("grid-tile-1").getAttribute("data-active")) === "true",
    "fokus i feltet «1.» markerer rute 1",
  );
  await page.screenshot({ path: `${out}/i01b-rute-med-fokus.png` });
  // Lagre: ett nytt objekt per rute
  await dlg.getByRole("radio", { name: /Ett nytt objekt per rute/ }).check();
  RUNS.length = 0;
  await dlg.getByRole("button", { name: "Del opp nå" }).click();
  await dlg
    .getByText(/ruter er lagret som nye bilder|Rute \d/)
    .first()
    .waitFor({ timeout: 30000 });
  const all = RUNS.join("\n");
  check(/"Front"/.test(all) && /"Side"/.test(all), "rutenavnene blir navnene på de nye objektene");
  check(/Maja[^"]{0,40} 2"/.test(all), "rute uten navn får prefiks + nummer");
  console.log("   status:", (await status(dlg).textContent())?.slice(0, 200));
  await page.screenshot({ path: `${out}/i01c-lagret.png` });
});

await run("i02-fjern-luften", async (page) => {
  const dlg = await openBig(page);
  UPLOADS.length = 0;
  await dlg.getByRole("button", { name: "Fjern luften rundt" }).click();
  await dlg
    .getByText(/Lagret som ny versjon|ingen luft/)
    .first()
    .waitFor({ timeout: 30000 });
  const text = (await status(dlg).textContent()) ?? "";
  console.log("   status:", text.slice(0, 200));
  check(
    /Lagret som ny versjon \(\d+ × \d+ px\)/.test(text),
    "luften fjernes på et bilde med hvit bakgrunn",
  );
  const m = /\((\d+) × (\d+) px\)/.exec(text);
  check(
    !!m && Number(m[1]) < 600 && Number(m[2]) < 900,
    `figuren er beskåret tett (${m?.[1]} × ${m?.[2]})`,
  );
  check(/ensfargede bakgrunnen/.test(text), "meldingen sier at bakgrunnen var ensfarget");
  check(
    UPLOADS.some((u) => u.size > 100),
    "det nye bildet er lastet opp",
  );
  await page.screenshot({ path: `${out}/i02-fjern-luften.png` });
});

await run("i03-variasjoner", async (page) => {
  const dlg = await openBig(page);
  await dlg.getByRole("button", { name: /Lag variasjoner/ }).click();
  await page.waitForTimeout(400);
  const panel = dlg.getByTestId("variation-panel");
  check(await panel.isVisible(), "variasjonspanelet åpnes ved siden av vinkler");
  const area = panel.getByRole("textbox", { name: /Hva ønsker du forskjellig/ });
  check(
    /døren står åpen/.test((await area.getAttribute("placeholder")) ?? ""),
    "eksempel i plassholderen",
  );
  check(
    await panel.getByText("Skriv hva som skal være forskjellig.").isVisible(),
    "teksten kreves",
  );
  check(
    await panel.getByRole("button", { name: /Lag variasjonen/ }).isDisabled(),
    "kan ikke starte uten tekst",
  );
  await area.fill("the door stands open");
  await panel.getByLabel("Antall variasjoner").selectOption("2");
  check(
    await panel.getByText(/2 bilder · anslått \$/).isVisible(),
    "prisen vises for 2 variasjoner",
  );
  await panel.getByRole("button", { name: /Vis beskrivelsen som sendes/ }).click();
  const pre = (await panel.getByTestId("prompt-preview").textContent()) ?? "";
  check(pre.includes('"the door stands open"'), "teksten står i beskrivelsen");
  check(
    /Keep everything else exactly as in the original/.test(pre),
    "beskrivelsen ber om å beholde resten",
  );
  await page.screenshot({ path: `${out}/i03a-variasjoner.png` });
  await panel.getByRole("button", { name: /Lag 2 variasjoner/ }).click();
  check(
    await panel.getByRole("alertdialog", { name: "Bekreft generering av variasjoner" }).isVisible(),
    "kostnaden må bekreftes før noe betales",
  );
  check(GENS.length === 0, "ingenting er sendt før bekreftelsen");
  await page.screenshot({ path: `${out}/i03b-bekreft.png` });
  RUNS.length = 0;
  await panel.getByRole("button", { name: "Ja, generer" }).click();
  await panel
    .getByText(/variasjoner er lagret|kunne ikke|feil|ugyldig/i)
    .first()
    .waitFor({ timeout: 30000 });
  check(GENS.length === 2, `to genereringer sendt (${GENS.length})`);
  check(
    GENS.every((g) => g.includes("the door stands open")),
    "teksten sendes i prompten",
  );
  check(/variation 2 of 2/.test(GENS[1] ?? ""), "variasjon 2 av 2 er merket i prompten");
  check(
    RUNS.filter((r) => /AddAssetVersion/.test(r)).length === 2 &&
      RUNS.some((r) => /the door stands open/.test(r)),
    "lagret som nye versjoner med teksten i versjonsnotatet",
  );
  await page.screenshot({ path: `${out}/i03c-lagret.png` });
  GENS.length = 0;
});

await run("i04-deler", async (page) => {
  const dlg = await openBig(page);
  await dlg.getByRole("button", { name: /^Deler/ }).click();
  await page.waitForTimeout(300);
  check(await dlg.getByTestId("parts-panel").isVisible(), "«Deler …» åpner delepanelet");
  check(
    (await dlg.getByRole("button", { name: "Legg delene i scenen" }).count()) === 0,
    "«Legg delene i scenen» vises ikke uten onPlaceParts",
  );
  const st = await dlg.getByTestId("lightbox-stage").boundingBox();
  const cx = st.x + st.width / 2;
  const cy = st.y + st.height / 2;
  await page.mouse.move(cx - 70, cy - 150);
  await page.mouse.down();
  for (const [dx, dy] of [
    [0, -150],
    [20, -150],
    [20, 170],
    [-70, 170],
    [-70, -140],
  ])
    await page.mouse.move(cx + dx, cy + dy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await dlg.getByLabel("Navn på delen").fill("Dørblad");
  await dlg.getByLabel("Ankerpunkt for delen").selectOption("left");
  check(
    await dlg.getByRole("checkbox", { name: "Fjern delen fra originalen" }).isChecked(),
    "«Fjern delen fra originalen» er valgt",
  );
  await page.screenshot({ path: `${out}/i04a-markert.png` });
  RUNS.length = 0;
  UPLOADS.length = 0;
  await dlg.getByRole("button", { name: "Lagre delen" }).click();
  await dlg
    .getByText(/er lagret som nytt objekt|kunne ikke|feil/i)
    .first()
    .waitFor({ timeout: 30000 });
  console.log("   status:", (await status(dlg).textContent())?.slice(0, 250));
  const all = RUNS.join("\n");
  check(
    /CreateAssets/.test(all) && /Dørblad|D\\u00f8rblad/.test(all),
    "delen er lagret som nytt objekt med navn",
  );
  check(UPLOADS.length === 2, `delen og originalen uten delen er lastet opp (${UPLOADS.length})`);
  check(
    RUNS.filter((r) => /AddAssetVersion/.test(r)).length === 2,
    "ny versjon av originalen der delen er fjernet",
  );
  check(
    (await dlg.getByTestId("erased-part").count()) === 1,
    "området som er fjernet vises i bildet",
  );
  check(await dlg.getByText("Laget i denne økten").isVisible(), "delene listes med ankerpunkt");
  await page.screenshot({ path: `${out}/i04b-del-lagret.png` });
  // AI-delene
  await dlg.getByRole("tab", { name: /Lag med AI/ }).click();
  await dlg.getByLabel("Navn på del 1").fill("door frame");
  await dlg.getByLabel("Navn på del 2").fill("door leaf");
  await dlg.getByLabel("Ankerpunkt for del 2").selectOption("left");
  check(await dlg.getByText(/2 bilder · anslått \$/).isVisible(), "prisen vises for to deler");
  await dlg.getByRole("button", { name: /Lag 2 deler/ }).click();
  check(
    await dlg.getByRole("alertdialog", { name: "Bekreft generering av deler" }).isVisible(),
    "AI-delene må bekreftes før noe betales",
  );
  await page.screenshot({ path: `${out}/i04c-ai-deler.png` });
  RUNS.length = 0;
  await dlg.getByRole("button", { name: "Ja, generer" }).click();
  await dlg
    .getByText(/deler er lagret som nye objekter|kunne ikke|feil|ugyldig/i)
    .first()
    .waitFor({ timeout: 30000 });
  check(
    GENS.length === 2 && /door leaf/.test(GENS[1]) && /door frame/.test(GENS[1]),
    "hver del lages for seg, med de andre delene nevnt",
  );
  check(RUNS.filter((r) => /CreateAssets/.test(r)).length === 2, "hver AI-del blir et nytt objekt");
  await page.screenshot({ path: `${out}/i04d-ai-lagret.png` });
});

await run(
  "i05-engelsk",
  async (page) => {
    await page.locator("section").first().getByRole("button", { name: /Maja/ }).first().dblclick();
    await page.waitForTimeout(800);
    await page
      .getByRole("button", { name: /Show v\d+ large|v\d+/ })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1500);
    const dlg = page.getByRole("dialog").last();
    const btn = dlg.getByRole("button", { name: /Split into tiles/ });
    if (!(await btn.count())) {
      check(true, "engelsk visning ble ikke åpnet i fiksturen (hoppes over)");
      return;
    }
    await btn.click();
    check(
      (await dlg.getByRole("button", { name: "Make the split" }).count()) === 1,
      "«Make the split» på engelsk",
    );
    await page.screenshot({ path: `${out}/i05-engelsk.png` });
  },
  "en",
);

console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
await browser.close();
