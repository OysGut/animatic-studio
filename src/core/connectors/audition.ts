/**
 * C-6: planen serveren sender til Audition-panelet for én scene (sceneforekomst) eller ett panel.
 * Bare lesing: dialog, musikk, effekter og atmosfære fra scenens lydklipp (SB-4) og midlertidig panellyd.
 * Versjonen som sendes er den låste, ellers den godkjente, ellers den nyeste (samme valg som avspillingen).
 * Ingenting her skriver prosjektdata. Takhøydene i audition-session.ts gjelder per plan.
 */
import type { ProjectState } from "../model";
import { positionIndex } from "../storyboard/position";
import { blockSpans } from "../assembly/film";
import { sourceLanguageOf } from "../dialogue/languages";
import { sha256Hex } from "./sha256";
import { AUDITION_MAX_CLIPS, AUDITION_MAX_MARKERS, AUDITION_SAMPLE_RATE, type AuditionClip, type AuditionMarker, type AuditionPlan, type AuditionRole } from "./audition-session";

const ROLE: Record<string, AuditionRole> = { dialogue: "dialogue", narration: "dialogue", music: "music", sfx: "effects", ambience: "ambience" };

function resolveVersion(s: ProjectState, assetId: string, variantId: string | null, versionId: string | null) {
  if (versionId) { const v = s.assetVersions[versionId]; return v && !v.removed ? v : null; }
  const variants = Object.values(s.assetVariants).filter(v => !v.archived && v.assetId === assetId && (!variantId || v.id === variantId));
  for (const variant of variants) {
    if (variant.approvedVersionId) { const v = s.assetVersions[variant.approvedVersionId]; if (v && !v.removed) return v; }
    const latest = Object.values(s.assetVersions).filter(v => !v.removed && v.variantId === variant.id).sort((a, b) => b.number - a.number)[0];
    if (latest) return latest;
  }
  return null;
}

export function auditionPlan(s: ProjectState, occurrenceId: string, panelId: string | null = null): AuditionPlan | null {
  const occ = s.occurrences[occurrenceId];
  if (!occ) return null;
  const fps = s.project.fps, msOf = (frames: number) => Math.round((frames * 1000 * fps.den) / fps.num);
  const idx = positionIndex(s, occ.productionId);
  const film = idx.clips.find(c => c.occurrenceId === occurrenceId);
  const sceneIndex = idx.clips.findIndex(c => c.occurrenceId === occurrenceId);
  const shots = idx.shots.filter(x => x.occurrenceId === occurrenceId);
  const sceneStart = film ? film.startFrame : shots[0]?.startFrame ?? 0;
  const panelWindow = (p: (typeof shots)[number]) => ({ startMs: msOf(p.startFrame - sceneStart), endMs: msOf(p.startFrame - sceneStart + p.durationFrames) });
  const only = panelId ? shots.find(x => x.panel.id === panelId) : null;
  if (panelId && !only) return null;
  const sceneDurationMs = Math.max(film ? msOf(film.durationFrames) : 0, shots.reduce((m, p) => Math.max(m, panelWindow(p).endMs), 0));
  const win = only ? panelWindow(only) : { startMs: 0, endMs: sceneDurationMs };
  const lang = sourceLanguageOf(s);
  const panelAt = (ms: number) => shots.find(p => { const w = panelWindow(p); return ms >= w.startMs && ms < w.endMs; })?.panel.id ?? null;

  const clips: AuditionClip[] = [];
  for (const c of Object.values(s.audioClips)) {
    if (c.removed || c.occurrenceId !== occurrenceId) continue;
    const l = (c as { language?: string }).language;
    if (l && l !== "*" && l !== lang) continue;
    if (c.offsetMs + c.lengthMs <= win.startMs || c.offsetMs >= win.endMs) continue;
    const v = resolveVersion(s, c.assetId, c.assetVariantId, c.versionId);
    if (!v) continue;
    clips.push({ clipId: c.id, role: ROLE[c.kind] ?? "effects", name: c.name, assetId: c.assetId, variantId: v.variantId, versionId: v.id, mimeType: v.mimeType, panelId: panelAt(c.offsetMs), blockId: c.blockId, offsetMs: c.offsetMs - win.startMs, sourceInMs: c.sourceInMs, lengthMs: c.lengthMs, gainDb: c.gainDb, muted: c.muted });
  }
  for (const p of only ? [only] : shots) {
    const t = p.panel.storyboard?.tempAudio;
    const v = t ? s.assetVersions[t.versionId] : null;
    if (!t || !v || v.removed) continue;
    clips.push({ clipId: null, role: "temp", name: t.name, assetId: t.assetId, variantId: v.variantId, versionId: v.id, mimeType: v.mimeType, panelId: p.panel.id, blockId: null, offsetMs: panelWindow(p).startMs - win.startMs, sourceInMs: 0, lengthMs: t.durationMs, gainDb: 0, muted: false });
  }
  clips.sort((a, b) => a.offsetMs - b.offsetMs || a.role.localeCompare(b.role) || a.versionId.localeCompare(b.versionId));

  const markers: AuditionMarker[] = [];
  for (const p of only ? [only] : shots) markers.push({ kind: "panel", id: p.panel.id, label: p.panel.name || "", ms: panelWindow(p).startMs - win.startMs });
  if (film) for (const span of blockSpans(s, film)) {
    const ms = msOf(span.startFrame - sceneStart);
    if (ms < win.startMs || ms >= win.endMs) continue;
    const text = s.blocks[span.blockId]?.text ?? "";
    markers.push({ kind: "line", id: span.blockId, label: text.slice(0, 60), ms: ms - win.startMs });
  }
  markers.sort((a, b) => a.ms - b.ms || a.kind.localeCompare(b.kind));

  const truncated = clips.length > AUDITION_MAX_CLIPS || markers.length > AUDITION_MAX_MARKERS;
  const keptClips = clips.slice(0, AUDITION_MAX_CLIPS), keptMarkers = markers.slice(0, AUDITION_MAX_MARKERS);
  const sceneLabel = `${sceneIndex >= 0 ? sceneIndex + 1 : "?"}`;
  const manifestId = sha256Hex(new TextEncoder().encode(JSON.stringify([s.project.id, occurrenceId, panelId, keptClips.map(c => [c.clipId, c.versionId, c.offsetMs, c.lengthMs]), keptMarkers.map(m => [m.id, m.ms])]))).slice(0, 32);
  return {
    manifestId, projectId: s.project.id, occurrenceId, sceneId: occ.sceneId, sceneLabel, panelId: only ? only.panel.id : null,
    fps, sampleRate: AUDITION_SAMPLE_RATE, startMs: msOf(sceneStart) + win.startMs, durationMs: win.endMs - win.startMs,
    clips: keptClips, markers: keptMarkers, truncated,
  };
}
