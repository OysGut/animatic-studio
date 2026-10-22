/**
 * PTG3 (B-102 §4, PTG-F1): After Effects-pakke – `bygg.jsx` (ES3) pluss mediene skuddene bruker.
 * Scriptet bygger én komp per skudd og en hovedkomp i After Effects. Eksportøren regner ikke ut
 * tid, kamera eller navn selv; alt leses fra InterchangeDoc. Virker uten AI.
 */
import type { InterchangeDoc } from "@/core/interchange";
import { buildAeJsx, type AeCameraMode, type AeTitleCards } from "@/core/interchange/ae-jsx";
import { ptgImportUrl, qrMatrixToPng } from "@/core/interchange/titlecard";
import type { Shot } from "@/core/interchange/types";
import { cameraReadmeLines, interchangeReadme } from "@/core/interchange/readme";
import { writeZip, type ZipSink, type ZipProgress } from "./zip";
import { t } from "@/core/i18n/keyed";

/** PTG3b: QR-bildet (PNG) for en ikke-hemmelig importlenke. */
export async function qrPng(text: string): Promise<Uint8Array> {
  const qr = await import("qrcode");
  const q = qr.create(text, { errorCorrectionLevel: "M" });
  const n = q.modules.size;
  const m = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => !!q.modules.get(y, x)));
  return qrMatrixToPng(m, 10, 4);
}

const qrPathOf = (s: Shot): string => `tittelkort/${s.name}_qr.png`;

/** Tittelkortets tekster på grensesnittspråket (B-115). */
export function aeTitleCards(doc: InterchangeDoc): AeTitleCards {
  return {
    filmTitle: doc.project.name,
    explain: t("ptg3b.card-explain"),
    footer: t("ptg3b.card-footer"),
    // Scenenavn = sceneoverskriften (som skuddlistens beskrivelse), med SC-nummer og skuddnavn fra PTG1
    sceneLine: (s) => [/_(SC\d{3}[A-Z]?)_/.exec(s.name)?.[1] ?? "", s.description, s.name].filter(Boolean).join(" · "),
    qrPath: qrPathOf,
  };
}

export async function exportAePackage(o: {
  doc: InterchangeDoc; cameraMode: AeCameraMode; sink: ZipSink;
  /** PTG3b: tittelkort med QR (standard på). `origin` er appens adresse for importlenken. */
  titleCard?: { readonly origin: string } | null;
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
  const tc = o.titleCard ? aeTitleCards(doc) : null;
  const jsx = buildAeJsx(doc, { cameraMode: o.cameraMode, titleCards: tc });
  const origin = o.titleCard?.origin ?? "";
  async function* files() {
    yield { path: "bygg.jsx", data: new TextEncoder().encode(jsx) };
    if (tc) for (const s of doc.shots) {
      yield { path: qrPathOf(s), data: await qrPng(ptgImportUrl(origin, { projectId: doc.project.id, occurrenceId: s.id, name: s.name, lengthFrames: s.lengthFrames })) };
    }
    yield {
      path: "LESMEG.txt",
      data: interchangeReadme([
        "",
        t("ptg3.readme-ae", {}, "nb"),
        "",
        t("ptg3.readme-ae", {}, "en"),
        ...(tc ? ["", t("ptg3b.readme-titlecard", {}, "nb"), "", t("ptg3b.readme-titlecard", {}, "en")] : []),
        ...cameraReadmeLines(doc),
      ].join("\n")),
    };
  }
  return writeZip(o.sink, entries, o.urls, { extra: files(), signal, ...(o.onProgress ? { onProgress: o.onProgress } : {}) });
}
