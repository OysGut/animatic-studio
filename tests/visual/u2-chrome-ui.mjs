/**
 * Nettlesertest U2: felles tetthet for verktøylinjer og panelhoder. Samme mock-oppsett som scene-panels-ui.
 *   ENV_FILE=…/.env node u2-chrome-ui.mjs <baseUrl> <fixture.json> [utmappe]
 */
import { chromium } from "playwright";
import { VISUAL_SCHEMA_VERSION } from "./schema-version.mjs";
import { readFileSync, mkdirSync } from "node:fs";
const [
  base = "http://127.0.0.1:8080",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/panels",
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

async function run(name, path, act, { lang = "nb", width = 1280 } = {}) {
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
      JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig", refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: USER }),
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

const moreBtn = (page) => page.getByRole("button", { name: /^(Mer …|More …)$/ }).first();
const rowHeights = (page) =>
  page.locator("[data-toolbar-group]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));

const toolbarHeights = (page) =>
  page.locator("[data-toolbar-group]").evaluateAll((els) =>
    [...new Set(els.map((e) => e.parentElement))].map((t) => t.getBoundingClientRect().height),
  );

for (const [name, path] of [["scene", "/scene"], ["manus", "/manus"], ["bibliotek", "/bibliotek"]]) {
  await run(`u2-${name}-1280`, path, async (page) => {
    const hs = await rowHeights(page);
    check(hs.length > 0 && hs.every((h) => Math.round(h) === 32), `${name}: gruppene i verktøylinjen er 32 px høye`);
    const ts = await toolbarHeights(page);
    check(ts.length > 0 && ts.every((h) => Math.round(h) >= 32 && Math.round(h) <= 33), `${name}: verktøylinjen er 32 px høy (${ts.map(Math.round).join(", ")})`);
    check(!(await moreBtn(page).isVisible()), `${name}: ved 1280 px er alt synlig, «Mer …» er skjult`);
  });
}

await run("u2-scene-900", "/scene", async (page) => {
  const more = moreBtn(page);
  check(await more.isVisible(), "sceneeditoren: ved 900 px vises «Mer …»");
  await more.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const inside = await page.locator("[data-radix-popper-content-wrapper] [data-toolbar-group]").count();
  check(inside > 0, "sceneeditoren: grupper som ikke får plass, ligger i «Mer …»");
  await page.keyboard.press("Escape");
}, { width: 900 });

for (const [name, path] of [["manus", "/manus"], ["bibliotek", "/bibliotek"]]) {
  await run(`u2-${name}-smal`, path, async (page) => {
    check(await moreBtn(page).isVisible(), `${name}: ved 760 px vises «Mer …»`);
  }, { width: 760 });
}

await run("u2-tips-fokus", "/scene", async (page) => {
  const undo = page.locator('button[data-icon-button][aria-label^="Angre"]').first();
  await undo.waitFor({ timeout: 8000 });
  // Bare for visningen: gjør knappen fokuserbar uten å kjøre noe.
  await undo.evaluate((e) => e.removeAttribute("disabled"));
  const label = await undo.getAttribute("aria-label");
  // Tastaturfokus: Tab fra elementet foran.
  await undo.evaluate((e) => {
    const prev = document.createElement("button");
    prev.id = "u2-prev";
    e.before(prev);
  });
  await page.locator("#u2-prev").focus();
  await page.keyboard.press("Tab");
  await page.waitForTimeout(700);
  const tip = page.getByRole("tooltip");
  const text = (await tip.count()) ? await tip.first().innerText() : "";
  check(text.includes(label ?? "§"), "tastaturfokus på ikonknappen viser verktøytips med navnet");
  check(text.includes("⌘Z"), "verktøytipset viser hurtigtasten");
  await page.keyboard.press("Shift");
  await page.waitForTimeout(300);
  check((await page.getByRole("tooltip").count()) === 0, "en tast lukker verktøytipset");
});

await run("u2-panelkontrast", "/scene", async (page) => {
  const ratios = await page.locator("[data-panel] header h2, [data-panel] header h3, div.h-toolbar > h2, div.h-toolbar > h3").evaluateAll((els) => {
    const rgb = (c) => {
      const cv = document.createElement("canvas").getContext("2d");
      cv.fillStyle = c; cv.fillRect(0, 0, 1, 1);
      return [...cv.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
      }
      return "rgb(0,0,0)";
    };
    return els.filter((e) => e.offsetParent).map((e) => {
      const a = lum(rgb(getComputedStyle(e).color)), b = lum(rgb(bgOf(e)));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
  });
  check(ratios.length > 0 && ratios.every((r) => r >= 4.5), `titlene i panelhodene har kontrast ≥ 4,5:1 (laveste ${Math.min(...ratios).toFixed(2)})`);
});

await run("u2-ikonknapp", "/scene", async (page) => {

  const size = await page.locator("button[data-icon-button]").first().boundingBox();
  check(size && Math.round(size.height) === 28 && Math.round(size.width) === 28, "ikonknappen er 28 × 28 px");
});

await run("u2-verktoytips", "/utgivelse", async (page) => {
  const btn = page.locator("button[data-icon-button]:not([disabled])").first();
  await btn.waitFor({ timeout: 8000 });
  const box = await btn.boundingBox();
  check(!!box, "en aktiv ikonknapp finnes");
  await btn.hover();
  await page.waitForTimeout(700);
  const tip = page.getByRole("tooltip");
  check(await tip.count() > 0, "verktøytipset vises ved peker etter en kort pause");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check((await page.getByRole("tooltip").count()) === 0, "en tast lukker verktøytipset");
  await btn.focus();
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => {
    const el = document.activeElement;
    const s = el ? getComputedStyle(el) : null;
    return s ? s.boxShadow !== "none" || s.outlineStyle !== "none" : false;
  });
  check(ring, "fokus er synlig på neste knapp");
});

await run("u2-panelhode", "/scene", async (page) => {
  const h = page.locator("[data-panel] header").first();
  const box = await h.boundingBox();
  check(box && Math.round(box.height) === 32, "panelhodet er 32 px");
  const fs = await h.locator("h2").first().evaluate((e) => getComputedStyle(e).fontSize);
  check(fs === "11px", "tittelen i panelhodet er 11 px");
});

await run("u2-engelsk", "/scene", async (page) => {
  check(!(await page.getByRole("button", { name: "Mer …" }).count()), "engelsk: ingen norsk «Mer …»");
}, { lang: "en", width: 760 });

console.log(`RESULTAT: ${pass} bestått, ${fail} feilet`);
await browser.close();
