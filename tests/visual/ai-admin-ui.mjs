/**
 * Nettlesertest for DEC-0088 (Mars 15.10.2026): AI-tilkoblinger på adminsiden («Administrer AI-tilkoblinger»,
 * av/på, «Legg til ny modell», «Be om ny leverandør»), status for bakgrunnsjobben med advarsel, eldre database
 * (migrasjon 0034 mangler), engelsk, og at valglistene i appen skjuler avslåtte modeller og viser egne.
 * Mocker Supabase og serverfunksjonene; ingenting betales eller endres.
 *   ENV_FILE=…/.env node ai-admin-ui.mjs <baseUrl> <fixture.json> [utmappe]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/aiadmin",
] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE, "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const USER = {
  id: "00000000-0000-7000-8000-a11ce0000001",
  email: "oystein@gutu.no",
  aud: "authenticated",
  role: "authenticated",
};
const project = fx.project;
const REQ = "00000000-0000-4000-8000-00000000e001";

function serverFnName(url) {
  try {
    const b64 = new URL(url).pathname.split("/_serverFn/")[1];
    return JSON.parse(Buffer.from(decodeURIComponent(b64), "base64url").toString("utf8")).export;
  } catch {
    return "?";
  }
}

const SETTINGS = [
  {
    provider: "google",
    model: "*",
    enabled: false,
    custom: false,
    kind: null,
    label: "",
    priceUsd: null,
    priceUnit: "",
    note: "",
    updatedAt: null,
  },
  {
    provider: "fal",
    model: "fal-ai/flux-pro/kontext",
    enabled: false,
    custom: false,
    kind: null,
    label: "",
    priceUsd: null,
    priceUnit: "",
    note: "",
    updatedAt: null,
  },
  {
    provider: "fal",
    model: "fal-ai/bytedance/seedream/v5",
    enabled: true,
    custom: true,
    kind: "image",
    label: "Seedream 5",
    priceUsd: 0.05,
    priceUnit: "image",
    note: "Testet av Mars 15.10.",
    updatedAt: "2026-10-15T10:00:00Z",
  },
];

const CALLS = [];
async function mock(ctx, st) {
  await ctx.route(`${supaUrl}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const json = (b, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (path.startsWith("/auth/v1/user")) return json(USER);
    if (path.startsWith("/auth/v1/")) return json({});
    if (path.startsWith("/realtime/")) return route.abort();
    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.replace("/rest/v1/rpc/", "");
      if (fn === "my_account")
        return json({
          status: "active",
          is_admin: true,
          permanent_admin: true,
          locale: st.lang ?? null,
          display_name: "Øystein",
          ui_prefs: {},
          privacy_version: 2,
          accepted_version: 2,
          created_at: "2026-09-01T10:00:00Z",
        });
      if (fn === "project_lock_info") return json({ lock: null });
      return json(null);
    }
    const table = path.replace("/rest/v1/", "");
    if (table === "schema_version") return json([{ version: 34 }]);
    if (table === "privacy_policy") {
      const row = {
        version: 2,
        controller_name: "Diagonalen AS",
        published_at: "2026-10-15T10:00:00Z",
      };
      return json(single ? row : [row]);
    }
    if (table === "projects") {
      if (single) return json(project);
      return json([{ ...project, project_members: [{ role: "owner", user_id: USER.id }] }]);
    }
    if (table === "ai_provider_keys")
      return json([
        {
          id: "k1",
          provider: "fal",
          label: "",
          key_hint: "…abcd",
          status: "ok",
          status_message: null,
          last_tested_at: null,
          updated_at: "2026-10-10T10:00:00Z",
        },
      ]);
    if (fx.rows[table] && single) return json(fx.rows[table][0] ?? null);
    if (fx.rows[table]) return json(fx.rows[table]);
    return json(single ? null : []);
  });
  await ctx.route("**/_serverFn/**", (route) => {
    const name = serverFnName(route.request().url());
    CALLS.push({ name, body: route.request().postData() ?? "" });
    const json = (result) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result, context: {} }),
      });
    if (/fetchAiAdmin/.test(name))
      return json(
        st.ready === false
          ? {
              ok: true,
              ready: false,
              message:
                "Databasen må oppdateres (migrasjon 0034) før AI-tilkoblingene kan administreres.",
              settings: [],
              requests: [],
              cron: null,
            }
          : {
              ok: true,
              ready: true,
              settings: SETTINGS,
              requests: [
                {
                  id: REQ,
                  name: "Luma AI",
                  website: "https://lumalabs.ai/",
                  docsUrl: "https://docs.lumalabs.ai/",
                  note: "Ray 3 for video fra startbilde",
                  status: "open",
                  createdAt: "2026-10-14T10:00:00Z",
                  createdBy: USER.id,
                },
              ],
              cron: {
                at: new Date(Date.now() - (st.cronMinutes ?? 3) * 60_000).toISOString(),
                durationMs: 1800,
                stopped: 0,
                sent: 2,
                purged: 1,
                checked: 4,
                done: 3,
                failed: 0,
                running: 1,
                skipped: null,
                error: null,
              },
            },
      );
    if (/fetchAiModelSettings/.test(name)) return json({ ready: true, settings: SETTINGS });
    if (/fetchAdminOverview/.test(name))
      return json({
        ok: true,
        purged: 0,
        permanentEmail: "oystein@gutu.no",
        users: [
          {
            id: USER.id,
            email: "oystein@gutu.no",
            displayName: "Øystein",
            createdAt: "2026-09-01T10:00:00Z",
            lastSignInAt: "2026-10-15T09:00:00Z",
            lastActiveAt: "2026-10-15T09:10:00Z",
            status: "active",
            reason: "",
            deleteAfter: null,
            isAdmin: true,
            permanentAdmin: true,
            projects: [],
            spendUsd: 0,
            spend30Usd: 0,
            jobs: 0,
          },
        ],
        projects: [],
      });
    if (/adminSaveCustomModel/.test(name))
      return json({ ok: true, message: "«Seedream 5 Lite» er lagt til." });
    if (
      /adminSetModelEnabled|adminAddProviderRequest|adminSetProviderRequestStatus|adminRemoveCustomModel/.test(
        name,
      )
    )
      return json({ ok: true, message: "Slått av for alle brukere." });
    if (/projectAiProviders/.test(name))
      return json({ providers: ["lovable", "fal", "google"], missing: false });
    if (/fetchAiUsage/.test(name))
      return json({ ok: true, rows: [], projectNames: {}, userNames: {} });
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

async function run(name, path, act, { lang = "nb", st = {}, width = 1440 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "dark" });
  await mock(ctx, { lang, ...st });
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
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  try {
    await act(page);
  } catch (e) {
    errors.push("act: " + e.message);
    fail++;
  }
  console.log(name, errors.length ? "FEIL: " + errors.join(" | ").slice(0, 800) : "ok");
  await ctx.close();
}

await run("a01-admin-ai", "/admin", async (page) => {
  const cron = await page.getByTestId("admin-cron").innerText();
  check(
    /Bakgrunnsjobb: sist kjørt kl\. \d\d[:.]\d\d \(for 3 minutter siden\)/.test(cron),
    `status for bakgrunnsjobben vises («${cron.split("\n")[0]}»)`,
  );
  check(
    cron.includes("2 sendt · 3 videoer hentet · 1 kontoer slettet"),
    "antall sendt, videoer hentet og kontoer slettet vises",
  );
  check(
    !(await page
      .getByTestId("admin-cron-warning")
      .isVisible()
      .catch(() => false)),
    "ingen advarsel når jobben kjørte for 3 minutter siden",
  );
  const toggle = page.getByRole("button", { name: "Administrer AI-tilkoblinger" });
  check(await toggle.isVisible(), "knappen «Administrer AI-tilkoblinger» finnes");
  await page.screenshot({ path: `${out}/a01a-admin-lukket.png`, fullPage: true });
  await toggle.click();
  await page.waitForTimeout(500);
  const sec = page.getByTestId("admin-ai");
  const text = await sec.innerText();
  for (const t of [
    "Innebygd AI",
    "OpenAI",
    "Google Gemini",
    "fal.ai",
    "Runway",
    "ElevenLabs",
    "Seedream 5",
    "Lagt til av administrator",
    "0,05 USD per bilde",
    "USD per sekund",
    "Leverandøren er av",
    "Legg til ny modell",
    "Be om ny leverandør",
    "Luma AI",
  ])
    check(text.includes(t), `AI-tilkoblingene viser «${t}»`);
  check(
    (await page.getByTestId("admin-ai-provider").count()) === 8,
    "alle åtte leverandørene fra katalogen vises",
  );
  const flux = page.locator('[data-testid="admin-ai-model"][data-model="fal-ai/flux-pro/kontext"]');
  check(
    (await flux.getByRole("switch").getAttribute("aria-checked")) === "false",
    "FLUX Kontext står som slått av",
  );
  await page.screenshot({ path: `${out}/a01b-ai-tilkoblinger.png`, fullPage: true });
  // Slå en modell av
  const sora = page.locator('[data-testid="admin-ai-model"][data-model="sora-2"]');
  await sora.getByRole("switch").click();
  await page.waitForTimeout(600);
  const off = CALLS.find((c) => /adminSetModelEnabled/.test(c.name));
  check(
    // seroval skriver false som {"t":2,"s":3}
    !!off && off.body.includes("sora-2") && /"enabled"\][^]*\{"t":2,"s":3\}/.test(off.body),
    "av/på sendes til serveren (sora-2 av)",
  );
  check(
    (await page.getByTestId("admin-ai-message").innerText()).includes("Slått av for alle brukere"),
    "svaret fra serveren vises i seksjonen",
  );
  // Legg til ny modell: ugyldig ID stoppes i skjemaet
  await page.getByTestId("admin-ai-add").click();
  await page.getByTestId("admin-ai-add-model").fill("fal-ai/noe-helt-nytt");
  await page.getByTestId("admin-ai-add-label").fill("Noe nytt");
  await page.getByTestId("admin-ai-add-price").fill("0,03");
  const before = CALLS.filter((c) => /adminSaveCustomModel/.test(c.name)).length;
  await page.getByTestId("admin-ai-add-save").click();
  await page.waitForTimeout(400);
  const err = await page.getByTestId("admin-ai-add-error").innerText();
  check(
    /passer ikke/.test(err) && /seedream/.test(err),
    `ugyldig modell-ID forklares («${err.slice(0, 80)}…»)`,
  );
  check(
    CALLS.filter((c) => /adminSaveCustomModel/.test(c.name)).length === before,
    "ugyldig modell sendes ikke til serveren",
  );
  await page.getByTestId("admin-ai-add-form").screenshot({ path: `${out}/a01c-legg-til-feil.png` });
  await page.getByTestId("admin-ai-add-model").fill("fal-ai/bytedance/seedream/v5-lite");
  await page.getByTestId("admin-ai-add-label").fill("Seedream 5 Lite");
  await page.getByTestId("admin-ai-add-save").click();
  await page.waitForTimeout(600);
  const save = CALLS.find((c) => /adminSaveCustomModel/.test(c.name));
  check(
    !!save &&
      save.body.includes("fal-ai/bytedance/seedream/v5-lite") &&
      save.body.includes("0.03") &&
      save.body.includes('"image"'),
    "gyldig modell sendes med leverandør, type, pris (0,03 → 0.03) og enhet",
  );
  // Be om ny leverandør
  await page.getByTestId("admin-ai-request-name").fill("Midjourney");
  await page.getByTestId("admin-ai-request-website").fill("https://www.midjourney.com");
  await page.getByTestId("admin-ai-request-note").fill("Stilbilder");
  await page.getByTestId("admin-ai-request-send").click();
  await page.waitForTimeout(600);
  check(
    CALLS.some((c) => /adminAddProviderRequest/.test(c.name) && c.body.includes("Midjourney")),
    "ønsket om ny leverandør sendes",
  );
  await page.getByTestId("admin-ai-request-status").first().selectOption("done");
  await page.waitForTimeout(600);
  check(
    CALLS.some(
      (c) =>
        /adminSetProviderRequestStatus/.test(c.name) &&
        c.body.includes("done") &&
        c.body.includes(REQ),
    ),
    "administrator kan endre status på ønsket",
  );
  await page.getByTestId("admin-ai-requests").screenshot({ path: `${out}/a01d-onsker.png` });
});

await run(
  "a02-bakgrunnsjobb-stoppet",
  "/admin",
  async (page) => {
    const w = page.getByTestId("admin-cron-warning");
    check(await w.isVisible(), "advarsel når jobben ikke har kjørt de siste 10 minuttene");
    check(
      (await w.innerText()).includes("Sjekk at appen er publisert og at bakgrunnsjobben er satt opp på serveren"),
      "advarselen sier hva som må sjekkes",
    );
    await page.screenshot({ path: `${out}/a02-advarsel.png` });
  },
  { st: { cronMinutes: 25 } },
);

await run(
  "a03-eldre-database",
  "/admin",
  async (page) => {
    await page.getByRole("button", { name: "Administrer AI-tilkoblinger" }).click();
    await page.waitForTimeout(400);
    check(
      (await page.getByTestId("admin-ai-missing").innerText()).includes("migrasjon 0034"),
      "uten migrasjon 0034: «Databasen må oppdateres (migrasjon 0034)»",
    );
    check(
      (await page.getByTestId("admin-cron").innerText()).includes("migrasjon 0034"),
      "statuslinjen for jobben sier det samme",
    );
    check(
      (await page.getByTestId("admin-page").innerText()).includes("Øystein"),
      "resten av adminsiden virker som før",
    );
    await page.getByTestId("admin-ai").screenshot({ path: `${out}/a03-eldre-database.png` });
  },
  { st: { ready: false } },
);

await run(
  "a04-engelsk",
  "/admin",
  async (page) => {
    await page.getByRole("button", { name: "Manage AI connections" }).click();
    await page.waitForTimeout(400);
    const t = await page.getByTestId("admin-ai").innerText();
    for (const s of [
      "AI connections",
      "Added by administrator",
      "Add a new model",
      "Request a new provider",
      "The provider is off",
      "USD per image",
    ])
      check(t.includes(s), `engelsk: «${s}»`);
    check(
      (await page.getByTestId("admin-cron").innerText()).includes("Background job: last run at"),
      "engelsk: statuslinjen for jobben",
    );
    await page.screenshot({ path: `${out}/a04-engelsk.png`, fullPage: true });
  },
  { lang: "en" },
);

await run("a05-valglister", "/", async (page) => {
  await page.getByRole("button", { name: "AI-leverandører …" }).click();
  await page.waitForTimeout(1200);
  const dlg = page.getByRole("dialog");
  const t = await dlg.innerText();
  check(
    t.includes("Slått av av administrator"),
    "avslått leverandør (Google) er merket i leverandørlisten",
  );
  await dlg.screenshot({ path: `${out}/a05a-leverandorer.png` });
  await dlg.getByRole("button", { name: /fal\.ai/ }).click();
  await page.waitForTimeout(600);
  const d = await dlg.innerText();
  check(
    d.includes("Seedream 5 (lagt til av administrator)"),
    "modellen lagt til av administrator vises med merket",
  );
  check(!d.includes("FLUX Kontext Pro"), "avslått modell (FLUX Kontext) vises ikke");
  check(d.includes("Seedream 4.5"), "andre modeller vises som før");
  check(
    CALLS.filter((c) => /fetchAiModelSettings/.test(c.name)).length === 1,
    "innstillingene hentes én gang for siden",
  );
  await dlg.screenshot({ path: `${out}/a05b-fal.png` });
  await dlg.getByRole("button", { name: /Alle leverandører/ }).click();
  await dlg.getByRole("button", { name: /Google Gemini/ }).click();
  await page.waitForTimeout(400);
  check(
    (await dlg.innerText()).includes("Administrator har slått av denne leverandøren"),
    "leverandøren som er slått av, forklares",
  );
});

await run(
  "a06-smal-skjerm",
  "/admin",
  async (page) => {
    await page.getByRole("button", { name: "Administrer AI-tilkoblinger" }).click();
    await page.waitForTimeout(400);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(over <= 1, `ingen vannrett rulling på smal skjerm (${over} px)`);
    await page.screenshot({ path: `${out}/a06-smal.png`, fullPage: true });
  },
  { width: 900 },
);

console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
await browser.close();
process.exit(fail ? 1 : 0);
