import { jsPDF } from 'jspdf';
import { t } from '@/core/i18n/keyed';
import type { Point } from '@/core/print/contour';
import type { PrintPlan } from '@/core/print/pdf/layout';

/** No DOM, canvas, resampling or file I/O. Encoded images are embedded at source resolution. */
export function renderPdf(plan: PrintPlan): jsPDF {
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
      const paths = (holes:boolean) => item.contour.paths.filter(path=>holes || !path.isHole).flatMap(path=>path.points.length ? [
        {op:'m',c:[point(path.points[0]!).x,point(path.points[0]!).y]},
        ...path.points.slice(1).map(v=>({op:'l',c:[point(v).x,point(v).y]})),{op:'h',c:[]},
      ] : []);
      doc.saveGraphicsState();
      doc.rect(r.x,r.y,r.width,r.height,null); doc.clip(); doc.discardPath();
      if (item.mode !== 'contour' && item.image) {
        doc.saveGraphicsState(); doc.path(paths(true)); doc.clipEvenOdd(); doc.discardPath();
        doc.addImage(item.image.data,item.image.format,r.x-s.x,r.y-s.y,size.width*factor,size.height*factor,undefined,'NONE');
        doc.restoreGraphicsState();
      }
      if (item.mode !== 'figure') { doc.setLineWidth(.1); doc.path(paths(item.cutHoles !== false)); doc.stroke(); }
      doc.setDrawColor(25,90,190); doc.setTextColor(25,90,190);
      for (const set of p.measurements) for (const marker of set.markers) {
        if (marker.kind==='point') { const q=point(marker.point); doc.circle(q.x,q.y,.7); }
        else {
          const lines = 'line' in marker ? [marker.line] : 'lines' in marker ? marker.lines : 'distances' in marker ? marker.distances : [{a:marker.points[1],b:marker.points[0]},{a:marker.points[1],b:marker.points[2]}];
          for (const l of lines) line(point(l.a),point(l.b));
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
      if (item.reserveQr) { doc.rect(r.x+(item.upArrow?18:0),iy,14,14); doc.text(t('print-pdf.qr',{},plan.language),r.x+(item.upArrow?19:1),iy+6); }
      if (p.rows*p.columns>1) doc.text(t('print-pdf.tile',{row:p.row+1,column:p.column+1},plan.language),r.x,plan.height-12);
    }
    if (plan.calibration) {
      const x=plan.content.x,y=plan.height-24;
      doc.line(x,y,x+plan.calibration.lengthMm,y);
      for (const tick of plan.calibration.ticks) { doc.line(x+tick.mm,y,x+tick.mm,y-(tick.major?4:2)); if (tick.label) doc.text(tick.label,x+tick.mm,y+4); }
    }
    doc.text(plan.instruction,plan.content.x,plan.height-6);
  });
  return doc;
}
