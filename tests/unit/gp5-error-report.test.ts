// @vitest-environment node
/** GP5: delingsnøkkelen kommer aldri med i feilrapporter. */
import { describe, expect, it } from "vitest";
import { safePagePath } from "@/app/shell/error-report";

describe("GP5 feilrapport", () => {
  it("skjuler nøkkelen i /se/<nøkkel>", () => {
    expect(safePagePath("https://x.no/se/abc?x=1")).toBe("/se/…");
    expect(safePagePath("https://x.no/m/abc")).toBe("/m/…");
  });
});
