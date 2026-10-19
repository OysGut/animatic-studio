/**
 * DV2 – absolutt krav (DIALOGUE_VOICE_SPEC §36, §120, §139): ingen lydversjon eller redigering går tapt.
 * Egenskapstest: tilfeldige, seedede sekvenser av opptak, generering, bytte, redigering, flytting, sletting av
 * versjon og angring. Etter hvert steg:
 *   - ingen versjon forsvinner (bare angring av opprettelsen fjerner den),
 *   - bare versjonene kommandoen selv oppgir som berørt, endres,
 *   - klippets speiling stemmer med aktiv versjon,
 *   - angring gir nøyaktig samme versjoner og redigering som før kommandoen.
 */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  audioClipFieldsOf,
  dialogueMirrorViolations,
  versionsOfClip,
  type Command,
  type DialogueEdit,
  type ProjectState,
} from "@/core";
import { mulberry32 } from "@/core/animation/patterns";
import { envelope } from "../helpers/fixtures";
import { dvBase, dvId } from "../helpers/dialogue-fixture";
import { generatedCommand } from "../helpers/generated-dialogue";

type Versions = ProjectState["dialogueVersions"];
const strip = (v: Versions) =>
  Object.fromEntries(Object.entries(v).map(([k, { revision: _r, ...rest }]) => [k, rest]));

function randomEdit(r: () => number): DialogueEdit {
  const len = 200 + Math.floor(r() * 4000);
  return {
    sourceInMs: Math.floor(r() * 1500),
    lengthMs: len,
    gainDb: Math.round((r() * 20 - 14) * 10) / 10,
    fadeInMs: Math.floor(r() * 300),
    fadeOutMs: Math.floor(r() * 300),
    volumeKeys: r() < 0.5 ? [] : [{ t: 0, db: 0 }, { t: Math.floor(len / 2), db: -Math.floor(r() * 20) }],
    speed: [0.5, 0.75, 1, 1.25, 2][Math.floor(r() * 5)]!,
    compositionId: null,
  };
}

function runSequence(seed: number, steps: number) {
  const r = mulberry32(seed);
  const { s: s0, clipId, takes } = dvBase();
  let s = s0;
  let next = 100;
  const stack: { before: Versions; inverse: Command }[] = [];
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  for (let i = 0; i < steps; i++) {
    const clip = s.audioClips[clipId]!;
    const versions = versionsOfClip(s, clipId);
    const roll = r();
    let command: Command | null = null;
    let undo = false;
    if (roll < 0.2 && stack.length) undo = true;
    else if (roll < 0.35)
      command = { type: "UpdateAudioClips", clips: [{ clipId: clipId as never, fields: { ...audioClipFieldsOf(clip), versionId: pick(takes) as never } }] };
    else if (roll < 0.5) {
      const e = randomEdit(r);
      command = { type: "UpdateAudioClips", clips: [{ clipId: clipId as never, fields: { ...audioClipFieldsOf(clip), ...e, speed: e.speed } }] };
    } else if (roll < 0.65)
      command = { type: "UpdateDialogueVersionEdit", dialogueVersionId: pick(versions).id, edit: randomEdit(r) };
    else if (roll < 0.75) {
      const source = pick(["record", "ai", "upload"] as const);
      command = {
        type: "AddDialogueVersion",
        dialogueVersionId: dvId(next++),
        clipId: clipId as never,
        fields: { assetId: clip.assetId, assetVariantId: dvId(1), assetVersionId: pick(takes), ...randomEdit(r), source, provider: source === "ai" ? "elevenlabs" : null, voiceId: source === "ai" ? "mock_voice" : null, modelId: source === "ai" ? "eleven_v3" : null, settings: source === "ai" ? { stability: 0.5, language: "no" } : {}, scriptRevision: 3, parentVersionId: clip.activeVersionId ?? null },
        activate: r() < 0.6,
      };
    } else if (roll < 0.85) {
      const other = versions.filter((v) => v.id !== clip.activeVersionId);
      if (other.length) command = { type: "SetActiveDialogueVersion", clipId: clipId as never, dialogueVersionId: pick(other).id };
    } else if (roll < 0.93) command = { type: "MoveDialogueLine", clipId: clipId as never, offsetMs: Math.floor(r() * 30_000) + 1, allowOverlap: true };
    else {
      const other = versions.filter((v) => v.id !== clip.activeVersionId);
      if (other.length) command = { type: "SetDialogueVersionRemoved", dialogueVersionId: pick(other).id, removed: true };
    }
    if (undo) {
      const { before, inverse } = stack.pop()!;
      const res = applyCommand(s, envelope(inverse));
      if (!res.ok) throw new Error(`seed ${seed} steg ${i}: angring avvist: ${res.error.message}`);
      s = res.state;
      expect(strip(s.dialogueVersions), `seed ${seed} steg ${i}: angring ga ikke samme versjoner`).toEqual(strip(before));
    } else if (command) {
      const before = s.dialogueVersions;
      const res = applyCommand(s, envelope(command));
      if (!res.ok) continue; // ugyldige tilfeldige steg (f.eks. «ingen endring») hoppes over
      for (const id of Object.keys(before))
        expect(res.state.dialogueVersions[id], `seed ${seed} steg ${i}: ${command.type} fjernet versjon ${id}`).toBeDefined();
      for (const [id, v] of Object.entries(res.state.dialogueVersions)) {
        const old = before[id];
        if (old && !old.removed && v.removed)
          expect(command.type, "only confirmed deletion changes removed").toBe("SetDialogueVersionRemoved");
        if (old && JSON.stringify(strip({ x: old })) !== JSON.stringify(strip({ x: v })))
          expect(res.affected, `seed ${seed} steg ${i}: ${command.type} endret versjon ${id} uten å oppgi den`).toContain(id);
      }
      s = res.state;
      stack.push({ before, inverse: res.inverse });
    }
    expect(dialogueMirrorViolations(s), `seed ${seed} steg ${i}`).toEqual([]);
  }
  // Alt angres: tilbake til nøyaktig utgangspunktet
  while (stack.length) {
    const { before, inverse } = stack.pop()!;
    const res = applyCommand(s, envelope(inverse));
    if (!res.ok) throw new Error(`seed ${seed}: full angring avvist: ${res.error.message}`);
    s = res.state;
    expect(strip(s.dialogueVersions)).toEqual(strip(before));
  }
  expect(strip(s.dialogueVersions)).toEqual(strip(s0.dialogueVersions));
  expect(s.audioClips[clipId]!.activeVersionId).toBe(s0.audioClips[clipId]!.activeVersionId);
}

describe("DV2 tapsfrihet (egenskapstest)", () => {
  for (const seed of [1, 7, 42, 1337, 2026, 90210, 314159, 271828])
    it(`seed ${seed}: 120 tilfeldige steg uten tap av lydversjon eller redigering`, () => runSequence(seed, 120));
});

describe("DV5 batch, delvis feil og gjenopptak uten tap", () => {
  for (const seed of [1, 42, 2026, 90210]) it(`seed ${seed}: 30 batchresultater med feil og gjentatte kvitteringer`, () => {
    const { s: initial, clipId } = dvBase();
    let state = initial;
    const random = mulberry32(seed);
    const undoStack: Command[] = [];
    for (let i=0;i<30;i++) {
      const command=generatedCommand(state,clipId,1000+i*10);
      const before=state;
      const failed=random()<0.3;
      const attempt=applyCommand(state,envelope(failed?{...command,metadata:{...command.metadata,scriptRevision:9999}}:command));
      if(failed) { expect(attempt.ok).toBe(false);expect(state.dialogueVersions).toBe(before.dialogueVersions); }
      const success=failed?applyCommand(state,envelope(command)):attempt;
      if(!success.ok)throw new Error(success.error.message);
      state=success.state;undoStack.push(success.inverse);
      for(const [id,v] of Object.entries(before.dialogueVersions))expect(state.dialogueVersions[id]).toEqual(v);
      const resumed=applyCommand(state,envelope(command));if(!resumed.ok)throw new Error(resumed.error.message);
      expect(resumed.state).toBe(state);expect(dialogueMirrorViolations(state)).toEqual([]);
    }
    for(const inverse of undoStack.reverse()) { const undo=applyCommand(state,envelope(inverse));if(!undo.ok)throw new Error(undo.error.message);state=undo.state; }
    expect(strip(state.dialogueVersions)).toEqual(strip(initial.dialogueVersions));
    expect(state.audioClips[clipId]?.activeVersionId).toBe(initial.audioClips[clipId]?.activeVersionId);
  });
});
