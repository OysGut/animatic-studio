/**
 * Trykk-PDF av plakater og karakterkart (M8 del 1, DEC-0061, REQ-0397).
 *
 * Skrevet for hånd (PDF 1.4) fra tegnelisten i `renderPoster`, slik at teksten blir ekte tekst i
 * PDF-standardskriftene (Helvetica og Times, WinAnsi) med samme linjebryting som forhåndsvisningen. Bildene
 * legges inn i trykkoppløsning (opptil 300 ppi i den størrelsen de vises) med gjennomsiktighet (SMask).
 * Siden har utfallende kant (BleedBox) og skjæremerker utenfor den; TrimBox er det ferdige formatet.
 *
 * Ingen nettleseravhengigheter her: bildene hentes og pakkes av funksjoner som sendes inn.
 */
import {
  MM_TO_PT,
  PDF_FONT_NAME,
  bleedOps,
  winAnsiCode,
  type PosterFontKey,
  type RenderOp,
} from "@/core";

export interface PdfImage {
  readonly width: number;
  readonly height: number;
  /** RGB, 3 byte per piksel. */
  readonly rgb: Uint8Array;
  /** Dekkevne, 1 byte per piksel (null: helt dekkende). */
  readonly alpha: Uint8Array | null;
}

export interface PosterPdfOptions {
  readonly widthMm: number;
  readonly heightMm: number;
  /** Utfallende kant i mm (vanlig: 3). 0 = uten. */
  readonly bleedMm: number;
  /** Skjæremerker utenfor den utfallende kanten. */
  readonly cropMarks: boolean;
  readonly title: string;
  /** Største oppløsning for bildene (ppi i trykket størrelse). */
  readonly ppi?: number;
}

/** Plassen rundt den utfallende kanten der skjæremerkene står (mm). */
export const MARK_AREA_MM = 10;

const FONTS: readonly PosterFontKey[] = ["sans", "sansBold", "serif", "serifBold", "serifItalic"];

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const v = parseInt(m[1]!, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** PDF-streng i WinAnsi med escape for spesialtegn. */
export function pdfString(text: string): string {
  let out = "(";
  for (const ch of text) {
    const c = winAnsiCode(ch);
    if (c === 0x28 || c === 0x29 || c === 0x5c) out += "\\" + String.fromCharCode(c);
    else if (c < 0x20 || c > 0x7e) out += "\\" + c.toString(8).padStart(3, "0");
    else out += String.fromCharCode(c);
  }
  return out + ")";
}

/** Tekst i informasjonsordboken (UTF-16BE med BOM, heksadesimal). */
function pdfTextString(text: string): string {
  let hex = "<FEFF";
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, "0");
  return hex + ">";
}

/** Sti for et rektangel med avrundede hjørner (mm, y nedover). */
function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr <= 0) return `${n(x)} ${n(y)} ${n(w)} ${n(h)} re`;
  const k = rr * 0.5523;
  return [
    `${n(x + rr)} ${n(y)} m`,
    `${n(x + w - rr)} ${n(y)} l`,
    `${n(x + w - rr + k)} ${n(y)} ${n(x + w)} ${n(y + rr - k)} ${n(x + w)} ${n(y + rr)} c`,
    `${n(x + w)} ${n(y + h - rr)} l`,
    `${n(x + w)} ${n(y + h - rr + k)} ${n(x + w - rr + k)} ${n(y + h)} ${n(x + w - rr)} ${n(y + h)} c`,
    `${n(x + rr)} ${n(y + h)} l`,
    `${n(x + rr - k)} ${n(y + h)} ${n(x)} ${n(y + h - rr + k)} ${n(x)} ${n(y + h - rr)} c`,
    `${n(x)} ${n(y + rr)} l`,
    `${n(x)} ${n(y + rr - k)} ${n(x + rr - k)} ${n(y)} ${n(x + rr)} ${n(y)} c`,
    "h",
  ].join("\n");
}

function rotate(o: { x: number; y: number; w: number; h: number; rotation: number }): string {
  if (!o.rotation) return "";
  const a = (o.rotation * Math.PI) / 180;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return `1 0 0 1 ${n(cx)} ${n(cy)} cm ${n(c)} ${n(s)} ${n(-s)} ${n(c)} 0 0 cm 1 0 0 1 ${n(-cx)} ${n(-cy)} cm\n`;
}

/** Hvor mange piksler hvert bilde trengs i (største visning, gitt ppi). */
export function imagePixelNeeds(
  ops: readonly RenderOp[],
  ppi: number,
): Map<string, { w: number; h: number }> {
  const out = new Map<string, { w: number; h: number }>();
  for (const o of ops) {
    if (o.op !== "image") continue;
    const w = Math.ceil((o.iw / 25.4) * ppi);
    const h = Math.ceil((o.ih / 25.4) * ppi);
    const prev = out.get(o.mediaPath);
    out.set(o.mediaPath, { w: Math.max(prev?.w ?? 0, w), h: Math.max(prev?.h ?? 0, h) });
  }
  return out;
}

const enc = new TextEncoder();

/**
 * Lager PDF-filen. `loadImage(mediaPath, maxW, maxH)` gir bildet i høyst den størrelsen (eller null:
 * bildet mangler og tegnes som en tom ramme); `deflate` pakker strømmene (zlib, FlateDecode).
 */
export async function posterPdf(
  opsIn: readonly RenderOp[],
  opts: PosterPdfOptions,
  loadImage: (mediaPath: string, maxW: number, maxH: number) => Promise<PdfImage | null>,
  deflate: (bytes: Uint8Array) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const W = opts.widthMm;
  const H = opts.heightMm;
  const bleed = Math.max(0, opts.bleedMm);
  const off = bleed + (opts.cropMarks ? MARK_AREA_MM : 0);
  const pageW = (W + 2 * off) * MM_TO_PT;
  const pageH = (H + 2 * off) * MM_TO_PT;
  const ops = bleedOps(opsIn, W, H, bleed);

  // Objektene: 1 katalog, 2 sider, 3 side, 4 innhold, 5 info, 6.. skrifter, bilder, ExtGState
  const objects: (Uint8Array | null)[] = [];
  const reserve = () => {
    objects.push(null);
    return objects.length;
  };
  const set = (id: number, body: string | Uint8Array) => {
    objects[id - 1] = typeof body === "string" ? enc.encode(body) : body;
  };
  const stream = async (dict: string, data: Uint8Array, compress = true) => {
    const body = compress ? await deflate(data) : data;
    const head = enc.encode(
      `<< ${dict}${compress ? " /Filter /FlateDecode" : ""} /Length ${body.length} >>\nstream\n`,
    );
    const tail = enc.encode("\nendstream");
    const out = new Uint8Array(head.length + body.length + tail.length);
    out.set(head, 0);
    out.set(body, head.length);
    out.set(tail, head.length + body.length);
    return out;
  };

  const catalog = reserve();
  const pages = reserve();
  const page = reserve();
  const content = reserve();
  const info = reserve();
  const fontIds = new Map<PosterFontKey, number>();
  for (const f of FONTS) {
    const id = reserve();
    fontIds.set(f, id);
    set(
      id,
      `<< /Type /Font /Subtype /Type1 /BaseFont /${PDF_FONT_NAME[f]} /Encoding /WinAnsiEncoding >>`,
    );
  }

  // Bildene, ett objekt per fil
  const ppi = opts.ppi ?? 300;
  const needs = imagePixelNeeds(ops, ppi);
  const images = new Map<string, { name: string; id: number }>();
  let imgNo = 0;
  for (const [path, need] of needs) {
    const img = await loadImage(path, Math.min(need.w, 6000), Math.min(need.h, 6000));
    if (!img) continue;
    const id = reserve();
    let smask = "";
    if (img.alpha) {
      const sid = reserve();
      set(
        sid,
        await stream(
          `/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceGray /BitsPerComponent 8`,
          img.alpha,
        ),
      );
      smask = ` /SMask ${sid} 0 R`;
    }
    set(
      id,
      await stream(
        `/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8${smask}`,
        img.rgb,
      ),
    );
    images.set(path, { name: `Im${++imgNo}`, id });
  }

  // Gjennomsiktighet
  const states = new Map<number, string>();
  const gs = (opacity: number) => {
    const a = Math.round(Math.max(0, Math.min(1, opacity)) * 1000) / 1000;
    if (a >= 1) return "";
    let name = states.get(a);
    if (!name) {
      name = `GS${states.size + 1}`;
      states.set(a, name);
    }
    return `/${name} gs\n`;
  };

  // Innholdet: mm med origo øverst til venstre i det ferdige formatet
  const k = MM_TO_PT;
  let c = `${n(k)} 0 0 ${n(-k)} ${n(off * k)} ${n(pageH - off * k)} cm\n`;
  for (const o of ops) {
    if (o.op === "rect") {
      if (!o.fill && !o.stroke) continue;
      c += "q\n" + rotate(o) + gs(o.opacity);
      if (o.fill) c += `${rgb(o.fill).map(n).join(" ")} rg\n`;
      if (o.stroke) c += `${rgb(o.stroke).map(n).join(" ")} RG ${n(o.strokeWidth)} w\n`;
      c += roundRect(o.x, o.y, o.w, o.h, o.radius) + "\n";
      c += o.fill && o.stroke && o.strokeWidth > 0 ? "B\n" : o.fill ? "f\n" : "S\n";
      c += "Q\n";
    } else if (o.op === "line") {
      c += "q\n" + gs(o.opacity);
      c += `${rgb(o.stroke).map(n).join(" ")} RG ${n(o.strokeWidth)} w 1 J\n`;
      if (o.dashed) c += `[${n(o.strokeWidth * 3)} ${n(o.strokeWidth * 2.5)}] 0 d\n`;
      c += `${n(o.x1)} ${n(o.y1)} m ${n(o.x2)} ${n(o.y2)} l S\nQ\n`;
    } else if (o.op === "image") {
      const im = images.get(o.mediaPath);
      c += "q\n" + rotate(o) + gs(o.opacity);
      if (!im) {
        c += `0.6 0.6 0.6 RG 0.5 w ${n(o.x)} ${n(o.y)} ${n(o.w)} ${n(o.h)} re S\nQ\n`;
        continue;
      }
      if (o.clip) c += `${n(o.x)} ${n(o.y)} ${n(o.w)} ${n(o.h)} re W n\n`;
      // Bildet er en enhetsflate; y snus så det står rett
      c += `${n(o.iw)} 0 0 ${n(-o.ih)} ${n(o.ix)} ${n(o.iy + o.ih)} cm /${im.name} Do\nQ\n`;
    } else if (o.op === "text") {
      const sizeMm = o.size * (25.4 / 72);
      const font = `F${FONTS.indexOf(o.font) + 1}`;
      c += "q\n" + rotate(o) + gs(o.opacity);
      c += `${rgb(o.color).map(n).join(" ")} rg\nBT /${font} ${n(sizeMm)} Tf ${n((o.tracking / 1000) * sizeMm)} Tc\n`;
      for (const l of o.lines) {
        if (!l.text) continue;
        c += `1 0 0 -1 ${n(l.x)} ${n(l.y)} Tm ${pdfString(l.text)} Tj\n`;
      }
      c += "ET\nQ\n";
    }
  }
  // Skjæremerker i hjørnene, utenfor den utfallende kanten
  if (opts.cropMarks) {
    const gap = bleed + 2;
    const len = MARK_AREA_MM - 2;
    c += "q\n0 0 0 RG 0.1 w\n";
    for (const [x, y, dx, dy] of [
      [0, 0, -1, -1],
      [W, 0, 1, -1],
      [0, H, -1, 1],
      [W, H, 1, 1],
    ] as const) {
      c += `${n(x + dx * gap)} ${n(y)} m ${n(x + dx * (gap + len))} ${n(y)} l S\n`;
      c += `${n(x)} ${n(y + dy * gap)} m ${n(x)} ${n(y + dy * (gap + len))} l S\n`;
    }
    c += "Q\n";
  }
  set(content, await stream("", enc.encode(c)));

  const fontRes = FONTS.map((f, i) => `/F${i + 1} ${fontIds.get(f)} 0 R`).join(" ");
  const imgRes = [...images.values()].map((i) => `/${i.name} ${i.id} 0 R`).join(" ");
  const gsRes = [...states]
    .map(([a, name]) => `/${name} << /Type /ExtGState /ca ${a} /CA ${a} >>`)
    .join(" ");
  const box = (mm: number) =>
    `[${n((off - mm) * k)} ${n((off - mm) * k)} ${n(pageW - (off - mm) * k)} ${n(pageH - (off - mm) * k)}]`;
  set(
    page,
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${n(pageW)} ${n(pageH)}] /BleedBox ${box(bleed)} /TrimBox ${box(0)} /Contents ${content} 0 R /Resources << /Font << ${fontRes} >>${imgRes ? ` /XObject << ${imgRes} >>` : ""}${gsRes ? ` /ExtGState << ${gsRes} >>` : ""} >> >>`,
  );
  set(pages, `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`);
  set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`);
  set(info, `<< /Title ${pdfTextString(opts.title)} /Producer (Animatic Studio) >>`);

  // Filen med kryssreferanser
  // Binærkommentaren (bytes over 127) forteller at filen er binær
  const header = new Uint8Array([...enc.encode("%PDF-1.4\n%"), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);
  const parts: Uint8Array[] = [header];
  let pos = header.length;
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pos);
    const head = enc.encode(`${i + 1} 0 obj\n`);
    const tail = enc.encode("\nendobj\n");
    parts.push(head, body ?? enc.encode("null"), tail);
    pos += head.length + (body ?? enc.encode("null")).length + tail.length;
  });
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  parts.push(enc.encode(xref));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** zlib-pakking med nettleserens (og Nodes) CompressionStream. */
export async function deflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(cs));
  return new Uint8Array(await res.arrayBuffer());
}
