// @vitest-environment node
/**
 * Verifiseringsrunde 4 (DEC-0076): krav som kan kontrolleres i kjernen, lagringsadapteren, kildekoden og
 * dokumentasjonen, uten nettleser.
 *
 * - REQ-0029/REQ-0592: ingen kode i grensesnittet starter en betalt generering av seg selv (syntakstre:
 *   startfunksjonene kalles aldri fra useEffect, tidtakere, spørringer eller modulnivå), og ingen planlagt
 *   bakgrunnsjobb er satt opp.
 * - REQ-0053: originalen ligger byte-identisk i sikkerhetskopien etter vilkårlige redigeringer, med samme
 *   kontrollsum som ble registrert.
 * - REQ-0407: alt arbeidet (åtte kategorier) leses tilbake fra lagringen i en ny økt, uten lokal tilstand.
 * - REQ-0002/0006/0037/0452/0506: sporbarhet, Lovable-prosjekt, stabile ID-er, fundament og portabel kjerne.
 * - REQ-0022/REQ-0121: delvis oppfylt – testene viser det som finnes (mangler: se VISUAL_QA_DEC-0076.md).
 *
 * Ingen ekte tjenester kalles: Supabase-klienten og nettverket er erstattet.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCommand,
  blocksOfVariant,
  diffStates,
  emptyProjectState,
  filmClips,
  jobFromRow,
  mainProduction,
  makeBackup,
  orderedOccurrences,
  renderFrame,
  scriptView,
  sortedAssets,
  stateFromRows,
  type ProjectRows,
  type ProjectState,
  type Row,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const h = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
}));

// Lagringen (Supabase Storage) er erstattet av en liten attrapp: signerte lenker til filene i minnet
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((p) => ({ path: p, signedUrl: `https://lagring.test/${bucket}/${p}` })),
          error: null,
        }),
      }),
    },
  },
}));

const ROOT = join(__dirname, "../..");
const SRC = join(ROOT, "src");

function walk(dir: string, ext = /\.(ts|tsx)$/): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p, ext);
    return ext.test(p) && !/\.(test|spec)\.tsx?$/.test(p) ? [p] : [];
  });
}

// ---------------------------------------------------------------- REQ-0029 / REQ-0592

/** Serverfunksjonene som starter en betalt jobb hos en leverandør (samme liste som verifisering-ai.test.ts). */
const STARTERS = new Set([
  "generateImage",
  "startVideoGeneration",
  "generateSound",
  "generateSpeech",
  "writeImagePrompt",
]);
/** Kall som kjører kode uten at brukeren gjør noe: effekter, tidtakere og spørringer. */
const AUTOMATIC = new Set([
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
  "useMemo",
  "useQuery",
  "useQueries",
  "useSuspenseQuery",
  "setInterval",
  "setTimeout",
  "requestAnimationFrame",
  "queueMicrotask",
]);

interface StarterCall {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  /** Hvorfor kallet kan skje uten en brukerhandling (tom = bare fra hendelser). */
  readonly automatic: string | null;
  readonly approved: boolean;
}

function calleeName(e: ts.Expression): string | null {
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
}

/** Finner alle kall til startfunksjonene i en kildefil og hva som omslutter dem. */
function starterCalls(file: string, text = readFileSync(file, "utf8")): StarterCall[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: StarterCall[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      if (name && STARTERS.has(name)) {
        let automatic: string | null = "på modulnivå";
        for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
          if (ts.isFunctionLike(p)) {
            automatic = null;
            const parent = p.parent;
            // Funksjonen er argument til en effekt, tidtaker eller spørring
            if (parent && ts.isCallExpression(parent)) {
              const outer = calleeName(parent.expression);
              if (outer && AUTOMATIC.has(outer)) {
                automatic = `inne i ${outer}`;
                break;
              }
            }
            // queryFn/refetch i et spørringsobjekt
            if (
              parent &&
              ts.isPropertyAssignment(parent) &&
              /^(queryFn|refetch)/.test(parent.name.getText())
            )
              automatic = `inne i ${parent.name.getText()}`;
            if (automatic) break;
          }
        }
        const arg = node.arguments[0];
        const approved =
          !!arg &&
          /\bapproved:\s*true\b/.test(arg.getText(sf)) &&
          !/\bapproved:\s*(false|[a-z])/.test(arg.getText(sf).replace(/approved:\s*true/g, ""));
        out.push({
          file: relative(ROOT, file),
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          name,
          automatic,
          approved,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe("REQ-0029 REQ-0592 – ingen betalt generering starter uten en brukerhandling", () => {
  it("REQ-0029 REQ-0592: kontrollprøve – gjennomgangen kjenner igjen kall i effekter, tidtakere og på modulnivå", () => {
    const sample = `
      import { useEffect } from "react";
      startVideoGeneration({ data: { approved: true } });
      export function A() {
        useEffect(() => { void generateImage({ data: { approved: true } }); }, []);
        setInterval(() => generateSound({ data: {} }), 1000);
        const q = useQuery({ queryFn: () => writeImagePrompt({ data: { approved: true } }) });
        async function onClick() { await generateSpeech({ data: { approved: true } }); }
        return null;
      }`;
    const calls = starterCalls("prove.tsx", sample);
    expect(calls.map((c) => [c.name, c.automatic])).toEqual([
      ["startVideoGeneration", "på modulnivå"],
      ["generateImage", "inne i useEffect"],
      ["generateSound", "inne i setInterval"],
      ["writeImagePrompt", "inne i queryFn"],
      ["generateSpeech", null],
    ]);
    expect(calls.find((c) => c.name === "generateSound")!.approved).toBe(false);
  });

  it("REQ-0029 REQ-0592: i grensesnittet kalles startfunksjonene bare fra brukerhandlinger, og alltid med approved: true", () => {
    const files = [
      ...walk(join(SRC, "app")),
      ...walk(join(SRC, "routes")),
      ...walk(join(SRC, "components")),
    ];
    const calls = files.flatMap((f) => starterCalls(f));
    // Alle stedene som kan starte en betalt jobb (bilde, video, lyd, stemme, AI-skrevet beskrivelse)
    expect(new Set(calls.map((c) => c.name))).toEqual(STARTERS);
    expect(
      calls.filter((c) => c.automatic).map((c) => `${c.file}:${c.line} ${c.name} ${c.automatic}`),
    ).toEqual([]);
    expect(calls.filter((c) => !c.approved).map((c) => `${c.file}:${c.line} ${c.name}`)).toEqual(
      [],
    );
  });

  it("REQ-0592: ingen migrasjon eller oppsett lager en planlagt bakgrunnsjobb (Mars, 12.10.2026)", () => {
    const files = [
      ...walk(join(ROOT, "db"), /\.(sql|ts|toml|json)$/),
      ...(existsSync(join(ROOT, "supabase"))
        ? walk(join(ROOT, "supabase"), /\.(sql|toml|json|ts)$/)
        : []),
    ];
    expect(files.length).toBeGreaterThan(20);
    const hits = files.filter((f) =>
      /cron\.schedule|pg_cron|net\.http_post|\[\s*cron|schedule\s*=/.test(readFileSync(f, "utf8")),
    );
    expect(hits.map((f) => relative(ROOT, f))).toEqual([]);
  });
});

// ---------------------------------------------------------------- REQ-0053

describe("REQ-0053 – originalfilen kan lastes ned byte-identisk etter vilkårlige redigeringer", () => {
  beforeEach(() => {
    h.files.clear();
    vi.stubGlobal("fetch", async (url: string) => {
      const path = decodeURI(String(url)).replace(/^https:\/\/lagring\.test\//, "");
      const bytes = h.files.get(path);
      return bytes
        ? new Response(bytes.slice(), { status: 200 })
        : new Response("finnes ikke", { status: 404 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("REQ-0053: originalen i sikkerhetskopien har samme bytes og kontrollsum som ble registrert ved importen", async () => {
    const { readScreenplayFile, sourceStorageKey } = await import("@/engine/import/browser");
    const { writeBackupZip } = await import("@/app/projects/backup");
    const { readZipIndex, zipEntryBlob } = await import("@/engine/import/zip-read");
    const text =
      "Title: Prøve\n\nINT. STUE - DAG #1#\n\nMaja kommer inn.\n\nMAJA\nHei, æøå!\n\nEXT. TUNET - KVELD #2#\n\nDet snør.\n";
    const original = new TextEncoder().encode(text);
    const read = await readScreenplayFile(new File([original.slice()], "prove.fountain"));
    const p = fixture.project;
    const key = sourceStorageKey(p.id, read.sha256, "prove.fountain");
    // Lagret uendret ved importen (ImportDialog laster opp read.bytes)
    h.files.set(`sources/${key}`, read.bytes);
    // Vilkårlige redigeringer etterpå: tekst, sletting og ny scene
    let s = fixture.state;
    const main = mainProduction(s)!;
    const view = scriptView(s, main.id);
    const dlg = view.flatMap((v) => v.blocks).find((b) => b.kind === "dialogue")!;
    s = mustApply(s, {
      type: "EditBlockText",
      productionId: main.id,
      blockId: dlg.id,
      text: "Endret.",
    });
    const act = view[1]!.blocks.find((b) => b.kind === "action")!;
    s = mustApply(s, { type: "RemoveBlock", productionId: main.id, blockId: act.id });
    const rows = {
      project: p,
      ...diffStates(emptyProjectState(s.project), s).inserts,
    } as unknown as ProjectRows;
    const doc: Row = {
      id: tid(),
      project_id: p.id,
      production_id: main.id,
      storage_key: key,
      file_name: "prove.fountain",
      sha256: read.sha256,
      format: "fountain",
      page_count: read.parsed.pageCount,
      byte_size: read.bytes.byteLength,
      language: "nb",
      change_id: null,
      created_at: "2026-10-12T10:00:00Z",
      created_by: "00000000-0000-7000-8000-a11ce0000001",
    };
    const backup = makeBackup({
      rows,
      scriptVersions: [],
      importedDocuments: [doc],
      changeLog: [],
      generationJobs: [],
      schemaVersion: 27,
      createdAt: "2026-10-12T12:00:00Z",
      include: new Set(["manusfil"] as const),
    });
    const chunks: Uint8Array[] = [];
    const r = await writeBackupZip(
      {
        write: async (c) => void chunks.push(c),
        close: async () => undefined,
        abort: async () => undefined,
      },
      backup,
    );
    expect(r.missing).toEqual([]);
    const zip = new Blob(chunks as BlobPart[]);
    const index = await readZipIndex(zip);
    const entry = index.get(`filer/sources/${key}`);
    expect(entry).toBeDefined();
    const back = new Uint8Array(await (await zipEntryBlob(zip, entry!)).arrayBuffer());
    expect(Buffer.from(back).equals(Buffer.from(original))).toBe(true);
    expect(createHash("sha256").update(back).digest("hex")).toBe(doc["sha256"]);
  });
});

// ---------------------------------------------------------------- REQ-0407

/** Lesesiden av en database med radene i minnet (som PostgREST: select/eq/order/range/maybeSingle). */
function memoryDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let range: [number, number] | null = null;
      let head = false;
      const q = {
        select(_c?: string, o?: { head?: boolean }) {
          head = !!o?.head;
          return q;
        },
        eq(k: string, v: unknown) {
          filters.push((r) => r[k] === v);
          return q;
        },
        neq(k: string, v: unknown) {
          filters.push((r) => r[k] !== v);
          return q;
        },
        gte(k: string, v: string) {
          filters.push((r) => String(r[k] ?? "") >= v);
          return q;
        },
        order() {
          return q;
        },
        limit() {
          return q;
        },
        range(a: number, b: number) {
          range = [a, b];
          return q;
        },
        rows() {
          const all = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
          return structuredClone(range ? all.slice(range[0], range[1] + 1) : all);
        },
        maybeSingle() {
          return Promise.resolve({ data: q.rows()[0] ?? null, error: null });
        },
        then(ok: (v: unknown) => unknown) {
          const rows = q.rows();
          return Promise.resolve({
            data: head ? null : rows,
            count: rows.length,
            error: null,
          }).then(ok);
        },
      };
      return q;
    },
  };
}

describe("REQ-0407 – arbeidet bevares når programmet lukkes og åpnes igjen", () => {
  it("REQ-0407: alle åtte kategorier leses tilbake uendret fra lagringen i en ny økt", async () => {
    const { loadProjectState, fetchProjectTable } = await import("@/adapters/storage/project-rows");
    let s = fixture.state;
    const main = mainProduction(s)!;
    // Eksportinnstillinger (DEC-0072) i tillegg til det fixturen har fra før
    const settings = { size: "half", monochrome: false, output: "video" };
    s = mustApply(s, { type: "SetExportSettings", productionId: main.id, settings } as never);
    const cs = diffStates(emptyProjectState(s.project), s);
    // Det som ligger i databasen etter at alle endringene er lagret (radene fra endringssettene)
    const inserted = structuredClone(cs.inserts) as unknown as Record<string, Row[]>;
    // Tidspunkt og forfatter for bildeversjoner settes av databasen ved lagring (standardverdier)
    for (const r of inserted["asset_versions"] ?? []) {
      const v = s.assetVersions[String(r["id"])]!;
      r["created_at"] = v.createdAt;
      r["created_by"] = v.createdBy;
    }
    const tables: Record<string, Row[]> = {
      ...inserted,
      // Prosjektraden med feltene som ikke er en del av endringssettet (AI-budsjettet)
      projects: [
        {
          ...(fixture.project as unknown as Row),
          ...((cs.updates as unknown as Record<string, Row[]>)["projects"]?.[0] ?? {}),
          // Databasen øker revisjonen når endringen lagres (apply_changes)
          revision: s.project.revision,
        },
      ],
      script_block_revisions: structuredClone(cs.blockRevisions) as unknown as Row[],
      script_versions: structuredClone(fixture.rows["script_versions"]) as Row[],
      generation_jobs: structuredClone(fixture.rows["generation_jobs"]) as Row[],
    };
    const db = memoryDb(tables);
    // Ny økt: ingenting i minnet, ingen lokal lagring (Node har ingen localStorage)
    expect(typeof (globalThis as { localStorage?: unknown }).localStorage).toBe("undefined");
    const loaded = await loadProjectState(db as never, s.project.id);
    // Hele tilstanden er lik (alle tabeller og felt); historikken leses sortert på linje og revisjon
    const byLine = (st: ProjectState) => ({
      ...st,
      blockRevisions: [...st.blockRevisions].sort(
        (a, b) => a.blockId.localeCompare(b.blockId) || a.rev - b.rev,
      ),
    });
    expect(byLine(loaded)).toEqual(byLine(s));

    // 1 sceneoppbygging: 2D-scenene med lag og kamera
    expect(Object.keys(loaded.compositions).length).toBeGreaterThan(0);
    expect(loaded.layers).toEqual(s.layers);
    expect(loaded.compositions).toEqual(s.compositions);
    // 2 historikk: linjenes revisjoner og lagrede manusversjoner
    expect(loaded.blockRevisions.length).toBe(s.blockRevisions.length);
    expect(loaded.blockRevisions.some((r) => r.rev > 1)).toBe(true);
    const versions = await fetchProjectTable(db as never, "script_versions", s.project.id);
    expect(versions.map((v) => v["name"])).toEqual(["Draft 9.3"]);
    // 3 genereringsprompter
    expect(Object.keys(loaded.generationPrompts).length).toBeGreaterThan(0);
    expect(loaded.generationPrompts).toEqual(s.generationPrompts);
    // 4 ressurser og 5 lyd
    expect(loaded.assets).toEqual(s.assets);
    expect(loaded.assetVersions).toEqual(s.assetVersions);
    expect(Object.keys(loaded.audioClips).length).toBeGreaterThan(0);
    expect(loaded.audioClips).toEqual(s.audioClips);
    // 6 jobbstatus: AI-jobbene leses med status fra loggen
    const jobs = (await fetchProjectTable(db as never, "generation_jobs", s.project.id)).map(
      jobFromRow,
    );
    expect(jobs.map((j) => j.status).sort()).toEqual(["done", "failed", "running"]);
    // 7 eksportinnstillinger
    expect(loaded.productions[main.id]!.exportSettings).toEqual(settings);
    // 8 produksjonsversjoner: produksjoner og versjoner av scenene (takes)
    expect(loaded.productions).toEqual(s.productions);
    expect(Object.keys(loaded.takes).length).toBeGreaterThan(0);
    expect(loaded.takes).toEqual(s.takes);
  });

  it("REQ-0407: nettleserens lokale lagring brukes bare til visningsvalg, aldri til arbeidet", () => {
    const uses = walk(SRC).flatMap((f) => {
      const t = readFileSync(f, "utf8");
      return [
        ...t.matchAll(/(localStorage|sessionStorage|indexedDB)\.(setItem|open)\(\s*([^,]+),/g),
      ].map((m) => `${relative(ROOT, f)}: ${m[3]!.trim()}`);
    });
    // Kjente nøkler: skjulte forslag, filmspråk, aktiv produksjon, manusspråk, paneler, tilbake-historikk
    for (const u of uses)
      expect(u).toMatch(
        /hidden|Hidden|film-?lang|key\(projectId\)|storeKey|script-lang|pane|KEY|stored|flag|width|size/i,
      );
    expect(uses.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- REQ-0002

/** De 15 punktene i omfangslisten og detaljkravene de spores til. */
const SCOPE: readonly (readonly [string, readonly string[]])[] = [
  ["profesjonell manusbehandling", ["REQ-0044", "REQ-0050", "REQ-0087"]],
  ["automatisk scenedeteksjon og produksjonsanalyse", ["REQ-0059", "REQ-0405"]],
  ["globale biblioteker for karakterer, objekter og lokasjoner", ["REQ-0121", "REQ-0136"]],
  ["redigerbar, lagbasert 2D-sceneeditor", ["REQ-0170", "REQ-0488"]],
  ["kameraanimasjon basert på multiplan-teknikk", ["REQ-0173", "REQ-0188"]],
  ["tidslinje for bilde, lyd, dialog og bevegelser", ["REQ-0195", "REQ-0208", "REQ-0216"]],
  ["presise instruksjoner til ulike AI-modeller", ["REQ-0245", "REQ-0246"]],
  ["integrasjon med eksterne bilde-, lyd- og videotjenester", ["REQ-0269", "REQ-0590"]],
  ["selvstendig animatic-motor uten AI", ["REQ-0211", "REQ-0213"]],
  ["versjons- og kontinuitetskontroll", ["REQ-0304", "REQ-0165"]],
  ["renderingskø og bakgrunnsproduksjon", ["REQ-0289", "REQ-0294"]],
  ["flerspråklig manus, dialog og filmeksport", ["REQ-0329", "REQ-0348"]],
  ["avledede produksjoner, kortfilmer og spinoffer", ["REQ-0361", "REQ-0499"]],
  ["presentasjonsmateriell, pitchplakater og karakterkart", ["REQ-0388", "REQ-0403", "REQ-0385"]],
  ["ferdig sammenstilling og eksport av filmer", ["REQ-0226", "REQ-0417"]],
];

/** Leser id, fase, status og tekst for hvert krav i kravregisteret (enkel lesing av YAML-listen). */
function requirements() {
  const yaml = readFileSync(join(ROOT, "docs/product/requirements.yaml"), "utf8");
  const out = new Map<string, { id: string; phase: number | null; status: string; text: string }>();
  for (const part of yaml.split(/\n- id: /).slice(1)) {
    const id = part.slice(0, 8);
    const field = (k: string) => new RegExp(`\\n {2}${k}: (.*)`).exec(part)?.[1]?.trim() ?? "";
    // Teksten kan gå over flere linjer (innrykk med fire mellomrom)
    const text = /\n {2}text: ([\s\S]*?)\n {2}[a-z_]+:/.exec(part)?.[1]?.replace(/\s+/g, " ") ?? "";
    const phase = field("phase");
    out.set(id, {
      id,
      phase: /^\d+$/.test(phase) ? Number(phase) : null,
      status: field("status").replace(/^["']|["']$/g, ""),
      text: text.replace(/^'|'$/g, ""),
    });
  }
  return out;
}

describe("REQ-0002 – produktets funksjonsomfang kan spores", () => {
  it("REQ-0002: hvert av de 15 punktene spores til minst ett gjeldende detaljkrav med fase i utviklingsplanen", () => {
    const byId = requirements();
    // Omfangslisten i kravet har 15 punkter
    const text = byId.get("REQ-0002")!.text;
    expect(text.split(":").slice(1).join(":").split(";").length).toBe(SCOPE.length);
    for (const [point, ids] of SCOPE) {
      const ok = ids.filter((id) => {
        const r = byId.get(id);
        return (
          r && r.status !== "Utgått" && typeof r.phase === "number" && r.phase >= 1 && r.phase <= 8
        );
      });
      expect(ok, point).toEqual(ids);
    }
    // Fasene finnes i utviklingsplanen (veikartets milepæler M1–M8)
    const roadmap = readFileSync(join(ROOT, "docs/development/ROADMAP.md"), "utf8");
    const phases = new Set(SCOPE.flatMap(([, ids]) => ids.map((id) => byId.get(id)!.phase)));
    for (const ph of phases) expect(roadmap).toContain(`Fase ${ph} (`);
  });
});

// ---------------------------------------------------------------- REQ-0006 / REQ-0506

describe("REQ-0006 – første versjon er et Lovable-prosjekt", () => {
  it("REQ-0006: byggeoppsettet er Lovables (TanStack Start), med Lovable Cloud (Supabase) som backend", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps["@lovable.dev/vite-tanstack-config"]).toBeDefined();
    expect(readFileSync(join(ROOT, "vite.config.ts"), "utf8")).toMatch(
      /from "@lovable\.dev\/vite-tanstack-config"/,
    );
    // Lovable Cloud: prosjektkobling og den genererte klienten
    expect(readFileSync(join(ROOT, "supabase/config.toml"), "utf8")).toMatch(
      /^project_id = "\w+"/m,
    );
    expect(existsSync(join(SRC, "integrations/supabase/client.ts"))).toBe(true);
    // Migrasjonene ligger der Mars kjører dem i Lovable (LOVABLE_SYNC), ikke i Lovables drizzle-mappe
    expect(
      readdirSync(join(ROOT, "db/migrations")).filter((f) => f.endsWith(".sql")).length,
    ).toBeGreaterThan(20);
  });
});

describe("REQ-0506 – domenemodell og produksjonslogikk kan kjøres utenfor nettleser og Lovable", () => {
  it("REQ-0506: kjernen har ingen avhengighet til Lovable, Supabase, React eller nettleseren", () => {
    const offenders: string[] = [];
    for (const f of walk(join(SRC, "core"))) {
      const t = readFileSync(f, "utf8");
      for (const m of t.matchAll(/from\s+["']([^"']+)["']/g))
        if (!m[1]!.startsWith(".") && !m[1]!.startsWith("@/core"))
          offenders.push(`${relative(ROOT, f)}: ${m[1]}`);
      // Ingen kall til plattformens API-er (leverandøren «lovable» i katalogen er bare data)
      if (/\b(createClient|createServerFn|supabase\.|import\.meta\.env)\b/.test(t))
        offenders.push(`${relative(ROOT, f)}: bruker plattformens API`);
    }
    expect(offenders).toEqual([]);
  });

  it("REQ-0506: produksjonslogikken kjører i Node (uten nettleser): kommandoer, film og bildeberegning", () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    const s = fixture.state;
    const main = mainProduction(s)!;
    const clips = filmClips(s, main.id);
    expect(clips.length).toBeGreaterThan(5);
    const comp = Object.values(s.compositions)[0]!;
    const frame = renderFrame(s, comp.id, 0, { view: "camera" });
    expect(frame).toBeDefined();
    const occ = orderedOccurrences(s, main.id)[2]!;
    const r = applyCommand(
      s,
      envelope({ type: "SetOccurrenceActive", occurrenceId: occ.id, active: false } as never),
    );
    expect(r.ok).toBe(true);
  });
});

// ---------------------------------------------------------------- REQ-0037

describe("REQ-0037 – stabile identifikatorer for domeneobjektene", () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it("REQ-0037: alle objekter i tilstanden og i lagringsradene har en UUID som er nøkkelen deres", () => {
    const s = fixture.state;
    expect(s.project.id).toMatch(UUID);
    const maps = Object.entries(s).filter(
      ([k, v]) => k !== "project" && v && typeof v === "object" && !Array.isArray(v),
    ) as [string, Record<string, { id: string }>][];
    expect(maps.length).toBeGreaterThanOrEqual(22);
    for (const [name, map] of maps)
      for (const [key, obj] of Object.entries(map)) {
        expect(obj.id, name).toBe(key);
        expect(key, name).toMatch(UUID);
      }
    // Utenfor tilstanden: manusversjoner og genereringsjobber
    for (const v of fixture.rows["script_versions"] as Row[]) expect(String(v["id"])).toMatch(UUID);
    for (const j of fixture.rows["generation_jobs"] as Row[]) expect(String(j["id"])).toMatch(UUID);
  });

  it("REQ-0037: ID-ene endres ikke av redigering, omnummerering, flytting eller deaktivering", () => {
    let s = fixture.state;
    const main = mainProduction(s)!;
    const occs = orderedOccurrences(s, main.id);
    const before = new Map(
      Object.entries(s).flatMap(([k, v]) =>
        v && typeof v === "object" && !Array.isArray(v) && k !== "project"
          ? Object.keys(v as object).map((id) => [id, k] as const)
          : [],
      ),
    );
    const variant = s.variants[occs[1]!.variantId]!;
    const block = blocksOfVariant(s, variant.id)[0]!;
    s = mustApply(s, {
      type: "EditBlockText",
      productionId: main.id,
      blockId: block.id,
      text: "Ny tekst",
    });
    s = mustApply(s, {
      type: "SetOccurrenceActive",
      occurrenceId: occs[2]!.id,
      active: false,
    } as never);
    const asset = sortedAssets(s)[0]!;
    s = mustApply(s, {
      type: "UpdateAsset",
      assetId: asset.id,
      fields: {
        kind: asset.kind,
        name: "Nytt navn",
        names: asset.names,
        description: asset.description,
        category: asset.category,
        tags: asset.tags,
      },
    });
    for (const [id, kind] of before) {
      const map = (s as unknown as Record<string, Record<string, { id: string }>>)[kind]!;
      expect(map[id]?.id, `${kind} ${id}`).toBe(id);
    }
    expect(s.assets[asset.id]!.name).toBe("Nytt navn");
  });
});

// ---------------------------------------------------------------- REQ-0452

describe("REQ-0452 – fundamentet fra fase 1 tåler videreutvikling uten omskriving", () => {
  const MIGRATIONS = join(ROOT, "db/migrations");
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const CORE_TABLES = [
    "projects",
    "productions",
    "scenes",
    "scene_variants",
    "script_blocks",
    "scene_occurrences",
    "production_segments",
    "takes",
  ];

  it("REQ-0452: første migrasjon har produksjon, scene, scenevariant, sceneforekomst, segment og versjon (take)", () => {
    const first = readFileSync(join(MIGRATIONS, files[0]!), "utf8");
    for (const t of CORE_TABLES)
      expect(first, t).toMatch(new RegExp(`create table (public\\.)?${t}\\b`));
  });

  it("REQ-0452: ingen senere migrasjon (heller ikke for spinoffer og språk i fase 7) fjerner eller gjør om kjerneobjektene", () => {
    const bad: string[] = [];
    for (const f of files.slice(1)) {
      const sql = readFileSync(join(MIGRATIONS, f), "utf8").replace(/--.*$/gm, "");
      for (const t of CORE_TABLES) {
        const re = new RegExp(
          `(drop table[^;]*\\b${t}\\b|alter table (public\\.)?${t}\\b[^;]*(drop column|rename|alter column [^;]* type))`,
          "i",
        );
        if (re.test(sql)) bad.push(`${f}: ${t}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

// ---------------------------------------------------------------- REQ-0022 (delvis)

describe("REQ-0022 – innholdsmessig synkronisering er skilt fra strukturell plassering (delvis)", () => {
  it("REQ-0022: 2D-scenen husker manuslinjene den ble laget fra; å flytte eller deaktivere scenen endrer ikke det", () => {
    let s = fixture.state;
    const main = mainProduction(s)!;
    const comp = Object.values(s.compositions).find((c) => c.producedFrom)!;
    expect(Object.keys(comp.producedFrom!.blockRevisions).length).toBeGreaterThan(0);
    const occ = orderedOccurrences(s, main.id).find((o) => o.variantId === comp.variantId)!;
    const produced = structuredClone(comp.producedFrom);
    s = mustApply(s, { type: "SetOccurrenceActive", occurrenceId: occ.id, active: false } as never);
    expect(s.compositions[comp.id]!.producedFrom).toEqual(produced);
  });
});

// ---------------------------------------------------------------- REQ-0121 (delvis)

describe("REQ-0121 – sentralt ressursbibliotek (delvis)", () => {
  it("REQ-0121: karakterer, objekter/rekvisitter, dyr, lokasjoner, miljøer/bakgrunner og lyd kan opprettes og listes", () => {
    let s = fixture.state;
    const kinds = [
      "character",
      "object",
      "animal",
      "location",
      "environment",
      "sound",
      "other",
    ] as const;
    const ids = kinds.map(() => tid<"asset">());
    s = mustApply(s, {
      type: "CreateAssets",
      assets: kinds.map((kind, i) => ({
        assetId: ids[i]!,
        fields: { kind, name: `Prøve ${kind}`, names: [], description: "", category: "", tags: [] },
      })),
    });
    const listed = new Set(sortedAssets(s).map((a) => a.id));
    for (const id of ids) expect(listed.has(id)).toBe(true);
    // Rader for lagringen (vises igjen etter ny innlasting)
    const back = stateFromRows({
      project: fixture.project,
      ...diffStates(emptyProjectState(s.project), s).inserts,
      script_block_revisions: [],
    } as unknown as ProjectRows);
    for (const id of ids) expect(back.assets[id]?.kind).toBe(s.assets[id]!.kind);
  });
});
