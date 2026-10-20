/**
 * M8: navngitte kvalitetsprofiler per prosjekt (REQ-0854–0862, migrasjon 0063). En profil samler modellvalg
 * per AI-type, oppløsning, innsatsnivå, antall varianter, eksportinnstillinger og en eventuell budsjettgrense.
 * Én profil er aktiv i prosjektet og kan overstyres per generering eller eksport. Profilene er prosjektdata
 * og skrives via kommandoer og apply_changes; å bytte profil endrer aldri eksisterende resultater – hvert
 * resultat får et øyeblikksbilde av profilen i metadataen (generation_jobs.params.qualityProfile).
 * Ren TypeScript (ADR-0003).
 */
import { L } from "../i18n";
import type { ProjectState } from "../model";
import type { EffortLevel, ImageSize } from "./providers";

/** AI-typene en profil kan velge modell for. */
export type QualityProfileModelKind = "image" | "video" | "speech" | "sound";
export const QUALITY_PROFILE_MODEL_KINDS: readonly QualityProfileModelKind[] = [
  "image",
  "video",
  "speech",
  "sound",
];

export const QUALITY_PROFILE_MODEL_KIND_LABEL: Record<QualityProfileModelKind, string> = {
  image: L("Bilder", "Images"),
  video: L("Video", "Video"),
  speech: L("Tale", "Speech"),
  sound: L("Lyd", "Sound"),
};

/** Eksportinnstillingene profilen foreslår (kan overstyres i hver eksportdialog). */
export interface QualityProfileExport {
  readonly format?: "mp4" | "webm" | "png-seq";
  readonly bitrateKbps?: number | null;
  readonly alpha?: "straight" | "premultiplied" | null;
}

export interface QualityProfileSpec {
  /** Modell-ID per AI-type (fra leverandørkatalogen); mangler = innsatsnivået velger. */
  readonly models?: Partial<Record<QualityProfileModelKind, string>>;
  readonly resolution?: ImageSize | null;
  readonly effort?: EffortLevel | null;
  /** Antall kandidater/varianter per generering (1–8). */
  readonly variants?: number | null;
  readonly export?: QualityProfileExport | null;
  /** Budsjettgrense: høyeste antall genereringer per kalendermåned med denne profilen (null = ingen). */
  readonly budgetLimit?: number | null;
}

export interface QualityProfile {
  readonly id: string;
  readonly revision: number;
  readonly name: string;
  readonly spec: QualityProfileSpec;
  readonly removed: boolean;
  readonly createdBy?: string | null;
  readonly createdAt?: string;
  readonly editedBy?: string | null;
  readonly editedAt?: string | null;
}

export const QUALITY_PROFILE_MAX_NAME = 80;
export const QUALITY_PROFILE_MAX_SPEC_BYTES = 8192;
export const QUALITY_PROFILE_MAX_VARIANTS = 8;
export const QUALITY_PROFILE_MAX_BUDGET = 100000;

/** Feilmelding (norsk/engelsk) eller null når profilen er gyldig. */
export function qualityProfileError(name: string, spec: QualityProfileSpec): string | null {
  const n = name.trim();
  if (n.length === 0 || n.length > QUALITY_PROFILE_MAX_NAME)
    return L(
      `Navnet må ha mellom 1 og ${QUALITY_PROFILE_MAX_NAME} tegn`,
      `The name must be between 1 and ${QUALITY_PROFILE_MAX_NAME} characters`,
    );
  if (spec.effort !== undefined && spec.effort !== null && !["fast", "balanced", "premium"].includes(spec.effort))
    return L("Ugyldig innsatsnivå", "Invalid effort level");
  if (
    spec.resolution !== undefined &&
    spec.resolution !== null &&
    !["1K", "2K", "4K"].includes(spec.resolution)
  )
    return L("Ugyldig oppløsning", "Invalid resolution");
  if (spec.variants !== undefined && spec.variants !== null) {
    const v = spec.variants;
    if (!Number.isInteger(v) || v < 1 || v > QUALITY_PROFILE_MAX_VARIANTS)
      return L(
        `Antall varianter må være et helt tall mellom 1 og ${QUALITY_PROFILE_MAX_VARIANTS}`,
        `The number of variants must be a whole number between 1 and ${QUALITY_PROFILE_MAX_VARIANTS}`,
      );
  }
  if (spec.budgetLimit !== undefined && spec.budgetLimit !== null) {
    const b = spec.budgetLimit;
    if (!Number.isInteger(b) || b < 0 || b > QUALITY_PROFILE_MAX_BUDGET)
      return L(
        `Budsjettgrensen må være et helt tall mellom 0 og ${QUALITY_PROFILE_MAX_BUDGET.toLocaleString()}`,
        `The budget limit must be a whole number between 0 and ${QUALITY_PROFILE_MAX_BUDGET.toLocaleString()}`,
      );
  }
  if (spec.export) {
    if (spec.export.format != null && !["mp4", "webm", "png-seq"].includes(spec.export.format)) return L("Ugyldig eksportformat", "Invalid export format");
    if (spec.export.alpha != null && !["straight", "premultiplied"].includes(spec.export.alpha)) return L("Ugyldig alfa", "Invalid alpha");
    const bitrate = spec.export.bitrateKbps;
    if (bitrate != null && (!Number.isInteger(bitrate) || bitrate < 100 || bitrate > 100000)) return L("Bitrate må være mellom 100 og 100000 kbps", "Bitrate must be between 100 and 100000 kbps");
  }
  if (spec.models)
    for (const k of Object.keys(spec.models))
      if (!QUALITY_PROFILE_MODEL_KINDS.includes(k as QualityProfileModelKind) || typeof spec.models[k as QualityProfileModelKind] !== "string" || (spec.models[k as QualityProfileModelKind]?.length ?? 0) > 200)
        return L("Ukjent AI-type i profilen", "Unknown AI type in the profile");
  try {
    if (new TextEncoder().encode(JSON.stringify(spec ?? {})).length > QUALITY_PROFILE_MAX_SPEC_BYTES)
      return L("Profilen er for stor", "The profile is too large");
  } catch {
    return L("Ugyldig profil", "Invalid profile");
  }
  return null;
}

/**
 * Standardprofilene (M8): «Utkast», «Gjennomgang» og «Endelig». De opprettes for nye prosjekter (i
 * create_project) og tilbys eksisterende prosjekter som et valg – ingen stille endring av oppførselen.
 * Navnene er data (som «Hovedfilm») og kan endres av brukeren etterpå.
 */
export function defaultQualityProfiles(): readonly { readonly name: string; readonly spec: QualityProfileSpec }[] {
  return [
    { name: "Utkast", /* i18n-ignore: user-editable default data, mirrored in migration */ spec: { effort: "fast", variants: 1, resolution: "1K", export: { format: "mp4", bitrateKbps: 4000 } } },
    { name: "Gjennomgang", spec: { effort: "balanced", variants: 2, resolution: "2K", export: { format: "mp4", bitrateKbps: 8000 } } },
    { name: "Endelig", spec: { effort: "premium", variants: 2, resolution: "4K", export: { format: "mp4", bitrateKbps: 16000 } } },
  ];
}

/** Den aktive profilen i prosjektet, eller null (oppførselen er da nøyaktig som før profilene fantes). */
export function activeQualityProfile(
  s: Pick<ProjectState, "project" | "qualityProfiles">,
): QualityProfile | null {
  const id = s.project.activeQualityProfileId;
  if (!id) return null;
  const p = s.qualityProfiles[id];
  return p && !p.removed ? p : null;
}

/** Profilene som ikke er fjernet, nyeste sist (stabilt på navn). */
export function qualityProfilesOf(
  s: Pick<ProjectState, "qualityProfiles">,
): readonly QualityProfile[] {
  return Object.values(s.qualityProfiles ?? {})
    .filter((p) => !p.removed)
    .sort((a, b) => a.name.localeCompare(b.name, "nb") || a.id.localeCompare(b.id));
}

/**
 * Øyeblikksbildet som lagres i resultatets metadata (REQ-0859): profilens ID, navn og innstillinger slik de
 * var da resultatet ble laget. En senere endring av profilen endrer aldri dette øyeblikksbildet.
 */
export interface QualityProfileSnapshot {
  readonly id: string;
  readonly name: string;
  readonly spec: QualityProfileSpec;
}

export function qualityProfileSnapshot(p: QualityProfile): QualityProfileSnapshot {
  return { id: p.id, name: p.name, spec: JSON.parse(JSON.stringify(p.spec ?? {})) as QualityProfileSpec };
}

/** Øyeblikksbildet en lagret jobb ble laget med (params.qualityProfile), eller null. */
export function jobQualityProfile(job: {
  readonly params?: Readonly<Record<string, unknown>>;
}): QualityProfileSnapshot | null {
  const q = job.params?.["qualityProfile"];
  if (!q || typeof q !== "object") return null;
  const o = q as Record<string, unknown>;
  if (typeof o["id"] !== "string" || typeof o["name"] !== "string") return null;
  return {
    id: o["id"],
    name: o["name"],
    spec: (o["spec"] && typeof o["spec"] === "object" ? o["spec"] : {}) as QualityProfileSpec,
  };
}

/**
 * Budsjettgrensen i profilen (REQ-0858): hvor mange genereringer som er igjen denne måneden med denne
 * profilen (null = profilen har ingen grense). `used` er månedens forbruk (fra aiUsage).
 */
export function profileBudgetRemaining(
  profile: Pick<QualityProfile, "spec"> | null,
  used: number,
): number | null {
  const limit = profile?.spec.budgetLimit;
  if (limit === undefined || limit === null) return null;
  return Math.max(0, limit - used);
}

/**
 * Validerer et profiløyeblikksbilde fra klienten før det lagres i jobbens metadata (serverfunksjonene).
 * Returnerer null når feltet mangler; kaster ved ugyldig innhold. Størrelsen er begrenset slik at
 * metadataen ikke kan blåses opp.
 */
export function parseQualityProfileMeta(x: unknown): QualityProfileSnapshot | null {
  if (x === undefined || x === null) return null;
  if (typeof x !== "object") throw new Error(L("Ugyldig kvalitetsprofil", "Invalid quality profile"));
  const o = x as Record<string, unknown>;
  if (typeof o["id"] !== "string" || !/^[0-9a-f-]{36}$/i.test(o["id"]))
    throw new Error(L("Ugyldig kvalitetsprofil", "Invalid quality profile"));
  if (typeof o["name"] !== "string" || o["name"].length > QUALITY_PROFILE_MAX_NAME)
    throw new Error(L("Ugyldig kvalitetsprofil", "Invalid quality profile"));
  const spec = o["spec"] && typeof o["spec"] === "object" ? o["spec"] : {};
  if (new TextEncoder().encode(JSON.stringify(spec)).length > QUALITY_PROFILE_MAX_SPEC_BYTES)
    throw new Error(L("Kvalitetsprofilen er for stor", "The quality profile is too large"));
  const error = qualityProfileError(o["name"], spec as QualityProfileSpec);
  if (error) throw new Error(error);
  return { id: o["id"], name: o["name"], spec: JSON.parse(JSON.stringify(spec)) as QualityProfileSpec };
}
