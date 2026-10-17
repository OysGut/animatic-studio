/**
 * Romlyd i lydeditoren (fase 2, bolk E, DEC-0096, REQ-0708/0709): finner romlyd i dekodede opptak (hurtigbufret
 * per opptak) og fyller pausene i komposisjonen. Kjernen (`src/core/audio/roomtone.ts`) gjør selve arbeidet; her
 * kobles den til AudioBuffer og prosjektets romlydressurser.
 */
import {
  L,
  ROOM_TONE_TAG,
  audioTakeLabel,
  compositionToSource,
  fillPauseGaps,
  findRoomTone,
  newId,
  pauseGaps,
  segmentRole,
  soundTakes,
  wholeFileCandidate,
  type AlignmentSource,
  type AudioComposition,
  type PauseGap,
  type ProjectState,
  type RoomCandidate,
  type RoomSource,
  type WordAlignment,
} from "@/core";

const segId = () => newId<"audio_segment">();

/** Romlydkandidater per dekodet opptak (søket er det samme så lenge opptaket og ordene er de samme). */
const cache = new WeakMap<AudioBuffer, { key: string; list: RoomCandidate[] }>();

export function roomCandidates(
  buffer: AudioBuffer,
  avoid: readonly { readonly startMs: number; readonly endMs: number }[],
): RoomCandidate[] {
  const key = avoid.map((a) => `${a.startMs}-${a.endMs}`).join(",");
  const hit = cache.get(buffer);
  if (hit && hit.key === key) return hit.list;
  const list = findRoomTone(buffer.getChannelData(0), buffer.sampleRate, avoid);
  cache.set(buffer, { key, list });
  return list;
}

/** Ordene i et opptak (ms i opptaket) etter ordkoblingen, så romlydsøket holder avstand til dem. */
export function wordsInRecording(
  versionId: string,
  al: WordAlignment | null,
  src: AlignmentSource | null,
): { startMs: number; endMs: number }[] {
  if (!al || !src) return [];
  const out: { startMs: number; endMs: number }[] = [];
  for (const w of al.words) {
    if (w.startMs === null || w.endMs === null) continue;
    if (src.kind === "version") {
      if (src.versionId === versionId) out.push({ startMs: w.startMs, endMs: w.endMs });
      continue;
    }
    const a = compositionToSource(src.composition, w.startMs);
    const b = compositionToSource(src.composition, w.endMs);
    if (a && b && a.versionId === versionId && b.versionId === versionId)
      out.push({ startMs: a.ms, endMs: b.ms });
  }
  return out;
}

/** Romlydfilene i prosjektet (lydressurser merket «romlyd»), til valget «Valgt romlydfil». */
export function roomToneFiles(s: ProjectState): { versionId: string; label: string }[] {
  const out: { versionId: string; label: string }[] = [];
  for (const a of Object.values(s.assets)) {
    if (a.kind !== "sound" || a.removed || a.archived || !a.tags.includes(ROOM_TONE_TAG)) continue;
    for (const t of soundTakes(s, a.id))
      if (!s.assetVersions[t.versionId]?.composition && t.durationMs)
        out.push({ versionId: t.versionId, label: `${a.name} · ${audioTakeLabel(t.number)}` });
  }
  return out.sort((x, y) => x.label.localeCompare(y.label, "nb"));
}

/**
 * Fyller pausene med romlyd: fra samme opptak som talen før pausen, ellers fra reserven (romlyd tatt opp for
 * scenen), ellers fra valgt romlydfil. Gir komposisjonen og meldinger for pauser som ikke kunne fylles.
 */
export function fillRoom(
  c: AudioComposition,
  al: WordAlignment,
  src: AlignmentSource,
  state: ProjectState,
  buffers: ReadonlyMap<string, AudioBuffer> | null,
  fallbackVersionId: string | null,
): { composition: AudioComposition; messages: string[] } {
  const gaps = pauseGaps(c, al, src);
  const sourceFor = (g: PauseGap): RoomSource | null => {
    if (g.pause.fill.kind === "asset") {
      const v = state.assetVersions[g.pause.fill.versionId];
      return v?.durationMs
        ? { versionId: v.id, candidates: wholeFileCandidate(v.durationMs) }
        : null;
    }
    const before = c.segments.find(
      (s) =>
        s.track === 0 &&
        segmentRole(s) === "speech" &&
        Math.abs(s.atMs + s.lengthMs - g.fromMs) <= 1,
    );
    const buf = before ? buffers?.get(before.versionId) : undefined;
    if (before && buf) {
      const list = roomCandidates(buf, wordsInRecording(before.versionId, al, src));
      if (list.length) return { versionId: before.versionId, candidates: list };
    }
    const fb = fallbackVersionId ? state.assetVersions[fallbackVersionId] : undefined;
    return fb?.durationMs
      ? { versionId: fb.id, candidates: wholeFileCandidate(fb.durationMs) }
      : null;
  };
  const r = fillPauseGaps(c, gaps, sourceFor, segId);
  return {
    composition: r.composition,
    messages: r.unfilled.map((u) =>
      L(
        `Pausen etter ord ${u.afterWord + 1}: ${u.message}`,
        `The pause after word ${u.afterWord + 1}: ${u.message}`,
      ),
    ),
  };
}
