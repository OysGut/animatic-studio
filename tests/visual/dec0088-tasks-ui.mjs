/**
 * Nettlesertest DEC-0088: «Legg til element i scenen …», elementer som skal inn i andre scener (varmgul ramme
 * og melding), oppgaven i toppstripen med forrige/neste, systemmerknaden i manuset med «Ferdig» og TODO-boksen
 * på prosjektsiden. Mocker Supabase og serverfunksjoner (ingenting lagres eller betales).
 *   ENV_FILE=…/.env node dec0088-tasks-ui.mjs <baseUrl> <fixture.json> [utmappe]
 */
import { chromium } from "playwright";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { readFileSync, mkdirSync } from "node:fs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/dec0088",
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

// Bestemor Anne skal inn i scene 2 og 3 (lagt til fra scene 1); systemmerknad i scene 2; notat fra Mars selv
const TASK = "00000000-0000-7000-8000-00000000f001";
const OCC1 = "00000000-0000-7000-8000-000000000006";
const OCC2 = "00000000-0000-7000-8000-000000000011";
const OCC3 = "00000000-0000-7000-8000-00000000001c";
const AT = "2026-10-15T10:00:00.000Z";
const rows = {
  ...fx.rows,
  assets: fx.rows.assets.map((a) =>
    a.name === "Bestemor Anne"
      ? {
          ...a,
          scene_plans: [OCC2, OCC3].map((occurrenceId) => ({
            occurrenceId,
            taskId: TASK,
            fromOccurrenceId: OCC1,
            at: AT,
          })),
        }
      : a,
  ),
  script_annotations: [
    ...fx.rows.script_annotations,
    {
      ...fx.rows.script_annotations[0],
      id: "00000000-0000-7000-8000-00000000f002",
      variant_id: "00000000-0000-7000-8000-000000000010",
      block_id: null,
      range_start: 0,
      range_end: 0,
      quote: "",
      text: "«Bestemor Anne» skal inn i scenen (lagt til fra scene 1). Skriv det inn i manuset, og lagre merknaden som ferdig.",
      author_name: "Mars",
      stamp_at: AT,
      source: "system",
      task_id: TASK,
    },
    {
      ...fx.rows.script_annotations[0],
      id: "00000000-0000-7000-8000-00000000f003",
      text: "Mitt eget notat",
      author_name: "Mars",
    },
  ],
};
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
async function run(name, act, { lang = "nb", width = 1600, path = "/scene?scene=" + OCC2 } = {}) {
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
  await page.goto(base + P + path, { waitUntil: "networkidle" });
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

await run("t01-ventende-element-og-oppgave", async (page) => {
  const tile = page.locator("[data-planned]").first();
  check(await tile.isVisible(), "Bestemor Anne står i «I denne scenen» selv om hun ikke er i manuset her");
  check(
    /ring-accent-warm|border-accent-warm/.test((await tile.getAttribute("class")) ?? ""),
    "flisen har varmgul ramme",
  );
  check(await page.getByText("Skal inn", { exact: true }).first().isVisible(), "merket «Skal inn» vises");
  check(
    await page.getByText("Skal inn fordi det ble lagt til i scene 1").first().isVisible(),
    "meldingen sier hvorfor (scene 1)",
  );
  const nav = page.getByTestId("task-nav");
  check(await nav.isVisible(), "oppgaven står i toppstripen");
  check(/Bestemor Anne: 2 av 2/.test(await nav.innerText()), "toppstripen viser «Bestemor Anne: 2 av 2»");
  await page.screenshot({ path: `${out}/t01-ventende.png` });
  await page.getByTestId("task-nav-open").click();
  await page.waitForTimeout(300);
  const list = page.getByTestId("task-nav-list");
  check(await list.isVisible(), "oppgavelisten åpnes");
  check(/2 gjenstår/.test(await list.innerText()), "listen viser hvor mange scener som gjenstår");
  await page.screenshot({ path: `${out}/t01b-oppgaveliste.png` });
  await page.keyboard.press("Escape");
  await page.getByTestId("task-next").click();
  await page.waitForTimeout(800);
  check(
    await page.getByText("Skal inn fordi det ble lagt til i scene 1").first().isVisible(),
    "«Neste» går til neste scene som skal oppdateres (scene 3), der elementet også venter",
  );
  // Fjern planen for denne scenen
  const n = COMMANDS.length;
  await page.getByRole("button", { name: /Skal ikke inn i denne scenen/ }).first().click();
  await page.waitForTimeout(400);
  check(COMMANDS.length > n && sent(/RemoveScenePlans/), "X fjerner planen for scenen");
});

await run("t02-legg-til-element", async (page) => {
  await page.getByTestId("add-element-open").click();
  await page.waitForTimeout(400);
  const dlg = page.getByTestId("add-element");
  check(await dlg.isVisible(), "dialogen «Legg til element i scenen» åpnes");
  await page.screenshot({ path: `${out}/t02a-velg.png` });
  await page.getByTestId("add-element-asset").filter({ hasText: "vase" }).first().click();
  await page.waitForTimeout(400);
  const choices = page.getByTestId("add-element-choices");
  check(await choices.isVisible(), "så spør systemet om andre scener");
  check(/Alle scener med Maja/.test(await choices.innerText()), "hurtigvalg «Alle scener med Maja»");
  await choices.getByText("Alle scener med Maja").click();
  check(await page.getByTestId("add-element-note").isVisible(), "valg om merknad i manuset");
  await page.screenshot({ path: `${out}/t02b-andre-scener.png` });
  await page.getByTestId("add-element-plan").click();
  await page.waitForTimeout(600);
  check(sent(/PlanAssetInScenes/), "planen sendes (PlanAssetInScenes)");
  check(sent(/AddAnnotations[\s\S]*system/), "systemmerknader sendes til manuset");
});

await run(
  "t03-systemmerknad-i-manus",
  async (page) => {
    const sys = page.getByTestId("system-note").first();
    check(await sys.isVisible(), "systemmerknaden vises i manuset");
    check((await sys.innerText()).trim() === "Systemmerknad", "merket «Systemmerknad»");
    await page.screenshot({ path: `${out}/t03-systemmerknad.png` });
    const n = COMMANDS.length;
    await page.getByTestId("system-note-done").first().click();
    await page.waitForTimeout(400);
    check(COMMANDS.length > n && sent(/SetAnnotationRemoved/), "«Ferdig» lagrer merknaden som ferdig");
  },
  { path: "/manus?scene=" + OCC2 },
);

await run(
  "t04-todo-boks",
  async (page) => {
    const box = page.getByTestId("project-todo");
    check(await box.isVisible(), "TODO-boksen står på prosjektsiden");
    const text = await box.innerText();
    check(/«Bestemor Anne» skal inn i 2 scener – 2 gjenstår/.test(text), "oppgaven står i boksen");
    check(/Vasen må være den blå/.test(text), "notatet fra Anita står i boksen");
    check(!/Mitt eget notat/.test(text), "mine egne notater er ikke med");
    check(!/Lagre merknaden som ferdig/i.test(text), "systemmerknaden står ikke som notat fra andre");
    await box.screenshot({ path: `${out}/t04-todo.png` });
  },
  { path: "" },
);

await run(
  "t05-engelsk",
  async (page) => {
    check(await page.getByText("To add", { exact: true }).first().isVisible(), "«To add» på engelsk");
    check(
      /Bestemor Anne: 2 of 2/.test(await page.getByTestId("task-nav").innerText()),
      "toppstripen på engelsk",
    );
    await page.screenshot({ path: `${out}/t05-engelsk.png` });
  },
  { lang: "en" },
);

console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
await browser.close();
