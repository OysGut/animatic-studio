import { describe, expect, it } from 'vitest';
import { calibrationTicks, planPrint, renderPdf, type PrintItem } from '../../src/core/print/pdf';
const item = (extra: Partial<PrintItem> = {}):PrintItem => ({id:'a',size:{width:87.3,height:142.6},mode:'contour',contour:{source:'rectangle',widthMm:87.3,heightMm:142.6,pointCount:5,paths:[{isHole:false,orientation:'clockwise',points:[{x:0,y:0},{x:87.3,y:0},{x:87.3,y:142.6},{x:0,y:142.6},{x:0,y:0}]}]},...extra});
describe('B-087 PDF engine',()=>{
 it('preserves mm and inch input without changing cut-line bounds',()=>{
  const a=planPrint({items:[item()]}),b=planPrint({items:[item({size:{width:87.3/25.4,height:142.6/25.4,unit:'in'}})]});
  expect(b.sheets[0]!.placements[0]!.rect.width).toBeCloseTo(87.3,12);
  expect(b.sheets[0]!.placements[0]!.rect.height).toBeCloseTo(142.6,12);
  expect(a.sheets[0]!.placements[0]!.rect).toEqual(b.sheets[0]!.placements[0]!.rect);
  const cut=planPrint({items:[item({mode:'figure-cut',image:{data:'unused',format:'PNG',widthPx:2000,heightPx:3000}})]});
  expect(cut.sheets[0]!.placements[0]!.rect).toEqual(a.sheets[0]!.placements[0]!.rect);
  const pdf=renderPdf(b).output();
  const pt=72/25.4;
  expect(pdf).toContain('/MediaBox [0 0 595.275590551181');
  expect(pdf).toContain('/PrintScaling /None');
  expect(pdf).toContain(`${(.1*pt).toFixed(16).replace(/0+$/,'')} w`);
  expect(pdf).toContain(String((97.3*pt).toFixed(16)).slice(0,12));
 });
 it('tiles with ten mm overlap and covers every edge, adds overview',()=>{
  const p=planPrint({items:[item({size:{width:500,height:600}})]});
  expect(p.sheets[0]!.kind).toBe('overview');
  const tiles=p.sheets.flatMap(s=>s.placements);
  expect(Math.max(...tiles.map(t=>t.source.x+t.source.width))).toBe(500);
  expect(Math.max(...tiles.map(t=>t.source.y+t.source.height))).toBe(600);
  const a=tiles.find(t=>t.row===0&&t.column===0)!,b=tiles.find(t=>t.row===0&&t.column===1)!;
  expect(a.source.x+a.source.width-b.source.x).toBe(10);
  const c=tiles.find(t=>t.row===1&&t.column===0)!;
  expect(a.source.y+a.source.height-c.source.y).toBe(10);
  expect(tiles.every(t=>t.registration.length>0)).toBe(true);
 });
 it('places exact metric and eighth-inch ticks in contour mode',()=>{
  expect(calibrationTicks('mm',100).map(t=>t.mm)).toEqual(Array.from({length:101},(_,i)=>i));
  const ticks=calibrationTicks('in',4); expect(ticks[1]!.mm).toBe(3.175); expect(ticks[32]!.mm).toBe(101.6);
  const plan=planPrint({items:[item()],calibration:{unit:'mm',length:100}});
  expect(renderPdf(plan).output()).toContain('(100) Tj');
 });
 it('omits measurements by default and includes them only by explicit choice',()=>{
  const a=item({measureSets:[{id:'m',name:'measure',layerId:'l',frame:0,createdAt:'2026-01-01T00:00:00Z',markers:[{id:'p',kind:'point',point:{x:3,y:4}}]}]});
  expect(planPrint({items:[a]}).sheets[0]!.placements[0]!.measurements).toEqual([]);
  const p=planPrint({items:[a],technicalReference:true}); expect(p.sheets[0]!.placements[0]!.measurements).toHaveLength(1);
  expect(renderPdf(p).output()).toContain('0.1 0.35 0.75 RG');
 });
 it('filters disabled fields and notes from other scenes, wraps outside figure',()=>{
  const p=planPrint({items:[item({sceneId:'s',fields:[{key:'title',value:'FILM_TITLE',enabled:true},{key:'scene',value:'HIDDEN',enabled:false},{key:'note',value:'OTHER_SCENE',enabled:true,sceneId:'other'},{key:'note',value:'LONG_NOTE '.repeat(25),enabled:true,sceneId:'s'}]})]});
  const placement=p.sheets[0]!.placements[0]!;
  expect(placement.info.rect.y).toBeGreaterThan(placement.rect.y+placement.rect.height);
  expect(placement.info.lines.length).toBeGreaterThan(5);
  const text=renderPdf(p).output(); expect(text).toContain('FILM_TITLE'); expect(text).not.toContain('HIDDEN'); expect(text).not.toContain('OTHER_SCENE');
 });
 it.each([0,90,37])('rotates up arrow by negative %s degrees',angle=>{
  const p=planPrint({items:[item({upArrow:true,rotationDeg:angle})]});
  expect(p.sheets[0]!.placements[0]!.arrowAngle).toBe(-angle);
  expect(renderPdf(p).output()).toContain('/PrintScaling /None');
 });
 it('shelf packs with 5 mm spacing and respects custom landscape paper',()=>{
  const p=planPrint({items:[item({size:{width:40,height:30}}),item({id:'b',size:{width:40,height:30}})],paper:{width:8.5,height:11,unit:'in'},orientation:'landscape'});
  expect(p.width).toBe(279.4); expect(p.height).toBe(215.89999999999998);
  expect(p.sheets).toHaveLength(1); expect(p.sheets[0]!.placements[1]!.rect.x).toBe(55);
 });
 it('embeds original pixels at exact physical dimensions and reports source DPI',()=>{
  const image={data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC',format:'PNG' as const,widthPx:1,heightPx:1};
  const p=planPrint({items:[item({mode:'figure-cut',image})]});
  expect(p.sheets[0]!.placements[0]!.effectiveDpi).toBeCloseTo(25.4/142.6);
  const pdf=renderPdf(p).output(); expect(pdf).toContain('/Subtype /Image');
  expect(pdf).toContain((87.3*72/25.4).toFixed(16).slice(0,12));
  expect(pdf).toContain((142.6*72/25.4).toFixed(16).slice(0,12));
 });
});
