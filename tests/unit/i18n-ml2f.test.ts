/**
 * ML2f: broen er tom. Alle tekstpar er flyttet til nøkler, nye L()/localized()-kall stoppes av
 * språksjekken, og de håndskrevne flertalls- og valgmeldingene gir ordrett de gamle tekstene.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pseudoText, setLanguage } from "@/core";
import { t } from "@/core/i18n/keyed";
import mapping from "../../scripts/i18n/mapping.v1.json";
import authored from "@/core/i18n/authored.json";
import runtimeCatalog from "@/core/i18n/runtime.gen.json";
import { PARTIAL_RESTORE } from "@/app/script/VersionsDialog";
import { CONTENT_SYNC_FLAG } from "@/core/library/content-sync";
import { ORIGINAL_NOTE_MARK, ORIGINAL_NOTE_MARK_EN } from "@/core/library";
import { UNDO_PRODUCTION_HISTORY, UNDO_PRODUCTION_REFERENCED } from "@/adapters/storage/commands.functions";
import { execFileSync } from "node:child_process";

/** Kjører språksjekkens L()-kontroll i en egen node-prosess (skriptet er ren ESM). */
const bridgeCalls = (file: string) =>
  JSON.parse(execFileSync("node", ["--input-type=module", "-e", `import { bridgeCalls } from "./scripts/i18n/check.mjs"; console.log(JSON.stringify(bridgeCalls(${JSON.stringify(file)})));`], { encoding: "utf8" }));

afterEach(() => setLanguage("nb"));

const at = (lang: "nb" | "en" | "en-XA", f: () => string) => {
  setLanguage(lang);
  try {
    return f();
  } finally {
    setLanguage("nb");
  }
};

describe("ML2f – tom bro", () => {
  it("alle tekstpar i inventaret er flyttet til nøkler", () => {
    const entries = (mapping as { entries: { migrated?: boolean }[] }).entries;
    expect(entries.length).toBe(9964);
    expect(entries.filter((e) => !e.migrated)).toHaveLength(0);
  });

  it("språksjekken stopper nye L()- og localized()-kall, men ikke t()", () => {
    const dir = mkdtempSync(join(tmpdir(), "ml2f-"));
    const file = join(dir, "probe.ts");
    writeFileSync(file, 'import { L, localized as lz } from "@/core";\nimport { t } from "@/core/i18n/keyed";\nexport const a = () => L("Hei", "Hi");\nexport const b = lz({ x: ["Ja", "Yes"] });\nexport const c = () => t("x.y");\n');
    const hits = bridgeCalls(file) as { line: number }[];
    rmSync(dir, { recursive: true });
    expect(hits.map((h) => h.line)).toEqual([3, 4]);
  });

  it("håndskrevne meldinger lastes i appen", () => {
    const loaded = new Set(Object.keys(runtimeCatalog.nb));
    for (const key of ["app-assembly-export-animatic-dialog.scenes-in-order", "app-assembly-language-version-dialog.timing-conflicts", "app-script-scene-navigator.notes"])
      expect(loaded.has(key)).toBe(true);
    expect(Object.keys((authored as { messages: object }).messages).length).toBeGreaterThan(250);
  });
});

describe("ML2f – flertall og valg gir de gamle tekstene ordrett", () => {
  it("eksportdialogen: scener i manusets rekkefølge", () => {
    const k = "app-assembly-export-animatic-dialog.scenes-in-order";
    expect(t(k, { count: 1, duration: "0:05" })).toBe("1 scene i manusets rekkefølge, 0:05.");
    expect(t(k, { count: 3, duration: "0:05" })).toBe("3 scener i manusets rekkefølge, 0:05.");
    expect(at("en", () => t(k, { count: 1, duration: "0:05" }))).toBe("1 scene in script order, 0:05.");
    expect(at("en", () => t(k, { count: 2, duration: "0:05" }))).toBe("2 scenes in script order, 0:05.");
  });

  it("lydklipp med og uten dempede spor", () => {
    expect(t("app-assembly-export-animatic-dialog.audio-clips-included-muted", { count: 4, muted: 1 })).toBe("4 lydklipp med i videoen (1 i dempede spor er ikke med).");
    expect(at("en", () => t("app-assembly-export-animatic-dialog.audio-clips-included", { count: 1 }))).toBe("1 audio clip included in the video.");
  });

  it("språkversjonen bruker språkordet og tidskonflikter i flertall", () => {
    expect(t("app-assembly-language-version-dialog.timing-conflicts", { count: 1 })).toBe("1 timingkonflikt");
    expect(t("app-assembly-language-version-dialog.timing-conflicts", { count: 2 })).toBe("2 timingkonflikter");
    expect(t("app-assembly-language-version-dialog.voiced-lines", { voiced: 3, lines: 5, language: "engelsk" })).toBe("3 av 5 replikker med engelsk lyd");
    expect(at("en", () => t("app-assembly-language-version-dialog.voiced-lines", { voiced: 3, lines: 5, language: "English" }))).toBe("3 of 5 lines with English audio");
  });

  it("manustekstene fra ML2c: notater og scener uten nummer", () => {
    expect(t("app-script-scene-navigator.notes", { count: 1 })).toBe("1 notat");
    expect(t("app-script-scene-navigator.notes", { count: 7 })).toBe("7 notater");
    expect(at("en", () => t("app-script-scene-navigator.deactivate-scene", { number: t("app-script-scene-navigator.scene-without-number") }))).toBe("Deactivate scene without number");
  });

  it("sceneeditoren fra ML2d: andre scener og øyestillinger", () => {
    expect(t("app-scene-editor-animation-character-panel.used-in-others", { count: 1 })).toBe("Brukes i 1 annen scene");
    expect(t("app-scene-editor-animation-character-panel.used-in-others", { count: 2 })).toBe("Brukes i 2 andre scener");
    expect(at("en", () => t("app-scene-editor-animation-mouth-shape-editor.left-eye-closed"))).toBe("Left eye closed");
  });

  it("konstantene som testene og serveren sjekker, har samme tekst som nøklene", () => {
    expect(t("app-script-versions-dialog.partial-restore")).toBe(PARTIAL_RESTORE);
    expect(t("core-library-content-sync.content-sync-flag")).toBe(CONTENT_SYNC_FLAG);
    expect(t("app-library-image-prep.original-note-mark")).toBe(ORIGINAL_NOTE_MARK);
    expect(at("en", () => t("app-library-image-prep.original-note-mark"))).toBe(ORIGINAL_NOTE_MARK_EN);
    expect(t("adapters-storage-commands-functions.undo-production-history")).toBe(UNDO_PRODUCTION_HISTORY);
    expect(t("adapters-storage-commands-functions.undo-production-referenced")).toBe(UNDO_PRODUCTION_REFERENCED);
  });

  it("en-XA genereres fra engelsk, også for flertallsformer", () => {
    const k = "app-library-context-link-suggestions.approve-links";
    expect(at("en-XA", () => t(k, { count: 2 }))).toBe(pseudoText("Approve {count} links").replace("{count}", "2"));
  });
});
