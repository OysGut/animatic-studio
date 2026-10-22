/** PTG6 browser rendering. Policy, paths, timing and serializers stay in core/interchange. */
import { editorialClip, editorialFiles, editorialFrames, editorialShots } from "@/core/interchange/editorial";
import { interchangeReadme } from "@/core/interchange/readme";
import { t } from "@/core/i18n/keyed";
import { exportAnimatic } from "./animatic";
import { shotStems, type DragonframeOptions } from "./dragonframe";
import { writeZip } from "./zip";

export type EditorialOptions = Omit<DragonframeOptions, "png" | "burnIn"> & { readonly includeMedia: boolean };
export async function exportEditorial(o: EditorialOptions): Promise<void> {
  const shots = editorialShots(o.doc);
  async function* files() {
    yield { path: "LESMEG.txt", data: interchangeReadme([t("ptg6.readme", {}, "nb"), t("ptg6.readme", {}, "en"),
      t("ptg6.reel-table", {}, "nb"), t("ptg6.reel-table", {}, "en"), ...shots.map(s => `${s.reel}\t${s.shot.name}\t${s.video}`),
      t("ptg6.audio-table", {}, "nb"), t("ptg6.audio-table", {}, "en"), ...shots.map(s => `${s.shot.name}\t${s.audio}`),
      o.includeMedia ? t("ptg6.media-included", {}, "nb") : t("ptg6.media-linked", {}, "nb"),
      o.includeMedia ? t("ptg6.media-included", {}, "en") : t("ptg6.media-linked", {}, "en")].join("\n\n")) };
    for (const f of editorialFiles(o.doc)) yield f;
    let done = 0;
    if (o.includeMedia) for (const s of shots) {
      if (o.signal.aborted) throw new DOMException(t("ptg1.cancelled"), "AbortError");
      const frames = editorialFrames(o.doc, s.shot);
      const clips = editorialClip(o.clips, s.shot);
      const video = await exportAnimatic({ state: o.state, clips, frames, startFrame: 0, endFrame: frames.length,
        width: o.doc.frameSize.width, height: o.doc.frameSize.height, fps: o.doc.fps, images: o.images,
        filmUrls: o.filmUrls, mp4: true, signal: o.signal });
      yield { path: s.video, data: video.bytes };
      // Continuous per-shot MIX is already gain/fade/language correct. No second audio dissolve.
      for (const stem of await shotStems(o.doc, s.shot, [{ key: "mix", suffix: "MIX", items: o.audio.items.filter(it => !it.clip.muted) }], o.audio.bank)) yield { path: s.audio, data: stem.data };
      o.onProgress?.(++done, shots.length);
    }
  }
  await writeZip(o.sink, [], {}, { extra: files(), signal: o.signal });
}