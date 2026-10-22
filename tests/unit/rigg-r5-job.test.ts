/** B-087 runde 5: utskriftsjobber (A1–A3, A14, A15) og kopikoder. Ren kjerne, ingen nettverk. */
import { describe, expect, it } from "vitest";
import { planPrint, type PrintItem } from "../../src/core/print/pdf";
import {
  DEFAULT_JOB_SETTINGS, backQrRect, backsideRect, formatShortCode, frameRange, frameRangeTimes, jobPrintItems,
  jobTotals, normalizeShortCode, planCopies, printJobError, qrRect, shortCodeFromBytes, thisFrameTimes,
  type CopyResolved, type PrintJobElement,
} from "../../src/core/print/job";

let n = 0;
const id = () => `id-${++n}`;
const base = { layerId: "L", versionId: "V", sceneId: "S", maskId: null, note: "", upArrow: false };
const contour: PrintItem["contour"] = { source: "rectangle", widthMm: 40, heightMm: 60, pointCount: 5, paths: [{ isHole: false, orientation: "clockwise", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 60 }, { x: 0, y: 60 }, { x: 0, y: 0 }] }] };
const resolve = (els: readonly PrintJobElement[], s = DEFAULT_JOB_SETTINGS) => {
  const copies = planCopies(els, [], id);
  const res: CopyResolved[] = copies.map((copy) => {
    const element = els.find((e) => e.id === copy.elementId)!;
    return { copy, element, frameLabel: `F${element.frame}`, idLabel: "S1", item: { sceneId: "S", size: { width: 40, height: 60 }, contour, image: { data: "x", format: "PNG", widthPx: 1000, heightPx: 1500 } } };
  });
  return { copies, items: jobPrintItems(s, res) };
};
const figures = (items: PrintItem[]) => planPrint({ items }).sheets.flatMap((sh) => sh.placements).length;

describe("A1–A3: ingen deduplisering", () => {
  it("A1: 1 element × 20 gir 20 kopier og 20 figurer i PDF-planen", () => {
    const els = thisFrameTimes(base, 12, 20, id);
    const { copies, items } = resolve(els);
    expect(els).toHaveLength(1);
    expect(copies).toHaveLength(20);
    expect(new Set(copies.map((c) => c.copyNumber)).size).toBe(20);
    expect(figures(items)).toBe(20);
  });
  it("A2: to helt like elementer slås ikke sammen", () => {
    const els = [...thisFrameTimes(base, 5, 1, id), ...thisFrameTimes(base, 5, 1, id)];
    expect(resolve(els).copies).toHaveLength(2);
    expect(figures(resolve(els).items)).toBe(2);
  });
  it("A3: 20 frames der noen er identiske gir 20", () => {
    const els = [...frameRange(base, 1, 10, id), ...frameRange(base, 1, 10, id)];
    expect(els).toHaveLength(20);
    expect(figures(resolve(els).items)).toBe(20);
  });
  it("frame X–Y × N gir N kopier hver", () => {
    const els = frameRangeTimes(base, 8, 6, 3, id);
    expect(els.map((e) => e.frame)).toEqual([6, 7, 8]);
    expect(jobTotals(els, 2)).toEqual({ elements: 3, copies: 9, sheets: 2 });
  });
  it("ny utskrift gjenbruker de samme kopiene (samme koder) og lager bare manglende", () => {
    const els = thisFrameTimes(base, 1, 3, id);
    const first = planCopies(els, [], id);
    const again = planCopies([{ ...els[0]!, copies: 4 }], first, id);
    expect(again.slice(0, 3)).toEqual(first);
    expect(again[3]!.copyNumber).toBe(4);
  });
});

describe("A14: felles innstillinger for alle kopier", () => {
  it("modus, klippelinje og felt er like; frame, merknad og kopinummer er egne", () => {
    const s = { ...DEFAULT_JOB_SETTINGS, mode: "figure" as const, strokeWidthMm: 0.2, copyNumber: true, fields: [{ key: "film", value: "Jula på Dovre", enabled: true }] };
    const els = [...thisFrameTimes({ ...base, note: "venstre hånd" }, 3, 2, id), ...thisFrameTimes(base, 9, 1, id)];
    const { items } = resolve(els, s);
    expect(new Set(items.map((i) => i.mode))).toEqual(new Set(["figure"]));
    expect(new Set(items.map((i) => i.strokeWidthMm))).toEqual(new Set([0.2]));
    expect(items.every((i) => i.fields!.some((f) => f.value === "Jula på Dovre"))).toBe(true);
    expect(items.map((i) => i.fields!.find((f) => f.key === "frame")!.value)).toEqual(["F3", "F3", "F9"]);
    expect(items.map((i) => i.fields!.find((f) => f.key === "copy")!.value)).toEqual(["#1/2", "#2/2", "#1/1"]);
    expect(items[2]!.fields!.some((f) => f.key === "note")).toBe(false);
    const off = resolve(els, { ...s, copyNumber: false }).items;
    expect(off.some((i) => i.fields!.some((f) => f.key === "copy"))).toBe(false);
  });
  it("validering", () => {
    expect(printJobError(DEFAULT_JOB_SETTINGS, [])).toBe("print-job.empty");
    expect(printJobError(DEFAULT_JOB_SETTINGS, thisFrameTimes(base, 0, 0, id))).toBe("print-job.copies");
    expect(printJobError({ ...DEFAULT_JOB_SETTINGS, strokeWidthMm: 0.4 }, thisFrameTimes(base, 0, 1, id))).toBe("print-job.stroke");
    expect(printJobError(DEFAULT_JOB_SETTINGS, thisFrameTimes(base, 0, 20, id))).toBeNull();
  });
});

describe("A15: QR og kontur i batch", () => {
  it("QR utenfor reserverer plass ved hver kopi; konturen følger med alle", () => {
    const { items } = resolve(thisFrameTimes(base, 1, 20, id), { ...DEFAULT_JOB_SETTINGS, mode: "contour" });
    expect(items.every((i) => i.reserveQr && i.contour === contour && i.mode === "contour")).toBe(true);
    const plan = planPrint({ items });
    const placements = plan.sheets.flatMap((s) => s.placements);
    expect(placements).toHaveLength(20);
    for (const p of placements) {
      const q = qrRect(p.rect, DEFAULT_JOB_SETTINGS, p.info.rect.y)!;
      expect(q.y).toBeGreaterThanOrEqual(p.rect.y + p.rect.height);
    }
  });
  it("QR på figuren havner i valgt hjørne innenfor figuren", () => {
    const fig = { x: 10, y: 10, width: 40, height: 60 };
    const q = qrRect(fig, { ...DEFAULT_JOB_SETTINGS, qr: "figure", qrCorner: "top-left" }, 0)!;
    expect(q.x).toBeGreaterThanOrEqual(fig.x);
    expect(q.y).toBeGreaterThanOrEqual(fig.y);
    expect(qrRect(fig, { ...DEFAULT_JOB_SETTINGS, qr: "back" }, 0)).toBeNull();
  });
  it("baksiden speiles langs lang eller kort kant og bruker forskyvningen", () => {
    const paper = { width: 210, height: 297 };
    const r = { x: 10, y: 20, width: 40, height: 60 };
    expect(backsideRect(r, paper, "long", { x: 0, y: 0 })).toEqual({ x: 160, y: 20, width: 40, height: 60 });
    expect(backsideRect(r, paper, "short", { x: 1, y: -1 })).toEqual({ x: 11, y: 216, width: 40, height: 60 });
    const q = backQrRect(r, paper, "long", { x: 0, y: 0 });
    expect(q.x + q.width / 2).toBeCloseTo(210 - 30);
  });
});

describe("kopikoder", () => {
  it("normalisering: O/0, I/1, L/1, mellomrom og bindestrek", () => {
    expect(normalizeShortCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeShortCode(" 0o1i l2 34")).toBe("00111234");
    expect(normalizeShortCode("ABCDEFG")).toBeNull();
    expect(normalizeShortCode("ABCDEFGU")).toBeNull();
    expect(formatShortCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });
  it("kort kode fra 5 byte er 8 tegn Crockford, og ulike byte gir ulike koder", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const b = new Uint8Array([i & 255, (i >> 8) & 255, (i * 7) & 255, (i * 13) & 255, (i * 31) & 255]);
      const c = shortCodeFromBytes(b);
      expect(normalizeShortCode(c)).toBe(c);
      seen.add(c);
    }
    expect(seen.size).toBe(5000);
    expect(shortCodeFromBytes(new Uint8Array([0, 0, 0, 0, 0]))).toBe("00000000");
    expect(shortCodeFromBytes(new Uint8Array([255, 255, 255, 255, 255]))).toBe("ZZZZZZZZ");
  });
});

describe("B-091 felt per kopi", () => {
  it("frame/tid fra gjeldende frame erstattes av kopiens egen frame", async () => {
    const { jobPrintItems, DEFAULT_JOB_SETTINGS } = await import("@/core/print/job");
    const settings = { ...DEFAULT_JOB_SETTINGS, fields: [{ key: "time", value: "gammel", enabled: true }, { key: "film", value: "Film", enabled: true }] };
    const element = { id: "e", layerId: "l", versionId: "v", sceneId: "s", frame: 7, maskId: null, copies: 1, note: "", upArrow: true };
    const [item] = jobPrintItems(settings, [{ copy: { id: "c", elementId: "e", copyNumber: 1 }, element, frameLabel: "Frame 7", idLabel: "1", item: { sceneId: "s", size: { width: 10, height: 10 }, contour: { source: "rectangle", widthMm: 10, heightMm: 10, pointCount: 0, paths: [] } } } as never]);
    expect(item!.fields!.map((f) => f.value)).toEqual(["Film", "Frame 7", "1"]);
  });
});
