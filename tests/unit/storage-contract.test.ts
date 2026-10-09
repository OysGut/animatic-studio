// @vitest-environment node
/**
 * Kontrakttest mellom lagringsadapteren og databaseskjemaet (feil funnet i Lovable 2026-10-08:
 * sortering på en kolonne som ikke finnes i script_block_revisions).
 * Alle tabeller og kolonner adapteren spør etter, og alle kolonner i radformatet fra kjernen,
 * må finnes i migrasjonene i db/migrations.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPECTED_SCHEMA_VERSION,
  loadProjectRows,
  type AnyClient,
} from "@/adapters/storage/project-rows";
import { diffStates, emptyProjectState } from "@/core";
import { mustApply, seedProject, tid } from "../helpers/fixtures";

const MIGRATIONS = join(__dirname, "../../db/migrations");

/** Enkel uttrekking av kolonner per tabell fra CREATE TABLE-setningene. */
function schemaColumns(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const f of readdirSync(MIGRATIONS)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    for (const m of sql.matchAll(
      /create table (?:if not exists )?public\.(\w+) \(([\s\S]*?)\n\);/g,
    )) {
      const cols = new Set<string>();
      for (const line of m[2]!.split("\n")) {
        const c =
          /^\s+([a-z_][a-z0-9_]*)\s+(uuid|text|integer|boolean|double|jsonb|timestamptz|uuid\[\])/.exec(
            line,
          );
        if (c) cols.add(c[1]!);
      }
      out.set(m[1]!, cols);
    }
    for (const m of sql.matchAll(/alter table public\.(\w+) add column if not exists (\w+)/g)) {
      out.get(m[1]!)?.add(m[2]!);
    }
  }
  return out;
}

interface Call {
  table: string;
  columns: string[];
}

function recordingClient(calls: Call[]): AnyClient {
  const builder = (table: string) => {
    const call: Call = { table, columns: [] };
    calls.push(call);
    const b: Record<string, unknown> = {};
    const chain = (col?: string) => {
      if (col) call.columns.push(col);
      return b;
    };
    b["select"] = (cols: string) => {
      if (cols !== "*") call.columns.push(...cols.split(",").map((c) => c.trim()));
      return b;
    };
    b["eq"] = (col: string) => chain(col);
    b["is"] = (col: string) => chain(col);
    b["order"] = (col: string) => chain(col);
    b["limit"] = () => b;
    b["range"] = () => Promise.resolve({ data: [], error: null });
    b["maybeSingle"] = () => Promise.resolve({ data: { id: "p" }, error: null });
    return b;
  };
  return { from: builder } as unknown as AnyClient;
}

describe("Kontrakt: lagringsadapter ↔ databaseskjema", () => {
  const schema = schemaColumns();

  it("appen forventer skjemaversjonen til siste migrasjon", () => {
    const files = readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql"));
    expect(EXPECTED_SCHEMA_VERSION).toBe(files.length);
  });

  it("finner tabellene i migrasjonene", () => {
    for (const t of ["projects", "script_block_revisions", "scene_occurrences", "takes"]) {
      expect(schema.has(t)).toBe(true);
    }
  });

  it("loadProjectRows spør bare etter tabeller og kolonner som finnes", async () => {
    const calls: Call[] = [];
    await loadProjectRows(recordingClient(calls), "p");
    const problems: string[] = [];
    for (const c of calls) {
      const cols = schema.get(c.table);
      if (!cols) {
        problems.push(`ukjent tabell ${c.table}`);
        continue;
      }
      for (const col of c.columns)
        if (!cols.has(col)) problems.push(`${c.table}.${col} finnes ikke`);
    }
    expect(problems).toEqual([]);
  });

  it("radformatet fra kjernen (endringssett) passer til tabellene", () => {
    const { state: seeded } = seedProject();
    // Med ressursbibliotek (0004), så også de nye tabellene kontrolleres
    const assetId = tid<"asset">();
    const variantId = tid<"asset_variant">();
    const versionId = tid<"asset_version">();
    let state = mustApply(seeded, {
      type: "CreateAssets",
      assets: [
        {
          assetId,
          fields: {
            kind: "character",
            name: "Maja",
            names: [],
            description: "",
            category: "",
            tags: [],
          },
        },
      ],
    });
    state = mustApply(state, {
      type: "CreateAssetVariant",
      variantId,
      assetId,
      fields: { name: "Animatic", style: "animatic", appearance: "" },
    });
    state = mustApply(state, {
      type: "AddAssetVersion",
      versionId,
      variantId,
      media: {
        path: `${state.project.id}/${assetId}/${versionId}/maja.png`,
        mimeType: "image/png",
        width: 10,
        height: 10,
        byteSize: 10,
        sha256: "e".repeat(64),
      },
      note: "",
    });
    const cs = diffStates(emptyProjectState(state.project), state);
    expect(Object.keys(cs.inserts)).toEqual(
      expect.arrayContaining(["assets", "asset_variants", "asset_versions"]),
    );
    const problems: string[] = [];
    for (const [table, rows] of Object.entries(cs.inserts)) {
      const cols = schema.get(table);
      if (!cols) {
        problems.push(`ukjent tabell ${table}`);
        continue;
      }
      for (const key of Object.keys(rows[0] ?? {}))
        if (!cols.has(key)) problems.push(`${table}.${key} finnes ikke`);
    }
    const revCols = schema.get("script_block_revisions")!;
    for (const key of Object.keys(cs.blockRevisions[0] ?? {})) {
      if (!revCols.has(key)) problems.push(`script_block_revisions.${key} finnes ikke`);
    }
    expect(problems).toEqual([]);
  });
});
