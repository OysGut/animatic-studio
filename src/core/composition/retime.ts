/**
 * Endring av scenevarighet (SV1, B-041): fem metoder som brukeren velger hver gang hele scenen endrer lengde.
 * `planRetime` er ren og plattformnøytral: den lager én samlet kommando (`RetimeScene`, én angring og én
 * transaksjon) og en rapport i klartekst, eller `ok: false` med forklaring. Ingenting lagres her.
 *
 * Metodene:
 * 1. start – tid legges til eller fjernes i starten; alt innhold forskyves.
 * 2. end – tid legges til eller fjernes i slutten; ingenting forskyves.
 * 3. pauses – tiden fordeles proporsjonalt på de fleksible mellomrommene mellom ankrene (tale, effekter,
 *    filmdeler, låste tidsrom). Lydklippenes innhold endres aldri.
 * 4. stretch_all – all visuell tid skaleres (låste tidsrom står fast); lydklippenes start følger med, og
 *    ordmellomrommene i dialogopptak med ordkobling strekkes eller klemmes (DEC-0096). Ordene endres ikke.
 * 5. stretch_visual – som 4, men lydklippene står helt urørt.
 */
import type {
  AudioClip,
  CameraShot,
  Composition,
  Keyframe,
  ImageSwap,
  ProjectState,
  SceneOccurrence,
} from "../model";
import type { Command, LayerFields } from "../commands/types";
import { L } from "../i18n";
import { newId as defaultNewId } from "../ids";
import { compositionDuration } from "./animate";
import { layerFieldsOf } from "./index";
import { layersOf } from "./render";
import {
  distributeLargestRemainder,
  timingOf,
  type CompositionTiming,
  type LockedRange,
  type PaddingFill,
} from "./timing";
import { audioClipFieldsOf } from "../commands/apply";
import { audioVersion } from "../audio";
import {
  compositionFromTake,
  compositionLengthMs,
  type AudioComposition,
} from "../audio/composition";
import { spreadPause, type AlignmentSource } from "../audio/pauses";

export type RetimeMethod = "start" | "end" | "pauses" | "stretch_all" | "stretch_visual";

export const RETIME_METHODS: readonly RetimeMethod[] = [
  "start",
  "end",
  "pauses",
  "stretch_all",
  "stretch_visual",
];

export interface RetimeOptions {
  readonly targetFrames: number;
  readonly method: RetimeMethod;
  /** Hva ny tid viser (påkrevd for start/slutt ved forlengelse). */
  readonly fill?: PaddingFill;
  /** Atmosfære og musikk som spiller, fortsetter i ny tid (start/slutt). */
  readonly keepAmbience: boolean;
  /** Nye dialogopptak med endrede ordmellomrom (metode 4), lagret før kommandoen kjøres. */
  readonly remixed?: Readonly<
    Record<string, { readonly versionId: string; readonly lengthMs: number }>
  >;
  readonly newId?: () => string;
  /**
   * CA8 (rytmeverktøyet): eksplisitt endring i bilder for hvert fleksible mellomrom (metode «pauses»), i samme
   * rekkefølge som `report.gapsBefore`. Målet må være varigheten før pluss summen av endringene.
   */
  readonly gapChanges?: readonly number[];
}

export type RetimeItemKind =
  | "keyframe"
  | "imageSwap"
  | "path"
  | "activeRange"
  | "cameraShot"
  | "audioClip"
  | "timeLink"
  | "lockedRange"
  | "transition"
  | "clipPart"
  | "segment"
  | "padding";

export interface RetimeItem {
  readonly kind: RetimeItemKind;
  readonly id: string;
  /** Lag eller klipp elementet hører til, når det ikke har egen id (nøkkelbilder, bildeskifter). */
  readonly ownerId?: string;
  readonly detail?: string;
}

export interface RetimeGap {
  readonly startFrame: number;
  readonly endFrame: number;
}

/** Et dialogopptak som må lagres med nye ordmellomrom før kommandoen (metode 4). */
export interface RemixPlan {
  readonly clipId: string;
  readonly assetId: string;
  readonly variantId: string;
  readonly baseVersionId: string;
  readonly composition: AudioComposition;
  readonly deltaMs: number;
}

export interface RetimeReport {
  readonly beforeFrames: number;
  readonly afterFrames: number;
  readonly method: RetimeMethod;
  readonly moved: readonly RetimeItem[];
  readonly trimmed: readonly RetimeItem[];
  readonly scaled: readonly RetimeItem[];
  readonly gapsBefore: readonly RetimeGap[];
  readonly gapsAfter: readonly RetimeGap[];
  readonly lockedConflicts: readonly RetimeItem[];
  readonly audioNotFitting: readonly RetimeItem[];
  /** Punkter som havnet på samme bilde og ble skjøvet ett bilde (ingen slettes). */
  readonly collisions: readonly RetimeItem[];
  /** Det som ikke endres automatisk og bør kontrolleres (delene i monteringen, segmenter). */
  readonly manual: readonly RetimeItem[];
  readonly remix: readonly RemixPlan[];
}

export type RetimePlan =
  | { readonly ok: true; readonly command: Command; readonly report: RetimeReport }
  | { readonly ok: false; readonly reason: string; readonly report: RetimeReport };

const SPEECH = new Set(["dialogue", "narration", "sfx"]);
const AMBIENT = new Set(["music", "ambience"]);

/** Et stykke av tidsavbildningen: gammelt [a0, a1] → nytt [b0, b1] (bilder). */
interface Piece {
  readonly a0: number;
  readonly a1: number;
  readonly b0: number;
  readonly b1: number;
}

function mapper(pieces: readonly Piece[]) {
  const first = pieces[0]!;
  const last = pieces[pieces.length - 1]!;
  return (f: number): number => {
    if (f <= first.a0) return f + (first.b0 - first.a0);
    if (f >= last.a1) return f + (last.b1 - last.a1);
    for (const p of pieces)
      if (f >= p.a0 && f <= p.a1)
        return p.a1 === p.a0 ? p.b0 : p.b0 + ((f - p.a0) * (p.b1 - p.b0)) / (p.a1 - p.a0);
    return f;
  };
}

/** Sammenhengende tidsrom som ikke overlapper (sortert og slått sammen). */
function merge(list: readonly RetimeGap[]): RetimeGap[] {
  const s = [...list]
    .filter((r) => r.endFrame > r.startFrame)
    .sort((a, b) => a.startFrame - b.startFrame);
  const out: RetimeGap[] = [];
  for (const r of s) {
    const top = out[out.length - 1];
    if (top && r.startFrame <= top.endFrame)
      out[out.length - 1] = {
        startFrame: top.startFrame,
        endFrame: Math.max(top.endFrame, r.endFrame),
      };
    else out.push({ ...r });
  }
  return out;
}

/** Stykker der de faste tidsrommene beholder lengden, og resten fordeles (største rest, eksakt sum). */
function piecesAround(
  fixed: readonly RetimeGap[],
  before: number,
  target: number,
  explicit?: readonly number[],
): { pieces: Piece[]; gaps: RetimeGap[]; newGaps: RetimeGap[] } | null {
  const anchors = merge(
    fixed.map((r) => ({
      startFrame: Math.max(0, r.startFrame),
      endFrame: Math.min(before, r.endFrame),
    })),
  );
  const parts: { a0: number; a1: number; flex: boolean }[] = [];
  let at = 0;
  for (const r of anchors) {
    if (r.startFrame > at) parts.push({ a0: at, a1: r.startFrame, flex: true });
    parts.push({ a0: r.startFrame, a1: r.endFrame, flex: false });
    at = r.endFrame;
  }
  if (at < before) parts.push({ a0: at, a1: before, flex: true });
  const flex = parts.filter((p) => p.flex);
  const flexTotal = flex.reduce((a, p) => a + (p.a1 - p.a0), 0);
  const delta = target - before;
  if (flexTotal <= 0 || -delta > flexTotal) return null;
  if (
    explicit &&
    (explicit.length !== flex.length ||
      explicit.some((x, i) => !Number.isInteger(x) || flex[i]!.a1 - flex[i]!.a0 + x < 0) ||
      explicit.reduce((a, x) => a + x, 0) !== delta)
  )
    return null;
  const change = explicit
    ? [...explicit]
    : distributeLargestRemainder(
        delta,
        flex.map((p) => p.a1 - p.a0),
      );
  const pieces: Piece[] = [];
  const newGaps: RetimeGap[] = [];
  let b = 0;
  let k = 0;
  for (const p of parts) {
    const len = p.a1 - p.a0 + (p.flex ? change[k++]! : 0);
    pieces.push({ a0: p.a0, a1: p.a1, b0: b, b1: b + len });
    if (p.flex) newGaps.push({ startFrame: b, endFrame: b + len });
    b += len;
  }
  if (pieces.length === 0) pieces.push({ a0: 0, a1: before, b0: 0, b1: target });
  return {
    pieces,
    gaps: flex.map((p) => ({ startFrame: p.a0, endFrame: p.a1 })),
    newGaps,
  };
}

/** Den aktive 2D-scenen for forekomsten. */
export function compositionForOccurrence(
  s: ProjectState,
  occ: SceneOccurrence,
): Composition | undefined {
  return Object.values(s.compositions).find((c) => c.variantId === occ.variantId && !c.removed);
}

function emptyReport(before: number, target: number, method: RetimeMethod): RetimeReport {
  return {
    beforeFrames: before,
    afterFrames: target,
    method,
    moved: [],
    trimmed: [],
    scaled: [],
    gapsBefore: [],
    gapsAfter: [],
    lockedConflicts: [],
    audioNotFitting: [],
    collisions: [],
    manual: [],
    remix: [],
  };
}

/** Lager én samlet kommando for ny scenevarighet, eller forklarer hvorfor det ikke går. */
export function planRetime(s: ProjectState, occurrenceId: string, opts: RetimeOptions): RetimePlan {
  const newId = opts.newId ?? (() => defaultNewId());
  const occ = s.occurrences[occurrenceId];
  const comp = occ ? compositionForOccurrence(s, occ) : undefined;
  const method = opts.method;
  const target = Math.max(1, Math.round(opts.targetFrames));
  if (!occ || !comp)
    return {
      ok: false,
      reason: L("Scenen har ingen 2D-scene.", "The scene has no 2D scene."),
      report: emptyReport(0, target, method),
    };
  const before = compositionDuration(s, comp);
  const fps = s.project.fps;
  const msPerFrame = (1000 * fps.den) / fps.num;
  const toMs = (f: number) => Math.round(f * msPerFrame);
  const beforeMs = toMs(before);
  const targetMs = toMs(target);
  const d = target - before;
  const timing = timingOf(comp);

  const moved: RetimeItem[] = [];
  const trimmed: RetimeItem[] = [];
  const scaled: RetimeItem[] = [];
  const lockedConflicts: RetimeItem[] = [];
  const audioNotFitting: RetimeItem[] = [];
  const collisions: RetimeItem[] = [];
  const manual: RetimeItem[] = [];
  const remix: RemixPlan[] = [];
  let gapsBefore: RetimeGap[] = [];
  let gapsAfter: RetimeGap[] = [];
  const report = (): RetimeReport => ({
    beforeFrames: before,
    afterFrames: target,
    method,
    moved,
    trimmed,
    scaled,
    gapsBefore,
    gapsAfter,
    lockedConflicts,
    audioNotFitting,
    collisions,
    manual,
    remix,
  });
  const fail = (reason: string): RetimePlan => ({ ok: false, reason, report: report() });

  if (d === 0 && !(method === "pauses" && opts.gapChanges?.some((x) => x !== 0)))
    return fail(L("Varigheten er uendret.", "The duration is unchanged."));
  const extending = d > 0;
  if ((method === "start" || method === "end") && extending && !opts.fill)
    return fail(
      L(
        "Velg hva den nye tiden skal vise: frys, bakgrunn eller svart.",
        "Choose what the new time shows: freeze, background or black.",
      ),
    );

  const clips = Object.values(s.audioClips).filter((a) => a.occurrenceId === occ.id && !a.removed);
  const parts = Object.values(s.clipParts)
    .filter((p) => p.occurrenceId === occ.id && !p.removed)
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0));
  const links = Object.values(s.timeLinks).filter((t) => t.occurrenceId === occ.id && !t.removed);
  const frameOfMs = (ms: number) => ms / msPerFrame;

  // ---------- Tidsavbildningen ----------
  let pieces: Piece[];
  if (method === "start") pieces = [{ a0: 0, a1: before, b0: d, b1: before + d }];
  else if (method === "end") pieces = [{ a0: 0, a1: before, b0: 0, b1: before }];
  else {
    const fixed: RetimeGap[] = timing.lockedRanges.map((r) => ({
      startFrame: r.startFrame,
      endFrame: r.endFrame,
    }));
    if (method === "pauses") {
      for (const a of clips)
        if (SPEECH.has(a.kind))
          fixed.push({
            startFrame: Math.floor(frameOfMs(a.offsetMs)),
            endFrame: Math.ceil(frameOfMs(a.offsetMs + a.lengthMs)),
          });
      let pos = 0;
      for (const p of parts) {
        const len = Math.max(0, p.outMs - p.inMs);
        if (p.source === "take")
          fixed.push({
            startFrame: Math.floor(frameOfMs(pos)),
            endFrame: Math.ceil(frameOfMs(pos + len)),
          });
        pos += len;
      }
    }
    const r = piecesAround(fixed, before, target, method === "pauses" ? opts.gapChanges : undefined);
    if (!r) {
      const anchored = merge(
        fixed.map((x) => ({
          startFrame: Math.max(0, x.startFrame),
          endFrame: Math.min(before, x.endFrame),
        })),
      ).reduce((a, x) => a + x.endFrame - x.startFrame, 0);
      const free = Math.max(0, before - anchored);
      const secs = (f: number) => (Math.round((f / (fps.num / fps.den)) * 10) / 10).toString();
      return fail(
        method === "pauses"
          ? L(
              `Scenen har bare ${secs(free)} s fleksibel tid mellom tale, effekter og låste tidsrom; du ba om ${secs(d)} s. Velg en annen metode eller avbryt.`,
              `The scene has only ${secs(free)} s of flexible time between speech, effects and locked ranges; you asked for ${secs(d)} s. Choose another method or cancel.`,
            )
          : L(
              `Låste tidsrom tar ${secs(anchored)} s, så scenen kan ikke bli ${secs(target)} s. Velg en annen metode eller avbryt.`,
              `Locked ranges take ${secs(anchored)} s, so the scene cannot be ${secs(target)} s. Choose another method or cancel.`,
            ),
      );
    }
    pieces = r.pieces;
    if (method === "pauses") {
      gapsBefore = r.gaps;
      gapsAfter = r.newGaps;
    }
  }
  const mapF = mapper(pieces);
  const mapFrame = (f: number) => Math.round(mapF(f));
  const mapMs = (ms: number) => Math.round(mapF(ms / msPerFrame) * msPerFrame);
  const scaling = method === "stretch_all" || method === "stretch_visual" || method === "pauses";

  // Område som forsvinner ved forkorting i start eller slutt
  const cutRange: RetimeGap | null =
    !extending && method === "start"
      ? { startFrame: 0, endFrame: -d }
      : !extending && method === "end"
        ? { startFrame: target, endFrame: before }
        : null;
  // Fyll som ble lagt til tidligere, forsvinner først ved forkorting
  const pad = timing.padding;
  if (cutRange) {
    for (const r of timing.lockedRanges)
      if (r.startFrame < cutRange.endFrame && r.endFrame > cutRange.startFrame)
        lockedConflicts.push({ kind: "lockedRange", id: r.id, detail: r.label });
    if (lockedConflicts.length)
      return fail(
        L(
          "Tiden som fjernes, overlapper et låst tidsrom. Velg en annen metode, fjern låsen eller avbryt.",
          "The time being removed overlaps a locked range. Choose another method, remove the lock or cancel.",
        ),
      );
  }

  /** Bildet etter endringen, eller null når det havner utenfor scenen og trimmes. */
  const placeFrame = (f: number): number | null => {
    const m = mapFrame(f);
    if (m < 0) return null;
    if (cutRange && method === "end" && f < before && m >= target) return null;
    return m;
  };
  const note = (list: RetimeItem[], item: RetimeItem) => list.push(item);

  // ---------- Lagene ----------
  const layerSteps: { layerId: string; fields: LayerFields }[] = [];
  for (const l of layersOf(s, comp.id)) {
    const f = layerFieldsOf(l);
    let changed = false;
    const keyframes: Keyframe[] = [];
    const byProp = new Map<string, Set<number>>();
    for (const k of [...f.keyframes].sort((a, b) => a.frame - b.frame)) {
      const m = placeFrame(k.frame);
      if (m === null) {
        note(trimmed, { kind: "keyframe", id: `${k.property}@${k.frame}`, ownerId: l.id });
        changed = true;
        continue;
      }
      const used = byProp.get(k.property) ?? new Set<number>();
      let at = m;
      if (used.has(at)) {
        note(collisions, { kind: "keyframe", id: `${k.property}@${k.frame}`, ownerId: l.id });
        while (used.has(at)) at++;
      }
      used.add(at);
      byProp.set(k.property, used);
      if (at !== k.frame) {
        changed = true;
        note(scaling ? scaled : moved, {
          kind: "keyframe",
          id: `${k.property}@${k.frame}`,
          ownerId: l.id,
        });
      }
      keyframes.push({ ...k, frame: at });
    }
    const swaps: ImageSwap[] = [];
    const swapUsed = new Set<number>();
    for (const w of [...f.swaps].sort((a, b) => a.frame - b.frame)) {
      const m = placeFrame(w.frame);
      if (m === null) {
        note(trimmed, { kind: "imageSwap", id: `swap@${w.frame}`, ownerId: l.id });
        changed = true;
        continue;
      }
      let at = m;
      if (swapUsed.has(at)) {
        note(collisions, { kind: "imageSwap", id: `swap@${w.frame}`, ownerId: l.id });
        while (swapUsed.has(at)) at++;
      }
      swapUsed.add(at);
      if (at !== w.frame) {
        changed = true;
        note(scaling ? scaled : moved, { kind: "imageSwap", id: `swap@${w.frame}`, ownerId: l.id });
      }
      swaps.push({ ...w, frame: at });
    }
    let path = f.path;
    if (path) {
      const a = mapFrame(path.startFrame);
      const b = mapFrame(path.endFrame);
      if (b < 0 || (cutRange && method === "end" && path.startFrame < before && a >= target)) {
        note(trimmed, { kind: "path", id: l.id, ownerId: l.id });
        path = null;
        changed = true;
      } else if (a !== path.startFrame || b !== path.endFrame) {
        const start = Math.max(0, a);
        path = { ...path, startFrame: start, endFrame: Math.max(start + 1, b) };
        note(a < 0 ? trimmed : scaling ? scaled : moved, { kind: "path", id: l.id, ownerId: l.id });
        changed = true;
      }
    }
    // Aktivt tidsområde (AS2): følger tiden som nøkkelbildene; et område helt utenfor fjernes og rapporteres
    let activeRange = f.activeRange ?? null;
    if (activeRange) {
      const a = mapFrame(activeRange.from);
      const b = mapFrame(activeRange.to);
      if (b < 0 || a >= target) {
        note(trimmed, { kind: "activeRange", id: l.id, ownerId: l.id });
        activeRange = null;
        changed = true;
      } else if (a !== activeRange.from || b !== activeRange.to) {
        const from = Math.max(0, a);
        activeRange = { from, to: Math.max(from, Math.min(target - 1, b)) };
        note(a < 0 || b >= target ? trimmed : scaling ? scaled : moved, {
          kind: "activeRange",
          id: l.id,
          ownerId: l.id,
        });
        changed = true;
      }
    }
    // Krysstoning (AS2): kortes ned hvis bildet før er blitt kortere
    const fitted = swaps.map((w, i) => {
      if (!w.transition) return w;
      const gap = w.frame - (i > 0 ? swaps[i - 1]!.frame : 0);
      return w.transition.frames > gap ? { ...w, transition: { ...w.transition, frames: gap } } : w;
    });
    if (changed)
      layerSteps.push({
        layerId: l.id,
        fields: { ...f, keyframes, swaps: fitted, path, activeRange },
      });
  }

  // ---------- Kamera ----------
  const shots: CameraShot[] = [];
  for (const sh of comp.camera.shots) {
    const a = mapFrame(sh.startFrame);
    const b = mapFrame(sh.endFrame);
    if (b < 0 || (cutRange && method === "end" && sh.startFrame < before && a >= target)) {
      note(trimmed, { kind: "cameraShot", id: sh.id, detail: sh.name });
      continue;
    }
    const start = Math.max(0, a);
    const end = Math.max(
      start,
      method === "end" && cutRange && sh.endFrame <= before ? Math.min(b, target) : b,
    );
    if (start !== sh.startFrame || end !== sh.endFrame)
      note(a < 0 || end !== b ? trimmed : scaling ? scaled : moved, {
        kind: "cameraShot",
        id: sh.id,
        detail: sh.name,
      });
    shots.push({ ...sh, startFrame: start, endFrame: end });
  }

  // ---------- Låste tidsrom og fyll ----------
  const lockedRanges: LockedRange[] = timing.lockedRanges.map((r) => {
    const a = mapFrame(r.startFrame);
    const len = r.endFrame - r.startFrame;
    if (a !== r.startFrame) note(moved, { kind: "lockedRange", id: r.id, detail: r.label });
    return { ...r, startFrame: a, endFrame: a + len };
  });
  let padStart = pad.start;
  let padEnd = pad.end;
  if (method === "start") {
    const frames = Math.max(0, (pad.start?.frames ?? 0) + d);
    padStart = frames > 0 ? { frames, fill: extending ? opts.fill! : pad.start!.fill } : null;
  } else if (method === "end") {
    const frames = Math.max(0, (pad.end?.frames ?? 0) + d);
    padEnd = frames > 0 ? { frames, fill: extending ? opts.fill! : pad.end!.fill } : null;
  } else {
    if (pad.start) padStart = { ...pad.start, frames: Math.max(1, mapFrame(pad.start.frames)) };
    if (pad.end)
      padEnd = { ...pad.end, frames: Math.max(1, target - mapFrame(before - pad.end.frames)) };
  }
  if (padStart !== pad.start || padEnd !== pad.end) note(moved, { kind: "padding", id: comp.id });
  const newTiming: CompositionTiming = {
    lockedRanges,
    padding: { start: padStart, end: padEnd },
  };

  // ---------- Lyd ----------
  const audioSteps: { clipId: string; fields: ReturnType<typeof audioClipFieldsOf> }[] = [];
  const removeClips: string[] = [];
  const dMs = targetMs - beforeMs;
  const cutClip = (a: AudioClip, why: string): RetimePlan =>
    fail(
      L(
        `«${a.name || a.kind}» ville blitt kuttet eller havnet utenfor scenen (${why}). Tale og effekter fjernes aldri automatisk. Velg en annen metode eller avbryt.`,
        `“${a.name || a.kind}” would be cut or end up outside the scene (${why}). Speech and effects are never removed automatically. Choose another method or cancel.`,
      ),
    );
  for (const a of clips) {
    if (method === "stretch_visual") continue;
    const f = audioClipFieldsOf(a);
    const end = a.offsetMs + a.lengthMs;
    let next = { ...f };
    if (method === "start" || method === "end") {
      const shift = method === "start" ? dMs : 0;
      let off = a.offsetMs + shift;
      let length = a.lengthMs;
      let sourceIn = a.sourceInMs;
      let volumeKeys = f.volumeKeys;
      const isSpeech = SPEECH.has(a.kind);
      if (!extending) {
        const tooEarly = off < 0;
        const tooLate = method === "end" && a.offsetMs < beforeMs && end > targetMs && !a.continues;
        if (
          isSpeech &&
          (tooEarly ||
            tooLate ||
            (method === "end" && a.offsetMs >= targetMs && a.offsetMs < beforeMs))
        )
          return cutClip(
            a,
            tooEarly ? L("før start", "before the start") : L("etter slutt", "after the end"),
          );
        if (!isSpeech && off + length <= 0) {
          removeClips.push(a.id);
          note(trimmed, { kind: "audioClip", id: a.id, detail: a.name });
          continue;
        }
        if (!isSpeech && off < 0) {
          const cut = -off;
          sourceIn += cut;
          length -= cut;
          off = 0;
          volumeKeys = volumeKeys.map((k) => ({ ...k, t: k.t - cut })).filter((k) => k.t >= 0);
          note(trimmed, { kind: "audioClip", id: a.id, detail: a.name });
        }
        if (!isSpeech && method === "end" && !a.continues && a.offsetMs < beforeMs) {
          if (a.offsetMs >= targetMs) {
            removeClips.push(a.id);
            note(trimmed, { kind: "audioClip", id: a.id, detail: a.name });
            continue;
          }
          if (off + length > targetMs) {
            length = targetMs - off;
            volumeKeys = volumeKeys.filter((k) => k.t <= length);
            note(trimmed, { kind: "audioClip", id: a.id, detail: a.name });
          }
        }
      } else if (opts.keepAmbience && AMBIENT.has(a.kind) && !a.continues) {
        const v = audioVersion(s, a);
        const sourceLeft =
          v?.durationMs != null ? v.durationMs - (a.sourceInMs + a.lengthMs) : null;
        if (method === "end" && end >= beforeMs - msPerFrame) {
          const want = dMs;
          const can = sourceLeft === null ? 0 : Math.max(0, Math.min(want, sourceLeft));
          if (can < want) note(audioNotFitting, { kind: "audioClip", id: a.id, detail: a.name });
          length += can;
        } else if (method === "start" && a.offsetMs <= msPerFrame) {
          const can = Math.max(0, Math.min(dMs, a.sourceInMs));
          if (can < dMs) note(audioNotFitting, { kind: "audioClip", id: a.id, detail: a.name });
          off -= can;
          sourceIn -= can;
          length += can;
          volumeKeys = volumeKeys.map((k) => ({ ...k, t: k.t + can }));
        }
      }
      next = { ...f, offsetMs: off, lengthMs: length, sourceInMs: sourceIn, volumeKeys };
    } else {
      const off = mapMs(a.offsetMs);
      next = { ...f, offsetMs: Math.max(0, off) };
      if (method === "stretch_all" && (a.kind === "dialogue" || a.kind === "narration")) {
        const want = mapMs(end) - off;
        const deltaMs = want - a.lengthMs;
        if (Math.abs(deltaMs) >= 1) {
          const done = opts.remixed?.[a.id];
          if (done)
            next = {
              ...next,
              versionId: done.versionId as never,
              lengthMs: done.lengthMs,
              sourceInMs: 0,
            };
          else {
            const r = remixFor(s, a, deltaMs, newId);
            if (r) remix.push(r);
            else note(audioNotFitting, { kind: "audioClip", id: a.id, detail: a.name });
          }
          note(scaled, { kind: "audioClip", id: a.id, detail: a.name });
        }
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(f)) {
      audioSteps.push({ clipId: a.id, fields: next });
      if (!trimmed.some((t) => t.id === a.id) && !scaled.some((t) => t.id === a.id))
        note(moved, { kind: "audioClip", id: a.id, detail: a.name });
    }
  }

  // ---------- Tidskoblinger til manuset ----------
  const linkSteps: Command[] = [];
  const linkFields: {
    linkId: string;
    fields: {
      occurrenceId: string;
      blockId: string;
      startMs: number;
      endMs: number | null;
      layerId: string | null;
    };
  }[] = [];
  for (const t of links) {
    const st = mapMs(t.startMs);
    const en = t.endMs === null ? null : mapMs(t.endMs);
    const late =
      method === "end" &&
      !extending &&
      t.startMs < beforeMs &&
      (st >= targetMs || (en !== null && t.endMs! <= beforeMs && en > targetMs));
    if (st < 0 || late)
      return fail(
        L(
          "En kobling mellom manuset og tiden i scenen ville blitt kuttet. Manuskoblinger fjernes aldri automatisk. Velg en annen metode eller avbryt.",
          "A link between the script and the time in the scene would be cut. Script links are never removed automatically. Choose another method or cancel.",
        ),
      );
    if (st !== t.startMs || en !== t.endMs) {
      linkFields.push({
        linkId: t.id,
        fields: {
          occurrenceId: t.occurrenceId,
          blockId: t.blockId,
          startMs: st,
          endMs: en,
          layerId: t.layerId,
        },
      });
      note(scaling ? scaled : moved, { kind: "timeLink", id: t.id });
    }
  }
  if (linkFields.length) linkSteps.push({ type: "UpdateTimeLinks", links: linkFields } as never);

  // ---------- Filmen: deler, segmenter og overganger ----------
  for (const p of parts)
    note(manual, {
      kind: "clipPart",
      id: p.id,
      detail: L(
        "Delene av scenen i monteringen endres ikke; kontroller dem.",
        "The parts of the scene in the edit are not changed; check them.",
      ),
    });
  for (const g of Object.values(s.segments))
    if (g.occurrenceId === occ.id && g.startMs !== undefined)
      note(manual, {
        kind: "segment",
        id: g.id,
        detail: L(
          "Segmentet til generering har faste tider; kontroller det.",
          "The generation segment has fixed times; check it.",
        ),
      });
  const transitionSteps: Command[] = [];
  const clampTransition = (o: SceneOccurrence) => {
    if (o.transition && o.transition.frames > target) {
      transitionSteps.push({
        type: "SetTransition",
        occurrenceId: o.id,
        transition: { ...o.transition, frames: target },
      } as never);
      note(trimmed, {
        kind: "transition",
        id: o.id,
        detail: L(
          "Overgangen ble kortet ned til scenens lengde.",
          "The transition was shortened to the scene length.",
        ),
      });
    }
  };
  clampTransition(occ);
  const siblings = Object.values(s.occurrences)
    .filter((o) => o.productionId === occ.productionId && o.active)
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0));
  const nextOcc = siblings[siblings.indexOf(occ) + 1];
  if (nextOcc) clampTransition(nextOcc);
  const def = s.project.defaultTransition;
  if (def && def.frames > target)
    note(manual, {
      kind: "transition",
      id: "default",
      detail: L(
        "Prosjektets standardovergang er lengre enn scenen; endre den eller gi scenen egen overgang.",
        "The project's default transition is longer than the scene; change it or give the scene its own transition.",
      ),
    });

  // ---------- Kommandoen ----------
  const steps: Command[] = [
    {
      type: "UpdateComposition",
      compositionId: comp.id,
      fields: {
        name: comp.name,
        width: comp.width,
        height: comp.height,
        durationFrames: target,
        background: comp.background,
      },
      camera: { shots },
      timing: newTiming,
    } as Command,
  ];
  if (layerSteps.length) steps.push({ type: "UpdateLayers", layers: layerSteps } as never);
  if (audioSteps.length) steps.push({ type: "UpdateAudioClips", clips: audioSteps } as never);
  if (removeClips.length)
    steps.push({ type: "SetAudioClipsRemoved", clipIds: removeClips, removed: true } as never);
  steps.push(...linkSteps, ...transitionSteps);
  if (occ.plannedMs !== undefined && occ.plannedMs !== null)
    steps.push({ type: "SetPlannedDuration", occurrenceId: occ.id, plannedMs: targetMs } as never);
  return {
    ok: true,
    command: { type: "RetimeScene", occurrenceId: occ.id, compositionId: comp.id, steps } as never,
    report: report(),
  };
}

/** Nye ordmellomrom for et dialogopptak med ordkobling (DEC-0096); null når det ikke går. */
function remixFor(
  s: ProjectState,
  a: AudioClip,
  deltaMs: number,
  newId: () => string,
): RemixPlan | null {
  const v = audioVersion(s, a);
  if (!v || !v.alignment || v.durationMs == null) return null;
  // Klippet må bruke hele opptaket; ellers ville et utsnitt av den nye miksen ikke svart til klippet
  if (
    a.sourceInMs !== 0 ||
    Math.abs(a.lengthMs - (v.composition ? compositionLengthMs(v.composition) : v.durationMs)) > 2
  )
    return null;
  const comp =
    v.composition ?? compositionFromTake({ versionId: v.id, durationMs: v.durationMs }, newId);
  const src: AlignmentSource = v.composition
    ? { kind: "composition", composition: v.composition }
    : { kind: "version", versionId: v.id };
  const words = v.alignment.words.length;
  if (words < 2) return null;
  const next = spreadPause(comp, v.alignment, src, 0, words - 1, deltaMs, newId);
  if (!next) return null;
  const variant = s.assetVariants[v.variantId];
  if (!variant) return null;
  return {
    clipId: a.id,
    assetId: variant.assetId,
    variantId: v.variantId,
    baseVersionId: v.id,
    composition: next,
    deltaMs,
  };
}

/** Hva ny tid viser, for rapporten. */
export function retimeMethodNeedsFill(method: RetimeMethod, deltaFrames: number): boolean {
  return (method === "start" || method === "end") && deltaFrames > 0;
}

/**
 * Om scenen har innhold med tidspunkter (nøkkelbilder, bildeskifter, baner, kamerautsnitt, lydklipp,
 * manuskoblinger eller låste tidsrom). En scene uten slikt kan endre lengde direkte, uten metodevalg.
 */
export function retimeHasTimedContent(s: ProjectState, occurrenceId: string): boolean {
  const occ = s.occurrences[occurrenceId];
  const comp = occ ? compositionForOccurrence(s, occ) : undefined;
  if (!occ || !comp) return false;
  if (comp.camera.shots.length > 0 || timingOf(comp).lockedRanges.length > 0) return true;
  for (const l of layersOf(s, comp.id)) {
    const f = layerFieldsOf(l);
    if (f.keyframes.length > 0 || f.swaps.length > 0 || f.path) return true;
  }
  if (Object.values(s.audioClips).some((a) => a.occurrenceId === occ.id && !a.removed)) return true;
  return Object.values(s.timeLinks).some((t) => t.occurrenceId === occ.id && !t.removed);
}
