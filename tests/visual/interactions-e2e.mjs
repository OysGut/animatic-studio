/**
 * Nettlesertester for interaksjoner som ellers bare er testet i kjernen (DEC-0074, KI-134 m.fl.):
 *   1. Dra og slipp av lag inn i og ut av en gruppe i laglisten i sceneeditoren (KI-134).
 *   2. Maskehåndtak på lerretet i sceneeditoren: flytt og endre størrelse (DEC-0072).
 *   3. Plakathåndtak i Utgivelse: rotasjon med håndtaket over elementet, størrelse i hjørnet (DEC-0073).
 *   4. «Valgte scener» i eksportdialogen i monteringen: to scener som ikke er naboer (DEC-0072).
 *
 * Supabase-svarene mockes som i tests/visual/screens.mjs. Lagringen (serverfunksjonen runCommand) får aldri
 * svar: endringen står da igjen lokalt som «lagrer», og den første kommandoen som sendes, fanges og
 * kontrolleres. Tilstanden kontrolleres i nettleseren rett etter handlingen (lagliste, inspektør, SVG, tekst).
 *
 * Krever kjørende dev-server og Playwright med Chromium:
 *   ENV_FILE=…/.env node interactions-e2e.mjs <baseUrl> <fixture.json> [utmappe]
 * Avslutter med kode 1 hvis en kontroll feiler.
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const [
  base = "http://127.0.0.1:5173",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/interactions-e2e",
] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const env = readFileSync(process.env.ENV_FILE ?? new URL("../../.env", import.meta.url), "utf8");
const supaUrl = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)[1];
const ref = new URL(supaUrl).hostname.split(".")[0];
const USER = {
  id: "00000000-0000-7000-8000-a11ce0000001",
  email: "mars@example.no",
  aud: "authenticated",
  role: "authenticated",
};
const project = fx.project;
const scenePath = `/prosjekt/${project.id}/scene`;
const monteringPath = `/prosjekt/${project.id}/montering`;
const utgivelsePath = `/prosjekt/${project.id}/utgivelse`;

// ---------- Resultater ----------

const results = [];
/** Registrerer én kontroll. */
function check(group, name, ok, detail = "") {
  results.push({ group, name, ok: !!ok, detail });
  console.log(`${ok ? "  OK  " : "  FEIL"} [${group}] ${name}${detail ? ` – ${detail}` : ""}`);
}
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

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
    if (path.startsWith("/storage/v1/object/sign/") && path.endsWith(".wav"))
      return route.fulfill({ status: 200, contentType: "audio/wav", body: wav(4) });
    if (path.startsWith("/storage/v1/object/sign/")) {
      const n = (path.length * 37) % 360;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="hsl(${n} 25% 22%)"/><circle cx="150" cy="120" r="60" fill="hsl(${n} 45% 70%)"/></svg>`;
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
    }
    const table = path.replace("/rest/v1/", "");
    if (table === "schema_version") return json([{ version: 29 }]);
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

/** Enkel WAV (mono, 8 kHz) med en tone. */
function wav(seconds) {
  const rate = 8000;
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 0.4 * 32767),
      44 + i * 2,
    );
  return buf;
}

const browser = await chromium
  .launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" })
  .catch(() => chromium.launch());

/**
 * Ny side med mock og innlogging. `sent` samler kommandoene som sendes til runCommand (etter at
 * `holdSaves()` er kalt): forespørselen får aldri svar, så endringen står igjen lokalt.
 */
async function openPage(path) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  await mock(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on(
    "console",
    // Sanntidskanalen (WebSocket) stoppes i testmiljøet; den feilen er forventet
    (m) => m.type() === "error" && !/WebSocket connection/.test(m.text()) && errors.push(m.text()),
  );
  const exp = Math.floor(Date.now() / 1000) + 86400;
  await page.addInitScript(
    ([k, v]) => localStorage.setItem(k, v),
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
    ],
  );
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const sent = [];
  const holdSaves = () =>
    page.route("**/_serverFn/**", (route) => {
      const body = route.request().postData() ?? "";
      if (body.includes("command")) sent.push(body);
      // Ingen svar: lagringen henger, og den lokale endringen står igjen
    });
  return { ctx, page, errors, sent, holdSaves };
}

/** Teksten i den første kommandoen som ble sendt (venter litt på at køen sender den). */
async function firstSent(page, sent) {
  for (let i = 0; i < 20 && sent.length === 0; i++) await page.waitForTimeout(100);
  return sent[0] ?? "";
}

async function fail(page, name, e) {
  check(name, "uventet feil", false, String(e).split("\n")[0]);
  await page.screenshot({ path: `${out}/${name}-feil.png` }).catch(() => undefined);
}

// ---------- 1. Lag inn i og ut av grupper (KI-134) ----------

const layerList = (page) => page.getByRole("list", { name: "Lagene, forreste øverst" });
const layerRow = (page, name) =>
  layerList(page)
    .locator(":scope > li")
    .filter({ has: page.locator("span.block.truncate", { hasText: new RegExp(`^${name}$`) }) });
const rowMeta = async (page, name) =>
  (await layerRow(page, name).locator("span.block.truncate").nth(1).innerText()).trim();
const rowNames = async (page) =>
  layerList(page).evaluate((ul) =>
    [...ul.children].map((li) => li.querySelector("span.block.truncate")?.textContent ?? ""),
  );

/**
 * Dra-og-slipp med HTML5-hendelser fra laget `from` til raden `to`, på høyden `yFrac` av raden
 * (0,5 = midten: inn i gruppen; nær 0 = foran raden). Hendelsene sendes hver for seg, så React rekker å
 * registrere hvilket lag som dras før dragover og drop.
 */
async function dragRow(page, from, to, yFrac) {
  const src = layerRow(page, from);
  const dst = layerRow(page, to);
  const b = await dst.boundingBox();
  const s = await src.boundingBox();
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await src.dispatchEvent("dragstart", {
    dataTransfer: dt,
    clientX: s.x + 20,
    clientY: s.y + s.height / 2,
  });
  await page.waitForTimeout(80);
  const at = { dataTransfer: dt, clientX: b.x + 40, clientY: b.y + b.height * yFrac };
  await dst.dispatchEvent("dragenter", at);
  await dst.dispatchEvent("dragover", at);
  await page.waitForTimeout(80);
  await dst.dispatchEvent("dragover", at);
  await page.waitForTimeout(80);
  await dst.dispatchEvent("drop", at);
  await src.dispatchEvent("dragend", { dataTransfer: dt });
  await page.waitForTimeout(300);
}

async function testGroupsInto() {
  const G = "1 lag i gruppe";
  const { ctx, page, errors, sent, holdSaves } = await openPage(scenePath);
  try {
    await layerList(page).waitFor({ timeout: 15000 });
    const names = await rowNames(page);
    console.log("  laglisten:", names.join(" | "));
    check(
      G,
      "laglisten har gruppen «Familien» og laget «Maja»",
      names.includes("Familien") && names.includes("Maja"),
    );
    const before = await rowMeta(page, "Maja");
    check(G, "«Maja» ligger ikke i en gruppe før dra", !before.includes("i «"), before);
    const famBefore = await rowMeta(page, "Familien");
    await holdSaves();
    await dragRow(page, "Maja", "Familien", 0.5);
    const after = await rowMeta(page, "Maja");
    check(
      G,
      "«Maja» ligger i «Familien» etter slipp på midten av gruppen",
      after.includes("i «Familien»"),
      after,
    );
    const famAfter = await rowMeta(page, "Familien");
    const n0 = Number(/(\d+) lag/.exec(famBefore)?.[1]);
    const n1 = Number(/(\d+) lag/.exec(famAfter)?.[1]);
    check(G, "gruppen teller ett lag mer", n1 === n0 + 1, `${famBefore} → ${famAfter}`);
    const order = await rowNames(page);
    const gi = order.indexOf("Familien");
    check(
      G,
      "«Maja» står rett under gruppen i listen",
      order[gi + 1] === "Maja" || order.slice(gi + 1, gi + 1 + n1).includes("Maja"),
      order.join(" | "),
    );
    // Inspektøren: velg laget og se gruppefeltet
    await layerRow(page, "Maja").getByRole("button").first().click();
    await page.waitForTimeout(300);
    const groupField = page
      .getByLabel("Egenskaper for lag")
      .locator("label", { hasText: /^Gruppe/ })
      .locator("select");
    const chosen = await groupField
      .evaluate((s) => s.options[s.selectedIndex]?.textContent ?? "")
      .catch(() => "");
    check(G, "inspektøren viser gruppen «Familien»", /Familien/.test(chosen), chosen);
    const cmd = await firstSent(page, sent);
    check(
      G,
      "kommandoen som sendes, er UpdateLayers med gruppen",
      cmd.includes("UpdateLayers") && cmd.includes("groupId"),
      cmd ? `${cmd.length} tegn` : "ingen kommando fanget",
    );
    const undo = await page
      .getByRole("button", { name: /^Angre/ })
      .first()
      .getAttribute("aria-label")
      .catch(() => null);
    if (undo) check(G, "angreknappen viser handlingen", /Familien/.test(undo), undo);
  } catch (e) {
    await fail(page, G, e);
  }
  if (errors.length) console.log("  konsollfeil:", errors.slice(0, 5));
  await ctx.close();
}

async function testGroupsOut() {
  const G = "1 lag ut av gruppe";
  const { ctx, page, errors, sent, holdSaves } = await openPage(scenePath);
  try {
    await layerList(page).waitFor({ timeout: 15000 });
    const anne = (await rowNames(page)).find((n) => /Anne/.test(n));
    check(G, "laget med Anne finnes", !!anne, anne ?? "");
    const before = await rowMeta(page, anne);
    check(G, `«${anne}» ligger i «Familien» før dra`, before.includes("i «Familien»"), before);
    const famBefore = await rowMeta(page, "Familien");
    await holdSaves();
    // Slipp øverst på raden «Himmel» (utenfor gruppen): laget flyttes dit og tas ut av gruppen
    await dragRow(page, anne, "Himmel", 0.1);
    const after = await rowMeta(page, anne);
    check(G, `«${anne}» er tatt ut av gruppen`, !after.includes("i «"), after);
    const famAfter = await rowMeta(page, "Familien");
    const n0 = Number(/(\d+) lag/.exec(famBefore)?.[1]);
    const n1 = Number(/(\d+) lag/.exec(famAfter)?.[1]);
    check(G, "gruppen teller ett lag mindre", n1 === n0 - 1, `${famBefore} → ${famAfter}`);
    const order = await rowNames(page);
    const hi = order.indexOf("Himmel");
    check(G, "laget står rett over «Himmel» i listen", order[hi - 1] === anne, order.join(" | "));
    const cmd = await firstSent(page, sent);
    check(
      G,
      "kommandoen som sendes, er UpdateLayers",
      cmd.includes("UpdateLayers"),
      cmd ? `${cmd.length} tegn` : "ingen kommando fanget",
    );
  } catch (e) {
    await fail(page, G, e);
  }
  if (errors.length) console.log("  konsollfeil:", errors.slice(0, 5));
  await ctx.close();
}

// ---------- 2. Maskehåndtak på lerretet (DEC-0072) ----------

/** Tallfeltene i en seksjon i inspektøren (i rekkefølge). */
async function sectionNumbers(page, title) {
  const sec = page.locator("section", { has: page.getByRole("heading", { name: title }) });
  return sec.getByRole("spinbutton").evaluateAll((els) => els.map((e) => Number(e.value)));
}
/** Feltene X, Y, bredde og høyde i maskeseksjonen. */
async function maskValues(page) {
  const v = await sectionNumbers(page, "Maske og blanding");
  return { x: v[0], y: v[1], width: v[2], height: v[3] };
}
/** Plassering og skalering av valgt lag. */
async function layerValues(page) {
  const v = await sectionNumbers(page, "Plassering");
  return { x: v[0], y: v[1], sx: v[2], sy: v[3], rotation: v[4] };
}

/** Pekeren lerretet viser over et punkt. */
async function cursorAt(page, canvas, x, y) {
  await page.mouse.move(x, y);
  await page.waitForTimeout(30);
  return canvas.evaluate((c) => c.style.cursor);
}

/**
 * Finner maskens midtpunkt og nedre høyre hjørne på skjermen. Utgangspunktet regnes fra feltene i
 * inspektøren (laget er ikke rotert); så letes det i nærheten etter pekeren som håndtaket gir.
 */
async function findMaskHandles(page, canvas, comp, size, layer, mask) {
  const cb = await canvas.boundingBox();
  const PADDING = 32;
  const zoom = Math.min((cb.width - 2 * PADDING) / comp.w, (cb.height - 2 * PADDING) / comp.h);
  const vx = (cb.width - comp.w * zoom) / 2;
  const vy = (cb.height - comp.h * zoom) / 2;
  const s = layer.sx / 100;
  const toScreen = (lx, ly) => ({
    x: cb.x + vx + zoom * (layer.x + (lx - size.w / 2) * s),
    y: cb.y + vy + zoom * (layer.y + (ly - size.h / 2) * s),
  });
  const center = toScreen(mask.x + mask.width / 2, mask.y + mask.height / 2);
  const corner = toScreen(mask.x + mask.width, mask.y + mask.height);
  // Hjørnet: let etter en pil for størrelse i en liten rute rundt utgangspunktet
  let found = null;
  for (let r = 0; r <= 12 && !found; r += 3)
    for (let dx = -r; dx <= r && !found; dx += 3)
      for (let dy = -r; dy <= r && !found; dy += 3) {
        const c = await cursorAt(page, canvas, corner.x + dx, corner.y + dy);
        if (/resize/.test(c)) found = { x: corner.x + dx, y: corner.y + dy, cursor: c };
      }
  return { center, corner: found, cornerGuess: corner, zoom, scale: s };
}

async function testMask() {
  const G = "2 maskehåndtak";
  const { ctx, page, errors, sent, holdSaves } = await openPage(scenePath);
  try {
    await layerList(page).waitFor({ timeout: 15000 });
    await layerRow(page, "Maja").getByRole("button").first().click();
    await page.waitForTimeout(400);
    await holdSaves();
    await page.getByLabel("Maske", { exact: true }).selectOption("rect");
    await page.waitForTimeout(400);
    const m0 = await maskValues(page);
    const lay = await layerValues(page);
    const sizeText = await page.getByText(/Målt i lagets egne piksler/).innerText();
    const sm = /\((\d+)\s*×\s*(\d+)\)/.exec(sizeText);
    const size = { w: Number(sm[1]), h: Number(sm[2]) };
    check(
      G,
      "rektangelmaske lagt på (80 % av laget)",
      near(m0.width, size.w * 0.8, 1),
      JSON.stringify(m0),
    );
    const comp = { w: project.frame_width ?? 1920, h: project.frame_height ?? 1080 };
    const canvas = page.locator("[data-stage] canvas").first();
    const h = await findMaskHandles(page, canvas, comp, size, lay, m0);
    const cc = await cursorAt(page, canvas, h.center.x, h.center.y);
    check(
      G,
      "midtpunktet gir flyttepeker",
      cc === "move",
      `${cc} ved (${h.center.x.toFixed(0)}, ${h.center.y.toFixed(0)})`,
    );
    check(
      G,
      "hjørnet nede til høyre gir pil for størrelse",
      !!h.corner,
      h.corner?.cursor ?? "ikke funnet",
    );

    // Flytt: dra midtpunktet 40 × 30 skjermpiksler
    const dxs = 40;
    const dys = 30;
    await page.mouse.move(h.center.x, h.center.y);
    await page.mouse.down();
    await page.mouse.move(h.center.x + dxs / 2, h.center.y + dys / 2, { steps: 4 });
    await page.mouse.move(h.center.x + dxs, h.center.y + dys, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const m1 = await maskValues(page);
    const lay1 = await layerValues(page);
    const k = 1 / (h.zoom * h.scale); // skjermpiksler → lagets piksler
    check(
      G,
      "laget selv er ikke flyttet",
      lay1.x === lay.x && lay1.y === lay.y,
      JSON.stringify(lay1),
    );
    check(
      G,
      "masken flyttet med musen (X og Y)",
      near(m1.x - m0.x, dxs * k, 3) && near(m1.y - m0.y, dys * k, 3),
      `Δ=(${m1.x - m0.x}, ${m1.y - m0.y}), ventet ≈ (${(dxs * k).toFixed(1)}, ${(dys * k).toFixed(1)})`,
    );
    check(
      G,
      "størrelsen er uendret ved flytting",
      m1.width === m0.width && m1.height === m0.height,
      JSON.stringify(m1),
    );

    // Størrelse: dra hjørnet nede til høyre (flyttet sammen med masken)
    if (h.corner) {
      const cx = h.corner.x + dxs;
      const cy = h.corner.y + dys;
      const cur = await cursorAt(page, canvas, cx, cy);
      check(G, "hjørnet følger masken etter flytting", /resize/.test(cur), cur);
      await page.mouse.down();
      await page.mouse.move(cx - 15, cy - 10, { steps: 4 });
      await page.mouse.move(cx - 30, cy - 20, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      const m2 = await maskValues(page);
      check(
        G,
        "hjørnet endrer bredde og høyde",
        near(m2.width - m1.width, -30 * k, 3) && near(m2.height - m1.height, -20 * k, 3),
        `Δ=(${m2.width - m1.width}, ${m2.height - m1.height}), ventet ≈ (${(-30 * k).toFixed(1)}, ${(-20 * k).toFixed(1)})`,
      );
      check(
        G,
        "øverste venstre hjørne står stille",
        m2.x === m1.x && m2.y === m1.y,
        JSON.stringify(m2),
      );
    }
    const undo = await page
      .getByRole("button", { name: /^Angre/ })
      .first()
      .getAttribute("aria-label")
      .catch(() => null);
    if (undo) check(G, "angreknappen viser siste maskeendring", /maske/i.test(undo), undo);
    const cmd = await firstSent(page, sent);
    // Lagringen henger på første kommando (valget «Rektangel»); dra-endringene står i køen bak den
    check(
      G,
      "første kommando til lagring er UpdateLayers med rektangelmasken",
      cmd.includes("UpdateLayers") && cmd.includes("mask") && cmd.includes(String(m0.width)),
      cmd ? `${cmd.length} tegn` : "ingen kommando fanget",
    );
    await page.screenshot({ path: `${out}/maske.png` });
  } catch (e) {
    await fail(page, G, e);
  }
  if (errors.length) console.log("  konsollfeil:", errors.slice(0, 5));
  await ctx.close();
}

// ---------- 3. Plakathåndtak (DEC-0073) ----------

/** Rammen rundt valgt element (stiplet blå) og rotasjonen på gruppen den ligger i. */
async function posterSelection(page) {
  return page.getByRole("application", { name: /Plakaten/ }).evaluate((svg) => {
    const r = [...svg.querySelectorAll("rect")].find(
      (x) => x.getAttribute("stroke") === "#4c8dff" && x.getAttribute("stroke-dasharray"),
    );
    if (!r) return null;
    const t = r.parentElement?.getAttribute("transform") ?? "";
    const m = /rotate\(([-\d.e]+)/.exec(t);
    return {
      x: Number(r.getAttribute("x")),
      y: Number(r.getAttribute("y")),
      w: Number(r.getAttribute("width")),
      h: Number(r.getAttribute("height")),
      rotation: m ? Number(m[1]) : 0,
    };
  });
}
const centerOf = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

async function testPoster() {
  const G = "3 plakathåndtak";
  const { ctx, page, errors, sent, holdSaves } = await openPage(utgivelsePath);
  try {
    const svg = page.getByRole("application", { name: /Plakaten/ });
    await svg.waitFor({ timeout: 15000 });
    const b = await svg.boundingBox();
    // Velg tittelen øverst på plakaten (klikk uten å dra)
    await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.07);
    await page.waitForTimeout(300);
    const s0 = await posterSelection(page);
    check(G, "et element er valgt", !!s0, JSON.stringify(s0));
    if (!s0) throw new Error("Ingen valgt ramme");
    const rot = svg.getByLabel("Roter (Shift: trinn på 15°)");
    const corners = svg.getByLabel("Endre størrelse (Shift: behold forholdet)");
    check(
      G,
      "rotasjonshåndtak og fire hjørnehåndtak vises",
      (await rot.count()) === 1 && (await corners.count()) === 4,
    );
    await holdSaves();

    // Størrelse: dra hjørnet nede til høyre (det siste av de fire: nw, ne, sw, se)
    const ctm = await svg.evaluate((el) => {
      const m = el.getScreenCTM();
      return { a: m.a, d: m.d };
    });
    const se = centerOf(await corners.nth(3).boundingBox());
    const dxPx = 40;
    const dyPx = 25;
    await page.mouse.move(se.x, se.y);
    await page.mouse.down();
    await page.mouse.move(se.x + dxPx / 2, se.y + dyPx / 2, { steps: 4 });
    await page.mouse.move(se.x + dxPx, se.y + dyPx, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const s1 = await posterSelection(page);
    const mmX = dxPx / ctm.a;
    const mmY = dyPx / ctm.d;
    check(
      G,
      "hjørnet nede til høyre gjør elementet større",
      near(s1.w - s0.w, mmX, 0.6) && near(s1.h - s0.h, mmY, 0.6),
      `Δ=(${(s1.w - s0.w).toFixed(1)}, ${(s1.h - s0.h).toFixed(1)}) mm, ventet ≈ (${mmX.toFixed(1)}, ${mmY.toFixed(1)})`,
    );
    check(
      G,
      "øverste venstre hjørne står stille",
      near(s1.x, s0.x, 0.11) && near(s1.y, s0.y, 0.11),
      `${s0.x},${s0.y} → ${s1.x},${s1.y}`,
    );
    let undo = await page
      .getByRole("button", { name: /^Angre/ })
      .first()
      .getAttribute("aria-label")
      .catch(() => null);
    check(G, "angreknappen: «Endre størrelse»", /Endre størrelse/.test(undo ?? ""), undo ?? "");

    // Rotasjon: dra håndtaket over elementet en kvart omdreining med klokka rundt midtpunktet
    const r0 = centerOf(await rot.boundingBox());
    const sb = await svg.evaluate((el) => {
      const r = [...el.querySelectorAll("rect")].find(
        (x) => x.getAttribute("stroke") === "#4c8dff" && x.getAttribute("stroke-dasharray"),
      );
      const bb = r.getBoundingClientRect();
      return { x: bb.x, y: bb.y, width: bb.width, height: bb.height };
    });
    const c = centerOf(sb);
    const rad = Math.hypot(r0.x - c.x, r0.y - c.y);
    await page.mouse.move(r0.x, r0.y);
    await page.mouse.down();
    for (let i = 1; i <= 9; i++) {
      const a = -Math.PI / 2 + (i / 9) * (Math.PI / 2);
      await page.mouse.move(c.x + Math.cos(a) * rad, c.y + Math.sin(a) * rad);
    }
    await page.mouse.up();
    await page.waitForTimeout(400);
    const s2 = await posterSelection(page);
    check(
      G,
      "rotasjonshåndtaket dreier elementet ≈ 90° med klokka",
      near(s2.rotation, 90, 1.5),
      `rotate(${s2.rotation})`,
    );
    check(
      G,
      "størrelsen er uendret ved rotasjon",
      near(s2.w, s1.w, 0.01) && near(s2.h, s1.h, 0.01),
      `${s2.w} × ${s2.h}`,
    );
    const rotField = await page
      .getByLabel("Innstillinger for plakaten")
      .locator("label", { hasText: /^Rotasjon/ })
      .locator("input")
      .first()
      .inputValue()
      .catch(() => "");
    if (rotField)
      check(
        G,
        "inspektøren viser rotasjonen",
        near(Number(rotField.replace(",", ".")), s2.rotation, 0.1),
        rotField,
      );
    undo = await page
      .getByRole("button", { name: /^Angre/ })
      .first()
      .getAttribute("aria-label")
      .catch(() => null);
    check(G, "angreknappen: «Roter element»", /Roter element/.test(undo ?? ""), undo ?? "");

    // Hjørnehåndtak på rotert element: håndtaket ligger der hjørnet er dreid til
    const se2 = centerOf(await corners.nth(3).boundingBox());
    const expected = (() => {
      const a = (s2.rotation * Math.PI) / 180;
      const hx = (s2.w / 2) * ctm.a;
      const hy = (s2.h / 2) * ctm.d;
      return {
        x: c.x + hx * Math.cos(a) - hy * Math.sin(a),
        y: c.y + hx * Math.sin(a) + hy * Math.cos(a),
      };
    })();
    check(
      G,
      "hjørnehåndtaket følger rotasjonen",
      Math.hypot(se2.x - expected.x, se2.y - expected.y) < 4,
      `(${se2.x.toFixed(0)}, ${se2.y.toFixed(0)}) ventet (${expected.x.toFixed(0)}, ${expected.y.toFixed(0)})`,
    );
    const cmd = await firstSent(page, sent);
    // Første kommando i lagringskøen er størrelsesendringen (rotasjonen står i køen bak den)
    check(
      G,
      "første kommando til lagring er UpdatePoster med ny bredde",
      cmd.includes("UpdatePoster") && cmd.includes(String(s1.w)),
      cmd ? `${cmd.length} tegn` : "ingen kommando fanget",
    );
    await page.screenshot({ path: `${out}/plakat.png` });
  } catch (e) {
    await fail(page, G, e);
  }
  if (errors.length) console.log("  konsollfeil:", errors.slice(0, 5));
  await ctx.close();
}

// ---------- 4. «Valgte scener» i eksportdialogen (DEC-0072) ----------

/** «2 scener i manusets rekkefølge, 12,3 s.» → { n, seconds } */
function parseSummary(text) {
  const m = /(\d+) scener? i manusets rekkefølge, ([\d:,]+)( s)?/.exec(text);
  if (!m) return null;
  const t = m[2];
  const seconds = t.includes(":")
    ? Number(t.split(":")[0]) * 60 + Number(t.split(":")[1])
    : Number(t.replace(",", "."));
  return { n: Number(m[1]), seconds, text: m[0] };
}

async function testPick() {
  const G = "4 valgte scener";
  const { ctx, page, errors } = await openPage(monteringPath);
  try {
    await page.getByRole("button", { name: "Eksporter animatic" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const summary = async () =>
      parseSummary(await dialog.locator('section[aria-label="Kontroll før eksport"]').innerText());
    // Lengden på hver scene alene: «Fra scene til scene» med samme første og siste scene
    const from = dialog.getByLabel("Første scene");
    const to = dialog.getByLabel("Siste scene");
    const options = await from
      .locator("option")
      .evaluateAll((os) => os.map((o) => ({ value: o.value, label: o.textContent.trim() })));
    console.log("  scener i filmen:", options.map((o) => o.label).join(" | "));
    check(G, "filmen har minst tre scener", options.length >= 3, String(options.length));
    const A = 0;
    const B = 2; // ikke naboer
    const single = [];
    for (const i of [A, B]) {
      await from.selectOption(options[i].value);
      await to.selectOption(options[i].value);
      await page.waitForTimeout(150);
      single.push(await summary());
    }
    check(
      G,
      "hver scene alene gir «1 scene»",
      single.every((s) => s?.n === 1),
      single.map((s) => s?.text).join(" / "),
    );
    await dialog.getByRole("radio", { name: /^Valgte scener/ }).check();
    const list = dialog.getByRole("list", { name: "Scener i eksporten" });
    await list.waitFor();
    const none = await summary();
    check(
      G,
      "ingen avkrysset: «Utvalget har ingen scener»",
      !none && /Utvalget har ingen scener/.test(await dialog.innerText()),
    );
    const boxes = list.getByRole("checkbox");
    await boxes.nth(A).check();
    await boxes.nth(B).check();
    await page.waitForTimeout(200);
    const checked = await boxes.evaluateAll((bs) => bs.map((b) => b.checked));
    check(
      G,
      "nøyaktig scene 1 og 3 er krysset av",
      checked.filter(Boolean).length === 2 && checked[A] && checked[B],
      JSON.stringify(checked),
    );
    const two = await summary();
    const expected = single[0].seconds + single[1].seconds;
    check(G, "kontrollen viser 2 scener", two?.n === 2, two?.text ?? "ingen tekst");
    check(
      G,
      "lengden er summen av de to scenene (rent kutt mellom dem)",
      near(two?.seconds, expected, 0.11),
      `${two?.seconds} s, ventet ${expected.toFixed(1)} s`,
    );
    // Hele filmen er lengre (scenen mellom er ikke med)
    await dialog.getByRole("radio", { name: /^Hele filmen/ }).check();
    const film = await summary();
    check(
      G,
      "hele filmen er lengre enn utvalget",
      film && film.seconds > two.seconds,
      film?.text ?? "",
    );
    // Tilbake til «Valgte scener»: avkryssingen står fortsatt
    await dialog.getByRole("radio", { name: /^Valgte scener/ }).check();
    const again = await summary();
    check(
      G,
      "avkryssingen beholdes når omfanget byttes fram og tilbake",
      again?.n === 2,
      again?.text ?? "",
    );
    await page.screenshot({ path: `${out}/valgte-scener.png` });
  } catch (e) {
    await fail(page, G, e);
  }
  if (errors.length) console.log("  konsollfeil:", errors.slice(0, 5));
  await ctx.close();
}

// ---------- Kjør ----------

const ONLY = process.env.ONLY?.split(",");
const tests = [
  ["grupper-inn", testGroupsInto],
  ["grupper-ut", testGroupsOut],
  ["maske", testMask],
  ["plakat", testPoster],
  ["valgte-scener", testPick],
];
for (const [name, fn] of tests) {
  if (ONLY && !ONLY.includes(name)) continue;
  console.log(`\n== ${name} ==`);
  await fn();
}
await browser.close();

const failed = results.filter((r) => !r.ok);
const groups = [...new Set(results.map((r) => r.group))];
console.log("\nOppsummering:");
for (const g of groups) {
  const rs = results.filter((r) => r.group === g);
  const bad = rs.filter((r) => !r.ok).length;
  console.log(`  ${bad ? "FEILET " : "BESTÅTT"} ${g}: ${rs.length - bad}/${rs.length} kontroller`);
}
console.log(
  failed.length
    ? `RESULTAT: ${failed.length} av ${results.length} kontroller feilet`
    : `RESULTAT: alle ${results.length} kontroller bestått`,
);
process.exit(failed.length || results.length === 0 ? 1 : 0);
