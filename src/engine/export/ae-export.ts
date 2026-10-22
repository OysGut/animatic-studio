/**
 * PTG3 (B-102 §4, PTG-F1): After Effects-pakke – `bygg.jsx` (ES3) pluss mediene skuddene bruker.
 * Scriptet bygger én komp per skudd og en hovedkomp i After Effects. Eksportøren regner ikke ut
 * tid, kamera eller navn selv; alt leses fra InterchangeDoc. Virker uten AI.
 */
import type { InterchangeDoc } from "@/core/interchange";
import { buildAeJsx, type AeCameraMode } from "@/core/interchange/ae-jsx";
import { interchangeReadme } from "@/core/interchange/readme";
import { writeZip, type ZipSink, type ZipProgress } from "./zip";
import { t } from "@/core/i18n/keyed";

export async function exportAePackage(o: {
  doc: InterchangeDoc; cameraMode: AeCameraMode; sink: ZipSink;
  urls: Readonly<Record<string, string>>; signal: AbortSignal;
  onProgress?: (p: ZipProgress) => void;
}): Promise<{ missing: string[] }> {
  const { doc, signal } = o;
  const used = new Set<string>();
  for (const s of doc.shots) {
    for (const l of s.layers) { if (l.fileId) used.add(l.fileId); for (const w of l.swaps) if (w.fileId) used.add(w.fileId); }
    for (const a of s.audio) if (a.fileId) used.add(a.fileId);
  }
  const entries = doc.references.filter(r => used.has(r.id)).map(r => ({ path: r.path, mediaPath: r.mediaPath, byteSize: r.byteSize }));
  const jsx = buildAeJsx(doc, { cameraMode: o.cameraMode });
  const missingRig = doc.shots.filter(s => !s.camera).map(s => s.name);
  async function* files() {
    yield { path: "bygg.jsx", data: new TextEncoder().encode(jsx) };
    yield {
      path: "LESMEG.txt",
      data: interchangeReadme([
        "",
        t("ptg3.readme-ae", {}, "nb"),
        "",
        t("ptg3.readme-ae", {}, "en"),
        ...(missingRig.length ? ["", t("ptg3.readme-no-rig", { value1: missingRig.join(", ") }, "nb"), t("ptg3.readme-no-rig", { value1: missingRig.join(", ") }, "en")] : []),
      ].join("\n")),
    };
  }
  return writeZip(o.sink, entries, o.urls, { extra: files(), signal, ...(o.onProgress ? { onProgress: o.onProgress } : {}) });
}
