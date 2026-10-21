import { describe, it, expect } from 'vitest';
import { autoMask } from '../../src/core/cutout';
import { chooseContourSource, computeContour, coverageFromAlpha, coverageFromLayerMask, coverageFromMask, suggestCoverage } from '../../src/core/print/contour';
import type { CompositionLayer } from '../../src/core/model';
const layer = (extra: Partial<CompositionLayer> = {}) => ({ id: 'a', keyframes: [], ...extra }) as CompositionLayer;
const opaque = (w: number, h: number) => new Uint8Array(w*h*4).fill(255);
const grid = (w: number, h: number, fn: (x:number,y:number)=>boolean) => coverageFromMask(Uint8Array.from({length:w*h},(_,i)=>fn(i%w,Math.floor(i/w))?255:0),w,h);
const options = { mmPerPixel: .1, toleranceMm: .01 };
describe('print contour', () => {
  it('uses actual autoMask output, not a rectangle fallback for a uniform opaque image', () => {
    const rgba = opaque(12,10);
    const s = chooseContourSource({rgba,width:12,height:10});
    expect(s.kind).toBe('suggestion');
    expect(s.label).toBe('app-rig.contour-source-suggestion');
    expect(s.coverage!.data).toEqual(autoMask(rgba,12,10));
    expect(s.coverage!.data.every(v=>v===0)).toBe(true);
    expect(computeContour(s.coverage!,options).paths).toHaveLength(0);
    const r = chooseContourSource({rgba,width:12,height:10,suggestionEnabled:false});
    expect(r.kind).toBe('rectangle');
    expect(computeContour(r.coverage!,options).widthMm).toBeCloseTo(1.2);
    expect(chooseContourSource({width:0,height:0}).kind).toBe('none');
  });
  it('prioritizes mask then alpha and multiplies alpha into suggestions', () => {
    const rgba = opaque(10,10); rgba[3]=0;
    expect(chooseContourSource({rgba,width:10,height:10}).kind).toBe('alpha');
    const l = layer({mask:{kind:'rect',x:0,y:0,width:5,height:5,feather:0,invert:false}});
    const s = chooseContourSource({rgba,width:10,height:10,layer:l});
    expect(s.kind).toBe('mask'); expect(s.coverage!.data[0]).toBe(0);
    expect(suggestCoverage(rgba,10,10).data[0]).toBe(0);
    expect(coverageFromAlpha(rgba,10,10).data[1]).toBe(255);
  });
  it('separates holes and islands with closed oriented paths', () => {
    const g = grid(30,20,(x,y)=>(x>=1&&x<15&&y>=1&&y<18&&!(x>=5&&x<10&&y>=5&&y<12))||(x>=21&&x<27&&y>=3&&y<10));
    const c = computeContour(g,options);
    expect(c.paths).toHaveLength(3); expect(c.paths.filter(p=>p.isHole)).toHaveLength(1);
    for (const p of c.paths) {
      expect(p.points[0]).toEqual(p.points.at(-1));
      const a = p.points.reduce((sum,v,i)=>i ? sum+p.points[i-1]!.x*v.y-v.x*p.points[i-1]!.y : sum,0);
      expect(a>0).toBe(!p.isHole);
    }
    expect(computeContour(g,{...options,cutHoles:false}).paths).toHaveLength(2);
  });
  it('evaluates animated masks through maskAt', () => {
    const l = layer({mask:{kind:'rect',x:2,y:2,width:4,height:8,feather:0,invert:false},keyframes:[{frame:0,property:'maskWidth',value:4,easing:'linear'},{frame:10,property:'maskWidth',value:12,easing:'linear'}]});
    const a = computeContour(coverageFromLayerMask(l,0,20,20)!,options);
    const b = computeContour(coverageFromLayerMask(l,10,20,20)!,options);
    expect(b.widthMm).toBeGreaterThan(a.widthMm);
  });
  it('supports ellipse feather, inversion and available clipping coverage', () => {
    const l = layer({mask:{kind:'ellipse',x:2,y:2,width:10,height:10,feather:3,invert:false}});
    const a = coverageFromLayerMask(l,0,16,16)!;
    const b = coverageFromLayerMask(layer({mask:{...l.mask!,invert:true}}),0,16,16)!;
    expect(a.data.some(v=>v>0&&v<255)).toBe(true);
    a.data.forEach((v,i)=>expect(v+b.data[i]!).toBe(255));
    const clip = layer({id:'b' as CompositionLayer['id'],mask:{kind:'layer',layerId:'a',invert:false}});
    expect(coverageFromLayerMask(clip,0,16,16)).toBeNull();
    const full = grid(16,16,()=>true);
    expect(coverageFromLayerMask(clip,0,16,16,[{layer:l,coverage:full}])!.data).toEqual(a.data);
  });
  it('never includes stroke width in measured size', () => {
    const g = grid(20,15,()=>true);
    const a = computeContour(g,{...options,strokeWidthMm:.05});
    const b = computeContour(g,{...options,strokeWidthMm:.3});
    expect(a).toEqual(b); expect(a.widthMm).toBe(2); expect(a.heightMm).toBe(1.5);
  });
  it('interpolates at 50 percent on edges', () => {
    const c = computeContour(coverageFromMask([255,64],2,1),{mmPerPixel:1,toleranceMm:0});
    expect(c.paths[0]!.points.some(p=>Math.abs(p.x-(.5+127.5/191))<1e-9)).toBe(true);
  });
  it('keeps all vertices within one pixel of covered samples for 250 seeded grids', () => {
    let seed = 87002;
    const random = () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    for (let trial=0;trial<250;trial++) {
      const w=3+Math.floor(random()*20),h=3+Math.floor(random()*20);
      const g=coverageFromMask(Uint8Array.from({length:w*h},()=>Math.floor(random()*256)),w,h);
      const c=computeContour(g,{mmPerPixel:.1});
      for (const path of c.paths) for (const p of path.points) {
        const x=p.x/.1,y=p.y/.1;
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(w+1e-9);
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(h+1e-9);
        let near=false;
        for(let yy=Math.max(0,Math.floor(y)-1);yy<Math.min(h,Math.floor(y)+2);yy++)
          for(let xx=Math.max(0,Math.floor(x)-1);xx<Math.min(w,Math.floor(x)+2);xx++)
            if(g.data[yy*w+xx]!>=128&&Math.abs(xx+.5-x)<=1+1e-9&&Math.abs(yy+.5-y)<=1+1e-9) near=true;
        expect(near).toBe(true);
      }
    }
  });
  it('reports marching squares + simplification on 4096 × 4096 (no timing limit)', () => {
    const g=grid(4096,4096,(x,y)=>(x-2048)**2+(y-2048)**2<1800**2 && (x-2048)**2+(y-2048)**2>500**2);
    const start=performance.now(); const c=computeContour(g,options); const ms=performance.now()-start;
    console.log(`print-contour 4096x4096 marching squares + RDP: ${ms.toFixed(1)} ms; ${c.pointCount} points`);
    expect(c.paths).toHaveLength(2);
  },30000);
});
