import { describe, expect, it } from "vitest";
import {
  applyCommand,
  briefHighlight,
  diffStates,
  emptyProjectState,
  planBriefSave,
  shownBriefVersion,
  stateFromRows,
} from "@/core";
import { needsSchema89 } from "@/adapters/storage/commands.functions";
import { newlyAdded, revealTarget } from "@/app/shared/reveal";
import { envelope, mustApply } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const maja = Object.values(s0.assets).find((a) => a.name === "Maja")!;
const img = Object.values(s0.assetVersions).find((v) => v.mimeType.startsWith("image/") && s0.assetVariants[v.variantId]?.assetId === maja.id)
  ?? Object.values(s0.assetVersions).find((v) => v.mimeType.startsWith("image/"))!;
const imgAsset = s0.assets[s0.assetVariants[img.variantId]!.assetId]!;
const at = "2026-10-23T02:00:00.000Z";

function save(s: typeof s0, assetId: string, text: string, id: string) {
  const plan = planBriefSave(s.assets[assetId]!, text, id, at);
  if (!plan) return s;
  return mustApply(s, { type: "SetAssetBriefVersions", assetId: assetId as never, versions: plan.versions, activeId: plan.activeId });
}

describe("tekstversjoner av beskrivelsen (Øystein 23.10)", () => {
  it("lagres som versjon, vises igjen ved åpning og går aldri tapt", () => {
    const s = save(s0, maja.id, "  En jente med rød lue  ", "b1");
    expect(s.assets[maja.id]!.briefVersions).toEqual([{ id: "b1", text: "En jente med rød lue", createdAt: at }]);
    expect(shownBriefVersion(s.assets[maja.id]!)?.text).toBe("En jente med rød lue");
  });
  it("redigering av en eldre versjon gir en ny versjon og overskriver ikke den gamle", () => {
    let s = save(s0, maja.id, "A", "b1");
    s = save(s, maja.id, "B", "b2");
    s = save(s, maja.id, "A endret", "b3");
    expect(s.assets[maja.id]!.briefVersions!.map((v) => [v.id, v.text])).toEqual([["b1", "A"], ["b2", "B"], ["b3", "A endret"]]);
    expect(s.assets[maja.id]!.activeBriefId).toBe("b3");
  });
  it("samme tekst som en eksisterende versjon aktiverer den, uten ny versjon; uendret gir ingenting", () => {
    let s = save(s0, maja.id, "A", "b1");
    s = save(s, maja.id, "B", "b2");
    expect(planBriefSave(s.assets[maja.id]!, "B", "x", at)).toBeNull();
    const p = planBriefSave(s.assets[maja.id]!, "A", "x", at)!;
    expect(p.versions).toHaveLength(2);
    expect(p.activeId).toBe("b1");
  });
  it("kan angres som én kommando", () => {
    const r = applyCommand(s0, envelope({ type: "SetAssetBriefVersions", assetId: maja.id, versions: [{ id: "b1", text: "A", createdAt: at }], activeId: "b1" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const back = mustApply(r.state, r.inverse);
    expect(back.assets[maja.id]!.briefVersions ?? []).toEqual([]);
    expect(back.assets[maja.id]!.activeBriefId).toBeUndefined();
  });
  it("avviser ugyldige lister (dobbel ID, ukjent aktiv)", () => {
    const bad = (versions: never, activeId: string | null) =>
      applyCommand(s0, envelope({ type: "SetAssetBriefVersions", assetId: maja.id, versions, activeId })).ok;
    expect(bad([{ id: "a", text: "x", createdAt: at }, { id: "a", text: "y", createdAt: at }] as never, "a")).toBe(false);
    expect(bad([{ id: "a", text: "x", createdAt: at }] as never, "b")).toBe(false);
  });
  it("bildet lagrer referansen til tekstversjonen, og den overlever lagring, lesing og angre/gjør om", () => {
    const s = save(s0, imgAsset.id, "Tekst", "b1");
    const media = { path: img.mediaPath, mimeType: img.mimeType, width: img.width, height: img.height, byteSize: img.byteSize, sha256: img.sha256 };
    const cmd = { type: "AddAssetVersion", versionId: "00000000-0000-4000-8000-0000000000b1", variantId: img.variantId, media, note: "", briefVersionId: "b1" } as const;
    const r = applyCommand(s, envelope(cmd as never));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.state.assetVersions[cmd.versionId as never]!;
    expect(v.briefVersionId).toBe("b1");
    const undone = mustApply(r.state, r.inverse);
    const redone = applyCommand(undone, envelope(undoInverse(r.state, undone, cmd.versionId)));
    expect(redone.ok && redone.state.assetVersions[cmd.versionId as never]!.briefVersionId).toBe("b1");
    // Ukjent tekstversjon avvises
    expect(applyCommand(s, envelope({ ...cmd, briefVersionId: "finnes-ikke" } as never)).ok).toBe(false);
    // Lagring og lesing
    const cs = diffStates(emptyProjectState(s0.project), r.state);
    const rows = Object.fromEntries(Object.entries(cs.inserts)) as Record<string, Record<string, unknown>[]>;
    expect(rows["asset_versions"]!.find((x) => x["id"] === cmd.versionId)!["brief_version_id"]).toBe("b1");
    const read = stateFromRows({ project: fixture.project, ...rows, script_block_revisions: cs.blockRevisions } as never);
    expect(read.assetVersions[cmd.versionId as never]!.briefVersionId).toBe("b1");
    expect(read.assets[imgAsset.id]!.briefVersions?.[0]?.text).toBe("Tekst");
    expect(needsSchema89(cmd as never)).toBe(true);
    expect(needsSchema89({ type: "SetAssetBriefVersions" })).toBe(true);
    expect(needsSchema89({ type: "AddAssetVersion" })).toBe(false);
  });
});

function undoInverse(before: typeof s0, after: typeof s0, versionId: string) {
  void after;
  const v = before.assetVersions[versionId as never]!;
  return {
    type: "AddAssetVersion",
    versionId: v.id,
    variantId: v.variantId,
    media: { path: v.mediaPath, mimeType: v.mimeType, width: v.width, height: v.height, byteSize: v.byteSize, sha256: v.sha256 },
    note: v.note,
    number: v.number,
    briefVersionId: v.briefVersionId,
  } as never;
}

describe("fremheving av bildene laget fra teksten", () => {
  const vs = [
    { id: "v1", briefVersionId: "b1" },
    { id: "v2", briefVersionId: "b2" },
    { id: "v3" },
  ];
  it("bilder fra den aktive teksten lyser opp, de andre dempes", () => {
    expect(briefHighlight(vs, "b1")).toEqual({ v1: "match", v2: "dim", v3: "dim" });
  });
  it("ingen bilder fra teksten: ingenting spesielt", () => {
    expect(briefHighlight(vs, "b9")).toEqual({ v1: "none", v2: "none", v3: "none" });
    expect(briefHighlight(vs, null)).toEqual({ v1: "none", v2: "none", v3: "none" });
  });
  it("eldre bilder uten referanse lyser aldri opp", () => {
    expect(briefHighlight([{ id: "v3" }], "b1")).toEqual({ v3: "none" });
  });
});

describe("nye resultater rulles inn i synet", () => {
  it("første visning: ingen er nye; deretter den nye", () => {
    expect(newlyAdded(null, ["a", "b"])).toEqual([]);
    expect(newlyAdded(["a", "b"], ["a", "b", "c"])).toEqual(["c"]);
  });
  it("versjonen lenken ber om vises først, og bare én gang", () => {
    expect(revealTarget(null, ["a", "b"], "a", false)).toBe("a");
    expect(revealTarget(["a", "b"], ["a", "b"], "a", true)).toBeNull();
    expect(revealTarget(["a"], ["a", "b"], "a", true)).toBe("b");
  });
});
