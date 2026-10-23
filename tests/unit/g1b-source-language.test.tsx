/**
 * G-1b punkt 1: kildevelger ved oppretting (via createProject-argumentet) og bytte av
 * kildespråk i språkversjonsdialogen – advarsel, konflikt med eksisterende mål, bekreftelse.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { applyCommand, setLanguage, type Command, type ProjectState } from "@/core";
import { LanguageVersionsDialog } from "@/app/script/LanguageVersionsDialog";
import { envelope, seedProject, tid } from "../helpers/fixtures";

function englishProject(): ProjectState {
  const s = seedProject(2).state;
  const r = applyCommand(s, envelope({ type: "SetDialogueLanguage", target: "project", targetId: s.project.id, language: "en" } as Command));
  if (!r.ok) throw new Error(r.error.message);
  return r.state;
}

function withNbVersion(s: ProjectState): ProjectState {
  const r = applyCommand(s, envelope({ type: "AddLanguageVersion", versionId: tid(), language: "nb", name: "Norsk" } as unknown as Command));
  if (!r.ok) throw new Error(r.error.message);
  return r.state;
}

function renderDialog(state: ProjectState, run: (cmd: Command, label: string) => unknown) {
  return render(
    <LanguageVersionsDialog open onOpenChange={() => {}} state={state} productionId={Object.keys(state.productions)[0]!} cmds={{ run } as never} editable />,
  );
}

describe("bytte av kildespråk (G-1b)", () => {
  it("viser kildespråket og en endre-knapp med advarsel", () => {
    setLanguage("nb");
    renderDialog(englishProject(), () => null);
    expect(screen.getByTestId("source-language-current").textContent).toContain("engelsk (en)");
    fireEvent.click(screen.getByTestId("source-language-change-open"));
    expect(screen.getByTestId("source-language-warning").textContent).toContain("oversettes ikke");
    expect(screen.getByTestId("source-language-change-confirm")).toBeTruthy();
  });

  it("forklarer konflikt når det nye språket er et eksisterende mål, og sperrer bekreftelsen", () => {
    setLanguage("nb");
    renderDialog(withNbVersion(englishProject()), () => null);
    fireEvent.click(screen.getByTestId("source-language-change-open"));
    fireEvent.change(screen.getByTestId("source-language-input"), { target: { value: "nb" } });
    expect(screen.getByTestId("source-language-conflict").textContent).toContain("målspråk");
    expect((screen.getByTestId("source-language-change-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("bekrefter et konfliktfritt bytte med SetDialogueLanguage-kommandoen", () => {
    setLanguage("nb");
    const run = vi.fn(() => null);
    renderDialog(englishProject(), run);
    fireEvent.click(screen.getByTestId("source-language-change-open"));
    fireEvent.change(screen.getByTestId("source-language-input"), { target: { value: "ja" } });
    expect((screen.getByTestId("source-language-change-confirm") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("source-language-change-confirm"));
    expect(run).toHaveBeenCalledTimes(1);
    const cmd = run.mock.calls[0]![0] as Command & { language: string };
    expect(cmd.type).toBe("SetDialogueLanguage");
    expect(cmd.target).toBe("project");
    expect(cmd.language).toBe("ja");
    // Skjemaet lukkes etter vellykket kjøring
    expect(screen.queryByTestId("source-language-input")).toBeNull();
  });

  it("avviser ugyldig språkkode i feltet", () => {
    setLanguage("nb");
    renderDialog(englishProject(), () => null);
    fireEvent.click(screen.getByTestId("source-language-change-open"));
    fireEvent.change(screen.getByTestId("source-language-input"), { target: { value: "ikke en kode!!" } });
    expect((screen.getByTestId("source-language-change-confirm") as HTMLButtonElement).disabled).toBe(true);
    // Feilen vises i tillegg til den faste advarselen (begge har role=alert)
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(1);
  });
});
