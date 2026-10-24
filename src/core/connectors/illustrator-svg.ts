/**
 * C-7 Illustrator: ren SVG-modell for lag og grupper, delt av appen, SDK-et og vertslaget (CEP nå, UXP senere).
 * Ingen prosjektstatus og ingen DOM, så samme kode kan kjøre i CEP-panelet, i en fremtidig UXP-plugin og i testene.
 *
 * - `buildIllustratorSvg`: artboard i nøyaktig ressursens pikselstørrelse (width/height i px og viewBox 0 0 W H,
 *   som Illustrator åpner som W×H pt = W×H px ved 72 ppi). Toppnivå-<g> blir lag, nestede <g> blir grupper.
 *   Lagnavn står i `data-name` (Illustrators eget attributt) og `inkscape:label`; skjulte lag får display="none".
 * - `readIllustratorSvg`: leser treet tilbake, også fra Illustrators egen SVG-eksport (data-name, id med _x5F_).
 * - Koblingen (`IllustratorLink`) ligger i <metadata> og i dokumentets XMP, aldri i filnavnet.
 * Takhøyder er per fil.
 */
export const ILLUSTRATOR_CLIENT_ID = "ptg.illustrator";
export const ILLUSTRATOR_ADAPTER = { id: "adobe-illustrator-cep", version: "1" } as const;
export const ILLUSTRATOR_XMP_NS = "http://pentoglass.com/ns/ptg/1.0/";
export const ILLUSTRATOR_MAX_LAYERS = 500;
export const ILLUSTRATOR_MAX_DEPTH = 16;
export const ILLUSTRATOR_MAX_SVG_BYTES = 64 * 1024 * 1024;
export const ILLUSTRATOR_MAX_SIDE = 16384;

export interface IllustratorImage { readonly href: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface IllustratorNode {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly image?: IllustratorImage;
  /** Gruppe: barn i stablerekkefølge (nederst først, som i SVG). */
  readonly children?: readonly IllustratorNode[];
}
export interface IllustratorLink {
  readonly projectId: string;
  readonly manifestId: string;
  /** Ressursmål for retur (ny kandidatversjon). Null når pakken bare gjelder et storyboardpanel. */
  readonly assetId: string | null;
  readonly variantId: string | null;
  readonly versionId: string | null;
  readonly panelId: string | null;
  readonly revision: number;
}
export interface IllustratorDoc { readonly width: number; readonly height: number; readonly dpi: number; readonly layers: readonly IllustratorNode[]; readonly link: IllustratorLink | null }

const esc = (s: string) => s.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const unesc = (s: string) => s.replace(/&(lt|gt|amp|quot|apos|#x?[0-9a-fA-F]+);/g, (_, e: string) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" } as Record<string, string>)[e]!);
const idOf = (s: string) => ("ptg-" + s).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
const num = (n: number) => String(Math.round(n * 1000) / 1000);
const ID_RE = /^[0-9a-zA-Z_-]{1,80}$/;

function countNodes(nodes: readonly IllustratorNode[], depth = 0): number {
  if (depth > ILLUSTRATOR_MAX_DEPTH) throw new Error("svg_depth");
  return nodes.reduce((n, x) => n + 1 + countNodes(x.children ?? [], depth + 1), 0);
}

export function buildIllustratorSvg(doc: IllustratorDoc): string {
  const { width: W, height: H } = doc;
  if (!(W >= 1 && H >= 1 && W <= ILLUSTRATOR_MAX_SIDE && H <= ILLUSTRATOR_MAX_SIDE)) throw new Error("svg_size");
  if (countNodes(doc.layers) > ILLUSTRATOR_MAX_LAYERS) throw new Error("svg_layers");
  const node = (n: IllustratorNode, top: boolean): string => {
    const attrs = [`id="${idOf(n.id)}"`, `data-name="${esc(n.name)}"`, `inkscape:label="${esc(n.name)}"`, top ? 'inkscape:groupmode="layer"' : "", `data-ptg-id="${esc(n.id)}"`,
      n.opacity < 1 ? `opacity="${num(n.opacity)}"` : "", n.visible ? "" : 'display="none"'].filter(Boolean).join(" ");
    const img = n.image ? `<image x="${num(n.image.x)}" y="${num(n.image.y)}" width="${num(n.image.width)}" height="${num(n.image.height)}" href="${esc(n.image.href)}"/>` : "";
    return `<g ${attrs}>${img}${(n.children ?? []).map(c => node(c, false)).join("")}</g>`;
  };
  const meta = doc.link ? `<metadata><ptg:link xmlns:ptg="${ILLUSTRATOR_XMP_NS}">${esc(JSON.stringify(doc.link))}</ptg:link><ptg:dpi xmlns:ptg="${ILLUSTRATOR_XMP_NS}">${num(doc.dpi)}</ptg:dpi></metadata>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" version="1.1" width="${W}px" height="${H}px" viewBox="0 0 ${W} ${H}">${meta}${doc.layers.map(l => node(l, true)).join("")}</svg>\n`;
}

/** Leser lenken fra <metadata> eller fra XMP-tekst. Bare ID-er i riktig form godtas. */
export function parseIllustratorLink(text: string): IllustratorLink | null {
  const m = /<ptg:link[^>]*>([^<]*)<\/ptg:link>/.exec(text);
  if (!m) return null;
  let v: Record<string, unknown>;
  try { v = JSON.parse(unesc(m[1]!)); } catch { return null; }
  const id = (k: string) => (typeof v[k] === "string" && ID_RE.test(v[k] as string) ? (v[k] as string) : null);
  const projectId = id("projectId"), manifestId = id("manifestId");
  if (!projectId || !manifestId) return null;
  const link = { projectId, manifestId, assetId: id("assetId"), variantId: id("variantId"), versionId: id("versionId"), panelId: id("panelId"), revision: Number.isInteger(v["revision"]) ? (v["revision"] as number) : 0 };
  if (!link.panelId && !(link.assetId && link.variantId)) return null;
  return link;
}

/** XMP-pakke for Illustrator-dokumentet (skrives via vertslaget til app.activeDocument.XMPString). */
export function illustratorXmp(link: IllustratorLink): string {
  return `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:ptg="${ILLUSTRATOR_XMP_NS}"><ptg:link>${esc(JSON.stringify(link))}</ptg:link></rdf:Description></rdf:RDF></x:xmpmeta>`;
}

interface Tag { name: string; attrs: Record<string, string>; children: Tag[] }
/** Liten, streng XML-leser for SVG (ingen DTD/entiteter utover de fem standard). */
function parseXml(src: string): Tag {
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(src)) throw new Error("svg_dtd");
  const root: Tag = { name: "#root", attrs: {}, children: [] }, stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  for (let m; (m = re.exec(src)); ) {
    if (m[1]) { if (stack.length > 1 && stack.at(-1)!.name === m[1]) stack.pop(); continue; }
    if (!m[2]) continue;
    const attrs: Record<string, string> = {};
    for (const a of m[3]!.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]!] = unesc(a[2] ?? a[3] ?? "");
    const t: Tag = { name: m[2], attrs, children: [] };
    stack.at(-1)!.children.push(t);
    if (!m[4]) { stack.push(t); if (stack.length > ILLUSTRATOR_MAX_DEPTH + 4) throw new Error("svg_depth"); }
  }
  return root;
}
const px = (s: string | undefined) => { const n = parseFloat(s ?? ""); return Number.isFinite(n) ? n : 0; };
/** Illustrator skriver «_x5F_» for «_» og «_x20_» for mellomrom i id-er. */
const aiId = (s: string) => s.replace(/_x([0-9A-F]{2,4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

export function readIllustratorSvg(svg: string): IllustratorDoc {
  if (svg.length > ILLUSTRATOR_MAX_SVG_BYTES) throw new Error("svg_too_large");
  const root = parseXml(svg).children.find(t => t.name === "svg");
  if (!root) throw new Error("not_svg");
  const vb = (root.attrs["viewBox"] ?? "").split(/[\s,]+/).map(Number);
  const width = vb.length === 4 && vb[2]! > 0 ? vb[2]! : px(root.attrs["width"]);
  const height = vb.length === 4 && vb[3]! > 0 ? vb[3]! : px(root.attrs["height"]);
  let count = 0;
  const node = (t: Tag, i: number): IllustratorNode => {
    if (++count > ILLUSTRATOR_MAX_LAYERS) throw new Error("svg_layers");
    const rawId = t.attrs["data-ptg-id"] ?? aiId(t.attrs["id"] ?? `layer-${i}`).replace(/^ptg-/, "");
    const name = t.attrs["data-name"] ?? t.attrs["inkscape:label"] ?? aiId(t.attrs["id"] ?? `Layer ${i + 1}`);
    const style = t.attrs["style"] ?? "";
    const visible = t.attrs["display"] !== "none" && !/display\s*:\s*none/.test(style) && t.attrs["visibility"] !== "hidden";
    const op = t.attrs["opacity"] ?? /opacity\s*:\s*([\d.]+)/.exec(style)?.[1];
    const imgTag = t.children.find(c => c.name === "image");
    const image = imgTag ? { href: imgTag.attrs["href"] ?? imgTag.attrs["xlink:href"] ?? "", x: px(imgTag.attrs["x"]), y: px(imgTag.attrs["y"]), width: px(imgTag.attrs["width"]), height: px(imgTag.attrs["height"]) } : undefined;
    const groups = t.children.filter(c => c.name === "g");
    return { id: rawId, name, visible, opacity: op === undefined ? 1 : Math.max(0, Math.min(1, Number(op))), ...(image ? { image } : {}), ...(groups.length ? { children: groups.map(node) } : {}) };
  };
  const layers = root.children.filter(c => c.name === "g").map(node);
  const dpiMatch = /<ptg:dpi[^>]*>([\d.]+)<\/ptg:dpi>/.exec(svg);
  return { width, height, dpi: dpiMatch ? Number(dpiMatch[1]) : 72, layers, link: parseIllustratorLink(svg) };
}

/** Målet for C-0-mottaket, eller null når pakken bare gjelder et panel (C-1-retursiden brukes da). */
export const illustratorUploadTarget = (l: IllustratorLink) =>
  l.assetId && l.variantId ? { assetId: l.assetId, variantId: l.variantId, baseVersionId: l.versionId } : null;
