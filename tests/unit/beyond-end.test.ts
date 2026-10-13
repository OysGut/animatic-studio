/** Varsel om nøkkelbilder og kamerautsnitt etter scenens slutt (KI-44). */
import { describe, expect, it } from "vitest";
import { beyondEnd } from "@/app/scene-editor/beyond-end";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const comp = Object.values(s0.compositions).find((c) =>
  c.camera.shots.some((sh) => sh.id === "shot-1"),
)!;

describe("etter scenens slutt (KI-44)", () => {
  it("full lengde: ingenting ligger etter slutten", () => {
    const r = beyondEnd(s0, comp, 100);
    expect(r.keyframeCount).toBe(0);
    expect(r.shots).toHaveLength(0);
  });

  it("kortet ned: nøkkelbilder og utsnitt etter slutten telles, med bildet scenen må nå", () => {
    const r = beyondEnd(s0, comp, 40);
    expect(r.keyframeCount).toBe(1);
    expect(r.layers).toHaveLength(1);
    expect(r.layers[0]!.frames).toEqual([50]);
    expect(r.shots).toHaveLength(1);
    expect(r.shots[0]!.entirely).toBe(false);
    expect(r.maxFrame).toBe(75);
  });

  it("utsnitt som begynner etter slutten er helt utenfor", () => {
    const r = beyondEnd(
      s0,
      { ...comp, camera: { shots: [{ ...comp.camera.shots[0]!, startFrame: 30, endFrame: 60 }] } },
      20,
    );
    expect(r.shots[0]!.entirely).toBe(true);
  });
});
