/** DESIGN_SYSTEM §6 / REQ-0426 (DEC-0075): AI-generering har egen nøytral glyf – aldri «gnister» eller tryllestav. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("AI-ikon (REQ-0426)", () => {
  it("ingen Sparkles/WandSparkles i brukerflaten", () => {
    const bad = files("src/app").filter((f) =>
      /\b(Sparkles|WandSparkles)\b/.test(readFileSync(f, "utf8")),
    );
    expect(bad).toEqual([]);
  });
});
