// @vitest-environment node
/** «Bruk aktivt utsnitt»: utsnittet på slutten av scenen før (ønske fra Mars 11.10.2026). */
import { describe, expect, it } from "vitest";
import {
  compositionOfVariant,
  endCamera,
  fullFrameCamera,
  mainProduction,
  orderedOccurrences,
  previousSceneCamera,
} from "@/core";
import { fixture } from "../visual/fixture-state";

const s = fixture.state;
const main = mainProduction(s)!;
const occs = orderedOccurrences(s, main.id);

describe("utsnittet på slutten av scenen før", () => {
  it("første scene har ingen scene før", () => {
    expect(previousSceneCamera(s, main.id, occs[0]!.id, { width: 1920, height: 1080 })).toBe(null);
  });

  it("gir sluttrammen i det siste kamerautsnittet i scenen før", () => {
    const first = compositionOfVariant(s, occs[0]!.variantId)!;
    const r = previousSceneCamera(s, main.id, occs[1]!.id, first)!;
    expect(r.occurrenceId).toBe(occs[0]!.id);
    const last = [...first.camera.shots].sort((a, b) => a.endFrame - b.endFrame).at(-1);
    expect(r.frame).toEqual(last ? last.to : fullFrameCamera(first));
    expect(endCamera(first)).toEqual(r.frame);
    // Annet format: samme del av bildet
    const half = previousSceneCamera(s, main.id, occs[1]!.id, {
      width: first.width / 2,
      height: first.height / 2,
    })!;
    expect(half.frame.x).toBeCloseTo(r.frame.x / 2);
    expect(half.frame.zoom).toBe(r.frame.zoom);
  });
});
