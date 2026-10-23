/**
 * Register for ID-merket i vinduene (Øystein 23.10). Felles skanning for tildeling (`--assign`), generert
 * oversikt (docs/development/UI_IDS.md) og arkitekturtesten.
 *
 *   node scripts/ui-ids/ui-ids.mjs --assign   tildeler neste ledige nummer til nye vinduer og skriver registeret
 *   node scripts/ui-ids/ui-ids.mjs            skriver bare oversikten på nytt
 *
 * Nummer tildeles én gang og gjenbrukes aldri; vinduer som forsvinner fra koden merkes «fjernet».
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const REGISTRY = "src/app/ui-ids.ts";
export const DOC = "docs/development/UI_IDS.md";
export const CONTENT_TAGS = ["DialogContent", "ResizableDialogContent", "AlertDialogContent", "SheetContent", "PopoverContent"];
const KIND = { DialogContent: "dialog", ResizableDialogContent: "dialog", AlertDialogContent: "bekreftelse", SheetContent: "sheet", PopoverContent: "popup" };
const KIND_NB = { dialog: "Dialog", bekreftelse: "Bekreftelsesdialog", sheet: "Sidepanel", popup: "Popup", panel: "Flytende panel", side: "Side", feilside: "Feilside" };
/** Filer som definerer selve skallet (bruker taggene internt og sender uiId videre). */
const SHELL_FILES = new Set(["src/app/shared/ResizableDialogContent.tsx"]);
const TAG_RE = new RegExp(`<(${CONTENT_TAGS.join("|")})\\b(\\s+uiId="(V-\\d{3})")?`, "g");
const PANEL_RE = /<UiId\s+id="(V-\d{3}|NEW)"/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}
export function sourceFiles(root = ROOT) {
  return walk(join(root, "src")).map((p) => relative(root, p).split("\\").join("/"))
    .filter((f) => !f.startsWith("src/components/ui/") && !f.startsWith("src/integrations/") && f !== "src/routeTree.gen.ts" && !SHELL_FILES.has(f));
}
export function routeFiles(root = ROOT) {
  return readdirSync(join(root, "src/routes")).filter((n) => n.endsWith(".tsx") && n !== "__root.tsx").map((n) => `src/routes/${n}`);
}
export function routeIdOf(file) {
  const parts = basename(file, ".tsx").split(".");
  if (parts.length === 1 && parts[0] === "index") return "/";
  if (parts[parts.length - 1] === "index") return `/${parts.slice(0, -1).join("/")}/`;
  return `/${parts.join("/")}`;
}

function componentAt(src, pos) {
  const re = /(?:function\s+([A-Z]\w*)|const\s+([A-Z]\w*)\s*=)/g;
  let name = "?", m;
  while ((m = re.exec(src)) && m.index < pos) name = m[1] ?? m[2];
  return name;
}
let nb = null;
function nbText(key) {
  nb ??= JSON.parse(readFileSync(join(ROOT, "src/core/i18n/locales/nb.json"), "utf8"));
  const text = nb[key]?.text;
  return typeof text === "string" ? text.replace(/\s+/g, " ").slice(0, 70) : null;
}
function nearText(src, pos) {
  const m = /\bt\("([^"]+)"/.exec(src.slice(pos, pos + 1500));
  return m ? nbText(m[1]) : null;
}

/** Alle ID-steder i koden: { file, tag, id|null, index, component, kind, text }. */
export function scanCode(root = ROOT) {
  const out = [];
  for (const file of sourceFiles(root)) {
    const src = readFileSync(join(root, file), "utf8");
    for (const m of src.matchAll(TAG_RE)) out.push({ file, tag: m[1], id: m[3] ?? null, index: m.index, component: componentAt(src, m.index), kind: KIND[m[1]], text: nearText(src, m.index) });
    for (const m of src.matchAll(PANEL_RE)) {
      const page = /page\b/.test(src.slice(m.index, m.index + 80));
      out.push({ file, tag: "UiId", id: m[1] === "NEW" ? null : m[1], index: m.index, component: componentAt(src, m.index), kind: page ? "feilside" : "panel", text: nearText(src, Math.max(0, m.index - 1500)) });
    }
  }
  return out;
}

export function readRegistry(root = ROOT) {
  const p = join(root, REGISTRY);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").filter((l) => l.startsWith('  {"id":')).map((l) => JSON.parse(l.trim().replace(/,$/, "")));
}

function nextNumber(entries) {
  return entries.reduce((n, e) => Math.max(n, Number(e.id.slice(2))), 0) + 1;
}
const fmt = (n) => `V-${String(n).padStart(3, "0")}`;

export function renderRegistry(entries) {
  const lines = entries.map((e) => `  ${JSON.stringify(e)},`);
  return `/**
 * Register over ID-merkene i vinduene (Øystein 23.10). Generert og vedlikeholdt av
 * \`node scripts/ui-ids/ui-ids.mjs --assign\`. Nummer gjenbrukes aldri; fjernede vinduer beholder raden med
 * status «fjernet». Oversikt: docs/development/UI_IDS.md.
 */
export interface UiIdEntry {
  readonly id: string;
  readonly kind: string;
  readonly component: string;
  readonly file: string;
  readonly description: string;
  readonly route?: string;
  readonly status: "aktiv" | "fjernet";
}

// i18n-ignore-start: registeret er intern feilsøkingsinformasjon og vises ikke som tekst
export const UI_IDS: readonly UiIdEntry[] = [
${lines.join("\n")}
];
// i18n-ignore-end

const BY_ID = new Map(UI_IDS.map((e) => [e.id, e]));
const BY_ROUTE = new Map(UI_IDS.filter((e) => e.route && e.status === "aktiv").map((e) => [e.route!, e]));
export function uiIdEntry(id: string): UiIdEntry | undefined {
  return BY_ID.get(id);
}
export function uiIdForRoute(routeId: string): UiIdEntry | undefined {
  return BY_ROUTE.get(routeId);
}
`;
}

export function renderDoc(entries) {
  const esc = (s) => String(s).replace(/\|/g, "\\|");
  return `# ID-merker i vinduene

Generert fra \`src/app/ui-ids.ts\` med \`node scripts/ui-ids/ui-ids.mjs\`. Ikke rediger for hånd.
Merket nederst i hvert vindu viser «V-nnn · commit». Slå opp nummeret her.

| ID | Type | Fil | Komponent | Beskrivelse | Status |
|---|---|---|---|---|---|
${entries.map((e) => `| ${e.id} | ${e.kind} | \`${e.file}\` | ${esc(e.component)} | ${esc(e.description)} | ${e.status} |`).join("\n")}
`;
}

function describe(hit) {
  const base = KIND_NB[hit.kind] ?? hit.kind;
  return hit.text ? `${base} «${hit.text}» i ${hit.component}` : `${base} i ${hit.component}`;
}

export function assign(root = ROOT) {
  const entries = readRegistry(root);
  let n = nextNumber(entries);
  const byRoute = new Map(entries.filter((e) => e.route).map((e) => [e.route, e]));
  // Sider
  const routes = new Set();
  for (const file of routeFiles(root)) {
    const route = routeIdOf(file);
    routes.add(route);
    const existing = byRoute.get(route);
    if (existing) { existing.file = file; existing.status = "aktiv"; continue; }
    const src = readFileSync(join(root, file), "utf8");
    const m = /title:\s*t\("([^"]+)"/.exec(src);
    const title = m ? nbText(m[1]) : null;
    entries.push({ id: fmt(n++), kind: "side", component: componentAt(src, src.indexOf("component:") + 1 || src.length), file, description: title ? `Side «${title}» (${route})` : `Side ${route}`, route, status: "aktiv" });
  }
  // Vinduer i koden: sett inn nummer der det mangler
  const files = new Map();
  for (const hit of scanCode(root)) { if (!files.has(hit.file)) files.set(hit.file, []); files.get(hit.file).push(hit); }
  const seen = new Set();
  for (const [file, hits] of files) {
    let src = readFileSync(join(root, file), "utf8");
    let changed = false;
    for (const hit of [...hits].sort((a, b) => b.index - a.index)) {
      if (hit.id) continue;
      hit.id = fmt(n++);
      if (hit.tag === "UiId") src = src.slice(0, hit.index) + src.slice(hit.index).replace('id="NEW"', `id="${hit.id}"`);
      else { const at = hit.index + 1 + hit.tag.length; src = `${src.slice(0, at)} uiId="${hit.id}"${src.slice(at)}`; }
      changed = true;
      entries.push({ id: hit.id, kind: hit.kind, component: hit.component, file, description: describe(hit), status: "aktiv" });
    }
    if (changed) writeFileSync(join(root, file), src);
    for (const hit of hits) {
      seen.add(hit.id);
      const e = entries.find((x) => x.id === hit.id);
      if (e) { e.file = file; e.status = "aktiv"; }
    }
  }
  for (const e of entries) if (e.route ? !routes.has(e.route) : !seen.has(e.id)) e.status = "fjernet";
  entries.sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(join(root, REGISTRY), renderRegistry(entries));
  writeFileSync(join(root, DOC), renderDoc(entries));
  return entries;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--assign")) {
    const entries = assign();
    console.log(`${entries.length} ID-er (${entries.filter((e) => e.status === "aktiv").length} aktive)`);
  } else {
    writeFileSync(join(ROOT, DOC), renderDoc(readRegistry()));
  }
}
