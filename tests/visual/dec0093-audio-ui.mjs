/**
 * Nettlesertest DEC-0093 (fase 2, bolk B): lydopptak – mikrofonikonet i lydressursen, inspektøren for en replikk
 * og lydklippet; lydvinduet med PC-opptak og QR-koden samtidig, opptak med falsk mikrofon, «Behold» som nytt
 * take; mobilsiden for en replikk med hele replikken, takes som bare ligger på telefonen til de velges, og
 * romlyd. Bygger på dec0090-mobile-ui.mjs (samme mocking).
 *
 * Opprinnelig DEC-0090 (fase 2, bolk A): mobilbroen – «Importer fra mobil» med QR-koden med en gang, kameraikon
 * i ressurs, sceneeditor og bildevalg for lag, mobilsiden (velg bilder, hurtigfoto med kamera, video, «Del
 * lenke», utløpt lenke), og «Mobilimport» i biblioteket med filtre og tilbakekalling. Mocker Supabase og
 * serverfunksjonene (ingenting lagres eller betales). Kameraet er Chromiums falske kamera.
 *   ENV_FILE=…/.env node dec0090-mobile-ui.mjs <baseUrl> <fixture.json> [utmappe]
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/dec0093",
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
let audioSession = false;
const PC = { uploads: 0 };
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
    if (table === "schema_version") return json([{ version: 35 }]);
    if (path.startsWith("/storage/v1/object/assets/") && req.method() === "POST") {
      PC.uploads++;
      return json({ Key: path.replace("/storage/v1/object/", "") });
    }
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
          : audioSession
            ? { ok: true, message: "", kind: "personal", label: "Scene 1 · MAJA", from: "Mars", mediaKinds: ["audio"], expiresAt: new Date(Date.now() + 7200_000).toISOString(), remainingFiles: 990, script: { speaker: "MAJA", parenthetical: "(hvisker)", text: "Jeg tror det er noen der ute. Vi må gå og se." } }
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
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: "dark", ...(mobile ? { isMobile: true, hasTouch: true, permissions: ["camera", "microphone"] } : { permissions: ["microphone"] }) });
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



const WIND = fx.rows.assets.find((a) => a.name === "Vind i trærne");
const occRow = fx.rows.scene_occurrences.find((o) => o.id === OCC1);
const LINE = fx.rows.script_blocks.find((b) => b.variant_id === occRow.variant_id && b.kind === "dialogue");
const sentCommands = () => COMMANDS;

await run(
  "a01-lydressurs",
  async (page) => {
    const mic = page.getByRole("button", { name: /Ta opp lyd: Opptak til «Vind i trærne»/ });
    check(await mic.isVisible(), "mikrofonikonet står øverst i lydressursen (ikke kameraet)");
    check(!(await page.getByRole("button", { name: /Importer fra mobil: Bilder av Vind/ }).isVisible().catch(() => false)), "ingen kameraikon for lyd");
    await mic.click();
    await page.waitForTimeout(900);
    const dlg = page.getByTestId("audio-takes-dialog");
    check(await dlg.isVisible(), "lydvinduet åpnes");
    check(await dlg.getByText("Ta opp på denne datamaskinen").isVisible(), "L1: PC-opptak vises …");
    check(await dlg.getByTestId("mobile-qr").isVisible(), "L1: … og QR-koden samtidig, uten ekstra klikk");
    check(await dlg.getByTestId("pc-rec-start").isVisible(), "L2: PC-opptak startes uten ekstra valg");
    check(await dlg.getByTestId("audio-takes-list").locator("li").count() >= 1, "eksisterende opptak vises som takes");
    await page.screenshot({ path: `${out}/a01-lydvindu.png` });
    // Opptak med Chromiums falske mikrofon
    await dlg.getByTestId("pc-rec-start").click();
    await page.waitForTimeout(1600);
    check(await dlg.getByTestId("pc-rec-stop").isVisible(), "opptaket går (stopp-knapp med tid)");
    await dlg.getByTestId("pc-rec-stop").click();
    await page.waitForTimeout(700);
    check((await dlg.getByTestId("pc-rec-local").locator("li").count()) === 1, "opptaket ligger klart til å høres og beholdes");
    await dlg.getByTestId("pc-rec-start").click();
    await page.waitForTimeout(1200);
    await dlg.getByTestId("pc-rec-stop").click();
    await page.waitForTimeout(700);
    check((await dlg.getByTestId("pc-rec-local").locator("li").count()) === 2, "«Ta opp på nytt» beholder det forrige opptaket");
    await page.screenshot({ path: `${out}/a01b-to-opptak.png` });
    const before = COMMANDS.length;
    await dlg.getByTestId("pc-rec-keep").first().click();
    await page.waitForTimeout(1500);
    const cmds = sentCommands().slice(before).join(" ");
    check(PC.uploads === 1, "opptaket lastes opp til lagringen");
    check(/AddAssetVersion/.test(cmds) && !/UpdateAudioClips/.test(cmds), "«Behold» gir et nytt take (ny versjon), ingenting erstattes");
    check((await dlg.getByTestId("pc-rec-local").locator("li").count()) === 1, "det andre opptaket ligger fortsatt klart");
    // Lukk med et opptak som ikke er beholdt: advarsel
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    check(await page.getByTestId("audio-takes-confirm-close").isVisible(), "advarsel før et opptak som ikke er beholdt forsvinner");
  },
  { path: `/bibliotek?asset=${WIND.id}` },
);

await run(
  "a02-replikk-i-manus",
  async (page) => {
    const mic = page.getByRole("button", { name: /Ta opp lyd: Scene/ }).first();
    check(await mic.isVisible(), "mikrofonikonet i inspektøren for en replikk");
    await mic.click();
    await page.waitForTimeout(900);
    const dlg = page.getByTestId("audio-takes-dialog");
    const line = await dlg.getByTestId("audio-takes-line").innerText();
    check(line.includes(LINE.text.replace(/\s+/g, " ").trim().slice(0, 30)), "hele replikken vises med karakter og scene");
    check(await dlg.getByTestId("mobile-qr").isVisible(), "egen QR-kode for replikken");
    await page.screenshot({ path: `${out}/a02-replikk.png` });
  },
  { path: `/manus?scene=${OCC1}&blokk=${LINE.id}` },
);

audioSession = true;
await run(
  "a03-mobil-replikk",
  async (page) => {
    check(/Jeg tror det er noen der ute/.test(await page.getByTestId("mobile-script").innerText()), "L3: mobilen viser replikken (med karakter og regianvisning)");
    check(await page.getByTestId("mobile-rec-start").isVisible(), "L3: og opptakskontrollene");
    check(!(await page.getByTestId("mobile-take-photos").isVisible().catch(() => false)), "ingen bildeknapper for lydopptak");
    for (let i = 0; i < 2; i++) {
      await page.getByTestId("mobile-rec-start").click();
      await page.waitForTimeout(1300);
      await page.getByTestId("mobile-rec-stop").click();
      await page.waitForTimeout(700);
    }
    const takes = page.getByTestId("mobile-take");
    check((await takes.count()) === 2, "L4: Take 01 og Take 02 er tatt opp");
    check((await page.locator("[data-testid=mobile-take] audio").count()) === 2, "L5: begge kan høres før opplasting");
    check(MOBILE.tickets === 0, "lyd lastes ikke opp når opptaket stopper");
    check(/Take 02/.test(await takes.first().innerText()) && /Valgt/.test(await takes.first().innerText()), "nytt take er valgt, men ikke sendt");
    await page.screenshot({ path: `${out}/a03a-takes.png` });
    // Bare Take 01: fjern valget på Take 02
    await takes.first().getByTestId("mobile-take-choose").uncheck();
    await page.getByTestId("mobile-send-takes").click();
    await page.waitForTimeout(2500);
    check(MOBILE.tickets === 1, "L6: bare Take 01 sendes");
    const status = await page.locator("[data-testid=mobile-take]").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
    check(status.join(",") === "local,sent", `Take 02 ligger igjen på telefonen (${status.join(",")})`);
    await takes.first().getByTestId("mobile-take-choose").check();
    await page.getByTestId("mobile-send-takes").click();
    await page.waitForTimeout(2500);
    check(MOBILE.tickets === 2, "L7: også det andre kan sendes");
    await page.getByTestId("mobile-rec-roomtone").click();
    await page.waitForTimeout(1300);
    await page.getByTestId("mobile-rec-stop").click();
    await page.waitForTimeout(700);
    check(/Romlyd 1/.test(await page.getByTestId("mobile-takes").innerText()), "romlyd tas opp for seg og merkes");
    await page.screenshot({ path: `${out}/a03b-sendt.png`, fullPage: true });
  },
  { path: `/m/${TOKEN}`, mobile: true, width: 390, height: 844 },
);
audioSession = false;

console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
await browser.close();
