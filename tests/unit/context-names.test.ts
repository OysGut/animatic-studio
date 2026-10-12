/** Betegnelser i bestemte linjer og stemmer (mandat 8.2, REQ-0127, DEC-0071). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  assetUsage,
  blocksOfVariant,
  linesWithWord,
  mainProduction,
  orderedOccurrences,
  toRow,
  type ProjectState,
} from "@/core";
import { mustApply } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const occs = orderedOccurrences(s0, main.id).filter((o) => o.active);
const anne = Object.values(s0.assets).find((a) => a.name.startsWith("Bestemor"))!;

function run(s: ProjectState, command: unknown) {
  return applyCommand(s, {
    id: "00000000-0000-7000-8000-00000000f0f1" as never,
    actor: "00000000-0000-7000-8000-000000000001" as never,
    at: new Date().toISOString(),
    command: command as never,
  });
}

describe("betegnelser i bestemte linjer", () => {
  it("bare de valgte linjene kobles; resten av ordet gjør det ikke", () => {
    const before = new Set(assetUsage(s0, main.id, anne).map((u) => u.occurrenceId));
    const target = occs.find((o) => !before.has(o.id))!;
    const other = occs.find((o) => !before.has(o.id) && o.id !== target.id)!;
    const block = blocksOfVariant(s0, target.variantId).find((b) => b.kind !== "heading")!;
    const s = mustApply(s0, {
      type: "SetContextNames",
      assetId: anne.id,
      contextNames: [{ name: "  mormor ", blockIds: [block.id] }],
    } as never);
    expect(s.assets[anne.id]!.contextNames).toEqual([{ name: "mormor", blockIds: [block.id] }]);
    const after = assetUsage(s, main.id, s.assets[anne.id]!);
    const hit = after.find((u) => u.occurrenceId === target.id)!;
    expect(hit.matchedName).toBe("mormor");
    expect(after.some((u) => u.occurrenceId === other.id)).toBe(false);
    // Lagres i kolonnen context_names
    expect(toRow("assets", s.assets[anne.id]!, s.project.id)["context_names"]).toEqual([
      { name: "mormor", blockIds: [block.id] },
    ]);
    // Angring
    const r = run(s0, {
      type: "SetContextNames",
      assetId: anne.id,
      contextNames: [{ name: "mormor", blockIds: [block.id] }],
    });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(mustApply(r.state, r.inverse as never).assets[anne.id]!.contextNames).toEqual([]);
  });

  it("avviser tomme navn, dubletter, ingen linjer og ukjente linjer", () => {
    const b = blocksOfVariant(s0, occs[0]!.variantId)[1]!;
    const bad = [
      [{ name: "", blockIds: [b.id] }],
      [
        { name: "Onkel", blockIds: [b.id] },
        { name: "onkel", blockIds: [b.id] },
      ],
      [{ name: "onkel", blockIds: [] }],
      [{ name: "onkel", blockIds: ["finnes-ikke"] }],
    ];
    for (const contextNames of bad)
      expect(run(s0, { type: "SetContextNames", assetId: anne.id, contextNames }).ok).toBe(false);
  });

  it("finner linjene der ordet står (hele ord, uten store/små bokstaver)", () => {
    const word = blocksOfVariant(s0, occs[0]!.variantId)
      .find((b) => b.kind === "action")!
      .text.split(/\s+/)
      .find((w) => /^\p{L}{4,}$/u.test(w))!;
    const lines = linesWithWord(s0, main.id, word.toUpperCase());
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.text.toLowerCase().includes(word.toLowerCase()))).toBe(true);
    expect(linesWithWord(s0, main.id, "x")).toEqual([]);
  });
});

describe("stemme for AI-dialog", () => {
  it("bare karakterer; gyldig ID; kan angres", () => {
    const voice = { provider: "elevenlabs", voiceId: "21m00Tcm4TlvDq8ikWAM", label: "Rachel" };
    const s = mustApply(s0, { type: "SetAssetVoice", assetId: anne.id, voice } as never);
    expect(s.assets[anne.id]!.voice).toEqual(voice);
    const loc = Object.values(s0.assets).find((a) => a.kind === "location")!;
    expect(run(s0, { type: "SetAssetVoice", assetId: loc.id, voice }).ok).toBe(false);
    expect(
      run(s0, { type: "SetAssetVoice", assetId: anne.id, voice: { ...voice, voiceId: "../x" } }).ok,
    ).toBe(false);
    const r = run(s0, { type: "SetAssetVoice", assetId: anne.id, voice });
    if (r.ok)
      expect(mustApply(r.state, r.inverse as never).assets[anne.id]!.voice ?? null).toBe(null);
  });
});
