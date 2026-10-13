/**
 * Siste bilde i en AI-video (REQ-0263, DEC-0070): hentes ut i nettleseren når videoen legges inn og lagres
 * ved siden av videoen (`…/films/<take>/last-frame.png`). Neste segment kan bruke det som startbilde, så
 * figurer, lys og kamera fortsetter der forrige segment sluttet. Feiler det, går alt annet som før.
 */
import { lastFramePath } from "@/core";
import { ASSET_BUCKET, uploadFile } from "@/adapters/browser/storage-files";

/** PNG av siste bilde i videoen, eller null (nettleseren kunne ikke lese den innen 15 sekunder). */
export async function extractLastFrame(video: Blob): Promise<Blob | null> {
  return Promise.race([
    extract(video),
    new Promise<null>((ok) => setTimeout(() => ok(null), 15_000)),
  ]);
}

async function extract(video: Blob): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(video);
  const el = document.createElement("video");
  el.muted = true;
  el.preload = "auto";
  el.playsInline = true;
  el.src = url;
  try {
    await new Promise<void>((ok, fail) => {
      el.onloadedmetadata = () => ok();
      el.onerror = () => fail(new Error("video"));
    });
    const t = Math.max(0, (Number.isFinite(el.duration) ? el.duration : 0) - 0.05);
    await new Promise<void>((ok, fail) => {
      el.onseeked = () => ok();
      el.onerror = () => fail(new Error("seek"));
      el.currentTime = t;
    });
    const w = el.videoWidth;
    const h = el.videoHeight;
    if (!w || !h) return null;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(el, 0, 0, w, h);
    return await new Promise<Blob | null>((ok) => canvas.toBlob((b) => ok(b), "image/png"));
  } catch {
    return null;
  } finally {
    el.removeAttribute("src");
    el.load();
    URL.revokeObjectURL(url);
  }
}

/** Lagre siste bilde ved siden av videoen. Gir stien, eller null. */
export async function storeLastFrame(resultPath: string, video: Blob): Promise<string | null> {
  const path = lastFramePath(resultPath);
  if (!path) return null;
  const png = await extractLastFrame(video);
  if (!png) return null;
  const error = await uploadFile(ASSET_BUCKET, path, png, {
    contentType: "image/png",
    upsert: false,
  });
  // Finnes allerede (lagt inn fra en annen fane): like bra
  if (error && !/exists|duplicate/i.test(error.message)) return null;
  return path;
}
