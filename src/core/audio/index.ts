/**
 * Lyd i filmen (M4 del 2, mandat kap. 13, DEC-0044): lydtyper, hvilken lydfil et klipp spiller, og når
 * lyden ligger i filmen. Lyden er festet til en scene, så tidene i filmen beregnes alltid på nytt fra
 * scenens plass (mandat 6.4) og lagres aldri.
 */
import type { AssetVersion, AudioClip, AudioKind, ProjectState } from "../model";
import type { FilmClip } from "../assembly/film";
import { coverVersion, versionsOf } from "../library";
import { framesToSeconds, type Rational } from "../time";

export const AUDIO_KIND_LABEL: Record<AudioKind, string> = {
  dialogue: "Dialog",
  narration: "Forteller",
  sfx: "Effekter",
  ambience: "Atmosfære",
  music: "Musikk",
};

/** Sporenes rekkefølge i tidslinjen. */
export const AUDIO_TRACK_ORDER: readonly AudioKind[] = [
  "dialogue",
  "narration",
  "sfx",
  "ambience",
  "music",
];

/** Lydfilen klippet spiller: låst versjon, ellers variantens godkjente/nyeste, ellers ressursens nyeste. */
export function audioVersion(s: ProjectState, a: AudioClip): AssetVersion | null {
  if (a.versionId !== null) return s.assetVersions[a.versionId] ?? null;
  if (a.assetVariantId !== null) {
    const va = s.assetVariants[a.assetVariantId];
    if (va?.approvedVersionId) return s.assetVersions[va.approvedVersionId] ?? null;
    return versionsOf(s, a.assetVariantId)[0] ?? null;
  }
  return coverVersion(s, a.assetId);
}

/** Lyden i én scene (ikke fjernet), etter start. */
export function sceneAudio(s: ProjectState, occurrenceId: string): AudioClip[] {
  return Object.values(s.audioClips)
    .filter((a) => a.occurrenceId === occurrenceId && !a.removed)
    .sort((a, b) => a.offsetMs - b.offsetMs || a.id.localeCompare(b.id));
}

const endCache = new WeakMap<object, Map<string, number>>();

/** Slutten på den siste lyden i hver scene (ms fra scenens begynnelse). */
export function sceneAudioEndMs(s: ProjectState): Map<string, number> {
  let m = endCache.get(s.audioClips);
  if (!m) {
    m = new Map();
    for (const a of Object.values(s.audioClips)) {
      if (a.removed) continue;
      const end = a.offsetMs + a.lengthMs;
      if (end > (m.get(a.occurrenceId) ?? 0)) m.set(a.occurrenceId, end);
    }
    endCache.set(s.audioClips, m);
  }
  return m;
}

/** Et lydklipp plassert i filmen (sekunder i den samlede filmen). */
export interface FilmAudioItem {
  readonly clip: AudioClip;
  readonly version: AssetVersion | null;
  /** Start i filmen (s). */
  readonly start: number;
  /** Lengde (s). */
  readonly length: number;
  /** Start i lydfilen (s). */
  readonly sourceIn: number;
  readonly gain: number;
  readonly fadeIn: number;
  readonly fadeOut: number;
}

function item(clip: AudioClip, version: AssetVersion | null, start: number): FilmAudioItem {
  return {
    clip,
    version,
    start,
    length: clip.lengthMs / 1000,
    sourceIn: clip.sourceInMs / 1000,
    gain: Math.pow(10, clip.gainDb / 20),
    fadeIn: clip.fadeInMs / 1000,
    fadeOut: clip.fadeOutMs / 1000,
  };
}

/** All lyd i filmen, plassert etter scenenes nåværende plass. Lyd i deaktiverte scener er ikke med. */
export function filmAudio(
  s: ProjectState,
  clips: readonly FilmClip[],
  fps: Rational,
): FilmAudioItem[] {
  const startOf = new Map(clips.map((c) => [c.occurrenceId, framesToSeconds(c.startFrame, fps)]));
  const out: FilmAudioItem[] = [];
  for (const a of Object.values(s.audioClips)) {
    if (a.removed) continue;
    const sceneStart = startOf.get(a.occurrenceId);
    if (sceneStart === undefined) continue;
    out.push(item(a, audioVersion(s, a), sceneStart + a.offsetMs / 1000));
  }
  return out.sort((x, y) => x.start - y.start || x.clip.id.localeCompare(y.clip.id));
}

/** Lyden i én scene, med start fra scenens begynnelse (sceneeditoren). */
export function sceneAudioItems(s: ProjectState, occurrenceId: string): FilmAudioItem[] {
  return sceneAudio(s, occurrenceId).map((a) => item(a, audioVersion(s, a), a.offsetMs / 1000));
}
