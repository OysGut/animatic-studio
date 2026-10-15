/**
 * Eksport av kostnadsrapporten (DEC-0086) til PDF, Word og Excel i nettleseren. Bibliotekene lastes først når
 * brukeren eksporterer (jspdf + jspdf-autotable, docx, exceljs; alle med åpen kildekode, ingen nettverkskall).
 * Oppbygningen er lik i alle tre: tittel og prosjektnavn øverst, opplysninger om rapporten, sammendrag,
 * fordelinger, linjene og merknadene.
 */
import { L, locale, type CostReport, type CostReportGroup } from "@/core";

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
    [L("Prosjekt", "Project"), r.projectName],
    [L("Utvalg", "Selection"), r.scopeLabel],
    [L("Periode", "Period"), r.periodLabel],
    [L("Laget", "Created"), dateTime(r.generatedAt)],
    [L("Laget av", "Created by"), r.generatedBy],
    [
      L("Valuta", "Currency"),
      r.currency === "NOK"
        ? L("Norske kroner (NOK) og USD", "Norwegian kroner (NOK) and USD")
        : "USD",
    ],
    [L("Antall jobber", "Number of jobs"), String(r.lines.length)],
    [L("Sum USD", "Total USD"), num(r.totalUsd)],
    ...(r.currency === "NOK"
      ? ([[L("Sum NOK", "Total NOK"), num(r.totalNok)]] as [string, string][])
      : []),
  ];
}

export function groupHead(r: CostReport, first: string): string[] {
  return [first, L("Jobber", "Jobs"), "USD", ...(r.currency === "NOK" ? ["NOK"] : [])];
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
    L("Dato", "Date"),
    L("Prosjekt", "Project"),
    L("Bestilt av", "Ordered by"),
    L("Tjeneste", "Service"),
    L("Modell", "Model"),
    L("Type", "Type"),
    L("Gjelder", "Concerns"),
    L("Mengde", "Quantity"),
    L("Enhetspris USD", "Unit price USD"),
    L("Beløp USD", "Amount USD"),
    L("Kreditter", "Credits"),
    ...(r.currency === "NOK" ? [L("Kurs", "Rate"), L("Beløp NOK", "Amount NOK")] : []),
    L("Status", "Status"),
    L("Leverandørens jobb-ID", "Provider job ID"),
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
    L("Per tjeneste og modell", "By service and model"),
    groupHead(r, L("Tjeneste · modell", "Service · model")),
    groupRows(r, r.byService),
  );
  section(L("Per måned", "By month"), groupHead(r, L("Måned", "Month")), groupRows(r, r.byMonth));
  section(
    L("Per person", "By person"),
    groupHead(r, L("Person", "Person")),
    groupRows(r, r.byUser),
  );
  section(L("Linjer", "Lines"), lineHead(r), lineRows(r));
  section(
    L("Merknader", "Notes"),
    [L("Merknad", "Note")],
    r.notes.map((n) => [n]),
  );
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      L(`${r.projectName} – side ${i} av ${pages}`, `${r.projectName} – page ${i} of ${pages}`),
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
          table([L("Opplysning", "Item"), L("Verdi", "Value")], reportFacts(r)),
          h(L("Per tjeneste og modell", "By service and model"), d.HeadingLevel.HEADING_2),
          table(groupHead(r, L("Tjeneste · modell", "Service · model")), groupRows(r, r.byService)),
          h(L("Per måned", "By month"), d.HeadingLevel.HEADING_2),
          table(groupHead(r, L("Måned", "Month")), groupRows(r, r.byMonth)),
          h(L("Per person", "By person"), d.HeadingLevel.HEADING_2),
          table(groupHead(r, L("Person", "Person")), groupRows(r, r.byUser)),
          h(L("Linjer", "Lines"), d.HeadingLevel.HEADING_2),
          table(lineHead(r), lineRows(r)),
          h(L("Merknader", "Notes"), d.HeadingLevel.HEADING_2),
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
  const sum = wb.addWorksheet(L("Sammendrag", "Summary"));
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
    L("Per tjeneste og modell", "By service and model"),
    L("Tjeneste · modell", "Service · model"),
    r.byService,
  );
  group(L("Per måned", "By month"), L("Måned", "Month"), r.byMonth);
  group(L("Per person", "By person"), L("Person", "Person"), r.byUser);
  sum.addRow([]);
  sum.addRow([L("Merknader", "Notes")]).font = { bold: true };
  for (const n of r.notes) sum.addRow([n]);
  sum.getColumn(1).width = 48;
  for (const c of [2, 3, 4]) sum.getColumn(c).width = 14;

  // Linjene som tall (ikke tekst), så de kan summeres og filtreres i Excel
  const ws = wb.addWorksheet(L("Linjer", "Lines"));
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
