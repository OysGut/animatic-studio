// @vitest-environment node
import { expect, it } from "vitest";
import { CATALOG } from "@/core/i18n/catalog.gen";
import { PROVIDERS, setLanguage } from "@/core";
it("REQ-0639: built-in provider exposes the studio label in both languages", () => {
  const provider = PROVIDERS.find(p => p.id === "lovable");
  if (!provider) throw new Error("Missing built-in provider");
  setLanguage("nb"); expect(provider.name).toBe("Innebygd AI");
  setLanguage("en"); expect(provider.name).toBe("Built-in AI");
  setLanguage("nb");
});
it("REQ-0639: user-facing catalog has no platform branding", () => {
  const exposed = Object.entries(CATALOG).filter(([nb, en]) => /lovable/i.test(nb) || /lovable/i.test(en));
  expect(exposed).toEqual([]);
});