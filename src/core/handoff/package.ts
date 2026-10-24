/**
 * C-1: builds the outgoing package for «Send to …»: the file (with embedded marker), a Manifest v1 for the
 * target (revision base for conflict checks) and a README with the return link. Pure; the browser renders
 * pixels/audio and passes them in.
 */
import type { ProjectState } from "../model";
import { MANIFEST_VERSION, canonicalJson, framesToTimecode, validateManifest, type ConnectorManifest, type ManifestItem } from "../connectors/manifest";
import { DEFAULT_SAMPLE_RATE } from "../connectors/build";
import { storedZip, utf8 } from "./bytes";
import { handoffMarker, xmpPacket } from "./marker";
import { encodePng } from "./png";
import { writePsd, type PsdLayer } from "./psd";
import { encodeBwf, type BwfMeta } from "./wav";
import { FORMAT_FACTS, adapterFor, type HandoffFormat, type HandoffTarget } from "./formats";

export interface HandoffTargetRef {
  readonly kind: HandoffTarget;
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  /** Version the receiver starts from (asset/clip), for the C-0 conflict check. */
  readonly baseVersionId: string | null;
  readonly sceneId: string | null;
}

export function handoffManifest(state: ProjectState, target: HandoffTargetRef, format: HandoffFormat, handoffId: string, nowIso: string, file: { path: string; sha256: string; byteSize: number }): ConnectorManifest {
  const p = state.project;
  const items: ManifestItem[] = [{ kind: "project", id: p.id, name: p.name, revision: p.revision }];
  if (target.sceneId && state.scenes[target.sceneId as never]) items.push({ kind: "scene", id: target.sceneId, parentId: p.id, revision: state.scenes[target.sceneId as never]!.revision });
  const kind: ManifestItem["kind"] = target.kind === "panel" ? "panel" : target.kind === "scene" ? "occurrence" : target.kind === "clip" ? "asset" : "asset";
  const baseEntity = target.kind === "panel" ? "panel" : target.kind === "clip" ? "clip" : "asset_version";
  const baseId = target.baseVersionId && baseEntity === "asset_version" ? target.baseVersionId : target.id;
  items.push({
    kind, id: target.id, name: target.name, revision: target.revision,
    base: { entity: baseEntity, id: baseId, revision: target.revision },
    files: [{ ...file, mimeType: FORMAT_FACTS[format].mimeType }],
    handoff: handoffMarker(handoffId), targetKind: target.kind,
  });
  const m: ConnectorManifest = {
    manifestVersion: MANIFEST_VERSION, createdAt: nowIso, projectId: p.id,
    frameRate: { num: p.fps.num, den: p.fps.den }, sampleRate: DEFAULT_SAMPLE_RATE,
    sourceApp: { name: "From Pen to Glass", version: "1" }, adapter: { id: adapterFor(format).id, version: "1" }, items,
  };
  const v = validateManifest(m);
  if (!v.ok) throw new Error("manifest");
  return m;
}

export const psdForHandoff = (width: number, height: number, layers: readonly PsdLayer[], handoffId: string): Uint8Array =>
  writePsd({ width, height, layers, xmp: xmpPacket(handoffId) });
export const pngForHandoff = (width: number, height: number, rgba: Uint8Array, handoffId: string): Uint8Array =>
  encodePng(width, height, rgba, { "ptg:handoff": handoffMarker(handoffId), Software: "From Pen to Glass" });
export function svgForHandoff(svg: string, handoffId: string): string {
  const meta = `<metadata><ptg:handoff xmlns:ptg="urn:ptg:handoff:1.0">${handoffMarker(handoffId)}</ptg:handoff></metadata>`;
  if (!/<svg[\s>]/.test(svg)) throw new Error("svg");
  return svg.replace(/<svg([^>]*)>/, (m) => m + meta);
}
export function wavForHandoff(channels: readonly Float32Array[], sampleRate: number, meta: Omit<BwfMeta, "description" | "handoff" | "originator">, handoffId: string): Uint8Array {
  return encodeBwf(channels, sampleRate, { ...meta, description: handoffMarker(handoffId), originator: "From Pen to Glass", handoff: handoffMarker(handoffId) });
}
/** Adds the marker to OTIO JSON (top-level metadata), keeping everything else. */
export function otioForHandoff(otioJson: string, handoffId: string, sceneId: string | null): string {
  const doc = JSON.parse(otioJson) as { metadata?: Record<string, unknown> };
  doc.metadata = { ...(doc.metadata ?? {}), ptg: { ...((doc.metadata?.["ptg"] as object) ?? {}), handoff: handoffMarker(handoffId), sceneId } };
  return JSON.stringify(doc, null, 2);
}
export function startTimecode(frames: number, fps: { num: number; den: number }): string { return framesToTimecode(frames, fps); }

/** Safe ASCII file name from a user-visible name; the name is never used for recognition. */
export function handoffFileName(name: string, format: HandoffFormat): string {
  const base = name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "ptg";
  return `${base}.${FORMAT_FACTS[format].extension}`;
}
export function handoffZip(o: { file: { name: string; data: Uint8Array }; manifest: ConnectorManifest; readme: string }): Uint8Array {
  return storedZip([
    { path: o.file.name, data: o.file.data },
    { path: "manifest.json", data: utf8(canonicalJson(o.manifest)) },
    { path: "README.txt", data: utf8(o.readme) },
  ]);
}
