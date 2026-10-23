/**
 * G-6 pkt 1 og 4: globale karakterknipper. Dekker validering, innhentingsplanen med lokale overstyringer
 * og at knippeinnholdet tas med i prosjektets sikkerhetskopi (som vanlige prosjektrader).
 */
import { describe, expect, it } from "vitest";
import {
  characterBundleError,
  parseCharacterBundle,
  planCharacterPull,
  pullPlanHasChanges,
  type CharacterBundle,
} from "@/core/global/character-bundle";
import { BACKUP_STATE_TABLES } from "@/core/backup";
import { toRow, stateFromRows } from "@/core/patch";
import type { Asset, AssetVoice, BriefVersion } from "@/core/model";

const VOICE: AssetVoice = { provider: "elevenlabs", voiceId: "stemme-1", label: "Mor" };
const VOICE_LOCAL: AssetVoice = { provider: "elevenlabs", voiceId: "stemme-2", label: "Mor (lokal)" };
const B1: BriefVersion = { id: "b1", text: "En eldre kvinne med sjal", createdAt: "2026-10-01T10:00:00Z" };
const B2: BriefVersion = { id: "b2", text: "En eldre kvinne med sjal og stav", createdAt: "2026-10-02T10:00:00Z" };

function bundle(number: number, over: Partial<CharacterBundle> = {}): CharacterBundle {
  return {
    number,
    voice: VOICE,
    briefVersions: [B1],
    activeBriefId: "b1",
    mouthSets: [{ system: "rhubarb", variants: { A: "closed", B: "open" } }],
    rigSetup: { plates: [{ id: "p1", depth: 0 }] },
    approvedVersionIds: ["11111111-1111-1111-1111-111111111111"],
    ...over,
  };
}

describe("characterBundleError / parseCharacterBundle", () => {
  it("godtar et gyldig knippe og leser både kjerne- og radform", () => {
    const b = bundle(3);
    expect(characterBundleError(b)).toBeNull();
    expect(parseCharacterBundle(b)).toEqual(b);
    const rowForm = {
      number: 3,
      voice: VOICE,
      brief_versions: [B1],
      active_brief_id: "b1",
      mouth_sets: b.mouthSets,
      rig_setup: b.rigSetup,
      approved_version_ids: b.approvedVersionIds,
    };
    expect(parseCharacterBundle(rowForm)).toEqual(b);
  });

  it("avviser ugyldig stemme, faktaark, munnsett og versjonshenvisninger", () => {
    expect(characterBundleError(null)).toBe("bundle");
    expect(characterBundleError(bundle(0))).toBe("number");
    expect(characterBundleError(bundle(1, { voice: { provider: "x", voiceId: "!!", label: "" } as never }))).toBe("voice");
    expect(characterBundleError(bundle(1, { briefVersions: [{ id: "", text: "x", createdAt: "y" }] }))).toBe("brief");
    expect(characterBundleError(bundle(1, { mouthSets: [{ system: "annet", variants: {} } as never] }))).toBe("mouth");
    expect(characterBundleError(bundle(1, { rigSetup: [] as never }))).toBe("rig");
    expect(characterBundleError(bundle(1, { approvedVersionIds: ["ikke-uuid"] }))).toBe("approved");
    expect(parseCharacterBundle({ number: 1, voice: null, brief_versions: "feil" })).toBeNull();
  });
});

describe("planCharacterPull", () => {
  it("første innhenting tar inn alt og er aldri «oppdatert»", () => {
    const plan = planCharacterPull({}, null, bundle(1));
    expect(plan.upToDate).toBe(false);
    expect(plan.voice).toEqual({ action: "apply", value: VOICE });
    expect(plan.briefVersionsToAppend).toEqual([B1]);
    expect(plan.activeBriefId).toEqual({ action: "apply", value: "b1" });
    expect(plan.mouthSets[0]!.set.action).toBe("apply");
    expect(plan.rigSetup.action).toBe("apply");
    expect(pullPlanHasChanges(plan)).toBe(true);
  });

  it("samme eller eldre knippenummer gir ingen endringer", () => {
    const plan = planCharacterPull({ globalBundleNumber: 2 }, bundle(1), bundle(2));
    expect(plan.upToDate).toBe(true);
    expect(pullPlanHasChanges(plan)).toBe(false);
  });

  it("uendrede felt oppdateres til nytt knippe; ingenting overskrives stille", () => {
    const pulled = bundle(1);
    const latest = bundle(2, {
      voice: VOICE_LOCAL, // gruppen har valgt en annen stemme
      briefVersions: [B1, B2],
      activeBriefId: "b2",
      rigSetup: { plates: [{ id: "p1", depth: 5 }] },
    });
    const plan = planCharacterPull(
      {
        voice: VOICE, // lik forrige innhenting → ikke en overstyring
        briefVersions: [B1],
        activeBriefId: "b1",
        mouthSets: pulled.mouthSets,
        rigSetup: pulled.rigSetup,
        globalBundleNumber: 1,
      },
      pulled,
      latest,
    );
    expect(plan.upToDate).toBe(false);
    expect(plan.voice).toEqual({ action: "apply", value: VOICE_LOCAL });
    expect(plan.briefVersionsToAppend).toEqual([B2]); // B1 finnes fra før
    expect(plan.activeBriefId).toEqual({ action: "apply", value: "b2" });
    expect(plan.mouthSets[0]!.set.action).toBe("keep"); // uendret i knippet
    expect(plan.rigSetup.action).toBe("apply");
  });

  it("lokale overstyringer bevares: stemme, aktiv tekst, munnsett og rigg", () => {
    const pulled = bundle(1);
    const localMouth = [{ system: "rhubarb" as const, variants: { A: "lokal" } }];
    const localRig = { plates: [{ id: "egen", depth: 9 }] };
    const plan = planCharacterPull(
      {
        voice: VOICE_LOCAL, // avviker fra innhentet → overstyring
        briefVersions: [B1, { id: "egen", text: "Mitt eget utkast", createdAt: "2026-10-03T10:00:00Z" }],
        activeBriefId: "egen",
        mouthSets: localMouth,
        rigSetup: localRig,
        globalBundleNumber: 1,
      },
      pulled,
      bundle(2, { briefVersions: [B1, B2], activeBriefId: "b2" }),
    );
    expect(plan.voice).toEqual({ action: "keep", value: VOICE_LOCAL });
    expect(plan.activeBriefId).toEqual({ action: "keep", value: "egen" });
    expect(plan.mouthSets[0]!.set).toEqual({ action: "keep", value: localMouth[0] });
    expect(plan.rigSetup).toEqual({ action: "keep", value: localRig });
    // Nye tekstversjoner fra gruppen kommer likevel med, bakerst; lokale versjoner røres ikke
    expect(plan.briefVersionsToAppend).toEqual([B2]);
    expect(pullPlanHasChanges(plan)).toBe(true);
  });

  it("dupliserte tekster legges ikke inn på nytt selv med annen id", () => {
    const plan = planCharacterPull(
      { briefVersions: [{ id: "lokal-id", text: B1.text, createdAt: B1.createdAt }] },
      null,
      bundle(1),
    );
    expect(plan.briefVersionsToAppend).toEqual([]);
  });
});

describe("G-6 pkt 4: sikkerhetskopi tar med globale ressurser som snapshot", () => {
  it("karakterens tabeller er med i backup-listen", () => {
    for (const t of ["assets", "asset_variants", "asset_versions", "mouth_sets", "rig_setups", "style_profiles", "quality_profiles"])
      expect(BACKUP_STATE_TABLES).toContain(t);
  });

  it("global kobling og knippenummer overlever rad ↔ tilstand (backup-rundtur)", () => {
    const asset = {
      id: "a1",
      revision: 4,
      kind: "character",
      name: "Mor",
      names: [],
      description: "",
      category: "",
      tags: [],
      archived: false,
      voice: VOICE,
      briefVersions: [B1],
      activeBriefId: "b1",
      globalAssetId: "22222222-2222-2222-2222-222222222222",
      globalBundleNumber: 2,
    } as unknown as Asset;
    const row = toRow("assets", asset, "p1");
    expect(row["source_global_asset_id"]).toBe(asset.globalAssetId);
    expect(row["global_bundle_number"]).toBe(2);
    expect(row["voice"]).toEqual(VOICE);
    expect(row["brief_versions"]).toEqual([B1]);
    const state = stateFromRows({
      project: { id: "p1", revision: 1, name: "P", fps_num: 25, fps_den: 1 },
      assets: [row],
    } as never);
    const back = state.assets["a1" as never]!;
    expect(back.globalAssetId).toBe(asset.globalAssetId);
    expect(back.globalBundleNumber).toBe(2);
    expect(back.voice).toEqual(VOICE);
    expect(back.briefVersions).toEqual([B1]);
    expect(back.activeBriefId).toBe("b1");
  });
});
