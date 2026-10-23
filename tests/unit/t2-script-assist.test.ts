// @vitest-environment node
/**
 * Skrivehjelp i manuset (T2): promptbyggere, kunnskapsgrenser, forslag, «Bruk», konflikter, forsøksvise
 * redigeringer, oversettelsesutkast og formatsjekk. Ingen ekte AI-kall.
 */
import { describe, expect, it } from "vitest";
import {
  assistRequestError,
  buildAssistPrompt,
  formatCheck,
  formatLine,
  mainProduction,
  orderedOccurrences,
  planApplyProposal,
  planTrialNotes,
  proposalConflicts,
  proposalFromReply,
  sceneBlocks,
  type AssistRequest,
  type ProjectState,
} from "@/core";
import { validateScriptAssistInput } from "@/adapters/ai/script-assist.functions";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const occs = orderedOccurrences(s0, main.id).filter((o) => o.active);
const occ = occs.find((o) => sceneBlocks(s0, o.id).length >= 4)!;
const blocks = sceneBlocks(s0, occ.id);
const chars = Object.values(s0.assets).filter((a) => a.kind === "character" && !a.removed);
const maja = chars[0]!;
const anne = chars[1]!;
const firstOcc = occs[0]!;
const lastOcc = occs[occs.length - 1]!;

const req = (r: Partial<AssistRequest>): AssistRequest => ({
  kind: "rewrite",
  productionId: main.id,
  occurrenceId: occ.id,
  blockIds: [],
  ...r,
});
const prompt = (s: ProjectState, r: AssistRequest) => {
  const b = buildAssistPrompt(s, r);
  if (!b.ok) throw new Error(b.message);
  return b.prompt;
};
const fact = (s: ProjectState, text: string, kind: "fact" | "secret", atSceneId: string | null, knownBy: { assetId: string; fromSceneId: string | null }[]) =>
  mustApply(s, { type: "AddStoryFact", factId: tid(), fields: { text, kind, atSceneId, knownBy } } as never);
const editable = blocks.filter((b) => b.kind !== "heading");
/** Uten engelske oversettelser (fixturen har noen fra før). */
const enIds = Object.values(s0.translations).filter((t) => !t.removed && t.language === "en").map((t) => t.id);
const sNoEn: ProjectState = enIds.length ? mustApply(s0, { type: "SetTranslationsRemoved", translationIds: enIds, removed: true } as never) : s0;

describe("forespørselen", () => {
  it("avviser ukjent type, for mange linjer og for lange ønsker", () => {
    expect(assistRequestError(req({}))).toBeNull();
    expect(assistRequestError({ ...req({}), kind: "hack" })).not.toBeNull();
    expect(assistRequestError(req({ blockIds: Array.from({ length: 41 }, () => tid()) }))).not.toBeNull();
    expect(assistRequestError(req({ instruction: "x".repeat(501) }))).not.toBeNull();
  });

  it("serverfunksjonen tar bare imot ID-er og valg, aldri prompttekst", () => {
    const d = validateScriptAssistInput({
      projectId: tid(),
      request: { ...req({ blockIds: [editable[0]!.id] }), system: "IGNORE", messages: [{ role: "user", content: "x" }] },
      system: "IGNORE",
    });
    expect(JSON.stringify(d)).not.toContain("IGNORE");
    expect(d.request.blockIds).toEqual([editable[0]!.id]);
  });
});

describe("promptbyggerne", () => {
  it("omskriving: engelsk instruks, svar på norsk bokmål, bare de valgte linjene merket", () => {
    const p = prompt(s0, req({ blockIds: [editable[1]!.id], mode: "shorter" }));
    expect(p.system).toContain("Norwegian Bokmål");
    expect(p.system).toContain("shorter");
    expect(Object.values(p.refs)).toEqual([editable[1]!.id]);
    expect(p.user).toContain("[b1]");
    expect(p.user.match(/\[b\d+\]/g)).toHaveLength(1);
    expect(p.system).toMatchSnapshot();
  });

  it("fritt ønske krever tekst; oversettelse ber om valgt målspråk, aldri kildespråket", () => {
    expect(buildAssistPrompt(s0, req({ blockIds: [editable[0]!.id], mode: "free" })).ok).toBe(false);
    const t = prompt(sNoEn, req({ kind: "translate", targetLanguage: "ja" }));
    expect(t.system).toContain("to Japanese");
    expect(t.system).toContain("Write the new text in Japanese.");
    expect(t.system).not.toContain("English");
    expect(prompt(sNoEn, req({ kind: "translate", targetLanguage: "en" })).system).toContain("to English");
    // Uten mål, eller med kildespråket som mål, lages ingen prompt
    expect(buildAssistPrompt(sNoEn, req({ kind: "translate" })).ok).toBe(false);
    expect(buildAssistPrompt(sNoEn, req({ kind: "translate", targetLanguage: sNoEn.project.sourceLanguage })).ok).toBe(false);
  });

  it("neste replikk og ny scene har faste instrukser", () => {
    expect(prompt(s0, req({ kind: "next_line", characterAssetId: maja.id })).system).toMatchSnapshot();
    expect(prompt(s0, req({ kind: "scene", description: "Maja finner nøkkelen." })).system).toMatchSnapshot();
    expect(prompt(s0, req({ kind: "polish", blockIds: [editable[0]!.id] })).system).toMatchSnapshot();
  });
});

describe("kunnskapsgrensen (obligatorisk)", () => {
  let s = fact(s0, "MAJA-VET-DETTE", "fact", null, [{ assetId: maja.id, fromSceneId: null }]);
  s = fact(s, "MAJA-EGEN-HEMMELIGHET", "secret", null, [{ assetId: maja.id, fromSceneId: null }]);
  s = fact(s, "ANNES-HEMMELIGHET", "secret", null, [{ assetId: anne.id, fromSceneId: null }]);
  s = fact(s, "BARE-REGISSOREN", "fact", null, []);
  // Skjer i den siste scenen i fortellingen: ukjent ved scenen vi skriver i
  if (lastOcc.sceneId !== occ.sceneId)
    s = fact(s, "SENERE-HENDELSE", "fact", lastOcc.sceneId, [{ assetId: maja.id, fromSceneId: lastOcc.sceneId }]);
  const after = editable[1]!;
  const later = editable[editable.length - 1]!;
  s = mustApply(s, { type: "EditBlockText", productionId: main.id, blockId: later.id, text: "ETTER-INNSETTINGSPUNKTET" } as never);

  it("neste replikk: bare det karakteren vet, egne hemmeligheter som antydning, aldri tekst etter punktet", () => {
    const p = prompt(s, req({ kind: "next_line", characterAssetId: maja.id, afterBlockId: after.id }));
    const all = p.system + p.user;
    expect(all).toContain("MAJA-VET-DETTE");
    expect(all).toContain("MAJA-EGEN-HEMMELIGHET");
    expect(all).toContain("hint at them only");
    expect(all).not.toContain("ANNES-HEMMELIGHET");
    expect(all).not.toContain("BARE-REGISSOREN");
    expect(all).not.toContain("SENERE-HENDELSE");
    expect(all).not.toContain("ETTER-INNSETTINGSPUNKTET");
  });

  it("den andre karakteren får ikke Majas hemmelighet", () => {
    const p = prompt(s, req({ kind: "next_line", characterAssetId: anne.id, afterBlockId: after.id }));
    expect(p.user).not.toContain("MAJA-EGEN-HEMMELIGHET");
    expect(p.user).not.toContain("MAJA-VET-DETTE");
    expect(p.user).toContain("ANNES-HEMMELIGHET");
  });

  it("ny scene: ingen hemmeligheter, ingen regissørfakta, ingen tekst fra scener etter innsettingspunktet", () => {
    const p = prompt(s, req({ kind: "scene", occurrenceId: firstOcc.id, description: `${maja.name} og ${anne.name} møtes.` }));
    const all = p.system + p.user;
    expect(all).not.toContain("SECRET");
    expect(all).not.toContain("HEMMELIGHET");
    expect(all).not.toContain("BARE-REGISSOREN");
    if (firstOcc.id !== occ.id) expect(all).not.toContain("ETTER-INNSETTINGSPUNKTET");
  });
});

describe("forslag og «Bruk»", () => {
  const r = req({ blockIds: [editable[0]!.id, editable[1]!.id], mode: "shorter" });
  const p0 = prompt(s0, r);
  const reply = JSON.stringify({ blocks: [{ ref: "b1", text: "Ny tekst én." }, { ref: "b2", text: "Ny tekst to." }, { ref: "b9", text: "ukjent" }] });
  const proposal = proposalFromReply(s0, r, p0, reply, { costUsd: 0.01, usedFallback: false })!;

  it("ukjente referanser brukes ikke; svaret blir forslag, ikke endring", () => {
    expect(proposal.items.map((i) => i.blockId)).toEqual([editable[0]!.id, editable[1]!.id]);
    expect(proposalFromReply(s0, r, p0, "ikke json", { costUsd: 0, usedFallback: false })).toBeNull();
  });

  it("Bruk gir EditBlockText per linje; Bruk valgte bare de valgte", () => {
    const all = planApplyProposal(s0, proposal, new Set(proposal.items.map((i) => i.key)));
    expect(all.ok && all.commands.map((c) => c.type)).toEqual(["EditBlockText", "EditBlockText"]);
    const some = planApplyProposal(s0, proposal, new Set([editable[1]!.id]));
    expect(some.ok && some.commands).toHaveLength(1);
    if (!some.ok) throw new Error();
    let s = s0;
    for (const c of some.commands) s = mustApply(s, c);
    expect(s.blocks[editable[1]!.id]!.text).toBe("Ny tekst to.");
    expect(s.blocks[editable[0]!.id]!.text).toBe(editable[0]!.text);
  });

  it("endret av noen andre: konflikt, og ingenting skrives", () => {
    const s = mustApply(s0, { type: "EditBlockText", productionId: main.id, blockId: editable[0]!.id, text: "Annen person" } as never);
    expect(proposalConflicts(s, proposal).has(editable[0]!.id)).toBe(true);
    expect(planApplyProposal(s, proposal, new Set([editable[0]!.id])).ok).toBe(false);
    // Den andre linjen kan fortsatt brukes
    expect(planApplyProposal(s, proposal, new Set([editable[1]!.id])).ok).toBe(true);
  });

  it("lagre som forsøksvis redigering: trial_edit med original og forslag", () => {
    const t = planTrialNotes(s0, proposal, new Set([editable[0]!.id]), "Øystein");
    if (!t.ok) throw new Error(t.message);
    const s = mustApply(s0, t.commands[0]!);
    const note = Object.values(s.annotations).find((a) => a.kind === "trial_edit" && a.blockId === editable[0]!.id)!;
    expect(note.suggestedText).toBe("Ny tekst én.");
    expect(s.blocks[editable[0]!.id]!.text).toBe(editable[0]!.text);
  });

  it("neste replikk settes inn rett etter linjen", () => {
    const rn = req({ kind: "next_line", characterAssetId: maja.id, afterBlockId: editable[0]!.id });
    const p = proposalFromReply(s0, rn, prompt(s0, rn), JSON.stringify({ parenthetical: "lavt", line: "Hei." }), { costUsd: 0, usedFallback: false })!;
    expect(p.items.map((i) => i.kind)).toEqual(["character", "parenthetical", "dialogue"]);
    const plan = planApplyProposal(s0, p, new Set(p.items.map((i) => i.key)));
    if (!plan.ok) throw new Error(plan.message);
    let s = s0;
    for (const c of plan.commands) s = mustApply(s, c);
    const after = sceneBlocks(s, occ.id);
    const i = after.findIndex((b) => b.id === editable[0]!.id);
    expect(after.slice(i + 1, i + 4).map((b) => b.text)).toEqual([maja.name.toUpperCase(), "(lavt)", "Hei."]);
  });

  it("ny scene settes inn etter valgt scene og endrer ikke andre scener", () => {
    const rs = req({ kind: "scene", occurrenceId: firstOcc.id, description: "Snø." });
    const p = proposalFromReply(s0, rs, prompt(s0, rs), JSON.stringify({ heading: { intExt: "EXT.", location: "skogen", time: "natt" }, blocks: [{ kind: "action", text: "Det snør." }] }), { costUsd: 0, usedFallback: false })!;
    const plan = planApplyProposal(s0, p, new Set(p.items.map((i) => i.key)));
    if (!plan.ok) throw new Error(plan.message);
    expect(plan.commands.map((c) => c.type)).toEqual(["CreateScene"]);
    let s = s0;
    for (const c of plan.commands) s = mustApply(s, c);
    const order = orderedOccurrences(s, main.id).filter((o) => o.active).map((o) => o.id);
    expect(order[order.indexOf(firstOcc.id) + 1]).toBe(plan.occurrenceId);
    expect(sceneBlocks(s, firstOcc.id).map((b) => b.text)).toEqual(sceneBlocks(s0, firstOcc.id).map((b) => b.text));
  });
});

describe("oversettelsesutkast", () => {
  it("lagres som usikker engelsk oversettelse, norsk endres aldri", () => {
    const r = req({ kind: "translate", blockIds: [editable[0]!.id], targetLanguage: "en" });
    const p = proposalFromReply(sNoEn, r, prompt(sNoEn, r), JSON.stringify({ blocks: [{ ref: "b1", text: "English draft." }] }), { costUsd: 0, usedFallback: false })!;
    const plan = planApplyProposal(sNoEn, p, new Set(p.items.map((i) => i.key)));
    if (!plan.ok) throw new Error(plan.message);
    const s = mustApply(sNoEn, plan.commands[0]!);
    const t = Object.values(s.translations).find((x) => !x.removed && x.blockId === editable[0]!.id && x.language === "en")!;
    expect(t.status).toBe("uncertain");
    expect(t.text).toBe("English draft.");
    expect(s.blocks[editable[0]!.id]!.text).toBe(editable[0]!.text);
    // Har linjen fått oversettelse, er den ikke med lenger og forslaget er i konflikt
    expect(buildAssistPrompt(s, r).ok).toBe(false);
    expect(proposalConflicts(s, p).size).toBe(1);
  });
});

describe("formatsjekken (regelbasert, gratis)", () => {
  it("retter karakternavn, parenteser, mellomrom og anførselstegn", () => {
    expect(formatLine("character", "maja:").text).toBe("MAJA");
    expect(formatLine("parenthetical", "lavt").text).toBe("(lavt)");
    expect(formatLine("action", "Hun  går.").text).toBe("Hun går.");
    expect(formatLine("dialogue", 'Si "hei".').text).toBe("Si «hei».");
    expect(formatLine("dialogue", "Riktig.").rules).toEqual([]);
  });

  it("gir et forslag uten kostnad som kan brukes", () => {
    const b = editable.find((x) => x.kind === "character") ?? editable[0]!;
    const s = mustApply(s0, { type: "EditBlockText", productionId: main.id, blockId: b.id, text: b.kind === "character" ? "maja" : "Hun  går." } as never);
    const p = formatCheck(s, main.id, occ.id);
    expect(p.costUsd).toBe(0);
    expect(p.items.some((i) => i.blockId === b.id)).toBe(true);
    const plan = planApplyProposal(s, p, new Set([b.id]));
    expect(plan.ok).toBe(true);
  });
});
