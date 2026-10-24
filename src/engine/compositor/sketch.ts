import { unpackSamples, type SketchSpec, type SketchStroke } from "@/core/storyboard/sketch";
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export function paintStroke(ctx:Context,st:SketchStroke,width:number,height:number) {
  const pts=unpackSamples(st.points),a=pts[0],b=pts.at(-1);if(!a||!b)return;
  ctx.save();ctx.globalAlpha=st.opacity;ctx.globalCompositeOperation=st.tool==="erase"?"destination-out":"source-over";ctx.fillStyle=st.color;ctx.strokeStyle=st.color;ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=st.size;
  if(st.tool==="fill"){
    const image=ctx.getImageData(0,0,width,height),data=image.data,x=Math.floor(Math.max(0,Math.min(width-1,a.x))),y=Math.floor(Math.max(0,Math.min(height-1,a.y))),start=(y*width+x)*4;
    const target=[data[start],data[start+1],data[start+2],data[start+3]],rgb=[1,3,5].map(i=>parseInt(st.color.slice(i,i+2),16)),alpha=Math.round(st.opacity*255);
    if(!rgb.every((v,i)=>v===target[i])||alpha!==target[3]){
      const seen=new Uint8Array(width*height),queue=[y*width+x];
      for(let q=0;q<queue.length;q++){const n=queue[q];if(n===undefined||seen[n])continue;seen[n]=1;const at=n*4;if(!target.every((v,i)=>Math.abs((data[at+i]??0)-(v??0))<=16))continue;data[at]=rgb[0]??0;data[at+1]=rgb[1]??0;data[at+2]=rgb[2]??0;data[at+3]=alpha;const col=n%width;if(col>0)queue.push(n-1);if(col<width-1)queue.push(n+1);if(n>=width)queue.push(n-width);if(n<width*(height-1))queue.push(n+width);}
      ctx.putImageData(image,0,0);
    }
  }
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