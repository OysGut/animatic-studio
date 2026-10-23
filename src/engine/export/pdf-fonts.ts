/**
 * G-1b punkt 5: Noto-fonter for PDF i nettleseren. Lastes først når teksten trenger dem (CJK-filene er
 * store), og hver fil hentes bare én gang per økt. jsPDF bygger bare inn glyfene som brukes (delsett).
 * Lisens: SIL Open Font License 1.1 (public/fonts/pdf/OFL.txt).
 */
import type { jsPDF } from "jspdf";
import { RTL_SCRIPTS, scriptRuns, type NotoScript } from "@/core/typography/pdf-scripts";
import scAsset from "@/assets/fonts/NotoSansSC.ttf.asset.json";

export const NOTO_FONT_FILES: Record<NotoScript, string> = {
  latin: "/fonts/pdf/NotoSans-Regular.ttf",
  jp: "/fonts/pdf/NotoSansJP.ttf",
  kr: "/fonts/pdf/NotoSansKR.ttf",
  sc: scAsset.url,
  arabic: "/fonts/pdf/NotoSansArabic-Regular.ttf",
  hebrew: "/fonts/pdf/NotoSansHebrew-Regular.ttf",
  devanagari: "/fonts/pdf/NotoSansDevanagari-Regular.ttf",
  thai: "/fonts/pdf/NotoSansThai-Regular.ttf",
};

export type NotoFonts = Partial<Record<NotoScript, string>>;

const cache = new Map<NotoScript, Promise<string>>();

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Laster fontene (base64 TTF) for skriftsystemene. Feiler lastingen, kastes feilen (ingen stille reserve). */
export async function loadNotoFonts(scripts: readonly NotoScript[]): Promise<NotoFonts> {
  const out: NotoFonts = {};
  for (const s of scripts) {
    if (!cache.has(s))
      cache.set(
        s,
        fetch(NOTO_FONT_FILES[s]).then(async (r) => {
          if (!r.ok) throw new Error(`font ${s}: ${r.status}`);
          return toBase64(new Uint8Array(await r.arrayBuffer()));
        }),
      );
    try {
      out[s] = await cache.get(s)!;
    } catch (e) {
      cache.delete(s);
      throw e;
    }
  }
  return out;
}

/** Registrerer fontene i dokumentet; gir navnet per skriftsystem. */
export function registerNotoFonts(doc: jsPDF, fonts: NotoFonts, prefix = "Noto"): Partial<Record<NotoScript, string>> {
  const names: Partial<Record<NotoScript, string>> = {};
  for (const [s, data] of Object.entries(fonts) as [NotoScript, string][]) {
    const file = `${prefix}-${s}.ttf`;
    doc.addFileToVFS(file, data);
    doc.addFont(file, `${prefix}-${s}`, "normal");
    names[s] = `${prefix}-${s}`;
  }
  return names;
}

/**
 * Tegner teksten løp for løp med riktig font, fra venstre (x i dokumentets enhet). Høyre-til-venstre-løp
 * sendes til jsPDFs bidi-motor. Returnerer bredden som ble brukt.
 */
export function drawRuns(
  doc: jsPDF,
  names: Partial<Record<NotoScript, string>>,
  text: string,
  x: number,
  y: number,
  language?: string,
): number {
  let cx = x;
  for (const r of scriptRuns(text, language)) {
    const name = names[r.script] ?? names.latin;
    if (name) doc.setFont(name, "normal");
    if (RTL_SCRIPTS.has(r.script)) doc.text(r.text, cx, y, { isInputVisual: false, isOutputVisual: true } as never);
    else doc.text(r.text, cx, y);
    cx += doc.getTextWidth(r.text);
  }
  return cx - x;
}

/** Bredden på teksten med fontene (for midtstilling). */
export function runsWidth(doc: jsPDF, names: Partial<Record<NotoScript, string>>, text: string, language?: string): number {
  let w = 0;
  for (const r of scriptRuns(text, language)) {
    const name = names[r.script] ?? names.latin;
    if (name) doc.setFont(name, "normal");
    w += doc.getTextWidth(r.text);
  }
  return w;
}
