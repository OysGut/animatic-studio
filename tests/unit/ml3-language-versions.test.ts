/** ML3 (B-049): N manusspråk per prosjekt – koder, register, kommandoer med angring, regler og eksportvalg. */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  blocksOfVariant,
  canonicalLanguageTag,
  diffStates,
  emptyProjectState,
  exportLanguageDecision,
  isNorwegianSourceTag,
  isScriptLanguageTag,
  languageTagCollisions,
  languageVersionError,
  languageVersionFor,
  languageVersionsOf,
  makeBackup,
  backupIdMap,
  restoredState,
  reviewLanguagesForBlock,
  scriptLanguageOptions,
  stateFromRows,
  translatedState,
  translationStatus,
  BACKUP_STATE_TABLES,
  type Command,
  type ProjectState,
} from "@/core";
import { bootUiLanguage, browserUiLanguage, LANGUAGE_KEY } from "@/app/i18n/language";
import { getUiLanguage } from "@/core";
import { envelope, seedProject, tid } from "../helpers/fixtures";

function apply(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  if (!r.ok) throw new Error(`${c.type}: ${r.error.message}`);
  return r;
}
function refused(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  expect(r.ok).toBe(false);
}
const LANGS = ["de", "pt-BR", "sr-Latn"] as const;

function withVersions(): { s: ProjectState; ids: Record<string, string> } {
  let s = seedProject(2).state;
  const ids: Record<string, string> = {};
  for (const language of LANGS) {
    const id = tid();
    ids[language] = id;
    s = apply(s, { type: "AddLanguageVersion", versionId: id, language, name: `Versjon ${language}` }).state;
  }
  return { s, ids };
}
const REQUIRED = ["productions", "scenes", "scene_variants", "script_blocks", "scene_occurrences", "production_segments", "takes"] as const;
function rowsOf(st: ProjectState) {
  const inserts = diffStates(emptyProjectState(st.project), st).inserts;
  return {
    ...Object.fromEntries(REQUIRED.map((k) => [k, []])),
    project: { id: st.project.id, name: st.project.name, revision: 1, fps_num: 25, fps_den: 1, frame_width: 1920, frame_height: 1080 },
    ...inserts,
    script_block_revisions: st.blockRevisions.map((r) => ({ project_id: st.project.id, block_id: r.blockId, rev: r.rev, text: r.text, author: r.author, created_at: "2026-10-20T00:00:00Z" })),
  } as never;
}
function firstVariant(s: ProjectState) {
  const v = Object.values(s.variants)[0];
  if (!v) throw new Error("variant");
  return v;
}

describe("ML3 – BCP-47 koder", () => {
  it("godtar språk, region og skript, og alle gamle «xx»/«xx-YY»-koder", () => {
    for (const tag of ["de", "en", "en-GB", "pt-BR", "sr-Latn", "zh-Hant-TW", "es-419", "sl-rozaj"]) expect(isScriptLanguageTag(tag)).toBe(true);
    for (const tag of ["", "e", "EN", "en-us", "sr-latn", "en_US", "deutsch-x"]) expect(isScriptLanguageTag(tag)).toBe(false);
  });
  it("kanoniserer skrivemåten uten å slå sammen lagrede verdier", () => {
    expect(canonicalLanguageTag("EN-us")).toBe("en-US");
    expect(canonicalLanguageTag("sr-latn")).toBe("sr-Latn");
    expect(canonicalLanguageTag("ikke en kode!")).toBeNull();
    expect(languageTagCollisions(["en-us", "en-US", "de", "de"])).toEqual([{ key: "en-us", tags: ["en-US", "en-us"] }]);
  });
  it("norsk er alltid kilde, aldri målspråk", () => {
    for (const tag of ["nb", "no", "nb-NO", "NO"]) expect(isNorwegianSourceTag(tag)).toBe(true);
    expect(isNorwegianSourceTag("nn")).toBe(false);
  });
});

describe("ML3 – register og kommandoer", () => {
  it("legger til tre målspråk; angre og gjør om gir samme tilstand", () => {
    const { s, ids } = withVersions();
    expect(languageVersionsOf(s).map((v) => v.language).sort()).toEqual(["de", "pt-BR", "sr-Latn"]);
    const r = apply(s, { type: "AddLanguageVersion", versionId: tid(), language: "fr", name: "Fransk" });
    const undone = apply(r.state, r.inverse);
    expect(undone.state.languageVersions).toEqual(s.languageVersions);
    const redone = apply(undone.state, undone.inverse);
    expect(Object.keys(redone.state.languageVersions)).toEqual(Object.keys(r.state.languageVersions));
    expect(ids["de"]).toBeTruthy();
  });
  it("avviser ugyldig kode, norsk, tomt navn og samme språk to ganger (også «en-us»/«en-US»)", () => {
    const { s } = withVersions();
    refused(s, { type: "AddLanguageVersion", versionId: tid(), language: "en_us", name: "X" });
    refused(s, { type: "AddLanguageVersion", versionId: tid(), language: "nb", name: "Norsk" });
    refused(s, { type: "AddLanguageVersion", versionId: tid(), language: "fr", name: "  " });
    refused(s, { type: "AddLanguageVersion", versionId: tid(), language: "de", name: "Tysk igjen" });
    expect(languageVersionError(s, { language: "DE", name: "x", status: "active" })).toBe("language");
    const en = apply(s, { type: "AddLanguageVersion", versionId: tid(), language: "en-US", name: "US" }).state;
    expect(languageVersionError(en, { language: "en-us", name: "x", status: "active" })).not.toBeNull();
  });
  it("nytt navn og fjerning kan angres; fjerning sletter ingen oversettelser", () => {
    const { s, ids } = withVersions();
    const v = firstVariant(s);
    const block = blocksOfVariant(s, v.id).find((b) => b.kind !== "heading");
    if (!block) throw new Error("block");
    const tr = tid();
    const withT = apply(s, { type: "AddTranslations", items: [{ translationId: tr as never, fields: { blockId: block.id, variantId: null, language: "de", text: "Deutsch", basedOnRev: block.currentRev, status: "approved" } }] }).state;
    expect(withT.translations[tr]?.languageVersionId).toBe(ids["de"]);
    const renamed = apply(withT, { type: "UpdateLanguageVersion", versionId: ids["de"]!, name: "Tysk" });
    expect(renamed.state.languageVersions[ids["de"]!]?.name).toBe("Tysk");
    expect(apply(renamed.state, renamed.inverse).state.languageVersions[ids["de"]!]?.name).toBe("Versjon de");
    const removed = apply(withT, { type: "SetLanguageVersionRemoved", versionId: ids["de"]!, removed: true });
    expect(removed.state.translations[tr]?.removed).toBe(false);
    expect(languageVersionFor(removed.state, "de")).toBeUndefined();
    expect(apply(removed.state, removed.inverse).state.languageVersions[ids["de"]!]?.removed).toBe(false);
    // Angring av opprettelsen er sperret når oversettelser bruker versjonen (ingen stille tap)
    refused(withT, { type: "UndoAddLanguageVersion", versionId: ids["de"]! });
  });
});

describe("ML3 – regler", () => {
  it("linjer og koblinger får versjonen til språket; norsk kilde endres aldri; sceneisolasjon og 1:n/n:1", () => {
    const { s, ids } = withVersions();
    const [v1, v2] = Object.values(s.variants);
    if (!v1 || !v2) throw new Error("variants");
    const b1 = blocksOfVariant(s, v1.id).filter((b) => b.kind !== "heading");
    const b2 = blocksOfVariant(s, v2.id).filter((b) => b.kind !== "heading");
    const before = Object.fromEntries(Object.values(s.blocks).map((b) => [b.id, b.text]));
    const tPt = tid(), u1 = tid(), u2 = tid();
    let st = apply(s, { type: "AddTranslations", items: [{ translationId: tPt as never, fields: { blockId: b1[0]!.id, variantId: null, language: "pt-BR", text: "Olá", basedOnRev: b1[0]!.currentRev, status: "uncertain" } }] }).state;
    st = apply(st, { type: "AddTranslationLines", items: [{ lineId: u1, fields: { variantId: v1.id, language: "sr-Latn", ord: 0, kind: "action", text: "Prva" } }, { lineId: u2, fields: { variantId: v1.id, language: "sr-Latn", ord: 1, kind: "action", text: "Druga" } }] }).state;
    expect(st.translationLines[u1]?.languageVersionId).toBe(ids["sr-Latn"]);
    // 1:n
    const split = tid();
    const r = apply(st, { type: "SetLineLink", linkId: split, fields: { variantId: v1.id, language: "sr-Latn", sourceBlockIds: [b1[0]!.id], targetTranslationIds: [u1, u2], origin: "manual", confidence: 1, reason: "" } });
    expect(r.state.translationLineLinks[split]?.languageVersionId).toBe(ids["sr-Latn"]);
    // n:1
    const merge = tid();
    const m = apply(st, { type: "SetLineLink", linkId: merge, fields: { variantId: v1.id, language: "pt-BR", sourceBlockIds: [b1[0]!.id, b1[1]!.id], targetTranslationIds: [tPt], origin: "manual", confidence: 1, reason: "" } });
    expect(m.state.translationLineLinks[merge]?.languageVersionId).toBe(ids["pt-BR"]);
    // Andre scener og andre språk avvises
    refused(st, { type: "SetLineLink", linkId: tid(), fields: { variantId: v2.id, language: "sr-Latn", sourceBlockIds: [b2[0]!.id], targetTranslationIds: [u1], origin: "manual", confidence: 1, reason: "" } });
    refused(st, { type: "SetLineLink", linkId: tid(), fields: { variantId: v1.id, language: "de", sourceBlockIds: [b1[0]!.id], targetTranslationIds: [u1], origin: "manual", confidence: 1, reason: "" } });
    // Angre bringer tilbake, norsk er uendret hele veien
    const undone = apply(r.state, r.inverse).state;
    for (const x of [st, r.state, m.state, undone]) expect(Object.fromEntries(Object.values(x.blocks).map((b) => [b.id, b.text]))).toEqual(before);
    // Andre språk er uendret av arbeid i ett språk
    expect(Object.values(r.state.translations).filter((t) => t.language === "de")).toEqual(Object.values(st.translations).filter((t) => t.language === "de"));
  });
  it("norsk kilderevisjon gir «må gjennomgås» i alle berørte språk og overskriver ingenting", () => {
    const { s } = withVersions();
    const prod = Object.values(s.productions).find((p) => p.kind === "main")!;
    const v = firstVariant(s);
    const b = blocksOfVariant(s, v.id).find((x) => x.kind !== "heading")!;
    let st = s;
    for (const language of LANGS)
      st = apply(st, { type: "AddTranslations", items: [{ translationId: tid() as never, fields: { blockId: b.id, variantId: null, language, text: `T ${language}`, basedOnRev: b.currentRev, status: "approved" } }] }).state;
    const edited = apply(st, { type: "EditBlockText", productionId: prod.id, blockId: b.id, text: "Ny norsk tekst" }).state;
    expect(reviewLanguagesForBlock(edited, b.id)).toEqual([...LANGS].sort());
    for (const language of LANGS) {
      expect(translationStatus(edited, prod.id, language).reviewIds.has(b.id)).toBe(true);
      expect(Object.values(edited.translations).find((t) => t.language === language)?.text).toBe(`T ${language}`);
    }
  });
  it("eldre rader uten versjon avledes fra prosjekt + språk og vises som egne valg, også kollisjoner", () => {
    const s = seedProject(1).state;
    const b = Object.values(s.blocks).find((x) => x.kind !== "heading")!;
    const legacy = { ...s, translations: { a: { id: "a" as never, revision: 1, blockId: b.id, variantId: null, language: "en-US", text: "x", basedOnRev: 1, status: "approved" as const, removed: false }, c: { id: "c" as never, revision: 1, blockId: b.id, variantId: null, language: "en-us", text: "y", basedOnRev: 1, status: "approved" as const, removed: false } } };
    const opts = scriptLanguageOptions(legacy);
    expect(opts.map((o) => [o.language, o.derived])).toEqual([["en-US", true], ["en-us", true]]);
    expect(languageTagCollisions(opts.map((o) => o.language))).toHaveLength(1);
  });
});

describe("ML3 – eksport og lagring", () => {
  it("ufullstendig oversettelse krever eksplisitt valg mellom norsk reserve og stopp", () => {
    const status = { missingIds: new Set(["x"]), uncertain: 0, review: 1 };
    expect(exportLanguageDecision(status).kind).toBe("needs-choice");
    expect(exportLanguageDecision(status, "fallback")).toEqual({ kind: "fallback", missing: 1, uncertain: 0, review: 1 });
    expect(exportLanguageDecision(status, "stop").kind).toBe("stopped");
    expect(exportLanguageDecision({ missingIds: new Set(), uncertain: 0, review: 0 }).kind).toBe("complete");
  });
  it("norsk reserve beholder norsk tekst for manglende linjer", () => {
    const { s } = withVersions();
    const v = firstVariant(s);
    const [b1, b2] = blocksOfVariant(s, v.id).filter((b) => b.kind !== "heading");
    const st = apply(s, { type: "AddTranslations", items: [{ translationId: tid() as never, fields: { blockId: b1!.id, variantId: null, language: "de", text: "Deutsch", basedOnRev: b1!.currentRev, status: "approved" } }] }).state;
    const view = translatedState(st, "de");
    expect(view.blocks[b1!.id]?.text).toBe("Deutsch");
    expect(view.blocks[b2!.id]?.text).toBe(st.blocks[b2!.id]?.text);
  });
  it("lagringsrundtur og sikkerhetskopi tar med språkversjoner og versjon-ID-er", async () => {
    const { s, ids } = withVersions();
    const b = Object.values(s.blocks).find((x) => x.kind !== "heading")!;
    const st = apply(s, { type: "AddTranslations", items: [{ translationId: tid() as never, fields: { blockId: b.id, variantId: null, language: "sr-Latn", text: "Zdravo", basedOnRev: b.currentRev, status: "approved" } }] }).state;
    expect(BACKUP_STATE_TABLES).toContain("language_versions");
    const inserts = diffStates(emptyProjectState(st.project), st).inserts;
    expect(inserts["language_versions"]).toHaveLength(3);
    expect(inserts["translations"]?.[0]?.["language_version_id"]).toBe(ids["sr-Latn"]);
    const rows = rowsOf(st);
    const round = stateFromRows(rows);
    expect(Object.values(round.languageVersions).map((v) => v.language).sort()).toEqual(["de", "pt-BR", "sr-Latn"]);
    const backup = makeBackup({ rows, scriptVersions: [], importedDocuments: [], changeLog: [], generationJobs: [], schemaVersion: 66, createdAt: "2026-10-20T00:00:00Z", include: new Set() });
    expect(backup.tables["language_versions"]).toHaveLength(3);
    const pid = tid<"project">(), main = tid<"production">();
    const map = await backupIdMap(backup, pid, main);
    const originalMain = Object.values(st.productions).find((p) => p.kind === "main")!;
    const restored = restoredState(backup, map, { ...emptyProjectState({ ...st.project, id: pid }), productions: { [main]: { ...originalMain, id: main } } }, tid());
    const t = Object.values(restored.translations).find((x) => x.language === "sr-Latn");
    expect(t?.languageVersionId).toBe(map.get(ids["sr-Latn"]!));
    expect(restored.languageVersions[t!.languageVersionId!]?.language).toBe("sr-Latn");
  });
  it("eldre sikkerhetskopi uten språkversjoner kan fortsatt leses", () => {
    const s = seedProject(1).state;
    expect(stateFromRows(rowsOf(s)).languageVersions).toEqual({});
  });
});

describe("ML3 – feilsiden følger språkvalget", () => {
  it("nettleserspråket brukes når ingenting er lagret", () => {
    expect(browserUiLanguage(["en-GB", "nb"])).toBe("en");
    expect(browserUiLanguage(["nn-NO"])).toBe("nb");
    expect(browserUiLanguage(["de-DE"])).toBeNull();
  });
  it("lagret språk leses synkront før LanguageRoot har satt det", () => {
    expect(getUiLanguage()).toBe("nb");
    window.localStorage.setItem(LANGUAGE_KEY, "en");
    try {
      expect(bootUiLanguage()).toBe("en");
      window.localStorage.setItem(LANGUAGE_KEY, "nb");
      expect(bootUiLanguage()).toBe("nb");
    } finally {
      window.localStorage.removeItem(LANGUAGE_KEY);
    }
  });
});
