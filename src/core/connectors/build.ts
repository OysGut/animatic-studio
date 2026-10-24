/**
 * C-0: bygger Manifest v1 fra prosjekttilstanden. Bare metadata og kontrollsummer; filstier er prosjektets
 * interne nøkler (de er ikke hemmelige og gir ingen tilgang uten en gyldig sesjon og signert lenke).
 */
import type { ProjectState } from "../model";
import { MANIFEST_VERSION, framesToTimecode, type ConnectorManifest, type ManifestItem } from "./manifest";

export const DEFAULT_SAMPLE_RATE = 48000;

export function buildProjectManifest(state: ProjectState, nowIso: string, adapter: { id: string; version: string }): ConnectorManifest {
  const items: ManifestItem[] = [];
  const p = state.project;
  items.push({ kind: "project", id: p.id, name: p.name, revision: p.revision });
  for (const pr of Object.values(state.productions)) items.push({ kind: "production", id: pr.id, parentId: p.id, name: pr.name, revision: pr.revision });
  for (const s of Object.values(state.scenes)) items.push({ kind: "scene", id: s.id, parentId: p.id, revision: s.revision });
  for (const o of Object.values(state.occurrences)) items.push({ kind: "occurrence", id: o.id, parentId: o.productionId, revision: o.revision, sceneId: o.sceneId, active: o.active });
  for (const c of Object.values(state.compositions)) {
    if (c.removed || c.kind !== "storyboard") continue;
    const scriptRefs = Object.values(state.panelBlocks).filter(l => (l as { panelId?: string }).panelId === c.id).map(l => String((l as { blockId?: string }).blockId ?? "")).filter(Boolean);
    items.push({ kind: "panel", id: c.id, parentId: c.occurrenceId ?? c.variantId, name: c.name, revision: c.revision, durationFrames: c.durationFrames, timecode: framesToTimecode(c.durationFrames, p.fps), scriptRefs });
  }
  for (const a of Object.values(state.assets)) {
    if (a.removed) continue;
    items.push({ kind: "asset", id: a.id, parentId: p.id, name: a.name, revision: a.revision });
  }
  for (const v of Object.values(state.assetVersions)) {
    if (v.removed) continue;
    const variant = state.assetVariants[v.variantId];
    items.push({
      kind: "version", id: v.id, parentId: variant?.assetId ?? v.variantId, revision: v.revision, variantId: v.variantId, number: v.number,
      approved: variant?.approvedVersionId === v.id,
      files: [{ path: v.mediaPath, sha256: v.sha256, byteSize: v.byteSize, mimeType: v.mimeType }],
      ...(v.note ? { notes: [v.note.slice(0, 10_000)] } : {}),
    });
  }
  return {
    manifestVersion: MANIFEST_VERSION, createdAt: nowIso, projectId: p.id,
    frameRate: { num: p.fps.num, den: p.fps.den }, sampleRate: DEFAULT_SAMPLE_RATE,
    sourceApp: { name: "From Pen to Glass", version: "1" }, adapter, items,
  };
}
