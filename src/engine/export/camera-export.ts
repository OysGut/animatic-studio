/**
 * PTG3 (B-102 §4): kamerapakke med én FBX ASCII 7.4-fil per skudd som har en rigg. Eksportøren
 * regner ingenting ut selv – kamerasporet kommer fra InterchangeDoc. Merkes «eksperimentell»
 * (spesifikasjonen §10) i LESMEG. Virker uten AI.
 */
import type { InterchangeDoc } from "@/core/interchange";
import { readmeLanguage } from "@/core/interchange/readme";
import { buildShotFbx } from "@/core/interchange/fbx";
import { cameraReadmeLines, interchangeReadme } from "@/core/interchange/readme";
import { writeZip, type ZipSink } from "./zip";
import { t } from "@/core/i18n/keyed";

export async function exportCameraFbx(o: { doc: InterchangeDoc; sink: ZipSink; signal: AbortSignal }): Promise<void> {
  const { doc, signal } = o;
  async function* files() {
    for (const shot of doc.shots) {
      if (signal.aborted) throw new DOMException(t("ptg1.cancelled"), "AbortError");
      const fbx = buildShotFbx(shot, doc.fps);
      if (!fbx) continue;
      yield { path: `camera/${shot.name}.fbx`, data: new TextEncoder().encode(fbx) };
    }
    yield {
      path: "LESMEG.txt",
      data: interchangeReadme([
        "",
        t("ptg3.readme-camera", {}, readmeLanguage()),
        "",
        t("ptg3.readme-camera", {}, "en"),
        "",
        t("ptg3.readme-fbx-binary", {}, readmeLanguage()),
        "",
        t("ptg3.readme-fbx-binary", {}, "en"),
        ...cameraReadmeLines(doc),
      ].join("\n")),
    };
  }
  await writeZip(o.sink, [], {}, { extra: files(), signal });
}
