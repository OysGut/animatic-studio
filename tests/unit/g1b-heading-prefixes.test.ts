// @vitest-environment node
/** G-1b: sceneoverskrifter gjenkjennes også på tysk, russisk og japansk, og engelsk/norsk som før. */
import { describe, expect, it } from "vitest";
import { parseHeading } from "@/core/screenplay/parse";

describe("sceneoverskrift per språk", () => {
  it.each([
    ["INT. KITCHEN - DAY", "INT.", "KITCHEN", "DAY"],
    ["INNE. KJØKKEN - DAG", "INNE.", "KJØKKEN", "DAG"],
    ["INNEN. KÜCHE - TAG", "INNEN.", "KÜCHE", "TAG"],
    ["ИНТ. КУХНЯ - ДЕНЬ", "ИНТ.", "КУХНЯ", "ДЕНЬ"],
    ["○台所 - 昼", "○", "台所", "昼"],
  ])("%s", (raw, intExt, location, time) => {
    expect(parseHeading(raw)).toEqual({ intExt, location, time });
  });
});
