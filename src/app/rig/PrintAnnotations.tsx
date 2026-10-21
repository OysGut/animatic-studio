import type { Placement } from '@/core/print/pdf';
import { markerValue } from '@/core/print/measure';
import { t } from '@/core/i18n/keyed';

export function PrintAnnotations({placement:p}:{placement:Placement}) {
  const y=p.info.rect.y+p.info.lines.length*4;
  return <>
    {p.item.upArrow&&<path d="M0 0 V-8 M0 -8 L-2 -5 M0 -8 L2 -5" transform={`translate(${p.rect.x+7} ${y+10}) rotate(${p.arrowAngle})`} className="fill-none stroke-text-primary" strokeWidth={.1}/>}
    {p.item.reserveQr&&<g><rect x={p.rect.x+(p.item.upArrow?18:0)} y={y} width={14} height={14} className="fill-none stroke-text-primary" strokeWidth={.1}/><text x={p.rect.x+(p.item.upArrow?19:1)} y={y+6} fontSize={2.8} className="fill-text-primary">{t('print-pdf.qr')}</text></g>}
    {p.measurements.flatMap(set=>set.markers.map(marker=>{
      const point=(q:{x:number;y:number})=>({x:p.rect.x-p.source.x+q.x,y:p.rect.y-p.source.y+q.y});
      if(marker.kind==='point'){const q=point(marker.point);return <circle key={marker.id} cx={q.x} cy={q.y} r={.7} className="fill-none stroke-accent-brand" strokeWidth={.1}/>;}
      const lines='line' in marker?[marker.line]:'lines' in marker?marker.lines:'distances' in marker?marker.distances:[{a:marker.points[1],b:marker.points[0]},{a:marker.points[1],b:marker.points[2]}];
      const origin=lines[0]?.a;if(!origin)return null;
      const q=point(origin), value=markerValue(marker);
      const label=typeof value==='number'?`${value.toFixed(1)}${marker.kind==='angle'?'°':' mm'}`:'decimal' in value?`${value.decimal.toFixed(3)} (${value.percent.toFixed(1)}%)`:'';
      return <g key={marker.id}>{lines.map((l,i)=>{const a=point(l.a),b=point(l.b);return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-accent-brand" strokeWidth={.1}/>;})}<text x={q.x+1} y={q.y-1} fontSize={2.8} className="fill-accent-brand">{label}</text></g>;
    }))}
  </>;
}