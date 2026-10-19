import { describe, expect, it } from "vitest";
import { applyCommand, dialogueCharacterSuggestions, suggestedDialogueCharacter, characterDialogueCoverage, languageTagError, scriptLanguageOf, speechLanguageOf, unicodeTextParts, unicodeSentences, batchTimeEstimate, diffStates, stateFromRows, dialogueMirrorViolations, type Command } from "@/core";
import { envelope } from "../helpers/fixtures";
import { dvBase, dvId } from "../helpers/dialogue-fixture";

import { generatedCommand } from "../helpers/generated-dialogue";

function apply(s: ReturnType<typeof dvBase>["s"], c: Command) { const r = applyCommand(s, envelope(c)); if (!r.ok) throw new Error(`${c.type}: ${r.error.message} ${JSON.stringify(r.error.details)}`); return r; }
const strip = (rows: Record<string, { revision: number }>) => Object.fromEntries(Object.entries(rows).map(([k,{revision: _r,...v}]) => [k,v]));
describe("DV5 permanent identity and lossless batch", () => {
  it("deduplicates character suggestions per line and asset, preserving all clip identities", () => {
    const { s, clipId } = dvBase(); const clip = s.audioClips[clipId]; if (!clip) throw new Error("clip");
    const duplicate = { ...clip, id: dvId(99) as typeof clip.id };
    const rows = dialogueCharacterSuggestions({ ...s, audioClips: { ...s.audioClips, [duplicate.id]: duplicate } }, clip.occurrenceId).filter(g => g.clip.blockId === clip.blockId);
    expect(rows).toHaveLength(1); expect(rows[0]?.clipIds).toContain(clip.id); expect(rows[0]?.clipIds).toContain(duplicate.id);
    expect(rows[0]?.clipIds).toHaveLength(Object.values(s.audioClips).filter(c=>!c.removed&&c.occurrenceId===clip.occurrenceId&&c.blockId===clip.blockId&&!c.characterAssetId).length+1);
  });
  it("coverage has one row per permanent scene/line in this project", () => {
    const {s,clipId}=dvBase(); const c=generatedCommand(s,clipId); const rows=characterDialogueCoverage(s,c.characterId).flatMap(scene=>scene.lines);
    expect(rows.some(l=>l.key===`${c.occurrenceId}:${c.blockId}`)).toBe(true);
    expect(new Set(rows.map(l=>l.key)).size).toBe(rows.length);
  });
  it("new success activates a separate version without changing old edits or placement; undo and redo are exact", () => {
    const {s,clipId}=dvBase(); const c=generatedCommand(s,clipId); const r=apply(s,c);
    expect(r.state.audioClips[clipId]?.activeVersionId).toBe(c.dialogueVersionId);
    expect(r.state.audioClips[clipId]?.offsetMs).toBe(s.audioClips[clipId]?.offsetMs);
    for(const [id,v] of Object.entries(s.dialogueVersions)) expect(r.state.dialogueVersions[id]).toEqual(v);
    expect(dialogueMirrorViolations(r.state)).toEqual([]);
    const undo=apply(r.state,r.inverse); expect(strip(undo.state.dialogueVersions)).toEqual(strip(s.dialogueVersions));
    const redo=apply(undo.state,undo.inverse); expect(strip(redo.state.dialogueVersions)).toEqual(strip(r.state.dialogueVersions));
  });
  it("a repeated receipt does not create another version",()=>{
    const {s,clipId}=dvBase();const c=generatedCommand(s,clipId);const r=apply(s,c);const repeated=apply(r.state,c);
    expect(repeated.state).toBe(r.state);expect(repeated.affected).toEqual([]);
  });
  it("replaying a receipt after undo never reactivates the undone version",()=>{
    const {s,clipId}=dvBase();const c=generatedCommand(s,clipId);const r=apply(s,c);const undo=apply(r.state,r.inverse);const replay=apply(undo.state,c);
    expect(replay.state).toBe(undo.state);expect(replay.state.audioClips[clipId]?.activeVersionId).toBe(s.audioClips[clipId]?.activeVersionId);
  });
  it("changed script rejects activation and preserves the previous active version",()=>{
    const {s,clipId}=dvBase();const c=generatedCommand(s,clipId);const changed={...s,blocks:{...s.blocks,[c.blockId]:{...s.blocks[c.blockId],currentRev:99}}} as typeof s;
    const r=applyCommand(changed,envelope(c));expect(r.ok).toBe(false);expect(changed.audioClips[clipId]?.activeVersionId).toBe(s.audioClips[clipId]?.activeVersionId);
  });
  it("a missing 2D scene and missing clip are created once, without images",()=>{
    const {s,clipId}=dvBase();const c=generatedCommand(s,clipId);const occurrence=s.occurrences[c.occurrenceId];if(!occurrence)throw new Error("occ");
    const audioClips=Object.fromEntries(Object.entries(s.audioClips).filter(([,clip])=>clip.occurrenceId!==c.occurrenceId||clip.blockId!==c.blockId));
    const compositions=Object.fromEntries(Object.entries(s.compositions).filter(([,comp])=>comp.variantId!==occurrence.variantId));
    const layers=Object.fromEntries(Object.entries(s.layers).filter(([,l])=>!!compositions[l.compositionId]));
    const missing={...s,compositions,layers,audioClips,dialogueVersions:Object.fromEntries(Object.entries(s.dialogueVersions).filter(([,v])=>!!audioClips[v.clipId]))};
    const r=apply(missing,c);expect(Object.values(r.state.compositions).filter(comp=>!comp.removed&&comp.variantId===occurrence.variantId)).toHaveLength(1);
    expect(r.state.audioClips[c.clipId]?.placementEstimated).toBe(true);expect(r.state.layers).toEqual(missing.layers);
    expect(apply(r.state,c).state).toBe(r.state);
  });
});
describe("DV6 independent BCP-47 preferences",()=>{
  it.each(["es-MX","zh-Hant-TW","sr-Latn-RS","ar","hi","th","ja","en-US-u-ca-gregory"])("accepts %s without an allowlist", tag=>expect(languageTagError(tag)).toBeNull());
  it.each(["","not_a_language","en--US","<script>"])("rejects %s", tag=>expect(languageTagError(tag)).not.toBeNull());
  it("project, variant and block language have ordered priority and reversible changes",()=>{
    const {s,clipId}=dvBase();const c=generatedCommand(s,clipId);const b=s.blocks[c.blockId];if(!b)throw new Error("block");
    const p=apply(s,{type:"SetDialogueLanguage",target:"project",targetId:s.project.id,language:"en-US"});expect(scriptLanguageOf(p.state,c.blockId)).toBe("en-US");
    const v=apply(p.state,{type:"SetDialogueLanguage",target:"variant",targetId:b.variantId,language:"zh-Hant"});expect(scriptLanguageOf(v.state,c.blockId)).toBe("zh-Hant");
    const line=apply(v.state,{type:"SetDialogueLanguage",target:"block",targetId:c.blockId,language:"ar"});expect(scriptLanguageOf(line.state,c.blockId)).toBe("ar");
    expect(apply(line.state,line.inverse).state.blocks[c.blockId]?.scriptLanguage??null).toBeNull();
    expect(line.state.dialogueVersions).toEqual(s.dialogueVersions);
  });
  it("speech overrides never change script or old audio",()=>{
    const {s,clipId}=dvBase();const c=generatedCommand(s,clipId);const r=apply(s,{type:"SetDialogueLanguage",target:"clip",targetId:clipId,language:"es-MX"});
    expect(speechLanguageOf(r.state,c.occurrenceId,c.blockId,c.characterId)).toBe("es-MX");expect(speechLanguageOf(r.state,c.occurrenceId,c.blockId,c.characterId,"ja")).toBe("ja");
    expect(scriptLanguageOf(r.state,c.blockId)).toBe("nb");expect(r.state.dialogueVersions).toEqual(s.dialogueVersions);
  });
  it("compares Unicode words with accents and without spaces",()=>{
    expect(unicodeTextParts("Cafe\u0301 déjà vu!","fr")).toEqual(unicodeTextParts("Café déjà vu.","fr"));
    expect(unicodeTextParts("你好世界。","zh").length).toBeGreaterThan(1);
    expect(unicodeTextParts("مرحبا بالعالم","ar")).toEqual(["مرحبا","بالعالم"]);
    expect(unicodeSentences("你好。再见！","zh")).toEqual(["你好。","再见！"]);
  });
  it("provides a bounded uncertain processing estimate",()=>{ expect(batchTimeEstimate([{text:"x".repeat(250)}])).toEqual({minSeconds:3,maxSeconds:30,uncertain:true}); });
});