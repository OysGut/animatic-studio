/**
 * C-1 browser adapter: renders pixels/audio for «Send to …» and passes them to the pure core writers.
 * Panel layers render one at a time through the shared compositor (renderFrame + drawFrame), so the PSD
 * layers match what the storyboard shows. Nothing is written to the project here.
 */
import type { AudioClip, Composition, ProjectState } from "@/core";
import { renderFrame } from "@/core/composition/render";
import { framesToTimecode } from "@/core/connectors";
import {
  buildInterchange,
} from "@/core/interchange";
import { editorialOtio } from "@/core/interchange/editorial";
import { otioForHandoff, pngForHandoff, psdForHandoff, svgForHandoff, utf8, wavForHandoff, type HandoffFormat, type PsdLayer } from "@/core/handoff";
import { drawFrame, type ImageSource } from "@/engine/compositor/canvas";
import { createSignedUrls } from "@/adapters/browser/storage-files";
import { t } from "@/core/i18n/keyed";

const fail = () => new Error(t("c1.build-failed"));

async function loadImages(paths: readonly string[]): Promise<Map<string, ImageSource>> {
  const list = [...new Set(paths)];
  const urls = Object.fromEntries((await createSignedUrls("assets", list, 600)).map((r) => [r.path, r.signedUrl]));
  const images = new Map<string, ImageSource>();
  await Promise.all(list.map(async (p) => { const u = urls[p]; if (!u) throw fail(); const r = await fetch(u); if (!r.ok) throw fail(); images.set(p, await createImageBitmap(await r.blob())); }));
  return images;
}
const close = (m: Map<string, ImageSource>) => { for (const i of m.values()) if ("close" in i) (i as ImageBitmap).close(); };
function canvas(w: number, h: number) { const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d", { willReadFrequently: true }); if (!ctx) throw fail(); return { c, ctx }; }
const rgbaOf = (ctx: CanvasRenderingContext2D, w: number, h: number) => new Uint8Array(ctx.getImageData(0, 0, w, h).data.buffer.slice(0));

/** One PSD layer per panel layer (bottom first), each rendered alone at full opacity; visibility/opacity kept as PSD fields. */
export async function panelLayers(state: ProjectState, panel: Composition): Promise<{ width: number; height: number; layers: PsdLayer[]; svgLayers: { name: string; visible: boolean; opacity: number; png: Uint8Array }[] }> {
  const W = panel.width, H = panel.height;
  const layers = Object.values(state.layers).filter((l) => l.compositionId === panel.id && !l.removed && l.kind !== "group" && l.kind !== "page").sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1));
  const paths: string[] = [];
  for (const l of layers) { const f = renderFrame(state, panel.id, 0, { includeHidden: true, onlyLayers: new Set([l.id]) }); for (const it of f.items) if (it.version) paths.push(it.version.mediaPath); }
  const images = await loadImages(paths);
  try {
    const out: PsdLayer[] = [], svg: { name: string; visible: boolean; opacity: number; png: Uint8Array }[] = [];
    for (const l of layers) {
      const solo: ProjectState = { ...state, layers: { ...state.layers, [l.id]: { ...l, visible: true, transform: { ...l.transform, opacity: 1 } } } };
      const { ctx } = canvas(W, H);
      drawFrame(ctx, renderFrame(solo, panel.id, 0, { onlyLayers: new Set([l.id]) }), { images, background: "transparent", placeholders: false, view: [1, 0, 0, 1, W / 2, H / 2] });
      const rgba = rgbaOf(ctx, W, H);
      const name = l.name || state.assets[l.assetId as never]?.name || l.kind;
      out.push({ name, visible: l.visible, opacity: l.transform.opacity, left: 0, top: 0, width: W, height: H, rgba });
      svg.push({ name, visible: l.visible, opacity: l.transform.opacity, png: pngForHandoff(W, H, rgba, "00000000-0000-4000-8000-000000000000") });
    }
    return { width: W, height: H, layers: out, svgLayers: svg };
  } finally { close(images); }
}

export async function assetImageLayer(path: string, name: string): Promise<{ width: number; height: number; layers: PsdLayer[] }> {
  const images = await loadImages([path]);
  try {
    const img = images.get(path) as ImageBitmap; const { ctx } = canvas(img.width, img.height); ctx.drawImage(img, 0, 0);
    return { width: img.width, height: img.height, layers: [{ name, visible: true, opacity: 1, left: 0, top: 0, width: img.width, height: img.height, rgba: rgbaOf(ctx, img.width, img.height) }] };
  } finally { close(images); }
}

function svgDoc(w: number, h: number, layers: readonly { name: string; visible: boolean; opacity: number; png: Uint8Array }[]): string {
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  const b64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(s); };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    layers.map((l) => `<g id="${esc(l.name)}" inkscape:label="${esc(l.name)}" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" inkscape:groupmode="layer" opacity="${l.opacity}"${l.visible ? "" : ' style="display:none"'}><image width="${w}" height="${h}" href="data:image/png;base64,${b64(l.png)}"/></g>`).join("") + `</svg>`;
}

export async function buildImageFile(format: HandoffFormat, handoffId: string, src: { width: number; height: number; layers: PsdLayer[] }): Promise<Uint8Array> {
  const { flattenLayers } = await import("@/core/handoff");
  if (format === "psd") return psdForHandoff(src.width, src.height, src.layers, handoffId);
  if (format === "png") return pngForHandoff(src.width, src.height, flattenLayers(src.width, src.height, src.layers), handoffId);
  if (format === "svg") return utf8(svgForHandoff(svgDoc(src.width, src.height, src.layers.map((l) => ({ name: l.name, visible: l.visible, opacity: l.opacity, png: pngForHandoff(l.width, l.height, l.rgba, handoffId) }))), handoffId));
  throw fail();
}

export async function buildClipWav(state: ProjectState, clip: AudioClip, handoffId: string): Promise<Uint8Array> {
  const variant = clip.assetVariantId ? state.assetVariants[clip.assetVariantId] : Object.values(state.assetVariants).find((v) => v.assetId === clip.assetId && !v.removed);
  const version = clip.versionId ? state.assetVersions[clip.versionId] : variant?.approvedVersionId ? state.assetVersions[variant.approvedVersionId] : undefined;
  if (!version) throw fail();
  const urls = await createSignedUrls("assets", [version.mediaPath], 600); const u = urls[0]?.signedUrl; if (!u) throw fail();
  const buf = await (await fetch(u)).arrayBuffer();
  const ac = new OfflineAudioContext(1, 1, 48000);
  const audio = await ac.decodeAudioData(buf);
  const sr = audio.sampleRate, from = Math.floor((clip.sourceInMs / 1000) * sr), len = Math.max(1, Math.min(audio.length - from, Math.round((clip.lengthMs / 1000) * sr)));
  const chans = Array.from({ length: Math.min(2, audio.numberOfChannels) }, (_, c) => audio.getChannelData(c).slice(from, from + len));
  const occ = state.occurrences[clip.occurrenceId];
  const fps = state.project.fps;
  const startFrames = Math.round((clip.offsetMs / 1000) * (fps.num / fps.den));
  return wavForHandoff(chans, sr, { originatorReference: clip.id.slice(0, 32), timeReference: Math.round((clip.offsetMs / 1000) * sr), scene: occ ? String(occ.sceneId) : "", assetId: clip.assetId, clipId: clip.id, timecode: framesToTimecode(startFrames, fps), frameRate: fps }, handoffId);
}

export function buildSceneOtio(state: ProjectState, productionId: string, occurrenceId: string, sceneId: string, language: string, handoffId: string): Uint8Array {
  const doc = buildInterchange(state, { productionId, language, occurrenceIds: [occurrenceId] });
  return utf8(otioForHandoff(editorialOtio(doc), handoffId, sceneId));
}
