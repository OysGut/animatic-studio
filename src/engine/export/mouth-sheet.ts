/** One transparent PNG drawing sheet per immutable rig version; grid coordinates are stable. */
import { PART_SLOTS, SHEET_CELL, SHEET_COLUMNS, sheetCells, visemeExample, type Viseme } from "@/core/animation/parts";
import type { RigSpec } from "@/core/animation/rig";
import { renderRigPart } from "@/engine/compositor/rig-parts";
export async function drawingSheet(spec: RigSpec, urls: Readonly<Record<string, string>>, paths: Readonly<Record<string, string>>): Promise<Blob> {
  const c = document.createElement("canvas"); c.width = SHEET_CELL * SHEET_COLUMNS; c.height = Math.ceil(PART_SLOTS.length / SHEET_COLUMNS) * SHEET_CELL;
  const ctx = c.getContext("2d"); if (!ctx) throw new Error("Canvas unavailable");
  for (const cell of sheetCells()) {
    const p = spec.parts?.[cell.slot], path = p?.versionId ? paths[p.versionId] : undefined;
    let image: HTMLImageElement | undefined;
    if (path && urls[path]) image = await loadImage(urls[path]);
    if (p) ctx.drawImage(renderRigPart(p, image, SHEET_CELL, SHEET_CELL), cell.x, cell.y);
    else if (cell.slot.startsWith("mouth:")) {
      const v = cell.slot.slice(6) as Viseme;
      ctx.save(); ctx.translate(cell.x + 160, cell.y + 150); ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--text-tertiary").trim(); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, v === "F" ? 20 : 55, v === "A" || v === "X" ? 2 : v === "D" ? 40 : 20, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text-tertiary").trim(); ctx.font = "14px sans-serif"; ctx.fillText(`${cell.slot}${cell.slot.startsWith("mouth:") ? ` · ${visemeExample(cell.slot.slice(6) as Viseme)}` : ""}`, cell.x + 8, cell.y + SHEET_CELL - 10);
  }
  return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error("PNG unavailable")), "image/png"));
}
export function loadImage(url: string): Promise<HTMLImageElement> { return new Promise((resolve, reject) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => resolve(i); i.onerror = reject; i.src = url; }); }
export async function splitDrawingSheet(file: File): Promise<{ slot: string; file: File }[]> {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width !== SHEET_CELL * SHEET_COLUMNS || bitmap.height !== Math.ceil(PART_SLOTS.length / SHEET_COLUMNS) * SHEET_CELL) { bitmap.close(); throw new Error("sheet-size"); }
  try { return await Promise.all(sheetCells().map(async cell => {
    const c = document.createElement("canvas"); c.width = SHEET_CELL; c.height = SHEET_CELL;
    const ctx = c.getContext("2d"); if (!ctx) throw new Error("Canvas unavailable"); ctx.drawImage(bitmap, cell.x, cell.y, cell.width, cell.height, 0, 0, cell.width, cell.height);
    // Labels occupy only the bottom strip; never turn labels into mouth artwork.
    ctx.clearRect(0, SHEET_CELL - 28, SHEET_CELL, 28);
    const blob = await new Promise<Blob>((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error("PNG unavailable")), "image/png"));
    return { slot: cell.slot, file: new File([blob], `${cell.slot.replaceAll(":", "-")}.png`, { type: "image/png" }) };
  })); } finally { bitmap.close(); }
}
