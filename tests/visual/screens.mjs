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
  await page.route(`${supaUrl}/**`, async (route) => {
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
        ? json([{ version: 4 }])
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
  if (opts.act) await opts.act(page);
  const file = `${out}/${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
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
await browser.close();
console.log(JSON.stringify(shots, null, 1));
