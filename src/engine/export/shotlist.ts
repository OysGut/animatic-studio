import { storyboardShotRows, type ProjectState, type FilmClip } from "@/core";
import type { InterchangeDoc } from "@/core/interchange";
import { shotlistCsv, shotlistJson, type ShotlistProfile } from "@/core/interchange/shotlist";
import { interchangeReadme } from "@/core/interchange/readme";
import { drawFilmFrame } from "../compositor/film";
import type { ImageSource } from "../compositor/canvas";
import { fontsReady } from "../typography/fonts";
import { FilmVideoFrames } from "./film-video";
import { writeZip, type ZipSink } from "./zip";
import { t } from "@/core/i18n/keyed";

/** The exporter only renders/packs: names, time and paths come from InterchangeDoc. */
export async function exportShotlist(o: {
  doc: InterchangeDoc; state: ProjectState; clips: readonly FilmClip[]; profile: ShotlistProfile;
  sink: ZipSink; images: ReadonlyMap<string, ImageSource>; filmUrls: Readonly<Record<string, string>>;
  signal: AbortSignal; onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  const { doc, signal } = o;
  const width = 320;
  const height = Math.max(1, Math.round(width * o.state.project.frameHeight / o.state.project.frameWidth));
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(t("ptg1.export-failed"));
  const ctx: CanvasRenderingContext2D = context;
  await fontsReady(doc.shots.flatMap(s => s.layers.flatMap(l => l.source.text ? [l.source.text] : [])));
  const video = new FilmVideoFrames(await import("mediabunny"), o.filmUrls);
  async function* files() {
    const panels = storyboardShotRows(o.state, doc.production.id);
    if (panels.length) yield {path:"storyboard.json",data:new TextEncoder().encode(JSON.stringify(panels,null,2))};
    yield { path: "shotlist.csv", data: shotlistCsv(doc, o.profile,panels) };
    yield { path: "shotlist.json", data: shotlistJson(doc, o.profile,panels) };
    yield { path: "interchange.json", data: new TextEncoder().encode(JSON.stringify(doc, null, 2)) };
    yield { path: "LESMEG.txt", data: interchangeReadme() };
    let done = 0;
    for (const shot of doc.shots) {
      if (signal.aborted) throw new DOMException(t("ptg1.cancelled"), "AbortError");
      const c = o.clips.find(c => c.occurrenceId === shot.id);
      if (!c) throw new Error(t("ptg1.export-failed"));
      // A standalone shot frame prevents a thumbnail blending with its neighbour.
      const solo = { ...c, startFrame: 0, transition: { kind: "cut" as const, frames: 0 }, overlapFrames: 0 };
      await video.prepare(o.state, [solo], shot.thumbnail.sourceFrame);
      drawFilmFrame(ctx, o.state, [solo], shot.thumbnail.sourceFrame, { width, height, images: o.images, video: video.provider, placeholders: true });
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error(t("ptg1.export-failed"));
      yield { path: shot.thumbnail.path, data: new Uint8Array(await blob.arrayBuffer()) };
      o.onProgress?.(++done, doc.shots.length);
    }
  }
  try { await writeZip(o.sink, [], {}, { extra: files(), signal }); }
  finally { await video.close(); canvas.width = 0; canvas.height = 0; }
}