// @vitest-environment node
/** DEC-0086: kostnadsrapporten (sammendrag, fordelinger, kurs, merknader) og eksportens tabeller. */
import { describe, expect, it } from "vitest";
import {
  buildCostReport,
  jobQuantity,
  parseNorgesBankRates,
  rateOn,
  reportMonths,
  setLanguage,
  type CostJobRow,
} from "@/core";
import { lineHead, lineRows, reportFacts, reportFileName } from "@/app/account/cost-export";

const row = (over: Partial<CostJobRow>): CostJobRow => ({
  id: crypto.randomUUID(),
  projectId: "p1",
  kind: "video",
  provider: "fal",
  model: "kling",
  status: "done",
  costUsd: 1,
  createdAt: "2026-10-05T10:00:00Z",
  createdBy: "u1",
  externalId: "req-1",
  occurrenceId: "o1",
  assetId: null,
  params: { seconds: 5 },
  ...over,
});

describe("REQ-0654 – kostnadsrapport", () => {
  it("REQ-0654: summer, fordelinger og linjer; feilet og kø er ikke med, «Betalt, ikke lagret» er med", () => {
    setLanguage("nb");
    const rows = [
      row({ costUsd: 0.84 }),
      row({
        costUsd: 2.8,
        provider: "runway",
        model: "aleph2",
        createdBy: "u2",
        createdAt: "2026-09-30T08:00:00Z",
      }),
      row({ costUsd: 5, status: "failed" }),
      row({ costUsd: 3, status: "queued" }),
      row({ costUsd: 0.5, status: "lost", kind: "image", params: {} }),
    ];
    const rates = new Map([
      ["2026-09-30", 10],
      ["2026-10-03", 11], // fredag
    ]);
    const r = buildCostReport({
      rows,
      projectName: "Jula på Dovre",
      scopeLabel: "Prosjektet totalt",
      periodLabel: "Hele prosjektet",
      generatedBy: "Mars",
      currency: "NOK",
      userNames: { u1: "Anita", u2: "Mars" },
      subjectOf: () => "15 INT. SPORTSBILEN - DAG",
      rates,
    });
    expect(r.lines).toHaveLength(3);
    expect(r.totalUsd).toBe(4.14);
    // 2,80 × 10 (30.09) + (0,84 + 0,50) × 11 (helg: siste kurs før, 03.10)
    expect(r.totalNok).toBe(28 + 14.74);
    expect(r.byUser.map((g) => g.key)).toEqual(["Mars", "Anita"]);
    expect(r.byMonth.map((g) => g.key)).toEqual(["2026-09", "2026-10"]);
    const runway = r.lines.find((l) => l.provider === "runway")!;
    expect(runway.credits).toBe(280);
    expect(runway.unitPriceUsd).toBe(0.56);
    expect(r.lines[0]!.subject).toBe("15 INT. SPORTSBILEN - DAG");
    expect(r.notes.join(" ")).toMatch(/anslått/);
    expect(r.notes.join(" ")).toMatch(/merverdiavgift/);
    expect(r.notes.join(" ")).toMatch(/Norges Bank/);
  });

  it("REQ-0654: uten kurs regnes ikke kroner (summen blir ukjent, ikke feil)", () => {
    const r = buildCostReport({
      rows: [row({})],
      projectName: "X",
      scopeLabel: "",
      periodLabel: "",
      generatedBy: "",
      currency: "NOK",
    });
    expect(r.totalNok).toBe(null);
    expect(r.lines[0]!.amountNok).toBe(null);
  });

  it("REQ-0654: mengde i sekunder for video; kurs på eller før datoen; måneder nyeste først", () => {
    expect(jobQuantity(row({ params: { startMs: 1000, endMs: 8500 } })).quantity).toBe(7.5);
    expect(jobQuantity(row({ kind: "image", params: {} })).quantity).toBe(1);
    const m = new Map([
      ["2026-10-01", 9],
      ["2026-10-02", 9.5],
    ]);
    expect(rateOn(m, "2026-10-04T12:00:00Z")).toBe(9.5);
    expect(rateOn(m, "2026-09-01T00:00:00Z")).toBe(null);
    expect(reportMonths([row({}), row({ createdAt: "2026-08-01T00:00:00Z" })])).toEqual([
      "2026-10",
      "2026-08",
    ]);
  });

  it("REQ-0654: Norges Banks SDMX-JSON leses", () => {
    const json = {
      data: {
        dataSets: [
          { series: { "0:0:0:0": { observations: { "0": ["9.6256"], "1": ["9.6494"] } } } },
        ],
        structure: {
          dimensions: {
            observation: [
              { id: "TIME_PERIOD", values: [{ id: "2026-10-01" }, { id: "2026-10-02" }] },
            ],
          },
        },
      },
    };
    expect([...parseNorgesBankRates(json)]).toEqual([
      ["2026-10-01", 9.6256],
      ["2026-10-02", 9.6494],
    ]);
  });

  it("REQ-0654: eksporten har prosjektnavnet øverst, kolonner for kroner og jobb-ID", () => {
    setLanguage("nb");
    const r = buildCostReport({
      rows: [row({})],
      projectName: "Jula på Dovre",
      scopeLabel: "Mitt forbruk",
      periodLabel: "oktober 2026",
      generatedBy: "Mars",
      currency: "NOK",
      rates: new Map([["2026-10-05", 10]]),
    });
    expect(reportFacts(r)[0]).toEqual(["Prosjekt", "Jula på Dovre"]);
    expect(lineHead(r)).toContain("Beløp NOK");
    expect(lineHead(r)).toContain("Leverandørens jobb-ID");
    expect(lineRows(r)[0]!.at(-1)).toBe("req-1");
    expect(reportFileName(r, "xlsx")).toBe("kostnader-jula-pa-dovre-oktober-2026.xlsx");
  });
});
