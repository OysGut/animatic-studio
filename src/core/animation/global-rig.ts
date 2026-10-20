/**
 * CA7 (§52–§53): rigg-oppsett og mønstre i det globale biblioteket. Publisering lager en ny, låst versjon i
 * arbeidsgruppen. Bruk i et prosjekt kopierer oppsettet inn som en ny prosjektversjon med opprinnelse; nyere
 * globale versjoner tas bare inn når brukeren bekrefter. Bilder kobles via den globale versjonen eller sha256.
 */

import type { AssetVersion, ProjectState } from "../model";
import type { GlobalAssetBundle, GlobalVersion } from "../library/global";
import type { Command } from "../commands/types";
import type { AnimationPattern, PatternSpec } from "./patterns";
import type { AnimationRig, CharacterBehavior, RigSpec } from "./rig";
import { t } from "@/core/i18n/keyed";

export interface GlobalPatternEntry {
  readonly key: string;
  readonly name: string;
  readonly color: string;
  readonly spec: PatternSpec;
}

export interface GlobalAnimationSpec {
  readonly id: string;
  readonly workspaceId: string;
  readonly globalAssetId: string;
  readonly variantId: string;
  readonly number: number;
  /** Bilde-ID-er i spec-en er globale versjons-ID-er; mønster-ID-er er nøkler i `patterns`. */
  readonly rig: RigSpec & { readonly sourceGlobalVersionId: string };
  readonly patterns: readonly GlobalPatternEntry[];
  readonly note: string;
  readonly createdAt: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Den globale versjonen som svarer til en prosjektversjon (lenke fra «Bruk», ellers samme fil). */
function globalOf(version: AssetVersion, bundle: GlobalAssetBundle): GlobalVersion | null {
  if (version.globalSource) {
    const linked = bundle.versions.find((g) => g.id === version.globalSource!.versionId);
    if (linked) return linked;
  }
  return bundle.versions.find((g) => g.sha256 === version.sha256) ?? null;
}

/** Prosjektversjonen som svarer til en global versjon i ressursen, eller null. */
export function projectVersionOf(s: ProjectState, assetId: string, g: GlobalVersion | { id: string; sha256: string }): AssetVersion | null {
  const all = Object.values(s.assetVersions).filter((v) => !v.removed && s.assetVariants[v.variantId]?.assetId === assetId);
  return all.find((v) => v.globalSource?.versionId === g.id) ?? all.find((v) => v.sha256 === g.sha256) ?? null;
}

/**
 * Gjør prosjektoppsettet om til en global spesifikasjon. Alle bilder oppsettet bruker, må finnes i den globale
 * ressursen (lagre ressursen i det globale biblioteket først).
 */
export function toGlobalRig(
  s: ProjectState,
  rigVersionId: string,
  bundle: GlobalAssetBundle,
): Result<{ variantId: string; rig: GlobalAnimationSpec["rig"]; patterns: GlobalPatternEntry[] }> {
  const v = s.animationRigVersions[rigVersionId];
  const source = v ? s.assetVersions[v.sourceVersionId] : undefined;
  if (!v || !source) return { ok: false, error: t("core-animation-global-rig.error.error.33d895fb262d") };
  const missing = () => ({
    ok: false as const,
    error: t("core-animation-global-rig.error.error.0cb206391860"),
  });
  const g = globalOf(source, bundle);
  if (!g) return missing();
  const parts: Record<string, RigSpec["parts"] extends Readonly<Record<string, infer P>> | undefined ? P : never> = {};
  for (const [slot, part] of Object.entries(v.spec.parts ?? {})) {
    if (!part.versionId) {
      parts[slot] = { ...part };
      continue;
    }
    const pv = s.assetVersions[part.versionId];
    const pg = pv ? globalOf(pv, bundle) : null;
    if (!pg) return missing();
    const { mobileImportId: _m, ...rest } = part;
    parts[slot] = { ...rest, versionId: pg.id };
  }
  const patterns: GlobalPatternEntry[] = [];
  const keyOf = new Map<string, string>();
  const take = (id: string | null | undefined): string | null | undefined => {
    if (id == null) return id;
    const p = s.animationPatterns[id];
    if (!p || p.removed) return null;
    let k = keyOf.get(id);
    if (!k) {
      k = `p${patterns.length + 1}`;
      keyOf.set(id, k);
      patterns.push({ key: k, name: p.name, color: p.color, spec: structuredClone(p.spec) });
    }
    return k;
  };
  // Mønstre som tilhører oppsettet, følger med selv om de ikke er standard ennå
  for (const p of Object.values(s.animationPatterns).filter((x) => !x.removed && x.rigId === v.rigId).sort((a, b) => (a.id < b.id ? -1 : 1))) take(p.id);
  let behavior: CharacterBehavior | undefined;
  if (v.spec.behavior) {
    const b = v.spec.behavior;
    behavior = {
      ...b,
      ...(b.leftEyePatternId !== undefined ? { leftEyePatternId: take(b.leftEyePatternId) ?? null } : {}),
      ...(b.rightEyePatternId !== undefined ? { rightEyePatternId: take(b.rightEyePatternId) ?? null } : {}),
      ...(b.overlayPatternIds ? { overlayPatternIds: b.overlayPatternIds.map((x) => take(x)).filter((x): x is string => !!x) } : {}),
    };
  }
  const { origin: _o, ...spec } = v.spec;
  return {
    ok: true,
    value: {
      variantId: g.variantId,
      rig: { ...structuredClone(spec), parts, ...(behavior ? { behavior } : {}), sourceGlobalVersionId: g.id },
      patterns,
    },
  };
}

export interface ImportIds {
  readonly rigId: string;
  readonly versionId: string;
  readonly patternIds: Readonly<Record<string, string>>;
}

/**
 * Kommandoene som tar en global versjon inn i prosjektet (én angregruppe). Eksisterende scener beholder sin
 * versjon; bruk av den nye versjonen velges etterpå med «bare her» / «oppdater alle».
 */
export function planImportGlobalRig(
  s: ProjectState,
  spec: GlobalAnimationSpec,
  bundle: GlobalAssetBundle,
  projectAssetId: string,
  ids: ImportIds,
): Result<{ commands: Command[]; rigId: string; versionId: string }> {
  const gSource = bundle.versions.find((g) => g.id === spec.rig.sourceGlobalVersionId);
  const source = gSource ? projectVersionOf(s, projectAssetId, gSource) : null;
  if (!source)
    return {
      ok: false,
      error: t("core-animation-global-rig.error.error.18fe93488174"),
    };
  const parts: Record<string, NonNullable<RigSpec["parts"]>[string]> = {};
  for (const [slot, part] of Object.entries(spec.rig.parts ?? {})) {
    if (!part.versionId) {
      parts[slot] = part;
      continue;
    }
    const g = bundle.versions.find((x) => x.id === part.versionId);
    const pv = g ? projectVersionOf(s, projectAssetId, g) : null;
    if (!pv)
      return {
        ok: false,
        error: t("core-animation-global-rig.error.error.91da537ca3cc"),
      };
    parts[slot] = { ...part, versionId: pv.id };
  }
  const existingRig: AnimationRig | undefined = Object.values(s.animationRigs).find((r) => !r.removed && r.variantId === source.variantId);
  const rigId = existingRig?.id ?? ids.rigId;
  const commands: Command[] = [];
  if (!existingRig) commands.push({ type: "CreateRig", rigId, variantId: source.variantId });
  const patternId = new Map<string, string>();
  for (const p of spec.patterns) {
    const id = ids.patternIds[p.key];
    if (!id) return { ok: false, error: t("core-animation-global-rig.error.error.016e0d09557a") };
    patternId.set(p.key, id);
    const pattern: AnimationPattern = { id, revision: 0, rigId, name: p.name, color: p.color, spec: p.spec, removed: false };
    commands.push({ type: "SaveAnimationPattern", pattern });
  }
  const map = (k: string | null | undefined) => (k == null ? k : (patternId.get(k) ?? null));
  const b = spec.rig.behavior;
  const behavior: CharacterBehavior | undefined = b
    ? {
        ...b,
        ...(b.leftEyePatternId !== undefined ? { leftEyePatternId: map(b.leftEyePatternId) ?? null } : {}),
        ...(b.rightEyePatternId !== undefined ? { rightEyePatternId: map(b.rightEyePatternId) ?? null } : {}),
        ...(b.overlayPatternIds ? { overlayPatternIds: b.overlayPatternIds.map((x) => map(x)).filter((x): x is string => !!x) } : {}),
      }
    : undefined;
  const { sourceGlobalVersionId: _s, ...rest } = spec.rig;
  commands.push({
    type: "SaveRigVersion",
    rigId,
    versionId: ids.versionId,
    sourceVersionId: source.id,
    spec: {
      ...rest,
      parts,
      ...(behavior ? { behavior } : {}),
      origin: { globalSpecId: spec.id, globalNumber: spec.number, globalVariantId: spec.variantId },
    },
  });
  return { ok: true, value: { commands, rigId, versionId: ids.versionId } };
}

/** Nyeste globale versjon som er nyere enn den oppsettet kom fra (oppdatering krever bekreftelse), ellers null. */
export function globalRigUpdate(s: ProjectState, rigId: string, specs: readonly GlobalAnimationSpec[]): GlobalAnimationSpec | null {
  const rig = s.animationRigs[rigId];
  const current = rig?.currentVersionId ? s.animationRigVersions[rig.currentVersionId] : undefined;
  const origin = current?.spec.origin;
  if (!origin) return null;
  const newer = specs.filter((x) => x.variantId === origin.globalVariantId && x.number > origin.globalNumber).sort((a, b) => b.number - a.number);
  return newer[0] ?? null;
}
