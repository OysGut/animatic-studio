import { unpackSamples, type SketchSpec, type SketchStroke } from "@/core/storyboard/sketch";
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export function paintStroke(ctx:Context,st:SketchStroke,width:number,height:number) {
  const pts=unpackSamples(st.points),a=pts[0],b=pts.at(-1);if(!a||!b)return;
  ctx.save();ctx.globalAlpha=st.opacity;ctx.globalCompositeOperation=st.tool==="erase"?"destination-out":"source-over";ctx.fillStyle=st.color;ctx.strokeStyle=st.color;ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=st.size;
  if(st.tool==="fill"){ctx.fillRect(0,0,width,height);}
  else if(st.tool==="rect")ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);
  else if(st.tool==="ellipse"){ctx.beginPath();ctx.ellipse((a.x+b.x)/2,(a.y+b.y)/2,Math.abs(a.x-b.x)/2,Math.abs(a.y-b.y)/2,0,0,Math.PI*2);ctx.stroke();}
  else if(st.tool==="line"){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  else {
    let prev=a;
    for(const point of pts){const k=1-st.smoothing*.85;const p={...point,x:prev.x+(point.x-prev.x)*k,y:prev.y+(point.y-prev.y)*k};const pressure=Math.pow(Math.max(.02,p.pressure),st.curve);ctx.lineWidth=st.size*(st.tool==="erase"?1:pressure);ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();prev=p;}
  }
  ctx.restore();
}
const cache=new WeakMap<SketchSpec,Map<string,CanvasImageSource>>();
export function sketchRaster(spec:SketchSpec,width:number,height:number):CanvasImageSource|null {
  let sizes=cache.get(spec);if(!sizes){sizes=new Map();cache.set(spec,sizes);}const key=`${width}x${height}`;const saved=sizes.get(key);if(saved)return saved;
  const canvas=typeof OffscreenCanvas!=="undefined"?new OffscreenCanvas(width,height):typeof document!=="undefined"?document.createElement("canvas"):null;if(!canvas)return null;canvas.width=width;canvas.height=height;const ctx=canvas.getContext("2d") as Context|null;if(!ctx)return null;
  for(const st of spec.strokes)paintStroke(ctx,st,width,height);
  if(sizes.size>=4)sizes.clear();sizes.set(key,canvas);return canvas;
}