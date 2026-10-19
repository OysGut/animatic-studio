/** DV2: lydversjoner per replikk – kommandoer, invers, angre/gjør om, speiling, overlapp, leppesynk og backup. */
import { describe, expect, it } from "vitest";
import {
  BACKUP_STATE_TABLES,
  applyCommand,
  audioClipFieldsOf,
  clipEditOf,
  dialogueMirrorViolations,
  dialogueOverlaps,
  diffStates,
  emptyProjectState,
  lipsyncOutdated,
  sceneAudioItems,
  stateFromRows,
  versionsOfClip,
  type Command,
  type DialogueEdit,
  type DialogueVersionFields,
  type ProjectState,
} from "@/core";
import { envelope } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";
import { dvBase, dvId as id } from "../helpers/dialogue-fixture";

function apply(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  if (!r.ok) throw new Error(`${c.type}: ${r.error.message}`);
  return r;
}
const fail = (s: ProjectState, c: Command) => {
  const r = applyCommand(s, envelope(c));
  return r.ok ? null : r.error;
};

/** Revisjonen øker ved angring; innholdet skal være identisk. */
const noRev = (o: Readonly<Record<string, { revision: number }>>) =>
  Object.fromEntries(Object.entries(o).map(([k, { revision: _r, ...rest }]) => [k, rest]));
const editA: DialogueEdit = { sourceInMs: 250, lengthMs: 2000, gainDb: -3, fadeInMs: 100, fadeOutMs: 300, volumeKeys: [{ t: 0, db: 0 }, { t: 1000, db: -10 }], speed: 1.25, compositionId: null };
const editB: DialogueEdit = { sourceInMs: 0, lengthMs: 1500, gainDb: 4, fadeInMs: 0, fadeOutMs: 0, volumeKeys: [], speed: 0.8, compositionId: null };

describe("DV2 lydversjoner", () => {
  it("fixturens replikker har en aktiv versjon, og speilingen stemmer (invariant)", () => {
    const clips = Object.values(fixture.state.audioClips).filter((c) => c.kind === "dialogue" && c.blockId);
    expect(clips.length).toBeGreaterThan(0);
    for (const c of clips) expect(c.activeVersionId).toBeTruthy();
    expect(dialogueMirrorViolations(fixture.state)).toEqual([]);
    // Musikk, effekter og atmosfære får ingen versjoner
    for (const c of Object.values(fixture.state.audioClips).filter((c) => c.kind !== "dialogue"))
      expect(c.activeVersionId ?? null).toBeNull();
  });

  it("nytt take via eksisterende lydflyt blir ny versjon; bytte tilbake gir versjon A nøyaktig slik den var (L7–L9)", () => {
    const { s: s0, clipId, takes } = dvBase();
    let s = s0;
    const vA = s.audioClips[clipId]!.activeVersionId!;
    s = apply(s, { type: "UpdateDialogueVersionEdit", dialogueVersionId: vA, edit: editA }).state;
    // Velg take 2 med den gamle flyten («Bruk dette»): klippets felt kopieres, men A beholder sin redigering
    s = apply(s, { type: "UpdateAudioClips", clips: [{ clipId: clipId as never, fields: { ...audioClipFieldsOf(s.audioClips[clipId]!), versionId: takes[1] as never } }] }).state;
    const vB = s.audioClips[clipId]!.activeVersionId!;
    expect(vB).not.toBe(vA);
    const count = versionsOfClip(s, clipId).length;
    s = apply(s, { type: "UpdateDialogueVersionEdit", dialogueVersionId: vB, edit: editB }).state;
    s = apply(s, { type: "MoveDialogueLine", clipId: clipId as never, offsetMs: 4321 }).state;
    // Tilbake til take 1 med gammel flyt: versjon A med SIN redigering, på replikkens nåværende plass
    s = apply(s, { type: "UpdateAudioClips", clips: [{ clipId: clipId as never, fields: { ...audioClipFieldsOf(s.audioClips[clipId]!), versionId: takes[0] as never } }] }).state;
    const a = s.audioClips[clipId]!;
    expect(a.activeVersionId).toBe(vA);
    expect(a.offsetMs).toBe(4321);
    expect(clipEditOf(s, a)).toEqual(editA);
    expect(clipEditOf(s, { ...a, activeVersionId: vB })).toEqual(editB);
    expect(versionsOfClip(s, clipId)).toHaveLength(count);
    expect(dialogueMirrorViolations(s)).toEqual([]);
  });

  it("lydeditoren (UpdateAudioClips uten ny fil) redigerer aktiv versjon, ikke de andre", () => {
    const { s: s0, clipId, takes } = dvBase();
    let s = apply(s0, { type: "UpdateAudioClips", clips: [{ clipId: clipId as never, fields: { ...audioClipFieldsOf(s0.audioClips[clipId]!), versionId: takes[1] as never } }] }).state;
    const [vA, vB] = versionsOfClip(s, clipId).map((v) => v.id);
    const beforeA = s.dialogueVersions[vA!]!;
    s = apply(s, { type: "UpdateAudioClips", clips: [{ clipId: clipId as never, fields: { ...audioClipFieldsOf(s.audioClips[clipId]!), gainDb: -9, fadeInMs: 777 } }] }).state;
    expect(s.dialogueVersions[vB!]!.gainDb).toBe(-9);
    expect(s.dialogueVersions[vB!]!.fadeInMs).toBe(777);
    expect(s.dialogueVersions[vA!]).toEqual(beforeA);
  });

  it("avspilling og eksport leser fra aktiv versjon (L6)", () => {
    const { s: s0, clipId } = dvBase();
    const vA = s0.audioClips[clipId]!.activeVersionId!;
    const s = apply(s0, { type: "UpdateDialogueVersionEdit", dialogueVersionId: vA, edit: editA }).state;
    const it = sceneAudioItems(s, s.audioClips[clipId]!.occurrenceId).find((x) => x.clip.id === clipId)!;
    expect(it.sourceIn).toBe(0.25);
    expect(it.fullLength).toBe(2);
    expect(it.speed).toBe(1.25);
    expect(it.fadeIn).toBe(0.1);
    expect(it.keys).toEqual([{ t: 0, db: 0 }, { t: 1, db: -10 }]);
  });

  it("hver kommando har en invers: angre gir identisk tilstand, gjør om gir samme resultat", () => {
    const { s: s0, clipId, takes } = dvBase();
    const vA = s0.audioClips[clipId]!.activeVersionId!;
    const fields: DialogueVersionFields = { assetId: s0.audioClips[clipId]!.assetId, assetVariantId: id(1), assetVersionId: takes[2]!, ...editB, source: "ai", provider: "elevenlabs", voiceId: "voice-1", modelId: "eleven_multilingual_v2", settings: { stability: 0.5 }, scriptRevision: 1, parentVersionId: vA };
    const cmds: Command[] = [
      { type: "AddDialogueVersion", dialogueVersionId: id(10), clipId: clipId as never, fields, activate: true },
      { type: "AddDialogueVersion", dialogueVersionId: id(11), clipId: clipId as never, fields: { ...fields, assetVersionId: takes[1]! }, activate: false },
      { type: "UpdateDialogueVersionEdit", dialogueVersionId: vA, edit: editA },
      { type: "MoveDialogueLine", clipId: clipId as never, offsetMs: 2222 },
    ];
    let s = s0;
    for (const c of cmds) {
      const r = apply(s, c);
      const undone = apply(r.state, r.inverse);
      expect(noRev(undone.state.dialogueVersions)).toEqual(noRev(s.dialogueVersions));
      expect(noRev({ c: undone.state.audioClips[clipId]! })).toEqual(noRev({ c: s.audioClips[clipId]! }));
      const redone = apply(undone.state, undone.inverse);
      expect(noRev(redone.state.dialogueVersions)).toEqual(noRev(r.state.dialogueVersions));
      s = r.state;
    }
    const sw = apply(s, { type: "SetActiveDialogueVersion", clipId: clipId as never, dialogueVersionId: vA });
    expect(sw.state.audioClips[clipId]!.activeVersionId).toBe(vA);
    expect(apply(sw.state, sw.inverse).state.audioClips[clipId]!.activeVersionId).toBe(id(10));
    expect(dialogueMirrorViolations(sw.state)).toEqual([]);
  });

  it("aktiv versjon kan ikke slettes; «Slett versjon» er myk og kan angres", () => {
    const { s: s0, clipId, takes } = dvBase();
    const s = apply(s0, { type: "UpdateAudioClips", clips: [{ clipId: clipId as never, fields: { ...audioClipFieldsOf(s0.audioClips[clipId]!), versionId: takes[1] as never } }] }).state;
    const [vA, vB] = versionsOfClip(s, clipId).map((v) => v.id);
    expect(fail(s, { type: "SetDialogueVersionRemoved", dialogueVersionId: vB!, removed: true })?.code).toBe("invalid");
    const r = apply(s, { type: "SetDialogueVersionRemoved", dialogueVersionId: vA!, removed: true });
    expect(r.state.dialogueVersions[vA!]?.removed).toBe(true);
    expect(r.state.dialogueVersions[vA!]?.sourceInMs).toBe(s.dialogueVersions[vA!]?.sourceInMs);
    expect(apply(r.state, r.inverse).state.dialogueVersions[vA!]?.removed).toBe(false);
  });

  it("angring av en replikk med flere versjoner stoppes – ingen versjon går tapt", () => {
    const { s: s0, clipId, takes } = dvBase();
    const s = apply(s0, { type: "UpdateAudioClips", clips: [{ clipId: clipId as never, fields: { ...audioClipFieldsOf(s0.audioClips[clipId]!), versionId: takes[1] as never } }] }).state;
    expect(fail(s, { type: "UndoAddAudioClips", clipIds: [clipId as never] })?.code).toBe("referenced");
  });

  it("flytting som overlapper samme karakter hindres; andre replikker flyttes aldri (§30, L10)", () => {
    const { s: s0, clipId } = dvBase();
    const clip = s0.audioClips[clipId]!;
    const otherId = id(30);
    const s = apply(s0, { type: "AddAudioClips", clips: [{ clipId: otherId as never, fields: { ...audioClipFieldsOf(clip), offsetMs: clip.offsetMs + 60_000 } }] }).state;
    expect(s.audioClips[otherId]!.activeVersionId).toBeTruthy();
    const target = s.audioClips[otherId]!.offsetMs + 10;
    expect(dialogueOverlaps(s, clipId, target)).toEqual([otherId]);
    const err = fail(s, { type: "MoveDialogueLine", clipId: clipId as never, offsetMs: target });
    expect(err?.code).toBe("invalid");
    expect(err?.details).toEqual([otherId]);
    const ok = apply(s, { type: "MoveDialogueLine", clipId: clipId as never, offsetMs: target, allowOverlap: true });
    expect(ok.state.audioClips[otherId]!.offsetMs).toBe(s.audioClips[otherId]!.offsetMs);
  });

  it("leppesynk for en annen versjon er utdatert etter bytte (punkt 4)", () => {
    const { s: s0, clipId, takes } = dvBase();
    const vA = s0.audioClips[clipId]!.activeVersionId!;
    const r = { clipId, dialogueVersionId: vA };
    expect(lipsyncOutdated(s0, r)).toBe(false);
    const s = apply(s0, { type: "UpdateAudioClips", clips: [{ clipId: clipId as never, fields: { ...audioClipFieldsOf(s0.audioClips[clipId]!), versionId: takes[1] as never } }] }).state;
    expect(lipsyncOutdated(s, r)).toBe(true);
    expect(lipsyncOutdated(s, { clipId })).toBe(false);
  });

  it("rader rundtur: lydversjoner og aktivt valg lagres og leses tilbake likt", () => {
    const { s: s0, clipId } = dvBase();
    const vA = s0.audioClips[clipId]!.activeVersionId!;
    const s = apply(s0, { type: "UpdateDialogueVersionEdit", dialogueVersionId: vA, edit: editA }).state;
    const ins = diffStates(emptyProjectState(s.project), s).inserts;
    expect((ins["dialogue_versions"] ?? []).length).toBe(Object.keys(s.dialogueVersions).length);
    const back = stateFromRows({ ...fixture.rows, ...ins, project: fixture.project } as never);
    expect(back.dialogueVersions[vA]).toEqual(s.dialogueVersions[vA]);
    expect(back.audioClips[clipId]!.activeVersionId).toBe(vA);
    expect(dialogueMirrorViolations(back)).toEqual([]);
  });

  it("sikkerhetskopien tar med dialogue_versions, men aldri personlige bokmerker", () => {
    expect(BACKUP_STATE_TABLES).toContain("dialogue_versions");
    expect(BACKUP_STATE_TABLES as readonly string[]).not.toContain("user_bookmarks");
  });
});
