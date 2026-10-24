// @vitest-environment node
/** Claude oppdaterer MD5-listen etter hver kjøring i Cloud, ikke ved redigering av låste filer. */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationDirectory = join(root, "db/migrations");
const hashes: Record<string, string> = JSON.parse(
  readFileSync(join(root, "tests/fixtures/migration-hashes.json"), "utf8"),
);
const isMigration = (file: string) => /^\d{4}_.+\.sql$/.test(file);

describe("Låste migrasjonsfiler", () => {
  it("listen dekker alle migrasjoner til og med 0114 og ingen manglende filer", () => {
    const files = readdirSync(migrationDirectory).filter(isMigration);
    const lockedFiles = files.filter((file) => Number(file.slice(0, 4)) <= 114).sort();
    expect(lockedFiles.some((file) => file.startsWith("0114_"))).toBe(true);
    expect(Object.keys(hashes).filter((file) => Number(file.slice(0, 4)) <= 114).sort()).toEqual(lockedFiles);
    for (const file of Object.keys(hashes)) {
      expect(isMigration(file), file).toBe(true);
      expect(files, `Låst migrasjon mangler: ${file}`).toContain(file);
    }
  });

  for (const [file, expectedHash] of Object.entries(hashes)) {
    it(`${file} er uendret siden låsing`, () => {
      expect(expectedHash, file).toMatch(/^[a-f0-9]{32}$/);
      const actualHash = createHash("md5")
        .update(readFileSync(join(migrationDirectory, file)))
        .digest("hex");
      expect(actualHash, `${file} er låst; legg endringen i neste migrasjonsfil`).toBe(expectedHash);
    });
  }
});