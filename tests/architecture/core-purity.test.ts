// @vitest-environment node
/** ADR-0003: src/core skal være plattformnøytral TypeScript (portabilitet, prinsipp 28). */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CORE = join(__dirname, "../../src/core");
const FORBIDDEN = [
  /from\s+["']react/,
  /from\s+["']@tanstack/,
  /from\s+["']@supabase/,
  /from\s+["']@\/(?!core)/,
  /from\s+["']node:/,
  // Globale objekter, ikke egenskaper (plakatens «poster.document» er lov)
  /(?<![.\w])window\./,
  /(?<![.\w])document\./,
  /\blocalStorage\b/,
  /\bprocess\.env\b/,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("Domenekjernen er plattformnøytral", () => {
  it("importerer ikke rammeverk, backend eller plattform-API-er", () => {
    const offenders: string[] = [];
    for (const f of files(CORE)) {
      // Katalognøkler (ML2, f.eks. "core-presentation-document.title") er tekst, ikke plattform-API-er.
      const src = readFileSync(f, "utf8").replace(/(["'])[a-z0-9-]+(?:\.[a-z0-9-]+)+\1/g, '""');
      for (const re of FORBIDDEN) if (re.test(src)) offenders.push(`${f}: ${re}`);
    }
    expect(offenders).toEqual([]);
  });
});
