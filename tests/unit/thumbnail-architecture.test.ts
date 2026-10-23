import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Bevisste unntak (begrunnet i PLASSHOLDER_FIX_REPORT.md, del 3). */
export const THUMBNAIL_EXCEPTIONS: Record<string, string> = {
  "src/app/shared/Thumbnail.tsx": "selve komponenten",
  "src/app/community/ShowcaseBox.tsx": "rundt profilbilde (avatar) beskjæres bevisst",
  "src/app/mobile/QrCode.tsx": "QR-kode, ikke et ressursbilde",
  "src/app/scene-editor/animation/FaceMarkDialog.tsx": "markeringsflate der klikkoordinater må følge boksen; boksen har bildets proporsjoner",
  "src/app/library/ImageLightbox.tsx": "fullskjermvisning, ikke miniatyr",
  "src/app/library/ImageViewer.tsx": "zoombar bildeviser, ikke miniatyr",
  "src/app/mobile/MouthShapeCapture.tsx": "munnformeditor med flytting, rotering og zoom av bildet (style-transform); viser hele bildet med contain",
  "src/app/library/HarmonizeCompare.tsx": "sammenligningsglider med clip-path; viser hele bildet med contain",
};

function files(d: string, out: string[] = []) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx|css)$/.test(p)) out.push(p.replaceAll("\\", "/"));
  }
  return out;
}

describe("arkitektur: alle miniatyrer går via Thumbnail", () => {
  const all = files("src").filter((f) => !f.startsWith("src/components/ui/") && !f.startsWith("src/integrations/"));
  it("ingen rå <img> utenfor Thumbnail og unntakene", () => {
    const hits = all.filter((f) => f.endsWith(".tsx") && !THUMBNAIL_EXCEPTIONS[f] && /<img\b/.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
    expect(hits).toEqual([]);
  });
  it("ingen beskjæring (object-cover, object-fill, bg-cover, background-size: cover) utenfor unntakene", () => {
    const hits = all.filter((f) => !THUMBNAIL_EXCEPTIONS[f] && /object-cover|object-fill|bg-cover|background-size:\s*cover|objectFit:\s*["']cover/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
  it("ingen <img> eller Thumbnail med aspect-square på selve bildet", () => {
    const hits = all.filter((f) => /<(img|Thumbnail)\b[^>]*aspect-square/s.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
