/**
 * PTG2 (B-102, PTG-B1–B4/B6): «Send til Dragonframe». Pakker én mappe per skudd med referansefilm
 * (MP4 H.264 i opptakets bildefrekvens, valgfritt PNG-sekvens), lydstemmer (WAV 48 kHz 24 bit, like
 * lange som skuddet med håndtak), X-sheet (CSV + PDF A4/Letter) og FBX-kameraet der skuddet har rigg.
 * Eksportøren regner ikke ut tid selv: alt kommer fra InterchangeDoc og core/interchange/dragonframe.
 * Virker uten AI. Bare på klienten.
 */
import { jsPDF } from "jspdf";
import type { FilmAudioItem, FilmClip, ProjectState } from "@/core";
import type { InterchangeDoc, Shot } from "@/core/interchange";
import { buildShotFbx } from "@/core/interchange/fbx";
import { cameraReadmeLines, interchangeReadme } from "@/core/interchange/readme";
import {
  buildXsheets, dragonframePaths, pdfScriptOf, pdfScriptsNeeded, pngExposureIndices, referenceFrames, shotSamples, shotWindow, stemGroups, wav24, xsheetCsv,
  xsheetLayout, XSHEET_ROW_MM, type PdfScript, type XsheetPaper, type XsheetRow,
} from "@/core/interchange/dragonframe";
import { formatTimecode, framesToSeconds } from "@/core/time";
import { type AudioBank, renderAudio } from "../audio/mixer";
import type { ImageSource } from "../compositor/canvas";
import { exportAnimatic } from "./animatic";
import { writeZip, type ZipSink } from "./zip";
import { t } from "@/core/i18n/keyed";

export interface DragonframeOptions {
  readonly doc: InterchangeDoc;
  readonly state: ProjectState;
  readonly clips: readonly FilmClip[];
  readonly images: ReadonlyMap<string, ImageSource>;
  readonly filmUrls: Readonly<Record<string, string>>;
  readonly audio: { readonly items: readonly FilmAudioItem[]; readonly bank: AudioBank };
  readonly png: boolean;
  readonly burnIn: boolean;
  readonly sink: ZipSink;
  readonly signal: AbortSignal;
  readonly onProgress?: (done: number, total: number) => void;
}

const SAMPLE_RATE = 48000;

export function xsheetHeaders(lang?: string): string[] {
  return [t("ptg2.col-frame", {}, lang), t("ptg2.col-shot-frame", {}, lang), t("ptg2.col-timecode", {}, lang),
    t("ptg2.col-character", {}, lang), t("ptg2.col-dialogue", {}, lang), t("ptg2.col-mouth", {}, lang),
    t("ptg2.col-action", {}, lang), t("ptg2.col-layers", {}, lang), t("ptg2.col-notes", {}, lang)];
}

/** Innebygde PDF-fonter (base64 TTF). jsPDF bygger bare inn glyfene som brukes (delsett). */
export type PdfFonts = Partial<Record<PdfScript, string>>;
const PDF_FONT_FILES: Record<PdfScript, string> = {
  latin: "/fonts/pdf/NotoSans-Regular.ttf", jp: "/fonts/pdf/NotoSansJP.ttf", kr: "/fonts/pdf/NotoSansKR.ttf",
};
const fontCache = new Map<PdfScript, Promise<string>>();
function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
/** Laster bare fontene teksten trenger (CJK-fontene er store). */
export async function loadPdfFonts(scripts: readonly PdfScript[]): Promise<PdfFonts> {
  const out: PdfFonts = {};
  for (const s of scripts) {
    if (!fontCache.has(s)) fontCache.set(s, fetch(PDF_FONT_FILES[s]).then(async r => {
      if (!r.ok) throw new Error(t("ptg1.export-failed"));
      return toBase64(new Uint8Array(await r.arrayBuffer()));
    }));
    try { out[s] = await fontCache.get(s)!; } catch (e) { fontCache.delete(s); throw e; }
  }
  return out;
}

/** X-sheet som PDF med innebygd Noto Sans (latin/kyrillisk) og Noto Sans JP/KR der teksten krever det. */
export function xsheetPdf(shot: Shot, rows: readonly XsheetRow[], paper: XsheetPaper, title: string, fonts: PdfFonts = {}): Uint8Array {
  const L = xsheetLayout(paper, rows.length);
  const doc = new jsPDF({ unit: "mm", format: [L.width, L.height], orientation: "portrait", compress: true });
  const names: Partial<Record<PdfScript, string>> = {};
  for (const s of ["latin", "jp", "kr"] as const) {
    const data = fonts[s];
    if (!data) continue;
    const file = `ptg-${s}.ttf`;
    doc.addFileToVFS(file, data);
    doc.addFont(file, `PTG-${s}`, "normal");
    names[s] = `PTG-${s}`;
  }
  const useFont = (text: string) => {
    const name = names[pdfScriptOf(text)] ?? names.latin;
    if (name) doc.setFont(name, "normal");
  };
  const write = (text: string, x: number, y: number, opts?: { align: "right" }) => { useFont(text); doc.text(text, x, y, opts); };
  const fit = (text: string, width: number) => { useFont(text); return String(doc.splitTextToSize(text, width)[0] ?? ""); };
  const headers = xsheetHeaders();
  const cells = (r: XsheetRow) => [String(r.frame), String(r.shotFrame), r.timecode, r.character, r.dialogue, r.mouth, r.action, r.layers, r.notes];
  L.pages.forEach((page, p) => {
    if (p) doc.addPage([L.width, L.height], "portrait");
    doc.setTextColor(0); doc.setDrawColor(0); doc.setLineWidth(0.1);
    doc.setFontSize(10); write(`${title} · ${shot.name}`, L.margin, L.margin + 4);
    doc.setFontSize(7); write(t("ptg2.page", { value1: String(p + 1), value2: String(L.pages.length) }), L.width - L.margin, L.margin + 4, { align: "right" });
    const top = L.margin + L.header - XSHEET_ROW_MM;
    headers.forEach((h, i) => { const s = fit(h, L.columns[i]!.width - 1); if (s) write(s, L.columns[i]!.x + 0.5, top + 3.5); });
    doc.line(L.margin, top + XSHEET_ROW_MM, L.width - L.margin, top + XSHEET_ROW_MM);
    for (let i = page.from; i < page.to; i++) {
      const r = rows[i]!;
      const y = top + XSHEET_ROW_MM * (i - page.from + 1);
      if (r.shotFrame === 0) { doc.setLineWidth(0.5); doc.line(L.margin, y, L.width - L.margin, y); doc.setLineWidth(0.1); }
      cells(r).forEach((c, k) => {
        const line = fit(c, L.columns[k]!.width - 1);
        if (line) write(line, L.columns[k]!.x + 0.5, y + 3.5);
      });
      doc.line(L.margin, y + XSHEET_ROW_MM, L.width - L.margin, y + XSHEET_ROW_MM);
    }
    for (const c of L.columns) doc.line(c.x, top, c.x, top + XSHEET_ROW_MM * (page.to - page.from + 1));
    doc.line(L.width - L.margin, top, L.width - L.margin, top + XSHEET_ROW_MM * (page.to - page.from + 1));
  });
  return new Uint8Array(doc.output("arraybuffer"));
}

/** Lydstemmene for ett skudd, nøyaktig like lange som skuddets vindu. Volumpunkter og fade er bakt inn. */
export async function shotStems(doc: InterchangeDoc, shot: Shot, groups: ReturnType<typeof stemGroups>, bank: AudioBank): Promise<{ suffix: string; data: Uint8Array }[]> {
  const frames = shotSamples(doc, shot, SAMPLE_RATE);
  const from = framesToSeconds(shotWindow(shot).from, doc.fps);
  const seconds = frames / SAMPLE_RATE;
  const out: { suffix: string; data: Uint8Array }[] = [];
  for (const g of groups) {
    const buf = await renderAudio(g.items, bank, from, Math.max(seconds, 1 / SAMPLE_RATE), SAMPLE_RATE);
    const l = buf.getChannelData(0);
    const r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
    out.push({ suffix: g.suffix, data: wav24([l, r], SAMPLE_RATE, frames) });
  }
  return out;
}

async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error(t("ptg1.export-failed"));
  return new Uint8Array(await blob.arrayBuffer());
}

export async function exportDragonframe(o: DragonframeOptions): Promise<void> {
  const { doc, signal } = o;
  const xsheets = buildXsheets(o.state, doc, {
    layerStart: n => t("ptg2.layer-start", { value1: n }), layerEnd: n => t("ptg2.layer-end", { value1: n }),
  });
  const groups = stemGroups(o.audio.items, id => o.state.assets[id]?.name ?? id);
  const total = doc.shots.length;
  const texts: string[] = [doc.project.name, ...xsheetHeaders(), ...doc.shots.map(s => s.name)];
  for (const rows of xsheets.values()) for (const r of rows) texts.push(r.character, r.dialogue, r.action, r.layers, r.notes);
  const fonts = await loadPdfFonts(pdfScriptsNeeded(texts));
  async function* files() {
    yield {
      path: "LESMEG.txt",
      data: interchangeReadme(["", t("ptg2.readme", {}, "nb"), "", t("ptg2.readme", {}, "en"), ...cameraReadmeLines(doc)].join("\n")),
    };
    let done = 0;
    for (const shot of doc.shots) {
      if (signal.aborted) throw new DOMException(t("ptg1.cancelled"), "AbortError");
      const paths = dragonframePaths(shot);
      const frames = referenceFrames(doc, shot);
      const pngs: Uint8Array[] = [];
      // PNG: én fil per eksponering (stemmer med X-sheet-radene); videoen beholder alle bilder.
      const pngAt = new Set(pngExposureIndices(doc, shot));
      if (frames.length) {
        const w = shotWindow(shot);
        const video = await exportAnimatic({
          state: o.state, clips: o.clips, startFrame: 0, endFrame: frames.length, frames,
          width: doc.frameSize.width, height: doc.frameSize.height, fps: doc.fps, images: o.images,
          filmUrls: o.filmUrls, mp4: true, signal,
          ...(o.burnIn ? { overlay: (ctx: CanvasRenderingContext2D, i: number, width: number, height: number) => burnIn(ctx, shot, w.from + i, i, doc, width, height) } : {}),
          ...(o.png ? { onFrame: async (canvas: HTMLCanvasElement, i: number) => { if (pngAt.has(i)) pngs.push(await canvasPng(canvas)); } } : {}),
        });
        yield { path: paths.video, data: video.bytes };
        for (let i = 0; i < pngs.length; i++) yield { path: paths.png(i), data: pngs[i]! };
      }
      for (const s of await shotStems(doc, shot, groups, o.audio.bank)) yield { path: paths.audio(s.suffix), data: s.data };
      const rows = xsheets.get(shot.id) ?? [];
      yield { path: paths.xsheetCsv, data: xsheetCsv(rows, xsheetHeaders()) };
      for (const paper of ["a4", "letter"] as const) yield { path: paths.xsheetPdf(paper), data: xsheetPdf(shot, rows, paper, doc.project.name, fonts) };
      const fbx = buildShotFbx(shot, doc.fps);
      if (fbx) yield { path: paths.fbx, data: new TextEncoder().encode(fbx) };
      o.onProgress?.(++done, total);
    }
  }
  await writeZip(o.sink, [], {}, { extra: files(), signal });
}

/** Påskrift: skuddnavn, bildenummer og tidskode, og en plass til munnavn (PTG4). */
function burnIn(ctx: CanvasRenderingContext2D, shot: Shot, absolute: number, i: number, doc: InterchangeDoc, width: number, height: number) {
  const size = Math.max(12, Math.round(height / 30));
  const pad = Math.round(size / 2);
  const band = size + pad * 2;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, height - band, width, band);
  ctx.fillStyle = "#ffffff";
  ctx.font = `${size}px monospace`;
  ctx.textBaseline = "middle";
  const y = height - band / 2;
  ctx.textAlign = "left"; ctx.fillText(shot.name, pad, y);
  ctx.textAlign = "center"; ctx.fillText(`${t("ptg2.burn-frame")} ${i + 1}  ${formatTimecode(absolute, doc.fps)}`, width / 2, y);
  // Plass til munnavn (fylles i PTG4)
  ctx.textAlign = "right"; ctx.fillText(`${t("ptg2.burn-mouth")} –`, width - pad, y);
  ctx.restore();
}
