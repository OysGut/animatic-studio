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

async function mock(page, { projects = [project], schema = true }) {
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
    if (path.startsWith("/storage/v1/object/sign/")) {
      const n = (path.length * 37) % 360;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect width="300" height="400" fill="hsl(${n} 25% 22%)"/><circle cx="150" cy="120" r="60" fill="hsl(${n} 45% 70%)"/><path d="M60 380 Q150 170 240 380Z" fill="hsl(${n} 45% 60%)"/></svg>`;
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
    }
    const table = path.replace("/rest/v1/", "");
    if (table === "schema_version")
      return schema
        ? json([{ version: 8 }])
        : json({ message: "relation does not exist", code: "42P01" }, 404);
    if (table === "projects") {
      if (single) return json(projects[0] ?? null);
      return json(
        projects.map((p) => ({ ...p, project_members: [{ role: "owner", user_id: USER.id }] })),
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
    await page.getByLabel("Vis kun valgt scene").check();
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
    await page.getByRole("button", { name: "Forhåndsvisning" }).click();
    await page.waitForTimeout(700);
  },
});
await shot("43-forhandsvisning-flyttet-zoom", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await gaTilBilde(page, 40);
    await page.getByRole("button", { name: "Forhåndsvisning" }).click();
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
    await page.getByRole("button", { name: "Forhåndsvisning" }).click();
  },
});
await shot("44-forhandsvisning-eget-vindu", scene, {
  act: async (page) => {
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Forhåndsvisning" }).click();
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
    await page.getByRole("button", { name: "Forhåndsvisning" }).click(); // lukk
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
      page.getByRole("button", { name: "Forhåndsvisning" }).click(),
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
    }
  },
});
await shot("18-oversikt-varighet", `/prosjekt/${project.id}`, {
  act: async (page) => {
    await page.getByRole("button", { name: "Per scene" }).click();
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(400);
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
await browser.close();
console.log(JSON.stringify(shots, null, 1));
