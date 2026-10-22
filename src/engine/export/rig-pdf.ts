import { jsPDF } from 'jspdf';
import { t } from '@/core/i18n/keyed';
import type { Point } from '@/core/print/contour';
import type { PrintPlan } from '@/core/print/pdf/layout';
import { markerValue, formatMeasurement } from '@/core/print/measure';
import { backQrRect, backsideRect, duplexTestMarks, formatShortCode, qrRect, type DuplexOffset, type PrintJobSettings } from '@/core/print/job';
import type { Rect } from '@/core/print/pdf/layout';

/** Rigg runde 5: QR per kopi. Modulene er ferdig beregnet (ingen nettverk); nøkkelen står bare i QR-en. */
export interface CopyQr { readonly modules: readonly (readonly boolean[])[]; readonly shortCode: string }
export interface JobPdfOptions {
  readonly settings: PrintJobSettings;
  /** Per PrintItem.id (kopi-ID). */
  readonly qr: ReadonlyMap<string, CopyQr>;
  readonly offset: DuplexOffset;
}
function drawQr(doc: jsPDF, q: CopyQr, r: Rect) {
  const n = q.modules.length; if (!n) return;
  const cell = r.width / n;
  doc.setFillColor(255, 255, 255); doc.rect(r.x, r.y, r.width, r.height, 'F'); doc.setFillColor(0, 0, 0);
  q.modules.forEach((row, y) => row.forEach((on, x) => { if (on) doc.rect(r.x + x * cell, r.y + y * cell, cell, cell, 'F'); }));
}

/** No DOM, canvas, resampling or file I/O. Encoded images are embedded at source resolution. */
export function renderPdf(plan: PrintPlan, job?: JobPdfOptions): jsPDF {
  const doc = new jsPDF({ unit:'mm', format:[plan.width,plan.height], orientation:plan.width>plan.height?'landscape':'portrait', floatPrecision:16, compress:false });
  doc.viewerPreferences({ PrintScaling:'None' });
  const line = (a:Point,b:Point) => doc.line(a.x,a.y,b.x,b.y);
  plan.sheets.forEach((sheet,index) => {
    if (index) doc.addPage([plan.width,plan.height],plan.width>plan.height?'landscape':'portrait');
    doc.setFontSize(8); doc.setDrawColor(0); doc.setTextColor(0); doc.setLineWidth(.1);
    if (sheet.overview) {
      const o=sheet.overview, c=plan.content, scale=Math.min(c.width/o.width,(c.height-10)/o.height);
      doc.text(t('print-pdf.overview',{id:o.itemId},plan.language),c.x,c.y+3);
      const tile = plan.sheets.flatMap(s=>s.placements).filter(p=>p.item.id===o.itemId);
      for (const p of tile) { const r=p.source; doc.rect(c.x+r.x*scale,c.y+10+r.y*scale,r.width*scale,r.height*scale); doc.text(t('print-pdf.tile',{row:p.row+1,column:p.column+1},plan.language),c.x+r.x*scale+1,c.y+13+r.y*scale); }
    }
    for (const p of sheet.placements) {
      const {item,rect:r,source:s}=p, size=item.size, factor=size.unit==='in'?25.4:1;
      const point = (v:Point):Point => ({x:r.x-s.x+v.x,y:r.y-s.y+v.y});
      const paths = (holes:boolean) => item.contour.paths.filter(path=>holes || !path.isHole).flatMap(path=>path.points[0] ? [
        {op:'m',c:[point(path.points[0]).x,point(path.points[0]).y]},
        ...path.points.slice(1).map(v=>({op:'l',c:[point(v).x,point(v).y]})),{op:'h',c:[]},
      ] : []);
      doc.saveGraphicsState();
      doc.rect(r.x,r.y,r.width,r.height,null); doc.clip(); doc.discardPath();
      if (item.mode !== 'contour' && item.image) {
        doc.saveGraphicsState(); doc.path(paths(true)); doc.clipEvenOdd(); doc.discardPath();
        doc.addImage(item.image.data,item.image.format,r.x-s.x,r.y-s.y,size.width*factor,size.height*factor,undefined,'NONE');
        doc.restoreGraphicsState();
      }
      if (item.mode !== 'figure') { doc.setDrawColor(55); doc.setLineWidth(item.strokeWidthMm??.1); doc.path(paths(item.cutHoles !== false)); doc.stroke(); }
      doc.setDrawColor(25,90,190); doc.setTextColor(25,90,190);
      for (const set of p.measurements) for (const marker of set.markers) {
        if (marker.kind==='point') { const q=point(marker.point); doc.circle(q.x,q.y,.7); }
        else {
          const lines = 'line' in marker ? [marker.line] : 'lines' in marker ? marker.lines : 'distances' in marker ? marker.distances : [{a:marker.points[1],b:marker.points[0]},{a:marker.points[1],b:marker.points[2]}];
          for (const l of lines) line(point(l.a),point(l.b));
          const origin=lines[0]?.a;
          if(origin) {
            const value=markerValue(marker), q=point(origin);
            const label=typeof value==='number'?(marker.kind==='angle'?`${value.toFixed(1)}°`:formatMeasurement(value,'mm')):'decimal' in value?`${value.decimal.toFixed(3)} (${value.percent.toFixed(1)}%)`:'';
            doc.text(label,q.x+1,q.y-1);
          }
        }
      }
      doc.restoreGraphicsState(); doc.setDrawColor(0); doc.setTextColor(0); doc.setLineWidth(.1);
      for (const q of p.registration) { doc.line(q.x-2,q.y,q.x+2,q.y); doc.line(q.x,q.y-2,q.x,q.y+2); }
      p.info.lines.forEach((text,i)=>doc.text(text,p.info.rect.x,p.info.rect.y+i*4));
      const iy=p.info.rect.y+p.info.lines.length*4;
      if (item.upArrow) {
        const a=p.arrowAngle*Math.PI/180, origin={x:r.x+7,y:iy+10};
        const rotate=(x:number,y:number)=>({x:origin.x+x*Math.cos(a)-y*Math.sin(a),y:origin.y+x*Math.sin(a)+y*Math.cos(a)});
        line(origin,rotate(0,-8)); line(rotate(0,-8),rotate(-2,-5)); line(rotate(0,-8),rotate(2,-5));
      }
      const code = job?.qr.get(item.id);
      if (code && job && job.settings.qr !== 'back') {
        const q = qrRect(r, job.settings, iy)!;
        const at = job.settings.qr === 'outside' ? { ...q, x: r.x + (item.upArrow ? 18 : 0) } : q;
        drawQr(doc, code, at);
        doc.setFontSize(6); doc.text(formatShortCode(code.shortCode), at.x, at.y + at.height + 2.5); doc.setFontSize(8);
      } else if (item.reserveQr && !job) { doc.rect(r.x+(item.upArrow?18:0),iy,14,14); doc.text(t('print-pdf.qr',{},plan.language),r.x+(item.upArrow?19:1),iy+6); }
      if (p.rows*p.columns>1) doc.text(t('print-pdf.tile',{row:p.row+1,column:p.column+1},plan.language),r.x,plan.height-12);
    }
    if (plan.calibration) {
      const x=plan.content.x,y=plan.height-24;
      doc.line(x,y,x+plan.calibration.lengthMm,y);
      for (const tick of plan.calibration.ticks) { doc.line(x+tick.mm,y,x+tick.mm,y-(tick.major?4:2)); if (tick.label) doc.text(tick.label,x+tick.mm,y+4); }
    }
    doc.text(plan.instruction,plan.content.x,plan.height-6);
    // Baksiden (tosidig): QR bak hver figur, plassert speilvendt etter vendingen og forskjøvet etter testarket
    if (job?.settings.qr === 'back' && job.settings.duplex && sheet.kind === 'figures') {
      doc.addPage([plan.width,plan.height],plan.width>plan.height?'landscape':'portrait');
      for (const p of sheet.placements) {
        const code = job.qr.get(p.item.id); if (!code) continue;
        const q = backQrRect(p.rect, plan, job.settings.flip, job.offset);
        drawQr(doc, code, q);
        doc.setFontSize(6); doc.text(formatShortCode(code.shortCode), q.x, q.y + q.height + 2.5); doc.setFontSize(8);
      }
    }
  });
  return doc;
}

/** Testark for tosidig utskrift: kryss på forsiden, de samme speilet på baksiden. Forskyvningen måles i mm. */
export function renderDuplexTestSheet(paper: { width: number; height: number }, flip: 'long' | 'short', language?: string): jsPDF {
  const doc = new jsPDF({ unit:'mm', format:[paper.width,paper.height], orientation:paper.width>paper.height?'landscape':'portrait', compress:false });
  doc.viewerPreferences({ PrintScaling:'None' });
  const cross = (x: number, y: number, size: number) => { doc.line(x-size,y,x+size,y); doc.line(x,y-size,x,y+size); };
  doc.setLineWidth(.2); doc.setFontSize(8);
  for (const m of duplexTestMarks(paper)) cross(m.x, m.y, 8);
  doc.text(t('print-job.duplex-front', {}, language), 20, 12);
  doc.addPage([paper.width,paper.height],paper.width>paper.height?'landscape':'portrait');
  doc.setLineWidth(.1);
  for (const m of duplexTestMarks(paper)) {
    const b = backsideRect({ x: m.x, y: m.y, width: 0, height: 0 }, paper, flip, { x: 0, y: 0 });
    cross(b.x, b.y, 8);
    for (let i = -5; i <= 5; i++) { doc.line(b.x + i, b.y + 9, b.x + i, b.y + (i % 5 === 0 ? 12 : 10.5)); doc.line(b.x + 9, b.y + i, b.x + (i % 5 === 0 ? 12 : 10.5), b.y + i); }
  }
  doc.text(t('print-job.duplex-back', {}, language), 20, 12);
  return doc;
}
