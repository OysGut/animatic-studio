/**
 * G-1b punkt 7: brukerflyt med faste svar (jsdom, ingen nettverk). Et japansk manus får norsk og engelsk
 * som vanlige språkversjoner via dialogen, og en plakat kan lages på norsk – med kildespråket først i valget.
 */
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { applyCommand, setLanguage, sourceLanguageOf, type Command, type ProjectState } from "@/core";
import { LanguageVersionsDialog } from "@/app/script/LanguageVersionsDialog";
import { PosterLanguageSelect } from "@/app/release/PosterLanguageSelect";
import { envelope, seedProject } from "../helpers/fixtures";

function japaneseProject(): ProjectState {
  const s = seedProject(2).state;
  const r = applyCommand(s, envelope({ type: "SetDialogueLanguage", target: "project", targetId: s.project.id, language: "ja" } as Command));
  if (!r.ok) throw new Error(r.error.message);
  return r.state;
}

let latest: ProjectState;
function Live({ initial }: { initial: ProjectState }) {
  const [state, setState] = useState(initial);
  latest = state;
  const run = (cmd: Command) => {
    const r = applyCommand(state, envelope(cmd));
    if (!r.ok) return r.error.message;
    setState(r.state);
    return null;
  };
  return <LanguageVersionsDialog open onOpenChange={() => {}} state={state} productionId={Object.keys(state.productions)[0]!} cmds={{ run } as never} editable />;
}

function addVersion(tag: string) {
  fireEvent.change(screen.getByTestId("language-version-new-language"), { target: { value: tag } });
  fireEvent.click(screen.getByTestId("language-version-add"));
}

describe("G-1b brukerflyt: japansk manus med norsk og engelsk mål", () => {
  it("legger til norsk og engelsk som vanlige språkversjoner; japansk kan ikke bli mål", () => {
    setLanguage("nb");
    render(<Live initial={japaneseProject()} />);
    expect(screen.getByTestId("source-language-current").textContent).toContain("(ja)");
    addVersion("nb");
    addVersion("en");
    expect(screen.getByTestId("language-version-nb")).toBeTruthy();
    expect(screen.getByTestId("language-version-en")).toBeTruthy();
    expect(Object.values(latest.languageVersions).map((v) => v.language).sort()).toEqual(["en", "nb"]);
    expect(sourceLanguageOf(latest)).toBe("ja");
    // Kildespråket som mål avvises med melding
    addVersion("ja");
    expect(screen.getByTestId("language-version-error")).toBeTruthy();
    expect(Object.values(latest.languageVersions).some((v) => v.language === "ja")).toBe(false);
  });

  it("plakatens språkvalg viser kildespråket først og språkversjonene, og velger norsk", () => {
    setLanguage("en");
    let s = japaneseProject();
    for (const language of ["nb", "en"]) {
      const r = applyCommand(s, envelope({ type: "AddLanguageVersion", versionId: crypto.randomUUID(), language, name: language } as unknown as Command));
      if (!r.ok) throw new Error(r.error.message);
      s = r.state;
    }
    let chosen = "";
    render(<PosterLanguageSelect state={s} value="ja" onChange={(l) => (chosen = l)} testId="pl" />);
    const options = [...(screen.getByTestId("pl") as HTMLSelectElement).options].map((o) => o.value);
    expect(options[0]).toBe("ja");
    expect(options).toEqual(expect.arrayContaining(["nb", "en"]));
    fireEvent.change(screen.getByTestId("pl"), { target: { value: "nb" } });
    expect(chosen).toBe("nb");
  });
});
