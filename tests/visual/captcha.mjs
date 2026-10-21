/**
 * B-110: CAPTCHA (Cloudflare Turnstile) på registrering, innloggingslenke, «Glemt passord» og innlogging etter
 * 3 feil. Turnstile-skriptet erstattes av en lokal etterligning som oppfører seg som Cloudflares testnøkler
 * (1x… godkjenner alltid, 2x… avviser alltid). Serverfunksjonene mockes; ingen ekte kall til Cloudflare.
 *   ENV_FILE=…/.env [UI_LANG=en] node tests/visual/captcha.mjs <baseUrl> [utmappe]
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { byLang, uiLang } from "./ui-lang.mjs";

const [base = "http://127.0.0.1:8080", out = "/tmp/claude-0/b110"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const env = readFileSync(process.env.ENV_FILE, "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const LANG = uiLang("nb");
const L = (nb, en) => byLang(LANG, nb, en);
const PASS_SITE = "1x00000000000000000000AA"; // Cloudflare: godkjenner alltid
const FAIL_SITE = "2x00000000000000000000AB"; // Cloudflare: avviser alltid
const DUMMY = "XXXX.DUMMY.TOKEN.XXXX"; // tokenet testnøklene gir
const USER = { id: "00000000-0000-7000-8000-a11ce0000001", email: "oystein@gutu.no", aud: "authenticated", role: "authenticated" };
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const JWT = `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u({ sub: "00000000-0000-7000-8000-a11ce0000001", exp: Math.floor(Date.now() / 1000) + 86400, role: "authenticated" })}.sig`;
const SESSION = { access_token: JWT, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: USER };
const FAILED = L("Vi fikk ikke bekreftet at du ikke er en robot. Prøv igjen.", "We could not confirm that you are not a robot. Please try again.");

let pass = 0, fail = 0;
const check = (ok, text) => { console.log(`  ${ok ? "ok" : "FEIL"} ${text}`); ok ? pass++ : fail++; };

const FAKE_TURNSTILE = `(() => {
  let n = 0;
  window.__ts = [];
  window.turnstile = {
    render(el, o) {
      const id = "w" + (++n);
      window.__ts.push({ id, sitekey: o.sitekey, language: o.language, theme: o.theme, action: o.action });
      el.innerHTML = '<button type="button" data-testid="ts-fake">Turnstile</button>';
      setTimeout(() => { if (String(o.sitekey).startsWith("1x")) o.callback(${JSON.stringify(DUMMY)}); else o["error-callback"]("600010"); }, 60);
      return id;
    },
    remove() {},
    reset() {},
  };
})();`;

function serverFnName(url) {
  try {
    const b64 = new URL(url).pathname.split("/_serverFn/")[1];
    return JSON.parse(Buffer.from(decodeURIComponent(b64), "base64url").toString("utf8")).export;
  } catch { return "?"; }
}

async function mock(ctx, st) {
  await ctx.route("https://challenges.cloudflare.com/**", (route) => {
    st.cloudflare.push(route.request().url());
    if (route.request().url().includes("/turnstile/v0/api.js")) return route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_TURNSTILE });
    return route.abort();
  });
  await ctx.route(`${supaUrl}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (path.startsWith("/auth/v1/signup")) { st.direct.push("signup"); return json({ id: "x", email: "ny@example.no", identities: [{}] }); }
    if (path.startsWith("/auth/v1/token") && req.url().includes("refresh_token")) return json(SESSION);
    if (path.startsWith("/auth/v1/token")) {
      st.direct.push("token");
      return json({ error: "invalid_grant", error_description: "Invalid login credentials" }, 400);
    }
    if (path.startsWith("/auth/v1/otp") || path.startsWith("/auth/v1/recover")) { st.direct.push(path); return json({}); }
    if (path.startsWith("/auth/v1/user")) return json(USER);
    if (path.startsWith("/auth/v1/")) return json({});
    if (path.startsWith("/realtime/")) return route.abort();
    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.replace("/rest/v1/rpc/", "");
      if (fn === "registration_status") return json({ open: true, message: null });
      if (fn === "admin_registration_settings") return json({ open: true, message: null, changed_at: null, changed_by_name: null });
      if (fn === "my_account")
        return json({ status: "active", is_admin: true, permanent_admin: true, locale: null, display_name: "Øystein", privacy_version: 2, accepted_version: 2, created_at: "2026-09-01T10:00:00Z", country: "NO" });
      return json(null);
    }
    if (path.replace("/rest/v1/", "") === "schema_version") return json([{ version: VISUAL_SCHEMA_VERSION }]);
    return json([]);
  });
  await ctx.route("**/_serverFn/**", (route) => {
    const name = serverFnName(route.request().url());
    const body = route.request().postData() ?? "";
    const json = (result) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, context: {} }) });
    if (/^captchaConfig/.test(name)) return json(st.siteKey ? { enabled: true, siteKey: st.siteKey } : { enabled: false, siteKey: null });
    // Som serveren med Cloudflares hemmelige testnøkkel: testtokenet godkjennes (eller avvises når st.reject)
    const verdict = () => (!st.siteKey ? null : st.reject ? { ok: false, code: "captcha-invalid" } : body.includes(DUMMY) ? null : { ok: false, code: "captcha-missing" });
    for (const fn of ["requestSignupPass", "sendSignInLinkCaptcha", "sendPasswordResetCaptcha", "signInWithPasswordCaptcha"])
      if (name.startsWith(fn)) {
        st.calls.push({ fn, body });
        const v = verdict();
        if (v) return json(v);
        return json(fn === "signInWithPasswordCaptcha" ? { ok: true, session: { access_token: SESSION.access_token, refresh_token: "r" } } : { ok: true });
      }
    if (/fetchAdminOverview/.test(name)) return json({ ok: true, purged: 0, permanentEmail: "oystein@gutu.no", users: [], projects: [] });
    return json({ ok: false });
  });
}

const browser = await chromium.launch();
async function run(name, path, act, init = {}) {
  const st = { siteKey: PASS_SITE, reject: false, calls: [], direct: [], cloudflare: [], ...init };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 }, colorScheme: "dark" });
  await mock(ctx, st);
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(([k, v, l, s, f]) => {
    if (s) localStorage.setItem(k, v);
    localStorage.setItem("animatic:lang", l);
    if (f) localStorage.setItem("ptg:login-failures", f);
  }, [`sb-${ref}-auth-token`, JSON.stringify(SESSION), LANG, !!init.signedIn, init.failures ?? null]);
  try {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await act(page, st);
  } catch (e) {
    errors.push("act: " + String(e).split("\n")[0]);
    await page.screenshot({ path: `${out}/${name}-failed.png` }).catch(() => {});
  }
  check(errors.length === 0, `${name}: ingen kjørefeil ${errors.join(" | ").slice(0, 300)}`);
  await ctx.close();
}
const widgets = (page) => page.evaluate(() => window.__ts ?? []);
const until = async (fn, ms = 4000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return true; if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 100)); } };

async function fillSignup(page) {
  await page.getByTestId("auth-mode-toggle").click();
  await page.locator("#email").fill("ny@example.no");
  await page.locator("#password").fill("hemmelig-passord");
  await page.getByTestId("signup-country").click();
  await page.getByTestId("signup-country-option-NO").click();
  await page.getByTestId("signup-privacy").check();
}

await run("registrering-godkjent", "/konto", async (page, st) => {
  check((await page.getByTestId("captcha").count()) === 0, "innlogging uten tidligere feil: ingen CAPTCHA");
  await fillSignup(page);
  await page.getByTestId("captcha-widget").waitFor({ timeout: 8000 });
  await until(async () => (await widgets(page)).length > 0);
  const w = (await widgets(page)).at(-1);
  check(w?.sitekey === PASS_SITE && w?.action === "signup", "registrering: boksen bruker nettstedsnøkkelen og handlingen «signup»");
  check(w?.language === (LANG === "en" ? "en" : "nb") && w?.theme === "dark", `boksen følger språk (${w?.language}) og tema (${w?.theme})`);
  // Tastatur: man kan tabbe forbi boksen til knappen
  await page.getByTestId("signup-privacy").focus();
  let reached = false;
  for (let i = 0; i < 6 && !reached; i++) { await page.keyboard.press("Tab"); reached = await page.getByTestId("auth-submit").evaluate((el) => el === document.activeElement); }
  check(reached, "tastatur: «Opprett konto»-knappen nås med Tab forbi boksen");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  check(await until(() => st.direct.includes("signup")), "registreringen sendes etter godkjent CAPTCHA");
  check(st.calls.some((c) => c.fn === "requestSignupPass" && c.body.includes(DUMMY)), "serveren får tokenet før kontoen lages");
  check(st.calls.findIndex((c) => c.fn === "requestSignupPass") >= 0 && st.direct.indexOf("signup") >= 0, "passet hentes før signUp");
  check(st.cloudflare.every((u) => u.includes("/turnstile/v0/api.js")), "nettleseren henter bare Turnstile-skriptet fra Cloudflare (ingen siteverify)");
  await page.screenshot({ path: `${out}/registrering.png` });
});

await run("registrering-avvist", "/konto", async (page, st) => {
  await fillSignup(page);
  const failed = page.getByTestId("captcha-failed");
  await failed.waitFor({ timeout: 8000 });
  check((await failed.textContent())?.includes(FAILED), "avvist: rolig melding vises");
  const retry = page.getByTestId("captcha-retry");
  check((await retry.textContent())?.trim() === L("Prøv igjen", "Try again"), "avvist: «Prøv igjen» vises");
  await page.getByTestId("auth-submit").click();
  await page.waitForTimeout(500);
  check(!st.direct.includes("signup") && st.calls.length === 0, "avvist: ingen konto lages og serveren kalles ikke");
  const before = (await widgets(page)).length;
  await retry.focus();
  await page.keyboard.press("Enter");
  check(await until(async () => (await widgets(page)).length > before), "«Prøv igjen» med tastaturet lager en ny boks");
}, { siteKey: FAIL_SITE });

await run("server-avviser", "/konto", async (page, st) => {
  await fillSignup(page);
  await until(async () => (await widgets(page)).length > 0);
  await page.waitForTimeout(300);
  await page.getByTestId("auth-submit").click();
  check(await until(async () => ((await page.getByRole("alert").first().textContent()) ?? "").includes(FAILED)), "serveren avviser tokenet: rolig melding, aldri en teknisk feil");
  check(!st.direct.includes("signup"), "serveren avviser: ingen konto lages");
}, { reject: true });

await run("innloggingslenke", "/konto", async (page, st) => {
  await page.locator("#email").fill("oystein@gutu.no");
  await page.getByRole("button", { name: L("Send innloggingslenke", "Send sign-in link") }).click();
  check(await until(() => st.calls.some((c) => c.fn === "sendSignInLinkCaptcha" && c.body.includes(DUMMY)), 8000), "innloggingslenke: boksen vises og lenken sendes via serveren etter godkjenning");
  check((await widgets(page)).at(-1)?.action === "link", "innloggingslenke: handlingen «link»");
  check(!st.direct.some((d) => String(d).includes("/otp")), "innloggingslenke: ingen direkte kall fra nettleseren");
});

await run("glemt-passord", "/konto", async (page, st) => {
  await page.locator("#email").fill("oystein@gutu.no");
  await page.getByRole("button", { name: L("Glemt passord?", "Forgot password?") }).click();
  check(await until(() => st.calls.some((c) => c.fn === "sendPasswordResetCaptcha" && c.body.includes(DUMMY)), 8000), "«Glemt passord»: CAPTCHA og sending via serveren");
  check((await widgets(page)).at(-1)?.action === "reset", "«Glemt passord»: handlingen «reset»");
});

await run("innlogging-etter-3-feil", "/konto", async (page, st) => {
  await page.locator("#email").fill("oystein@gutu.no");
  await page.locator("#password").fill("feil-passord");
  for (let i = 1; i <= 3; i++) {
    check((await page.getByTestId("captcha").count()) === 0, `forsøk ${i}: ingen CAPTCHA`);
    await page.getByTestId("auth-submit").click();
    await until(() => st.direct.filter((d) => d === "token").length >= i);
    await page.waitForTimeout(300);
  }
  check(st.direct.filter((d) => d === "token").length === 3, "tre feilede forsøk gikk direkte");
  await page.getByTestId("captcha-widget").waitFor({ timeout: 8000 });
  check((await widgets(page)).at(-1)?.action === "login", "etter 3 feil: CAPTCHA på innloggingen");
  await page.waitForTimeout(300);
  await page.getByTestId("auth-submit").click();
  check(await until(() => st.calls.some((c) => c.fn === "signInWithPasswordCaptcha" && c.body.includes(DUMMY))), "4. forsøk: passordet kontrolleres via serveren med CAPTCHA");
  check(st.direct.filter((d) => d === "token").length === 3, "4. forsøk går ikke direkte");
  check(await until(async () => (await page.getByTestId("auth-submit").count()) === 0, 6000), "godkjent innlogging nullstiller og logger inn");
  check(await page.evaluate(() => localStorage.getItem("ptg:login-failures") === null), "telleren nullstilles etter innlogging");
});

await run("telleren-husket", "/konto", async (page) => {
  await page.getByTestId("captcha-widget").waitFor({ timeout: 8000 });
  check(true, "telleren følger nettleseren: CAPTCHA vises straks etter 3 tidligere feil");
}, { failures: "3" });

await run("uten-nokkel", "/konto", async (page, st) => {
  await fillSignup(page);
  await page.waitForTimeout(400);
  check((await page.getByTestId("captcha").count()) === 0, "uten nøkkel: ingen CAPTCHA-boks");
  await page.getByTestId("auth-submit").click();
  check(await until(() => st.direct.includes("signup")), "uten nøkkel: registrering virker (serveren utsteder pass uten kontroll)");
  check(st.cloudflare.length === 0, "uten nøkkel: ingenting lastes fra Cloudflare");
}, { siteKey: null });

await run("admin-varsel", "/admin", async (page) => {
  const w = page.getByTestId("admin-captcha-off");
  await w.waitFor({ timeout: 20000 });
  check((await w.textContent())?.includes(L("Robotkontroll er av.", "Robot check is off.")), "adminsiden: tydelig varsel når nøkkelen mangler");
  await page.screenshot({ path: `${out}/admin.png` });
}, { siteKey: null, signedIn: true });

await run("admin-pa", "/admin", async (page) => {
  await page.getByTestId("admin-captcha-on").waitFor({ timeout: 20000 });
  check((await page.getByTestId("admin-captcha-off").count()) === 0, "adminsiden: ingen varsel når CAPTCHA er på");
}, { signedIn: true });

await run("personvern", "/personvern", async (page) => {
  const p = page.getByTestId("privacy-turnstile");
  await p.waitFor({ timeout: 15000 });
  const txt = (await p.textContent()) ?? "";
  check(txt.includes("Cloudflare Turnstile") && txt.includes(L("IP-adresse", "IP address")), "personvern: Turnstile som tredjepart, formål og data");
});

console.log(`RESULTAT ${pass} bestått, ${fail} feilet`);
await browser.close();
process.exitCode = fail ? 1 : 0;
