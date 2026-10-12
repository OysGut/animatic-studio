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

// ---------- Språk (DEC-0059) ----------

/** Hovedspråket (norsk er prosjektets hovedmanus, mandat 23.1). */
export const MAIN_LANGUAGE = "nb";

/** Språkene filmen kan vises, spilles og eksporteres på. */
export const FILM_LANGUAGES: readonly string[] = ["nb", "en"];

/** Lydtyper med tale: hører til hovedspråket når ikke annet er valgt. */
export function isVoiceKind(kind: AudioKind): boolean {
  return kind === "dialogue" || kind === "narration";
}

/** Språket lyden hører til: språkkode, eller «*» for felles i alle språk. */
export function clipLanguage(a: Pick<AudioClip, "kind" | "language">): string {
  return a.language ?? (isVoiceKind(a.kind) ? MAIN_LANGUAGE : "*");
}

/** Lyden spilles i språkversjonen. */
export function playsIn(a: Pick<AudioClip, "kind" | "language">, lang: string): boolean {
  const l = clipLanguage(a);
  return l === "*" || l === lang;
}

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

/** Lyden i én scene (ikke fjernet), etter start. Med språk: bare lyden som spilles i det språket. */
export function sceneAudio(s: ProjectState, occurrenceId: string, lang?: string): AudioClip[] {
  return Object.values(s.audioClips)
    .filter(
      (a) =>
        a.occurrenceId === occurrenceId && !a.removed && (lang === undefined || playsIn(a, lang)),
    )
    .sort((a, b) => a.offsetMs - b.offsetMs || a.id.localeCompare(b.id));
}

const endCache = new WeakMap<object, Map<string, number>>();

/**
 * Slutten på den siste lyden i hver scene (ms fra scenens begynnelse). Bare lyden i hovedspråket teller, så
 * scenene er like lange i alle språkversjoner (DEC-0059, REQ-0344).
 */
export function sceneAudioEndMs(s: ProjectState): Map<string, number> {
  let m = endCache.get(s.audioClips);
  if (!m) {
    m = new Map();
    for (const a of Object.values(s.audioClips)) {
      // Lyd som løper videre gjør ikke scenen lengre (DEC-0045)
      if (a.removed || a.continues || !playsIn(a, MAIN_LANGUAGE)) continue;
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
  /** Volumpunkter: tid fra klippets start (s) og nivå (dB). */
  readonly keys: readonly { readonly t: number; readonly db: number }[];
  /** Klippets fulle lengde (s), også den delen som er kuttet ved scenens slutt. */
  readonly fullLength: number;
  /**
   * Lyden i en importert film (DEC-0047), ikke et lydklipp: språket til dialogen som er blandet inn
   * (DEC-0059), «none» for bare musikk og effekter.
   */
  readonly film?: { readonly audioLanguage: string };
}

function item(
  clip: AudioClip,
  version: AssetVersion | null,
  start: number,
  maxLength = Infinity,
): FilmAudioItem {
  return {
    clip,
    version,
    start,
    length: Math.min(clip.lengthMs / 1000, maxLength),
    fullLength: clip.lengthMs / 1000,
    keys: clip.volumeKeys.map((k) => ({ t: k.t / 1000, db: k.db })),
    sourceIn: clip.sourceInMs / 1000,
    gain: Math.pow(10, clip.gainDb / 20),
    fadeIn: clip.fadeInMs / 1000,
    fadeOut: clip.fadeOutMs / 1000,
  };
}

/**
 * All lyd i filmen i et språk (DEC-0059; standard hovedspråket), plassert etter scenenes nåværende plass.
 * Lyd i deaktiverte scener er ikke med.
 */
export function filmAudio(
  s: ProjectState,
  clips: readonly FilmClip[],
  fps: Rational,
  lang: string = MAIN_LANGUAGE,
): FilmAudioItem[] {
  const sceneOf = new Map(clips.map((c) => [c.occurrenceId, c]));
  const out: FilmAudioItem[] = [];
  for (const a of Object.values(s.audioClips)) {
    if (a.removed || !playsIn(a, lang)) continue;
    const scene = sceneOf.get(a.occurrenceId);
    if (!scene) continue;
    const sceneStart = framesToSeconds(scene.startFrame, fps);
    // Uten «løper videre» stopper lyden ved slutten av scenen sin (DEC-0045)
    const room = a.continues
      ? Infinity
      : framesToSeconds(scene.durationFrames, fps) - a.offsetMs / 1000;
    if (room <= 0) continue;
    out.push(item(a, audioVersion(s, a), sceneStart + a.offsetMs / 1000, room));
  }
  return out.sort((x, y) => x.start - y.start || x.clip.id.localeCompare(y.clip.id));
}

/**
 * Lyden i én scene, med start fra scenens begynnelse (sceneeditoren). `sceneSeconds`: scenens lengde; lyd
 * som ikke løper videre, kuttes der. Lyd som løper videre fra tidligere scener er ikke med.
 */
export function sceneAudioItems(
  s: ProjectState,
  occurrenceId: string,
  sceneSeconds = Infinity,
  lang: string = MAIN_LANGUAGE,
): FilmAudioItem[] {
  return sceneAudio(s, occurrenceId, lang)
    .map((a) => item(a, audioVersion(s, a), a.offsetMs / 1000, sceneSeconds - a.offsetMs / 1000))
    .filter((it) => it.length > 0);
}

/**
 * Lyden som høres i én scene i filmen, med tider fra scenens begynnelse (sceneeditoren, DEC-0045): scenens
 * egen lyd og lyd som løper videre inn fra tidligere scener (den får negativ start).
 */
export function sceneWindowAudio(
  s: ProjectState,
  clips: readonly FilmClip[],
  occurrenceId: string,
  fps: Rational,
  lang: string = MAIN_LANGUAGE,
): FilmAudioItem[] {
  const c = clips.find((x) => x.occurrenceId === occurrenceId);
  if (!c) return [];
  const start = framesToSeconds(c.startFrame, fps);
  const end = start + framesToSeconds(c.durationFrames, fps);
  return filmAudio(s, clips, fps, lang)
    .filter((it) => it.start < end && it.start + it.length > start)
    .map((it) => ({ ...it, start: it.start - start }));
}

/** Volumnivået (dB) i et klipp på tid `t` fra klippets start (s): mellom punktene rett linje. */
export function volumeKeyDbAt(keys: readonly { t: number; db: number }[], t: number): number {
  if (keys.length === 0) return 0;
  if (t <= keys[0]!.t) return keys[0]!.db;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!;
    if (t <= b.t) {
      const a = keys[i - 1]!;
      return a.db + ((b.db - a.db) * (t - a.t)) / Math.max(1e-9, b.t - a.t);
    }
  }
  return keys[keys.length - 1]!.db;
}

/**
 * Lyd brukt i scenene rundt (DEC-0045): lydklipp i scenen `step` plasser før (negativ) eller etter
 * (positiv) i filmens rekkefølge. Brukes for å føre atmosfære og musikk videre.
 */
export function neighbourSceneAudio(
  s: ProjectState,
  clips: readonly FilmClip[],
  occurrenceId: string,
  step: number,
): { readonly clip: FilmClip | null; readonly audio: AudioClip[] } {
  const i = clips.findIndex((c) => c.occurrenceId === occurrenceId);
  const c = i < 0 ? undefined : clips[i + step];
  return { clip: c ?? null, audio: c ? sceneAudio(s, c.occurrenceId) : [] };
}

/** Største filmfil som lyden spilles fra (hele filen hentes og dekodes i nettleseren). */
export const FILM_AUDIO_MAX_BYTES = 400 * 1024 * 1024;

/**
 * Lyden i importert film som er tatt i bruk (DEC-0047): spilles og eksporteres sammen med lydklippene, på
 * filmens plass og bare så lenge klippet varer. Den følger sporet «Dialog» når spor dempes. Klippet her er
 * ikke en lagret rad, bare en beskrivelse for mikseren (id = versjonens id).
 */
export function filmTakeAudio(clips: readonly FilmClip[], fps: Rational): FilmAudioItem[] {
  const out: FilmAudioItem[] = [];
  for (const c of clips)
    for (const part of c.parts) {
      const t = part.take;
      if (part.source !== "take" || !t || !t.mediaRef || t.media?.hasAudio === false) continue;
      // Stillbilder (DEC-0072) har ingen lyd
      if (t.kind !== "imported_film" && t.kind !== "ai_video") continue;
      // Lyden dekodes ved å hente hele filen; store filer hoppes over (KI)
      if ((t.media?.byteSize ?? 0) > FILM_AUDIO_MAX_BYTES) continue;
      const length = framesToSeconds(part.durationFrames, fps);
      const clip = {
        id: part.id ?? t.id,
        revision: t.revision,
        occurrenceId: c.occurrenceId,
        kind: "dialogue",
        name: t.media?.fileName ?? "Filmlyd",
        assetId: t.id,
        assetVariantId: null,
        versionId: null,
        blockId: null,
        offsetMs: 0,
        sourceInMs: 0,
        lengthMs: Math.round(length * 1000),
        gainDb: 0,
        fadeInMs: 0,
        fadeOutMs: 0,
        muted: false,
        continues: false,
        volumeKeys: [],
        removed: false,
      } as unknown as AudioClip;
      const version = { mediaPath: t.mediaRef } as unknown as AssetVersion;
      out.push({
        clip,
        version,
        start: framesToSeconds(c.startFrame + part.startFrame, fps),
        length,
        fullLength: length,
        sourceIn: part.inMs / 1000,
        gain: 1,
        fadeIn: 0,
        fadeOut: 0,
        keys: [],
        film: { audioLanguage: t.audioLanguage ?? "nb" },
      });
    }
  return out;
}
