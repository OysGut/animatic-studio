// @vitest-environment node
/**
 * REQ-0004 (DEC-0072): 2D-animatic kan spilles av og eksporteres uten generativ AI.
 *
 * Valgt variant: en statisk gjennomgang av importgrafen. Fra inngangsfilene for avspilling og eksport følges
 * alle kjøretidsimporter (statiske `import … from`, `export … from`, sideeffekt-importer og dynamiske
 * `import("…")`) transitivt gjennom repoet, og ingen fil som nås, får ligge under src/adapters/ai/.
 *
 * Hvorfor slik, og hvorfor den ikke gir falske funn eller falsk trygghet:
 * - Bare `import type …`/`export type …` hoppes over. De fjernes ved kompilering og kan ikke kalle en
 *   AI-leverandør. Blandede importer (`import { type A, b }`) telles med – de er kjøretidsimporter.
 * - Pakker fra node_modules følges ikke: AI-kallene i prosjektet går gjennom src/adapters/ai (serverfunksjoner
 *   med nøkler og kostnadsport), så det er den mappen som må holdes utenfor.
 * - Alle «@/…»- og relative importer må kunne løses til en fil. En import som ikke løses, får testen til å
 *   feile, så en feil i gjennomgangen aldri skjuler en kant i grafen.
 * - Kontrollprøve: den samme gjennomgangen fra monteringsflaten (AssemblyWorkspace) SKAL finne AI-adaptere,
 *   fordi AI der nås via egne knapper og dialoger som brukeren må bekrefte. Finner den ingenting, er
 *   gjennomgangen selv i stykker, og testen feiler.
 * - Inngangsfilene må finnes; flyttes eller døpes en om, feiler testen i stedet for å bestå i stillhet.
 *
 * Alternativet – å kreve at hele src/app ikke importerer AI – er feil krav (AI er lov via egne dialoger), og
 * en ren tekstsøk etter «adapters/ai» i noen få filer ville ikke sett transitive importer.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const SRC = join(ROOT, "src");
const AI_DIR = join(SRC, "adapters", "ai") + "/";

/** Filer som avspillingen og eksporten av animatic består av (utenom src/core og src/engine). */
const APP_ENTRIES = [
  "src/app/assembly/ExportAnimaticDialog.tsx",
  "src/app/assembly/FilmViewer.tsx",
  "src/app/assembly/FilmPopout.tsx",
  "src/app/assembly/film-images.ts",
  "src/app/assembly/film-video.ts",
  "src/app/audio/use-audio-playback.ts",
  "src/app/download.ts",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(p) && !/\.(test|spec)\.tsx?$/.test(p) ? [p] : [];
  });
}

const EXTS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/** Løser en import til en fil i repoet; null for pakker. Kaster hvis en lokal import ikke finnes. */
function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  // Vite-suffikser (?raw, ?url, ?worker) peker på samme fil
  base = base.replace(/\?.*$/, "");
  for (const e of EXTS) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  throw new Error(`Kunne ikke løse «${spec}» i ${relative(ROOT, from)}`);
}

/** Kjøretidsimportene i en fil (type-importer utelatt). */
function runtimeImports(source: string): string[] {
  // Kommentarer fjernes først, så eksempler i dokumentasjon ikke telles
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const out: string[] = [];
  const re =
    /\b(import|export)\s+(type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of code.matchAll(re)) {
    if (m[2]) continue; // import type / export type
    const spec = m[3] ?? m[4];
    if (spec) out.push(spec);
  }
  return out;
}

/** Alle filer som nås fra inngangene, med forelder (for en lesbar kjede i feilmeldingen). */
function reachable(entries: readonly string[]): Map<string, string | null> {
  const seen = new Map<string, string | null>();
  const stack: [string, string | null][] = entries.map((e) => [e, null]);
  while (stack.length) {
    const [file, parent] = stack.pop()!;
    if (seen.has(file)) continue;
    seen.set(file, parent);
    for (const spec of runtimeImports(readFileSync(file, "utf8"))) {
      const dep = resolveImport(file, spec);
      if (dep && !seen.has(dep)) stack.push([dep, file]);
    }
  }
  return seen;
}

function aiChains(graph: Map<string, string | null>): string[] {
  const out: string[] = [];
  for (const [file] of graph) {
    if (!file.startsWith(AI_DIR)) continue;
    const chain: string[] = [];
    for (let f: string | null = file; f; f = graph.get(f) ?? null) chain.push(relative(ROOT, f));
    out.push(chain.join(" ← "));
  }
  return out;
}

describe("Avspilling og eksport av animatic uten AI (REQ-0004)", () => {
  it("inngangsfilene finnes", () => {
    for (const f of APP_ENTRIES) expect(existsSync(join(ROOT, f)), f).toBe(true);
  });

  it("gjenkjenner kjøretidsimporter og hopper bare over rene type-importer", () => {
    const src = [
      'import type { A } from "@/adapters/ai/a";',
      'export type { B } from "@/adapters/ai/b";',
      'import { type C, d } from "@/adapters/ai/c";',
      'import * as e from "./e";',
      'import "./f";',
      'export { g } from "./g";',
      'const h = await import("./h");',
      '// import { x } from "./kommentar";',
    ].join("\n");
    expect(runtimeImports(src)).toEqual(["@/adapters/ai/c", "./e", "./f", "./g", "./h"]);
  });

  it("src/core, src/engine og avspillings-/eksportflaten når ikke src/adapters/ai", () => {
    const entries = [
      ...walk(join(SRC, "core")),
      ...walk(join(SRC, "engine")),
      ...APP_ENTRIES.map((f) => join(ROOT, f)),
    ];
    const graph = reachable(entries);
    // Grafen skal faktisk ha fulgt importene videre (UI-komponenter, nedlasting, lyd)
    expect(graph.size).toBeGreaterThan(entries.length);
    expect(aiChains(graph)).toEqual([]);
  });

  it("kontrollprøve: fra monteringsflaten nås AI (via egne dialoger), så gjennomgangen virker", () => {
    const graph = reachable([join(ROOT, "src/app/assembly/AssemblyWorkspace.tsx")]);
    expect(aiChains(graph).length).toBeGreaterThan(0);
  });
});
