/**
 * ML4 (B-049): releasekontroll av språkdekningen. Norsk (nb) og engelsk (en) skal være komplette:
 * samme nøkler, ikke-tom tekst, de samme navngitte plassholderne og flertallsformer på begge språk.
 * Er dekningen under 100 %, stopper bygget (vite-tillegget i vite.config.ts) og kommandoen avslutter med 1.
 * en-XA genereres fra en og rapporteres bare (ikke krav).
 *
 *   node scripts/i18n/release-check.mjs            (kontroll + rapport i konsollen)
 *   node scripts/i18n/release-check.mjs --write    (skriver også docs/development/i18n-coverage.json)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const placeholders = (text) => [...String(text).matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]).sort().join(",");

function entryTexts(entry) {
  if (!entry || typeof entry !== "object") return [];
  const out = [];
  if (typeof entry.text === "string") out.push(entry.text);
  if (entry.plural && typeof entry.plural === "object") for (const v of Object.values(entry.plural)) if (typeof v === "string") out.push(v);
  return out;
}

/** Dekningen per språk og en liste over feil. Ren funksjon over katalogene (testes i tests/unit). */
export function coverageReport(catalogs, runtime, superseded = new Set()) {
  const nb = catalogs.nb ?? {}, en = catalogs.en ?? {}, xa = catalogs["en-XA"] ?? {};
  // Nøkler fra ML1-grunnlinjen som er avløst av håndskrevne meldinger (authored.json), lastes aldri og telles ikke.
  const keys = [...new Set([...Object.keys(nb), ...Object.keys(en)])].filter((k) => !superseded.has(k)).sort();
  const problems = [];
  let nbOk = 0, enOk = 0, xaOk = 0;
  for (const key of keys) {
    const a = nb[key], b = en[key];
    const ta = entryTexts(a), tb = entryTexts(b);
    // En bevisst tom tekst (tom på begge språk, for eksempel en etikett uten ord) er komplett.
    const bothEmpty = ta.length === 1 && tb.length === 1 && ta[0] === "" && tb[0] === "";
    const aOk = bothEmpty || (ta.length > 0 && ta.every((t) => t.trim() !== ""));
    const bOk = bothEmpty || (tb.length > 0 && tb.every((t) => t.trim() !== ""));
    if (!aOk) problems.push({ key, problem: "nb mangler" });
    if (!bOk) problems.push({ key, problem: "en mangler" });
    if (aOk && bOk && placeholders(a.text) !== placeholders(b.text)) problems.push({ key, problem: "ulike plassholdere" });
    if (aOk && bOk && !!a.plural !== !!b.plural) problems.push({ key, problem: "flertallsform bare på ett språk" });
    if (aOk) nbOk++;
    if (bOk) enOk++;
    if (entryTexts(xa[key]).length > 0) xaOk++;
  }
  if (runtime) {
    for (const lang of ["nb", "en"]) for (const key of Object.keys(runtime[lang] ?? {})) if (!(key in (catalogs[lang] ?? {}))) problems.push({ key, problem: `runtime har nøkkel som mangler i ${lang}-katalogen` });
    const rn = new Set(Object.keys(runtime.nb ?? {})), re = new Set(Object.keys(runtime.en ?? {}));
    for (const k of rn) if (!re.has(k)) problems.push({ key: k, problem: "runtime: en mangler" });
    for (const k of re) if (!rn.has(k)) problems.push({ key: k, problem: "runtime: nb mangler" });
  }
  const pct = (n) => (keys.length === 0 ? 100 : Math.floor((n / keys.length) * 10000) / 100);
  return {
    keys: keys.length,
    superseded: superseded.size,
    coverage: { nb: pct(nbOk), en: pct(enOk), "en-XA": pct(xaOk) },
    complete: problems.length === 0 && nbOk === keys.length && enOk === keys.length,
    problems,
  };
}

/** Leser katalogene fra disk og returnerer rapporten. */
export function releaseCoverage() {
  const catalogs = {
    nb: read("src/core/i18n/locales/nb.json"),
    en: read("src/core/i18n/locales/en.json"),
    "en-XA": read("src/core/i18n/locales/en-XA.json"),
  };
  const mapping = read("scripts/i18n/mapping.v1.json");
  const superseded = new Set(mapping.entries.filter((e) => e.supersededBy).map((e) => e.key));
  return coverageReport(catalogs, read("src/core/i18n/runtime.gen.json"), superseded);
}

/** Kaster en feil med en lesbar melding hvis nb eller en ikke er komplette (brukes av bygget). */
export function assertReleaseCoverage() {
  const r = releaseCoverage();
  if (!r.complete) {
    const sample = r.problems.slice(0, 10).map((p) => `  ${p.key}: ${p.problem}`).join("\n");
    throw new Error(`Språkdekningen er ikke komplett (nb ${r.coverage.nb} %, en ${r.coverage.en} %, ${r.problems.length} feil). Bygget stoppes.\n${sample}`);
  }
  return r;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = releaseCoverage();
  console.log(`Nøkler: ${r.keys} (+ ${r.superseded} avløst av authored.json). Dekning: nb ${r.coverage.nb} %, en ${r.coverage.en} %, en-XA ${r.coverage["en-XA"]} % (generert).`);
  if (process.argv.includes("--write")) writeFileSync(join(ROOT, "docs/development/i18n-coverage.json"), JSON.stringify({ keys: r.keys, superseded: r.superseded, coverage: r.coverage, complete: r.complete, problems: r.problems }, null, 2) + "\n");
  if (!r.complete) {
    for (const p of r.problems.slice(0, 30)) console.log(`  FEIL ${p.key}: ${p.problem}`);
    console.log(`Releasekontrollen stopper: ${r.problems.length} feil.`);
    process.exit(1);
  }
  console.log("Releasekontrollen er bestått: nb og en er komplette.");
}
