/** DV7 (A1–A12, R5–R6) og DV8 (B1–B4, H1–H14): avvik, gjennomgang, huskelapper og bokmerker. */
import { describe, expect, it } from "vitest";
import {
  applyCommand, lineDrift, clipDrift, driftLines, driftDiff, unicodeWordDiff, characterDialogueCoverage,
  noteFlagOverview, noteFlagLocation, flagsFor, bookmarkHref, bookmarkViewOf, normalizeLanguageTag, languageLabel,
  speechLanguageOf, batchTimeEstimate, diffStates, stateFromRows, type Command, type ProjectState,
} from "@/core";
import { envelope } from "../helpers/fixtures";
import { dvBase, dvId } from "../helpers/dialogue-fixture";
import { generatedCommand } from "../helpers/generated-dialogue";
import { fixture } from "../visual/fixture-state";

function apply(s: ProjectState, c: Command, actor?: string) {
  const env = envelope(c);
  const r = applyCommand(s, actor ? { ...env, actor: actor as never } : env);
  if (!r.ok) throw new Error(`${c.type}: ${r.error.message}`);
  return r;
}
function setup() {
  const { s, clipId } = dvBase();
  const g = generatedCommand(s, clipId);
  const generated = apply(s, g).state;
  const clip = generated.audioClips[clipId]!;
  const production = generated.occurrences[clip.occurrenceId]!.productionId;
  const edit = (st: ProjectState, text: string) => apply(st, { type: "EditBlockText", productionId: production, blockId: clip.blockId!, text } as Command).state;
  return { s: generated, clipId, clip, blockId: clip.blockId!, occurrenceId: clip.occurrenceId, edit, g };
}

describe("DV7 drift", () => {
  it("A1/A2: a script change after generation turns the active version red", () => {
    const { s, clipId, edit, blockId, occurrenceId } = setup();
    expect(clipDrift(s, s.audioClips[clipId]!).status).toBe("ok");
    const changed = edit(s, "Helt ny replikk her.");
    expect(lineDrift(changed, occurrenceId, blockId).status).toBe("drift");
    expect(driftLines(changed).some(d => d.blockId === blockId)).toBe(true);
  });
  it("A3/A8: changed and removed passages are identified word by word", () => {
    const { s, edit, blockId, occurrenceId } = setup();
    const before = s.blocks[blockId]!.text;
    const changed = edit(s, `${before.split(" ").slice(1).join(" ")} ekstra`);
    const parts = driftDiff(changed, lineDrift(changed, occurrenceId, blockId))!;
    expect(parts.some(p => p.kind === "added" && p.text.includes("ekstra"))).toBe(true);
    expect(parts.some(p => p.kind === "removed" && p.text.trim() === before.split(" ")[0])).toBe(true);
  });
  it("Unicode: diff works for scripts without spaces and combining accents", () => {
    const parts = unicodeWordDiff("今日は良い天気です", "今日は悪い天気です", "ja");
    expect(parts.some(p => p.kind === "added")).toBe(true);
    expect(parts.some(p => p.kind === "same" && p.text.includes("天気"))).toBe(true);
    expect(unicodeWordDiff("cafe\u0301", "café").every(p => p.kind === "same")).toBe(true);
  });
  it("A9/A10/A11: explicit review clears red, keeps history, and a new edit makes it red again", () => {
    const { s, clipId, edit, blockId, occurrenceId } = setup();
    const changed = edit(s, "Endret en gang.");
    const reviewed = apply(changed, { type: "ReviewDialogueDrift", reviewId: dvId(500), clipId });
    expect(lineDrift(reviewed.state, occurrenceId, blockId).status).toBe("reviewed");
    const again = edit(reviewed.state, "Endret to ganger.");
    expect(lineDrift(again, occurrenceId, blockId).status).toBe("drift");
    expect(again.dialogueReviews[dvId(500)]).toBeDefined();
    // Angring fjerner bare den gjennomgangen den opprettet
    const undo = apply(reviewed.state, reviewed.inverse);
    expect(lineDrift(undo.state, occurrenceId, blockId).status).toBe("drift");
  });
  it("A9: review is refused without drift", () => {
    const { s, clipId } = setup();
    const r = applyCommand(s, envelope({ type: "ReviewDialogueDrift", reviewId: dvId(501), clipId }));
    expect(r.ok).toBe(false);
  });
  it("A12: choosing an older version again can bring drift back", () => {
    const { s, clipId, edit, blockId, occurrenceId } = setup();
    const firstVersion = s.audioClips[clipId]!.activeVersionId!;
    const changed = edit(s, "Ny tekst for versjon to.");
    const g2 = { ...generatedCommand(changed, clipId, 200), metadata: { ...generatedCommand(changed, clipId, 200).metadata, scriptRevision: changed.blocks[blockId]!.currentRev } };
    const second = apply(changed, g2).state;
    expect(lineDrift(second, occurrenceId, blockId).status).toBe("ok");
    const back = apply(second, { type: "SetActiveDialogueVersion", clipId, dialogueVersionId: firstVersion } as Command).state;
    expect(lineDrift(back, occurrenceId, blockId).status).toBe("drift");
  });
  it("R6: generated speech records a generated review at the correct revision; undo and redo are exact", () => {
    const { s: base, clipId } = dvBase();
    const g = { ...generatedCommand(base, clipId), reviewId: dvId(600) };
    const r = apply(base, g);
    const review = r.state.dialogueReviews[dvId(600)]!;
    expect(review.basis).toBe("generated");
    expect(review.blockRevision).toBe(base.blocks[g.blockId]!.currentRev);
    expect(review.dialogueVersionId).toBe(g.dialogueVersionId);
    const undo = apply(r.state, r.inverse);
    expect(undo.state.dialogueReviews[dvId(600)]).toBeUndefined();
    const redo = apply(undo.state, undo.inverse);
    expect(redo.state.dialogueReviews[dvId(600)]?.basis).toBe("generated");
  });
  it("R5: generating red lines keeps every older version", () => {
    const { s, clipId, edit, blockId } = setup();
    const changed = edit(s, "Rød tekst.");
    const g2 = { ...generatedCommand(changed, clipId, 300), metadata: { ...generatedCommand(changed, clipId, 300).metadata, scriptRevision: changed.blocks[blockId]!.currentRev } };
    const after = apply(changed, g2).state;
    for (const [id, v] of Object.entries(changed.dialogueVersions)) expect(after.dialogueVersions[id]?.assetVersionId).toBe(v.assetVersionId);
  });
  it("reviews round-trip through rows", () => {
    const { s, clipId, edit } = setup();
    const r = apply(edit(s, "Rundtur."), { type: "ReviewDialogueDrift", reviewId: dvId(502), clipId });
    const rows = diffStates(s, r.state).inserts as Record<string, Record<string, unknown>[]>;
    expect(rows["dialogue_reviews"]?.[0]?.["basis"]).toBe("manual");
  });
});

describe("DV5/DV6 rests", () => {
  it("languages use consistent BCP-47 tags and readable names", () => {
    expect(normalizeLanguageTag("no")).toBe("nb");
    expect(normalizeLanguageTag("EN-us")).toBe("en-US");
    expect(languageLabel("nb", "nb")).toMatch(/bokmål.*\(nb\)/);
    // ML2c: engelsk flate (en-GB, også testspråket) viser engelske språknavn
    expect(languageLabel("nb", "en-GB")).toMatch(/Bokmål.*\(nb\)/);
    const { s, clipId } = dvBase(); const clip = s.audioClips[clipId]!;
    expect(speechLanguageOf(s, clip.occurrenceId, clip.blockId!, null)).not.toBe("no");
  });
  it("coverage keeps the same line in two productions apart and names the production", () => {
    const { s, clipId } = dvBase(); const c = generatedCommand(s, clipId);
    const scenes = characterDialogueCoverage(s, c.characterId);
    expect(scenes.every(x => typeof x.productionName === "string" && x.productionId)).toBe(true);
    expect(new Set(scenes.map(x => x.occurrenceId)).size).toBe(scenes.length);
  });
  it("there is one time estimate, marked uncertain", () => {
    expect(batchTimeEstimate([{ text: "Hei" }])?.uncertain).toBe(true);
    expect(batchTimeEstimate([])).toBeNull();
  });
});

describe("DV8 note flags", () => {
  const actorA = "00000000-0000-7000-8000-0000000000a1";
  const actorB = "00000000-0000-7000-8000-0000000000b2";
  it("H1/H3/H4/H5/H8: flag on audio, optional text, on/off keeps text, creator and time recorded", () => {
    const { s, clipId } = setup();
    const versionId = s.audioClips[clipId]!.activeVersionId!;
    const add = apply(s, { type: "AddNoteFlag", flagId: dvId(700), targetKind: "dialogue_version", targetId: versionId, text: "" }, actorA);
    const flag = add.state.noteFlags[dvId(700)]!;
    expect(flag.enabled).toBe(true); expect(flag.text).toBe(""); expect(flag.createdBy).toBe(actorA); expect(flag.createdAt).toBeTruthy();
    const text = apply(add.state, { type: "UpdateNoteFlag", flagId: dvId(700), text: "Pust for tidlig" }, actorB);
    expect(text.state.noteFlags[dvId(700)]?.editedBy).toBe(actorB);
    const off = apply(text.state, { type: "UpdateNoteFlag", flagId: dvId(700), enabled: false });
    expect(off.state.noteFlags[dvId(700)]?.text).toBe("Pust for tidlig");
    expect(off.state.noteFlags[dvId(700)]?.enabled).toBe(false);
    expect(apply(off.state, off.inverse).state.noteFlags[dvId(700)]?.enabled).toBe(true);
    expect(flagsFor(off.state, "dialogue_version", versionId)).toHaveLength(1);
  });
  it("H2: flags on image, image variant and scene; unknown targets are refused", () => {
    const { s, occurrenceId } = setup();
    const version = Object.values(s.assetVersions)[0]!;
    let st = apply(s, { type: "AddNoteFlag", flagId: dvId(701), targetKind: "asset_version", targetId: version.id, text: "Bilde" }).state;
    st = apply(st, { type: "AddNoteFlag", flagId: dvId(702), targetKind: "asset_variant", targetId: version.variantId, text: "Variant" }).state;
    st = apply(st, { type: "AddNoteFlag", flagId: dvId(703), targetKind: "occurrence", targetId: occurrenceId, text: "Scene" }).state;
    expect(Object.keys(st.noteFlags)).toHaveLength(3);
    expect(applyCommand(st, envelope({ type: "AddNoteFlag", flagId: dvId(704), targetKind: "occurrence", targetId: dvId(999), text: "" })).ok).toBe(false);
  });
  it("deletion is a separate action that is undoable; undo of creation removes the row", () => {
    const { s, occurrenceId } = setup();
    const add = apply(s, { type: "AddNoteFlag", flagId: dvId(705), targetKind: "occurrence", targetId: occurrenceId, text: "x" });
    const del = apply(add.state, { type: "SetNoteFlagRemoved", flagId: dvId(705), removed: true });
    expect(flagsFor(del.state, "occurrence", occurrenceId)).toHaveLength(0);
    expect(del.state.noteFlags[dvId(705)]?.text).toBe("x");
    expect(apply(del.state, del.inverse).state.noteFlags[dvId(705)]?.removed).toBe(false);
    expect(apply(add.state, add.inverse).state.noteFlags[dvId(705)]).toBeUndefined();
  });
  it("H9–H13: overview sorts, filters and follows the item's current place", () => {
    const { s, clipId, occurrenceId } = setup();
    let st = apply(s, { type: "AddNoteFlag", flagId: dvId(710), targetKind: "audio_clip", targetId: clipId, text: "a" }, actorA).state;
    st = apply(st, { type: "AddNoteFlag", flagId: dvId(711), targetKind: "occurrence", targetId: occurrenceId, text: "b" }, actorB).state;
    st = apply(st, { type: "UpdateNoteFlag", flagId: dvId(711), enabled: false }).state;
    expect(noteFlagOverview(st, "date", { creator: actorA }).map(f => f.id)).toEqual([dvId(710)]);
    expect(noteFlagOverview(st, "scene", { active: false }).map(f => f.id)).toEqual([dvId(711)]);
    expect(noteFlagOverview(st, "script", { kind: "audio_clip" }).map(f => f.id)).toEqual([dvId(710)]);
    const moved = { ...st, audioClips: { ...st.audioClips, [clipId]: { ...st.audioClips[clipId]!, offsetMs: 9999 } } };
    const loc = noteFlagLocation(moved, moved.noteFlags[dvId(710)]!);
    expect(loc.kind === "scene" && loc.offsetMs).toBe(9999);
  });
  it("flags round-trip through rows", () => {
    const { s, occurrenceId } = setup();
    const st = apply(s, { type: "AddNoteFlag", flagId: dvId(712), targetKind: "occurrence", targetId: occurrenceId, text: "rad" }).state;
    const rows = diffStates(s, st).inserts as Record<string, Record<string, unknown>[]>;
    const row = rows["note_flags"]![0]!;
    expect(row["target_kind"]).toBe("occurrence");
    const back = stateFromRows({ ...(fixture.rows as never as Record<string, unknown>), project: fixture.project, note_flags: [{ ...row, created_by: "u" }] } as never);
    expect(back.noteFlags[dvId(712)]?.text).toBe("rad");
  });
});

describe("DV8 bookmarks", () => {
  const p = "00000000-0000-7000-8000-000000000001";
  const o = "00000000-0000-7000-8000-000000000002";
  it("B1/B2: scene, time and view become an address; invalid targets do not navigate", () => {
    expect(bookmarkHref(p, { view: "scene", occurrenceId: o, frame: 48, tab: "animation" })).toBe(`/prosjekt/${p}/scene?scene=${o}&at=48&fane=animation`);
    expect(bookmarkHref(p, { view: "manus", occurrenceId: o })).toBe(`/prosjekt/${p}/manus?scene=${o}`);
    expect(bookmarkHref(p, { view: "oversikt" })).toBe(`/prosjekt/${p}`);
    expect(bookmarkHref(p, { view: "https://evil.example" })).toBeNull();
    expect(bookmarkHref(p, { view: "scene", occurrenceId: "../x", frame: -1 })).toBe(`/prosjekt/${p}/scene`);
  });
  it("view is derived from the address", () => {
    expect(bookmarkViewOf(`/prosjekt/${p}/scene`, p)).toBe("scene");
    expect(bookmarkViewOf(`/prosjekt/${p}`, p)).toBe("oversikt");
    expect(bookmarkViewOf(`/konto`, p)).toBeNull();
  });
});
