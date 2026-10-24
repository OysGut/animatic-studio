import type { ProjectState } from "@/core/model";
import type { FilmClip } from "@/core/assembly/film";
import { exportImageSource, type ExportImageSource } from "@/core/storyboard/playback";
import { printLayout, printTable, type PanelPrintRow, type PrintOptions } from "@/core/storyboard/print";
import { layerVersions, renderFrame } from "@/core/composition/render";
import { notoScriptsNeeded } from "@/core/typography/pdf-scripts";
import { isRtlText } from "@/core/language/direction";
import { loadNotoFonts, registerNotoFonts, drawRuns, runsWidth } from "./pdf-fonts";
import { drawFrame } from "../compositor/canvas";
import { drawFilmFrame } from "../compositor/film";
import { FilmVideoFrames } from "./film-video";
import { loadImages } from "./animatic";
import { fontsReady } from "../typography/fonts";
import { t } from "@/core/i18n/keyed";

export async function exportChunks<T>(items: readonly T[], signal: AbortSignal, work: (item: T, index: number) => Promise<void>, progress?: (done: number, total: number) => void) {
  for (let i = 0; i < items.length; i++) {
    if (signal.aborted) throw new DOMException(t("ptg1.cancelled"), "AbortError");
    await work(items[i] as T, i);
    progress?.(i + 1, items.length);
    // Yield every item, including cheap CSV rows; cancellation and input remain responsive.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  if (signal.aborted) throw new DOMException(t("ptg1.cancelled"), "AbortError");
}
export async function storyboardXlsx(table: ReturnType<typeof printTable>, signal: AbortSignal, progress?: (done: number, total: number) => void): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(t("sb6.shotlist"));
  sheet.addRow(table.header).font = { bold: true, name: "Arial" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns = table.header.map(() => ({ width: 24 }));
  await exportChunks(table.rows, signal, async row => {
    const added = sheet.addRow(row);
    added.font = { name: "Arial" }; added.alignment = { wrapText: true, vertical: "top" };
    row.forEach((v, i) => { if (typeof v === "number") added.getCell(i + 1).numFmt = Number.isInteger(v) ? "0" : "0.000"; });
  }, progress);
  const bytes = await book.xlsx.writeBuffer();
  if (signal.aborted) throw new DOMException(t("ptg1.cancelled"), "AbortError");
  return new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export interface PrintExportInput {
  state: ProjectState; clips: readonly FilmClip[]; source: ExportImageSource; rows: readonly PanelPrintRow[];
  options: PrintOptions; labels: Readonly<Record<string, string>>; language: string;
  version: string; date: string; signal: AbortSignal;
  urls: (paths: readonly string[]) => Promise<Readonly<Record<string, string>>>;
  progress?: (done: number, total: number) => void;
}

/** Loads only one panel/scene's images at a time; shared compositor includes SB-8 strokes. */
export async function printImageRenderer(input: PrintExportInput) {
  const adapted = exportImageSource(input.state, input.clips, input.source);
  const layers = Object.fromEntries(Object.entries(adapted.state.layers).map(([id, l]) => [id,
    l.kind in input.options.layers && !input.options.layers[l.kind as keyof PrintOptions["layers"]] ? { ...l, visible: false } : l]));
  const state = { ...adapted.state, layers };
  const videoPaths = [...new Set(adapted.clips.flatMap(c => c.parts.flatMap(p => p.take?.mediaRef ? [p.take.mediaRef] : [])))];
  const videos = new FilmVideoFrames(await import("mediabunny"), await input.urls(videoPaths));
  const canvas = document.createElement("canvas");
  canvas.width = 1200; canvas.height = Math.round(1200 * state.project.frameHeight / state.project.frameWidth);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("ptg1.export-failed"));
  return {
    async render(row: PanelPrintRow) {
      const panel = state.compositions[row.panelId];
      const clip = input.source === "storyboard" ? adapted.clips.find(c => c.compositionId === row.panelId) : adapted.clips.find(c => c.occurrenceId === row.occurrenceId);
      const compositionId = input.source === "storyboard" ? row.panelId : clip?.compositionId;
      const used = Object.values(layers).filter(l => !l.removed && l.visible && l.compositionId === compositionId);
      await fontsReady(used.flatMap(l => l.text ? [l.text] : []));
      const paths = [...new Set(used.flatMap(l => layerVersions(state, l).map(v => v.mediaPath)))];
      const loaded = await loadImages(await input.urls(paths));
      if (loaded.failed.length) throw new Error(t("ptg1.export-failed"));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (input.source === "storyboard" && panel) {
        // Printed instructions remain visible: camera mark is not applied as a destructive crop.
        const frame = renderFrame({ ...state, compositions: { ...state.compositions, [panel.id]: { ...panel, cameraShots: [] } } }, panel.id, 0);
        drawFrame(ctx, frame, { width: canvas.width, height: canvas.height, images: loaded.images, placeholders: true });
      } else if (clip) {
        const solo = { ...clip, startFrame: 0, transition: { kind: "cut" as const, frames: 0 }, overlapFrames: 0 };
        const localFrame = Math.min(clip.durationFrames - 1, Math.max(0, row.startFrame - (input.rows.find(r => r.occurrenceId === row.occurrenceId)?.startFrame ?? 0)));
        await videos.prepare(state, [solo], localFrame);
        drawFilmFrame(ctx, state, [solo], localFrame, { width: canvas.width, height: canvas.height, images: loaded.images, video: videos.provider, placeholders: true });
      }
      return canvas.toDataURL("image/png");
    },
    async close() { await videos.close(); canvas.width = 0; canvas.height = 0; },
  };
}

export async function storyboardPdf(input: PrintExportInput): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const layout = printLayout(input.rows.length, input.options);
  const doc = new jsPDF({ unit: "mm", format: [layout.width, layout.height], orientation: input.options.landscape ? "landscape" : "portrait", compress: true });
  const texts = input.rows.flatMap(row => input.options.fields.map(k => `${input.labels[k]}: ${row[k]}`));
  const fonts = registerNotoFonts(doc, await loadNotoFonts(notoScriptsNeeded([input.state.project.name, input.version, input.date, ...texts], input.language)), "StoryboardNoto");
  const renderer = await printImageRenderer(input);
  doc.setProperties({ title: input.state.project.name, subject: t("sb6.print"), creator: "From Pen to Glass" });
  const lineHeight = 3.2;
  function wrap(text: string, width: number): string[] {
    const result: string[] = [];
    for (const line of text.split("\n")) {
      let current = "";
      // Grapheme wrapping supports CJK and never splits combining clusters.
      const graphemes = Array.from(new Intl.Segmenter(input.language, { granularity: "grapheme" }).segment(line), g => g.segment);
      for (const ch of graphemes) {
        if (current && runsWidth(doc, fonts, current + ch, input.language) > width) { result.push(current); current = ""; }
        current += ch;
      }
      result.push(current);
    }
    return result;
  }
  function textLine(text: string, x: number, y: number, width: number) {
    drawRuns(doc, fonts, text, isRtlText(text) ? x + width - runsWidth(doc, fonts, text, input.language) : x, y, input.language);
  }
  try {
    await exportChunks(layout.pages, input.signal, async (cells, pi) => {
      if (pi) doc.addPage([layout.width, layout.height], input.options.landscape ? "landscape" : "portrait");
      for (const cell of cells) {
        if (input.signal.aborted) throw new DOMException(t("ptg1.cancelled"), "AbortError");
        const row = input.rows[cell.index]; if (!row) continue;
        const image = await renderer.render(row);
        const panel = input.state.compositions[row.panelId];
        const aspect = (panel?.width ?? input.state.project.frameWidth) / (panel?.height ?? input.state.project.frameHeight);
        doc.setFontSize(input.options.perPage === 1 ? 11 : 8);
        const lines = input.options.fields.flatMap(k => wrap(`${input.labels[k]}: ${row[k]}`, cell.width));
        const imageH = Math.min(cell.height * (input.options.perPage === 1 ? .72 : .55), cell.width / aspect);
        const imageW = Math.min(cell.width, imageH * aspect);
        doc.addImage(image, "PNG", cell.x + (cell.width - imageW) / 2, cell.y, imageW, imageH);
        const available = Math.max(1, Math.floor((cell.height - imageH - 4) / lineHeight));
        for (let n = 0; n < Math.min(available, lines.length); n++) textLine(lines[n] ?? "", cell.x, cell.y + imageH + 4 + n * lineHeight, cell.width);
        // Never discard long dialogue/notes: continuation pages follow the grid pages below.
        if (lines.length > available) overflow.push({ number: row.panel, lines: lines.slice(available) });
        input.progress?.(cell.index + 1, input.rows.length);
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    });
    for (const extra of overflow) {
      const max = Math.floor((layout.height - 40) / lineHeight);
      await exportChunks(Array.from({ length: Math.ceil(extra.lines.length / max) }, (_, i) => i), input.signal, async i => {
        doc.addPage(); doc.setFontSize(8);
        textLine(`${input.labels["panel"]}: ${extra.number}`, 12, 24, layout.width - 24);
        extra.lines.slice(i * max, (i + 1) * max).forEach((line, j) => textLine(line, 12, 30 + j * lineHeight, layout.width - 24));
      });
    }
    const total = doc.getNumberOfPages();
    for (let page = 1; page <= total; page++) {
      doc.setPage(page); doc.setFontSize(8);
      textLine(`${input.state.project.name} · ${input.version}`, 12, 12, layout.width - 24);
      textLine(`${input.date} · ${page} / ${total}`, 12, layout.height - 8, layout.width - 24);
    }
    if (input.signal.aborted) throw new DOMException(t("ptg1.cancelled"), "AbortError");
    return doc.output("blob");
  } finally { await renderer.close(); }
  // Declared before async work begins; kept local to this document.
}