// @vitest-environment node
/** Fjern alle oversettelser til et språk (DEC-0073, KI-114). */
import { describe, expect, it } from "vitest";
import { applyCommand } from "@/core";
import { mustApply } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";
import { liveTranslationIds } from "@/app/script/RemoveTranslationsDialog";

const s0 = fixture.state;

describe("fjern alle oversettelser", () => {
  it("én endring fjerner alle til språket; norsk røres ikke; angring gir dem tilbake", () => {
    const ids = liveTranslationIds(s0, "en");
    expect(ids.length).toBeGreaterThan(0);
    const r = applyCommand(s0, {
      id: "00000000-0000-7000-8000-00000000f0f9" as never,
      actor: "00000000-0000-7000-8000-000000000001" as never,
      at: new Date().toISOString(),
      command: { type: "SetTranslationsRemoved", translationIds: ids, removed: true } as never,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(liveTranslationIds(r.state, "en")).toEqual([]);
    expect(r.state.blocks).toBe(s0.blocks);
    const back = mustApply(r.state, r.inverse as never);
    expect(liveTranslationIds(back, "en").sort()).toEqual([...ids].sort());
  });
});
