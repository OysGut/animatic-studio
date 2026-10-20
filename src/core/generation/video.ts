/**
 * AI-video for en scene (DEC-0069, REQ-0180, REQ-0243–0267): videoen lages per segment og legges til som en
 * ny versjon (take) av scenen – 2D-scenen erstattes aldri. Her: hvilke bilder som kan brukes som startbilde,
 * lengden et segment kan få hos en modell, og hvordan ferdige segmenter settes sammen til scenen.
 */
import type { AssetVersion, ProductionSegment, ProjectState, Take } from "../model";
import { lastFrameOfFilmPath, takeIdOfLastFrame } from "../library/storage-paths";
import type { FilmClip } from "../assembly/film";
import {
  DEFAULT_SEGMENT_SECONDS,
  buildScenePrompt,
  planSegments,
  segmentTimes,
  type SegmentPlan,
} from "./scene-prompt";
import { assetsInScene } from "../library";
import { compareKeys } from "../order-key";
import { framesToSeconds } from "../time";
import type { ClipPartFields } from "../commands/types";
import { compositionOfVariant } from "../composition/render";

import { t as tk } from "@/core/i18n/keyed";

/**
 * Bilder som kan være startbilde for videoen: bildene i scenens 2D-scene (bakgrunn først), så godkjente
 * bilder av det som er med i scenen. Ingen dubletter.
 */
export function videoStartImages(
  s: ProjectState,
  productionId: string,
  occurrenceId: string,
): AssetVersion[] {
  const occ = s.occurrences[occurrenceId];
  if (!occ) return [];
  const out: AssetVersion[] = [];
  const seen = new Set<string>();
  const add = (id: string | null | undefined) => {
    const v = id ? s.assetVersions[id] : undefined;
    if (!v || seen.has(v.id) || !v.mimeType.startsWith("image/")) return;
    seen.add(v.id);
    out.push(v);
  };
  const comp = Object.values(s.compositions).find(
    (c) => c.variantId === occ.variantId && !c.removed,
  );
  if (comp) {
    const layers = Object.values(s.layers)
      .filter((l) => l.compositionId === comp.id && !l.removed && l.versionId)
      .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
    for (const l of layers) add(l.versionId);
  }
  for (const x of assetsInScene(s, productionId, occurrenceId)) {
    const va = Object.values(s.assetVariants).find(
      (v) => v.assetId === x.asset.id && v.approvedVersionId && !v.archived,
    );
    add(va?.approvedVersionId);
  }
  return out.slice(0, 24);
}

/** Lengden modellen kan lage som er nærmest (og helst ikke kortere enn) segmentet. */
export function videoDurationFor(segmentSeconds: number, allowed: readonly number[]): number {
  const sorted = [...allowed].sort((a, b) => a - b);
  if (!sorted.length) return Math.max(1, Math.round(segmentSeconds));
  return sorted.find((d) => d >= segmentSeconds - 0.25) ?? sorted[sorted.length - 1]!;
}

/**
 * Delene som setter scenen sammen av ferdige AI-videoer, ett per segment i rekkefølge (hvert klippes til
 * segmentets lengde). Segmenter uten video gir null (scenen kan ikke settes sammen ennå).
 */
export function segmentVideoParts(
  s: ProjectState,
  occurrenceId: string,
  segments: readonly {
    readonly segmentId: string;
    readonly startMs: number;
    readonly endMs: number;
  }[],
  newPartId: () => string,
): ClipPartFields[] | null {
  const r = assembleSegments(s, occurrenceId, segments, newPartId, { fill: false });
  return r ? r.parts : null;
}

export interface AssembledScene {
  readonly parts: ClipPartFields[];
  /** Segmenter uten video som fikk 2D-animaticen i stedet. */
  readonly filledSegments: number;
  /** Segmenter der videoen var kortere enn segmentet og resten ble fylt med 2D-animaticen. */
  readonly paddedSegments: number;
}

/**
 * Scenen satt sammen av segmentene i rekkefølge (REQ-0264–0266, DEC-0070): hvert segment bruker sin valgte
 * (ellers nyeste) video, klippet til segmentets lengde. Med `fill` brukes 2D-animaticen for samme tidsrom
 * der et segment mangler video, og for resten av segmentet når videoen er kortere – så timingen følger
 * manuset (hybrid montering, REQ-0214). Uten 2D-scene kan ingenting fylles. Null når det ikke går.
 */
export function assembleSegments(
  s: ProjectState,
  occurrenceId: string,
  segments: readonly {
    readonly segmentId: string;
    readonly startMs: number;
    readonly endMs: number;
  }[],
  newPartId: () => string,
  opts: { readonly fill: boolean },
): AssembledScene | null {
  const occ = s.occurrences[occurrenceId];
  const comp = occ ? compositionOfVariant(s, occ.variantId) : undefined;
  const fps = s.project.fps.num / s.project.fps.den;
  const compMs =
    comp && comp.durationFrames > 0 ? Math.round((comp.durationFrames / fps) * 1000) : 0;
  const canFill = opts.fill && compMs > 0;
  const parts: ClipPartFields[] = [];
  let filledSegments = 0;
  let paddedSegments = 0;
  const animatic = (from: number, to: number) => {
    const a = Math.max(0, Math.min(compMs, Math.round(from)));
    const b = Math.max(0, Math.min(compMs, Math.round(to)));
    if (b - a < 40) return false;
    parts.push({
      partId: newPartId() as never,
      source: "composition",
      takeId: null,
      inMs: a,
      outMs: b,
    });
    return true;
  };
  for (const g of segments) {
    const take = latestVideoFor(s, occurrenceId, g.segmentId);
    const want = Math.max(1, Math.round(g.endMs - g.startMs));
    if (!take) {
      if (!canFill || !animatic(g.startMs, g.endMs)) return null;
      filledSegments++;
      continue;
    }
    const fileMs =
      take.media?.durationMs ?? framesToSeconds(take.durationFrames ?? 0, s.project.fps) * 1000;
    const used = Math.max(1, Math.min(Math.round(fileMs), want));
    parts.push({
      partId: newPartId() as never,
      source: "take",
      takeId: take.id,
      inMs: 0,
      outMs: used,
    });
    if (canFill && want - used >= 40 && animatic(g.startMs + used, g.endMs)) paddedSegments++;
  }
  return parts.length ? { parts, filledSegments, paddedSegments } : null;
}

/**
 * Bruker scenen de valgte videoene? Falsk når scenen er satt sammen av AI-videoer, men et segment siden har
 * fått et annet valgt forsøk (så brukeren kan sette sammen på nytt, REQ-0266).
 */
export function assemblyUsesChosen(
  s: ProjectState,
  occurrenceId: string,
  segmentIds: readonly string[],
): boolean {
  const used = new Set(
    Object.values(s.clipParts)
      .filter(
        (p) => p.occurrenceId === occurrenceId && !p.removed && p.source === "take" && p.takeId,
      )
      .map((p) => p.takeId as string),
  );
  const aiUsed = [...used].filter((id) => s.takes[id]?.kind === "ai_video");
  if (!aiUsed.length) return true;
  return segmentIds.every((g) => {
    const chosen = latestVideoFor(s, occurrenceId, g);
    return !chosen || used.has(chosen.id);
  });
}

/** Den nyeste godkjente (ellers nyeste) AI-videoen for et segment. */
export function latestVideoFor(
  s: ProjectState,
  occurrenceId: string,
  segmentId: string,
): Take | null {
  const list = Object.values(s.takes).filter(
    (t) =>
      t.kind === "ai_video" &&
      t.mediaRef &&
      t.occurrenceId === occurrenceId &&
      t.segmentId === segmentId,
  );
  if (!list.length) return null;
  const approved = list.filter((t) => t.status === "approved");
  const pick = (approved.length ? approved : list).sort((a, b) => b.id.localeCompare(a.id));
  return pick[0]!;
}

/**
 * Det som trengs for å lage video av en scene (DEC-0070, massegenerering): den lagrede inndelingen (eller
 * forslaget når den ikke er lagret), beskrivelsen per segment (brukerens egen eller den automatiske) og
 * hvor mange segmenter som allerede har video eller er i arbeid.
 */
export interface SceneVideoWork {
  readonly clip: FilmClip;
  /** Lagrede segmenter i rekkefølge (tom = inndelingen må lagres først). */
  readonly stored: readonly ProductionSegment[];
  readonly plan: readonly SegmentPlan[];
  readonly prompts: readonly string[];
  /** Segmenter (indekser) som allerede har en ferdig video. */
  readonly withVideo: readonly number[];
}

export function sceneVideoWork(
  s: ProjectState,
  productionId: string,
  clip: FilmClip,
  maxSeconds = DEFAULT_SEGMENT_SECONDS,
): SceneVideoWork {
  const stored = Object.values(s.segments)
    .filter((g) => g.occurrenceId === clip.occurrenceId && g.reason === "model_limit")
    .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
  const plan = stored.length ? segmentTimes(s, clip, stored) : planSegments(s, clip, maxSeconds);
  const own = new Map<string, string>();
  for (const p of Object.values(s.generationPrompts))
    if (p.occurrenceId === clip.occurrenceId && !p.removed && p.text) own.set(p.segmentId, p.text);
  const prompts = plan.map(
    (segment, index) =>
      (stored[index] ? own.get(stored[index]!.id) : undefined) ??
      buildScenePrompt(s, { clip, productionId, segment, index, count: plan.length }),
  );
  const withVideo = stored
    .map((g, i) => (latestVideoFor(s, clip.occurrenceId, g.id) ? i : -1))
    .filter((i) => i >= 0);
  return { clip, stored, plan, prompts, withVideo };
}

/** Stien til siste bilde i en AI-video (startbilde for neste segment, REQ-0263, DEC-0070). */
export function lastFramePath(resultOrMediaRef: string): string | null {
  // Eldre stier og stier med kategorimappe (KI-178): siste bilde ligger i samme mappe som videoen
  return lastFrameOfFilmPath(resultOrMediaRef);
}

/** Er stien et «siste bilde» i prosjektet? Gir take-ID-en, eller null. */
export function takeIdFromLastFrame(projectId: string, path: string): string | null {
  return takeIdOfLastFrame(projectId, path);
}

/**
 * Startbildet for et segment med sammenheng (REQ-0263): siste bilde i videoen til segmentet før, når det
 * finnes. Første segment (eller et segment uten video før seg) bruker det vanlige startbildet.
 */
export function chainStartPath(
  s: ProjectState,
  occurrenceId: string,
  segmentIds: readonly string[],
  index: number,
): string | null {
  if (index <= 0) return null;
  const prev = segmentIds[index - 1];
  const take = prev ? latestVideoFor(s, occurrenceId, prev) : null;
  return take?.mediaRef ? lastFramePath(take.mediaRef) : null;
}

/** Alle AI-videoer (forsøk) for et segment, nyeste først (REQ-0258, REQ-0285, DEC-0070). */
export function videoAttempts(
  s: ProjectState,
  occurrenceId: string,
  segmentId: string | null,
): Take[] {
  return Object.values(s.takes)
    .filter(
      (t) =>
        t.kind === "ai_video" &&
        !!t.mediaRef &&
        t.occurrenceId === occurrenceId &&
        (segmentId === null || t.segmentId === segmentId),
    )
    .sort((a, b) => b.id.localeCompare(a.id));
}

/**
 * Kommandoene som gjør `takeId` til det valgte forsøket for segmentet (godkjent), og tar godkjenningen fra
 * de andre forsøkene i samme segment. Ingen videoer slettes (mandat 19.7).
 */
export function chooseAttemptCommands(
  s: ProjectState,
  takeId: string,
): { type: "SetTakeStatus"; takeId: Take["id"]; status: "approved" | "in_progress" }[] {
  const t = s.takes[takeId];
  if (!t) return [];
  const others = videoAttempts(s, t.occurrenceId, t.segmentId).filter(
    (x) => x.id !== t.id && x.status === "approved",
  );
  return [
    ...others.map((x) => ({
      type: "SetTakeStatus" as const,
      takeId: x.id,
      status: "in_progress" as const,
    })),
    ...(t.status === "approved"
      ? []
      : [{ type: "SetTakeStatus" as const, takeId: t.id, status: "approved" as const }]),
  ];
}

/** Manusendringer som ikke synes i bildet (REQ-0308: kan løses uten ny generering). */
const NON_VISUAL: ReadonlySet<string> = new Set(["note", "transition"]);

export interface AiUpdatePlan {
  /** Segmentene (indekser i den lagrede inndelingen) som bør lages på nytt. */
  readonly segments: readonly number[];
  /** Endringen synes ikke i bildet: godkjenn i stedet for å betale for nye videoer. */
  readonly localOnly: boolean;
  /** Forklaring på norsk. */
  readonly reason: string;
}

/**
 * Valg B ved avvik for AI-video (mandat 21.3–21.5, REQ-0308–0310, DEC-0070): hvilke segmenter manusendringene
 * berører (bare de som har en video som er laget fra det gamle manuset), og om endringen i det hele tatt
 * trenger ny generering. Nye videoer blir nye forsøk ved siden av de gamle (REQ-0310); ingenting lages før
 * brukeren har sett prisen og bekreftet (REQ-0309).
 */
export function aiUpdatePlan(
  s: ProjectState,
  productionId: string,
  clip: FilmClip,
  changes: readonly {
    readonly blockId: string;
    readonly blockKind: string;
    readonly kind: string;
  }[],
  affectedTakeIds: readonly string[],
): AiUpdatePlan {
  const work = sceneVideoWork(s, productionId, clip);
  if (!work.stored.length)
    return {
      segments: [],
      localOnly: false,
      reason: tk("core-generation-video.reason.reason.c9acc1dbaf0c"),
    };
  const visual = changes.filter((c) => !NON_VISUAL.has(c.blockKind));
  if (!visual.length)
    return {
      segments: [],
      localOnly: true,
      reason: tk("core-generation-video.reason.reason.824128b69e54"),
    };
  const affected = new Set(affectedTakeIds);
  const located = new Set<number>();
  let unknown = false;
  for (const c of visual) {
    const i = work.plan.findIndex((p) => p.blockIds.includes(c.blockId as never));
    if (i >= 0) located.add(i);
    else unknown = true; // fjernet linje: tiden er ukjent
  }
  const candidates = unknown ? work.plan.map((_, i) => i) : [...located];
  const segments = candidates
    .filter((i) => {
      const t = work.stored[i] ? latestVideoFor(s, clip.occurrenceId, work.stored[i]!.id) : null;
      return !!t && (affected.size === 0 || affected.has(t.id));
    })
    .sort((a, b) => a - b);
  return {
    segments,
    localOnly: false,
    reason: segments.length
      ? (unknown ? tk("core-generation-video.changes-affect-unknown", { count: segments.length, segments: segments.map((i) => i + 1).join(", ") }) : tk("core-generation-video.changes-affect", { count: segments.length, segments: segments.map((i) => i + 1).join(", ") }))
      : tk("core-generation-video.reason.reason.bd3238cdd55a"),
  };
}
