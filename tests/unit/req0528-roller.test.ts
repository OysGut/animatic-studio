// @vitest-environment node
/**
 * REQ-0528 etter Mars' beslutning (DEC-0077): redaktører og eiere kan starte betalte AI-jobber innenfor budsjett
 * og kostnadstak; kommentatorer og lesere kan ikke. Bare eieren kan endre AI-budsjettet. Atferden for redaktør og
 * leser er prøvd i tests/unit/verifisering3-ai-server.test.ts; her sjekkes at alle betalte serverfunksjoner har
 * samme rollesperre.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PAID = [
  "video.functions.ts",
  "generate-image.functions.ts",
  "sound.functions.ts",
  "speech.functions.ts",
  "write-prompt.functions.ts",
  "queue.functions.ts",
];

describe("REQ-0528 – hvem kan starte betalte jobber (DEC-0077)", () => {
  it.each(PAID)("%s krever minst redaktørrollen", (f) => {
    const src = readFileSync(`src/adapters/ai/${f}`, "utf8");
    expect(src).toMatch(
      /ROLE_RANK\[role \?\? ""\] \?\? 0\) < gate\.ROLE_RANK\["editor"\]|ROLE_RANK\["editor"\]/,
    );
  });

  it("rollerangeringen holder kommentator og leser under redaktør", async () => {
    const { ROLE_RANK } = await import("@/adapters/ai/gateway");
    expect(ROLE_RANK["commenter"]!).toBeLessThan(ROLE_RANK["editor"]!);
    expect(ROLE_RANK["viewer"]!).toBeLessThan(ROLE_RANK["editor"]!);
  });

  it("bare eieren kan endre AI-budsjettet", () => {
    const src = readFileSync("src/adapters/storage/commands.functions.ts", "utf8");
    expect(src).toMatch(/"SetAiBudget" && rank < ROLE_RANK\["owner"\]/);
  });
});
