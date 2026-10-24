// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PRINT_PAPERS, panelPrintRows, printLayout, printTable, printCsv } from "@/core/storyboard/print";
import { exportChunks, storyboardXlsx, storyboardCsv } from "@/engine/export/storyboard-print";
import { mustApply, seedProject, tid } from "../helpers/fixtures";
import { filmClips, orderedOccurrences } from "@/core";

describe("SB-6 layouts", () => {
  for (const paper of Object.keys(PRINT_PAPERS) as (keyof typeof PRINT_PAPERS)[]) {
    for (const perPage of [3, 6, 9] as const) for (const landscape of [false, true]) {
      it(`${paper} ${perPage} ${landscape}`, () => {
        const l = printLayout(19, { paper, perPage, landscape });
        expect(l.pages.length).toBe(Math.ceil(19 / perPage));
        expect([l.width, l.height]).toEqual(landscape ? [...PRINT_PAPERS[paper]].reverse() : [...PRINT_PAPERS[paper]]);
        for (const page of l.pages) for (const c of page) {
          expect(c.width).toBeGreaterThan(0); expect(c.height).toBeGreaterThan(0);
          expect(c.x + c.width).toBeLessThanOrEqual(l.width - 11.9);
          expect(c.y + c.height).toBeLessThanOrEqual(l.height - 15.9);
          for (const b of page.filter(b => b.index !== c.index)) expect(c.x + c.width <= b.x || b.x + b.width <= c.x || c.y + c.height <= b.y || b.y + b.height <= c.y).toBe(true);
        }
      });
    }
  }
  it("pitch has one panel per page", () => {
    const l = printLayout(5, { paper: "A3", landscape: true, perPage: 1 });
    expect(l.pages.map(p => p.length)).toEqual([1, 1, 1, 1, 1]);
    expect(l.pages[0]?.[0]?.width).toBe(396);
  });
});

function fixture() {
  const seed = seedProject(1), o = orderedOccurrences(seed.state, seed.mainId)[0];
  if (!o) throw new Error("fixture");
  const panelId = tid<"composition">();
  let state = mustApply(seed.state, { type: "AddStoryboardPanel", panelId, occurrenceId: o.id, variantId: o.variantId, orderKey: "a", durationFrames: 48 });
  state = mustApply(state, { type: "SetStoryboardDetails", panelId, details: { number: "4A", sceneNumber: "2", fields: { dialogue: '日本語, "Hei"', notes: "=1+1" }, dialogueIds: [], shot: "CU", angle: "low", focalMm: 50, movement: "pan" } });
  return panelPrintRows(state, filmClips(state, seed.mainId));
}
it("one row per panel, actual frame duration and fps timecode", () => {
  const rows = fixture(); expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ panel: "4A", scene: "2", durationFrames: 48, timecode: "00:00:00:00", camera: "CU · low · 50 mm" });
});
it("field selection and CSV BOM, quoting and injection protection", () => {
  const table = printTable(fixture(), ["dialogue", "notes"], { dialogue: "Dialogue", notes: "Notes", durationFrames: "Frames", timecode: "TC" });
  expect(table.header).toEqual(["Dialogue", "Notes", "Frames", "TC"]);
  const csv = printCsv(table); expect([...csv.slice(0, 3)]).toEqual([239, 187, 191]);
  const text = new TextDecoder().decode(csv);
  expect(text).toContain('"日本語, ""Hei"""'); expect(text).toContain('"\'=1+1"'); expect(text).not.toContain("camera");
});
it("XLSX preserves numeric frames/seconds, text numbers and Unicode", async () => {
  const table = printTable(fixture(), ["panel", "duration", "dialogue"], {});
  const blob = await storyboardXlsx(table, new AbortController().signal);
  const ExcelJS = (await import("exceljs")).default, wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  const sheet = wb.worksheets[0]; if (!sheet) throw new Error("sheet");
  expect(sheet.getCell("A2").value).toBe("4A");
  expect(typeof sheet.getCell("B2").value).toBe("number");
  expect(sheet.getCell("C2").value).toBe('日本語, "Hei"');
  expect(sheet.getCell("D2").value).toBe(48);
  expect(sheet.getCell("E2").value).toBe("00:00:00:00");
});
it("500 panels yield input and cancellation stops at the next chunk", async () => {
  const ctrl = new AbortController(), done: number[] = [];
  const promise = exportChunks(Array.from({ length: 500 }, (_, i) => i), ctrl.signal, async i => { done.push(i); if (i === 19) ctrl.abort(); });
  await expect(promise).rejects.toMatchObject({ name: "AbortError" }); expect(done).toHaveLength(20);
});
it("chunked CSV matches BOM, row quoting and selected fields exactly", async () => {
  const table = printTable(fixture(), ["dialogue", "notes"], {});
  const blob = await storyboardCsv(table, new AbortController().signal);
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(printCsv(table));
});
it("actual 500-row spreadsheet exports can be cancelled without returning a partial file", async () => {
  const row = fixture()[0]; if (!row) throw new Error("fixture");
  const table = printTable(Array.from({ length: 500 }, () => row), ["duration"], {});
  for (const exporter of [storyboardCsv, storyboardXlsx]) {
    const ctrl = new AbortController(); let progress = 0;
    await expect(exporter(table, ctrl.signal, done => { progress = done; if (done === 20) ctrl.abort(); })).rejects.toMatchObject({ name: "AbortError" });
    expect(progress).toBe(20);
  }
});