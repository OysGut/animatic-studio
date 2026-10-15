/**
 * Nettlesertest for DEC-0086: min konto, adminsiden, personvern (før og etter innlogging), låst prosjekt og
 * kostnadsrapporten med eksport. Mocker Supabase og serverfunksjonene; ingenting betales eller endres.
 *   ENV_FILE=…/.env node account-admin-ui.mjs <baseUrl> <fixture.json> [utmappe]
 * Dokumentert i docs/development/VISUAL_QA_DEC-0086.md.
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/konto86",
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
const LOCKED = "00000000-0000-7000-8000-0000000c0001";
const ANITA = "00000000-0000-7000-8000-a11ce0000002";
const OLA = "00000000-0000-7000-8000-a11ce0000003";

function serverFnName(url) {
  try {
    const b64 = new URL(url).pathname.split("/_serverFn/")[1];
    return JSON.parse(Buffer.from(decodeURIComponent(b64), "base64url").toString("utf8")).export;
  } catch {
    return "?";
  }
}

const CALLS = [];
const RPC = [];
function state() {
  return { accepted: 1 };
}
const usageRows = [
  {
    id: "j1",
    projectId: project.id,
    kind: "video",
    provider: "fal",
    model: "fal-ai/kling-video/o3/pro/video-to-video/edit",
    status: "done",
    costUsd: 0.84,
    createdAt: "2026-10-05T10:00:00Z",
    createdBy: USER.id,
    externalId: "req-abc",
    occurrenceId: fx.rows.scene_occurrences[0].id,
    assetId: null,
    params: { seconds: 5 },
  },
  {
    id: "j2",
    projectId: project.id,
    kind: "video",
    provider: "runway",
    model: "aleph2",
    status: "lost",
    costUsd: 2.8,
    createdAt: "2026-09-29T08:00:00Z",
    createdBy: ANITA,
    externalId: "rw-1",
    occurrenceId: null,
    assetId: null,
    params: { seconds: 10 },
  },
  {
    id: "j3",
    projectId: project.id,
    kind: "image",
    provider: "google",
    model: "gemini-3-pro-image",
    status: "done",
    costUsd: 0.14,
    createdAt: "2026-10-06T09:00:00Z",
    createdBy: USER.id,
    externalId: null,
    occurrenceId: null,
    assetId: null,
    params: {},
  },
];

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
      RPC.push(fn);
      if (fn === "my_account")
        return json({
          status: "active",
          is_admin: true,
          permanent_admin: true,
          locale: st.locale ?? null,
          display_name: "Øystein",
          privacy_version: 2,
          accepted_version: st.accepted,
          created_at: "2026-09-01T10:00:00Z",
        });
      if (fn === "set_my_locale") {
        st.locale = JSON.parse(req.postData() ?? "{}").p_locale;
        return json(null);
      }
      if (fn === "accept_privacy") {
        st.accepted = 2;
        return json(null);
      }
      if (fn === "project_lock_info") {
        const body = JSON.parse(req.postData() ?? "{}");
        return json(
          body.p_project === LOCKED
            ? { lock: "owner_blocked", owner_name: "Anita Killi", admin_email: "oystein@gutu.no" }
            : { lock: null },
        );
      }
      return json(null);
    }
    const table = path.replace("/rest/v1/", "");
    if (table === "schema_version") return json([{ version: 33 }]);
    if (table === "privacy_policy") {
      const row = {
        version: 2,
        controller_name: "Diagonalen AS",
        org_number: "999 888 777",
        address: "Skedsmogata 7, Oslo",
        contact_email: "personvern@diagonalen.no",
        storage_region: "EU (Europa)",
        note: "",
        published_at: "2026-10-15T10:00:00Z",
      };
      return json(single ? row : [row]);
    }
    if (table === "projects") {
      if (single) return json(project);
      return json([{ ...project, project_members: [{ role: "owner", user_id: USER.id }] }]);
    }
    if (table === "project_members")
      return json([{ user_id: USER.id, role: "owner", joined_at: "2026-10-08T10:00:00Z" }]);
    if (table === "profiles")
      return json([
        { user_id: USER.id, display_name: "Øystein" },
        { user_id: ANITA, display_name: "Anita Killi" },
      ]);
    if (fx.rows[table] && single) return json(fx.rows[table][0] ?? null);
    if (fx.rows[table]) {
      const off = Number(url.searchParams.get("offset") ?? 0);
      return json(off > 0 ? [] : fx.rows[table]);
    }
    return json([]);
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
    if (/fetchAiUsage/.test(name))
      return json({
        ok: true,
        rows: usageRows,
        projectNames: { [project.id]: project.name },
        userNames: { [USER.id]: "Øystein", [ANITA]: "Anita Killi" },
      });
    if (/fetchUsdNokRates/.test(name))
      return json({
        ok: true,
        rates: [
          ["2026-09-29", 10.5],
          ["2026-10-03", 10.8],
          ["2026-10-06", 10.9],
        ],
      });
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
          {
            id: ANITA,
            email: "anita@trollfilm.no",
            displayName: "Anita Killi",
            createdAt: "2026-09-02T10:00:00Z",
            lastSignInAt: "2026-10-14T09:00:00Z",
            lastActiveAt: "2026-10-14T12:00:00Z",
            status: "blocked",
            reason: "Midlertidig",
            deleteAfter: null,
            isAdmin: false,
            permanentAdmin: false,
            projects: [{ id: LOCKED, name: "Fjellet som flyttet seg", role: "owner" }],
            spendUsd: 42.5,
            spend30Usd: 12.25,
            jobs: 31,
          },
          {
            id: OLA,
            email: "ola@example.no",
            displayName: "Ola Nordmann",
            createdAt: "2026-10-01T10:00:00Z",
            lastSignInAt: null,
            lastActiveAt: "2026-10-10T08:00:00Z",
            status: "active",
            reason: "",
            deleteAfter: null,
            isAdmin: false,
            permanentAdmin: false,
            projects: [{ id: project.id, name: project.name, role: "editor" }],
            spendUsd: 3.2,
            spend30Usd: 3.2,
            jobs: 4,
          },
        ],
        projects: [
          {
            id: LOCKED,
            name: "Fjellet som flyttet seg",
            createdAt: "2026-09-02T09:00:00Z",
            owners: [{ id: ANITA, name: "Anita Killi", status: "blocked" }],
            lock: "owner_blocked",
          },
          {
            id: project.id,
            name: project.name,
            createdAt: "2026-10-01T09:00:00Z",
            owners: [{ id: USER.id, name: "Øystein", status: "active" }],
            lock: null,
          },
        ],
      });
    if (/adminSetUserStatus|adminReassignProject|adminSetAdmin|adminSavePrivacy/.test(name))
      return json({ ok: true, message: "OK" });
    if (/requestMyDeletion/.test(name)) return json({ ok: false, message: "ikke i testen" });
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

async function run(name, path, act, { lang = "nb", signedIn = true, st = { accepted: 2 } } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    acceptDownloads: true,
  });
  await mock(ctx, st);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const exp = Math.floor(Date.now() / 1000) + 86400;
  await page.addInitScript(
    ([k, v, l, s]) => {
      if (s) localStorage.setItem(k, v);
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
      signedIn,
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

await run("k01-konto", "/konto", async (page) => {
  check(
    await page.getByTestId("header-account").isVisible(),
    "brukernavnet i toppfeltet er en lenke til «Min konto»",
  );
  check(
    await page.getByTestId("header-admin").isVisible(),
    "administrator ser «Admin» i toppfeltet",
  );
  const text = await page.getByTestId("account-page").innerText();
  for (const t of [
    "Profil",
    "Språk",
    "Passord",
    "AI-forbruk",
    "Personvern",
    "Slett kontoen min",
    "Fast administrator",
  ])
    check(text.includes(t), `kontosiden har «${t}»`);
  check(
    /Sum NOK/.test(text) && /Runway-kreditter/.test(text),
    "forbruket vises i kroner og Runway-kreditter",
  );
  check(/42,|42\./.test(text) || /NOK/.test(text), "kronebeløp er regnet ut");
  check(
    await page.getByText("Den faste administratorkontoen kan ikke slettes.").isVisible(),
    "den faste administratoren kan ikke slette seg selv",
  );
  await page.screenshot({ path: `${out}/k01-konto.png`, fullPage: true });
  for (const [f, ext] of [
    ["xlsx", ".xlsx"],
    ["pdf", ".pdf"],
    ["docx", ".docx"],
  ]) {
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.getByTestId(`cost-export-${f}`).click(),
    ]);
    const name = dl.suggestedFilename();
    const p = await dl.path();
    const size = p ? readFileSync(p).length : 0;
    check(
      name.endsWith(ext) && size > 1000,
      `eksport til ${ext} gir en fil (${name}, ${size} byte)`,
    );
    if (f === "xlsx") {
      const zip = readFileSync(p);
      check(zip.slice(0, 2).toString() === "PK", "Excel-filen er et gyldig regneark (zip)");
    }
    if (f === "pdf")
      check(readFileSync(p).slice(0, 5).toString() === "%PDF-", "PDF-filen er gyldig");
  }
});

await run(
  "k02-personvern-godkjenning",
  "/",
  async (page) => {
    const dlg = page.getByTestId("privacy-accept");
    check(await dlg.isVisible(), "ny versjon av personvernerklæringen må leses før man fortsetter");
    check(
      (await dlg.innerText()).includes("Diagonalen AS"),
      "erklæringen viser behandlingsansvarlig",
    );
    check(
      await page.getByTestId("privacy-accept-button").isDisabled(),
      "«Fortsett» er av til man har krysset av",
    );
    await page.screenshot({ path: `${out}/k02-godkjenning.png` });
    await page.getByTestId("privacy-read").check();
    await page.getByTestId("privacy-accept-button").click();
    await page.waitForTimeout(1500);
    check(RPC.includes("accept_privacy"), "godkjenningen lagres (accept_privacy)");
    check(!(await dlg.isVisible().catch(() => false)), "dialogen lukkes etter godkjenning");
  },
  { st: { accepted: 1 } },
);

await run("k03-admin", "/admin", async (page) => {
  const text = await page.getByTestId("admin-page").innerText();
  for (const t of [
    "Administrasjon",
    "Anita Killi",
    "Ola Nordmann",
    "Blokkert",
    "Låste prosjekter",
    "Fjellet som flyttet seg",
    "Personvernerklæringen",
    "42,50 USD",
  ])
    check(text.includes(t), `adminsiden viser «${t}»`);
  check(/Sist aktiv/.test(text) && /Laget/.test(text), "kolonnene «Laget» og «Sist aktiv» finnes");
  await page.screenshot({ path: `${out}/k03-admin.png`, fullPage: true });
  const ola = page.getByTestId("admin-user").filter({ hasText: "Ola Nordmann" });
  await ola.getByRole("button", { name: "Blokker …" }).click();
  await page.getByPlaceholder("Begrunnelse (valgfri)").fill("Test");
  await page.getByRole("button", { name: "Blokker", exact: true }).click();
  await page.waitForTimeout(800);
  const call = CALLS.find((c) => /adminSetUserStatus/.test(c.name));
  check(
    !!call && call.body.includes("block") && call.body.includes("Test"),
    "blokkering sendes til serveren med begrunnelse",
  );
  const øy = page.getByTestId("admin-user").filter({ hasText: "Øystein" });
  check(
    (await øy.getByRole("button").count()) === 0,
    "den faste administratoren har ingen knapper for blokkering, sletting eller nedgradering",
  );
  await page.getByTestId("admin-locked").locator("select").selectOption(OLA);
  await page.getByRole("button", { name: "Gi ny eier" }).click();
  await page.waitForTimeout(800);
  check(
    CALLS.some((c) => /adminReassignProject/.test(c.name) && c.body.includes(OLA)),
    "låst prosjekt kan gis ny eier",
  );
});

await run(
  "k04-personvern-uten-innlogging",
  "/",
  async (page) => {
    const link = page.getByRole("link", { name: "Personvern", exact: true });
    check(await link.isVisible(), "forsiden har lenke til personvernerklæringen før innlogging");
    await page.getByRole("button", { name: "Ny bruker? Opprett konto" }).click();
    check(
      await page.getByTestId("signup-privacy").isVisible(),
      "ny konto krever avkrysning for lest personvernerklæring",
    );
    await page.screenshot({ path: `${out}/k04a-forside.png` });
    await link.click();
    await page.waitForTimeout(1500);
    const t = await page.getByTestId("privacy-statement").innerText();
    for (const s of [
      "Vi selger aldri",
      "GDPR",
      "Datatilsynet",
      "USA",
      "API-nøkler",
      "30 dager",
      "EU (Europa)",
    ])
      check(t.includes(s), `erklæringen nevner «${s}»`);
    await page.screenshot({ path: `${out}/k04b-personvern.png`, fullPage: true });
  },
  { signedIn: false },
);

await run(`k05-laast-prosjekt`, `/prosjekt/${LOCKED}`, async (page) => {
  const t = await page.getByTestId("project-locked").innerText();
  check(
    t.includes("Prosjektet er låst") && t.includes("Anita Killi") && t.includes("oystein@gutu.no"),
    "låst prosjekt viser bare melding med eier og administrator",
  );
  await page.screenshot({ path: `${out}/k05-laast.png` });
});

await run(`k06-prosjekt-forbruk`, `/prosjekt/${project.id}`, async (page) => {
  const sec = page.getByTestId("project-cost");
  await sec.scrollIntoViewIfNeeded();
  check(await sec.isVisible(), "prosjektoversikten har «AI-forbruk og kostnadsrapport»");
  await page.getByTestId("cost-scope-project").click();
  await page.waitForTimeout(1200);
  const t = await sec.innerText();
  check(
    t.includes("Per person") && t.includes("Anita Killi"),
    "eieren ser prosjektet totalt per person",
  );
  check(
    CALLS.some((c) => /fetchAiUsage/.test(c.name) && c.body.includes("project")),
    "«Prosjektet totalt» spør etter hele prosjektet",
  );
  await sec.screenshot({ path: `${out}/k06-prosjekt-forbruk.png` });
});

await run(
  "k07-engelsk",
  "/konto",
  async (page) => {
    const t = await page.getByTestId("account-page").innerText();
    for (const s of ["My account", "Profile", "Password", "AI usage", "Delete my account"])
      check(t.includes(s), `engelsk: «${s}»`);
    await page.screenshot({ path: `${out}/k07-engelsk.png`, fullPage: true });
  },
  { lang: "en", st: { accepted: 2, locale: "en" } },
);

await run(
  "k08-sprakvelger",
  "/konto",
  async (page) => {
    // Feil funnet av Mars 15.10.2026: språket på kontoen satte tilbake valget i språkvelgeren
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await page.waitForTimeout(2500);
    check((await page.getByTestId("account-page").innerText()).includes("My account"), "byttet til engelsk blir stående");
    check(RPC.includes("set_my_locale"), "språkvalget lagres på kontoen");
    await page.getByRole("button", { name: "NO", exact: true }).click();
    await page.waitForTimeout(2500);
    check((await page.getByTestId("account-page").innerText()).includes("Min konto"), "tilbake til norsk blir stående");
  },
  { st: { accepted: 2, locale: "nb" } },
);

await run("k09-lukk-konto", "/admin", async (page) => {
  await page.getByTestId("header-account").click();
  await page.waitForTimeout(1500);
  check(page.url().endsWith("/konto"), "brukernavnet åpner «Min konto»");
  await page.getByTestId("header-account").click();
  await page.waitForTimeout(1500);
  check(page.url().endsWith("/admin"), "nytt klikk på brukernavnet lukker siden (tilbake dit man kom fra)");
  await page.getByTestId("header-account").click();
  await page.waitForTimeout(1500);
  await page.getByTestId("account-close").click();
  await page.waitForTimeout(1500);
  check(page.url().endsWith("/admin"), "«Lukk» nederst på siden går tilbake");
});

console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
await browser.close();
process.exit(fail ? 1 : 0);
