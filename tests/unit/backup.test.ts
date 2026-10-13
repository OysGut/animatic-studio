// @vitest-environment node
/** Sikkerhetskopi av prosjekt (DEC-0049, REQ-0411/0412): lage, lese og gjenopprette. */
import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  backupFiles,
  backupIdMap,
  backupReadme,
  backupSummary,
  checkInvariants,
  diffStates,
  emptyProjectState,
  filmClips,
  makeBackup,
  orderedOccurrences,
  parseBackup,
  outdatedTakes,
  remapValue,
  validateBackup,
  restoreFiles,
  restoredExtras,
  restoredState,
  scriptView,
  stateFromRows,
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

function backup(include = new Set(["bilde", "lyd", "film", "manusfil"] as const)): BackupData {
  const rows = { project: fixture.project, ...fixture.rows } as unknown as ProjectRows;
  const docs: Row[] = [
    {
      id: "00000000-0000-7000-8000-00000000d0c1",
      project_id: fixture.project.id,
      production_id: Object.values(fixture.state.productions).find((p) => p.kind === "main")!.id,
      storage_key: `${fixture.project.id}/abc/manus.pdf`,
      file_name: "manus.pdf",
      sha256: "a".repeat(64),
      format: "pdf",
      page_count: 3,
      byte_size: 1234,
      language: "nb",
      change_id: null,
      created_at: "2026-10-08T10:00:00Z",
      created_by: "00000000-0000-7000-8000-a11ce0000001",
    },
  ];
  const b = makeBackup({
    rows,
    scriptVersions: (fixture.rows["script_versions"] ?? []) as Row[],
    importedDocuments: docs,
    changeLog: [{ id: "x", command_type: "ImportScreenplay" }],
    generationJobs: [],
    schemaVersion: 12,
    createdAt: "2026-10-10T20:00:00Z",
    include: include as unknown as ReadonlySet<never>,
  });
  // Gjennom JSON, som i zip-filen
  return JSON.parse(JSON.stringify(b)) as BackupData;
}

function freshProject(): ProjectState {
  const s = emptyProjectState({
    id: NEW_PROJECT as never,
    revision: 1,
    name: "Gjenopprettet",
    fps: FPS_25,
    frameWidth: 1920,
    frameHeight: 1080,
    primaryLanguage: "nb",
  });
  return {
    ...s,
    productions: {
      [NEW_MAIN]: {
        id: NEW_MAIN as never,
        revision: 1,
        kind: "main",
        name: "Hovedfilm",
        parentProductionId: null,
        fps: FPS_25,
      },
    },
  };
}

const mainOf = (s: ProjectState) => Object.values(s.productions).find((p) => p.kind === "main")!;

describe("sikkerhetskopi", () => {
  it("tar med alle prosjektdata, manusversjoner, historikk og en liste over alle filer", () => {
    const b = backup();
    expect(b.format).toBe(BACKUP_FORMAT);
    expect(b.tables["script_blocks"]).toHaveLength(Object.keys(fixture.state.blocks).length);
    expect(b.tables["script_versions"]).toHaveLength(1);
    expect(b.history["change_log"]).toHaveLength(1);
    const cats = new Set(b.files.map((f) => f.category));
    expect(cats).toEqual(new Set(["bilde", "lyd", "film", "manusfil"]));
    expect(b.files.every((f) => f.included && f.zipPath === `filer/${f.bucket}/${f.path}`)).toBe(
      true,
    );
    const sum = backupSummary(b);
    expect(sum.scenes).toBe(14);
    expect(sum.films).toBe(1);
    expect(backupReadme(b)).toContain("Jula på Dovre");
  });

  it("filer som ikke tas med, står i oversikten (eksterne avhengigheter)", () => {
    const b = backup(new Set(["bilde", "lyd"] as const) as never);
    const film = b.files.find((f) => f.category === "film")!;
    expect(film.included).toBe(false);
    expect(film.zipPath).toBe("");
    expect(backupReadme(b)).toContain("IKKE med");
    expect(
      backupFiles({ ...fixture.rows, project: fixture.project } as never, [], new Set()),
    ).not.toHaveLength(0);
  });

  it("avviser filer som ikke er sikkerhetskopier eller er fra en nyere versjon", () => {
    expect(() => parseBackup({ format: "noe annet" }, 12)).toThrow(/ikke en sikkerhetskopi/);
    expect(() => parseBackup({ ...backup(), formatVersion: 99 }, 12)).toThrow(/nyere versjon/);
    expect(() => parseBackup({ ...backup(), schemaVersion: 13 }, 12)).toThrow(/nyere database/);
    expect(() => parseBackup(backup(), 12)).not.toThrow();
  });

  it("gjenoppretter som nytt prosjekt med nye ID-er; manus, film og filer er de samme", async () => {
    const b = parseBackup(backup(), 12);
    const base = freshProject();
    const map = await backupIdMap(b, NEW_PROJECT, NEW_MAIN);
    // Deterministisk: et nytt forsøk gir samme ID-er
    const again = await backupIdMap(b, NEW_PROJECT, NEW_MAIN);
    expect([...again]).toEqual([...map]);
    const old = fixture.state;
    for (const id of Object.keys(old.blocks)) {
      expect(map.get(id)).toBeDefined();
      expect(map.get(id)).not.toBe(id);
    }
    // Tidsdelen beholdes, så rekkefølgen etter opprettelse er den samme
    const ids = Object.keys(old.blocks).sort();
    expect(ids.map((x) => map.get(x)!.slice(0, 13))).toEqual(ids.map((x) => x.slice(0, 13)));

    const s = restoredState(b, map, base, ACTOR);
    expect(checkInvariants(s)).toEqual([]);
    expect(s.project.id).toBe(NEW_PROJECT);
    expect(s.project.name).toBe("Gjenopprettet");
    expect(mainOf(s).id).toBe(NEW_MAIN);
    expect(mainOf(s).revision).toBe(2);
    // Manuset er det samme
    const text = (st: ProjectState) =>
      scriptView(st, mainOf(st).id).map((x) => [
        x.productionNumber,
        x.heading,
        x.blocks.map((bl) => bl.text),
      ]);
    expect(text(s)).toEqual(text(old));
    expect(orderedOccurrences(s, NEW_MAIN as never)).toHaveLength(
      orderedOccurrences(old, mainOf(old).id).length,
    );
    // Filmen, delene og tidskoblingene følger med
    const clips = filmClips(s, NEW_MAIN as never);
    const oldClips = filmClips(old, mainOf(old).id);
    expect(clips.map((c) => [c.source, c.durationFrames, c.parts.length])).toEqual(
      oldClips.map((c) => [c.source, c.durationFrames, c.parts.length]),
    );
    expect(Object.values(s.timeLinks)).toHaveLength(Object.values(old.timeLinks).length);
    // Alle filstier ligger i det nye prosjektets mappe
    for (const t of Object.values(s.takes))
      if (t.mediaRef) expect(t.mediaRef.startsWith(`${NEW_PROJECT}/`)).toBe(true);
    for (const v of Object.values(s.assetVersions))
      expect(v.mediaPath.startsWith(`${NEW_PROJECT}/`)).toBe(true);
    const files = restoreFiles(b, map);
    expect(files).toHaveLength(b.files.length);
    expect(files.every((f) => f.path.startsWith(`${NEW_PROJECT}/`))).toBe(true);
    // Teksthistorikken står på den som gjenoppretter
    expect(s.blockRevisions.every((r) => r.author === ACTOR)).toBe(true);
    // Endringssettet: alt er nytt, bortsett fra hovedfilmen som oppdateres
    const cs = diffStates(base, s);
    expect(cs.updates["productions"]).toHaveLength(1);
    // Bare AI-budsjettet skiller prosjektraden (format og overgang er like): det følger med (DEC-0053)
    expect(cs.updates["projects"]?.[0]).toMatchObject({
      ai_month_limit: 50,
      ai_price_per_image: 2,
    });
    expect(cs.inserts["script_blocks"]).toHaveLength(Object.keys(old.blocks).length);
    expect(Object.keys(cs.deletes)).toHaveLength(0);
    expect(cs.blockRevisions).toHaveLength(old.blockRevisions.length);
  });

  it("manusversjoner og importerte manusfiler får nye ID-er og peker på det nye prosjektet", async () => {
    const b = backup();
    const map = await backupIdMap(b, NEW_PROJECT, NEW_MAIN);
    const x = restoredExtras(b, map, ACTOR);
    expect(x.scriptVersions).toHaveLength(1);
    expect(x.scriptVersions[0]!["production_id"]).toBe(NEW_MAIN);
    expect(x.scriptVersions[0]!["created_by"]).toBe(ACTOR);
    expect(JSON.stringify(x.scriptVersions[0]!["snapshot"])).not.toContain(
      Object.keys(fixture.state.blocks)[0]!,
    );
    expect(x.importedDocuments[0]!["storage_key"]).toMatch(new RegExp(`^${NEW_PROJECT}/`));
  });

  it("bildefrekvens, format og standardovergang fra sikkerhetskopien tas med", async () => {
    const b = backup();
    const tweaked = {
      ...b,
      project: {
        ...b.project,
        fps_num: 24,
        frame_width: 2048,
        default_transition_kind: "dissolve",
        default_transition_frames: 25,
        default_transition_overlap: true,
      },
    };
    const base = freshProject();
    const s = restoredState(
      tweaked,
      await backupIdMap(tweaked, NEW_PROJECT, NEW_MAIN),
      base,
      ACTOR,
    );
    expect(s.project.fps.num).toBe(24);
    expect(s.project.frameWidth).toBe(2048);
    expect(s.project.defaultTransition).toEqual({ kind: "dissolve", frames: 25, overlap: true });
    expect(s.project.revision).toBe(2);
    expect(diffStates(base, s).updates["projects"]).toHaveLength(1);
  });

  it("egne varighetsantakelser tas med også når format og bildefrekvens er standard (KI-28)", async () => {
    const b = backup();
    const assumptions = {
      dialogueWordsPerMinute: 120,
      actionSecondsPerLine: 3,
      headingSeconds: 1,
      minSceneSeconds: 4,
    };
    const tweaked = {
      ...b,
      project: {
        ...b.project,
        default_transition_kind: "cut",
        default_transition_frames: 0,
        default_transition_overlap: false,
        ai_month_limit: null,
        ai_price_per_image: null,
        duration_assumptions: assumptions,
      },
    };
    const base = freshProject();
    const s = restoredState(
      tweaked,
      await backupIdMap(tweaked, NEW_PROJECT, NEW_MAIN),
      base,
      ACTOR,
    );
    expect(s.project.fps).toEqual(base.project.fps);
    expect(s.project.frameWidth).toBe(base.project.frameWidth);
    expect(s.project.durationAssumptions).toEqual(assumptions);
    expect(s.project.revision).toBe(2);
    expect(diffStates(base, s).updates["projects"]).toHaveLength(1);
  });

  it("avviser filstier utenfor prosjektet", async () => {
    const b = backup();
    const takes = b.tables["takes"]!.map((t) => ({
      ...t,
      media_ref: t["media_ref"] ? "11111111-1111-7111-8111-111111111111/films/x.mp4" : null,
    }));
    const bad = { ...b, tables: { ...b.tables, takes } };
    const map = await backupIdMap(bad, NEW_PROJECT, NEW_MAIN);
    expect(() => restoredState(bad, map, freshProject(), ACTOR)).toThrow(/utenfor prosjektet/);
  });

  it("bytter ID-er også inne i tekst og nestede verdier", () => {
    const map = new Map([["00000000-0000-7000-8000-000000000001", "x"]]);
    expect(remapValue({ a: ["p/00000000-0000-7000-8000-000000000001/f.png"], b: 2 }, map)).toEqual({
      a: ["p/x/f.png"],
      b: 2,
    });
    expect(stateFromRows).toBeTypeOf("function");
  });

  it("versjoner er ikke utdatert etter gjenoppretting (blokk-ID-ene i «produsert fra» byttes også)", async () => {
    const b = backup();
    const s = restoredState(b, await backupIdMap(b, NEW_PROJECT, NEW_MAIN), freshProject(), ACTOR);
    const take = Object.values(s.takes)[0]!;
    expect(Object.keys(take.producedFrom.blockRevisions).every((id) => s.blocks[id])).toBe(true);
    expect(outdatedTakes(s).length).toBe(outdatedTakes(fixture.state).length);
  });

  it("avviser referanser til noe utenfor sikkerhetskopien (et annet prosjekt)", async () => {
    const b = backup();
    const foreign = "11111111-1111-7111-8111-111111111111";
    const links = b.tables["time_links"]!.map((r) => ({ ...r, occurrence_id: foreign }));
    const bad = { ...b, tables: { ...b.tables, time_links: links } };
    const map = await backupIdMap(bad, NEW_PROJECT, NEW_MAIN);
    expect(() => restoredState(bad, map, freshProject(), ACTOR)).toThrow(
      /time_links.occurrence_id/,
    );
    const versions = b.tables["script_versions"]!.map((r) => ({ ...r, production_id: foreign }));
    const bad2 = { ...b, tables: { ...b.tables, script_versions: versions } };
    expect(() => restoredExtras(bad2, new Map([...map]), ACTOR)).toThrow(
      /script_versions.production_id/,
    );
    await expect(validateBackup(bad2)).rejects.toThrow(/ikke er med/);
    await expect(validateBackup(b)).resolves.toBeUndefined();
  });

  it("avviser bildeskifter som viser til ressurser utenfor sikkerhetskopien (DEC-0052)", async () => {
    const b = backup();
    const foreign = "11111111-1111-7111-8111-111111111111";
    const layers = b.tables["composition_layers"]!.map((r, i) =>
      i === 0
        ? {
            ...r,
            image_swaps: [{ frame: 3, assetId: foreign, assetVariantId: null, versionId: null }],
          }
        : r,
    );
    const bad = { ...b, tables: { ...b.tables, composition_layers: layers } };
    const map = await backupIdMap(bad, NEW_PROJECT, NEW_MAIN);
    expect(() => restoredState(bad, map, freshProject(), ACTOR)).toThrow(/image_swaps/);
  });
});
