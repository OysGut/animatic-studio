import { describe, expect, it } from "vitest";
import { countPrimary, planToolbarOverflow } from "@/app/shell/toolbar-overflow";

describe("U2 verktøylinje – «Mer …»", () => {
  it("flytter ingenting når alt får plass", () => {
    expect(planToolbarOverflow([100, 100, 100], 300)).toEqual([]);
  });
  it("flytter siste gruppe først ved lik prioritet", () => {
    expect(planToolbarOverflow([100, 100, 100], 250, [], 30)).toEqual([2]);
  });
  it("flytter lavest prioritet først", () => {
    expect(planToolbarOverflow([100, 100, 100], 250, [0, -1, 0], 30)).toEqual([1]);
  });
  it("tar hensyn til plassen til «Mer …»-knappen", () => {
    expect(planToolbarOverflow([100, 100, 100], 290, [], 40)).toEqual([2]);
    expect(planToolbarOverflow([100, 100, 100], 150, [], 40)).toEqual([1, 2]);
  });
});

describe("U2 primærhandling", () => {
  it("teller primærknapper så høyst én kan kreves", () => {
    expect(countPrimary(["icon", "primary", "default"])).toBe(1);
    expect(countPrimary(["primary", "primary"])).toBe(2);
  });
});

import { cn } from "@/lib/utils";
describe("U2 tokens i klassehjelperen", () => {
  it("beholder skriftstørrelsestokenet ved siden av en tekstfarge", () => {
    expect(cn("text-chrome-label text-text-tertiary")).toBe("text-chrome-label text-text-tertiary");
    expect(cn("text-chrome text-text-secondary")).toBe("text-chrome text-text-secondary");
  });
});
