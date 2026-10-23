/**
 * PTG3 (B-102 §4, PTG-F1): After Effects-pakke – `bygg-after-effects.jsx` (ES3) pluss mediene skuddene bruker.
 * Scriptet bygger én komp per skudd og en hovedkomp i After Effects. Eksportøren regner ikke ut
 * tid, kamera eller navn selv; alt leses fra InterchangeDoc. Virker uten AI.
 */
import type { InterchangeDoc } from "@/core/interchange";
import { aeProjectFileName, buildAeJsx, type AeCameraMode, type AeJsxMessages, type AeTitleCards } from "@/core/interchange/ae-jsx";
import { AE_JSX_FILE, AE_LAUNCHER_MAC, AE_LAUNCHER_MAC_MODE, AE_LAUNCHER_WINDOWS, aeMacLauncher, aeWindowsLauncher } from "@/core/interchange/ae-launchers";
import { ptgImportUrl, qrMatrixToPng } from "@/core/interchange/titlecard";
import type { Shot } from "@/core/interchange/types";
import { cameraReadmeLines, interchangeReadme } from "@/core/interchange/readme";
import { writeZip, type ZipSink, type ZipProgress } from "./zip";
import { assertAeSafePaths, planPackageMedia } from "@/core/interchange/media-formats";
import { convertedMediaFiles, type MediaConverter } from "./media-convert";
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

/** Varslene i bygg-after-effects.jsx på norsk og engelsk (skriptet kjøres utenfor appen). */
export function aeJsxMessages(): AeJsxMessages {
  return {
    missing: `${t("ptg3.ae-missing", {}, "nb")}\n${t("ptg3.ae-missing", {}, "en")}`,
    wrongHost: `${t("ptg3.ae-wrong-host", {}, "nb")}\n\n${t("ptg3.ae-wrong-host", {}, "en")}`,
    saveFailed: `${t("ptg3.ae-save-failed", {}, "nb")}\n\n${t("ptg3.ae-save-failed", {}, "en")}`,
    importFailed: `${t("ptg3.ae-import-failed", {}, "nb")}\n${t("ptg3.ae-import-failed", {}, "en")}`,
  };
}

export async function exportAePackage(o: {
  doc: InterchangeDoc; cameraMode: AeCameraMode; sink: ZipSink;
  /** PTG3b: tittelkort med QR (standard på). `origin` er appens adresse for importlenken. */
  titleCard?: { readonly origin: string } | null;
  urls: Readonly<Record<string, string>>; signal: AbortSignal;
  onProgress?: (p: ZipProgress) => void;
  /** Bare for tester; standard er nettleserens dekoder. */
  converter?: MediaConverter;
}): Promise<{ missing: string[] }> {
  const { signal } = o;
  // Medier AE ikke tåler (WebM, Opus, WebP …) konverteres; skriptet peker på de konverterte filene
  const plan = planPackageMedia(o.doc, { audio: true });
  const doc = plan.doc;
  assertAeSafePaths([...plan.keep.map(r => r.path), ...plan.convert.map(c => c.path)]);
  const entries = plan.keep.map(r => ({ path: r.path, mediaPath: r.mediaPath, byteSize: r.byteSize }));
  const failed: string[] = [];
  const tc = o.titleCard ? aeTitleCards(doc) : null;
  const jsx = buildAeJsx(doc, { cameraMode: o.cameraMode, titleCards: tc, messages: aeJsxMessages() });
  const notFound = [t("ptg3.ae-not-found", {}, "nb"), t("ptg3.ae-not-found", {}, "en")];
  const enc = new TextEncoder();
  const origin = o.titleCard?.origin ?? "";
  async function* files() {
    // Startfilene er hovedveien og ligger først i ZIP-en
    yield { path: AE_LAUNCHER_MAC, data: enc.encode(aeMacLauncher(notFound)), unixMode: AE_LAUNCHER_MAC_MODE };
    yield { path: AE_LAUNCHER_WINDOWS, data: enc.encode(aeWindowsLauncher(notFound)) };
    yield { path: AE_JSX_FILE, data: enc.encode(jsx) };
    if (tc) for (const s of doc.shots) {
      yield { path: qrPathOf(s), data: await qrPng(ptgImportUrl(origin, { projectId: doc.project.id, occurrenceId: s.id, name: s.name, lengthFrames: s.lengthFrames })) };
    }
    yield {
      path: "LESMEG.txt",
      data: interchangeReadme([
        "",
        t("ptg3.readme-ae", {}, "nb"),
        "",
        t("ptg3.readme-ae-open", { value1: aeProjectFileName(doc) }, "nb"),
        "",
        t("ptg3.readme-ae-other-app", {}, "nb"),
        "",
        t("ptg3.readme-ae", {}, "en"),
        "",
        t("ptg3.readme-ae-open", { value1: aeProjectFileName(doc) }, "en"),
        "",
        t("ptg3.readme-ae-other-app", {}, "en"),
        ...(tc ? ["", t("ptg3b.readme-titlecard", {}, "nb"), "", t("ptg3b.readme-titlecard", {}, "en")] : []),
        ...cameraReadmeLines(doc),
      ].join("\n")),
    };
    yield* convertedMediaFiles({ convert: plan.convert, urls: o.urls, fps: doc.fps, signal, failed, ...(o.converter ? { converter: o.converter } : {}) });
  }
  const r = await writeZip(o.sink, entries, o.urls, { extra: files(), signal, ...(o.onProgress ? { onProgress: o.onProgress } : {}) });
  return { missing: [...failed, ...r.missing] };
}
