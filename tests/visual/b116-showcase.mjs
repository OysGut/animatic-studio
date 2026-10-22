/**
 * Nettlesertest for B-116: utstillingsvindu. Bryteren av → ingenting synes; på → boks på prosjektlisten,
 * oppretting med forhåndsvisning, «Mine delinger», kommentarer, adminkø og karusell på innloggingssiden
 * uten å flytte innloggingsboksen. nb og en. Mocker backend; ingenting endres.
 *   ENV_FILE=…/.env node tests/visual/b116-showcase.mjs [baseUrl] [utmappe]
 */
import { chromium } from "playwright";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { uiLang, byLang } from "./ui-lang.mjs";
import { readFileSync, mkdirSync } from "node:fs";
const [base = "http://127.0.0.1:8080", out = "/tmp/b116-showcase"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const env = readFileSync(process.env.ENV_FILE ?? ".env", "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const USER = { id: "00000000-0000-7000-8000-a11ce0000001", email: "oystein@gutu.no", aud: "authenticated", role: "authenticated" };
const PROJECT = { id: "11111111-1111-4111-8111-111111111111", name: "Jula på Dovre", created_at: "2026-01-01T00:00:00Z", project_members: [{ user_id: USER.id, role: "owner", removed_at: null }] };
const FEED_ITEM = { id: "feed-1", kind: "character", title: "Reven", text: "Hovedpersonen.", excerpt: null, storage_key: null, mime: null, duration_ms: null, width: null, height: null, created_at: "2026-10-20T00:00:00Z", author_name: "Anita", url: null };
const MY_ITEM = { ...FEED_ITEM, id: "mine-1", project_id: PROJECT.id, project_name: PROJECT.name, status: "pending", expires_at: "2026-10-29T00:00:00Z", storage_key: null };
const RPC = [];

async function mock(ctx, st) {
  await ctx.route(`${supaUrl}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (path.startsWith("/auth/v1/user")) return json(USER);
    if (path.startsWith("/auth/v1/")) return json({});
    if (path.startsWith("/realtime/")) return route.abort();
    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.replace("/rest/v1/rpc/", "");
      const body = JSON.parse(req.postData() ?? "{}");
      RPC.push({ fn, body });
      if (fn === "my_account") return json({ status: "active", is_admin: st.admin, permanent_admin: st.admin, locale: st.lang, display_name: "Øystein", privacy_version: 2, accepted_version: 2, created_at: "2026-09-01T10:00:00Z" });
      if (fn === "my_features") return json(Object.fromEntries(Object.entries(st.features)));
      if (fn === "my_showcase_items") return json(st.mine);
      if (fn === "showcase_comments") return json(st.comments);
      if (fn === "add_showcase_comment") { st.comments.push({ id: "c-new", text: body.p_text, created_at: "2026-10-22T10:00:00Z", author_name: "Øystein", mine: true }); return json("c-new"); }
      if (fn === "report_content") { st.reports.push(body); return json(null); }
      if (fn === "revoke_showcase_item") { st.mine = st.mine.map((m) => ({ ...m, status: "revoked" })); return json(null); }
      if (fn === "update_showcase_item") { st.mine = st.mine.map((m) => ({ ...m, title: body.p_patch.title ?? m.title })); return json(null); }
      if (fn === "admin_showcase_queue") return json({ require_approval: true, items: [{ ...MY_ITEM, author_name: "Anita" }] });
      if (fn === "admin_review_showcase_item") { st.reviewed = body; return json(null); }
      if (fn === "admin_set_showcase_approval") { st.approval = body.p_required; return json(null); }
      if (fn === "set_my_public_profile") { st.profile = body; return json(null); }
      if (fn === "registration_status") return json({ open: true });
      if (fn === "project_lock_info") return json({ lock: null });
      return json(null);
    }
    const table = path.replace("/rest/v1/", "").split("?")[0];
    if (table === "schema_version") return json([{ version: VISUAL_SCHEMA_VERSION }]);
    if (table === "projects") return json([PROJECT]);
    if (table === "assets") return json([{ id: "asset-1", kind: "character", name: "Reven", asset_variants: [{ asset_versions: [{ media_path: `${PROJECT.id}/source/rev.png`, mime_type: "image/png", number: 1, removed: false, duration_ms: null, width: 800, height: 600 }] }] }]);
    return json([]);
  });
  await ctx.route("**/_serverFn/**", (route) => {
    const json = (result) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, context: {} }) });
    try {
      const name = JSON.parse(Buffer.from(decodeURIComponent(new URL(route.request().url()).pathname.split("/_serverFn/")[1]), "base64url").toString("utf8")).export;
      if (/getShowcaseFeed/.test(name)) return json(st.feed);
      if (/createShowcaseItem/.test(name)) { st.created = true; return json({ id: "new-1", status: "pending" }); }
      if (/getMyShowcaseProfile/.test(name)) return json({ handle: "oystein", displayName: "Øystein", bio: "", avatarUrl: null, isPublic: false });
      if (/fetchAdminOverview/.test(name)) return json({ ok: true, purged: 0, permanentEmail: USER.email, users: [], projects: [] });
      if (/fetchAiUsage/.test(name)) return json({ ok: true, rows: [], projectNames: {}, userNames: {} });
      if (/fetchUsdNokRates/.test(name)) return json({ ok: true, rates: [] });
    } catch { /* ukjent */ }
    return route.abort();
  });
  await ctx.route(`${supaUrl}/storage/v1/**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }));
}

const browser = await chromium.launch();
let pass = 0, fail = 0;
const check = (ok, text) => { console.log(`  ${ok ? "ok" : "FEIL"} ${text}`); ok ? pass++ : fail++; };
const freshState = (over = {}) => ({
  admin: false, lang: "nb", features: { "community.public": false, "community.profiles": false },
  mine: [], comments: [], reports: [], feed: [], ...over,
});

async function run(name, path, act, { lang = "nb", signedIn = true, ...state } = {}) {
  lang = uiLang(lang);
  const st = freshState({ lang, ...state });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  await mock(ctx, st);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const exp = Math.floor(Date.now() / 1000) + 86400;
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v, l, id]) => {
    localStorage.setItem("animatic:lang", l);
    if (v) {
      localStorage.setItem(k, v);
      localStorage.setItem(`animatic:lang:${id}`, l);
    }
  }, [`sb-${ref}-auth-token`, signedIn ? JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: USER }) : null, lang, USER.id]);
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  try { await act(page, st); } catch (e) { errors.push("act: " + e.message); fail++; }
  check(errors.length === 0, `${name}: ingen sidefeil${errors.length ? " – " + errors.join(" | ").slice(0, 400) : ""}`);
  await ctx.close();
}

const ON = { "community.public": true, "community.profiles": true };

await run("b116-bryter-av", "/", async (page) => {
  check((await page.getByTestId("showcase-box").count()) === 0, "boksen er skjult når bryteren er av");
  check((await page.getByTestId("showcase-carousel").count()) === 0, "ingen karusell uten bidrag");
});

await run("b116-boks-og-oppretting", "/", async (page, st) => {
  const box = page.getByTestId("showcase-box");
  check(await box.isVisible(), "boksen vises på prosjektlisten");
  check((await box.innerText()).includes(byLang("nb", "Vil du vise frem litt av hva du jobber med?", "Want to show a little of what you're working on?")), "tittel på valgt språk");
  await page.getByTestId("showcase-share-open").click();
  await page.getByTestId("showcase-kind-character").click();
  await page.getByTestId("showcase-candidate-asset-1").click();
  await page.getByTestId("showcase-title").fill("Reven");
  check(await page.getByTestId("showcase-preview").isEnabled(), "forhåndsvisning aktiveres når utkastet er gyldig");
  await page.getByTestId("showcase-preview").click();
  const card = await page.getByTestId("showcase-preview-card").innerText();
  check(card.includes("Reven"), "forhåndsvisningen viser bidraget som i karusellen");
  await page.getByTestId("showcase-submit").click();
  await page.waitForTimeout(1200);
  check(st.created === true, "bidraget opprettes via serverfunksjonen");
  check((await page.getByTestId("showcase-create").innerText()).includes(byLang("nb", "venter på godkjenning", "waiting for approval")), "melding om godkjenning");
  await page.screenshot({ path: `${out}/b116-01-oppretting.png` });
}, { features: ON });

await run("b116-manusutdrag-advarsel", "/", async (page) => {
  await page.getByTestId("showcase-share-open").click();
  await page.getByTestId("showcase-kind-script").click();
  check(await page.getByTestId("showcase-excerpt").isVisible(), "utdragsfelt for manus");
  check(!(await page.getByTestId("showcase-preview").isEnabled()), "kan ikke gå videre uten utdrag");
  await page.getByTestId("showcase-excerpt").fill("REVEN: God jul!");
  await page.getByTestId("showcase-title").fill("Åpningen");
  await page.getByTestId("showcase-preview").click();
  check(await page.getByTestId("showcase-script-warning").isVisible(), "ekstra advarsel om offentlig tekst ved forhåndsvisning");
}, { features: ON });

await run("b116-mine-delinger", "/delinger", async (page) => {
  check((await page.getByTestId("showcase-mine").innerText()).includes(byLang("nb", "Mine delinger", "My shares")), "siden vises");
  check((await page.getByTestId("showcase-status-mine-1").innerText()).includes(byLang("nb", "Venter godkjenning", "Awaiting approval")), "status «venter godkjenning»");
  await page.getByTestId("showcase-revoke-mine-1").click();
  check((await page.getByTestId("showcase-revoke-dialog").innerText()).includes(byLang("nb", "forsvinner fra karusellen", "disappears from the carousel")), "bekreftelse før tilbaketrekking");
  await page.screenshot({ path: `${out}/b116-02-mine.png` });
}, { features: ON, mine: [MY_ITEM] });

await run("b116-kommentarer", "/", async (page, st) => {
  await page.getByTestId("showcase-comments-toggle").click();
  check((await page.getByTestId("showcase-comments").innerText()).includes("Fin rev!"), "kommentaren vises");
  await page.getByTestId("showcase-comment-input").fill("Supert!");
  await page.getByTestId("showcase-comment-submit").click();
  await page.waitForTimeout(1000);
  check(st.comments.some((c) => c.text === "Supert!"), "kommentaren lagres");
  await page.getByTestId("report-item-feed-1").click();
  await page.waitForTimeout(800);
  check(st.reports.some((r) => r.p_kind === "showcase" && r.p_target === "feed-1"), "bidraget rapporteres");
}, { features: ON, feed: [FEED_ITEM], comments: [{ id: "c1", text: "Fin rev!", created_at: "2026-10-21T00:00:00Z", author_name: "Bo", mine: false }] });

await run("b116-innlogging-uendret", "/", async (page) => {
  const form = await page.locator("form").boundingBox();
  const dock = await page.getByTestId("showcase-carousel-dock").boundingBox();
  check(!!form && !!dock, "innloggingsboks og karusell finnes samtidig");
  if (form && dock) {
    check(form.y + form.height <= dock.y, "karusellen ligger under og overlapper ikke innloggingsboksen");
    check(Math.abs(form.x + form.width / 2 - 640) < 5, "innloggingsboksen er fortsatt sentrert");
  }
  check((await page.getByTestId("showcase-comments").count()) === 0, "utlogget ser ikke kommentarfelt før utvidelse");
  await page.getByTestId("showcase-comments-toggle").click();
  check((await page.getByTestId("showcase-comments").innerText()).includes(byLang("nb", "Logg inn for å kommentere", "Sign in to comment")), "utlogget kan ikke kommentere");
  await page.screenshot({ path: `${out}/b116-03-innlogging.png` });
}, { signedIn: false, feed: [FEED_ITEM], comments: [{ id: "c1", text: "Fin rev!", created_at: "2026-10-21T00:00:00Z", author_name: "Bo", mine: false }] });

await run("b116-admin", "/admin", async (page, st) => {
  const sec = page.getByTestId("admin-showcase");
  check(await sec.isVisible(), "adminkøen vises");
  check((await sec.innerText()).includes("Reven"), "ventende bidrag i køen");
  await page.getByTestId("admin-showcase-approve-mine-1").click();
  await page.waitForTimeout(1000);
  check(st.reviewed?.p_approve === true, "godkjenning sendes");
  await page.screenshot({ path: `${out}/b116-04-admin.png` });
}, { admin: true, features: ON });

await run("b116-en", "/", async (page) => {
  const t = await page.getByTestId("showcase-box").innerText();
  for (const s of [byLang("en", "Vil du vise frem litt av hva du jobber med?", "Want to show a little of what you're working on?"), byLang("en", "Del noe", "Share something"), byLang("en", "Mine delinger", "My shares")]) check(t.includes(s), `språk: «${s}»`);
  await page.getByTestId("showcase-share-open").click();
  await page.getByTestId("showcase-kind-script").click();
  await page.getByTestId("showcase-excerpt").fill("FOX: Merry Christmas!");
  await page.getByTestId("showcase-title").fill("Opening");
  await page.getByTestId("showcase-preview").click();
  check((await page.getByTestId("showcase-script-warning").innerText()).includes(byLang("en", "blir offentlig", "becomes public")), "advarsel om offentlig tekst på valgt språk");
  await page.screenshot({ path: `${out}/b116-05-en.png` });
}, { lang: "en", features: ON });

console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
await browser.close();
process.exit(fail ? 1 : 0);
