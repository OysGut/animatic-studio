/** SB-6: portable page geometry and typed, panel-scoped shot list. No project writes. */
import type { ProjectState } from "../model";
import type { FilmClip } from "../assembly/film";
import { panelDetails } from "./editing";
import { panelBlockIds } from "./index";
import { storyboardTimeline } from "./playback";
import { formatTimecode, framesToSeconds } from "../time";

export const PRINT_PAPERS = { A4: [210, 297], A3: [297, 420], Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8] } as const;
export type PrintPaper = keyof typeof PRINT_PAPERS;
export const PRINT_FIELDS = ["panel", "scene", "shot", "duration", "dialogue", "action", "camera", "movement", "sound", "notes", "status"] as const;
export type PrintField = typeof PRINT_FIELDS[number];
export interface PrintOptions {
  paper: PrintPaper; landscape: boolean; perPage: 1 | 3 | 6 | 9;
  fields: readonly PrintField[];
  layers: { sketch: boolean; note: boolean; arrow: boolean; camera_mark: boolean };
}
export interface PrintCell { index: number; x: number; y: number; width: number; height: number }
export function printLayout(count: number, o: Pick<PrintOptions, "paper" | "landscape" | "perPage">) {
  const size = PRINT_PAPERS[o.paper];
  const width = o.landscape ? size[1] : size[0], height = o.landscape ? size[0] : size[1];
  const cols = o.perPage === 1 ? 1 : o.perPage === 3 ? (o.landscape ? 3 : 1) : o.perPage === 6 ? (o.landscape ? 3 : 2) : 3;
  const rows = o.perPage / cols, gap = 4, margin = 12, top = 20;
  const w = (width - 2 * margin - (cols - 1) * gap) / cols;
  const h = (height - top - 16 - (rows - 1) * gap) / rows;
  const pages: PrintCell[][] = [];
  for (let i = 0; i < count; i++) {
    const page = Math.floor(i / o.perPage), slot = i % o.perPage;
    (pages[page] ??= []).push({ index: i, x: margin + slot % cols * (w + gap), y: top + Math.floor(slot / cols) * (h + gap), width: w, height: h });
  }
  return { width, height, pages };
}
export interface PanelPrintRow {
  panelId: string; occurrenceId: string; startFrame: number; durationFrames: number; timecode: string;
  panel: string; scene: string; shot: string; duration: number; dialogue: string; action: string;
  camera: string; movement: string; sound: string; notes: string; status: string;
}
export function panelPrintRows(s: ProjectState, clips: readonly FilmClip[]): PanelPrintRow[] {
  return storyboardTimeline(s, clips).map(sh => {
    const p = sh.panel, d = panelDetails(p);
    const ids = new Set([...panelBlockIds(s, p.id), ...d.dialogueIds]);
    const blocks = [...ids].flatMap(id => { const b = s.blocks[id]; return b && !b.removed ? [b] : []; });
    const statuses = Object.values(s.productionStatuses).filter(v => !v.removed && (v.compositionId === p.id || (!v.compositionId && v.occurrenceId === p.occurrenceId)));
    const notes = Object.values(s.annotations).filter(a => !a.removed && a.panelId === p.id).map(a => a.text);
    return { panelId: p.id, occurrenceId: sh.occurrenceId, startFrame: sh.startFrame, durationFrames: sh.durationFrames,
      timecode: formatTimecode(sh.startFrame, s.project.fps), panel: d.number || String(sh.index + 1),
      scene: d.sceneNumber || s.occurrences[sh.occurrenceId]?.productionNumber || "", shot: d.shot ?? "",
      duration: framesToSeconds(sh.durationFrames, s.project.fps),
      dialogue: blocks.filter(b => b.kind === "dialogue").map(b => b.text).join("\n") || d.fields["dialogue"] || "",
      action: d.fields["action"] || blocks.filter(b => b.kind === "action").map(b => b.text).join("\n"),
      camera: [d.shot, d.angle, d.focalMm ? `${d.focalMm} mm` : "", d.fields["camera"]].filter(Boolean).join(" · "),
      movement: d.movement, sound: d.fields["sound"] ?? "", notes: [d.fields["notes"], ...notes].filter(Boolean).join("\n"),
      status: statuses.map(v => `${v.area}: ${v.status}`).join("\n") };
  });
}
export function printTable(rows: readonly PanelPrintRow[], fields: readonly PrintField[], labels: Readonly<Record<string, string>>) {
  const keys = [...fields, "durationFrames", "timecode"] as const;
  return { header: keys.map(k => labels[k] ?? k), rows: rows.map(row => keys.map(k => row[k])) };
}
/** Quoting also blocks spreadsheet formula injection while keeping numbers numeric in XLSX. */
export function printCsv(table: ReturnType<typeof printTable>): Uint8Array {
  const cell = (v: string | number) => { const text = typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v); return `"${text.replaceAll('"', '""')}"`; };
  return new TextEncoder().encode("\uFEFF" + [table.header, ...table.rows].map(r => r.map(cell).join(",")).join("\r\n") + "\r\n");
}