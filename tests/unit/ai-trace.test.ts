// @vitest-environment node
/** Sporbarhet per generering (DEC-0072, REQ-0257). */
import { describe, expect, it } from "vitest";
import { fitTrace, traceLines, traceOf } from "@/core";
import { buildTrace } from "@/adapters/ai/trace.server";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { fakeDb } from "../helpers/fake-supabase";

const P = "00000000-0000-7000-8000-0000000000aa";
const path = `${P}/asset-1/ver-1/maja.png`;

describe("spor for en AI-jobb", () => {
  it("referanser får ressurs og versjon; manusversjon og linjerevisjoner tas med", async () => {
    const db = fakeDb({
      asset_versions: [
        { id: "ver-1", project_id: P, variant_id: "var-1", number: 3, media_path: path },
      ],
      asset_variants: [{ id: "var-1", project_id: P, asset_id: "asset-1", name: "Vinterklær" }],
      assets: [{ id: "asset-1", project_id: P, name: "Maja" }],
      script_versions: [
        { id: "sv-1", project_id: P, number: 2, name: "Draft 9.3", created_at: "2026-10-01" },
      ],
      scene_occurrences: [{ id: "occ-1", project_id: P, variant_id: "sv" }],
      script_blocks: [
        { id: "b1", project_id: P, variant_id: "sv", current_rev: 4, kind: "dialogue" },
        { id: "b2", project_id: P, variant_id: "sv", current_rev: 1, kind: "action" },
        { id: "b3", project_id: P, variant_id: "annen", current_rev: 9, kind: "action" },
        { id: "b4", project_id: P, variant_id: "sv", current_rev: 2, kind: "heading" },
        {
          id: "b5",
          project_id: P,
          variant_id: "sv",
          current_rev: 3,
          kind: "action",
          removed: true,
        },
      ],
    });
    const t = await buildTrace(db as unknown as AnyClient, P, {
      systemInstruction: "prompt-writer",
      modelParams: { seconds: 5, aspect: "16:9", tom: undefined },
      referencePaths: [path, null, `${P}/ukjent.png`],
      occurrenceId: "occ-1",
      segmentId: "seg-1",
    });
    expect(t.references[0]).toMatchObject({
      versionId: "ver-1",
      assetName: "Maja",
      variantName: "Vinterklær",
      number: 3,
    });
    expect(t.references[1]).toMatchObject({ path: `${P}/ukjent.png`, versionId: null });
    expect(t.scriptVersion).toEqual({ id: "sv-1", number: 2, name: "Draft 9.3" });
    expect(t.blockRevisions).toEqual({ b1: 4, b2: 1 });
    expect(t.modelParams).toEqual({ seconds: 5, aspect: "16:9" });
    // Lagret i params og lest tilbake
    const back = traceOf({ seconds: 5, trace: JSON.parse(JSON.stringify(t)) })!;
    const lines = traceLines(back);
    expect(lines.find((l) => l.label === "Referanser")!.text).toContain("Maja – Vinterklær v3");
    expect(lines.find((l) => l.label === "Manusversjon")!.text).toBe("2: Draft 9.3");
    expect(lines.find((l) => l.label === "Parametere")!.text).toContain("Sekunder: 5");
    expect(lines.find((l) => l.label === "Systeminstruks")!.text).toContain(
      "Beskrivelsesskriveren",
    );
    expect(t.systemInstructionHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("sporet holder seg innenfor databasens grense også for lange scener og mange bilder", () => {
    const big = {
      v: 1 as const,
      systemInstruction: "prompt-writer",
      modelParams: { seconds: 8 },
      references: Array.from({ length: 6 }, (_, i) => ({
        path: `${P}/${"a".repeat(36)}/${"b".repeat(36)}/bilde-${i}.png`,
        versionId: "c".repeat(36),
        assetId: "d".repeat(36),
        assetName: "En ressurs med et ganske langt navn",
        variantName: "Variant med langt navn",
        number: i + 1,
      })),
      scriptVersion: { id: "e".repeat(36), number: 3, name: "Draft 9.3" },
      blockRevisions: Object.fromEntries(
        Array.from({ length: 200 }, (_, i) => [
          `${"f".repeat(30)}${String(i).padStart(6, "0")}`,
          2,
        ]),
      ),
      occurrenceId: "g".repeat(36),
      segmentId: "h".repeat(36),
    };
    const fitted = fitTrace(big);
    expect(new TextEncoder().encode(JSON.stringify(fitted)).length).toBeLessThanOrEqual(3000);
    expect(fitted.blockRevisionsOmitted).toBe(true);
    expect(traceLines(fitted).find((l) => l.label === "Manuslinjer")!.text).toContain("for lang");
  });

  it("eldre jobber uten spor gir null; et feilende oppslag stopper ikke jobben", async () => {
    expect(traceOf({ seconds: 5 })).toBe(null);
    expect(traceOf(null)).toBe(null);
    const broken = {
      from() {
        throw new Error("nede");
      },
    };
    const t = await buildTrace(broken as unknown as AnyClient, P, { referencePaths: [path] });
    expect(t.references[0]!.path).toBe(path);
    expect(t.scriptVersion).toBe(null);
  });
});
