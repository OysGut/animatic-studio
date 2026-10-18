// @vitest-environment node
/** GP5: delingsnøkkelen kommer aldri med i feilrapporter. */
import { describe, expect, it } from "vitest";
import * as m from "@/app/shell/error-report";

describe("GP5 feilrapport", () => {
  it("skjuler nøkkelen i /se/<nøkkel>", () => {
    const fn = Object.values(m).find(
      (f) => typeof f === "function" && (f as (s: string) => unknown)("https://x.no/se/abc?x=1") === "/se/…",
    );
    expect(fn).toBeDefined();
  });
});
