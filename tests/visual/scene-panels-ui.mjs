/**
 * Nettlesertest: panelene i sceneeditoren side om side og grupper som lukkes og åpnes i laglisten
 * (Mars 15.10.2026). Mocker Supabase og serverfunksjoner (ingenting lagres eller betales); kontoens
 * visningsvalg (my_account / set_my_ui_prefs) holdes i minnet i testen, så «huskes på brukeren» prøves
 * med en ny nettleser uten lokalt lager.
 *   ENV_FILE=…/.env node scene-panels-ui.mjs <baseUrl> <fixture.json> [utmappe]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/panels",
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

// En gruppe til («Rekvisitter» med vasen), så Alt-klikk har flere grupper å lukke
const layers0 = fx.rows.composition_layers;
const familien = layers0.find((l) => l.kind === "group");
const G2 = "00000000-0000-7000-8000-0000000000c2";
const layers = [
  ...layers0.map((l) => (l.name === "vase" ? { ...l, group_id: G2 } : l)),
  { ...familien, id: G2, name: "Rekvisitter", order_key: "yz", anchor: { x: 600, y: 600 } },
];
const rows = { ...fx.rows, composition_layers: layers };
const compId = fx.rows.compositions[0].id;

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
    if (table === "schema_version") return json([{ version: 34 }]);
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

/** Ny nettleser (tomt lokalt lager) som åpner sceneeditoren. */
async function run(name, act, { lang = "nb", width = 1600 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "dark" });
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
  await page.goto(base + P + "/scene", { waitUntil: "networkidle" });
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

const panelOrder = (page) =>
  page
    .locator("[data-testid=scene-panels-side] [data-panel]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-panel")));
const layersPanel = (page) => page.getByRole("region", { name: /^Lag$|^Layers$/ }).first();
const layerRow = (page, name) =>
  page.locator("li[data-layer-row]").filter({ has: page.getByText(name, { exact: true }) });

await run("p01-side-om-side", async (page) => {
  const btn = page.getByTestId("scene-panels-mode");
  check(await btn.isVisible(), "knappen for panelvisning står øverst i panelområdet til høyre");
  check(
    (await btn.getAttribute("title")) === "Vis panelene side om side for bedre oversikt",
    "verktøytipset forklarer knappen",
  );
  check(
    await page.getByRole("region", { name: "I denne scenen" }).isVisible(),
    "stablet: «I denne scenen» står til venstre som før",
  );
  await page.screenshot({ path: `${out}/p01a-stablet.png` });
  await btn.click();
  await page.waitForTimeout(600);
  const side = page.getByTestId("scene-panels-side");
  check(await side.isVisible(), "side om side: panelene står i kolonner");
  const order = await panelOrder(page);
  check(
    order.join(",") === "assets,nearbyAudio,layers,properties" ||
      order.join(",") === "assets,layers,properties",
    `standardrekkefølge: ${order.join(", ")}`,
  );
  const boxes = await page
    .locator("[data-testid=scene-panels-side] [data-panel]")
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
  check(
    boxes.every((x, i) => i === 0 || x > boxes[i - 1]),
    "kolonnene ligger ved siden av hverandre",
  );
  const mainW = await page.locator("main").evaluate((m) => m.getBoundingClientRect().width);
  check(mainW >= 470, `lerretet beholder en brukbar bredde (${Math.round(mainW)} px)`);
  check(
    (await btn.getAttribute("aria-pressed")) === "true" &&
      (await btn.getAttribute("title")) === "Vis panelene over hverandre",
    "knappen bytter tilbake til stablet",
  );
  await page.screenshot({ path: `${out}/p01b-side-om-side.png` });

  // ‹ ›: «Lag» to steg til venstre
  const layersHeading = page.locator("[data-panel-heading=layers]");
  await layersHeading.getByRole("button", { name: "Flytt «Lag» til venstre" }).click();
  await page.waitForTimeout(200);
  let o2 = await panelOrder(page);
  while (o2[0] !== "layers") {
    await layersHeading.getByRole("button", { name: "Flytt «Lag» til venstre" }).click();
    await page.waitForTimeout(200);
    o2 = await panelOrder(page);
    if (o2.indexOf("layers") < 0) break;
  }
  check(o2[0] === "layers", `‹ flytter panelet til venstre (${o2.join(", ")})`);
  check(
    await layersHeading.getByRole("button", { name: "Flytt «Lag» til venstre" }).isDisabled(),
    "‹ er av for panelet lengst til venstre",
  );
  // Dra overskriften «Lyd i scenene rundt» foran «Lag» (venstre halvdel av kolonnen)
  const heading = page.locator("[data-panel-heading=nearbyAudio]");
  const target = page.locator("[data-panel=layers]");
  const hb = await heading.boundingBox();
  const tb = await target.boundingBox();
  await page.mouse.move(hb.x + 60, hb.y + hb.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++)
    await page.mouse.move(
      hb.x + 60 + ((tb.x + 20 - hb.x - 60) * k) / 8,
      hb.y + hb.height / 2 + (200 * k) / 8,
    );
  await page.mouse.up();
  await page.waitForTimeout(400);
  const o3 = await panelOrder(page);
  check(
    o3[0] === "nearbyAudio" && o3[1] === "layers",
    `dra og slipp av overskriften (${o3.join(", ")})`,
  );
  await page.screenshot({ path: `${out}/p01c-ny-rekkefolge.png` });
  // Eksisterende funksjon: et lag kan velges og egenskapene vises
  await layerRow(page, "Maja").getByRole("button", { name: /Maja/ }).first().click();
  await page.waitForTimeout(300);
  check(
    await page.locator("[data-panel=properties]").getByText("Plassering").first().isVisible(),
    "side om side: valgt lag viser egenskapene i sin kolonne",
  );
  await page.waitForTimeout(1500);
  const saved = SERVER_PREFS["sceneEditor.panels"];
  check(
    saved?.mode === "side" && saved?.order?.[0] === "nearbyAudio",
    `valget er lagret på kontoen (${JSON.stringify(saved)})`,
  );
});

await run("p02-husket-ny-nettleser", async (page) => {
  const side = page.getByTestId("scene-panels-side");
  check(await side.isVisible(), "ny nettleser uten lokalt lager: side om side huskes fra kontoen");
  const o = await panelOrder(page);
  check(o[0] === "nearbyAudio" && o[1] === "layers", `rekkefølgen huskes (${o.join(", ")})`);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const o2 = await panelOrder(page);
  check(o2[0] === "nearbyAudio", "også etter ny innlasting");
  await page.screenshot({ path: `${out}/p02-husket.png` });
});

await run(
  "p03-smal-skjerm",
  async (page) => {
    const mainW = await page.locator("main").evaluate((m) => m.getBoundingClientRect().width);
    check(
      mainW >= 470,
      `smal skjerm: lerretet er fortsatt minst ca. 480 px (${Math.round(mainW)})`,
    );
    const scroll = await page
      .locator("[data-testid=scene-panels-side] > div.overflow-x-auto")
      .evaluate((d) => d.scrollWidth > d.clientWidth);
    check(scroll, "for mange paneler: panelområdet ruller sidelengs");
    await page.screenshot({ path: `${out}/p03-smal.png` });
    // Tilbake til stablet for de neste testene
    await page.getByTestId("scene-panels-mode").click();
    await page.waitForTimeout(1500);
    check(SERVER_PREFS["sceneEditor.panels"]?.mode === "stacked", "stablet lagres også");
  },
  { width: 1200 },
);

await run("p04-grupper", async (page) => {
  check(
    await page.getByRole("complementary", { name: "Lag og egenskaper" }).isVisible(),
    "stablet igjen: lag og egenskaper til høyre",
  );
  const lp = layersPanel(page);
  const toggleFam = lp.getByRole("button", { name: "Lukk gruppen «Familien»" });
  check(await toggleFam.isVisible(), "pil foran gruppenavnet");
  check(await layerRow(page, "Bestemor Anne").isVisible(), "åpen gruppe viser lagene");
  const indent = await layerRow(page, "Bestemor Anne").evaluate((li) => li.style.paddingLeft);
  check(indent === "20px", `lagene i gruppen er rykket inn (${indent})`);
  await page.screenshot({ path: `${out}/p04a-apen.png` });
  // Velg laget i gruppen og lukk gruppen: gruppen blir valgt
  await layerRow(page, "Bestemor Anne")
    .getByRole("button", { name: /Bestemor Anne/ })
    .first()
    .click();
  await page.waitForTimeout(200);
  await toggleFam.click();
  await page.waitForTimeout(300);
  check(!(await layerRow(page, "Bestemor Anne").isVisible()), "lukket gruppe skjuler lagene");
  const famRow = layerRow(page, "Familien");
  check(
    await famRow.getByText(/· 1 lag/).isVisible(),
    "lukket gruppe viser én linje med antall lag",
  );
  check(
    (await famRow.locator("button[aria-pressed]").getAttribute("aria-pressed")) === "true",
    "valgt lag i gruppen som lukkes: gruppen blir valgt",
  );
  await page.screenshot({ path: `${out}/p04b-lukket.png` });
  // Velg laget i tidslinjen (som på lerretet): gruppen åpnes av seg selv
  await page
    .locator('main span[title="Bestemor Anne"]')
    .locator("xpath=../..")
    .locator("> div.relative")
    .click({ position: { x: 30, y: 8 } });
  await page.waitForTimeout(400);
  check(
    await layerRow(page, "Bestemor Anne").isVisible(),
    "et lag som velges et annet sted, åpner gruppen det ligger i",
  );
  // Alt-klikk lukker alle
  await lp.getByRole("button", { name: "Lukk gruppen «Familien»" }).click({ modifiers: ["Alt"] });
  await page.waitForTimeout(300);
  const expanded = await lp
    .getByTestId("layer-group-toggle")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-expanded")));
  check(
    expanded.length === 2 && expanded.every((x) => x === "false"),
    `Alt-klikk lukker alle grupper (${expanded.join(",")})`,
  );
  check(!(await layerRow(page, "vase").isVisible()), "også «Rekvisitter» er lukket");
  await page.screenshot({ path: `${out}/p04c-alle-lukket.png` });
  await lp
    .getByRole("button", { name: "Åpne gruppen «Rekvisitter»" })
    .click({ modifiers: ["Alt"] });
  await page.waitForTimeout(300);
  const expanded2 = await lp
    .getByTestId("layer-group-toggle")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-expanded")));
  check(
    expanded2.every((x) => x === "true"),
    "Alt-klikk på en lukket gruppe åpner alle",
  );
  // Lukk én og sjekk at det huskes på kontoen per scene
  await lp.getByRole("button", { name: "Lukk gruppen «Rekvisitter»" }).click();
  await page.waitForTimeout(1500);
  const saved = SERVER_PREFS["sceneEditor.collapsedGroups"];
  check(
    JSON.stringify(saved?.[compId]) === JSON.stringify([G2]),
    `lukkede grupper lagres per scene (${JSON.stringify(saved)})`,
  );
  // Eksisterende funksjoner: flytt lag fram og dra et lag inn i en gruppe
  const before = COMMANDS.length;
  await layerRow(page, "Maja").hover();
  await layerRow(page, "Maja").getByRole("button", { name: "Flytt lag fram" }).click();
  await page.waitForTimeout(400);
  check(COMMANDS.length > before && /MoveLayer/.test(COMMANDS.at(-1)), "«Flytt lag fram» virker");
  const n2 = COMMANDS.length;
  await layerRow(page, "Himmel").dragTo(layerRow(page, "Familien"));
  await page.waitForTimeout(500);
  check(COMMANDS.length > n2, "dra og slipp av lag i listen virker fortsatt");
  // Synlighet
  const n3 = COMMANDS.length;
  await layerRow(page, "Maja").getByRole("button", { name: "Skjul lag" }).click();
  await page.waitForTimeout(400);
  check(COMMANDS.length > n3 && /UpdateLayers/.test(COMMANDS.at(-1)), "«Skjul lag» virker");
});

await run("p05-husket-gruppe", async (page) => {
  const lp = layersPanel(page);
  check(
    await lp.getByRole("button", { name: "Åpne gruppen «Rekvisitter»" }).isVisible(),
    "lukket gruppe huskes i en ny nettleser (kontoen)",
  );
  check(!(await layerRow(page, "vase").isVisible()), "lagene i den er fortsatt skjult");
  await page.screenshot({ path: `${out}/p05-husket-gruppe.png` });
});

await run(
  "p06-engelsk",
  async (page) => {
    const btn = page.getByTestId("scene-panels-mode");
    check(
      (await btn.getAttribute("aria-label")) ===
        "Show the panels side by side for a better overview",
      "knappen er på engelsk",
    );
    const lp = layersPanel(page);
    check(
      await lp.getByRole("button", { name: "Expand the group “Rekvisitter”" }).isVisible(),
      "pilen er på engelsk",
    );
    await btn.click();
    await page.waitForTimeout(500);
    check(
      await page.getByRole("button", { name: "Move “Layers” left" }).isVisible(),
      "‹ › er på engelsk",
    );
    await page.screenshot({ path: `${out}/p06-engelsk.png` });
  },
  { lang: "en" },
);

console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
await browser.close();
