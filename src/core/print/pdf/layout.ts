import type { ContourResult, Point } from '../contour';
import type { MeasureSet } from '../measure';
import { t } from '../../i18n/keyed';

export type Size = { width: number; height: number; unit?: 'mm' | 'in' };
export type InfoField = { key: string; value: string; enabled: boolean; sceneId?: string };
export interface PrintItem {
  id: string; sceneId?: string; size: Size; contour: ContourResult;
  mode: 'figure' | 'figure-cut' | 'contour'; cutHoles?: boolean;
  /** Encoded original image; never resampled by this engine. */
  image?: { data: string | Uint8Array; format: 'PNG' | 'JPEG'; widthPx: number; heightPx: number };
  measureSets?: readonly MeasureSet[]; fields?: readonly InfoField[];
  upArrow?: boolean; rotationDeg?: number; reserveQr?: boolean;
}
export interface PrintInput {
  items: readonly PrintItem[];
  paper?: 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | Size;
  orientation?: 'portrait' | 'landscape';
  margins?: Partial<{ top: number; right: number; bottom: number; left: number }>;
  technicalReference?: boolean;
  calibration?: { unit: 'mm' | 'in'; length: number };
  language?: string;
}
export interface Rect { x: number; y: number; width: number; height: number }
export interface Placement {
  item: PrintItem; rect: Rect; source: Rect; row: number; column: number;
  rows: number; columns: number; effectiveDpi?: number;
  info: { lines: string[]; rect: Rect }; measurements: readonly MeasureSet[];
  arrowAngle: number; registration: Point[];
}
export interface Sheet { kind: 'figures' | 'overview'; placements: Placement[]; overview?: { itemId: string; rows: number; columns: number; width: number; height: number } }
export interface Tick { mm: number; major: boolean; label?: string }
export interface PrintPlan {
  width: number; height: number; sheets: Sheet[]; content: Rect;
  calibration?: { ticks: Tick[]; lengthMm: number }; instruction: string; language?: string;
}
const papers = { A4: [210,297], A3: [297,420], A5: [148,210], Letter: [215.9,279.4], Legal: [215.9,355.6] } as const;
const positive = (v: number) => { if (!Number.isFinite(v) || v <= 0) throw new RangeError(t('print-pdf.invalid')); return v; };
export function sizeMm(size: Size) { const f = size.unit === 'in' ? 25.4 : 1; return { width: positive(size.width*f), height: positive(size.height*f) }; }
export function calibrationTicks(unit: 'mm' | 'in', length: number): Tick[] {
  positive(length);
  const count = Math.round(length * (unit === 'in' ? 8 : 1));
  if (Math.abs(count - length * (unit === 'in' ? 8 : 1)) > 1e-8) throw new RangeError(t('print-pdf.invalid'));
  return Array.from({ length: count+1 }, (_, i) => ({ mm: unit === 'in' ? i*25.4/8 : i, major: i % (unit === 'in' ? 8 : 10) === 0, ...(i % (unit === 'in' ? 8 : 10) === 0 ? { label: String(unit === 'in' ? i/8 : i) } : {}) }));
}
/** Conservative Helvetica 8pt wrapping: each character is budgeted a full em. */
function wrap(text: string, width: number): string[] {
  const count = Math.max(1, Math.floor(width / (8*25.4/72)));
  return text.split(/\r?\n/).flatMap(line => {
    const out: string[] = [];
    while (line.length > count) { let n = line.lastIndexOf(' ', count); if (n < 1) n = count; out.push(line.slice(0,n)); line = line.slice(n).trimStart(); }
    return [...out, line];
  });
}
export function planPrint(input: PrintInput): PrintPlan {
  const paper = input.paper ?? 'A4';
  let { width, height } = typeof paper === 'string' ? { width: papers[paper][0] as number, height: papers[paper][1] as number } : sizeMm(paper);
  if (input.orientation === 'landscape' && width < height || input.orientation === 'portrait' && width > height) [width,height] = [height,width];
  const m = { top:10, right:10, bottom:10, left:10, ...input.margins };
  if (Object.values(m).some(v => !Number.isFinite(v) || v < 0)) throw new RangeError(t('print-pdf.invalid'));
  const calibration = input.calibration && { ticks: calibrationTicks(input.calibration.unit,input.calibration.length), lengthMm: input.calibration.length*(input.calibration.unit === 'in' ? 25.4 : 1) };
  const content = { x:m.left, y:m.top, width:positive(width-m.left-m.right), height:positive(height-m.top-m.bottom-18-(calibration ? 14 : 0)) };
  if (calibration && calibration.lengthMm > content.width) throw new RangeError(t('print-pdf.invalid'));
  const sheets: Sheet[] = []; let shelf: Sheet | undefined; let x=0, y=0, shelfHeight=0;
  const newSheet = () => { shelf = { kind:'figures', placements:[] }; sheets.push(shelf); x=0; y=0; shelfHeight=0; };
  for (const item of input.items) {
    const size = sizeMm(item.size);
    const lines = (item.fields ?? []).filter(f => f.enabled && (f.sceneId === undefined || f.sceneId === item.sceneId)).flatMap(f => wrap(f.value, Math.min(size.width,content.width)));
    const infoHeight = lines.length*4 + (item.upArrow || item.reserveQr ? 16 : 0) + (lines.length ? 3 : 0);
    const tileW = content.width, tileH = positive(content.height-infoHeight);
    if (infoHeight > content.height-11) throw new RangeError(t('print-pdf.invalid'));
    const columns = size.width <= tileW ? 1 : 1+Math.ceil((size.width-tileW)/positive(tileW-10));
    const rows = size.height <= tileH ? 1 : 1+Math.ceil((size.height-tileH)/positive(tileH-10));
    let dpi: number | undefined;
    if (item.mode !== 'contour') {
      if (!item.image) throw new RangeError(t('print-pdf.image-required'));
      dpi = Math.min(positive(item.image.widthPx)/size.width,positive(item.image.heightPx)/size.height)*25.4;
      // Preserve original pixels, including low-resolution sources; never silently invent detail.
    }
    if (rows*columns > 1) { sheets.push({ kind:'overview', placements:[], overview:{ itemId:item.id, rows,columns,...size } }); shelf=undefined; }
    for (let row=0; row<rows; row++) for (let column=0; column<columns; column++) {
      const sx=column*(tileW-10), sy=row*(tileH-10);
      const w=Math.min(tileW,size.width-sx), h=Math.min(tileH,size.height-sy), blockH=h+infoHeight;
      if (rows*columns > 1 || !shelf) newSheet();
      if (x+w > content.width+1e-8) { x=0; y+=shelfHeight+5; shelfHeight=0; }
      if (y+blockH > content.height+1e-8) newSheet();
      const rect={ x:content.x+x,y:content.y+y,width:w,height:h };
      const registration: Point[]=[];
      // Crosses at corners of each shared 10 mm overlap strip.
      if (columns>1) for (const xx of [column>0 ? 0 : w-10, column>0 ? 10 : w]) for (const yy of [0,h]) registration.push({x:rect.x+xx,y:rect.y+yy});
      if (rows>1) for (const yy of [row>0 ? 0 : h-10,row>0 ? 10 : h]) for (const xx of [0,w]) registration.push({x:rect.x+xx,y:rect.y+yy});
      shelf!.placements.push({ item,rect,source:{x:sx,y:sy,width:w,height:h},row,column,rows,columns,effectiveDpi:dpi,info:{lines,rect:{x:rect.x,y:rect.y+h+3,width:w,height:infoHeight}},measurements: input.technicalReference ? item.measureSets ?? [] : [], arrowAngle:-(item.rotationDeg ?? 0),registration });
      x+=w+5; shelfHeight=Math.max(shelfHeight,blockH);
      if (rows*columns>1) shelf=undefined;
    }
  }
  return {width,height,sheets,content,calibration,instruction:t('print-pdf.instruction',{},input.language),language:input.language};
}
