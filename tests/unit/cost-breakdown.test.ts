// @vitest-environment node
/** REQ-0280 (DEC-0075): bekreftelsen viser alt anslaget bygger på. */
import { describe, expect, it } from "vitest";
import { costBreakdown, type ProviderModel } from "@/core";

const model: ProviderModel = {
  id: "m",
  label: "Testmodell",
  capability: "video",
  priceUsd: 0.1,
  priceUnit: "second",
  tier: "premium",
  resolution: "1080p",
};

describe("costBreakdown", () => {
  it("video: modell, nivå, oppløsning, antall, lengde, ekstrarunder og sum", () => {
    const lines = costBreakdown({ name: "Lev" }, model, {
      candidates: 2,
      targets: 3,
      targetsLabel: "segmenter",
      seconds: [5, 8, 8],
      total: "ca. 4,20 USD",
    });
    const map = Object.fromEntries(lines.map((l) => [l.label, l.value]));
    expect(map).toEqual({
      Modell: "Lev – Testmodell",
      Innsatsnivå: "Høy / Premium",
      Oppløsning: "1080p",
      Antall: "6 genereringer (3 segmenter × 2 kandidater)",
      Lengde: "5–8 s",
      Ekstrarunder: "ingen automatiske – nye forsøk startes bare av deg",
      "Samlet anslag": "ca. 4,20 USD",
    });
  });

  it("lyd uten valgt lengde og ukjent pris", () => {
    const { resolution: _r, ...noRes } = model;
    const map = Object.fromEntries(
      costBreakdown({ name: "Lev" }, noRes, { assumedMaxSeconds: 30, total: null }).map((l) => [
        l.label,
        l.value,
      ]),
    );
    expect(map["Oppløsning"]).toBeUndefined();
    expect(map["Antall"]).toBe("1 generering");
    expect(map["Lengde"]).toBe("ikke valgt – regnet med lengste, 30 s");
    expect(map["Samlet anslag"]).toBe("ukjent pris");
  });
});
