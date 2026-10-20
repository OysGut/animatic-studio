/**
 * Sammenligning av versjoner av en scene (mandat 21.5, REQ-0318): alle tidligere produksjonsresultater for
 * scenen – 2D-animatic, klippet versjon, importert film, AI-video og stillbilde – som kan vises side ved side.
 * Hver versjon får et eget klipp som bare viser den versjonen fra bilde 0, så samme tegning som i monteringen
 * (drawFilmFrame) kan brukes. Bare lesing: aktiv versjon endres ikke.
 */
import { L, localized } from "../i18n";
import type { ProjectState, Take } from "../model";
import { msToFramesCeil, type Rational } from "../time";
import { takeLabel } from "./edit";
import {
  estimatedSceneFrames,
  filmClips,
  isFilmTake,
  type FilmClip,
  type ResolvedPart,
} from "./film";
import { t as tk, tLocalized } from "@/core/i18n/keyed";

export type VersionKind = "animatic" | "edit" | "imported_film" | "ai_video" | "still";

export const VERSION_KIND_LABEL: Record<VersionKind, string> = tLocalized({ animatic: "core-assembly-compare.version-kind-label.animatic.826b15651cab", edit: "core-assembly-compare.version-kind-label.edit.57bb21f6fb50", imported_film: "core-assembly-compare.version-kind-label.imported-film.8637e910e31e", ai_video: "core-assembly-compare.version-kind-label.ai-video.f5100fb8170a", still: "core-assembly-compare.version-kind-label.still.8c10f7bdce78" });

export interface ComparableVersion {
  /** Stabil nøkkel: «animatic», «edit» eller versjonens (take) id. */
  readonly key: string;
  readonly kind: VersionKind;
  readonly label: string;
  readonly takeId: string | null;
  readonly durationFrames: number;
  /** Når versjonen ble laget (ISO-tid), om det er kjent. */
  readonly createdAt: string | null;
  /** Vises i filmen nå. */
  readonly inUse: boolean;
  /** Klipp som bare viser versjonen, fra bilde 0 og uten overgang inn. */
  readonly clip: FilmClip;
}

/** Opprettelsestiden i en UUID v7 (de første 48 bit er millisekunder), ellers null. */
export function idCreatedAt(id: string): string | null {
  const m = /^([0-9a-f]{8})-([0-9a-f]{4})-7[0-9a-f]{3}-/.exec(id);
  if (!m) return null;
  const ms = parseInt(m[1]! + m[2]!, 16);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

/** Klippet med bare én del, fra bilde 0. */
function singleClip(base: FilmClip, part: ResolvedPart, take: Take | null): FilmClip {
  const { inheritedFrom: _i, ...rest } = base;
  return {
    ...rest,
    source: take ? "film" : part.source === "composition" ? "composition" : "placeholder",
    take,
    parts: [part],
    edited: false,
    startFrame: 0,
    durationFrames: part.durationFrames,
    durationKind: take ? "film" : base.durationKind,
    transition: { kind: "cut", frames: 0 },
    transitionInherited: false,
    overlapFrames: 0,
  };
}

/**
 * Versjonene av scenen som kan sammenlignes, for forekomsten i produksjonen: animaticen (2D-scenen eller
 * tittelkort), den klippede versjonen (når scenen er satt sammen av deler) og alle versjoner med mediefil for
 * scenen (importert film, AI-video, stillbilde), eldste først. `jobs` gir tid for AI-videoer.
 */
export function comparableVersions(
  s: ProjectState,
  productionId: string,
  occurrenceId: string,
  jobs: readonly { readonly resultPath: string | null; readonly createdAt: string }[] = [],
): ComparableVersion[] {
  const clip = filmClips(s, productionId).find((c) => c.occurrenceId === occurrenceId);
  if (!clip) return [];
  const fps = s.project.fps;
  const out: ComparableVersion[] = [];
  const usedTakes = new Set(clip.parts.flatMap((p) => (p.take ? [p.take.id as string] : [])));

  // Animaticen: 2D-scenens lengde, ellers planlagt eller beregnet lengde (som i monteringen)
  const comp = clip.compositionId ? s.compositions[clip.compositionId] : undefined;
  const occ = s.occurrences[occurrenceId];
  const animaticOnly = !clip.edited && clip.source !== "film";
  const animFrames = animaticOnly
    ? clip.durationFrames
    : comp && comp.durationFrames > 0
      ? comp.durationFrames
      : occ?.plannedMs !== undefined
        ? Math.max(1, msToFramesCeil(occ.plannedMs, fps))
        : (estimatedSceneFrames(s, productionId).get(occurrenceId) ?? 1);
  out.push({
    key: "animatic",
    kind: "animatic",
    label: comp
      ? tk("core-assembly-compare.label.label.2920e4e484a2")
      : tk("core-assembly-compare.label.label.3eeb41d9ec13"),
    takeId: null,
    durationFrames: animFrames,
    createdAt: comp ? idCreatedAt(comp.id) : null,
    inUse: animaticOnly,
    clip: singleClip(
      clip,
      {
        id: null,
        source: comp ? "composition" : "placeholder",
        take: null,
        startFrame: 0,
        durationFrames: animFrames,
        inMs: 0,
        outMs: Math.round((animFrames * 1000 * fps.den) / fps.num),
        inFrame: 0,
      },
      null,
    ),
  });

  if (clip.edited) {
    const times = clip.parts
      .map((p) => (p.id ? idCreatedAt(p.id) : null))
      .filter((x): x is string => x !== null)
      .sort();
    const { inheritedFrom: _i, ...rest } = clip;
    out.push({
      key: "edit",
      kind: "edit",
      label: L(
        `Klippet versjon (${clip.parts.length} ${clip.parts.length === 1 ? "del" : "deler"})`,
        `Edited version (${clip.parts.length} ${clip.parts.length === 1 ? "part" : "parts"})`,
      ),
      takeId: null,
      durationFrames: clip.durationFrames,
      createdAt: times.at(-1) ?? null,
      inUse: true,
      clip: {
        ...rest,
        startFrame: 0,
        transition: { kind: "cut", frames: 0 },
        transitionInherited: false,
        overlapFrames: 0,
      },
    });
  }

  const takes = Object.values(s.takes)
    .filter(
      (t) =>
        isFilmTake(t) &&
        (t.durationFrames ?? 0) > 0 &&
        s.occurrences[t.occurrenceId]?.sceneId === clip.sceneId,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const t of takes) {
    const frames = t.durationFrames!;
    const createdAt =
      (t.kind === "ai_video" ? jobs.find((j) => j.resultPath === t.mediaRef)?.createdAt : null) ??
      (t.kind === "still"
        ? Object.values(s.assetVersions).find((v) => v.mediaPath === t.mediaRef)?.createdAt
        : null) ??
      idCreatedAt(t.id);
    out.push({
      key: t.id,
      kind: t.kind as VersionKind,
      label: takeLabel(s, t),
      takeId: t.id,
      durationFrames: frames,
      createdAt,
      inUse: !clip.edited && usedTakes.has(t.id),
      clip: singleClip(
        clip,
        {
          id: null,
          source: "take",
          take: t,
          startFrame: 0,
          durationFrames: frames,
          inMs: 0,
          outMs: Math.min(
            Math.round((frames * 1000 * fps.den) / fps.num),
            t.media?.durationMs ?? Number.MAX_SAFE_INTEGER,
          ),
          inFrame: 0,
        },
        t,
      ),
    });
  }
  return out;
}

/**
 * Hvordan to versjoner følger hverandre: «time» = samme tid fra start (den korteste holder siste bilde),
 * «relative» = samme andel av lengden (begynnelse mot begynnelse, slutt mot slutt).
 */
export type CompareSync = "time" | "relative";

/** Felles tidslinje for to versjoner: like lang som den lengste. */
export function compareLength(a: { durationFrames: number }, b: { durationFrames: number }) {
  return Math.max(1, a.durationFrames, b.durationFrames);
}

/** Bildet i en versjon når den felles tidslinjen (lengde `total`) står på `frame`. */
export function versionFrameAt(
  durationFrames: number,
  frame: number,
  total: number,
  sync: CompareSync,
): number {
  const last = Math.max(0, durationFrames - 1);
  const f = Math.max(0, Math.min(Math.max(0, total - 1), frame));
  if (sync === "time") return Math.min(last, Math.round(f));
  if (total <= 1) return 0;
  return Math.min(last, Math.round((f / (total - 1)) * last));
}

/** Lengden i sekunder (for visning). */
export function versionSeconds(v: { durationFrames: number }, fps: Rational): number {
  return (v.durationFrames * fps.den) / fps.num;
}
