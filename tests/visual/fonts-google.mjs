/** B-098: «Legg til font …» fra Google Fonts. Mocket katalog og fontfil (ingen nettkall mot Google):
 * søk, forhåndsvis, legg til, bruk i et tekstlag, fonten lastes for eksport, angring, og rolig melding når
 * katalogen ikke er tilgjengelig.
 * Fixture: bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json
 * ENV_FILE=… [UI_LANG=en] node tests/visual/fonts-google.mjs <baseUrl> /tmp/claude-0/mts-fixture.json [out]
 */
import { readFileSync } from "node:fs";
import { harness } from "./mts-harness.mjs";
import { byLang } from "./ui-lang.mjs";

const h = harness("/tmp/claude-0/fonts-google");
const { M, state, hooks, check, scenario, selectLayer, lastFields, eventually, finish } = h;

// Fontfilen er en lokal OFL-font fra node_modules (aldri hentet fra Google)
const WOFF2 = readFileSync(new URL("../../node_modules/@fontsource/lora/files/lora-latin-400-normal.woff2", import.meta.url));
const B64 = WOFF2.toString("base64");
const CATALOG = [
  { family: "Mock Serif", category: "serif", subsets: ["latin", "latin-ext"], variants: [{ weight: 400, italic: false }, { weight: 700, italic: false }], license: "OFL-1.1", version: "v1", popularity: 10 },
  { family: "Mock Hand", category: "handwriting", subsets: ["latin"], variants: [{ weight: 400, italic: false }], license: "OFL-1.1", version: "v1", popularity: 5 },
  { family: "Ubuntu", category: "sans", subsets: ["latin", "greek"], variants: [{ weight: 400, italic: false }], license: "UFL-1.0", version: "v1", popularity: 3 },
];
const calls = [];
let catalogDown = false;

hooks.serverFn = (name, d) => {
  if (/^listGoogleFonts(?:_|$)/.test(name)) { calls.push("list"); return catalogDown ? { ok: false, code: "unavailable" } : { ok: true, value: CATALOG }; }
  if (/^googleFontPreview(?:_|$)/.test(name)) { calls.push(`preview:${d.family}`); return { ok: true, value: { base64: B64 } }; }
  if (/^googleFontPackage(?:_|$)/.test(name)) {
    calls.push(`package:${d.family}:${(d.variants ?? []).length}`);
    return { ok: true, value: (d.variants ?? []).flatMap((v) => [
      { weight: v.weight, italic: v.italic, format: "woff2", subset: "latin", unicodeRange: "U+0000-00FF", base64: B64 },
      { weight: v.weight, italic: v.italic, format: "ttf", base64: B64 },
    ]) };
  }
  return undefined;
};
// Fontpakken som ble lastet opp, serveres tilbake ved nedlasting (multipart → selve filen)
hooks.storage = (path) => {
  if (!/\.ptgfont/.test(path)) return null;
  const buf = state.uploadBodies.at(-1);
  if (!buf) return null;
  const start = buf.indexOf("PTGFONT1");
  const end = buf.lastIndexOf("\r\n--");
  return { contentType: "application/octet-stream", body: start >= 0 ? buf.subarray(start, end > start ? end : buf.length) : buf };
};

await scenario("B098-legg-til-bruk-angre", M.sceneA, "nb", async (page) => {
  const lang = process.env.UI_LANG === "en" ? "en" : "nb";
  await selectLayer(page, M.textLayer);
  const picker = page.getByTestId("mts-font");
  const addLabel = byLang(lang, "Legg til font …", "Add font …");
  check((await picker.locator("option").last().textContent())?.trim() === addLabel, "inngang: «Legg til font …» står nederst i fontvelgeren");
  await picker.selectOption("__add-font__");
  const dialog = page.getByTestId("font-add-dialog");
  await dialog.waitFor({ timeout: 5000 });
  check(await dialog.getByRole("heading", { name: byLang(lang, "Legg til font", "Add font") }).isVisible(), "dialogen åpnes med riktig tittel");
  check(lastFields(M.textLayer)?.text?.fontId !== "__add-font__", "valget «Legg til font …» lagres aldri som font");
  await eventually(async () => (await page.getByTestId("font-result").count()) === 3);
  check((await page.getByTestId("font-result").count()) === 3, "katalogen vises (via serveren)");
  // Søk og filtre
  await page.getByTestId("font-search").fill("hand");
  check(await eventually(async () => (await page.getByTestId("font-result").count()) === 1), "søk etter navn");
  await page.getByTestId("font-search").fill("https://fonts.google.com/specimen/Mock+Serif");
  check(await eventually(async () => (await page.getByTestId("font-result").first().textContent())?.includes("Mock Serif")), "innlimt lenke fra fonts.google.com virker i søket");
  await page.getByTestId("font-search").fill("");
  await page.getByTestId("font-category").selectOption("handwriting");
  check(await eventually(async () => (await page.getByTestId("font-result").count()) === 1), "filter på kategori");
  await page.getByTestId("font-category").selectOption("");
  await page.getByTestId("font-subset").selectOption("greek");
  check(await eventually(async () => (await page.getByTestId("font-result").count()) === 1), "filter på skriftsystem");
  await page.getByTestId("font-subset").selectOption("");
  const link = page.getByTestId("font-open-google");
  check((await link.getAttribute("href")) === "https://fonts.google.com/" && (await link.getAttribute("target")) === "_blank", "«Åpne Google Fonts» åpner fonts.google.com i ny fane");
  // UFL-varsel
  await page.getByTestId("font-result").filter({ hasText: "Ubuntu" }).click();
  check(await page.getByTestId("font-license-notice").isVisible(), "UFL gir lisensvarsel");
  // Forhåndsvisning med egen prøvetekst (æ, ø, å som standard)
  await page.getByTestId("font-result").filter({ hasText: "Mock Serif" }).click();
  const sample = await page.getByTestId("font-sample").inputValue();
  check(/[æøå]/.test(sample), "standard prøvetekst har æ, ø og å");
  await page.getByTestId("font-sample").fill("Jula på Dovre ÆØÅ");
  check(await eventually(async () => (await page.getByTestId("font-preview").getAttribute("data-loaded")) === "true", 6000), "forhåndsvisningen lastes via serveren");
  check((await page.getByTestId("font-preview").textContent())?.includes("Jula på Dovre ÆØÅ"), "egen prøvetekst vises");
  check((await page.getByTestId("font-license").textContent())?.includes("OFL-1.1"), "lisensen vises");
  await page.getByTestId("font-variant-700").check();
  await page.getByTestId("font-add-confirm").click();
  check(await eventually(() => calls.some((c) => c === "package:Mock Serif:2"), 6000), "valgte vekter (400 og 700) hentes via serveren");
  await dialog.waitFor({ state: "hidden", timeout: 10000 });
  // Ressursen og fontpakken
  check(await eventually(() => state.uploads.some((u) => /\.ptgfont$/.test(u)), 3000), "fontpakken lagres i prosjektets lagring");
  const created = state.commands.find((c) => c?.type === "CreateAssets" && c.assets?.[0]?.fields?.kind === "font");
  const version = state.commands.find((c) => c?.type === "AddAssetVersion" && c.font);
  check(!!created && !!version, "fonten lagres som ressurs av typen font");
  check(version?.font?.family === "Mock Serif" && version.font.license === "OFL-1.1" && version.font.weights.join(",") === "400,700" && /fonts\.google\.com\/specimen/.test(version.font.sourceUrl), "metadata: familie, vekter, lisens og kilde");
  check(version?.font?.files.some((f) => f.format === "ttf") && version.font.files.some((f) => f.format === "woff2"), "pakken har woff2 og ttf");
  const assetId = created?.assets?.[0]?.assetId;
  const fontId = `asset:${assetId}`;
  check(await eventually(() => lastFields(M.textLayer)?.text?.fontId === fontId, 4000), "tekstlaget bruker den nye fonten");
  // Fonten er i fontvelgeren og lastes (samme lasting som eksporten venter på)
  check(await eventually(async () => (await picker.locator(`option[value="${fontId}"]`).count()) === 1, 4000), "fonten står i fontvelgeren i prosjektet");
  const loaded = await eventually(
    () => page.evaluate((id) => [...document.fonts].some((f) => f.family.replace(/"/g, "").startsWith("Mock Serif PTG-") && f.status === "loaded"), fontId),
    8000,
  );
  check(loaded, "fonten lastes fra prosjektets lagring med FontFace (brukes av forhåndsvisning og eksport)");
  check(!(await page.getByTestId("mts-font-missing").isVisible().catch(() => false)), "ingen advarsel om manglende font");
  check(!calls.some((c) => /gstatic|googleapis/.test(c)), "nettleseren hentet ingenting fra Google");
  // Angring: først fontvalget, så selve fonten
  const before = state.commands.length;
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(800);
  await page.keyboard.press("Control+z");
  check(await eventually(() => state.commands.slice(before).some((c) => c?.type === "UndoAddAssetVersion"), 5000), "angre fjerner fonten igjen (ett angresteg for hele fonten)");
});

await scenario("B098-katalog-utilgjengelig", M.sceneA, "nb", async (page) => {
  const lang = process.env.UI_LANG === "en" ? "en" : "nb";
  catalogDown = true;
  await selectLayer(page, M.textLayer);
  await page.getByTestId("mts-font").selectOption("__add-font__");
  const msg = page.getByTestId("font-catalog-unavailable");
  await msg.waitFor({ timeout: 5000 });
  check((await msg.textContent())?.includes(byLang(lang, "Google Fonts-katalogen er ikke tilgjengelig nå", "The Google Fonts catalogue is not available right now")), "rolig melding når katalogen ikke er tilgjengelig");
  await page.keyboard.press("Escape");
  await page.getByTestId("mts-font").selectOption("lora");
  check(await eventually(() => lastFields(M.textLayer)?.text?.fontId === "lora"), "resten av appen virker som før");
  catalogDown = false;
});

await finish();
