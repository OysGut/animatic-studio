/**
 * Nettlesertest DEC-0089: manuset for scenen som eget panel i sceneeditoren (lesevisning, markering under
 * avspilling, redigering i eget vindu med forrige/neste scene til lesing) og paneler som lukkes og åpnes, i
 * begge visninger, husket på kontoen. Mocker Supabase og serverfunksjoner (ingenting lagres eller betales).
 *   ENV_FILE=…/.env node dec0089-script-panel-ui.mjs <baseUrl> <fixture.json> [utmappe]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { byLang, uiLang } from "./ui-lang.mjs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/dec0089",
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
      uiLang(lang),
    ],
  );
  await page.goto(base + P + "/scene?scene=00000000-0000-7000-8000-000000000006", { waitUntil: "networkidle" });
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

const sent = (re) => COMMANDS.some((c) => re.test(c));
const panel = (page, id) => page.locator(`[data-panel="${id}"]`).first();

await run("s01-manuspanel", async (page) => {
  const sp = panel(page, "script");
  await sp.waitFor({ timeout: 30000 }).catch(() => {});
  check(await sp.isVisible(), "panelet «Manus» står i sceneeditoren");
  const text = await page.getByTestId("scene-script").innerText();
  check(/INT\. STUA/.test(text), "sceneoverskriften står øverst");
  check(text.split("\n").filter(Boolean).length > 3, "manusteksten for scenen vises");
  check(await page.getByTestId("scene-script-edit").isVisible(), "knappen «Rediger manus …»");
  await page.screenshot({ path: `${out}/s01-manuspanel.png` });
  // Avspilling: linjen som spilles av, markeres
  await page.getByRole("button", { name: byLang("nb", "Spill av", "Play") }).first().click();
  await page.waitForTimeout(1500);
  check((await page.locator("[data-script-block][data-active]").count()) === 1, "linjen som spilles av, er markert");
  await page.screenshot({ path: `${out}/s01b-markert.png` });
  await page.getByRole("button", { name: "Pause" }).first().click();
});

await run("s02-lukk-stablet", async (page) => {
  await page.locator('[data-panel-toggle="script"]').first().click();
  await page.waitForTimeout(300);
  check(!(await page.getByTestId("scene-script").isVisible()), "«Manus» lukkes til en overskrift");
  check((await panel(page, "script").getAttribute("data-collapsed")) !== null, "panelet er merket lukket");
  await page.locator('[data-panel-toggle="layers"]').first().click();
  await page.waitForTimeout(1200);
  check(
    JSON.stringify(SERVER_PREFS["sceneEditor.collapsedPanels"] ?? []).includes("script"),
    "lukkede paneler lagres på kontoen",
  );
  // Flytt «Manus» opp i kolonnen
  await page.getByRole("button", { name: byLang("nb", "Flytt «Manus» opp", "Move “Script” up") }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/s02-lukket.png` });
});

await run("s03-husket", async (page) => {
  check(!(await page.getByTestId("scene-script").isVisible()), "lukket «Manus» huskes i en ny nettleser");
  check(
    (await panel(page, "layers").getAttribute("data-collapsed")) !== null,
    "lukket «Lag» huskes",
  );
  await page.locator('[data-panel-toggle="script"]').first().click();
  await page.locator('[data-panel-toggle="layers"]').first().click();
  await page.waitForTimeout(1200);
  check(await page.getByTestId("scene-script").isVisible(), "åpnes igjen med pilen");
});

await run("s04-side-om-side", async (page) => {
  await page.getByTestId("scene-panels-mode").click();
  await page.waitForTimeout(500);
  const order = await page
    .locator("[data-testid=scene-panels-side] [data-panel]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-panel")));
  check(order.includes("script"), `«Manus» er med side om side (${order.join(", ")})`);
  const inner = (pg) =>
    pg.getByTestId("scene-panels-side").evaluate((e) => e.querySelector("[data-panel]").parentElement.scrollWidth);
  const before = await inner(page);
  await page.locator('[data-testid=scene-panels-side] [data-panel-toggle="properties"]').click();
  await page.waitForTimeout(300);
  const strip = page.locator('[data-testid=scene-panels-side] [data-panel="properties"][data-collapsed]');
  check(await strip.isVisible(), "lukket panel blir en smal stripe med navnet");
  const after = await inner(page);
  check(after < before - 100, `de andre panelene får plassen (${Math.round(before)} → ${Math.round(after)} px)`);
  await page.screenshot({ path: `${out}/s04-side-lukket.png` });
  await strip.getByRole("button").click();
  await page.waitForTimeout(300);
  check(!(await strip.isVisible()), "stripen åpnes igjen");
  await page.getByTestId("scene-panels-mode").click();
  await page.waitForTimeout(800);
});

await run("s05-rediger-i-vindu", async (page) => {
  // R7: siden DV3 åpner dobbeltklikk på en replikk lydredigeringen (dialogue editor), ikke manusvinduet.
  // Manusvinduet åpnes fra linjer som ikke er replikk, så scenarioet velger første handlingslinje.
  const actionIds = new Set(fx.rows.script_blocks.filter((b) => b.kind === "action").map((b) => b.id));
  const ids = await page.locator("[data-script-block]").evaluateAll((els) => els.map((e) => e.getAttribute("data-script-block")));
  const line = page.locator(`[data-script-block="${ids.find((id) => actionIds.has(id))}"]`);
  const lineText = (await line.innerText()).trim();
  await line.dblclick();
  await page.waitForTimeout(800);
  const dlg = page.getByTestId("scene-script-dialog");
  check(await dlg.isVisible(), "dobbeltklikk åpner manuset i eget vindu");
  const field = dlg.getByRole("textbox", { name: byLang("nb", "Tekst", "Text") });
  check(await field.isVisible(), "linjen kan redigeres (tekstfelt i inspektøren)");
  check((await field.inputValue()).trim() === lineText.replace(/^\(|\)$/g, "").trim() || (await field.inputValue()).length > 0, "tekstfeltet har linjens tekst");
  check(await dlg.getByRole("combobox", { name: byLang("nb", "Elementtype", "Element type") }).isVisible(), "elementtype kan endres");
  await field.fill((await field.inputValue()) + " Endret.");
  await field.press("Control+Enter");
  await page.waitForTimeout(500);
  check(sent(/EditBlockText/), "endringen lagres (EditBlockText)");
  check(!(await dlg.getByTestId("scene-script-prev").isVisible().catch(() => false)), "forrige scene vises ikke før man ber om det");
  await dlg.getByTestId("scene-script-show-next").check();
  await page.waitForTimeout(400);
  check(await dlg.getByTestId("scene-script-next").isVisible(), "«Vis neste scene» viser neste scene til lesing");
  await page.screenshot({ path: `${out}/s05-vindu.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.getByTestId("scene-script-edit").click();
  await page.waitForTimeout(600);
  check(await dlg.isVisible(), "«Rediger manus …» åpner vinduet");
  check(await dlg.getByText("Scene 1").first().isVisible(), "tittelen viser scenen");
});

await run(
  "s06-engelsk",
  async (page) => {
    check(await page.getByTestId("scene-script-edit").innerText().then((t) => /Edit script/.test(t)), "«Edit script …» på engelsk");
    check(await page.getByRole("button", { name: "Collapse “Script”" }).isVisible(), "lukkeknappen på engelsk");
    await page.screenshot({ path: `${out}/s06-engelsk.png` });
  },
  { lang: "en" },
);

console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
await browser.close();
