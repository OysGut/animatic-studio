import { describe, expect, it } from "vitest";
import { builtInImageModel, LOVABLE_CUTOUT_MODEL, LOVABLE_IMAGE_MODEL } from "@/core";

describe("innebygd bildemodell (P8-avvik 1): vist modell = brukt modell", () => {
  it("valgt GPT Image 2 brukes også for frilagte figurer", () => {
    expect(builtInImageModel("openai/gpt-image-2", "cutout", { cutout: "google/gemini-3-pro-image" })).toBe(
      "openai/gpt-image-2",
    );
  });
  it("uten valg brukes standarden for formålet", () => {
    expect(builtInImageModel(null, "cutout")).toBe(LOVABLE_CUTOUT_MODEL);
    expect(builtInImageModel(null, "image")).toBe(LOVABLE_IMAGE_MODEL);
  });
  it("en modell utenfor den innebygde katalogen godtas ikke", () => {
    expect(builtInImageModel("evil/model", "image")).toBe(LOVABLE_IMAGE_MODEL);
  });
});
