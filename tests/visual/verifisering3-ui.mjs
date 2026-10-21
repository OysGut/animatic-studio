/**
 * Visuell og automatisk kontroll av grensesnittkrav (DEC-0075). Dokumentert i
 * docs/development/VISUAL_QA_DEC-0075.md.
 *
 *   REQ-0013  Kreativt verktøy, ikke chatbot: ingen chatflate; AI-handlingene ligger i arbeidsflatene.
 *   REQ-0014  Norsk grensesnitt: synlig tekst, aria-label, title, placeholder og alt på sidene og i dialoger.
 *   REQ-0101  «Følg avspillingen»: av = manuset står stille mens markeringen oppdateres; på = følger.
 *   REQ-0119  Oversikten → scenen åpnes valgt i manuset.
 *   REQ-0168  Sceneeditoren fra hovedmenyen, oversikten, monteringen og manuset (med valgt scene).
 *   REQ-0175  Maske på et lag (piksler i Chromium): bare maskens område vises; kildebildet er uendret.
 *   REQ-0243  «Generer scene» i scenevisningen (monteringen) åpner genereringsflyten.
 *   REQ-0405  Hovedoversikten viser de ti nøkkeltallene og oppdateres når data endres.
 *   REQ-0424  Samme designsystem: fonter, minste skriftstørrelse, tekstfarger fra tokenene, kontrast
 *             (WCAG AA) i de faktiske sidene, tilgjengelige navn på kontroller, synlig fokus.
 *   REQ-0426  Ikke leketøy/AI-demo: ingen emoji, gradienter, «gnist»-ikoner, pilleknapper eller store radier.
 *   REQ-0427/0428  De 14 hovedområdene nås fra hovedmenyen eller en logisk overordnet visning, med tastatur.
 *
 * Supabase-svarene mockes som i screens.mjs (ingen ekte tjenester). Lagringen (runCommand) får aldri svar,
 * så endringer står igjen lokalt (som i interactions-e2e.mjs).
 *
 *   ENV_FILE=…/.env node verifisering3-ui.mjs <baseUrl> <fixture.json> [utmappe]
 * Skjermbilder lagres i utmappen (standard /tmp/claude-0/qa75). Avslutter med kode 1 hvis en kontroll feiler.
 */
import { chromium } from "playwright";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { readFileSync, mkdirSync } from "node:fs";
import { uiLang } from "./ui-lang.mjs";

const [
  base = "http://127.0.0.1:5173",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/qa75",
] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE ?? new URL("../../.env", import.meta.url), "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
// Designtokenene: styles.css ved siden av .env (skriptet kjøres ofte som kopi fra en annen mappe)
const STYLES = readFileSync(
  process.env.ENV_FILE
    ? process.env.ENV_FILE.replace(/[^/]*$/, "src/styles.css")
    : new URL("../../src/styles.css", import.meta.url),
  "utf8",
);
// ID3: UI_LANG=en kjører hele suiten på engelsk. T slår opp den engelske teksten for en norsk grensesnitttekst i
// språkkatalogene (samme nøkkel); R velger mellom to uttrykk. Brukerens eget innhold (Maja, Stua …) oversettes ikke.
const LANG = uiLang("nb");
const catalog = (l) =>
  JSON.parse(
    readFileSync(
      process.env.ENV_FILE
        ? process.env.ENV_FILE.replace(/[^/]*$/, `src/core/i18n/locales/${l}.json`)
        : new URL(`../../src/core/i18n/locales/${l}.json`, import.meta.url),
      "utf8",
    ),
  );
const NB_CAT = LANG === "en" ? catalog("nb") : null;
const EN_CAT = LANG === "en" ? catalog("en") : null;
// Ord med flere engelske oversettelser: den som brukes på stedet testen ser på
const EN_FIXED = { Pause: "Pause", Lag: "Layers", Spor: "Tracks", "Åpne i sceneeditoren": "Open in scene editor", Dialog: "Dialogue" };
const T = (nb) => {
  if (LANG !== "en") return nb;
  if (nb in EN_FIXED) return EN_FIXED[nb];
  for (const [k, v] of Object.entries(NB_CAT)) if (v?.text === nb && EN_CAT[k]?.text) return EN_CAT[k].text;
  throw new Error(`Mangler engelsk tekst for «${nb}»`);
};
const R = (nb, en) => (LANG === "en" ? en : nb);
const USER = {
  id: "00000000-0000-7000-8000-a11ce0000001",
  email: "mars@example.no",
  aud: "authenticated",
  role: "authenticated",
};
const project = fx.project;
const P = `/prosjekt/${project.id}`;
const ONLY = process.env.ONLY?.split(",");

// ---------- Resultater ----------

const results = [];
function check(req, name, ok, detail = "") {
  results.push({ req, name, ok: !!ok, detail });
  console.log(`${ok ? "  OK  " : "  FEIL"} [${req}] ${name}${detail ? ` – ${detail}` : ""}`);
}

// ---------- Mock og side ----------

async function mock(ctx) {
  await ctx.route(`${supaUrl}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
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
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="hsl(${n} 25% 22%)"/><circle cx="150" cy="120" r="60" fill="hsl(${n} 45% 70%)"/></svg>`;
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
    }
    const table = path.replace("/rest/v1/", "");
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
    if (fx.rows[table] && single) return json(fx.rows[table][0] ?? null);
    if (fx.rows[table]) {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      return json(offset > 0 ? [] : fx.rows[table]);
    }
    return json([]);
  });
}

const browser = await chromium
  .launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" })
  .catch(() => chromium.launch());

async function openPage(path, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: "dark" });
  await mock(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on(
    "console",
    (m) => m.type() === "error" && !/WebSocket connection/.test(m.text()) && errors.push(m.text()),
  );
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
      LANG,
    ],
  );
  // Lagringen henger (ingen svar): lokale endringer står igjen
  await page.route("**/_serverFn/**", (route) => {
    const body = route.request().postData() ?? "";
    if (body.includes("command")) return undefined;
    return route.continue();
  });
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  return { ctx, page, errors };
}

const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });

// ---------- Gjennomgang av en side (fonter, farger, kontrast, språk, navn, uttrykk) ----------

/** CSS-variablene i styles.css (designtokenene). */
const TOKEN_NAMES = [...new Set([...STYLES.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))];

const ENGLISH =
  /\b(Close|Cancel|Save|Delete|Remove|Loading|Search|Settings|Submit|Next|Previous|Back|More|Edit|Upload|Download|Error|Untitled|Toggle|Select|Menu|Sidebar|Breadcrumb|Dismiss|Undo|Redo|Play|Pause|Open|Show|Hide|Add|New|Copy|Help|Yes|Done|Retry|Continue|Confirm|Apply|Reset|Clear|Rename|Duplicate|Preview|Go to|Toggle Sidebar|More pages|Previous slide|Next slide)\b/;

// Med UI_LANG=en: norske grensesnittord som ikke skal stå igjen (samme kontroll, motsatt språk)
const NORWEGIAN =
  /(?<![\p{L}])(Lukk|Avbryt|Lagre|Slett|Fjern|Laster|Søk|Innstillinger|Neste|Forrige|Tilbake|Rediger|Last opp|Last ned|Feil|Uten tittel|Velg|Meny|Angre|Gjør om|Spill av|Åpne|Vis|Skjul|Legg til|Kopier|Hjelp|Ferdig|Prøv igjen|Fortsett|Bekreft|Tilbakestill|Gi nytt navn|Dupliser|Forhåndsvis)(?![\p{L}])/u;

async function auditPage(page) {
  return page.evaluate(
    ({ tokenNames, english }) => {
      const EN = new RegExp(english.source, english.flags ?? "");
      const probe = document.createElement("span");
      document.body.appendChild(probe);
      const tokenRgb = new Set();
      for (const n of tokenNames) {
        probe.style.color = "";
        probe.style.color = `var(${n})`;
        const c = getComputedStyle(probe).color;
        const m = /rgba?\(([^)]+)\)/.exec(c);
        if (m)
          tokenRgb.add(
            m[1]
              .split(",")
              .slice(0, 3)
              .map((x) => Math.round(parseFloat(x)))
              .join(","),
          );
      }
      probe.remove();
      const parse = (c) => {
        const m = /rgba?\(([^)]+)\)/.exec(c);
        if (!m) return null;
        const p = m[1]
          .split(/[ ,/]+/)
          .filter(Boolean)
          .map(parseFloat);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      };
      const lum = ({ r, g, b }) => {
        const f = (v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const over = (top, bottom) => ({
        r: top.r * top.a + bottom.r * (1 - top.a),
        g: top.g * top.a + bottom.g * (1 - top.a),
        b: top.b * top.a + bottom.b * (1 - top.a),
        a: 1,
      });
      const APP = { r: 15, g: 16, b: 18, a: 1 };
      /** Bakgrunnen bak elementet (lagene ovenfra og ned), eller null over bilde/video/lerret. */
      const bgOf = (el) => {
        const layers = [];
        for (let e = el; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.backgroundImage !== "none" && !/repeating-conic/.test(cs.backgroundImage))
            return null;
          if (["IMG", "VIDEO", "CANVAS"].includes(e.tagName)) return null;
          const c = parse(cs.backgroundColor);
          if (c && c.a > 0) {
            layers.push(c);
            if (c.a >= 1) break;
          }
        }
        let acc = APP;
        for (const c of layers.reverse()) acc = over(c, acc);
        return acc;
      };
      const opacityOf = (el) => {
        let o = 1;
        for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
        return o;
      };
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth)
          return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") return false;
        if (el.closest("[aria-hidden=true], .sr-only")) return false;
        return true;
      };
      const describe = (el) => {
        const t = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
        return `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[aria-label="${el.getAttribute("aria-label")}"]` : ""}${t ? ` «${t}»` : ""}`;
      };
      const isContent = (el) =>
        !!el.closest(
          "textarea, pre, code, [contenteditable=true], [data-block], [data-script-page], canvas, svg",
        );
      // Materialet (ikke grensesnittet): plakater (SVG) og manussidene, som vises i sidens målestokk
      const material = (el) => !!el.closest('svg, section[aria-label^="Side "]');
      const disabled = (el) => !!el.closest("[disabled], [aria-disabled=true], :disabled");

      const out = {
        fonts: [],
        small: [],
        colors: [],
        contrast: [],
        english: [],
        emoji: [],
        gradients: [],
        sparkles: 0,
        sparkleWhere: [],
        radius: [],
        unnamed: [],
        docScroll: Math.max(0, document.scrollingElement.scrollHeight - innerHeight),
        lang: document.documentElement.lang,
        textCount: 0,
      };
      const FONTS = /^"?(Inter Variable|Inter|JetBrains Mono|Courier Prime)"?/;
      for (const el of document.querySelectorAll("body *")) {
        if (!visible(el)) continue;
        const cs = getComputedStyle(el);
        const ownText = [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join("")
          .trim();
        if (ownText) {
          out.textCount++;
          if (!material(el) && !FONTS.test(cs.fontFamily))
            out.fonts.push(`${describe(el)}: ${cs.fontFamily}`);
          if (!material(el) && parseFloat(cs.fontSize) < 11)
            out.small.push(`${describe(el)}: ${cs.fontSize}`);
          const c = parse(cs.color);
          if (c && !tokenRgb.has([c.r, c.g, c.b].map(Math.round).join(",")))
            out.colors.push(`${describe(el)}: ${cs.color}`);
          if (/\p{Extended_Pictographic}/u.test(ownText)) out.emoji.push(describe(el));
          if (!isContent(el) && EN.test(ownText))
            out.english.push(`${describe(el)}: «${ownText.match(EN)[0]}»`);
          // Kontrast i det som faktisk vises (gjennomsiktighet tas med); deaktiverte kontroller er unntatt
          if (c && !disabled(el)) {
            const bg = bgOf(el);
            if (bg) {
              const fg = over({ ...c, a: c.a * opacityOf(el) }, bg);
              const L1 = lum(fg);
              const L2 = lum(bg);
              const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
              const size = parseFloat(cs.fontSize);
              const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight) >= 700);
              if (ratio < (large ? 3 : 4.5))
                out.contrast.push(`${describe(el)}: ${ratio.toFixed(2)}:1`);
            }
          }
        }
        for (const a of ["aria-label", "title", "placeholder", "alt"]) {
          const v = el.getAttribute(a);
          if (v && EN.test(v)) out.english.push(`${describe(el)} ${a}=«${v}»`);
        }
        // Unntak: rutemønster bak gjennomsiktige bilder, og kamerautsnittet på tidslinjen (blå start → rød
        // slutt, samme betydning som rammene på lerretet, DESIGN_SYSTEM §2.5)
        if (
          /gradient\(/.test(cs.backgroundImage) &&
          !/repeating-conic-gradient/.test(cs.backgroundImage) &&
          !/^(Kamerautsnitt|Camera shot) /.test(el.getAttribute("aria-label") ?? "")
        )
          out.gradients.push(`${describe(el)}: ${cs.backgroundImage.slice(0, 60)}`);
        const r = el.getBoundingClientRect();
        const rad = parseFloat(cs.borderTopLeftRadius) || 0;
        const round = Math.abs(r.width - r.height) < 2;
        const control = el.matches("button, a, [role=button]");
        if (rad > 8 && !round && !el.matches("[role=switch], [role=slider], input[type=range]"))
          if (rad < Math.min(r.width, r.height) / 2 - 1 || control)
            out.radius.push(
              `${describe(el)}: ${cs.borderTopLeftRadius} (${Math.round(r.width)}×${Math.round(r.height)})`,
            );
        if (
          el.matches("button, a[href], [role=button], input:not([type=hidden]), select, textarea")
        ) {
          const name =
            el.getAttribute("aria-label") ||
            (el.getAttribute("aria-labelledby") &&
              document.getElementById(el.getAttribute("aria-labelledby"))?.textContent) ||
            el.getAttribute("title") ||
            (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
            el.closest("label")?.textContent ||
            el.textContent ||
            el.getAttribute("placeholder") ||
            el.getAttribute("alt") ||
            el.querySelector("img[alt]")?.getAttribute("alt");
          if (!name || !name.trim()) out.unnamed.push(describe(el));
        }
      }
      const sparks = [
        ...document.querySelectorAll(
          "svg.lucide-sparkles, svg.lucide-sparkle, svg.lucide-wand-sparkles",
        ),
      ].filter((s) => s.getBoundingClientRect().width > 0);
      out.sparkles = sparks.length;
      out.sparkleWhere = sparks.map((s) =>
        describe(s.closest("button, a, h1, h2, h3, h4, li, p") ?? s),
      );
      return out;
    },
    { tokenNames: TOKEN_NAMES, english: { source: (LANG === "en" ? NORWEGIAN : ENGLISH).source, flags: LANG === "en" ? "u" : "" } },
  );
}

/** Samler funn fra flere sider/dialoger per kategori. */
const audits = [];
async function audited(page, where) {
  const a = await auditPage(page);
  audits.push({ where, ...a });
  return a;
}

const short = (list, n = 4) =>
  list.length ? `${list.length}: ${list.slice(0, n).join(" | ")}` : "";

// ---------- 1. Hovedområdene (REQ-0427, REQ-0428, REQ-0013) og gjennomgang av sidene ----------

async function testAreas() {
  const { ctx, page, errors } = await openPage(P);
  try {
    const nav = page.getByRole("navigation", { name: T("Arbeidsflater") });
    const links = await nav.getByRole("link").allInnerTexts();
    check(
      "REQ-0427",
      "hovedmenyen har sju arbeidsflater",
      links.map((x) => x.trim()).join("|") ===
        ["Prosjektoversikt", "Manus", "Story Lab", "Ressursbibliotek", "Sceneeditor", "Montering", "Utgivelse"].map(T).join("|"),
      links.join(", "),
    );
    check(
      "REQ-0013",
      "ingen chat- eller assistentflate i menyen",
      !links.some((l) => /chat|assistent|spør|AI/i.test(l)),
      links.join(", "),
    );

    const go = async (label) => {
      await nav.getByRole("link", { name: label }).click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1200);
    };
    const has = async (locator) => (await locator.count()) > 0;
    const areas = [];
    const area = (n, name, ok, how) => {
      areas.push({ n, name, ok });
      check("REQ-0427", `${n}. ${name}`, ok, how);
    };

    // Prosjektoversikten (1, 2, 5, 9, 10, 14)
    await go(T("Prosjektoversikt"));
    await shot(page, "v3-01-oversikt");
    await audited(page, "Prosjektoversikt");
    area(
      1,
      "Prosjektoversikt",
      await has(page.getByRole("heading", { name: project.name })),
      "meny → Prosjektoversikt",
    );
    area(
      2,
      "Produksjonsvelger",
      await has(page.getByRole("heading", { name: T("Produksjoner") })),
      "oversikten: «Produksjoner» med «Ny produksjon …»; velger i manus og montering",
    );
    area(
      5,
      "Karakterkontinuitet",
      await has(page.getByRole("heading", { name: R(/Kontinuitetsanalyse/, /Continuity analysis/) })),
      "oversikten: «Kontinuitetsanalyse»; biblioteket: kontinuitet per ressurs",
    );
    area(
      14,
      "Prosjektinnstillinger",
      (await has(page.getByRole("heading", { name: T("Bildeformat og bildefrekvens") }))) &&
        (await has(page.getByRole("heading", { name: T("Medlemmer") }))),
      "oversikten: format, bildefrekvens, medlemmer",
    );
    const jobs = page.getByRole("heading", { name: T("AI-budsjett og jobber") });
    area(
      10,
      "Renderingskø",
      await has(jobs),
      "oversikten: «AI-budsjett og jobber» med kø og status",
    );
    if (await has(jobs)) {
      await jobs.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot(page, "v3-02-oversikt-jobber");
      await audited(page, "Prosjektoversikt (AI-jobber)");
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    // Manus (3, 13)
    await go(T("Manus"));
    await shot(page, "v3-03-manus");
    await audited(page, "Manus");
    area(3, "Manus", (await page.locator("[id^=nav-]").count()) > 0, "meny → Manus");
    const prodSelect = page
      .locator("select")
      .filter({ has: page.locator("option", { hasText: "Majas jul" }) });
    const exportBtn = page.getByRole("button", { name: T("Eksporter") }).first();
    area(
      13,
      "Eksport",
      await has(exportBtn),
      "manus: «Eksporter» (PDF/DOCX); montering: «Eksporter animatic»",
    );
    if (await has(exportBtn)) {
      await exportBtn.click();
      await page.waitForTimeout(500);
      await shot(page, "v3-04-manus-eksport");
      await audited(page, "Manus – eksportdialog");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    // Ressursbibliotek (4)
    await go(T("Ressursbibliotek"));
    await shot(page, "v3-05-bibliotek");
    await audited(page, "Ressursbibliotek");
    area(
      4,
      "Ressursbibliotek",
      page.url().includes("/bibliotek") && (await has(page.getByText("Maja").first())),
      "meny → Ressursbibliotek",
    );

    // Sceneeditor (6, 7)
    await go(T("Sceneeditor"));
    await shot(page, "v3-06-sceneeditor");
    await audited(page, "Sceneeditor");
    area(
      6,
      "Sceneeditor",
      await has(page.getByRole("region", { name: T("Lag") })),
      "meny → Sceneeditor",
    );
    area(
      7,
      "Kamera og tidslinje",
      (await has(page.getByRole("button", { name: T("Kamera"), exact: true }))) &&
        (await has(page.getByText(T("Spor"), { exact: true }))),
      "sceneeditoren: «Kamera» og tidslinjen med spor",
    );

    // Montering (8, 9, 11, 13)
    await go(T("Montering"));
    area(11, "Overordnet filmmontering", page.url().includes("/montering"), "meny → Montering");
    area(
      2,
      "Produksjonsvelger (i monteringen)",
      (await prodSelect.count()) > 0,
      "velger «Hovedfilm / Majas jul – kortversjon»",
    );
    await page
      .getByRole("button", { name: /^Scene 1: / })
      .first()
      .click();
    await page.waitForTimeout(500);
    await shot(page, "v3-07-montering");
    await audited(page, "Montering");
    area(
      8,
      "Lyd og dialog",
      (await has(page.getByText(T("Dialog"), { exact: true }).first())) &&
        (await has(page.getByRole("button", { name: R(/Dialog med AI-stemmer/, /Dialogue with AI voices/) }))),
      "monteringen: lydspor (Dialog, Forteller, Effekter …) og «Dialog med AI-stemmer …»",
    );
    area(
      9,
      "AI-generering",
      await has(page.getByRole("button", { name: R(/Generer scene/, /Generate scene/) })),
      "monteringen: «Generer scene …», «Video for flere scener»; biblioteket: «Lag bilde/lyd med AI»",
    );
    area(
      13,
      "Eksport (i monteringen)",
      await has(page.getByRole("button", { name: R(/Eksporter animatic/, /Export animatic/) })),
      "«Eksporter animatic»",
    );

    // Utgivelse (12)
    await go(T("Utgivelse"));
    await shot(page, "v3-08-utgivelse");
    await audited(page, "Utgivelse");
    area(12, "Plakater og presentasjoner", page.url().includes("/utgivelse"), "meny → Utgivelse");

    const reached = new Set(areas.filter((a) => a.ok).map((a) => a.n));
    check(
      "REQ-0427",
      "alle 14 områdene nås",
      reached.size === 14,
      `nådd: ${[...reached].sort((a, b) => a - b).join(", ")}`,
    );
    check(
      "REQ-0428",
      "14 områder samlet i 6 menyvalg uten at noe blir utilgjengelig",
      reached.size === 14 && links.length < 14,
      `${links.length} menyvalg`,
    );
    if (errors.length) console.log("  konsollfeil:", errors.slice(0, 3));
  } finally {
    await ctx.close();
  }
}

// ---------- 2. Tastatur: menyen kan nås og brukes med Tab/Enter, og fokus synes ----------

async function testKeyboard() {
  const { ctx, page } = await openPage(P);
  try {
    const seen = [];
    let ring = true;
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const shown =
          (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) ||
          (cs.boxShadow && cs.boxShadow !== "none");
        return { text: (el.textContent ?? "").trim(), nav: !!el.closest("nav"), shown };
      });
      if (!f) continue;
      if (f.nav && f.text) {
        seen.push(f.text);
        if (!f.shown) ring = false;
      }
    }
    const order = [
      "Prosjektoversikt",
      "Manus",
      "Story Lab",
      "Ressursbibliotek",
      "Sceneeditor",
      "Montering",
      "Utgivelse",
    ].map(T);
    check(
      "REQ-0427",
      "menyvalgene nås med Tab i riktig rekkefølge",
      order.every((x, i) => seen.indexOf(x) === seen.indexOf(order[0]) + i) &&
        seen.includes(T("Utgivelse")),
      seen.join(" → "),
    );
    check("REQ-0424", "fokus er synlig på menyvalgene (ring/omriss)", ring && seen.length > 0);
    // Enter på «Manus» åpner manuset
    await page
      .getByRole("navigation", { name: T("Arbeidsflater") })
      .getByRole("link", { name: T("Manus") })
      .focus();
    await shot(page, "v3-09-fokus-meny");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1200);
    check(
      "REQ-0427",
      "Enter på et menyvalg åpner arbeidsflaten",
      page.url().includes("/manus"),
      page.url(),
    );
  } finally {
    await ctx.close();
  }
}

// ---------- 3. Dialoger (språk og uttrykk) ----------

async function testDialogs() {
  const cases = [
    [
      "v3-10-ny-produksjon",
      P,
      async (page) => page.getByRole("button", { name: R(/Ny produksjon/, /New production/) }).click(),
    ],
    [
      "v3-11-generer-scene",
      `${P}/montering`,
      async (page) => {
        await page
          .getByRole("button", { name: /^Scene 1: / })
          .first()
          .click();
        await page.waitForTimeout(300);
        await page.getByRole("button", { name: R(/Generer scene/, /Generate scene/) }).click();
      },
    ],
    [
      "v3-12-eksport-animatic",
      `${P}/montering`,
      async (page) => page.getByRole("button", { name: R(/Eksporter animatic/, /Export animatic/) }).click(),
    ],
    [
      "v3-13-ai-leverandorer",
      "/",
      async (page) =>
        page
          .getByRole("button", { name: R(/AI-leverandører/, /AI providers/) })
          .first()
          .click(),
    ],
    [
      "v3-14-importer-manus",
      `${P}/manus`,
      async (page) => page.getByRole("button", { name: T("Importer manus") }).first().click(),
    ],
    [
      "v3-15-versjoner",
      `${P}/manus`,
      async (page) => page.getByRole("button", { name: T("Versjoner") }).click(),
    ],
  ];
  for (const [name, path, open] of cases) {
    if (ONLY && !ONLY.includes(name)) continue;
    const { ctx, page } = await openPage(path);
    try {
      await open(page);
      await page.waitForTimeout(800);
      await shot(page, name);
      await audited(page, name);
      // Lukkeknappen i dialogen har norsk skjermlesertekst
      const close = page.locator("[role=dialog] button:has(.sr-only)");
      if (await close.count()) {
        const t = await close.first().innerText();
        check("REQ-0014", `${name}: lukkeknappen heter «Lukk»`, R(/Lukk/, /Close/).test(t), t);
      }
    } catch (e) {
      check("REQ-0014", `${name}: dialogen kunne åpnes`, false, String(e).split("\n")[0]);
    } finally {
      await ctx.close();
    }
  }
}

// ---------- 4. REQ-0119 og REQ-0168: fra oversikten, monteringen, menyen og manuset ----------

async function testNavigation() {
  const { ctx, page } = await openPage(P);
  try {
    await page.getByRole("button", { name: T("Per scene") }).click();
    await page.waitForTimeout(400);
    const link = page.getByRole("link", { name: /^INT\. STUA/ }).first();
    const heading = (await link.innerText()).trim();
    await link.click();
    await page.waitForTimeout(1500);
    const url = new URL(page.url());
    const occ = url.searchParams.get("scene");
    const current = occ ? await page.locator(`#nav-${occ}[aria-current=true]`).count() : 0;
    await shot(page, "v3-16-oversikt-til-manus");
    check(
      "REQ-0119",
      "klikk på scenen i oversikten åpner manuset med scenen valgt",
      url.pathname.endsWith("/manus") && !!occ && current === 1,
      `${heading} → ${url.pathname}?scene=${occ}`,
    );

    // Fra oversikten til sceneeditoren
    await page.goto(base + P, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: T("Per scene") }).click();
    await page.waitForTimeout(300);
    await page.getByRole("link", { name: T("Åpne i sceneeditoren") }).nth(2).click();
    await page.waitForTimeout(1500);
    const occ2 = new URL(page.url()).searchParams.get("scene");
    const picker = await page
      .getByRole("button", { name: R(/^Velg scene\. Valgt:/, /^Choose scene\. Selected:/) })
      .getAttribute("aria-label")
      .catch(() => null);
    check(
      "REQ-0119",
      "fra oversikten til sceneeditoren med scenen valgt",
      page.url().includes("/scene") && !!occ2 && !!picker,
      picker ?? "",
    );
    check(
      "REQ-0168",
      "sceneeditoren åpnes fra oversikten med scenen valgt",
      page.url().includes("/scene") && !!picker,
      picker ?? "",
    );

    // Fra monteringen (tidslinjen)
    await page.goto(base + `${P}/montering`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page
      .getByRole("button", { name: /^Scene 3: / })
      .first()
      .click();
    await page.waitForTimeout(400);
    await page.getByRole("link", { name: T("Åpne i sceneeditoren") }).click();
    await page.waitForTimeout(1500);
    const fromTimeline = await page
      .getByRole("button", { name: R(/^Velg scene\. Valgt: 3 /, /^Choose scene\. Selected: 3 /) })
      .count();
    await shot(page, "v3-17-montering-til-sceneeditor");
    check(
      "REQ-0168",
      "sceneeditoren åpnes fra monteringen (tidslinjen) med valgt scene",
      fromTimeline === 1,
      page.url(),
    );

    // Fra manuset: valgt scene, så hovedmenyen og manusets egne lenker
    await page.goto(base + `${P}/manus`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const item = page.locator("[id^=nav-]").nth(4);
    const chosen = (await item.getAttribute("id")).slice(4);
    await item.click();
    await page.waitForTimeout(600);
    const chosenNumber = (await item.innerText()).trim().split(/\s+/)[0];
    const direct = await page
      .getByRole("link", { name: R(/sceneeditor/i, /scene editor/i) })
      .filter({ hasNot: page.getByRole("navigation") })
      .evaluateAll((els) =>
        els.filter((e) => !e.closest("nav")).map((e) => e.getAttribute("href")),
      );
    await shot(page, "v3-18-manus-scene-valgt");
    check(
      "REQ-0168",
      "manuset har en direkte lenke til sceneeditoren for valgt scene",
      direct.some((h) => h && h.includes(chosen)),
      direct.join(", ") || "ingen lenke",
    );
    await page
      .getByRole("navigation", { name: T("Arbeidsflater") })
      .getByRole("link", { name: T("Sceneeditor") })
      .click();
    await page.waitForTimeout(1500);
    const viaNav = await page
      .getByRole("button", { name: R(/^Velg scene\. Valgt:/, /^Choose scene\. Selected:/) })
      .getAttribute("aria-label")
      .catch(() => "");
    await shot(page, "v3-19-meny-til-sceneeditor");
    check(
      "REQ-0168",
      "hovedmenyen åpner sceneeditoren med scenen som var valgt i manuset",
      viaNav.includes(`${R("Valgt", "Selected")}: ${chosenNumber} `),
      `valgt i manus: ${chosenNumber}; sceneeditoren: «${viaNav}»`,
    );
  } finally {
    await ctx.close();
  }
}

// ---------- 5. REQ-0101: «Følg avspillingen» ----------

async function testFollow() {
  // Lav høyde, så manuset må rulle
  const { ctx, page } = await openPage(`${P}/montering`, { width: 1440, height: 560 });
  try {
    await page
      .getByRole("button", { name: /^Scene 1: / })
      .first()
      .click();
    await page.waitForTimeout(500);
    const region = page.getByRole("region", { name: T("Manus for scenen") });
    const follow = region.getByRole("checkbox", { name: R(/Følg avspillingen/, /Follow playback/) });
    /** Rulleposisjonen til den nærmeste rullbare beholderen rundt manuset, og markert blokk. */
    const state = () =>
      region.evaluate((el) => {
        const last = [...el.querySelectorAll("[data-block]")].pop();
        let sc = last?.parentElement ?? null;
        while (sc) {
          const cs = getComputedStyle(sc);
          if (/(auto|scroll)/.test(cs.overflowY) && sc.scrollHeight > sc.clientHeight + 1) break;
          sc = sc.parentElement;
        }
        const r = last?.getBoundingClientRect();
        const v = sc?.getBoundingClientRect();
        const act = el.querySelector('[aria-current="true"]')?.getBoundingClientRect();
        return {
          activeVisible: !!(act && v && act.top >= v.top - 1 && act.bottom <= v.bottom + 1),
          top: sc ? sc.scrollTop : -1,
          max: sc ? sc.scrollHeight - sc.clientHeight : 0,
          lastVisible: !!(r && v && r.top >= v.top - 1 && r.bottom <= v.bottom + 1),
          active: el.querySelector('[aria-current="true"]')?.getAttribute("data-block") ?? null,
        };
      });
    const toTop = () =>
      region.evaluate((el) => {
        for (let e = el.querySelector("[data-block]"); e; e = e.parentElement) e.scrollTop = 0;
      });
    /** Hopper til en blokk (klikk via skript, så ingenting rulles av musen). */
    const seekTo = (which) =>
      region.evaluate((el, w) => {
        const all = [...el.querySelectorAll("[data-block]")];
        const b = w === "last" ? all.pop() : all[w];
        (b.querySelector("button") ?? b).click();
        return b.getAttribute("data-block");
      }, which);
    const s0 = await state();
    check(
      "REQ-0101",
      "manuset kan rulle i denne høyden (testen gir mening)",
      s0.max > 20,
      `maks rulling ${s0.max}px`,
    );
    // Av: hopp til siste blokk – markeringen flytter, manuset står stille
    if (await follow.isChecked()) await follow.click();
    await page.mouse.click(5, 5);
    await toTop();
    await page.waitForTimeout(200);
    const lastId = await seekTo("last");
    await page.waitForTimeout(600);
    const off = await state();
    await shot(page, "v3-20-folg-av");
    check(
      "REQ-0101",
      "av: markeringen flytter til replikken under avspillingshodet",
      off.active === lastId,
      `aktiv ${off.active}`,
    );
    check(
      "REQ-0101",
      "av: manuset står stille (markert replikk utenfor synsfeltet)",
      off.top === 0 && !off.lastVisible,
      `scrollTop ${off.top}`,
    );
    // Av under avspilling: markeringen endres, rullingen ikke
    await seekTo(0);
    await toTop();
    await page.waitForTimeout(300);
    const before = await state();
    await page.getByRole("button", { name: T("Spill av"), exact: true }).click();
    const seenActive = new Set();
    let moved = false;
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(250);
      const st = await state();
      if (st.active) seenActive.add(st.active);
      if (st.top !== before.top) moved = true;
    }
    await page.getByRole("button", { name: T("Pause") }).click();
    check(
      "REQ-0101",
      "av: under avspilling oppdateres markeringen uten at manuset ruller",
      seenActive.size >= 2 && !moved,
      `${seenActive.size} ulike markerte blokker; rullet: ${moved}`,
    );
    // På: manuset ruller så markert replikk vises
    await follow.click();
    await page.mouse.click(5, 5);
    await toTop();
    await page.waitForTimeout(200);
    // (Med «følg» på bytter panelet til scenen under avspillingshodet; siste replikk i den scenen)
    const lastOn = await seekTo("last");
    await page.waitForTimeout(600);
    const on = await state();
    await shot(page, "v3-21-folg-pa");
    check(
      "REQ-0101",
      "på: manuset ruller til markert replikk",
      on.top > 0 && on.lastVisible && on.active === lastOn,
      `scrollTop ${on.top}`,
    );
    // På under avspilling: markert replikk holdes synlig hele tiden
    await seekTo(0);
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: T("Spill av"), exact: true }).click();
    let hidden = 0;
    const seenOn = new Set();
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(250);
      const st = await state();
      if (st.active) {
        seenOn.add(st.active);
        if (!st.activeVisible) hidden++;
      }
    }
    await page.getByRole("button", { name: T("Pause") }).click();
    check(
      "REQ-0101",
      "på: under avspilling er markert replikk alltid synlig",
      seenOn.size >= 2 && hidden === 0,
      `${seenOn.size} markerte blokker; ${hidden} ganger utenfor synsfeltet`,
    );
  } finally {
    await ctx.close();
  }
}

// ---------- 6. REQ-0243: «Generer scene» fra scenevisningen ----------

async function testGenerateScene() {
  const { ctx, page } = await openPage(`${P}/montering`);
  try {
    await page
      .getByRole("button", { name: /^Scene 2: / })
      .first()
      .click();
    await page.waitForTimeout(400);
    const btn = page.getByRole("button", { name: R(/Generer scene/, /Generate scene/) });
    check(
      "REQ-0243",
      "«Generer scene …» finnes i scenepanelet i monteringen",
      (await btn.count()) === 1,
    );
    await btn.click();
    await page.waitForTimeout(800);
    const dialog = page.getByRole("dialog");
    const title = await dialog
      .getByRole("heading")
      .first()
      .innerText()
      .catch(() => "");
    const segments = await dialog.getByRole("textbox", { name: R(/Beskrivelse for/, /Description for/) }).count();
    await shot(page, "v3-22-generer-scene");
    check(
      "REQ-0243",
      "handlingen åpner genereringsflyten for scenen (inndeling og beskrivelser)",
      R(/^Generer scene/, /^Generate scene/).test(title.trim()) && segments > 0,
      `${title.trim()} · ${segments} beskrivelse(r)`,
    );
  } finally {
    await ctx.close();
  }
}

// ---------- 7. REQ-0405: hovedoversikten ----------

async function testOverview() {
  const { ctx, page } = await openPage(P);
  try {
    const text = async () =>
      (await page.locator("main, body").first().innerText()).replace(/\s+/g, " ");
    const t = await text();
    const figures = R([
      ["produksjoner i prosjektet", /Produksjoner.*Hovedfilm.*Majas jul/],
      ["antall scener", /\d+ aktive scener/],
      ["total estimert spilletid", /Bare manusestimat ≈ \d/i],
      ["bekreftet spilletid", /Bekreftet \d/i],
      ["antall ferdige scener", /Ferdig\s*\(?\d+/],
      ["scener under arbeid", /(Under arbeid|2D-animatic)\s*\(?\d+/],
      ["scener som mangler produksjon", /Mangler produksjon\s*\(?\d+/],
      ["renderingsjobber", /AI-budsjett og jobber.*Jobber/],
      ["synkroniseringsavvik", /manusendringer etter at 2D-scene eller film ble laget/i],
      ["API-kostnader", /Denne måneden: \d+.*anslått/],
    ], [
      ["produksjoner i prosjektet", /Productions.*Hovedfilm.*Majas jul/],
      ["antall scener", /\d+ active scenes/],
      ["total estimert spilletid", /Script estimate only ≈ \d/i],
      ["bekreftet spilletid", /Confirmed \d/i],
      ["antall ferdige scener", /Done\s*\(?\d+/],
      ["scener under arbeid", /(In progress|2D animatic)\s*\(?\d+/],
      ["scener som mangler produksjon", /Missing production\s*\(?\d+/],
      ["renderingsjobber", /AI budget and jobs.*Jobs/],
      ["synkroniseringsavvik", /script changes since its 2D scene or film was made/i],
      ["API-kostnader", /This month: \d+.*estimated/],
    ]);
    for (const [name, re] of figures)
      check(
        "REQ-0405",
        `oversikten viser ${name}`,
        re.test(t),
        re.test(t) ? "" : `fant ikke ${re}`,
      );
    // Kostnader med egne nøkler (USD) summeres ikke på oversikten
    check(
      "REQ-0405",
      "API-kostnader i USD (egne nøkler) summert på oversikten",
      /\$\d/.test(t),
      /\$\d/.test(t) ? "" : "bare kreditter (Lovable) og pris per jobb",
    );
    // Oppdateres når data endres: planlagt lengde for en scene
    const expected = page.getByText(T("Forventet lengde nå")).locator("xpath=following-sibling::*[1]");
    const before = (await expected.innerText()).trim();
    await page.getByRole("button", { name: T("Per scene") }).click();
    await page.waitForTimeout(300);
    const plan = page.getByRole("textbox", { name: R(/^Planlagt lengde for scene 3$/, /^Planned length for scene 3$/) });
    await plan.fill("2:00");
    await plan.press("Enter");
    await page.waitForTimeout(800);
    const after = (await expected.innerText()).trim();
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, "v3-23-oversikt-oppdatert");
    check(
      "REQ-0405",
      "tallene oppdateres når underliggende data endres (planlagt lengde)",
      before !== after,
      `${before} → ${after}`,
    );
  } finally {
    await ctx.close();
  }
}

// ---------- 8. REQ-0175: maske i piksler (Chromium-lerret) ----------

async function testMaskPixels() {
  const { ctx, page } = await openPage(P);
  try {
    const r = await page.evaluate(async () => {
      const core = await import("/src/core/index.ts");
      const { drawFrame } = await import("/src/engine/compositor/canvas.ts");
      const actor = "00000000-0000-7000-8000-a11ce0000001";
      let s = core.emptyProjectState({
        id: core.newId(),
        revision: 1,
        name: "Maske",
        fps: { num: 25, den: 1 },
        frameWidth: 1000,
        frameHeight: 600,
        primaryLanguage: "nb",
      });
      const run = (command) => {
        const res = core.applyCommand(s, {
          id: core.newId(),
          actor,
          at: new Date().toISOString(),
          command,
        });
        if (!res.ok) throw new Error(`${command.type}: ${res.error.message}`);
        s = res.state;
      };
      const prod = core.newId();
      run({
        type: "CreateProduction",
        productionId: prod,
        kind: "main",
        name: "Hovedfilm",
        parentProductionId: null,
      });
      const variantId = core.newId();
      run({
        type: "CreateScene",
        productionId: prod,
        sceneId: core.newId(),
        variantId,
        occurrenceId: core.newId(),
        orderKey: "m",
        heading: { intExt: "INT.", location: "STUA", time: "DAG" },
        blocks: [],
        productionNumber: "1",
      });
      const assetId = core.newId();
      const avId = core.newId();
      const verId = core.newId();
      run({
        type: "CreateAssets",
        assets: [
          {
            assetId,
            fields: {
              kind: "character",
              name: "Maja",
              names: [],
              description: "",
              category: "",
              tags: [],
            },
          },
        ],
      });
      run({
        type: "CreateAssetVariant",
        variantId: avId,
        assetId,
        fields: { name: "Animatic", style: "animatic", appearance: "" },
      });
      const path = `${s.project.id}/${assetId}/${verId}/maja.png`;
      run({
        type: "AddAssetVersion",
        versionId: verId,
        variantId: avId,
        media: {
          path,
          mimeType: "image/png",
          width: 200,
          height: 100,
          byteSize: 100,
          sha256: "a".repeat(64),
          durationMs: null,
        },
        note: "",
      });
      const compId = core.newId();
      run({
        type: "CreateComposition",
        compositionId: compId,
        variantId,
        fields: {
          name: "Stua",
          width: 1000,
          height: 600,
          durationFrames: 25,
          background: "#000000",
        },
      });
      const layerId = core.newId();
      const f = core.defaultLayerFields(s, s.compositions[compId], { assetId });
      run({
        type: "AddLayers",
        layers: [
          {
            layerId,
            compositionId: compId,
            fields: {
              ...f,
              width: 200,
              height: 100,
              transform: { ...f.transform, x: 500, y: 300, scaleX: 1, scaleY: 1, rotation: 0 },
            },
          },
        ],
      });
      const before = JSON.stringify(s.assetVersions[verId]);
      // Kildebildet: helt rødt, 200 × 100
      const src = document.createElement("canvas");
      src.width = 200;
      src.height = 100;
      const sc = src.getContext("2d");
      sc.fillStyle = "#ff0000";
      sc.fillRect(0, 0, 200, 100);
      const draw = (mask) => {
        const fields = { ...core.layerFieldsOf(s.layers[layerId]), mask };
        run({ type: "UpdateLayers", layers: [{ layerId, fields }] });
        const c = document.createElement("canvas");
        c.width = 1000;
        c.height = 600;
        const ctx2 = c.getContext("2d");
        drawFrame(ctx2, core.renderFrame(s, compId, 0, { view: "camera" }), {
          images: new Map([[path, src]]),
        });
        const px = (x, y) => [...ctx2.getImageData(x, y, 1, 1).data];
        // Laget dekker (400–600, 250–350); masken (50, 25, 100 × 50) i laget = (450–550, 275–325) i bildet
        return {
          inside: px(500, 300),
          outsideMask: px(410, 260),
          edgeIn: px(452, 277),
          edgeOut: px(447, 300),
        };
      };
      const plain = draw(null);
      const masked = draw({
        kind: "rect",
        x: 50,
        y: 25,
        width: 100,
        height: 50,
        feather: 0,
        invert: false,
      });
      const inverted = draw({
        kind: "rect",
        x: 50,
        y: 25,
        width: 100,
        height: 50,
        feather: 0,
        invert: true,
      });
      const ellipse = draw({
        kind: "ellipse",
        x: 50,
        y: 25,
        width: 100,
        height: 50,
        feather: 0,
        invert: false,
      });
      const srcPx = [...sc.getImageData(10, 10, 1, 1).data, ...sc.getImageData(100, 50, 1, 1).data];
      return {
        plain,
        masked,
        inverted,
        ellipse,
        srcPx,
        versionUnchanged: JSON.stringify(s.assetVersions[verId]) === before,
        layerMask: s.layers[layerId].mask,
      };
    });
    const red = (p) => p[0] > 200 && p[1] < 40 && p[2] < 40 && p[3] > 200;
    const black = (p) => p[0] < 20 && p[1] < 20 && p[2] < 20;
    check(
      "REQ-0175",
      "uten maske dekker laget hele flaten",
      red(r.plain.inside) && red(r.plain.outsideMask),
    );
    check(
      "REQ-0175",
      "rektangelmaske: synlig innenfor masken, borte utenfor",
      red(r.masked.inside) &&
        red(r.masked.edgeIn) &&
        black(r.masked.outsideMask) &&
        black(r.masked.edgeOut),
      JSON.stringify(r.masked),
    );
    check(
      "REQ-0175",
      "snudd maske: borte innenfor, synlig utenfor",
      black(r.inverted.inside) && red(r.inverted.outsideMask),
      JSON.stringify(r.inverted),
    );
    check(
      "REQ-0175",
      "ellipsemaske: midten synlig, hjørnet av rektangelet borte",
      red(r.ellipse.inside) && black(r.ellipse.edgeIn),
      JSON.stringify(r.ellipse),
    );
    check(
      "REQ-0175",
      "kildebildet er uendret (piksler og versjonen i biblioteket)",
      r.srcPx.every((v, i) => v === [255, 0, 0, 255][i % 4]) && r.versionUnchanged,
    );
  } catch (e) {
    check("REQ-0175", "pikselkontroll kunne kjøres", false, String(e).split("\n")[0]);
  } finally {
    await ctx.close();
  }
}

// ---------- Kjør ----------

const tests = [
  ["omrader", testAreas],
  ["tastatur", testKeyboard],
  ["dialoger", testDialogs],
  ["navigasjon", testNavigation],
  ["folg", testFollow],
  ["generer", testGenerateScene],
  ["oversikt", testOverview],
  ["maske", testMaskPixels],
];
for (const [name, fn] of tests) {
  if (ONLY && !ONLY.includes(name)) continue;
  console.log(`\n== ${name} ==`);
  try {
    await fn();
  } catch (e) {
    check(name, "uventet feil", false, String(e).split("\n")[0]);
  }
}
await browser.close();

// Gjennomgangen av sidene og dialogene samlet
if (audits.length) {
  console.log(`\n== gjennomgang av ${audits.length} sider/dialoger ==`);
  const all = (k) => audits.flatMap((a) => a[k].map((x) => `${a.where}: ${x}`));
  check(
    "REQ-0014",
    `<html lang> er «${LANG}»`,
    audits.every((a) => a.lang === LANG),
  );
  check(
    "REQ-0014",
    R("ingen engelske grensesnittord i tekst, aria-label, title, placeholder eller alt", "ingen norske grensesnittord i tekst, aria-label, title, placeholder eller alt (engelsk visning)"),
    all("english").length === 0,
    short(all("english"), 8),
  );
  check(
    "REQ-0424",
    "all tekst bruker designsystemets fonter (Inter, JetBrains Mono, Courier Prime)",
    all("fonts").length === 0,
    short(all("fonts")),
  );
  check("REQ-0424", "ingen tekst under 11 px", all("small").length === 0, short(all("small")));
  check(
    "REQ-0424",
    "tekstfarger kommer fra tokenene",
    all("colors").length === 0,
    short(all("colors")),
  );
  check(
    "REQ-0424",
    "kontrast minst 4,5:1 (3:1 for stor tekst) i sidene slik de vises",
    all("contrast").length === 0,
    short(all("contrast"), 8),
  );
  check(
    "REQ-0424",
    "alle knapper, lenker og felt har et tilgjengelig navn",
    all("unnamed").length === 0,
    short(all("unnamed"), 8),
  );
  check(
    "REQ-0424",
    "hele dokumentet ruller ikke (arbeidsflatene ruller i egne paneler)",
    audits.every((a) => a.docScroll <= 1),
    audits
      .filter((a) => a.docScroll > 1)
      .map((a) => `${a.where}: ${a.docScroll}px`)
      .join(" | "),
  );
  check("REQ-0426", "ingen emoji i grensesnittet", all("emoji").length === 0, short(all("emoji")));
  check(
    "REQ-0426",
    "ingen gradienter i krom",
    all("gradients").length === 0,
    short(all("gradients")),
  );
  check(
    "REQ-0426",
    "ingen radier over 8 px eller pilleknapper",
    all("radius").length === 0,
    short(all("radius"), 6),
  );
  const sparks = audits.flatMap((a) => a.sparkleWhere.map((x) => `${a.where}: ${x}`));
  check(
    "REQ-0426",
    "ingen «gnist»-ikoner for AI (DESIGN_SYSTEM §6)",
    sparks.length === 0,
    short(sparks, 8),
  );
  check(
    "REQ-0013",
    "ingen chatflate (meldingsfelt «spør AI»/«skriv en melding»)",
    !all("english").some((x) => /message|chat/i.test(x)),
  );
  console.log(`  (${audits.reduce((t, a) => t + a.textCount, 0)} tekstelementer gjennomgått)`);
}

const failed = results.filter((r) => !r.ok);
const reqs = [...new Set(results.map((r) => r.req))].sort();
console.log("\nOppsummering per krav:");
for (const q of reqs) {
  const rs = results.filter((r) => r.req === q);
  const bad = rs.filter((r) => !r.ok).length;
  console.log(`  ${bad ? "FEILET " : "BESTÅTT"} ${q}: ${rs.length - bad}/${rs.length} kontroller`);
}
console.log(
  failed.length
    ? `RESULTAT: ${failed.length} av ${results.length} kontroller feilet`
    : `RESULTAT: alle ${results.length} kontroller bestått`,
);
process.exit(failed.length || results.length === 0 ? 1 : 0);
