/**
 * Nettlesertest DEC-0090 (fase 2, bolk A): mobilbroen – «Importer fra mobil» med QR-koden med en gang, kameraikon
 * i ressurs, sceneeditor og bildevalg for lag, mobilsiden (velg bilder, hurtigfoto med kamera, video, «Del
 * lenke», utløpt lenke), og «Mobilimport» i biblioteket med filtre og tilbakekalling. Mocker Supabase og
 * serverfunksjonene (ingenting lagres eller betales). Kameraet er Chromiums falske kamera.
 *   ENV_FILE=…/.env node dec0090-mobile-ui.mjs <baseUrl> <fixture.json> [utmappe]
 */
import { chromium } from "playwright";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { revealInToolbar } from "./toolbar.mjs";
import { readFileSync, mkdirSync } from "node:fs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/dec0090",
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

const MAJA = fx.rows.assets.find((a) => a.name === "Maja");
const OCC1 = "00000000-0000-7000-8000-000000000006";
const SESSION = "00000000-0000-7000-8000-00000000e001";
const SHARED = "00000000-0000-7000-8000-00000000e002";
const NOW = new Date().toISOString();
const SESSIONS = [
  {
    id: SESSION, project_id: project.id, kind: "personal", parent_id: null, created_by: "00000000-0000-7000-8000-a11ce0000001",
    creator_name: "Mars", context: { type: "asset", assetId: MAJA.id }, label: "Bilder av Maja", media_kinds: ["image", "video"],
    expires_at: new Date(Date.now() + 3600_000).toISOString(), revoked_at: null, max_files: 1000, max_bytes: 1e10,
    files_count: 2, bytes_total: 2000, last_seen_at: NOW, created_at: NOW,
  },
  {
    id: SHARED, project_id: project.id, kind: "shared", parent_id: SESSION, created_by: "00000000-0000-7000-8000-a11ce0000001",
    creator_name: "Mars", context: { type: "asset", assetId: MAJA.id }, label: "Bilder av Maja", media_kinds: ["image", "video"],
    expires_at: new Date(Date.now() + 6 * 86400_000).toISOString(), revoked_at: null, max_files: 200, max_bytes: 5e9,
    files_count: 1, bytes_total: 1000, last_seen_at: null, created_at: NOW,
  },
];
const imp = (id, kind, extra = {}) => ({
  id, project_id: project.id, session_id: SESSION, client_file_id: id, path: `${project.id}/source/mobile/${SESSION}/${id}.${kind === "video" ? "mp4" : "jpg"}`,
  kind, mime_type: kind === "video" ? "video/mp4" : "image/jpeg", byte_size: 1000, file_name: kind === "video" ? "klipp.mp4" : "maja.jpg",
  contributor_name: "", status: "done", error: null, context: { type: "asset", assetId: MAJA.id }, asset_id: MAJA.id,
  asset_version_id: kind === "image" ? "00000000-0000-7000-8000-00000000f0f0" : null, take_id: null, claimed_by: null, claimed_at: null,
  dismissed: false, created_at: NOW, confirmed_at: NOW, ...extra,
});
const IMPORTS = [
  imp("00000000-0000-7000-8000-00000000d001", "image"),
  imp("00000000-0000-7000-8000-00000000d002", "video", { asset_version_id: null }),
  imp("00000000-0000-7000-8000-00000000d003", "image", { session_id: SHARED, contributor_name: "Fotograf Kari", asset_version_id: null, asset_id: null, context: { type: "project" } }),
];
const rows = { ...fx.rows, upload_sessions: SESSIONS, mobile_imports: IMPORTS };
const TOKEN = "T".repeat(43);
const MOBILE = { tickets: 0, uploads: 0, confirms: 0, shares: 0, created: 0, revoked: 0 };
let expired = false;
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
    if (path.startsWith("/storage/v1/object/upload/sign/")) {
      MOBILE.uploads++;
      return json({ Key: path.replace("/storage/v1/object/upload/sign/", "") });
    }
    if (table === "rpc/revoke_upload_session") {
      MOBILE.revoked++;
      return json(null);
    }
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
    if (/createUploadSession/.test(name)) {
      MOBILE.created++;
      return json({ ok: true, message: "", sessionId: SESSION, token: TOKEN, expiresAt: new Date(Date.now() + 7200_000).toISOString() });
    }
    if (/mobileSession/.test(name))
      return json(
        expired
          ? { ok: false, message: "Lenken er utløpt eller tilbakekalt. Be om en ny QR-kode." }
          : { ok: true, message: "", kind: "personal", label: "Bilder av Maja", from: "Mars", mediaKinds: ["image", "video"], expiresAt: new Date(Date.now() + 7200_000).toISOString(), remainingFiles: 990 },
      );
    if (/mobileUploadTicket/.test(name)) {
      MOBILE.tickets++;
      const body = route.request().postData() ?? "";
      const id = /"clientFileId":"([^"]+)"/.exec(body)?.[1] ?? "x";
      return json({ ok: true, message: "", path: `${project.id}/source/mobile/${SESSION}/${id}.jpg`, uploadToken: "u" });
    }
    if (/mobileConfirmUpload/.test(name)) {
      MOBILE.confirms++;
      return json({ ok: true, message: "" });
    }
    if (/mobileShareLink/.test(name)) {
      MOBILE.shares++;
      return json({ ok: true, message: "", token: "S".repeat(43), expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString() });
    }
    if (/pumpProjectQueue/.test(name)) return json({ sent: 0 });
    return route.abort();
  });
}

const ARGS = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];
const browser = await chromium
  .launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ARGS })
  .catch(() => chromium.launch({ args: ARGS }));
let pass = 0,
  fail = 0;
const check = (ok, text) => {
  console.log(`  ${ok ? "✓" : "✗"} ${text}`);
  ok ? pass++ : fail++;
};

/** Ny nettleser (tomt lokalt lager) som åpner sceneeditoren. */
async function run(name, act, { lang = "nb", width = 1600, height = 900, path = "", mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: "dark", ...(mobile ? { isMobile: true, hasTouch: true, permissions: ["camera"] } : {}) });
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
  await page.goto(base + (mobile ? path : P + path), { waitUntil: "networkidle" });
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


// En liten gyldig JPEG (1 × 1 piksel)
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

await run(
  "m01-prosjektsiden",
  async (page) => {
    const btn = page.getByTestId("project-mobile-import");
    check(await btn.isVisible(), "«Importer fra mobil» på prosjektsiden");
    await btn.click();
    await page.waitForTimeout(800);
    const dlg = page.getByTestId("mobile-import-dialog");
    check(await dlg.isVisible(), "vinduet åpnes");
    check(await dlg.getByTestId("mobile-qr").isVisible(), "QR-koden vises med en gang (uten ekstra klikk)");
    check(MOBILE.created === 1, "én økt lages for konteksten");
    check(/Mobilimport til prosjektet/.test(await dlg.getByTestId("mobile-import-label").innerText()), "vinduet sier hvor filene havner");
    check(await dlg.getByTestId("mobile-connected").isVisible(), "status for mobilen vises");
    await page.screenshot({ path: `${out}/m01-qr.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await btn.click();
    await page.waitForTimeout(500);
    check(MOBILE.created === 1, "samme kode brukes når vinduet åpnes igjen");
  },
  { path: "" },
);

await run(
  "m02-kamera-i-ressurs",
  async (page) => {
    const cam = page.getByRole("button", { name: "Importer fra mobil: Bilder av Maja" });
    check(await cam.isVisible(), "kameraikonet står øverst i Majas ressurs");
    check(
      await page.getByRole("button", { name: /Importer fra mobil: Bilder til en ny ressurs/ }).isVisible(),
      "kameraikon også ved «ny ressurs» (bilder før ressursen er lagret)",
    );
    await cam.click();
    await page.waitForTimeout(800);
    const dlg = page.getByTestId("mobile-import-dialog");
    check(/Bilder av Maja/.test(await dlg.innerText()), "«Bilder av Maja» – bildene legges til Maja");
    check(await dlg.getByTestId("mobile-connected").innerText().then((t) => /tilkoblet/.test(t)), "mobilen vises som tilkoblet");
    check(/3 filer mottatt/.test(await dlg.getByTestId("mobile-received-count").innerText()), "mottatte filer telles (også fra den delte lenken)");
    check(/Lagt inn som ny versjon/.test(await dlg.innerText()), "bildet er lagt inn som ny versjon");
    await page.screenshot({ path: `${out}/m02-maja.png` });
  },
  { path: `/bibliotek?asset=${MAJA.id}` },
);

await run(
  "m03-sceneeditor",
  async (page) => {
    const cam = page.getByTestId("mobile-camera-button").first();
    await revealInToolbar(page, cam);
    check(await cam.isVisible(), "kameraikonet står i sceneeditoren (egen kode for scenen)");
    await cam.click();
    await page.waitForTimeout(600);
    check(/Scene 1/.test(await page.getByTestId("mobile-import-label").innerText()), "koden gjelder denne scenen");
    await page.keyboard.press("Escape");
  },
  { path: `/scene?scene=${OCC1}` },
);

await run(
  "m04-biblioteket",
  async (page) => {
    await page.getByRole("combobox", { name: "Type" }).first().selectOption("mobile");
    await page.waitForTimeout(800);
    const lib = page.getByTestId("mobile-library");
    check(await lib.isVisible(), "«Mobilimport» i biblioteket");
    const items = page.getByTestId("mobile-library-items").locator("li");
    check((await items.count()) === 3, "alle filene fra mobilen vises");
    await lib.getByRole("combobox", { name: "Type" }).selectOption("video");
    await page.waitForTimeout(200);
    check((await items.count()) === 1, "filter: bare video");
    await lib.getByRole("combobox", { name: "Type" }).selectOption("all");
    await lib.getByRole("combobox", { name: "Bidragsyter" }).selectOption("Fotograf Kari");
    await page.waitForTimeout(200);
    check((await items.count()) === 1 && /delt lenke/.test(await items.first().innerText()), "filter: bidragsyter (via delt lenke)");
    await lib.getByRole("combobox", { name: "Bidragsyter" }).selectOption("");
    await lib.getByRole("combobox", { name: "Kobling" }).selectOption("unlinked");
    await page.waitForTimeout(200);
    check((await items.count()) === 1, "filter: ikke knyttet");
    await lib.getByRole("combobox", { name: "Kobling" }).selectOption("all");
    check(await page.getByTestId("mobile-sessions").isVisible(), "aktive lenker vises");
    await page.screenshot({ path: `${out}/m04-bibliotek.png`, fullPage: true });
    await page.getByTestId("mobile-revoke").last().click();
    await page.waitForTimeout(300);
    check(MOBILE.revoked === 1, "en lenke kan tilbakekalles");
  },
  { path: "/bibliotek" },
);

await run(
  "m05-mobilsiden",
  async (page) => {
    check(/Bilder av Maja/.test(await page.getByTestId("mobile-label").innerText()), "mobilsiden viser hva filene gjelder");
    check(await page.getByTestId("mobile-take-photos").isVisible(), "stor knapp «Ta bilder»");
    check(await page.getByTestId("mobile-record-video").isVisible(), "«Ta opp video»");
    check(!(await page.getByText("Manus").isVisible().catch(() => false)), "ingenting av resten av appen");
    await page.screenshot({ path: `${out}/m05a-mobil.png` });
    await page.getByTestId("mobile-pick-images-input").setInputFiles([
      { name: "a.jpg", mimeType: "image/jpeg", buffer: JPEG },
      { name: "b.jpg", mimeType: "image/jpeg", buffer: JPEG },
    ]);
    await page.waitForTimeout(2500);
    const sentCount = await page.locator('[data-testid=mobile-queue-item][data-status="sent"]').count();
    check(sentCount === 2, `begge bildene er sendt og bekreftet (${sentCount})`);
    check(MOBILE.uploads === 2 && MOBILE.confirms === 2, "lastet rett til lagringen og bekreftet av serveren");
    await page.getByTestId("mobile-pick-images-input").setInputFiles([
      { name: "notat.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") },
    ]);
    await page.waitForTimeout(300);
    check(await page.getByTestId("mobile-notice").isVisible(), "feil filtype avvises på telefonen");
    // Hurtigfoto med kameraet: bilde etter bilde uten å bekrefte
    await page.getByTestId("mobile-take-photos").click();
    await page.waitForTimeout(2000);
    check(await page.getByTestId("mobile-camera").isVisible(), "kameraet åpnes i siden");
    for (let i = 0; i < 3; i++) {
      await page.getByTestId("mobile-shutter").click();
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: `${out}/m05b-kamera.png` });
    await page.waitForTimeout(2500);
    await page.getByTestId("mobile-camera-done").click();
    await page.waitForTimeout(300);
    const sent2 = await page.locator('[data-testid=mobile-queue-item][data-status="sent"]').count();
    check(sent2 === 5, `tre bilder tatt og sendt automatisk (${sent2} sendt totalt)`);
    // Del lenke (ingen deling i testnettleseren: lenken kopieres/vises)
    await page.getByTestId("mobile-share").click();
    await page.waitForTimeout(600);
    check(MOBILE.shares === 1, "«Del lenke» lager en egen delt lenke");
    check(/\/m\/S{43}/.test(await page.getByTestId("mobile-share-link").inputValue()), "lenken kan kopieres");
    await page.screenshot({ path: `${out}/m05c-del.png`, fullPage: true });
  },
  { path: `/m/${TOKEN}`, mobile: true, width: 390, height: 844 },
);

expired = true;
await run(
  "m06-utlopt",
  async (page) => {
    check(/utløpt eller tilbakekalt/.test(await page.getByTestId("mobile-expired").innerText()), "utløpt lenke gir tydelig melding");
    await page.screenshot({ path: `${out}/m06-utlopt.png` });
  },
  { path: `/m/${TOKEN}`, mobile: true, width: 390, height: 844 },
);
expired = false;

await run(
  "m07-engelsk",
  async (page) => {
    check(await page.getByTestId("mobile-take-photos").innerText().then((t) => /Take pictures/.test(t)), "mobilsiden på engelsk");
  },
  { path: `/m/${TOKEN}`, mobile: true, width: 390, height: 844, lang: "en" },
);

console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
await browser.close();
process.exitCode = fail ? 1 : 0;
