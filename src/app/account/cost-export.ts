/**
 * Eksport av kostnadsrapporten (DEC-0086) til PDF, Word og Excel i nettleseren. Bibliotekene lastes først når
 * brukeren eksporterer (jspdf + jspdf-autotable, docx, exceljs; alle med åpen kildekode, ingen nettverkskall).
 * Oppbygningen er lik i alle tre: tittel og prosjektnavn øverst, opplysninger om rapporten, sammendrag,
 * fordelinger, linjene og merknadene.
 */
import { locale, type CostReport, type CostReportGroup } from "@/core";
import { t } from "@/core/i18n/keyed";

export type ExportFormat = "pdf" | "docx" | "xlsx";

const num = (n: number | null, digits = 2) =>
  n === null
    ? "–"
    : n.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(locale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Filnavn: «kostnader-<prosjekt>-<periode>.<ext>». */
export function reportFileName(r: CostReport, ext: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "rapport";
  // i18n-ignore: filnavn
  return `kostnader-${slug(r.projectName)}-${slug(r.periodLabel)}.${ext}`;
}

/** Opplysningene øverst i rapporten. */
export function reportFacts(r: CostReport): [string, string][] {
  return [
    [t("app-account-cost-export.report-facts.message.c0c6bff0e0cd"), r.projectName],
    [t("app-account-cost-export.report-facts.message.d9b58a50cb38"), r.scopeLabel],
    [t("app-account-cost-export.report-facts.message.55cf897e6d1b"), r.periodLabel],
    [t("app-account-cost-export.report-facts.message.dbf0ccafb17c"), dateTime(r.generatedAt)],
    [t("app-account-cost-export.report-facts.message.3698666b5510"), r.generatedBy],
    [
      t("app-account-cost-export.report-facts.message.bfb35afec136"),
      r.currency === "NOK"
        ? t("app-account-cost-export.report-facts.message.3c7ac6f3ac85")
        : "USD",
    ],
    [t("app-account-cost-export.report-facts.message.4ca2bf78d649"), String(r.lines.length)],
    [t("app-account-cost-export.report-facts.message.080892203a0f"), num(r.totalUsd)],
    ...(r.currency === "NOK"
      ? ([[t("app-account-cost-export.report-facts.message.6e238939eae9"), num(r.totalNok)]] as [string, string][])
      : []),
  ];
}

export function groupHead(r: CostReport, first: string): string[] {
  return [first, t("app-account-cost-export.group-head.message.f1fb1150290a"), "USD", ...(r.currency === "NOK" ? ["NOK"] : [])];
}
export function groupRows(r: CostReport, g: readonly CostReportGroup[]): string[][] {
  return g.map((x) => [
    x.key,
    String(x.count),
    num(x.usd),
    ...(r.currency === "NOK" ? [num(x.nok)] : []),
  ]);
}

export function lineHead(r: CostReport): string[] {
  return [
    t("app-account-cost-export.line-head.message.7d285296cd7a"),
    t("app-account-cost-export.line-head.message.19ab8b6773d8"),
    t("app-account-cost-export.line-head.message.56bfe4ac24fa"),
    t("app-account-cost-export.line-head.message.b565a5abdaa9"),
    t("app-account-cost-export.line-head.message.92dc4d45163e"),
    t("app-account-cost-export.line-head.message.2f10fe10f8a8"),
    t("app-account-cost-export.line-head.message.ed1d835b3dfc"),
    t("app-account-cost-export.line-head.message.4657045ba1c1"),
    t("app-account-cost-export.line-head.message.ab6763cf1bf0"),
    t("app-account-cost-export.line-head.message.a3947b231010"),
    t("app-account-cost-export.line-head.message.781fec263d62"),
    ...(r.currency === "NOK" ? [t("app-account-cost-export.line-head.message.cdcc7d064d19"), t("app-account-cost-export.line-head.message.bb8a7ec7ffd7")] : []),
    t("app-account-cost-export.line-head.message.5059e628802d"),
    t("app-account-cost-export.line-head.message.02cbde28d51d"),
  ];
}

export function lineRows(r: CostReport): string[][] {
  return r.lines.map((l) => [
    dateTime(l.date),
    l.projectName,
    l.user,
    l.provider,
    l.model,
    l.kind,
    l.subject,
    `${num(l.quantity, l.quantity % 1 ? 1 : 0)} ${l.unit}`,
    num(l.unitPriceUsd, 4),
    num(l.amountUsd),
    l.credits === null ? "" : String(l.credits),
    ...(r.currency === "NOK" ? [num(l.rate, 4), num(l.amountNok)] : []),
    l.status,
    l.externalId,
  ]);
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function exportCostReport(r: CostReport, format: ExportFormat): Promise<void> {
  if (format === "pdf") return download(await toPdf(r), reportFileName(r, "pdf"));
  if (format === "docx") return download(await toDocx(r), reportFileName(r, "docx"));
  return download(await toXlsx(r), reportFileName(r, "xlsx"));
}

// ---------------------------------------------------------------- PDF

export async function toPdf(r: CostReport): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  doc.setFontSize(16);
  doc.text(r.projectName, margin, 16);
  doc.setFontSize(11);
  doc.text(r.title, margin, 23);
  const facts = reportFacts(r);
  autoTable(doc, {
    startY: 28,
    body: facts,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 0.8 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } },
    margin: { left: margin, right: margin },
  });
  const section = (title: string, head: string[], body: string[][]) => {
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
    doc.setFontSize(11);
    doc.text(title, margin, y);
    autoTable(doc, {
      startY: y + 2,
      head: [head],
      body,
      styles: { fontSize: 7.5, cellPadding: 1 },
      headStyles: { fillColor: [60, 60, 60] },
      margin: { left: margin, right: margin },
    });
  };
  section(
    t("app-account-cost-export.to-pdf.section.36355e558392"),
    groupHead(r, t("app-account-cost-export.to-pdf.group-head.0738a7a01d71")),
    groupRows(r, r.byService),
  );
  section(t("app-account-cost-export.to-pdf.section.ef1ad36a484e"), groupHead(r, t("app-account-cost-export.to-pdf.group-head.3d047da8f73d")), groupRows(r, r.byMonth));
  section(
    t("app-account-cost-export.to-pdf.section.5616ad5d4813"),
    groupHead(r, t("app-account-cost-export.to-pdf.group-head.023ef4286b0e")),
    groupRows(r, r.byUser),
  );
  section(t("app-account-cost-export.to-pdf.section.f2ab0c46b3df"), lineHead(r), lineRows(r));
  section(
    t("app-account-cost-export.to-pdf.section.09af60a8f34f"),
    [t("app-account-cost-export.to-pdf.section.7f2da456ec9d")],
    r.notes.map((n) => [n]),
  );
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      t("app-account-cost-export.to-pdf.doc-text.4983827296a1", { projectName: String(r.projectName), i: String(i), pages: String(pages) }),
      margin,
      doc.internal.pageSize.getHeight() - 6,
    );
  }
  return doc.output("blob");
}

// ---------------------------------------------------------------- Word

export async function toDocx(r: CostReport): Promise<Blob> {
  const d = await import("docx");
  const cell = (text: string, bold = false) =>
    new d.TableCell({
      children: [new d.Paragraph({ children: [new d.TextRun({ text, bold, size: 16 })] })],
    });
  const table = (head: string[], body: string[][]) =>
    new d.Table({
      width: { size: 100, type: d.WidthType.PERCENTAGE },
      rows: [
        new d.TableRow({ tableHeader: true, children: head.map((h) => cell(h, true)) }),
        ...body.map((row) => new d.TableRow({ children: row.map((c) => cell(c)) })),
      ],
    });
  const h = (text: string, level: (typeof d.HeadingLevel)[keyof typeof d.HeadingLevel]) =>
    new d.Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });
  const doc = new d.Document({
    creator: "Animatic Studio",
    title: `${r.projectName} – ${r.title}`,
    sections: [
      {
        properties: { page: { size: { orientation: d.PageOrientation.LANDSCAPE } } },
        children: [
          h(r.projectName, d.HeadingLevel.TITLE),
          h(r.title, d.HeadingLevel.HEADING_1),
          table([t("app-account-cost-export.children.table.155b0ad70670"), t("app-account-cost-export.children.table.c2853bf5d369")], reportFacts(r)),
          h(t("app-account-cost-export.children.h.2cee2cdfef55"), d.HeadingLevel.HEADING_2),
          table(groupHead(r, t("app-account-cost-export.children.group-head.6a237165c76a")), groupRows(r, r.byService)),
          h(t("app-account-cost-export.children.h.d911c0c60146"), d.HeadingLevel.HEADING_2),
          table(groupHead(r, t("app-account-cost-export.children.group-head.2817287d1354")), groupRows(r, r.byMonth)),
          h(t("app-account-cost-export.children.h.eb2197ef5c1d"), d.HeadingLevel.HEADING_2),
          table(groupHead(r, t("app-account-cost-export.children.group-head.94b225f9ab46")), groupRows(r, r.byUser)),
          h(t("app-account-cost-export.children.h.f2dec0f0db92"), d.HeadingLevel.HEADING_2),
          table(lineHead(r), lineRows(r)),
          h(t("app-account-cost-export.children.h.dd166de8725f"), d.HeadingLevel.HEADING_2),
          ...r.notes.map((n) => new d.Paragraph({ text: n, bullet: { level: 0 } })),
        ],
      },
    ],
  });
  return d.Packer.toBlob(doc);
}

// ---------------------------------------------------------------- Excel

export async function toXlsx(r: CostReport): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Animatic Studio";
  const sum = wb.addWorksheet(t("app-account-cost-export.sum.wb-add-worksheet.e647192a21b7"));
  sum.addRow([r.projectName]).font = { bold: true, size: 14 };
  sum.addRow([r.title]).font = { bold: true };
  sum.addRow([]);
  for (const f of reportFacts(r)) sum.addRow(f);
  const group = (title: string, first: string, g: readonly CostReportGroup[]) => {
    sum.addRow([]);
    sum.addRow([title]).font = { bold: true };
    sum.addRow(groupHead(r, first)).font = { bold: true };
    for (const x of g)
      sum.addRow([x.key, x.count, x.usd, ...(r.currency === "NOK" ? [x.nok] : [])]);
  };
  group(
    t("app-account-cost-export.to-xlsx.group.4f07688907f9"),
    t("app-account-cost-export.to-xlsx.group.4bcdf1838aca"),
    r.byService,
  );
  group(t("app-account-cost-export.to-xlsx.group.0e8944420988"), t("app-account-cost-export.to-xlsx.group.58d0d37a9010"), r.byMonth);
  group(t("app-account-cost-export.to-xlsx.group.735d6529d49b"), t("app-account-cost-export.to-xlsx.group.ce8efb8633e9"), r.byUser);
  sum.addRow([]);
  sum.addRow([t("app-account-cost-export.to-xlsx.sum-add-row.be727f79046f")]).font = { bold: true };
  for (const n of r.notes) sum.addRow([n]);
  sum.getColumn(1).width = 48;
  for (const c of [2, 3, 4]) sum.getColumn(c).width = 14;

  // Linjene som tall (ikke tekst), så de kan summeres og filtreres i Excel
  const ws = wb.addWorksheet(t("app-account-cost-export.ws.wb-add-worksheet.7ff7fe067bfa"));
  ws.addRow(lineHead(r)).font = { bold: true };
  for (const l of r.lines)
    ws.addRow([
      new Date(l.date),
      l.projectName,
      l.user,
      l.provider,
      l.model,
      l.kind,
      l.subject,
      l.quantity,
      l.unitPriceUsd,
      l.amountUsd,
      l.credits,
      ...(r.currency === "NOK" ? [l.rate, l.amountNok] : []),
      l.status,
      l.externalId,
    ]);
  ws.getColumn(1).numFmt = "yyyy-mm-dd hh:mm";
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: lineHead(r).length } };
  ws.columns.forEach(
    (c, i) => (c.width = [17, 22, 18, 10, 30, 8, 26, 10, 12, 11, 9, 9, 11, 14, 40][i] ?? 14),
  );
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
