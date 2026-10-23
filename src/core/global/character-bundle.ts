/**
 * G-6 pkt 1: globale karakterknipper. Et knippe samler det som hører til en karakter i arbeidsgruppens
 * bibliotek (migrasjon 0098): stemmeprofil, faktaark med tekstversjoner, munnsett, riggoppsett og
 * godkjente bildeversjoner. Kniplene er uforanderlige; endringer publiseres som et nytt nummer.
 *
 * Innhenting til et prosjekt skjer bare etter bekreftelse og lager nye versjoner – ingenting overskrives
 * stille. `planCharacterPull` regner ut felt for felt hva som tas inn og hva som bevares: et felt der den
 * lokale verdien er uendret siden forrige innhenting (eller mangler), oppdateres; et felt brukeren har
 * endret selv (lokal overstyring), bevares og meldes som «beholdt». Plattformnøytralt, ingen sideeffekter.
 */
import type { AssetVoice, BriefVersion } from "../model";
import { assetVoiceError } from "../dialogue/voice";
import { briefVersionsError } from "../assets/brief-versions";

export const BUNDLE_MAX_APPROVED = 200;
export const MOUTH_SYSTEMS = ["rhubarb", "preston-blair"] as const;
export type MouthSystem = (typeof MOUTH_SYSTEMS)[number];

export interface BundleMouthSet {
  readonly system: MouthSystem;
  readonly variants: Readonly<Record<string, unknown>>;
}

/** Det som lagres i ett knippenummer (global_character_bundles, 0098). */
export interface CharacterBundle {
  readonly number: number;
  readonly voice: AssetVoice | null;
  readonly briefVersions: readonly BriefVersion[];
  readonly activeBriefId: string | null;
  readonly mouthSets: readonly BundleMouthSet[];
  readonly rigSetup: Readonly<Record<string, unknown>> | null;
  readonly approvedVersionIds: readonly string[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/** Validering av et knippe på adaptergrensen (database/synk). Returnerer feilkode eller null. */
export function characterBundleError(raw: unknown): string | null {
  if (!isObj(raw)) return "bundle";
  if (typeof raw["number"] !== "number" || !Number.isInteger(raw["number"]) || raw["number"] < 1) return "number";
  const voice = raw["voice"] ?? null;
  if (voice !== null && assetVoiceError(voice as AssetVoice)) return "voice";
  const briefs = raw["briefVersions"] ?? raw["brief_versions"] ?? [];
  const active = raw["activeBriefId"] ?? raw["active_brief_id"] ?? null;
  if (briefVersionsError(briefs, active)) return "brief";
  const mouths = raw["mouthSets"] ?? raw["mouth_sets"] ?? [];
  if (!Array.isArray(mouths)) return "mouths";
  for (const m of mouths) {
    if (!isObj(m) || !MOUTH_SYSTEMS.includes(m["system"] as MouthSystem) || !isObj(m["variants"])) return "mouth";
  }
  const rig = raw["rigSetup"] ?? raw["rig_setup"] ?? null;
  if (rig !== null && !isObj(rig)) return "rig";
  const approved = raw["approvedVersionIds"] ?? raw["approved_version_ids"] ?? [];
  if (!Array.isArray(approved) || approved.length > BUNDLE_MAX_APPROVED || !approved.every(isUuid))
    return "approved";
  return null;
}

/** Leser et knippe fra radform (jsonb fra global_character_bundle) eller kjerneform. Null ved feil. */
export function parseCharacterBundle(raw: unknown): CharacterBundle | null {
  if (characterBundleError(raw) !== null) return null;
  const o = raw as Record<string, unknown>;
  return {
    number: o["number"] as number,
    voice: (o["voice"] ?? null) as AssetVoice | null,
    briefVersions: (o["briefVersions"] ?? o["brief_versions"] ?? []) as BriefVersion[],
    activeBriefId: (o["activeBriefId"] ?? o["active_brief_id"] ?? null) as string | null,
    mouthSets: (o["mouthSets"] ?? o["mouth_sets"] ?? []) as BundleMouthSet[],
    rigSetup: (o["rigSetup"] ?? o["rig_setup"] ?? null) as Record<string, unknown> | null,
    approvedVersionIds: (o["approvedVersionIds"] ?? o["approved_version_ids"] ?? []) as string[],
  };
}

export type PullAction = "apply" | "keep";
export interface PullField<T> {
  readonly action: PullAction;
  /** Verdien som tas inn når action er «apply». */
  readonly value: T;
}

/** Resultatet av en planlagt innhenting, felt for felt. «keep» = lokal overstyring som bevares. */
export interface CharacterPullPlan {
  /** true når prosjektet allerede har dette (eller et nyere) knippenummeret. */
  readonly upToDate: boolean;
  readonly bundleNumber: number;
  readonly voice: PullField<AssetVoice | null>;
  /** Nye tekstversjoner som legges BAKEST i den lokale listen; lokale versjoner endres aldri. */
  readonly briefVersionsToAppend: readonly BriefVersion[];
  readonly activeBriefId: PullField<string | null>;
  readonly mouthSets: readonly { readonly system: MouthSystem; readonly set: PullField<BundleMouthSet> }[];
  readonly rigSetup: PullField<Readonly<Record<string, unknown>> | null>;
}

/** Den lokale karakterens knippefelt (fra Asset + mouth_sets + rig_setups). */
export interface LocalCharacterState {
  readonly voice?: AssetVoice | null;
  readonly briefVersions?: readonly BriefVersion[];
  readonly activeBriefId?: string;
  readonly mouthSets?: readonly BundleMouthSet[];
  readonly rigSetup?: Readonly<Record<string, unknown>> | null;
  readonly globalBundleNumber?: number;
}

/**
 * Regner ut hva en bekreftet innhenting av `latest` gjør med den lokale karakteren.
 * `pulled` er knippet prosjektet sist tok inn (null ved første innhenting): den lokale verdien regnes som
 * en overstyring når den finnes og avviker fra det som sist ble hentet – da bevares den.
 */
export function planCharacterPull(
  local: LocalCharacterState,
  pulled: CharacterBundle | null,
  latest: CharacterBundle,
): CharacterPullPlan {
  const upToDate = local.globalBundleNumber !== undefined && latest.number <= local.globalBundleNumber;

  const voiceApply = local.voice == null || (pulled !== null && deepEqual(local.voice, pulled.voice));
  const voice: PullField<AssetVoice | null> =
    voiceApply && !deepEqual(local.voice ?? null, latest.voice)
      ? { action: "apply", value: latest.voice }
      : { action: "keep", value: local.voice ?? null };

  // Tekstversjoner legges bare til: hopp over versjoner som finnes lokalt (samme id eller samme tekst)
  const localBriefs = local.briefVersions ?? [];
  const localIds = new Set(localBriefs.map((b) => b.id));
  const localTexts = new Set(localBriefs.map((b) => b.text));
  const briefVersionsToAppend = latest.briefVersions.filter((b) => !localIds.has(b.id) && !localTexts.has(b.text));

  const localActive = local.activeBriefId ?? null;
  const activeApply =
    latest.activeBriefId !== null &&
    (localActive === null || (pulled !== null && localActive === pulled.activeBriefId));
  const activeBriefId: PullField<string | null> =
    activeApply && localActive !== latest.activeBriefId
      ? { action: "apply", value: latest.activeBriefId }
      : { action: "keep", value: localActive };

  const localMouths = new Map((local.mouthSets ?? []).map((m) => [m.system, m]));
  const mouthSets = latest.mouthSets.map((set) => {
    const have = localMouths.get(set.system);
    const pulledSet = pulled?.mouthSets.find((m) => m.system === set.system);
    const apply =
      !have || (pulledSet !== undefined && deepEqual(have.variants, pulledSet.variants));
    return {
      system: set.system,
      set: apply && (!have || !deepEqual(have.variants, set.variants))
        ? ({ action: "apply", value: set } as const)
        : ({ action: "keep", value: have ?? set } as const),
    };
  });

  const localRig = local.rigSetup ?? null;
  const rigApply = localRig === null || (pulled !== null && deepEqual(localRig, pulled.rigSetup));
  const rigSetup: PullField<Readonly<Record<string, unknown>> | null> =
    rigApply && !deepEqual(localRig, latest.rigSetup)
      ? { action: "apply", value: latest.rigSetup }
      : { action: "keep", value: localRig };

  return { upToDate, bundleNumber: latest.number, voice, briefVersionsToAppend, activeBriefId, mouthSets, rigSetup };
}

/** true når planen inneholder noe å ta inn (brukes til å skjule «Ta inn» når alt er likt). */
export function pullPlanHasChanges(plan: CharacterPullPlan): boolean {
  return (
    !plan.upToDate &&
    (plan.voice.action === "apply" ||
      plan.briefVersionsToAppend.length > 0 ||
      plan.activeBriefId.action === "apply" ||
      plan.mouthSets.some((m) => m.set.action === "apply") ||
      plan.rigSetup.action === "apply")
  );
}

/**
 * Bygger knippet som publiseres fra prosjektets karakter (G-6 pkt 1). Munnsettene lagres med
 * variantens NAVN per munnform – aldri lokale ID-er – slik at knippet er flyttbart mellom prosjekter.
 * Godkjente bildeversjoner tas bare med når de er kopiert fra det globale biblioteket (globalSource);
 * lokale versjoner må først publiseres som globale versjoner i den vanlige flyten. Riggoppsett er
 * scenebundet i prosjektmodellen og har ingen karakterkobling ennå, så rigSetup er null inntil en
 * slik kobling er vedtatt.
 */
export function characterBundleFromAsset(
  state: ProjectState,
  assetId: AssetId,
): Omit<CharacterBundle, "number"> | null {
  const asset = state.assets[assetId];
  if (!asset || asset.removed || (asset.kind !== "character" && asset.kind !== "animal")) return null;
  const variantsOf = Object.values(state.assetVariants).filter((v) => v.assetId === assetId && !v.archived);
  const variantName = new Map(variantsOf.map((v) => [v.id, v.name]));
  const mouthSets: BundleMouthSet[] = Object.values(state.mouthSets)
    .filter((ms) => ms.characterId === assetId && !ms.removed)
    .map((ms) => ({
      system: ms.system as MouthSystem,
      variants: Object.fromEntries(
        Object.entries(ms.variants).map(([shape, variantId]) => [
          shape,
          variantId ? (variantName.get(variantId) ?? null) : null,
        ]),
      ),
    }));
  const approvedVersionIds: string[] = [];
  for (const v of variantsOf) {
    if (!v.approvedVersionId) continue;
    const version = state.assetVersions[v.approvedVersionId];
    if (version && !version.removed && version.globalSource) approvedVersionIds.push(version.globalSource.versionId);
  }
  return {
    voice: asset.voice ?? null,
    briefVersions: asset.briefVersions ?? [],
    activeBriefId: asset.activeBriefId ?? null,
    mouthSets,
    rigSetup: null,
    approvedVersionIds: [...new Set(approvedVersionIds)],
  };
}

/**
 * Kommandoene som gjennomfører en bekreftet innhenting (G-6 pkt 1): ett felt per kommando, alt i én
 * angregruppe. Munnformer som peker på et variantnavn som ikke finnes lokalt, utelates (bevares aldri
 * som døde referanser). Knippenummeret merkes på ressursen via UpdateAsset, slik at senere innhentinger
 * kjenner igjen hva som er lokalt endret.
 */
export function planCharacterPullCommands(
  state: ProjectState,
  assetId: AssetId,
  plan: CharacterPullPlan,
): Command[] {
  const asset = state.assets[assetId];
  if (!asset || asset.removed) return [];
  const commands: Command[] = [];
  if (plan.voice.action === "apply") commands.push({ type: "SetAssetVoice", assetId, voice: plan.voice.value });
  if (plan.briefVersionsToAppend.length || plan.activeBriefId.action === "apply") {
    commands.push({
      type: "SetAssetBriefVersions",
      assetId,
      versions: [...(asset.briefVersions ?? []), ...plan.briefVersionsToAppend],
      activeId:
        plan.activeBriefId.action === "apply" ? plan.activeBriefId.value : (asset.activeBriefId ?? null),
    });
  }
  const localVariants = Object.values(state.assetVariants).filter((v) => v.assetId === assetId && !v.archived);
  const variantIdByName = new Map(localVariants.map((v) => [v.name, v.id]));
  for (const m of plan.mouthSets) {
    if (m.set.action !== "apply") continue;
    const existing = Object.values(state.mouthSets).find(
      (ms) => ms.characterId === assetId && ms.system === m.system && !ms.removed,
    );
    const variants: Record<string, string | null> = {};
    for (const [shape, name] of Object.entries(m.set.value.variants)) {
      if (typeof name !== "string" || !name) continue;
      const id = variantIdByName.get(name);
      if (id) variants[shape] = id;
    }
    commands.push({
      type: "SaveMouthSet",
      set: {
        id: existing?.id ?? newId("mouth_sets"),
        revision: 0,
        characterId: assetId,
        system: m.system,
        variants,
        removed: false,
      },
    });
  }
  commands.push({
    type: "UpdateAsset",
    assetId,
    fields: {
      kind: asset.kind,
      name: asset.name,
      names: asset.names,
      description: asset.description,
      category: asset.category,
      tags: asset.tags,
      globalBundleNumber: plan.bundleNumber,
    },
  });
  return commands;
}
