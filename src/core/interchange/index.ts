import type { AssetVersion, ProjectState } from "../model";
import { blockSpans, filmClips, filmSelection } from "../assembly/film";
import { productionStatus } from "../assembly/status";
import { estimateProduction } from "../screenplay/duration";
import { audioVersion, filmAudio } from "../audio";
import { wordIds } from "../audio/alignment";
import { layersOf, layerVersion, layerVersions } from "../composition/render";
import { assetsInScene } from "../library";
import { languageState } from "../language";
import { translationOf } from "../translation";
import { blocksOfVariant, sceneNumberOf } from "../views";
import { formatTimecode, framesToSeconds, secondsToFrames, validateFps, type Rational } from "../time";
import { DEFAULT_CAPTURE, captureSettingsValid, captureTimeline, suggestProjectCode, type CaptureSettings } from "./settings";
import { t } from "../i18n/keyed";
import { sceneCode, shotName } from "./naming";
import type { EventTime, FileRef, InterchangeDoc, Shot } from "./types";

export * from "./types";
export * from "./settings";
export * from "./naming";

/** Absolute boundaries are rounded once; never round a duration independently. */
export function eventTime(startSeconds: number, endSeconds: number, shot: Pick<Shot, "startFrame" | "lengthFrames">, fps: Rational): EventTime {
  const a = secondsToFrames(startSeconds, fps);
  const b = secondsToFrames(endSeconds, fps);
  return { absoluteStartFrame: a, absoluteEndFrame: b, startFrame: a - shot.startFrame,
    endFrame: b - shot.startFrame, lengthFrames: b - a, crossesCut: b > shot.startFrame + shot.lengthFrames };
}

export interface InterchangeOptions {
  readonly productionId: string;
  readonly language: string | { readonly dialogue: string; readonly subtitles: string | null };
  readonly occurrenceIds?: readonly string[];
  readonly captureFps?: Rational;
  readonly capture?: CaptureSettings;
  /** Versions reserved by the export log, keyed by permanent occurrence ID. */
  readonly versions?: Readonly<Record<string, number>>;
}

export function buildInterchange(state: ProjectState, o: InterchangeOptions): InterchangeDoc {
  const lang = typeof o.language === "string" ? { dialogue: o.language, subtitles: null } : o.language;
  const s = languageState(state, lang.dialogue);
  const capture = o.capture ?? (o.captureFps ? { mode: o.captureFps.num / o.captureFps.den === 12 ? "twos" as const : "custom" as const, fps: o.captureFps } : state.project.capture ?? DEFAULT_CAPTURE);
  validateFps(capture.fps);
  if (!captureSettingsValid(capture)) throw new Error(t("ptg1.invalid-settings"));
  const { fps, exposureStep } = captureTimeline(capture);
  const sourceFps = s.project.fps;
  const all = filmClips(s, o.productionId);
  const clips = o.occurrenceIds ? filmSelection(all, new Set(o.occurrenceIds)).clips : all;
  const frame = (f: number) => secondsToFrames(framesToSeconds(f, sourceFps), fps);
  const refs = new Map<string, FileRef>();
  const ref = (v: AssetVersion | null): string | null => {
    if (!v) return null;
    const ext = v.mediaPath.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin";
    refs.set(v.id, { id: v.id, mediaPath: v.mediaPath, path: `media/${v.id}.${ext}`, mimeType: v.mimeType, byteSize: v.byteSize });
    return v.id;
  };
  const statuses = new Map(productionStatus(s, o.productionId, estimateProduction(s, o.productionId)).rows.map(r => [r.occurrenceId, r.status]));
  const boundaries = clips.map((c, i) => i === 0 ? 0 : frame(c.startFrame + c.overlapFrames / 2));
  const last = clips[clips.length - 1];
  const lengthFrames = last ? frame(last.startFrame + last.durationFrames) : 0;
  boundaries.push(lengthFrames);
  const used = new Set<string>();
  const code = s.project.code ?? suggestProjectCode(s.project.name);
  const shots: Shot[] = clips.map((c, i) => {
    const occurrence = s.occurrences[c.occurrenceId];
    const number = occurrence ? sceneNumberOf(s, occurrence) : c.productionNumber;
    const sc = sceneCode(number, i + 1);
    let shotNumber = 10;
    while (used.has(`${sc}:${shotNumber}`)) shotNumber += 10;
    used.add(`${sc}:${shotNumber}`);
    const version = o.versions?.[c.occurrenceId] ?? 1;
    const name = shotName(code, sc, shotNumber, version);
    const startFrame = boundaries[i] ?? 0;
    const endFrame = boundaries[i + 1] ?? startFrame;
    const local = (f: number) => frame(c.startFrame + f) - startFrame;
    const assets = assetsInScene(s, o.productionId, c.occurrenceId).map(x => x.asset);
    const layers = c.compositionId ? layersOf(s, c.compositionId) : [];
    return { id: c.occurrenceId, sceneId: c.sceneId, sceneNumber: number, shotNumber, version, name,
      startFrame, lengthFrames: endFrame - startFrame,
      timecodeIn: formatTimecode(startFrame, fps), timecodeOut: formatTimecode(endFrame, fps),
      handleIn: Math.max(0, startFrame - frame(c.startFrame)),
      handleOut: Math.max(0, frame(c.startFrame + c.durationFrames) - endFrame),
      frameIn: frame(c.startFrame), frameOut: frame(c.startFrame + c.durationFrames),
      transition: { type: c.transition.kind, lengthFrames: c.transition.kind === "cut" ? 0 : frame(c.startFrame + (c.overlapFrames || c.transition.frames)) - frame(c.startFrame), overlap: c.overlapFrames > 0 },
      sourceStartFrame: c.startFrame, sourceLengthFrames: c.durationFrames, compositionId: c.compositionId,
      thumbnail: { path: `thumbnails/${name}.png`, sourceFrame: Math.max(0, Math.floor(c.durationFrames / 2)) },
      description: [c.heading.intExt, c.heading.location, c.heading.time].filter(Boolean).join(" "),
      characters: assets.filter(a => a.kind === "character" || a.kind === "animal").map(a => a.name),
      sets: assets.filter(a => a.kind === "location" || a.kind === "environment").map(a => a.name),
      props: assets.filter(a => a.kind === "object" || a.kind === "other").map(a => a.name),
      status: statuses.get(c.occurrenceId) ?? "missing",
      layers: layers.map(l => {
        for (const v of layerVersions(s, l)) ref(v);
        return { id: l.id, source: l, fileId: ref(layerVersion(s, l)),
          keyframes: l.keyframes.map(k => ({ ...k, frame: local(k.frame) })),
          swaps: l.swaps.map(w => ({ ...w, frame: local(w.frame), fileId: ref(layerVersion(s, l, w.frame)),
            ...(w.transition ? { transition: { ...w.transition, frames: frame(c.startFrame + w.frame + w.transition.frames) - frame(c.startFrame + w.frame) } } : {}) })),
          activeRange: l.activeRange ? { startFrame: local(l.activeRange.from), endFrame: local(l.activeRange.to + 1) } : null,
          path: l.path ? { ...l.path, startFrame: local(l.path.startFrame), endFrame: local(l.path.endFrame) } : null };
      }), camera: null, audio: [], dialogue: [], words: [] };
  });
  // Ownership is determined by the rounded absolute start, including events from a neighbour's handle.
  const owner = (seconds: number) => {
    const at = secondsToFrames(seconds, fps);
    return shots.find(x => at >= x.startFrame && at < x.startFrame + x.lengthFrames);
  };
  for (const it of filmAudio(s, clips, sourceFps, lang.dialogue)) {
    const shot = owner(it.start);
    if (!shot) continue;
    const fullEnd = it.start + it.fullLength;
    shot.audio.push({ id: it.clip.id, sourceOccurrenceId: it.clip.occurrenceId, source: it.clip, fileId: ref(it.version),
      ...eventTime(it.start, fullEnd, shot, fps), sourceInMs: it.sourceIn * 1000, speed: it.speed ?? 1, gain: it.gain,
      fadeInFrames: secondsToFrames(it.start + it.fadeIn, fps) - secondsToFrames(it.start, fps),
      fadeOutFrames: secondsToFrames(fullEnd, fps) - secondsToFrames(fullEnd - it.fadeOut, fps),
      volumeKeys: it.keys.map(k => ({ frame: secondsToFrames(it.start + k.t, fps) - shot.startFrame, db: k.db })) });
    const alignment = audioVersion(s, it.clip)?.alignment;
    if (!alignment) continue;
    const ids = wordIds(alignment);
    alignment.words.forEach((w, i) => {
      if (w.startMs === null || w.endMs === null) return;
      const start = it.start + (w.startMs / 1000 - it.sourceIn) / (it.speed ?? 1);
      const end = it.start + (w.endMs / 1000 - it.sourceIn) / (it.speed ?? 1);
      if (start < it.start || start >= fullEnd) return;
      const target = owner(start);
      if (target) target.words.push({ id: ids[i] ?? `${it.clip.id}:${i}`, audioId: it.clip.id, blockId: alignment.blockId,
        text: w.text, ...eventTime(start, end, target, fps) });
    });
  }
  for (const c of clips) {
    const spans = new Map(blockSpans(s, c).map(x => [x.blockId, x]));
    let character = "";
    for (const b of blocksOfVariant(s, c.variantId)) {
      const text = lang.dialogue === "nb" ? b.text : translationOf(s, b.id, lang.dialogue)?.text ?? "";
      if (b.kind === "character") character = text;
      if (b.kind !== "dialogue") continue;
      const audio = shots.flatMap(x => x.audio).find(x => x.source.blockId === b.id && x.sourceOccurrenceId === c.occurrenceId);
      const span = spans.get(b.id);
      const start = audio ? framesToSeconds(audio.absoluteStartFrame, fps) : framesToSeconds(span?.startFrame ?? c.startFrame, sourceFps);
      const end = audio ? framesToSeconds(audio.absoluteEndFrame, fps) : framesToSeconds(span?.endFrame ?? c.startFrame, sourceFps);
      const shot = owner(start);
      if (shot) shot.dialogue.push({ id: b.id, sourceOccurrenceId: c.occurrenceId, text, character,
        characterAssetId: audio?.source.characterAssetId ?? null, estimated: !audio, ...eventTime(start, end, shot, fps) });
    }
  }
  return { project: { id: s.project.id, code, name: s.project.name }, production: { id: o.productionId, name: s.productions[o.productionId]?.name ?? "" },
    language: lang, fps, sourceFps, captureFps: capture.fps, exposureStep, lengthFrames, shots, references: [...refs.values()], namingVersion: "1" };
}