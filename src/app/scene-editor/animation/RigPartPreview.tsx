import { useEffect, useRef } from "react";
import { L } from "@/core";
import type { RigPart } from "@/core/animation/parts";
import type { RelativePoint } from "@/core/animation/rig";
import { renderRigPart } from "@/engine/compositor/rig-parts";
import { loadImage } from "@/engine/export/mouth-sheet";
export function RigPartPreview({ sourceUrl, partUrl, part, anchor }: { sourceUrl: string; partUrl?: string | undefined; part: RigPart; anchor: RelativePoint }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([loadImage(sourceUrl), partUrl ? loadImage(partUrl) : Promise.resolve(undefined)]).then(([base, image]) => {
      const c = ref.current, ctx = c?.getContext("2d"); if (!alive || !c || !ctx) return;
      c.width = Math.min(1024, base.naturalWidth); c.height = Math.round(c.width * base.naturalHeight / base.naturalWidth);
      ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(base, 0, 0, c.width, c.height);
      ctx.save(); ctx.translate((anchor.x + part.x) * c.width, (anchor.y + part.y) * c.height); ctx.rotate(part.rotation * Math.PI / 180);
      ctx.drawImage(renderRigPart(part, image), -part.width * c.width / 2, -part.height * c.height / 2, part.width * c.width, part.height * c.height); ctx.restore();
    }).catch(() => {});
    return () => { alive = false; };
  }, [sourceUrl, partUrl, part, anchor]);
  return <canvas ref={ref} data-testid="ca4-part-preview" aria-label={L("Munnform på karakteren", "Mouth shape on character")} className="max-h-72 w-full object-contain object-top bg-media" />;
}
