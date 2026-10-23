/** Kildespråket er manusets språk, aldri fast norsk (ML3, KILDESPRAK_REPORT.md). */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  applyCommand,
  blocksOfVariant,
  isSourceLanguage,
  languageVersionError,
  lineLinkError,
  scriptLanguageOf,
  sourceLanguageOf,
  translatedState,
  setLanguage,
  type Command,
  type LineLinkFields,
  type ProjectState,
} from "@/core";
import { LanguageVersionsDialog } from "@/app/script/LanguageVersionsDialog";
import { scriptLanguageChoices } from "@/app/script/ScriptLanguageSelect";
import { envelope, seedProject, tid } from "../helpers/fixtures";

function apply(s: ProjectState, c: Command): ProjectState {
  const r = applyCommand(s, envelope(c));
  if (!r.ok) throw new Error(`${c.type}: ${r.error.message}`);
  return r.state;
}
function englishScript(): ProjectState {
  const s = seedProject(2).state;
  return apply(s, { type: "SetDialogueLanguage", target: "project", targetId: s.project.id, language: "en" } as Command);
}
function firstDialogue(s: ProjectState) {
  const v = Object.values(s.variants)[0]!;
  return { v, b: blocksOfVariant(s, v.id).find((x) => x.kind === "dialogue")! };
}
const tr = (blockId: string, language: string, rev: number): Command => ({
  type: "AddTranslations",
  items: [{ translationId: tid(), fields: { blockId, variantId: null, language, text: "Oversatt", basedOnRev: rev, status: "approved" } }],
} as unknown as Command);

describe("kildespråk = manusets språk", () => {
  it("engelsk manus: engelsk er kilden, avvik følger engelsk", () => {
    const s = englishScript();
    const { b } = firstDialogue(s);
    expect(sourceLanguageOf(s)).toBe("en");
    expect(scriptLanguageOf(s, b.id)).toBe("en");
    expect(isSourceLanguage(s, "en")).toBe(true);
    expect(isSourceLanguage(s, "de")).toBe(false);
    // Visning på kildespråket er selve manuset
    expect(translatedState(s, "en")).toBe(s);
  });

  it("engelsk manus: engelsk kan ikke være mål, et annet språk kan", () => {
    const s = englishScript();
    const { b } = firstDialogue(s);
    expect(applyCommand(s, envelope(tr(b.id, "en", b.currentRev))).ok).toBe(false);
    expect(languageVersionError(s, { language: "en", name: "x", status: "active" })).toBe("source");
    expect(languageVersionError(s, { language: "de", name: "x", status: "active" })).toBeNull();
    const t = apply(s, tr(b.id, "de", b.currentRev));
    expect(translatedState(t, "de").blocks[b.id]!.text).toBe("Oversatt");
  });

  it("engelsk manus: linjejustering avviser kildespråket som mål", () => {
    const s = englishScript();
    const { v, b } = firstDialogue(s);
    const f: LineLinkFields = { variantId: v.id, language: "en", sourceBlockIds: [b.id], targetTranslationIds: [tid()], origin: "ai", confidence: 0.9, reason: "x" };
    expect(lineLinkError(s, f)).toBe("scope");
    expect(lineLinkError(s, { ...f, language: "de" })).not.toBe("scope");
  });

  it("engelsk manus: norsk er et vanlig målspråk", () => {
    const s = englishScript();
    expect(languageVersionError(s, { language: "nb", name: "x", status: "active" })).toBeNull();
  });

  it("norsk manus oppfører seg som før", () => {
    const s = seedProject(2).state;
    const { b } = firstDialogue(s);
    expect(sourceLanguageOf(s)).toBe("nb");
    expect(translatedState(s, "nb")).toBe(s);
    expect(applyCommand(s, envelope(tr(b.id, "nb", b.currentRev))).ok).toBe(false);
    expect(languageVersionError(s, { language: "nb", name: "x", status: "active" })).toBe("source");
    const t = apply(s, tr(b.id, "en", b.currentRev));
    expect(translatedState(t, "en").blocks[b.id]!.text).toBe("Oversatt");
  });

  it("velgeren og dialogen viser manusets faktiske språk", () => {
    setLanguage("en");
    const s = englishScript();
    const choices = scriptLanguageChoices(s, true);
    expect(choices[0]!.label).toContain("English");
    expect(choices.filter((c) => c.language === "en")).toHaveLength(0);
    render(<LanguageVersionsDialog open onOpenChange={() => {}} state={s} productionId={Object.keys(s.productions)[0]!} cmds={{ run: () => null } as never} editable />);
    expect(screen.getByText(/The script language \(English \(en\)\) is always the source/)).toBeTruthy();
    expect(screen.queryByText(/Norwegian is always the source/)).toBeNull();
  });
});
