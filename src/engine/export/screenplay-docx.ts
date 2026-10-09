/**
 * Manuseksport til DOCX (mandat 5.3, REQ-0087 – prioritert format). Lager et redigerbart Word-dokument med
 * manusformat: US Letter, Courier 12 pt, faste innrykk per elementtype, scenenumre i begge marger og sidetall
 * øverst til høyre fra side 2. Word bryter selv sidene; (MORE)/(CONT'D) settes ikke inn automatisk i Word.
 */
import { zipSync, strToU8 } from "fflate";
import type { BlockKind } from "@/core";
import type { PaginationScene } from "@/core/screenplay";

const TW = 20; // twips per punkt
const PAGE_W = 612 * TW;
const PAGE_H = 792 * TW;
const MARGIN_LEFT = 108 * TW; // 1,5"
// 61 tegn handlingsbredde som i Final Draft, pluss 1 pt slakk så tekstbehandlere ikke bryter én bokstav for tidlig
const SLACK = 1 * TW;
const MARGIN_RIGHT = (612 - 108 - 61 * 7.2) * TW - SLACK;
const COLUMN = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;
const LINE = 12 * TW;
const CH = 7.2 * TW;

interface ParaStyle {
  readonly left: number; // innrykk i tegn fra venstre marg
  readonly width: number | null; // tegn, null = til høyre marg
  readonly before: number; // tomme linjer før
  readonly keepNext: boolean;
  readonly align?: "right";
  readonly upper?: boolean;
}

const STYLES: Record<BlockKind, ParaStyle> = {
  heading: { left: 0, width: null, before: 2, keepNext: true, upper: true },
  action: { left: 0, width: null, before: 1, keepNext: false },
  shot: { left: 0, width: null, before: 1, keepNext: true, upper: true },
  note: { left: 0, width: null, before: 1, keepNext: false },
  character: { left: 20, width: 38, before: 1, keepNext: true, upper: true },
  parenthetical: { left: 14, width: 25, before: 0, keepNext: true },
  dialogue: { left: 10, width: 35, before: 0, keepNext: false },
  transition: { left: 0, width: null, before: 1, keepNext: false, align: "right", upper: true },
};

// eslint-disable-next-line no-control-regex
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

function esc(s: string): string {
  // XML 1.0 tillater ikke kontrolltegn (unntatt tab, LF, CR) – Word nekter å åpne filen
  return s
    .replace(XML_ILLEGAL, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function runs(text: string): string {
  return text
    .split("\n")
    .map(
      (line, i) =>
        `${i > 0 ? "<w:r><w:br/></w:r>" : ""}<w:r><w:t xml:space="preserve">${esc(line)}</w:t></w:r>`,
    )
    .join("");
}

function para(kind: BlockKind, text: string, first: boolean, extra = ""): string {
  const st = STYLES[kind];
  // Innledende linjeskift = forfatterens ekstra tomme linjer
  const lead = /^\n*/.exec(text)![0].length;
  const body = text.slice(lead);
  const before = (first ? 0 : st.before + lead) * LINE;
  const left = Math.round(st.left * CH);
  const right =
    st.width === null ? 0 : Math.max(0, Math.round(COLUMN - left - st.width * CH - SLACK));
  const ppr =
    `<w:pPr>${st.keepNext ? "<w:keepNext/>" : ""}<w:spacing w:before="${before}" w:after="0" w:line="${LINE}" w:lineRule="exact"/>` +
    `<w:ind w:left="${left}" w:right="${right}"/>${st.align ? `<w:jc w:val="${st.align}"/>` : ""}${extra}</w:pPr>`;
  return `<w:p>${ppr}${runs(st.upper ? body.toUpperCase() : body)}</w:p>`;
}

function headingPara(number: string | null, text: string, first: boolean): string {
  const before = first ? 0 : 2 * LINE;
  const hang = Math.round(54 * TW); // nummeret står 0,75" fra papirkanten
  const rightTab = Math.round((516.6 - 108) * TW);
  const ppr =
    `<w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="0" w:line="${LINE}" w:lineRule="exact"/>` +
    `<w:tabs><w:tab w:val="left" w:pos="0"/><w:tab w:val="left" w:pos="${rightTab}"/></w:tabs>` +
    `<w:ind w:left="0" w:hanging="${hang}"/></w:pPr>`;
  const t = esc(text.toUpperCase());
  if (number === null)
    return `<w:p>${ppr}<w:r><w:tab/><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const n = esc(number);
  return `<w:p>${ppr}<w:r><w:t>${n}</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve">${t}</w:t></w:r><w:r><w:tab/><w:t>${n}</w:t></w:r></w:p>`;
}

const RPR = `<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New" w:eastAsia="Courier New"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="nb-NO"/>`;

function sectPr(opts: { header: boolean; titlePg: boolean; start?: number }): string {
  return (
    `<w:sectPr>${opts.header ? `<w:headerReference w:type="default" r:id="rIdHeader"/>` : ""}` +
    `<w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/>` +
    `<w:pgMar w:top="${72 * TW}" w:right="${Math.round(MARGIN_RIGHT)}" w:bottom="${72 * TW}" w:left="${MARGIN_LEFT}" w:header="${36 * TW}" w:footer="${36 * TW}" w:gutter="0"/>` +
    `${opts.start !== undefined ? `<w:pgNumType w:start="${opts.start}"/>` : ""}${opts.titlePg ? "<w:titlePg/>" : ""}</w:sectPr>`
  );
}

export interface DocxOptions {
  readonly title?: string;
  readonly titlePage?: readonly string[];
}

export function screenplayDocx(
  scenes: readonly PaginationScene[],
  opts: DocxOptions = {},
): Uint8Array {
  const body: string[] = [];
  if (opts.titlePage?.length) {
    opts.titlePage.forEach((t, i) => {
      body.push(
        `<w:p><w:pPr><w:spacing w:before="${i === 0 ? 14 * LINE : LINE}" w:after="0" w:line="${LINE}" w:lineRule="exact"/><w:jc w:val="center"/></w:pPr>${runs(t)}</w:p>`,
      );
    });
    // Seksjonsskift: tittelsiden har ikke sidetall, manuset starter på side 1
    body.push(`<w:p><w:pPr>${sectPr({ header: false, titlePg: false })}</w:pPr></w:p>`);
  }
  let first = true;
  for (const sc of scenes) {
    body.push(headingPara(sc.number, sc.headingText, first));
    first = false;
    for (const b of sc.blocks) body.push(para(b.kind, b.text, false));
  }
  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:body>${body.join("")}${sectPr({ header: true, titlePg: true, start: 1 })}</w:body></w:document>`;

  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr>${RPR}</w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="${LINE}" w:lineRule="exact"/><w:widowControl w:val="0"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

  const header =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:p><w:pPr><w:jc w:val="right"/><w:ind w:right="${Math.max(0, Math.round(PAGE_W - MARGIN_RIGHT - 522.4 * TW))}"/></w:pPr>` +
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>2</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    `<w:r><w:t>.</w:t></w:r></w:p></w:hdr>`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
        `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `</Relationships>`,
    ),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>` +
        `</Relationships>`,
    ),
    "word/document.xml": strToU8(document),
    "word/styles.xml": strToU8(styles),
    "word/header1.xml": strToU8(header),
    "docProps/core.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
        `<dc:title>${esc(opts.title ?? "Manus")}</dc:title><dc:creator>Animatic Studio</dc:creator></cp:coreProperties>`,
    ),
  };
  // Fast tidsstempel gir like filer for like manus
  return zipSync(files, { level: 6, mtime: new Date("2026-01-01T00:00:00Z") });
}
