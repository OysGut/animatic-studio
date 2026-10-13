/**
 * Visuell QA (design-system-director/references/VISUAL_QA.md): tar skjermbilder av M1-skjermene
 * med mockede Supabase-svar. Krever en kjørende dev-server og Playwright med Chromium.
 *   node tests/visual/screens.mjs <baseUrl> <fixture.json> <utmappe>
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const [
  base = "http://localhost:5173",
  fixturePath = "/tmp/claude-0/visual-fixture.json",
  out = "/tmp/claude-0/screens",
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

function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  return {
    access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig",
    refresh_token: "r",
    token_type: "bearer",
    expires_in: 86400,
    expires_at: exp,
    user: USER,
  };
}

/** Enkel WAV (mono, 8 kHz) med en tone som svinger i styrke, så bølgeformen synes. */
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
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = 0.25 + 0.75 * Math.abs(Math.sin(t * 1.7)) * Math.abs(Math.sin(t * 0.31 + 1));
    const v = Math.sin(2 * Math.PI * 220 * t) * env * 0.8;
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

async function mock(page, { projects = [project], schema = true, rows = {} }) {
  // På konteksten (ikke siden), så også egne vinduer (forhåndsvisning) får svar
  await page.context().route(`${supaUrl}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path.startsWith("/auth/v1/user")) return json(USER);
    if (path.startsWith("/auth/v1/")) return json({});
    // Lagring: midlertidige lenker og bilder (enkel figur i stedet for ekte bilder)
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
    if (path.startsWith("/storage/v1/object/sign/") && path.endsWith(".wav")) {
      return route.fulfill({
        status: 200,
        contentType: "audio/wav",
        body: wav(path.includes("maja") ? 3.5 : 20),
      });
    }
    // Importert film (DEC-0047): en ekte testfilm når TEST_FILM peker på en fil (WebM fra ffmpeg)
    if (
      path.startsWith("/storage/v1/object/sign/") &&
      path.includes("/films/") &&
      process.env.TEST_FILM
    ) {
      const { readFileSync: rf } = await import("node:fs");
      const body = rf(process.env.TEST_FILM);
      const range = req.headers()["range"];
      const m = range && /bytes=(\d+)-(\d*)/.exec(range);
      if (m) {
        const start = Number(m[1]);
        const end = m[2] ? Math.min(Number(m[2]), body.length - 1) : body.length - 1;
        return route.fulfill({
          status: 206,
          contentType: "video/webm",
          headers: {
            "content-range": `bytes ${start}-${end}/${body.length}`,
            "accept-ranges": "bytes",
          },
          body: body.subarray(start, end + 1),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "video/webm",
        headers: { "accept-ranges": "bytes" },
        body,
      });
    }
    if (path.startsWith("/storage/v1/object/sign/")) {
      const n = (path.length * 37) % 360;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="hsl(${n} 25% 22%)"/><circle cx="150" cy="120" r="60" fill="hsl(${n} 45% 70%)"/><path d="M60 380 Q150 170 240 380Z" fill="hsl(${n} 45% 60%)"/></svg>`;
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
    }
    const table = path.replace("/rest/v1/", "");
    if (table === "schema_version")
      return schema
        ? json([{ version: 29 }])
        : json({ message: "relation does not exist", code: "42P01" }, 404);
    if (table === "projects") {
      if (single) return json(projects[0] ?? null);
      const idEq = url.searchParams.get("id")?.replace(/^eq\./, "");
      return json(
        projects
          .filter((p) => !idEq || p.id === idEq)
          .map((p) => ({
            ...p,
            project_members: p.project_members ?? [{ role: "owner", user_id: USER.id }],
          })),
      );
    }
    if (table === "project_members") {
      return json([
        { user_id: USER.id, role: "owner", joined_at: "2026-10-08T10:00:00Z" },
        {
          user_id: "b0b00000-0000-7000-8000-000000000002",
          role: "editor",
          joined_at: "2026-10-08T11:00:00Z",
        },
      ]);
    }
    if (table === "profiles") {
      return json([
        { user_id: USER.id, display_name: "Mars" },
        { user_id: "b0b00000-0000-7000-8000-000000000002", display_name: "Anita" },
      ]);
    }
    if (table === "project_invitations")
      return json([
        {
          id: "00000000-0000-7000-8000-00000000f001",
          email: "anita@example.no",
          role: "viewer",
          expires_at: "2026-10-25T10:00:00Z",
        },
      ]);
    // Egne tabellsvar per skjermbilde (f.eks. AI-leverandører, DEC-0069)
    if (rows[table]) return json(single ? (rows[table][0] ?? null) : rows[table]);
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
const shots = [];
async function shot(name, path, opts = {}) {
  if (ONLY && !ONLY.includes(name)) return;
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await mock(page, opts);
  // Lagringsvinduet (showSaveFilePicker) avbrytes alltid i hodeløs Chromium: bruk vanlig nedlasting
  if (opts.plainDownload)
    await page.addInitScript(() => {
      delete window.showSaveFilePicker;
    });
  if (opts.signedIn !== false) {
    await page.addInitScript(
      ([k, v]) => localStorage.setItem(k, v),
      [`sb-${ref}-auth-token`, JSON.stringify(session())],
    );
  }
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const file = `${out}/${name}.png`;
  // act kan returnere «tatt» etter selv å ha tatt skjermbildet (for tilstand som er borte et øyeblikk senere)
  const taken = opts.act ? (await opts.act(page, file)) === "tatt" : false;
  if (!taken) await page.screenshot({ path: file, fullPage: false });
  if (errors.length) console.error(`konsoll-feil i ${name}:`, errors);
  shots.push({ name, file, errors: errors.filter((e) => !e.includes("favicon")) });
  await ctx.close();
}

const ONLY = process.env.ONLY?.split(",");
await shot("01-innlogging", "/", { signedIn: false });
await shot("02-prosjekter", "/", {
  projects: [
    project,
    {
      ...project,
      id: "00000000-0000-7000-8000-00000000beef",
      name: "Trailer-test",
      created_at: "2026-10-01T10:00:00Z",
    },
  ],
});
await shot("03-prosjekter-tom", "/", { projects: [] });
await shot("04-prosjektoversikt", `/prosjekt/${project.id}`, {});
await shot("05-database-mangler", "/", { schema: false });
const manus = `/prosjekt/${project.id}/manus`;
await shot("06-manus", manus, {});
await shot("07-manus-scene-valgt", manus, {
  act: async (page) => {
    await page.locator("[id^=nav-]").nth(3).click();
    await page.waitForTimeout(800);
  },
});
// Fortellingstid (REQ-0164) i inspektøren
await shot("07b-manus-fortellingstid", manus, {
  act: async (page) => {
    await page.locator("[id^=nav-]").nth(10).click();
    await page.waitForTimeout(800);
    await page.getByLabel("Fortellingstid").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  },
});
// Manusfilter på objekt/sted, status og manusendringer (REQ-0073)
await shot("16b-manus-filter-status", manus, {
  act: async (page) => {
    await page.getByLabel("Vis bare scener med ressurs").selectOption({ label: "vase (objekt)" });
    await page.getByLabel("Vis bare scener med status").selectOption("missing");
    await page.waitForTimeout(600);
  },
});
await shot("08-manus-blokk-valgt", manus, {
  act: async (page) => {
    await page.locator("[data-block]").nth(12).click();
    await page.waitForTimeout(500);
  },
});
await shot("09-manus-usikker", manus, {
  act: async (page) => {
    await page.getByRole("button", { name: /neste usikre/i }).click();
    await page.waitForTimeout(800);
  },
});
await shot("10-import-dialog", manus, {
  act: async (page) => {
    await page.getByRole("button", { name: "Importer manus" }).first().click();
    await page.waitForTimeout(400);
  },
});
await shot("12-eksport-dialog", manus, {
  act: async (page) => {
    await page.getByRole("button", { name: "Eksporter" }).first().click();
    await page.waitForTimeout(400);
  },
});
await shot("14-eksport-ferdig", manus, {
  act: async (page) => {
    await page.getByRole("button", { name: "Eksporter" }).first().click();
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      page.getByRole("button", { name: /Eksporter PDF/ }).click(),
    ]);
    console.error("nedlasting:", dl.suggestedFilename());
    await page.waitForTimeout(400);
  },
});
await shot("15-filter-karakter", manus, {
  act: async (page) => {
    const sel = page.getByLabel("Vis bare scener med karakter");
    const value = await sel.locator("option", { hasText: "Bestemor Anne" }).getAttribute("value");
    await sel.selectOption(value);
    await page.waitForTimeout(600);
  },
});
await shot("16-vis-kun-valgt-scene", manus, {
  act: async (page) => {
    await page.locator("[id^=nav-]").nth(4).click();
    await page.getByRole("button", { name: /^Visning/ }).click();
    await page.getByLabel("Vis kun valgt scene").check();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
  },
});
await shot("17-versjoner", manus, {
  act: async (page) => {
    await page.getByRole("button", { name: "Versjoner" }).click();
    await page.waitForTimeout(500);
  },
});
await shot("17b-versjon-sammenlign", manus, {
  act: async (page) => {
    await page.getByRole("button", { name: "Versjoner" }).click();
    await page.getByRole("button", { name: "Mot nå" }).first().click();
    await page.waitForTimeout(800);
  },
});
await shot("19-manus-endre-rekkefolge", manus, {
  act: async (page) => {
    await page.getByRole("switch", { name: "Endre rekkefølge og synlighet" }).click();
    await page.locator("[id^=nav-]").nth(1).click();
    await page.waitForTimeout(600);
  },
});
await shot("23-notater", manus, {
  act: async (page) => {
    await page
      .getByRole("button", { name: /Notat – vis/ })
      .first()
      .click();
    await page.waitForTimeout(700);
  },
});
await shot("24-sok-treff", manus, {
  act: async (page) => {
    await page.getByLabel("Søk i manus").fill("vasen");
    await page.waitForTimeout(700);
  },
});
await shot("25-nytt-notat", manus, {
  act: async (page) => {
    // Merk «tung over tunet» i første handlingslinje
    await page.evaluate(() => {
      const el = [...document.querySelectorAll("[data-line]")].find((e) =>
        e.textContent?.includes("tung over tunet"),
      );
      const node = [...el.childNodes].find((n) => n.textContent.includes("tung"));
      const t = node.nodeType === 3 ? node : node.firstChild;
      const i = t.textContent.indexOf("tung over tunet");
      const r = document.createRange();
      r.setStart(t, i);
      r.setEnd(t, i + "tung over tunet".length);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await page.getByRole("button", { name: "Legg til notat" }).click();
    await page.getByPlaceholder("Skriv notatet …").fill("Vind i snøen her – lyd?");
    await page.waitForTimeout(300);
  },
});
await shot("26-bla-i-manus", manus, {
  act: async (page) => {
    await page.getByLabel(/Manussider/).evaluate((el) => (el.scrollTop = 2200));
    await page.waitForTimeout(900);
  },
});
await shot("27-eksport-notater", manus, {
  act: async (page) => {
    await page.getByRole("button", { name: "Eksporter" }).first().click();
    await page.getByLabel(/Ta med notater/).check();
    await page.waitForTimeout(300);
  },
});
const bibliotek = `/prosjekt/${project.id}/bibliotek`;
await shot("20-bibliotek", bibliotek, {});
await shot("21-bibliotek-ressurs", bibliotek, {
  act: async (page) => {
    await page
      .getByRole("button", { name: /^MA Maja/ })
      .or(page.getByRole("button", { name: /Maja Karakter/ }))
      .first()
      .click();
    await page.waitForTimeout(1200);
  },
});
await shot("22-bibliotek-forslag", bibliotek, {
  act: async (page) => {
    await page.getByRole("button", { name: /Forslag fra manuset/ }).click();
    await page.waitForTimeout(500);
  },
});
await shot("32-bibliotek-forslag-ny", bibliotek, {
  act: async (page) => {
    await page.getByRole("button", { name: /Forslag fra manuset/ }).click();
    await page.getByLabel("Legg til Svarten").check();
    await page.waitForTimeout(700);
  },
});
const scene = `/prosjekt/${project.id}/scene`;
// Scenevelgeren i verktøylinjen: åpne, søk og velg med Enter (DEC-0040)
const velgScene = async (page, sok) => {
  await page.getByRole("button", { name: "Velg scene" }).click();
  await page.getByLabel("Søk etter scene").fill(sok);
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
};
await shot("28-sceneeditor-tom", scene, {
  act: async (page) => {
    await page.getByRole("button", { name: "Neste scene" }).click();
    await page.waitForTimeout(600);
  },
});
await shot("29-sceneeditor", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
  },
});
await shot("30-sceneeditor-valgt", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page
      .getByRole("button", { name: /Maja/ })
      .filter({ hasText: "Karakter" })
      .first()
      .click();
    await page.waitForTimeout(500);
  },
});
await shot("31-sceneeditor-legg-til", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Legg til lag" }).click();
    await page.waitForTimeout(700);
  },
});
// Tidslinje og kamera (2D-scenen «Stua – åpning» har nøkkelbilder på Maja og ett kamerautsnitt)
const tidslinje = (page) => page.getByRole("region", { name: "Tidslinje" });
const gaTilBilde = async (page, frame, total = 100) => {
  const ruler = tidslinje(page).locator(".cursor-col-resize");
  const box = await ruler.boundingBox();
  await page.mouse.click(box.x + (box.width * frame) / total, box.y + box.height / 2);
  await page.waitForTimeout(300);
};
await shot("33-sceneeditor-tidslinje", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page
      .getByRole("button", { name: /Maja/ })
      .filter({ hasText: "Karakter" })
      .first()
      .click();
    await gaTilBilde(page, 25);
  },
});
await shot("34-sceneeditor-kamera", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await tidslinje(page)
      .getByRole("button", { name: /^Kamerautsnitt/ })
      .click();
    await page.waitForTimeout(500);
  },
});
await shot("35-sceneeditor-kameravisning", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await gaTilBilde(page, 40);
    await page.getByRole("button", { name: "Kamera", exact: true }).click();
    await page.waitForTimeout(500);
  },
});
await shot("36-sceneeditor-avspilling", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Spill av" }).click();
    await page.waitForTimeout(1000);
  },
});
await shot("40-meny-sammenslatt", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Skjul menyen" }).click();
    await page.waitForTimeout(500);
  },
});
await shot("41-scenevelger", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Velg scene" }).click();
    await page.getByLabel("Søk etter scene").fill("fjøset");
    await page.waitForTimeout(500);
  },
});
await shot("42-forhandsvisning", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await gaTilBilde(page, 40);
    await page.getByRole("button", { name: "Forhåndsvisning", exact: true }).click();
    await page.waitForTimeout(700);
  },
});
await shot("43-forhandsvisning-flyttet-zoom", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await gaTilBilde(page, 40);
    await page.getByRole("button", { name: "Forhåndsvisning", exact: true }).click();
    await page.waitForTimeout(400);
    // Flytt opp til venstre, gjør større fra hjørnet, så 50 %
    const bar = page.getByLabel("Flytt forhåndsvisningen (piltaster)");
    const b = await bar.boundingBox();
    await page.mouse.move(b.x + 40, b.y + 10);
    await page.mouse.down();
    // Fritt over hele programmet (DEC-0042): helt til venstre, over menyen
    await page.mouse.move(b.x - 900, b.y - 250, { steps: 8 });
    await page.mouse.up();
    const c = page.getByLabel(/hjørne nede til høyre/);
    const cb = await c.boundingBox();
    await page.mouse.move(cb.x + 6, cb.y + 6);
    await page.mouse.down();
    await page.mouse.move(cb.x + 120, cb.y + 60, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    console.log(
      "etter hjørne:",
      await page.getByLabel("Zoom i forhåndsvisningen").inputValue(),
      await page.getByRole("region", { name: "Forhåndsvisning av ferdig utsnitt" }).boundingBox(),
    );
    await page.getByLabel("Zoom i forhåndsvisningen").selectOption("25");
    await page.waitForTimeout(500);
    const region = page.getByRole("region", { name: "Forhåndsvisning av ferdig utsnitt" });
    const before = await region.boundingBox();
    await page.getByRole("button", { name: "Lukk forhåndsvisningen" }).click();
    await page.getByRole("button", { name: "Spill av" }).click();
    await page.waitForTimeout(300);
    const auto = await region.boundingBox();
    await page.getByRole("button", { name: "Pause" }).click();
    console.log("husket plass:", JSON.stringify(before) === JSON.stringify(auto), before, auto);
    await page.getByRole("button", { name: "Forhåndsvisning", exact: true }).click();
  },
});
await shot("44-forhandsvisning-eget-vindu", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Forhåndsvisning", exact: true }).click();
    await page.waitForTimeout(300);
    // Playwright-feil: med avskjæring av nettverket henger forespørsler fra tomme sprettoppvinduer
    // (skrifter lastes aldri). Dataene er allerede hentet, så slå avskjæringen av her.
    await page.context().unrouteAll({ behavior: "ignoreErrors" });
    const [pop] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: "Åpne i eget vindu" }).click(),
    ]);
    await pop.waitForTimeout(1200);
    console.log(
      "eget vindu:",
      await pop.evaluate(() => [
        innerWidth,
        innerHeight,
        document.title,
        document.querySelectorAll("canvas").length,
      ]),
    );
    await pop.screenshot({ path: out + "/44b-eget-vindu.png" });
    await pop.keyboard.press(" ");
    await pop.waitForTimeout(600);
    await pop.screenshot({ path: out + "/44c-eget-vindu-avspilling.png" });
    await pop.keyboard.press(" ");
    await pop.evaluate(() => {
      window.moveTo(200, 150);
      window.resizeTo(800, 520);
    });
    await pop.waitForTimeout(1500);
    await page.getByRole("button", { name: "Forhåndsvisning", exact: true }).click(); // lukk
    await page.waitForTimeout(400);
    // Hodeløs Chromium flytter ikke vinduer: simuler at brukeren gjorde det, og se at det huskes ved neste åpning
    await page.evaluate(() => {
      localStorage.setItem("animatic:pane:scene-editor-popup-width", "800");
      localStorage.setItem("animatic:pane:scene-editor-popup-height", "520");
      window.dispatchEvent(
        new StorageEvent("storage", { key: "animatic:pane:scene-editor-popup-width" }),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: "animatic:pane:scene-editor-popup-height" }),
      );
    });
    const [pop2] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: "Forhåndsvisning", exact: true }).click(),
    ]);
    await pop2.waitForTimeout(800);
    console.log(
      "gjenåpnet:",
      await pop2.evaluate(() => [screenX, screenY, innerWidth, innerHeight]),
    );
    await pop2.screenshot({ path: out + "/44b-eget-vindu.png" });
    await pop2.getByRole("button", { name: "Tilbake til redigeringsvinduet" }).click();
    await page.waitForTimeout(600);
  },
});
const montering = `/prosjekt/${project.id}/montering`;
await shot("45-montering", montering, {
  act: async (page) => {
    await page.waitForTimeout(900);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(400);
  },
});
await shot("46-montering-flytt", montering, {
  act: async (page, file) => {
    await page.waitForTimeout(900);
    const clips = page.getByRole("group", { name: "Scener i filmen" }).getByRole("button");
    console.log("klipp:", await clips.count());
    const a = await clips.nth(1).boundingBox();
    const c = await clips.nth(3).boundingBox();
    await page.mouse.move(a.x + 20, a.y + 30);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width - 10, c.y + 30, { steps: 10 });
    await page.screenshot({ path: file });
    await page.mouse.up();
    await page.waitForTimeout(30);
    console.log(
      "rekkefølge etter flytting:",
      await page
        .getByRole("group", { name: "Scener i filmen" })
        .getByRole("button")
        .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")?.slice(0, 30))),
    );
    return "tatt";
  },
});
await shot("47-montering-eksport", montering, {
  act: async (page) => {
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "Eksporter animatic" }).click();
    await page.waitForTimeout(500);
  },
});
await shot("48-montering-eksport-ferdig", montering, {
  act: async (page) => {
    await page.waitForTimeout(900);
    await page.getByRole("group", { name: "Scener i filmen" }).getByRole("button").first().click();
    await page.getByRole("button", { name: "Eksporter animatic" }).click();
    await page
      .getByLabel("Valgt scene")
      .check()
      .catch(() => page.getByText("Valgt scene").click());
    await page
      .getByLabel("Halv størrelse")
      .check()
      .catch(() => page.getByText("Halv størrelse").click());
    const t0 = Date.now();
    const dl = page.waitForEvent("download", { timeout: 60000 }).catch(() => null);
    await page
      .getByRole("button", { name: /Eksporter/ })
      .last()
      .click();
    await page.getByText(/^Ferdig:/).waitFor({ timeout: 90000 });
    const d = await dl;
    console.log("eksport:", Date.now() - t0, "ms", d ? d.suggestedFilename() : "ingen nedlasting");
    if (d) {
      const p = await d.path();
      const { statSync, readFileSync } = await import("node:fs");
      const head = readFileSync(p).subarray(0, 12);
      console.log("fil:", statSync(p).size, "byte", head.toString("hex"));
      // Kontroll av videoen (REQ-0211): varighet, oppløsning og bildefrekvens
      // Skriptet kjøres fra en egen mappe: MEDIABUNNY peker på pakken i repoet
      const mod = await import(process.env.MEDIABUNNY ?? "mediabunny");
      const mb = mod.BufferSource ? mod : mod.default;
      const input = new mb.Input({
        source: new mb.BufferSource(readFileSync(p)),
        formats: mb.ALL_FORMATS,
      });
      const track = await input.getPrimaryVideoTrack();
      const stats = await track.computePacketStats();
      console.log("video:", {
        width: track.displayWidth,
        height: track.displayHeight,
        duration: Number((await input.computeDuration()).toFixed(3)),
        frames: stats.packetCount,
        fps: Number(stats.averagePacketRate.toFixed(2)),
        codec: track.codec,
      });
      const at = await input.getPrimaryAudioTrack();
      console.log(
        "lyd:",
        at
          ? {
              codec: at.codec,
              channels: at.numberOfChannels,
              rate: at.sampleRate,
              duration: Number((await at.computeDuration()).toFixed(2)),
            }
          : "ingen lydspor",
      );
    }
  },
});
await shot("49-lag-bilde", scene, {
  act: async (page) => {
    await page.waitForTimeout(900);
    await page
      .getByRole("region", { name: "Lag" })
      .or(page.locator('section[aria-label="Lag"]'))
      .first()
      .getByRole("button", { name: /Maja/ })
      .first()
      .dblclick();
    await page.waitForTimeout(700);
  },
});
await shot("50-montering-lyd", montering, {
  act: async (page) => {
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /^Vind i trærne/ }).click();
    await page.waitForTimeout(600);
  },
});
await shot("51-legg-til-lyd", montering, {
  act: async (page) => {
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "Legg til lyd" }).click();
    await page.waitForTimeout(700);
  },
});
// DEC-0045: lyd i sceneeditoren (bølgeformer under lagene), lyd i scenene rundt og varmgult kamerautsnitt
await shot("52-scene-lyd", scene, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    const rows = page.getByRole("group", { name: "Lyd i scenen" });
    await rows.scrollIntoViewIfNeeded().catch(() => {});
    console.error("lydrader i scenen:", await rows.locator("button").count());
    const near = page.getByRole("region", { name: "Lyd i scenene rundt" });
    console.error("lyd i scenene rundt:", (await near.innerText()).replace(/\n/g, " | "));
    // Utsnittet kameraet viser nå (her startrammen) er varmgult
    await page.waitForTimeout(400);
  },
});
await shot("53-lydprofil", montering, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /^Tema/ }).first().dblclick();
    await page.waitForTimeout(1200);
  },
});
await shot("54-ai-generering", scene, {
  act: async (page) => {
    await page.waitForTimeout(900);
    await page
      .locator('section[aria-label="Lag"]')
      .first()
      .getByRole("button", { name: /Maja/ })
      .first()
      .dblclick();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Generer …" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("alertdialog", { name: "Bekreft generering" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  },
});
await shot("55-scene-lyd-inn", scene, {
  act: async (page) => {
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "Neste scene" }).click();
    await page.waitForTimeout(1500);
    const rows = page.getByRole("group", { name: "Lyd i scenen" });
    console.error(
      "lyd i scene 2:",
      (await rows.count()) ? (await rows.innerText()).replace(/\n/g, " | ") : "ingen tidslinje",
    );
  },
});
// DEC-0046: slett og forlat prosjekt, ressurser fra slettede prosjekter, zip
const flereProsjekter = [
  {
    ...project,
    project_members: [
      { role: "owner", user_id: USER.id },
      { role: "editor", user_id: "b0b00000-0000-7000-8000-000000000002" },
    ],
  },
  {
    ...project,
    id: "00000000-0000-7000-8000-00000000beef",
    name: "Trailer-test",
    created_at: "2026-10-01T10:00:00Z",
    project_members: [
      { role: "owner", user_id: "b0b00000-0000-7000-8000-000000000002" },
      { role: "editor", user_id: USER.id },
    ],
  },
  {
    ...project,
    id: "00000000-0000-7000-8000-00000000dead",
    name: "Gammel pilot",
    created_at: "2026-06-01T10:00:00Z",
    deleted_at: "2026-10-09T15:00:00Z",
  },
];
await shot("56-prosjekter-handlinger", "/", {
  projects: flereProsjekter,
  act: async (page) => {
    await page.getByRole("button", { name: "Handlinger for Jula på Dovre" }).click();
    await page.waitForTimeout(400);
  },
});
await shot("57-slett-prosjekt", "/", {
  projects: flereProsjekter,
  act: async (page) => {
    await page.getByRole("button", { name: "Handlinger for Jula på Dovre" }).click();
    await page.getByRole("menuitem", { name: /Slett prosjekt/ }).click();
    await page
      .getByRole("button", { name: /Last ned valgte/ })
      .waitFor({ timeout: 15000 })
      .catch(() => console.error("zip-panelet ble ikke lastet"));
    await page.getByLabel("Prosjektnavnet").fill("Jula på Dov");
    await page.waitForTimeout(300);
  },
});
await shot("58-forlat-prosjekt", "/", {
  projects: flereProsjekter,
  act: async (page) => {
    await page.getByRole("button", { name: "Handlinger for Trailer-test" }).click();
    await page.getByRole("menuitem", { name: /Forlat prosjekt/ }).click();
    await page.waitForTimeout(500);
  },
});
await shot("59-slettede-prosjekter", "/", { projects: flereProsjekter });
await shot("60-montering-film", montering, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /^Scene 7: .*ferdig film/ }).click();
    await page.waitForTimeout(800);
    // Midt i overtoningen fra scene 1 til filmen
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1500);
  },
});
await shot("61-replikk-klikk", montering, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    const panel = page.getByRole("region", { name: "Manus for scenen" });
    await panel.locator("[data-block]").nth(2).click();
    await page.waitForTimeout(600);
    console.error(
      "aktiv blokk:",
      await panel
        .locator('[aria-current="true"]')
        .first()
        .innerText()
        .catch(() => "ingen"),
      "| tid:",
      await page
        .locator("text=/^\\d\\d:\\d\\d:\\d\\d:\\d\\d$/")
        .first()
        .innerText()
        .catch(() => "?"),
    );
  },
});
await shot("62-bibliotek-zip", `/prosjekt/${project.id}/bibliotek`, {
  act: async (page) => {
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "Last ned som zip" }).click();
    await page.waitForTimeout(800);
  },
});
// DEC-0048: klipp i deler, synk replikker, lang film
await shot("63-klipp-deler", montering, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /^Scene 7: .*ferdig film/ }).click();
    await page.waitForTimeout(600);
    await page.getByRole("region", { name: "Klipp" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  },
});
await shot("64-synk-replikker", montering, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Synk replikker" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("region", { name: "Manus for scenen" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  },
});
if (process.env.TEST_FILM) {
  await shot("65-lang-film", montering, {
    act: async (page) => {
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: /^Mer/ }).click();
      await page.getByRole("menuitem", { name: "Importer lang film" }).click();
      await page.waitForTimeout(400);
      await page.getByLabel("Velg lang filmfil").setInputFiles(process.env.TEST_FILM);
      await page.getByRole("button", { name: /Importer og fordel/ }).waitFor({ timeout: 20000 });
      await page.waitForTimeout(1200);
    },
  });
}
// DEC-0049: sikkerhetskopi, gjenoppretting og manus ↔ film
const BACKUP_ZIP = process.env.BACKUP_OUT ?? `${out}/sikkerhetskopi.zip`;
await shot("66-sikkerhetskopi", "/", {
  plainDownload: true,
  act: async (page) => {
    await page.getByRole("button", { name: `Handlinger for ${project.name}` }).click();
    await page.getByRole("menuitem", { name: /Sikkerhetskopi/ }).click();
    await page.getByRole("button", { name: /Last ned sikkerhetskopi/ }).waitFor({ timeout: 15000 });
    const dl = page.waitForEvent("download", { timeout: 60000 }).catch(() => null);
    await page.getByRole("button", { name: /Last ned sikkerhetskopi/ }).click();
    const d = await dl;
    if (d) await d.saveAs(BACKUP_ZIP);
    console.error(
      "sikkerhetskopi:",
      d ? d.suggestedFilename() : "ingen nedlasting",
      "|",
      await page
        .getByRole("dialog")
        .locator('[role="status"], [role="alert"]')
        .first()
        .innerText()
        .catch(() => "ingen melding"),
    );
    await page.waitForTimeout(800);
  },
});
await shot("67-gjenopprett", "/", {
  act: async (page) => {
    await page.getByRole("button", { name: /Gjenopprett fra sikkerhetskopi/ }).click();
    await page.getByLabel("Velg sikkerhetskopi").setInputFiles(BACKUP_ZIP);
    await page.getByText(/manusblokker/).waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
  },
});
{
  const occ7 = fx.rows.scene_occurrences.find((o) => o.production_number === "7");
  const blk = occ7
    ? fx.rows.script_blocks.filter(
        (b) => b.variant_id === occ7.variant_id && b.kind === "dialogue",
      )[1]
    : null;
  if (occ7 && blk)
    await shot("68b-montering-fra-manus", `${manus}?scene=${occ7.id}&blokk=${blk.id}`, {
      act: async (page) => {
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${out}/68-manus-vis-i-filmen.png` });
        await page.getByRole("link", { name: "Vis i filmen" }).click();
        await page.waitForTimeout(2500);
        console.error(
          "fra manus: tid",
          await page
            .locator("text=/^\\d\\d:\\d\\d:\\d\\d:\\d\\d$/")
            .first()
            .innerText()
            .catch(() => "?"),
          "| aktiv:",
          await page
            .getByRole("region", { name: "Manus for scenen" })
            .locator('[aria-current="true"]')
            .first()
            .innerText()
            .catch(() => "ingen"),
        );
      },
    });
}
// DEC-0051: overganger, svart-hvitt, eget vindu, hendelser i 2D-scenen
await shot("69-overgang-iris", montering, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /^Scene 3: / }).click();
    await page.waitForTimeout(400);
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1200);
  },
});
await shot("70-standardovergang", montering, {
  act: async (page) => {
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /^Mer/ }).click();
    await page.getByRole("menuitem", { name: /Standardovergang/ }).click();
    await page.waitForTimeout(400);
  },
});
await shot("71-svart-hvitt", montering, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /^Scene 7: .*ferdig film/ }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /^Visning/ }).click();
    await page.getByRole("checkbox", { name: /^Svart-hvitt Hele filmen/ }).click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
  },
});
await shot("72-hendelser-i-manus", scene, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    // Første lag i listen (ikke «Ny gruppe»-knappen øverst i panelet)
    const layer = page
      .getByRole("region", { name: "Lag" })
      .getByRole("button", { name: /Maja|Bestemor|Himmel/ })
      .first();
    await layer.click().catch(() => {});
    await page.waitForTimeout(500);
    await page.getByRole("region", { name: "Hendelser i manuset" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  },
});
// DEC-0052: gruppe, bildeskifte, bevegelsesbane, naboscener og lydopptak
const velgAnne = async (page) => {
  await page
    .getByRole("region", { name: "Lag" })
    .getByRole("button", { name: /Anne/ })
    .first()
    .click();
  await page.waitForTimeout(500);
};
await shot("73-gruppe-og-bane", scene, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await velgAnne(page);
    await gaTilBilde(page, 30);
  },
});
await shot("74-bildeskifte-og-tempo", scene, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await velgAnne(page);
    await gaTilBilde(page, 45);
    await page.getByRole("region", { name: "Bildeskifte" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  },
});
await shot("75-naboscener", scene, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Naboscener" }).click();
    await page.waitForTimeout(800);
    const strip = page.getByRole("region", { name: "Naboscener" });
    const box = await page.locator('[aria-label="Naboscener"] div.cursor-pointer').boundingBox();
    if (box) await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
    await page.waitForTimeout(1200);
    void strip;
  },
});
await shot("76-lydopptak", scene, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Opptak" }).click();
    await page.waitForTimeout(500);
  },
});
// DEC-0053: frilegging, AI-budsjett og jobber, «Generer scene»
await shot("77-frilegging", bibliotek, {
  act: async (page) => {
    await page
      .getByRole("button", { name: /^MA Maja/ })
      .or(page.getByRole("button", { name: /Maja Karakter/ }))
      .first()
      .click();
    await page.waitForTimeout(1200);
    await page
      .getByRole("button", { name: /Frilegg/ })
      .first()
      .click();
    await page.waitForTimeout(2500);
  },
});
await shot("78b-fjern-medlem", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page
      .getByRole("button", { name: /^Fjern .* fra prosjektet$/ })
      .first()
      .click();
    await page.getByRole("alertdialog").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  },
});
await shot("78-ai-budsjett-og-jobber", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page.waitForTimeout(1200);
    await page.getByRole("list", { name: "AI-jobber" }).scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(600);
  },
});
await shot("79-generer-scene", montering, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page
      .getByRole("button", { name: /^Scene 1: / })
      .first()
      .click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /Generer scene/ }).click();
    await page.waitForTimeout(800);
  },
});
// DEC-0069: egne AI-leverandører med nøkler og kostnadstak
const aiRows = {
  ai_provider_keys: [
    {
      id: "00000000-0000-7000-8000-00000000a001",
      provider: "runway",
      label: "",
      key_hint: "…7f3c",
      status: "ok",
      status_message: null,
      last_tested_at: "2026-10-12T07:40:00Z",
      updated_at: "2026-10-12T07:40:00Z",
    },
    {
      id: "00000000-0000-7000-8000-00000000a002",
      provider: "elevenlabs",
      label: "",
      key_hint: "…91ab",
      status: "ok",
      status_message: null,
      last_tested_at: "2026-10-12T07:45:00Z",
      updated_at: "2026-10-12T07:45:00Z",
    },
  ],
  ai_account_limits: [{ monthly_cap_usd: 50 }],
  generation_jobs: [{ cost_usd: 3.5 }, { cost_usd: 0.75 }],
};
await shot("02b-ai-leverandorer", "/", {
  rows: aiRows,
  act: async (page) => {
    await page.getByRole("button", { name: /AI-leverandører/ }).click();
    await page.waitForTimeout(600);
  },
});
await shot("02c-ai-leverandor-openai", "/", {
  rows: aiRows,
  act: async (page) => {
    await page.getByRole("button", { name: /AI-leverandører/ }).click();
    await page.waitForTimeout(400);
    await page
      .getByRole("button", { name: /OpenAI/ })
      .first()
      .click();
    await page.waitForTimeout(500);
  },
});
await shot("02d-ai-lyd", bibliotek, {
  act: async (page) => {
    await page
      .getByRole("button", { name: /Vind i trærne/ })
      .first()
      .click();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Lag med AI" }).first().click();
    await page.waitForTimeout(1200);
    await page.getByRole("region", { name: "Lag lyd med AI" }).scrollIntoViewIfNeeded();
  },
});
// DEC-0070: kø med prioritet og fremdrift, video for flere scener, lydkoblinger, sammenligning
const now = Date.now();
const iso = (ms) => new Date(now - ms).toISOString();
const queueJob = (id, status, extra = {}) => ({
  id,
  project_id: project.id,
  kind: "video",
  provider: "runway",
  model: "gen4_turbo",
  prompt: 'Animated film shot for "Jula på Dovre". Scene 1: INT. STUA - DAG.',
  status,
  created_by: USER.id,
  created_at: iso(5 * 60_000),
  cost_usd: 0.5,
  priority: 2,
  queue_position: now,
  ...extra,
});
await shot("78c-ai-ko", `/prosjekt/${project.id}`, {
  rows: {
    generation_jobs: [
      queueJob("00000000-0000-7000-8000-00000000e001", "running", {
        started_at: iso(40_000),
        progress: 0.45,
      }),
      queueJob("00000000-0000-7000-8000-00000000e002", "running", {
        provider: "google",
        model: "veo-3.1-generate-preview",
        started_at: iso(70_000),
      }),
      queueJob("00000000-0000-7000-8000-00000000e003", "queued", { priority: 1 }),
      queueJob("00000000-0000-7000-8000-00000000e004", "queued", { queue_position: now + 5 }),
    ],
  },
  act: async (page) => {
    await page.waitForTimeout(1200);
    await page.getByRole("list", { name: "AI-jobber" }).scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(500);
  },
});
await shot("79b-video-flere-scener", montering, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /^Mer/ }).click();
    await page.getByRole("menuitem", { name: /Video for flere scener/ }).click();
    await page.waitForTimeout(800);
  },
});
await shot("02e-lyd-koblinger", bibliotek, {
  act: async (page) => {
    await page
      .getByRole("button", { name: /Vind i trærne/ })
      .first()
      .click();
    await page.waitForTimeout(1200);
    await page
      .getByRole("region", { name: "Hører til" })
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await page.waitForTimeout(300);
  },
});
await shot("21b-sammenlign-bilder", bibliotek, {
  act: async (page) => {
    await page
      .getByRole("button", { name: /^MA Maja/ })
      .or(page.getByRole("button", { name: /Maja Karakter/ }))
      .first()
      .click();
    await page.waitForTimeout(1200);
    const boxes = page.getByRole("checkbox", { name: "Sammenlign" });
    if ((await boxes.count()) >= 2) {
      await boxes.nth(0).check();
      await boxes.nth(1).check();
      await page.getByRole("button", { name: /^Sammenlign v/ }).click();
      await page.waitForTimeout(800);
    }
  },
});
// DEC-0071: maske, overganger, betegnelser, stilprofiler, dekning og AI-stemmer
await shot("30b-sceneeditor-maske", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page
      .getByRole("button", { name: /Maja/ })
      .filter({ hasText: "Karakter" })
      .first()
      .click();
    await page.waitForTimeout(500);
    await page
      .getByLabel("Maske")
      .first()
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await page.waitForTimeout(300);
  },
});
await shot("02f-betegnelser", bibliotek, {
  act: async (page) => {
    await page
      .getByRole("button", { name: /^MA Maja/ })
      .or(page.getByRole("button", { name: /Maja Karakter/ }))
      .first()
      .click();
    await page.waitForTimeout(1200);
    const input = page.getByLabel("Betegnelse");
    await input.scrollIntoViewIfNeeded().catch(() => {});
    await input.fill("døra").catch(() => {});
    await page.waitForTimeout(500);
  },
});
await shot("04b-stilprofiler", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page.waitForTimeout(1200);
    await page
      .getByRole("heading", { name: "Filmens visuelle stil" })
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await page
      .getByRole("button", { name: /Egen stil for plakater/ })
      .click()
      .catch(() => {});
    await page.waitForTimeout(700);
  },
});
await shot("80c-dialog-ai-stemmer", montering, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page
      .getByRole("button", { name: /^Scene 1: / })
      .first()
      .click();
    await page.waitForTimeout(600);
    await page
      .getByRole("button", { name: /Dialog med AI-stemmer/ })
      .click()
      .catch(() => {});
    await page.waitForTimeout(1200);
  },
});
await shot("80d-klipp-overganger", montering, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page
      .getByRole("button", { name: /^Scene 1: / })
      .first()
      .click();
    await page.waitForTimeout(600);
    await page
      .getByRole("region", { name: "Klipp" })
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await page.waitForTimeout(300);
  },
});
// DEC-0072: stillbilde, teknisk visning, valgte scener, koblinger for en linje, lagring og arbeidsliste
const scene1 = async (page) => {
  await page.waitForTimeout(1500);
  await page
    .getByRole("button", { name: /^Scene 1: / })
    .first()
    .click();
  await page.waitForTimeout(600);
};
await shot("80e-stillbilde", montering, {
  act: async (page) => {
    await scene1(page);
    await page
      .getByRole("button", { name: /Stillbilde fra biblioteket/ })
      .click()
      .catch(() => {});
    await page.waitForTimeout(1000);
    await page
      .getByRole("list", { name: "Bilder i biblioteket" })
      .getByRole("button")
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(400);
  },
});
await shot("80f-teknisk", montering, {
  act: async (page) => {
    await scene1(page);
    await page.getByRole("button", { name: /^Visning/ }).click();
    await page.getByRole("checkbox", { name: /^Teknisk visning/ }).click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await page.getByRole("region", { name: "Teknisk" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
  },
});
await shot("48b-eksport-valgte-scener", montering, {
  act: async (page) => {
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "Eksporter animatic" }).click();
    await page.getByRole("dialog").getByText("Valgte scener").click();
    const boxes = page.getByRole("list", { name: "Scener i eksporten" }).getByRole("checkbox");
    await boxes.nth(0).check();
    await boxes.nth(2).check();
    await page.waitForTimeout(400);
  },
});
await shot("08b-manus-koblinger", manus, {
  act: async (page) => {
    await page.getByText("Hører du det? Noen banker på døra!").first().click();
    await page.waitForTimeout(600);
    await page
      .getByText("Koblinger", { exact: true })
      .first()
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await page.waitForTimeout(300);
  },
});
await shot("04c-lagring", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page.waitForTimeout(1200);
    await page.getByRole("heading", { name: "Lagring" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("heading", { name: "Lagring" }).scrollIntoViewIfNeeded();
  },
});
// DEC-0054: avvik ved manusendring – monteringen, manuset og sceneeditoren
await shot("80-avvik-montering", montering, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page
      .getByRole("button", { name: /^Scene 1: / })
      .first()
      .click();
    await page.waitForTimeout(600);
    await page
      .getByRole("region", { name: "Manuset er endret etter materialet" })
      .scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  },
});
await shot("81-avvik-manus", manus, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page.getByText("Hører du det? Noen banker på døra!").first().click();
    await page.waitForTimeout(800);
  },
});
await shot("82-avvik-sceneeditor", scene, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Vis og velg …" }).click();
    await page.waitForTimeout(600);
  },
});
// DEC-0055: kontinuitet for Maja – hendelser, forslag, tidslinje og advarsel i sceneeditoren
const openMaja = async (page) => {
  await page
    .getByRole("button", { name: /^MA Maja/ })
    .or(page.getByRole("button", { name: /Maja Karakter/ }))
    .first()
    .click();
  await page.waitForTimeout(1200);
};
await shot("83-kontinuitet", bibliotek, {
  act: async (page) => {
    await openMaja(page);
    await page.getByRole("region", { name: "Kontinuitet" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  },
});
await shot("84-kontinuitet-tidslinje", bibliotek, {
  act: async (page) => {
    await openMaja(page);
    await page.getByLabel("Kontinuitetstidslinje").scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  },
});
await shot("85-kontinuitet-godkjenn-forslag", bibliotek, {
  act: async (page) => {
    await openMaja(page);
    await page
      .getByRole("button", { name: /Godkjenn …/ })
      .first()
      .click();
    await page.waitForTimeout(300);
    await page.getByRole("form", { name: "Ny kontinuitetshendelse" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  },
});
await shot("86-kontinuitet-sceneeditor", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page
      .getByRole("button", { name: /Maja/ })
      .filter({ hasText: "Karakter" })
      .first()
      .click();
    await page.waitForTimeout(500);
    await page.getByText(/^Kontinuitet: i denne scenen/).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  },
});
// DEC-0056: kontinuitetsanalyse og konsekvenser ved godkjenning av nytt bilde
await shot("87-kontinuitetsanalyse", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page.waitForTimeout(1200);
    await page.getByRole("heading", { name: "Kontinuitetsanalyse" }).scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(400);
  },
});
await shot("88-godkjenn-konsekvenser", bibliotek, {
  act: async (page) => {
    await openMaja(page);
    await page.getByRole("button", { name: "Godkjenn", exact: true }).first().click();
    await page.waitForTimeout(700);
  },
});
// DEC-0057: avledede produksjoner (spinoff)
await shot("89-produksjoner", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page.waitForTimeout(1000);
    await page.getByRole("heading", { name: "Produksjoner" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  },
});
await shot("90-ny-produksjon", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: /Ny produksjon/ }).click();
    await page.getByPlaceholder(/Majas jul/).fill("Trailer til premieren");
    await page.getByRole("list", { name: "Scener" }).getByRole("checkbox").nth(0).check();
    await page.getByRole("list", { name: "Scener" }).getByRole("checkbox").nth(4).check();
    await page.waitForTimeout(300);
  },
});
await shot("91-spinoff-manus", manus, {
  act: async (page) => {
    await page.waitForTimeout(1200);
    await page
      .getByLabel("Produksjon")
      .first()
      .selectOption({ label: "Majas jul – kortversjon (spinoff)" });
    await page.waitForTimeout(800);
    await page.getByText("Hører du det? Det er julenissen!").first().click();
    await page.waitForTimeout(600);
  },
});
await shot("92-spinoff-sceneeditor", scene, {
  act: async (page) => {
    await page.waitForTimeout(1000);
    await page
      .getByLabel("Produksjon")
      .first()
      .selectOption({ label: "Majas jul – kortversjon (spinoff)" });
    await page.waitForTimeout(1000);
  },
});
// DEC-0058: engelsk manus og undertekster
await shot("93-engelsk-manus", manus, {
  act: async (page) => {
    await page.waitForTimeout(1200);
    await page.getByLabel("Manusspråk").selectOption("en");
    await page.waitForTimeout(800);
  },
});
await shot("94-oversettelse-inspektor", manus, {
  act: async (page) => {
    await page.waitForTimeout(1200);
    await page.getByLabel("Manusspråk").selectOption("en");
    await page.waitForTimeout(600);
    await page.getByText("knocking on the door!").first().click();
    await page.waitForTimeout(600);
  },
});
await shot("95-undertekster", montering, {
  act: async (page) => {
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /^Mer/ }).click();
    await page.getByRole("menuitem", { name: /Undertekster/ }).click();
    await page.getByRole("dialog").locator("select").first().selectOption("en");
    await page.waitForTimeout(500);
  },
});
// DEC-0059: engelsk versjon av filmen
await shot("96-engelsk-film", montering, {
  act: async (page) => {
    await page.waitForTimeout(1200);
    await page.getByLabel("Dialogspråk").selectOption("en");
    await page.getByLabel("Undertekster i bildet").selectOption("en");
    await page.waitForTimeout(400);
    // Avspillingshodet inn i den første replikken
    await page.keyboard.press("ArrowRight");
    for (let i = 0; i < 30; i++) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(800);
  },
});
await shot("97-sprakversjon", montering, {
  act: async (page) => {
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /^Mer/ }).click();
    await page.getByRole("menuitem", { name: /Språkversjon/ }).click();
    await page.waitForTimeout(600);
  },
});
await shot("98-eksport-sprak", montering, {
  act: async (page) => {
    await page.waitForTimeout(1200);
    await page.getByLabel("Dialogspråk").selectOption("en");
    await page.getByRole("button", { name: /Eksporter animatic/ }).click();
    await page.getByRole("dialog").getByText("Bare dialogspor (WAV)").click();
    await page.waitForTimeout(500);
  },
});
await shot("99-lyd-sprak", montering, {
  act: async (page) => {
    await page.waitForTimeout(1200);
    await page.getByLabel("Dialogspråk").selectOption("en");
    await page.waitForTimeout(400);
    // Lydklippet i dialogsporet (scene 1)
    await page
      .getByRole("button", { name: /Maja: Can you hear that/ })
      .first()
      .click();
    await page.waitForTimeout(500);
  },
});
// DEC-0060: tilbakeføring fra spinoff, kontinuitet i spinoffen og varsler om hull
await shot("100-tilbakefor", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page.waitForTimeout(1000);
    await page
      .getByRole("button", { name: /Tilbakefør/ })
      .first()
      .click();
    await page.waitForTimeout(600);
  },
});
await shot("101-analyse-spinoff", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page.waitForTimeout(1000);
    await page
      .getByLabel("Produksjon for analysen")
      .selectOption({ label: "Majas jul – kortversjon" });
    await page.waitForTimeout(500);
    await page.getByRole("heading", { name: "Kontinuitetsanalyse" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  },
});
await shot("102-kontinuitet-spinoff", bibliotek, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page
      .getByLabel("Produksjon for bruk i scener og kontinuitet")
      .selectOption({ label: "Majas jul – kortversjon" });
    await page.waitForTimeout(500);
    await openMaja(page);
    await page.getByRole("region", { name: "Kontinuitet" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  },
});
await shot("18-oversikt-varighet", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page.getByRole("button", { name: "Per scene" }).click();
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(400);
  },
});
// Varighet og produksjonsstatus (natt til 12.10.2026): filter på karakter
await shot("80b-oversikt-status-filter", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page
      .getByRole("heading", { name: "Varighet og produksjonsstatus" })
      .scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Per scene" }).click();
    await page.getByLabel("Karakter, objekt eller sted").selectOption({ label: "Maja" });
    // Planlagt lengde for scene 2 (lagres ikke uten server; feltet viser verdien)
    await page.getByLabel("Planlagt lengde for scene 2").fill("1:20");
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(400);
  },
});
// Utvikling over tid (mandat 7.4, REQ-0120)
await shot("80c-oversikt-utvikling", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page.getByRole("button", { name: "Utvikling over tid" }).click();
    await page.waitForTimeout(800);
    await page.getByRole("table", { name: /per manusversjon/ }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  },
});
// Lagring uten server (mock): optimistisk endring, så feilmelding og ny henting
await shot("13-lagringsfeil", manus, {
  act: async (page) => {
    await page.getByRole("switch", { name: "Endre rekkefølge og synlighet" }).click();
    await page.getByRole("switch", { name: "Deaktiver scene 3", exact: true }).click();
    await page.waitForTimeout(3000);
  },
});
// Forhåndsvisning av import med en ekte fil (ligger utenfor repoet): IMPORT_FILE=/sti/til/manus.pdf
if (process.env.IMPORT_FILE) {
  await shot("11-import-forhandsvisning", manus, {
    act: async (page) => {
      await page.getByRole("button", { name: "Importer manus" }).first().click();
      await page.locator("input[type=file]").setInputFiles(process.env.IMPORT_FILE);
      await page.getByRole("button", { name: /^Importer \d+ scener/ }).waitFor({ timeout: 60000 });
    },
  });
}
// Prosjektets format (DEC-0039): endring av bildefrekvens viser advarselen om tilpasning
await shot("37-oversikt-format", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page
      .getByRole("heading", { name: "Bildeformat og bildefrekvens" })
      .scrollIntoViewIfNeeded();
    await page.getByLabel("Bilder per sekund").selectOption({ label: "50" });
    await page.waitForTimeout(400);
  },
});
// «I denne scenen» (DEC-0037): dra Maja fra panelet inn på lerretet (faller tilbake til «+»)
await shot("38-sceneeditor-i-scenen", scene, {
  act: async (page, file) => {
    await page.waitForTimeout(800);
    // Lagringen mockes ikke: forespørselen får aldri svar, så endringen blir stående som «lagrer»
    await page.route("**/_serverFn/**", () => {});
    const panel = page.getByRole("region", { name: "I denne scenen" });
    const card = panel.locator("li", { hasText: "Maja" }).first();
    const canvas = page.locator("canvas").first();
    const layerCount = async () =>
      /\((\d+)\)/.exec(await page.getByRole("heading", { name: /^Lag \(/ }).innerText())?.[1];
    const before = await layerCount();
    try {
      await card.dragTo(canvas, { targetPosition: { x: 200, y: 150 }, timeout: 5000 });
    } catch (e) {
      console.error("dragTo feilet:", String(e).split("\n")[0]);
    }
    await page.waitForTimeout(400);
    const after = await layerCount();
    if (after === before) {
      console.error("dra-og-slipp la ikke til lag, bruker «+»");
      await card.hover();
      await panel
        .getByRole("button", { name: /Legg «Maja»/ })
        .first()
        .click();
      await page.waitForTimeout(400);
    }
    console.error(`lag før ${before}, etter ${await layerCount()}`);
  },
});
// Justerbare paneler (DEC-0038): bredden på scenelisten huskes etter navigasjon til biblioteket og tilbake
await shot("39-paneler-justert", manus, {
  act: async (page) => {
    const bar = page.getByRole("separator", { name: "Bredde på scenelisten" });
    const b = await bar.boundingBox();
    const w0 = Number(await bar.getAttribute("aria-valuenow"));
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2, { steps: 5 });
    await page.mouse.move(b.x + b.width / 2 + 120, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const w1 = Number(await bar.getAttribute("aria-valuenow"));
    await page
      .getByRole("link", { name: /Ressursbibliotek/ })
      .first()
      .click();
    await page.waitForTimeout(800);
    await page
      .getByRole("link", { name: /^Manus/ })
      .first()
      .click();
    await page.waitForTimeout(800);
    const w2 = Number(
      await page
        .getByRole("separator", { name: "Bredde på scenelisten" })
        .getAttribute("aria-valuenow"),
    );
    console.error(`panelbredde: start ${w0}, etter drag ${w1}, etter navigasjon ${w2}`);
  },
});
// Lag og grupper (ønske 11.10): valgt gruppe lyser opp lagene, fjern-knapp og høyere lagliste
await shot("67-gruppe-lyser", scene, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page
      .getByRole("region", { name: "Lag" })
      .getByRole("button", { name: /Familien/ })
      .first()
      .click();
    const bar = page.getByRole("separator", { name: "Høyde på laglisten" });
    const b = await bar.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + 120, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    console.error(`laglistehøyde: ${await bar.getAttribute("aria-valuenow")}`);
  },
});
await shot("68-kamera-aktivt-utsnitt", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Neste scene" }).click();
    await page.waitForTimeout(800);
    const cam = tidslinje(page).getByRole("button", { name: /^Kamerautsnitt/ });
    if (await cam.count()) await cam.first().click();
    await page.waitForTimeout(500);
    const btn = page.getByRole("button", { name: "Bruk aktivt utsnitt" }).first();
    console.error(
      `aktivt utsnitt: ${(await btn.count()) ? ((await btn.isEnabled()) ? "aktiv" : "deaktivert") : "mangler"}`,
    );
    if (await btn.count()) await btn.scrollIntoViewIfNeeded();
  },
});
// Roller og tilbake (DEC-0063): eieren endrer roller; «Tilbake til …» i toppstripen
await shot("69-roller", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page.getByRole("heading", { name: "Medlemmer" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  },
});
await shot("70-tilbake", `/prosjekt/${project.id}/manus`, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page
      .getByRole("link", { name: /Ressursbibliotek/ })
      .first()
      .click();
    await page.waitForTimeout(800);
    const back = page.getByRole("button", { name: "Tilbake til Manus" });
    console.error(`tilbake-knapp: ${await back.count()}`);
    await page.screenshot({ path: `${out}/70-tilbake-for.png` });
    await back.click();
    await page.waitForTimeout(800);
    console.error(`etter tilbake: ${new URL(page.url()).pathname}`);
  },
});
// Bilde i fullskjerm med zoom og nedlasting (DEC-0064)
await shot("71-fullskjerm-bilde", `/prosjekt/${project.id}/bibliotek`, {
  act: async (page, file) => {
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /^Maja/ }).first().click();
    await page.waitForTimeout(800);
    await page
      .getByRole("button", { name: /i fullskjerm$/ })
      .first()
      .dblclick();
    await page.waitForTimeout(800);
    const dlg = page.getByRole("dialog", { name: /^Bilde:/ });
    console.error(`fullskjerm: ${await dlg.count()} ${await dlg.getAttribute("aria-label")}`);
    await page.getByRole("button", { name: "Zoom inn" }).click();
    await page.getByRole("button", { name: "Zoom inn" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: file });
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
      dlg.getByRole("button", { name: "Last ned", exact: true }).click(),
    ]);
    console.error(`nedlasting: ${dl ? dl.suggestedFilename() : "ingen"}`);
    return "tatt";
  },
  plainDownload: true,
});
await shot("72-last-opp-igjen", `/prosjekt/${project.id}/bibliotek`, {
  act: async (page) => {
    await page.waitForTimeout(800);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: /Last opp endrede bilder/ }).click(),
    ]);
    await chooser.setFiles([
      { name: "Maja - Animatic - v3 (1).png", mimeType: "image/png", buffer: png },
      { name: "skisse.png", mimeType: "image/png", buffer: png },
    ]);
    await page.waitForTimeout(600);
  },
});
// Filmens visuelle stil og AI-beskrivelse med sammenheng (DEC-0065)
await shot("73-visuell-stil", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page.getByRole("heading", { name: "Filmens visuelle stil" }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: /^Lag …|^Rediger …/ }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /Foreslå utkast/ }).click();
    await page
      .getByLabel("Hva filmen handler om")
      .fill(
        "A ten-year-old girl spends Christmas with her grandmother on a farm in Dovre and discovers that the farm's nisse is real.",
      );
    await page
      .getByLabel("Teknikk og materialer")
      .fill("Watercolour and gouache on textured paper, soft edges, visible brush strokes.");
    await page.waitForTimeout(400);
  },
});
await shot("74-ai-beskrivelse-scene", scene, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page
      .getByRole("region", { name: "Lag" })
      .getByRole("button", { name: /^Maja/ })
      .first()
      .dblclick();
    await page.waitForTimeout(800);
    const ta = page.getByLabel("Beskrivelse for AI-generering");
    await ta.scrollIntoViewIfNeeded();
    console.error(`beskrivelse: ${(await ta.inputValue()).split("\n").slice(0, 3).join(" | ")}`);
  },
});
// AI skriver beskrivelsen, bildene som sendes med (DEC-0066). Kallet får aldri svar: «Skriver …» vises.
await shot("75-ai-skriver-beskrivelse", scene, {
  act: async (page) => {
    await page.waitForTimeout(1500);
    await page.route("**/_serverFn/**", () => {});
    await page
      .getByRole("region", { name: "Lag" })
      .getByRole("button", { name: /^Maja/ })
      .first()
      .dblclick();
    await page.waitForTimeout(800);
    const b = page.getByRole("button", { name: /Skriv beskrivelsen med AI/ });
    await b.scrollIntoViewIfNeeded();
    await b.click();
    await page.waitForTimeout(500);
  },
});
// Utgivelse (DEC-0061): karakterkart, kinopitch, redigering, relasjoner og eksport
// DEC-0073: fjern alle oversettelser til et språk
await shot("17c-fjern-oversettelser", manus, {
  act: async (page) => {
    await page.getByLabel("Manusspråk").selectOption("en");
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: /Fjern oversettelsene/ }).click();
    await page.waitForTimeout(400);
  },
});
const utgivelse = `/prosjekt/${project.id}/utgivelse`;
await shot("60-utgivelse-karakterkart", utgivelse, {
  act: async (page) => {
    await page.waitForTimeout(800);
  },
});
await shot("61-utgivelse-pitch", utgivelse, {
  act: async (page) => {
    await page
      .getByRole("button", { name: /Kinopitch/ })
      .first()
      .click();
    await page.waitForTimeout(800);
  },
});
await shot("62-utgivelse-element", utgivelse, {
  act: async (page) => {
    const svg = page.getByRole("application", { name: /Plakaten/ });
    const b = await svg.boundingBox();
    // Klikk på tittelen øverst og dra den litt ned
    await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.07);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.1, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  },
});
await shot("63-utgivelse-kontroll", utgivelse, {
  act: async (page) => {
    await page.getByRole("tab", { name: "Kontroll" }).click();
    await page.waitForTimeout(300);
  },
});
await shot("64-utgivelse-relasjoner", utgivelse, {
  act: async (page) => {
    await page.getByRole("button", { name: /Relasjoner/ }).click();
    await page.waitForTimeout(400);
  },
});
await shot("65-utgivelse-ny", utgivelse, {
  act: async (page) => {
    await page.getByRole("button", { name: "Ny", exact: true }).click();
    await page.waitForTimeout(400);
  },
});
await shot("66-utgivelse-eksport", utgivelse, {
  plainDownload: true,
  act: async (page, file) => {
    await page.getByRole("button", { name: "Eksporter" }).click();
    await page.waitForTimeout(300);
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.getByRole("button", { name: "Lag filen" }).click(),
    ]);
    const path = `${out}/66-plakat.pdf`;
    await dl.saveAs(path);
    console.error(`plakat-pdf: ${dl.suggestedFilename()}`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: file });
    await page.getByRole("radio", { name: "PNG-bilde" }).click();
    const [dl2] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.getByRole("button", { name: "Lag filen" }).click(),
    ]);
    await dl2.saveAs(`${out}/66-plakat.png`);
    console.error(`plakat-png: ${dl2.suggestedFilename()}`);
    return "tatt";
  },
});
await browser.close();
console.log(JSON.stringify(shots, null, 1));
