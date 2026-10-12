/** Designsystemet §3 (REQ-0425, DEC-0074): ingen tekst under 11 px i grensesnittet. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("tekststørrelser", () => {
  it("REQ-0425: ingen text-[Npx] under 11 px i src/app", () => {
    const small: string[] = [];
    for (const f of files(join(__dirname, "../../src/app")))
      for (const m of readFileSync(f, "utf8").matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g))
        if (Number(m[1]) < 11) small.push(`${f}: ${m[0]}`);
    expect(small).toEqual([]);
  });
});
