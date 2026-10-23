// @vitest-environment node
/**
 * B-104: produktet heter «From Pen to Glass» (kortform «Pen to Glass»). Testen feiler hvis det gamle
 * navnet «Animatic Studio» står i tekst brukeren kan se: alle filer i src/ og public/, og tekstene i
 * språkkatalogene. Unntak står i en eksplisitt liste med begrunnelse.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { BACKUP_APP_NAME, BACKUP_APP_NAMES, parseBackup } from "@/core/backup";

const ROOT = join(__dirname, "../..");
const OLD = /Animatic Studio/;

/** Filer som med vilje nevner det gamle navnet. */
const ALLOWED: Record<string, string> = {
  "src/core/backup/index.ts": "eldre sikkerhetskopier har det gamle navnet og skal fortsatt kunne leses",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("B-104 – produktnavnet From Pen to Glass", () => {
  it("«Animatic Studio» står ikke i src/ eller public/ (utenom unntakslisten)", () => {
    const all = [...files(join(ROOT, "src")), ...files(join(ROOT, "public"))].filter((f) =>
      /\.(ts|tsx|js|jsx|css|html|json|txt|svg|webmanifest)$/.test(f),
    );
    expect(all.length).toBeGreaterThan(100);
    const hits = all
      .map((f) => relative(ROOT, f).split("\\").join("/"))
      .filter((f) => !(f in ALLOWED) && OLD.test(readFileSync(join(ROOT, f), "utf8")));
    expect(hits).toEqual([]);
  });

  it("ingen tekst i katalogene nb, en og en-XA bruker det gamle navnet", () => {
    for (const lang of ["nb", "en", "en-XA"]) {
      const cat = JSON.parse(readFileSync(join(ROOT, `src/core/i18n/locales/${lang}.json`), "utf8")) as Record<
        string,
        { text: string | null }
      >;
      const bad = Object.entries(cat).filter(([, m]) => m.text && /Animatic Studio|Ánïmátïc/.test(m.text));
      expect(bad.map(([k]) => k)).toEqual([]);
    }
  });

  it("sidetittelen og metadataene bruker det nye navnet", () => {
    const root = readFileSync(join(ROOT, "src/routes/__root.tsx"), "utf8");
    expect(root).toContain('{ title: "From Pen to Glass" }');
    expect(root).toContain('{ property: "og:site_name", content: "From Pen to Glass" }');
    expect(root).toContain('{ name: "twitter:title", content: "From Pen to Glass" }');
  });

  it("ingen domenenavn er skrevet inn i koden", () => {
    const all = files(join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("integrations"));
    const hits = all.filter((f) => /pentoglass\.(com|no|lovable\.app)/i.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it("nye sikkerhetskopier får det nye navnet, og gamle med «Animatic Studio» leses fortsatt", () => {
    expect(BACKUP_APP_NAME).toBe("From Pen to Glass");
    expect(BACKUP_APP_NAMES).toContain("Animatic Studio");
    const old = {
      format: "animatic-studio-backup",
      formatVersion: 1,
      schemaVersion: 10,
      createdAt: "2026-01-01T00:00:00Z",
      app: "Animatic Studio",
      project: { id: "p" },
      tables: {},
      history: { change_log: [], generation_jobs: [] },
      files: [],
    };
    let err: unknown = null;
    try {
      parseBackup(old, 73);
    } catch (e) {
      err = e;
    }
    // Navnet alene skal aldri være grunnen til at lesingen feiler
    expect(String(err ?? "")).not.toMatch(/Pen to Glass|Animatic Studio/);
  });
});
