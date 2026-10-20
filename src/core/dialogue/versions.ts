/**
 * DV2 (DIALOGUE_VOICE_SPEC §33–§40, §118–§122): lydversjoner per replikkforekomst.
 *
 * Eierskap:
 * - Replikkforekomsten (`AudioClip` med `blockId`, type dialog) eier plasseringen i scenen (`offsetMs`) og
 *   valget av aktiv versjon (`activeVersionId`).
 * - Lydversjonen (`DialogueVersion`) eier lydfilen og ALL redigering: trim, lengde, volum, fades, volumpunkter,
 *   hastighet og eventuell lydkomposisjon.
 *
 * Etter DV2 er versjonen eneste kilde for redigeringen. Klippets gamle felt (sourceInMs, lengthMs …) holdes
 * som en speiling for eldre lesere, og skrives bare av `mirrorDialogueClips` her – ett sted.
 * Bare dialog med replikk får versjoner; musikk, effekter, atmosfære og forteller uten replikk er uendret.
 *
 * Ren TypeScript (ADR-0003).
 */
import type { AudioClip, ProjectState, VolumeKey } from "../model";
import { blocksOfVariant } from "../views";

import { t as tk } from "@/core/i18n/keyed";

export type DialogueVersionSource = "record" | "ai" | "upload" | "legacy";
export const DIALOGUE_VERSION_SOURCES: readonly DialogueVersionSource[] = [
  "record",
  "ai",
  "upload",
  "legacy",
];

/** Redigeringen som hører til én lydversjon (§36). */
export interface DialogueEdit {
  readonly sourceInMs: number;
  readonly lengthMs: number;
  readonly gainDb: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly volumeKeys: readonly VolumeKey[];
  /** 0,25–4. 1 = uendret. */
  readonly speed: number;
  /** Lydkomposisjonen (en ressursversjon med `composition`) versjonen spiller, eller null. */
  readonly compositionId: string | null;
}

/** Lydfilen versjonen spiller (samme oppslag som et lydklipp: låst versjon, ellers variant/ressurs). */
export interface DialogueFile {
  readonly assetId: string;
  readonly assetVariantId: string | null;
  readonly assetVersionId: string | null;
}

/** Metadata (§40). Leverandørfeltene er null for opptak og opplastinger. */
export interface DialogueVersionMeta {
  readonly source: DialogueVersionSource;
  readonly provider: string | null;
  readonly voiceId: string | null;
  readonly modelId: string | null;
  readonly settings: Readonly<Record<string, string | number | boolean | null>>;
  /** Manusrevisjonen (blokkens `rev`) versjonen ble laget fra, eller null når den er ukjent (backfill). */
  readonly scriptRevision: number | null;
  readonly parentVersionId: string | null;
}

export interface DialogueVersionFields extends DialogueFile, DialogueEdit, DialogueVersionMeta {}

export interface DialogueVersion extends DialogueVersionFields {
  readonly id: string;
  readonly revision: number;
  readonly clipId: string;
  readonly createdAt?: string;
  /** Bare ved eksplisitt «Slett versjon» (kan angres). Aldri ved bytte, ny generering eller nytt opptak. */
  readonly removed: boolean;
}

export const EDIT_KEYS = [
  "sourceInMs",
  "lengthMs",
  "gainDb",
  "fadeInMs",
  "fadeOutMs",
  "volumeKeys",
  "speed",
  "compositionId",
] as const satisfies readonly (keyof DialogueEdit)[];

/** Bare dialog med replikk får versjoner. */
export function isVersionedKind(a: Pick<AudioClip, "kind" | "blockId">): boolean {
  return a.kind === "dialogue" && a.blockId !== null;
}

export function editOf(v: DialogueEdit): DialogueEdit {
  return {
    sourceInMs: v.sourceInMs,
    lengthMs: v.lengthMs,
    gainDb: v.gainDb,
    fadeInMs: v.fadeInMs,
    fadeOutMs: v.fadeOutMs,
    volumeKeys: v.volumeKeys.map((k) => ({ t: k.t, db: k.db })),
    speed: v.speed,
    compositionId: v.compositionId,
  };
}

/** Redigeringen slik et (uversjonert) lydklipp har den i sine egne felt. */
export function clipOwnEdit(a: AudioClip): DialogueEdit {
  return {
    sourceInMs: a.sourceInMs,
    lengthMs: a.lengthMs,
    gainDb: a.gainDb,
    fadeInMs: a.fadeInMs,
    fadeOutMs: a.fadeOutMs,
    volumeKeys: a.volumeKeys,
    speed: a.speed ?? 1,
    compositionId: null,
  };
}

export function fileOf(v: DialogueFile): DialogueFile {
  return { assetId: v.assetId, assetVariantId: v.assetVariantId, assetVersionId: v.assetVersionId };
}

export function sameFile(a: DialogueFile, b: DialogueFile): boolean {
  return (
    a.assetId === b.assetId &&
    a.assetVariantId === b.assetVariantId &&
    a.assetVersionId === b.assetVersionId
  );
}

function sameKeys(a: readonly VolumeKey[], b: readonly VolumeKey[]): boolean {
  return a.length === b.length && a.every((k, i) => k.t === b[i]!.t && k.db === b[i]!.db);
}

export function sameEdit(a: DialogueEdit, b: DialogueEdit): boolean {
  return (
    a.sourceInMs === b.sourceInMs &&
    a.lengthMs === b.lengthMs &&
    a.gainDb === b.gainDb &&
    a.fadeInMs === b.fadeInMs &&
    a.fadeOutMs === b.fadeOutMs &&
    a.speed === b.speed &&
    a.compositionId === b.compositionId &&
    sameKeys(a.volumeKeys, b.volumeKeys)
  );
}

/** Den aktive versjonen for et klipp, eller null (uversjonert klipp). */
export function activeDialogueVersion(s: ProjectState, a: AudioClip): DialogueVersion | null {
  const id = a.activeVersionId;
  if (!id) return null;
  const v = s.dialogueVersions[id];
  return v && v.clipId === a.id ? v : null;
}

/** Redigeringen avspilling, eksport, leppesynk og animasjon skal bruke: aktiv versjon, ellers klippets egen. */
export function clipEditOf(s: ProjectState, a: AudioClip): DialogueEdit {
  const v = activeDialogueVersion(s, a);
  return v ? editOf(v) : clipOwnEdit(a);
}

/** Lydfilen et klipp spiller: aktiv versjon, ellers klippets egne felt. */
export function clipFileOf(s: ProjectState, a: AudioClip): DialogueFile {
  const v = activeDialogueVersion(s, a);
  return v
    ? fileOf(v)
    : { assetId: a.assetId, assetVariantId: a.assetVariantId, assetVersionId: a.versionId };
}

/** Versjonene til et klipp, eldste først (opprettet, så ID). Fjernede med når `withRemoved`. */
export function versionsOfClip(
  s: ProjectState,
  clipId: string,
  withRemoved = false,
): DialogueVersion[] {
  return Object.values(s.dialogueVersions)
    .filter((v) => v.clipId === clipId && (withRemoved || !v.removed))
    .sort(
      (x, y) => (x.createdAt ?? "").localeCompare(y.createdAt ?? "") || x.id.localeCompare(y.id),
    );
}

/**
 * Deterministisk ID for versjonen et klipp får for en fil (samme på klient og server, som kjører samme
 * kommando på nytt). UUID-format (versjon 8, RFC 9562 egendefinert).
 */
export function dialogueVersionIdFor(clipId: string, file: DialogueFile): string {
  const key = `dv:${clipId}:${file.assetId}:${file.assetVariantId ?? "-"}:${file.assetVersionId ?? "-"}`;
  const words: number[] = [];
  for (let round = 0; round < 4; round++) {
    let h = 0x811c9dc5 ^ (round * 0x9e3779b1);
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    words.push(h >>> 0);
  }
  const hex = words.map((w) => w.toString(16).padStart(8, "0")).join("");
  const v = "8" + hex.slice(13, 16);
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${v}-${variant}-${hex.slice(20, 32)}`;
}

/** Feltene klippet speiler fra aktiv versjon. */
export function mirroredClip(a: AudioClip, v: DialogueVersion): AudioClip {
  const { speed: _s, ...rest } = a;
  return {
    ...rest,
    assetId: v.assetId as AudioClip["assetId"],
    assetVariantId: v.assetVariantId as AudioClip["assetVariantId"],
    versionId: v.assetVersionId as AudioClip["versionId"],
    sourceInMs: v.sourceInMs,
    lengthMs: v.lengthMs,
    gainDb: v.gainDb,
    fadeInMs: v.fadeInMs,
    fadeOutMs: v.fadeOutMs,
    volumeKeys: v.volumeKeys,
    ...(v.speed !== 1 ? { speed: v.speed } : {}),
  };
}

function clipMatches(a: AudioClip, v: DialogueVersion): boolean {
  return (
    sameFile({ assetId: a.assetId, assetVariantId: a.assetVariantId, assetVersionId: a.versionId }, v) &&
    sameEdit({ ...clipOwnEdit(a), compositionId: v.compositionId }, editOf(v))
  );
}

/** Klipp der speilingen ikke stemmer med aktiv versjon (invariant; skal alltid være tom). */
export function dialogueMirrorViolations(s: ProjectState): string[] {
  const out: string[] = [];
  for (const a of Object.values(s.audioClips)) {
    if (!a.activeVersionId) continue;
    const v = activeDialogueVersion(s, a);
    if (!v)
      out.push(`${a.id}: ${tk("core-dialogue-versions.dialogue-mirror-violations.out-push.bc58df6dc4c2")}`);
    else if (v.removed) out.push(`${a.id}: ${tk("core-dialogue-versions.dialogue-mirror-violations.out-push.5c4e099b2df6")}`);
    else if (!clipMatches(a, v)) out.push(`${a.id}: ${tk("core-dialogue-versions.dialogue-mirror-violations.out-push.6851c70819a8")} ${v.id}`);
  }
  return out;
}

/** Versjoner som peker på et klipp som ikke finnes (angre av opprettelse uten å ta versjonene med). */
export function orphanDialogueVersions(s: ProjectState): string[] {
  return Object.values(s.dialogueVersions)
    .filter((v) => !Object.prototype.hasOwnProperty.call(s.audioClips, v.clipId))
    .map((v) => v.id);
}

/**
 * ETT sted som skriver klippets speilfelt: for hvert klipp med aktiv versjon settes fil og redigering fra
 * versjonen. Revisjonen blir forrige lagrede + 1 (én per transaksjon).
 */
export function mirrorDialogueClips(
  before: ProjectState,
  after: ProjectState,
): { state: ProjectState; touched: string[] } {
  if (after.audioClips === before.audioClips && after.dialogueVersions === before.dialogueVersions)
    return { state: after, touched: [] };
  let clips: Record<string, AudioClip> | null = null;
  const touched: string[] = [];
  for (const a of Object.values(after.audioClips)) {
    const v = activeDialogueVersion(after, a);
    if (!v || clipMatches(a, v)) continue;
    const prev = before.audioClips[a.id];
    const revision = prev ? Math.max(a.revision, prev.revision + 1) : a.revision;
    clips ??= { ...after.audioClips };
    clips[a.id] = { ...mirroredClip(a, v), revision };
    touched.push(a.id);
  }
  return clips ? { state: { ...after, audioClips: clips }, touched } : { state: after, touched };
}

/** Taleren (karakterressurs) for en replikkforekomst: koblet ressurs, ellers karakternavnet i manus. */
export function speakerKeyOf(s: ProjectState, a: AudioClip): string | null {
  if (a.characterAssetId) return `asset:${a.characterAssetId}`;
  if (!a.blockId) return null;
  const occ = s.occurrences[a.occurrenceId];
  if (!occ) return null;
  const blocks = blocksOfVariant(s, occ.variantId);
  const i = blocks.findIndex((b) => b.id === a.blockId);
  for (let j = i - 1; j >= 0; j--) {
    const b = blocks[j]!;
    if (b.kind === "character") return `name:${b.text.trim().toUpperCase()}`;
    if (b.kind !== "parenthetical" && b.kind !== "dialogue") break;
  }
  return null;
}

/**
 * Andre replikker fra samme taler i samme scene som ville overlappe (§30, §39, L10). Brukes både til å
 * hindre flytting og til å varsle ved bytte av versjon med annen lengde. Flytter aldri noe.
 */
export function dialogueOverlaps(
  s: ProjectState,
  clipId: string,
  offsetMs?: number,
  lengthMs?: number,
): string[] {
  const a = s.audioClips[clipId];
  if (!a || a.removed || !isVersionedKind(a)) return [];
  const key = speakerKeyOf(s, a);
  if (!key) return [];
  const st = offsetMs ?? a.offsetMs;
  const en = st + (lengthMs ?? clipEditOf(s, a).lengthMs);
  return Object.values(s.audioClips)
    .filter(
      (b) =>
        b.id !== a.id &&
        !b.removed &&
        b.occurrenceId === a.occurrenceId &&
        isVersionedKind(b) &&
        (b.language ?? null) === (a.language ?? null) &&
        speakerKeyOf(s, b) === key &&
        b.offsetMs < en &&
        st < b.offsetMs + clipEditOf(s, b).lengthMs,
    )
    .map((b) => b.id)
    .sort();
}

/**
 * Leppesynk for en annen lydversjon enn den aktive er utdatert (DV2, punkt 4): synken markeres og brukes ikke
 * før den genereres på nytt. Endret lyd i samme versjon fanges i tillegg av lydhashen (CA5).
 */
export function lipsyncOutdated(
  s: ProjectState,
  r: { readonly clipId: string; readonly dialogueVersionId?: string | null },
): boolean {
  const clip = s.audioClips[r.clipId];
  if (!clip || clip.removed) return true;
  return Boolean(r.dialogueVersionId && clip.activeVersionId && r.dialogueVersionId !== clip.activeVersionId);
}
