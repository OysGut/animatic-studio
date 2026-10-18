// @vitest-environment node
/**
 * GP2: det globale biblioteket. Søk og filter (G6), «Bruk i prosjekt» med gjenbruk (§7, G3/G4), varselet
 * «Ny versjon finnes» uten automatisk endring (§9, G8/G9), koblingen i kommandoer, angre/gjør om og rader, og
 * at sikkerhetskopien godtar koblingen uten gruppetilgang (§16).
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_GLOBAL_FILTER,
  applyCommand,
  filterGlobalAssets,
  globalFilePath,
  globalUpdates,
  isGlobalPathOf,
  linkedProjectAsset,
  planUseGlobal,
  stateFromRows,
  toRow,
  type Command,
  type GlobalAsset,
  type GlobalAssetBundle,
  type GlobalVariant,
  type GlobalVersion,
  type ProjectState,
  type UseGlobalItem,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const WS = "00000000-0000-4000-8000-00000000aaaa";
const GA = "00000000-0000-4000-8000-00000000a001";
const GV1 = "00000000-0000-4000-8000-00000000b001";
const GV2 = "00000000-0000-4000-8000-00000000b002";
const SHA = "a".repeat(64);

const asset: GlobalAsset = {
  id: GA,
  workspaceId: WS,
  kind: "team_figure",
  name: "Teamfigur Maja",
  description: "Maskot",
  categories: ["Figurer"],
  tags: ["maskot", "blå"],
  archived: false,
  revision: 1,
};
const variants: GlobalVariant[] = [
  { id: GV1, assetId: GA, name: "Forfra", style: "illustrated", appearance: "", archived: false },
  { id: GV2, assetId: GA, name: "Fra siden", style: "illustrated", appearance: "", archived: false },
];
function ver(id: string, variantId: string, number: number): GlobalVersion {
  return {
    id,
    variantId,
    assetId: GA,
    number,
    storageKey: globalFilePath(WS, GA, SHA, "png"),
    mimeType: "image/png",
    width: 10,
    height: 10,
    byteSize: 100,
    sha256: SHA,
    durationMs: null,
    note: "",
    createdAt: "2026-10-18T00:00:00Z",
  };
}
const V1 = ver("00000000-0000-4000-8000-00000000c001", GV1, 1);
const V2 = ver("00000000-0000-4000-8000-00000000c002", GV2, 1);

function item(s: ProjectState, v: GlobalVersion, assetId: string): UseGlobalItem {
  const versionId = tid<"asset_version">();
  return {
    version: v,
    variant: variants.find((x) => x.id === v.variantId)!,
    versionId,
    media: {
      path: `${s.project.id}/source/${assetId}/${versionId}/${SHA}.png`,
      mimeType: "image/png",
      width: 10,
      height: 10,
      byteSize: 100,
      sha256: SHA,
    },
  };
}

function useAll(s: ProjectState, versions: GlobalVersion[]): ProjectState {
  const assetId = linkedProjectAsset(s, GA)?.id ?? tid<"asset">();
  const plan = planUseGlobal(
    s,
    asset,
    versions.map((v) => item(s, v, assetId)),
    { assetId: assetId as never, variantIds: { [GV1]: tid<"asset_variant">(), [GV2]: tid<"asset_variant">() } },
  );
  for (const c of plan.commands) s = mustApply(s, c);
  return s;
}

describe("GP2 søk og filter (G6)", () => {
  const other: GlobalAsset = { ...asset, id: tid(), kind: "logo", name: "Trollfilm-logo", description: "", tags: ["logo"], categories: [] };
  it("søker i navn, merker og kategorier uten filnavn", () => {
    expect(filterGlobalAssets([asset, other], { ...EMPTY_GLOBAL_FILTER, query: "maskot" }).map((a) => a.name)).toEqual(["Teamfigur Maja"]);
    expect(filterGlobalAssets([asset, other], { ...EMPTY_GLOBAL_FILTER, query: "figurer maja" })).toHaveLength(1);
  });
  it("filtrerer på type, merke og arkivert", () => {
    expect(filterGlobalAssets([asset, other], { ...EMPTY_GLOBAL_FILTER, kind: "logo" })).toEqual([other]);
    expect(filterGlobalAssets([asset, other], { ...EMPTY_GLOBAL_FILTER, tag: "blå" })).toEqual([asset]);
    const arch = { ...other, archived: true };
    expect(filterGlobalAssets([asset, arch], EMPTY_GLOBAL_FILTER)).toEqual([asset]);
    expect(filterGlobalAssets([asset, arch], { ...EMPTY_GLOBAL_FILTER, includeArchived: true })).toHaveLength(2);
  });
});

describe("GP2 «Bruk i prosjekt» (G3, G4, G5, §7)", () => {
  it("lager én prosjektressurs med to varianter, koblingen og godkjente første versjoner", () => {
    const s = useAll(seedProject(2).state, [V1, V2]);
    const a = linkedProjectAsset(s, GA)!;
    expect(a.kind).toBe("character");
    const vars = Object.values(s.assetVariants).filter((v) => v.assetId === a.id);
    expect(vars).toHaveLength(2);
    expect(vars.every((v) => v.approvedVersionId !== null)).toBe(true);
    const vs = Object.values(s.assetVersions).filter((v) => v.globalSource?.assetId === GA);
    expect(vs.map((v) => v.globalSource!.versionId).sort()).toEqual([V1.id, V2.id].sort());
  });

  it("samme globale versjon igjen i samme prosjekt gjenbruker ressursen og versjonen (én kopi per prosjekt)", () => {
    const s = useAll(seedProject(2).state, [V1]);
    const plan = planUseGlobal(s, asset, [item(s, V1, linkedProjectAsset(s, GA)!.id)], {
      assetId: tid(),
      variantIds: { [GV1]: tid(), [GV2]: tid() },
    });
    expect(plan.reusedAsset).toBe(true);
    expect(plan.commands).toEqual([]);
    expect(plan.reusedVersions).toHaveLength(1);
  });

  it("to prosjekter bruker samme globale ressurs uavhengig (G3)", () => {
    const a = useAll(seedProject(1).state, [V1]);
    const b = useAll(seedProject(1).state, [V1]);
    expect(linkedProjectAsset(a, GA)).not.toBeNull();
    expect(linkedProjectAsset(b, GA)).not.toBeNull();
  });
});

describe("GP2 ny global versjon (G8, G9, §9)", () => {
  const V1b = ver("00000000-0000-4000-8000-00000000c003", GV1, 2);
  const bundle: GlobalAssetBundle = { asset, variants, versions: [V1b, V1, V2] };

  it("varsler om nyere versjon uten å endre prosjektet", () => {
    const s = useAll(seedProject(2).state, [V1]);
    const ups = globalUpdates(s, [bundle]);
    expect(ups).toHaveLength(1);
    expect(ups[0]!.usedNumber).toBe(1);
    expect(ups[0]!.newer.id).toBe(V1b.id);
  });

  it("brukeren velger å hente den: ny versjon i samme variant, godkjent versjon endres ikke", () => {
    let s = useAll(seedProject(2).state, [V1]);
    const a = linkedProjectAsset(s, GA)!;
    const variant = Object.values(s.assetVariants).find((v) => v.assetId === a.id)!;
    const approved = variant.approvedVersionId;
    const plan = planUseGlobal(s, asset, [item(s, V1b, a.id)], { assetId: tid(), variantIds: {} });
    expect(plan.commands.map((c) => c.type)).toEqual(["AddAssetVersion"]);
    for (const c of plan.commands) s = mustApply(s, c);
    expect(s.assetVariants[variant.id]!.approvedVersionId).toBe(approved);
    expect(globalUpdates(s, [bundle])).toEqual([]);
  });
});

describe("GP2 kobling i kommandoer og rader", () => {
  it("angre og gjør om beholder koblingen", () => {
    const seed = seedProject(1);
    let s = seed.state;
    const assetId = tid<"asset">();
    const create: Command = {
      type: "CreateAssets",
      assets: [{ assetId, globalAssetId: GA, fields: { kind: "other", name: "Logo", names: [], description: "", category: "", tags: [] } }],
    };
    const r = applyCommand(s, envelope(create));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const undo = applyCommand(r.state, envelope(r.inverse));
    expect(undo.ok).toBe(true);
    if (!undo.ok) return;
    const redo = applyCommand(undo.state, envelope(undo.inverse));
    expect(redo.ok && redo.state.assets[assetId]!.globalAssetId).toBe(GA);
    s = r.state;
  });

  it("ugyldig global ID avvises", () => {
    const r = applyCommand(
      seedProject(1).state,
      envelope({
        type: "CreateAssets",
        assets: [{ assetId: tid(), globalAssetId: "ikke-en-id", fields: { kind: "other", name: "X", names: [], description: "", category: "", tags: [] } }],
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("radene skriver og leser koblingen", () => {
    const s = useAll(seedProject(1).state, [V1]);
    const a = linkedProjectAsset(s, GA)!;
    const v = Object.values(s.assetVersions).find((x) => x.globalSource)!;
    const ar = toRow("assets", a, s.project.id);
    const vr = toRow("assetVersions", v, s.project.id);
    expect(ar["source_global_asset_id"]).toBe(GA);
    expect(vr["source_global_version_id"]).toBe(V1.id);
    const back = stateFromRows({
      project: { id: s.project.id, name: "P", revision: 1, fps_num: 25, fps_den: 1 },
      productions: [],
      scenes: [],
      scene_variants: [],
      script_blocks: [],
      script_block_revisions: [],
      scene_occurrences: [],
      production_segments: [],
      takes: [],
      assets: [ar],
      asset_variants: [toRow("assetVariants", s.assetVariants[v.variantId]!, s.project.id)],
      asset_versions: [vr],
    } as never);
    expect(back.assets[a.id]!.globalAssetId).toBe(GA);
    expect(back.assetVersions[v.id]!.globalSource).toEqual({ assetId: GA, variantId: GV1, versionId: V1.id });
  });
});

describe("GP2 lagringsstier", () => {
  it("globale stier hører til gruppe og ressurs", () => {
    const p = globalFilePath(WS, GA, SHA, "PNG");
    expect(p).toBe(`global/${WS}/${GA}/${SHA}.png`);
    expect(isGlobalPathOf(p, WS, GA)).toBe(true);
    expect(isGlobalPathOf(p, "00000000-0000-4000-8000-00000000bbbb")).toBe(false);
    expect(isGlobalPathOf(`global/${WS}/../x.png`, WS)).toBe(false);
  });
});

describe("GP2 sikkerhetskopi (§16)", () => {
  it("koblingen til det globale biblioteket er bare metadata og stopper ikke gjenopprettingen", async () => {
    const { assertSelfContained, remapValue } = await import("@/core/backup");
    const id = tid<"asset">();
    const vid = tid<"asset_version">();
    const b = {
      tables: {
        assets: [{ id, source_global_asset_id: GA }],
        asset_versions: [{ id: vid, source_global_asset_id: GA, source_global_variant_id: GV1, source_global_version_id: V1.id }],
      },
    } as never;
    const map = new Map<string, string>([[id, tid()], [vid, tid()]]);
    expect(() => assertSelfContained(b, map)).not.toThrow();
    const row = remapValue({ id, source_global_asset_id: GA }, map);
    expect(row.source_global_asset_id).toBe(GA);
  });
});
