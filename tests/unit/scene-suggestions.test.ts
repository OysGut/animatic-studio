/** «I denne scenen» viser navn fra manuset som ikke er i biblioteket (KI-49). */
import { describe, expect, it } from "vitest";
import { librarySuggestions, mainProduction, orderedOccurrences } from "@/core";
import { sceneSuggestions } from "@/app/scene-editor/scene-suggestions";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const occs = orderedOccurrences(s0, main.id);
const all = librarySuggestions(s0, main.id);

describe("forslag per scene (KI-49)", () => {
  it("fixturen har forslag å teste med", () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it("et forslag vises i scenene der det står (etter scenenummer)", () => {
    for (const x of all) {
      for (const n of x.sceneNumbers) {
        const o = occs.find((o) => o.productionNumber === n);
        if (!o) continue;
        const names = sceneSuggestions(s0, main.id, o.id, all).map((y) => y.name);
        expect(names).toContain(x.name);
      }
    }
  });

  it("hvert forslag hører til minst én scene, og ingen scene får forslag som ikke finnes", () => {
    const seen = new Set<string>();
    for (const o of occs)
      for (const y of sceneSuggestions(s0, main.id, o.id, all)) {
        expect(all).toContain(y);
        seen.add(y.name);
      }
    for (const x of all) expect(seen.has(x.name)).toBe(true);
  });

  it("ukjent scene eller annen produksjon gir ingen forslag", () => {
    expect(sceneSuggestions(s0, main.id, "finnes-ikke", all)).toEqual([]);
    expect(sceneSuggestions(s0, "annen", occs[0]!.id, all)).toEqual([]);
  });
});
