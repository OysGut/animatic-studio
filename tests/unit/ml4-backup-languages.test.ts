// @vitest-environment node
/**
 * ML4 (B-049): sikkerhetskopi før og etter migrasjon 0066. Alle ID-er, språkversjoner, oversettelser,
 * linjekoblinger og lydvalg (`*`, `none`, talespråk) følger med. En gammel kopi (før 0066, uten
 * `language_versions` og uten `language_version_id`) leses inn i den nye appen uten tap.
 */
import { describe, expect, it } from "vitest";
import {
  backupIdMap,
  checkInvariants,
  emptyProjectState,
  makeBackup,
  parseBackup,
  restoredState,
  scriptLanguageOptions,
  FPS_25,
  type BackupData,
  type ProjectRows,
  type ProjectState,
  type Row,
} from "@/core";
import { fixture } from "../visual/fixture-state";

const NEW_PROJECT = "01900000-0000-7000-8000-00000000aaaa";
const NEW_MAIN = "01900000-0000-7000-8000-00000000bbbb";
const ACTOR = "01900000-0000-7000-8000-00000000cccc";
const PID = fixture.project.id;
const id = (n: number) => `00000000-0000-7000-8000-0000000c${String(n).padStart(4, "0")}`;
const VERSIONS = { de: id(1), "pt-BR": id(2), "sr-Latn": id(3) } as const;
const rows0 = fixture.rows as unknown as Record<string, Row[]>;
const blocks = rows0["script_blocks"]!.filter((b) => b["kind"] !== "heading" && !b["removed"]);
const variant = String(blocks[0]!["variant_id"]);
const sameScene = blocks.filter((b) => b["variant_id"] === variant).slice(0, 2);

/** Prosjektradene med tre språkversjoner, oversettelser, linjer, koblinger og lydvalg. */
function rows(withVersions: boolean): ProjectRows {
  const v = (lang: keyof typeof VERSIONS) => (withVersions ? { language_version_id: VERSIONS[lang] } : {});
  const translations: Row[] = [];
  const lines: Row[] = [];
  const links: Row[] = [];
  let n = 10;
  for (const lang of Object.keys(VERSIONS) as (keyof typeof VERSIONS)[]) {
    const tIds = sameScene.map(() => id(n++));
    sameScene.forEach((b, i) =>
      translations.push({ id: tIds[i], project_id: PID, revision: 1, block_id: b["id"], variant_id: null, language: lang, text: `${lang} ${i} – ćšž Ђорђе`, based_on_rev: b["current_rev"], status: "approved", removed: false, ...v(lang) }),
    );
    const lineId = id(n++);
    lines.push({ id: lineId, project_id: PID, revision: 1, variant_id: variant, language: lang, ord: 1, kind: "action", text: `${lang} importert`, removed: false, ...v(lang) });
    // 1:n (én norsk linje → to oversatte) og n:1 (to norske → én oversatt linje)
    links.push({ id: id(n++), project_id: PID, revision: 1, variant_id: variant, language: lang, source_block_ids: [sameScene[0]!["id"]], target_translation_ids: tIds, origin: "approved", confidence: 0.9, reason: "", removed: false, ...v(lang) });
    links.push({ id: id(n++), project_id: PID, revision: 1, variant_id: variant, language: lang, source_block_ids: sameScene.map((b) => b["id"]), target_translation_ids: [lineId], origin: "manual", confidence: 1, reason: "", removed: false, ...v(lang) });
  }
  const audio = rows0["audio_clips"]!.map((c, i) => ({ ...c, language: i === 0 ? "*" : i === 1 ? "de" : c["language"], speech_language: i === 1 ? "sr-Latn" : c["speech_language"] }));
  const takes = rows0["takes"]!.map((t, i) => ({ ...t, audio_language: i === 0 ? "none" : t["audio_language"] }));
  const base = { project: fixture.project, ...fixture.rows, translations: [...(rows0["translations"] ?? []), ...translations], translation_lines: lines, translation_line_links: links, audio_clips: audio, takes } as Record<string, unknown>;
  if (withVersions)
    base["language_versions"] = (Object.entries(VERSIONS) as [string, string][]).map(([language, vid]) => ({ id: vid, project_id: PID, language, source_language: "nb", name: `Navn ${language}`, status: "active", removed: false, revision: 1, created_at: "2026-10-20T10:00:00Z", created_by: ACTOR }));
  else delete base["language_versions"];
  return base as unknown as ProjectRows;
}

function backup(withVersions: boolean, schemaVersion: number): BackupData {
  const b = makeBackup({ rows: rows(withVersions), scriptVersions: [], importedDocuments: [], changeLog: [], generationJobs: [], schemaVersion, createdAt: "2026-10-20T12:00:00Z", include: new Set() });
  const json = JSON.parse(JSON.stringify(b)) as BackupData;
  if (!withVersions) {
    // Slik en kopi fra før 0066 ser ut: ingen tabell og ingen kolonne for språkversjoner
    const tables = { ...json.tables } as Record<string, Row[]>;
    delete tables["language_versions"];
    for (const t of ["translations", "translation_lines", "translation_line_links"]) tables[t] = (tables[t] ?? []).map(({ language_version_id: _drop, ...r }) => r);
    return { ...json, tables };
  }
  return json;
}

function fresh(): ProjectState {
  const s = emptyProjectState({ id: NEW_PROJECT as never, revision: 1, name: "Gjenopprettet", fps: FPS_25, frameWidth: 1920, frameHeight: 1080, primaryLanguage: "nb" });
  return { ...s, productions: { [NEW_MAIN]: { id: NEW_MAIN as never, revision: 1, kind: "main", name: "Hovedfilm", parentProductionId: null, fps: FPS_25 } } };
}

async function restore(b: BackupData) {
  const parsed = parseBackup(b, 66);
  const map = await backupIdMap(parsed, NEW_PROJECT, NEW_MAIN);
  return { map, s: restoredState(parsed, map, fresh(), ACTOR) };
}

const langOf = (s: ProjectState) => (x: { language: string }) => x.language;

describe("ML4 – sikkerhetskopi med språkversjoner (etter 0066)", () => {
  it("tar med de tre språkversjonene og alle radene med versjon-ID", () => {
    const b = backup(true, 66);
    expect(b.tables["language_versions"]).toHaveLength(3);
    expect(b.tables["translation_line_links"]).toHaveLength(6);
    expect(b.tables["translation_lines"]!.every((r) => typeof r["language_version_id"] === "string")).toBe(true);
  });

  it("gjenoppretter alle ID-er, språkversjoner og koblinger, også 1:n og n:1", async () => {
    const { map, s } = await restore(backup(true, 66));
    expect(checkInvariants(s)).toEqual([]);
    const versions = Object.values(s.languageVersions);
    expect(versions.map((v) => v.language).sort()).toEqual(["de", "pt-BR", "sr-Latn"]);
    for (const [lang, old] of Object.entries(VERSIONS)) {
      const nid = map.get(old)!;
      expect(nid).toBeDefined();
      expect(nid).not.toBe(old);
      expect(s.languageVersions[nid]?.language).toBe(lang);
      expect(s.languageVersions[nid]?.name).toBe(`Navn ${lang}`);
      const tr = Object.values(s.translations).filter((t) => t.language === lang);
      expect(tr).toHaveLength(2);
      expect(tr.every((t) => t.languageVersionId === nid)).toBe(true);
      const ls = Object.values(s.translationLineLinks).filter((l) => l.language === lang);
      expect(ls.map((l) => [l.sourceBlockIds.length, l.targetTranslationIds.length]).sort()).toEqual([[1, 2], [2, 1]]);
      expect(ls.every((l) => l.languageVersionId === nid && l.variantId === map.get(variant))).toBe(true);
      // Koblingene peker på de nye ID-ene, ikke de gamle
      for (const l of ls) for (const t of l.targetTranslationIds) expect(s.translations[t] ?? s.translationLines[t]).toBeDefined();
    }
    // Tekst med kyrillisk og latinsk serbisk er uendret
    expect(Object.values(s.translations).filter((t) => t.language === "sr-Latn").map((t) => t.text)).toEqual(["sr-Latn 0 – ćšž Ђорђе", "sr-Latn 1 – ćšž Ђорђе"]);
  });

  it("lydvalgene følger med uendret: «*», språk, talespråk og «none»", async () => {
    const { map, s } = await restore(backup(true, 66));
    const clips = rows0["audio_clips"]!;
    expect(s.audioClips[map.get(String(clips[0]!["id"]))!]?.language).toBe("*");
    expect(s.audioClips[map.get(String(clips[1]!["id"]))!]?.language).toBe("de");
    expect(s.audioClips[map.get(String(clips[1]!["id"]))!]?.speechLanguage).toBe("sr-Latn");
    expect(s.takes[map.get(String(rows0["takes"]![0]!["id"]))!]?.audioLanguage).toBe("none");
  });

  it("norsk kilde er den samme etter gjenoppretting", async () => {
    const { map, s } = await restore(backup(true, 66));
    for (const b of blocks) expect(s.blocks[map.get(String(b["id"]))!]?.text).toBe(b["text"]);
  });
});

describe("ML4 – gammel sikkerhetskopi (før 0066) i den nye appen", () => {
  it("leses inn uten feil og uten tap", async () => {
    const b = backup(false, 65);
    expect(b.tables["language_versions"]).toBeUndefined();
    const { map, s } = await restore(b);
    expect(checkInvariants(s)).toEqual([]);
    // Ingen backfill: ingen registrerte versjoner, og ingen rad får en versjon-ID
    expect(Object.values(s.languageVersions)).toHaveLength(0);
    expect(Object.values(s.translations).every((t) => t.languageVersionId === undefined)).toBe(true);
    // Alle radene og ID-ene er med
    const n = (t: string) => (b.tables[t] ?? []).length;
    expect(Object.keys(s.translations)).toHaveLength(n("translations"));
    expect(Object.keys(s.translationLines)).toHaveLength(n("translation_lines"));
    expect(Object.keys(s.translationLineLinks)).toHaveLength(n("translation_line_links"));
    for (const t of ["translations", "translation_lines", "translation_line_links", "audio_clips", "takes", "script_blocks"])
      for (const r of b.tables[t] ?? []) expect(map.has(String(r["id"]))).toBe(true);
  });

  it("språkene avledes fra radene, så manuset viser alle tre målspråkene", async () => {
    const { s } = await restore(backup(false, 65));
    const opts = scriptLanguageOptions(s);
    for (const lang of ["de", "pt-BR", "sr-Latn"]) expect(opts.some((o) => o.language === lang && o.derived && o.versionId === null)).toBe(true);
    expect(Object.values(s.translations).map(langOf(s))).toEqual(expect.arrayContaining(["de", "pt-BR", "sr-Latn", "en"]));
  });

  it("lydvalgene i en gammel kopi beholder betydningen", async () => {
    const { map, s } = await restore(backup(false, 65));
    const clips = rows0["audio_clips"]!;
    expect(s.audioClips[map.get(String(clips[0]!["id"]))!]?.language).toBe("*");
    expect(s.takes[map.get(String(rows0["takes"]![0]!["id"]))!]?.audioLanguage).toBe("none");
  });

  it("en kopi fra en nyere database enn appen avvises fortsatt", () => {
    expect(() => parseBackup(backup(true, 67), 66)).toThrow();
  });
});
