/**
 * B-109: stengt for nye registreringer. Innloggingssiden (stengt/åpen, innloggingslenke uten ny konto,
 * rolig melding ved feil fra databasen, invitasjonsunntak, vanlig innlogging) og bryteren på adminsiden.
 * Mocker innloggingstjenesten og databasen; ingenting endres.
 *   ENV_FILE=…/.env [UI_LANG=en] node tests/visual/registration-closed.mjs <baseUrl> [utmappe]
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { byLang, uiLang } from "./ui-lang.mjs";

const [base = "http://127.0.0.1:8080", out = "/tmp/claude-0/b109"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const env = readFileSync(process.env.ENV_FILE, "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const LANG = uiLang("nb");
const L = (nb, en) => byLang(LANG, nb, en);
const USER = { id: "00000000-0000-7000-8000-a11ce0000001", email: "oystein@gutu.no", aud: "authenticated", role: "authenticated" };
const DEFAULT_MSG = L("Tjenesten tar ikke imot nye brukere akkurat nå.", "The service is not accepting new users right now.");

let pass = 0, fail = 0;
const check = (ok, text) => { console.log(`  ${ok ? "ok" : "FEIL"} ${text}`); ok ? pass++ : fail++; };

function serverFnName(url) {
  try {
    const b64 = new URL(url).pathname.split("/_serverFn/")[1];
    return JSON.parse(Buffer.from(decodeURIComponent(b64), "base64url").toString("utf8")).export;
  } catch { return "?"; }
}

async function mock(ctx, st) {
  await ctx.route(`${supaUrl}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    const body = () => { try { return JSON.parse(req.postData() ?? "{}"); } catch { return {}; } };
    if (path.startsWith("/auth/v1/otp")) {
      const b = body(); st.otp.push(b);
      if (b.create_user === false) return json({ code: "otp_disabled", msg: "Signups not allowed for otp" }, 422);
      return json({});
    }
    if (path.startsWith("/auth/v1/signup")) {
      st.signups.push(body());
      if (!st.open && !st.inviteOk) return json({ code: "unexpected_failure", msg: "Database error saving new user" }, 500);
      return json({ id: "x", email: body().email, identities: [{}] });
    }
    if (path.startsWith("/auth/v1/token")) {
      st.logins++;
      return json({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: USER });
    }
    if (path.startsWith("/auth/v1/user")) return json(USER);
    if (path.startsWith("/auth/v1/")) return json({});
    if (path.startsWith("/realtime/")) return route.abort();
    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.replace("/rest/v1/rpc/", "");
      st.rpcs.push(fn);
      if (fn === "registration_status") return json({ open: st.open, message: st.open ? null : st.message });
      if (fn === "admin_registration_settings")
        return json({ open: st.open, message: st.message, changed_at: st.changedAt, changed_by_name: st.changedAt ? "Øystein" : null });
      if (fn === "set_registration_open") {
        const b = body(); st.sets.push(b);
        st.open = b.p_open; st.message = b.p_message; st.changedAt = "2026-10-21T16:00:00Z";
        return json(null);
      }
      if (fn === "my_account")
        return json({ status: "active", is_admin: true, permanent_admin: true, locale: null, display_name: "Øystein", privacy_version: 2, accepted_version: 2, created_at: "2026-09-01T10:00:00Z", country: "NO" });
      return json(null);
    }
    const table = path.replace("/rest/v1/", "");
    if (table === "schema_version") return json([{ version: VISUAL_SCHEMA_VERSION }]);
    return json([]);
  });
  await ctx.route("**/_serverFn/**", (route) => {
    const name = serverFnName(route.request().url());
    const json = (result) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, context: {} }) });
    // B-110: innloggingslenken sendes nå av serveren (etter CAPTCHA); registreringspass hentes før signUp
    const body = route.request().postData() ?? "";
    if (/^captchaConfig/.test(name)) return json({ enabled: false, siteKey: null });
    if (/^requestSignupPass/.test(name)) return json({ ok: true });
    if (/^sendSignInLinkCaptcha/.test(name)) {
      // Seroval: {t:2, s:2} = true, {t:2, s:3} = false
      let create_user = true;
      try {
        const inner = JSON.parse(body).t.p.v[0].p;
        create_user = inner.v[inner.k.indexOf("createUser")]?.s !== 3;
      } catch { /* standard: true */ }
      st.otp.push({ create_user });
      return json(create_user ? { ok: true } : { ok: false, code: "auth", message: "Signups not allowed for otp" });
    }
    if (/fetchAdminOverview/.test(name))
      return json({ ok: true, purged: 0, permanentEmail: "oystein@gutu.no", users: [], projects: [] });
    return json({ ok: false });
  });
}

const browser = await chromium.launch();
async function run(name, path, act, init = {}) {
  const st = { open: false, message: null, changedAt: null, inviteOk: false, otp: [], signups: [], sets: [], rpcs: [], logins: 0, ...init };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 }, colorScheme: "dark" });
  await mock(ctx, st);
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const signedIn = !!init.signedIn;
  await page.addInitScript(([k, v, l, s]) => { if (s) localStorage.setItem(k, v); localStorage.setItem("animatic:lang", l); }, [
    `sb-${ref}-auth-token`,
    JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: USER }),
    LANG, signedIn,
  ]);
  try {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await act(page, st);
  } catch (e) {
    errors.push("act: " + String(e).split("\n")[0]);
    await page.screenshot({ path: `${out}/${name}-failed.png` }).catch(() => {});
  }
  check(errors.length === 0, `${name}: ingen kjørefeil ${errors.join(" | ").slice(0, 300)}`);
  await ctx.close();
}

await run("stengt-standardmelding", "/konto", async (page, st) => {
  const notice = page.getByTestId("registration-closed-notice");
  await notice.waitFor({ timeout: 15000 });
  check((await notice.textContent())?.trim() === DEFAULT_MSG, "stengt: standardmeldingen vises");
  check((await page.getByTestId("auth-mode-toggle").count()) === 0, "stengt: «Opprett konto» er skjult");
  check((await page.getByTestId("signup-country").count()) === 0 && (await page.getByTestId("signup-privacy").count()) === 0, "stengt: registreringsskjemaet vises ikke");
  check(await page.getByTestId("auth-submit").isVisible(), "stengt: innlogging er fortsatt mulig");
  check(!st.rpcs.some((r) => r !== "registration_status" && r !== "my_account"), "bare statusfunksjonen kalles før innlogging");
  // Innloggingslenke: ingen ny konto, rolig melding ved ukjent adresse
  await page.locator("#email").fill("ny@example.no");
  await page.getByRole("button", { name: L("Send innloggingslenke", "Send sign-in link") }).click();
  await page.waitForTimeout(800);
  check(st.otp.at(-1)?.create_user === false, "innloggingslenke sendes med shouldCreateUser: false");
  const alert = page.getByRole("alert");
  check((await alert.textContent())?.trim() === DEFAULT_MSG, "ukjent adresse gir den rolige meldingen, ikke en databasefeil");
  await page.screenshot({ path: `${out}/stengt.png` });
});

await run("stengt-egen-melding", "/konto", async (page) => {
  const notice = page.getByTestId("registration-closed-notice");
  await notice.waitFor({ timeout: 15000 });
  check((await notice.textContent())?.trim() === "Vi åpner igjen i januar.", "administratorens egen melding vises");
}, { message: "Vi åpner igjen i januar." });

await run("stengt-eksisterende-innlogging", "/konto", async (page, st) => {
  await page.getByTestId("registration-closed-notice").waitFor({ timeout: 15000 });
  await page.locator("#email").fill("oystein@gutu.no");
  await page.locator("#password").fill("hemmelig-passord");
  await page.getByTestId("auth-submit").click();
  await page.waitForTimeout(1500);
  check(st.logins === 1, "eksisterende bruker logger inn som før");
  check((await page.getByTestId("registration-closed-notice").count()) === 0, "innloggingssiden forsvinner etter innlogging");
});

await run("apen", "/konto", async (page, st) => {
  await page.getByTestId("auth-mode-toggle").waitFor({ timeout: 15000 });
  check((await page.getByTestId("registration-closed-notice").count()) === 0, "åpen: ingen melding");
  await page.locator("#email").fill("ny@example.no");
  await page.getByRole("button", { name: L("Send innloggingslenke", "Send sign-in link") }).click();
  await page.waitForTimeout(800);
  check(st.otp.at(-1)?.create_user === true, "åpen: innloggingslenke kan lage konto");
}, { open: true });

await run("invitasjon-unntak", "/invitasjon?token=abc", async (page, st) => {
  const toggle = page.getByTestId("auth-mode-toggle");
  await toggle.waitFor({ timeout: 15000 });
  check((await page.getByTestId("registration-closed-notice").count()) === 0, "invitasjonslenke: registreringen er tilgjengelig");
  await toggle.click();
  check(await page.getByTestId("signup-privacy").isVisible(), "invitasjonslenke: registreringsskjemaet vises");
}, { inviteOk: true });

await run("stengt-feil-fra-databasen", "/konto", async (page, st) => {
  // Statusen ble lest som åpen, men databasen stenger før skjemaet sendes
  await page.getByTestId("auth-mode-toggle").click();
  st.open = false;
  await page.locator("#email").fill("ny@example.no");
  await page.locator("#password").fill("hemmelig-passord");
  await page.getByTestId("signup-country").click();
  await page.getByTestId("signup-country-option-NO").click();
  await page.getByTestId("signup-privacy").check();
  await page.getByTestId("auth-submit").click();
  await page.waitForTimeout(1000);
  check(st.signups.length === 1, "registreringen ble forsøkt");
  const txt = (await page.getByRole("alert").textContent())?.trim() ?? "";
  check(txt === DEFAULT_MSG && !/database/i.test(txt), "feilen fra triggeren gir den rolige meldingen");
}, { open: true });

await run("admin-bryter", "/admin", async (page, st) => {
  const sec = page.getByTestId("admin-registration");
  await sec.waitFor({ timeout: 20000 });
  check((await page.getByTestId("registration-open").getAttribute("aria-checked")) === "true", "admin: status vises som åpen");
  check((await page.getByTestId("registration-changed").textContent())?.includes(L("Ikke endret ennå", "Not changed yet")), "admin: aldri endret");
  await page.getByTestId("registration-message").fill("Stengt til nyttår.");
  await page.getByTestId("registration-closed").click();
  const dlg = page.getByTestId("registration-confirm");
  await dlg.waitFor({ timeout: 5000 });
  check(st.sets.length === 0, "admin: ingenting endres før bekreftelse");
  await page.getByRole("button", { name: L("Avbryt", "Cancel") }).click();
  await page.waitForTimeout(300);
  check(st.sets.length === 0, "admin: avbryt endrer ingenting");
  await page.getByTestId("registration-closed").click();
  await page.getByTestId("registration-confirm-ok").click();
  await page.waitForTimeout(1200);
  check(st.sets.at(-1)?.p_open === false && st.sets.at(-1)?.p_message === "Stengt til nyttår.", "admin: stenger med melding");
  check((await page.getByTestId("registration-closed").getAttribute("aria-checked")) === "true", "admin: status vises som stengt");
  const changed = (await page.getByTestId("registration-changed").textContent()) ?? "";
  check(changed.includes("Øystein") && changed.includes(L("Sist endret", "Last changed")), "admin: hvem og når");
  await page.screenshot({ path: `${out}/admin.png` });
  await page.getByTestId("registration-open").click();
  await page.getByTestId("registration-confirm-ok").click();
  await page.waitForTimeout(1000);
  check(st.sets.at(-1)?.p_open === true, "admin: åpner igjen");
}, { open: true, signedIn: true });

console.log(`RESULTAT ${pass} bestått, ${fail} feilet`);
await browser.close();
process.exitCode = fail ? 1 : 0;
