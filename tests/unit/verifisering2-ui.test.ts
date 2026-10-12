/**
 * Verifisering av krav (DEC-0074) i grensesnittet (jsdom, React Testing Library):
 * - REQ-0548: forslag fra manuset viser bevis, usikre forslag er ikke valgt, skrivemåtene blir alternative
 *   navn, og forslag kan skjules.
 * - REQ-0309: «Oppdater med AI» fra avviket starter ingenting før kostnaden er vist og godkjent.
 *
 * Nettverk og AI-tjenester er erstattet: kommandoene kjøres i domenekjernen, og startVideoGeneration er en
 * attrapp som registrerer kallene (ingen ekte leverandør kalles).
 */
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCommand,
  filmClips,
  keysEvenly,
  librarySuggestions,
  orderedOccurrences,
  scriptView,
  type Command,
  type ProjectState,
  type TakeMedia,
} from "@/core";
import { SuggestionsDialog } from "@/app/library/SuggestionsDialog";
import { AiUpdateSection } from "@/app/assembly/AiUpdateSection";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const startVideoGeneration = vi.fn(async (_: unknown) => ({ ok: true as const }));

vi.mock("@/adapters/ai/video.functions", () => ({
  startVideoGeneration: (arg: unknown) => startVideoGeneration(arg),
}));
vi.mock("@/app/ai/use-ai-jobs", () => ({
  aiJobsKey: (projectId: string) => ["ai-jobs", projectId],
  useAiJobs: () => ({ data: { jobs: [], monthCount: 0 } }),
}));
vi.mock("@/app/ai/use-project-providers", () => ({
  useProjectProviders: () => ({ data: { providers: ["lovable", "runway"], missing: false } }),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// ---------------------------------------------------------------- REQ-0548

/** Kjører kommandoene i kjernen, slik runAndWait gjør via serveren. */
function fakeCommands(initial: ProjectState) {
  let state = initial;
  const ran: Command[] = [];
  const cmds = {
    runAndWait: vi.fn(async (command: Command) => {
      ran.push(command);
      const r = applyCommand(state, envelope(command));
      if (!r.ok) return { error: r.error.message };
      state = r.state;
      return { error: null, commandId: "x" };
    }),
    current: () => state,
  };
  return { cmds, ran, state: () => state };
}

/**
 * Manus der MAJA snakker i to scener og «MAJJA» er en skrivefeil i en tredje (sammenslått, må bekreftes),
 * PER snakker i to scener (sikkert forslag) og OLA bare er med i én (usikkert).
 */
function suggestionProject() {
  const seed = seedProject(6);
  let s = seed.state;
  const view = scriptView(s, seed.mainId);
  const rename = (i: number, text: string) => {
    const blockId = view[i]!.blocks.find((b) => b.kind === "character")!.id;
    s = mustApply(s, { type: "EditBlockText", productionId: seed.mainId as never, blockId, text });
  };
  rename(2, "MAJJA");
  rename(3, "OLA");
  rename(4, "PER");
  rename(5, "PER");
  return { s, mainId: seed.mainId };
}

function renderSuggestions(s: ProjectState, mainId: string, projectId = "prosjekt-1") {
  const suggestions = librarySuggestions(s, mainId);
  const fake = fakeCommands(s);
  const onOpenChange = vi.fn();
  const props = {
    open: true,
    onOpenChange,
    state: s,
    suggestions,
    cmds: fake.cmds as never,
    projectId,
  };
  const view = render(createElement(SuggestionsDialog, props));
  return { suggestions, fake, onOpenChange, view, props };
}

describe("REQ-0548 – forslag fra manuset viser bevis og kan skjules", () => {
  it("REQ-0548: forslaget viser scenenumrene og de andre skrivemåtene som bevis", () => {
    const { s, mainId } = suggestionProject();
    const { suggestions } = renderSuggestions(s, mainId);
    const maja = suggestions.find((x) => x.name === "MAJA")!;
    expect(maja).toBeDefined();
    expect(maja.scenes).toBe(3);
    expect(maja.sources.map((x) => x.name)).toContain("MAJJA");
    // Scenenumrene slik de står i manuset (fixturen: 1, unummerert, 2)
    expect(maja.sceneNumbers).toEqual(["1", "uten nr.", "2"]);
    const row = screen.getByRole("checkbox", { name: "Legg til MAJA" }).closest("li")!;
    const text = row.textContent ?? "";
    expect(text).toMatch(/3 scener/);
    expect(text).toMatch(/Scene 1, uten nr\., 2/);
    expect(text).toMatch(/også: MAJJA \(mulig skrivefeil, 1 scene\)/);
  });

  it("REQ-0548: et usikkert forslag er ikke avkrysset på forhånd; et sikkert er det", () => {
    const { s, mainId } = suggestionProject();
    const { suggestions } = renderSuggestions(s, mainId);
    const ola = suggestions.find((x) => x.name === "OLA")!;
    const maja = suggestions.find((x) => x.name === "MAJA")!;
    const per = suggestions.find((x) => x.name === "PER")!;
    // Usikre: bare én scene (OLA) og sammenslått skrivefeil (MAJA/MAJJA)
    expect(ola.uncertain).toBe(true);
    expect(maja.uncertain).toBe(true);
    expect(per.uncertain).toBe(false);
    expect(screen.getByRole("checkbox", { name: "Legg til OLA" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Legg til MAJA" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Legg til PER" })).toBeChecked();
  });

  it("REQ-0548: når forslaget godtas, lagres skrivemåtene som alternative navn på ressursen", async () => {
    const { s, mainId } = suggestionProject();
    const { fake, onOpenChange } = renderSuggestions(s, mainId);
    // Brukeren godtar MAJA (med skrivefeilen) i tillegg til PER, som er valgt fra før
    fireEvent.click(screen.getByRole("checkbox", { name: "Legg til MAJA" }));
    fireEvent.click(screen.getByRole("button", { name: /^Legg til \d+$/ }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(fake.ran.map((c) => c.type)).toEqual(["CreateAssets"]);
    const maja = Object.values(fake.state().assets).find((a) => a.name === "Maja")!;
    expect(maja).toBeDefined();
    expect(maja.kind).toBe("character");
    expect(maja.names.filter((n) => n.kind === "alias").map((n) => n.name)).toContain("MAJJA");
    expect(Object.values(fake.state().assets).some((a) => a.name === "Per")).toBe(true);
    // Det usikre forslaget ble ikke lagt til
    expect(Object.values(fake.state().assets).some((a) => /ola/i.test(a.name))).toBe(false);
  });

  it("REQ-0548: et skjult forslag forsvinner for brukeren, også neste gang dialogen åpnes, og kan vises igjen", () => {
    const { s, mainId } = suggestionProject();
    const first = renderSuggestions(s, mainId);
    const row = screen.getByRole("checkbox", { name: "Legg til OLA" }).closest("li")!;
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Skjul" }));
    expect(screen.queryByRole("checkbox", { name: "Legg til OLA" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Legg til MAJA" })).toBeInTheDocument();
    // Skjulingen endrer ikke prosjektet (ingen kommando) – den gjelder bare denne brukeren
    expect(first.fake.ran).toEqual([]);
    // Lukk og åpne igjen: fortsatt skjult
    first.view.rerender(createElement(SuggestionsDialog, { ...first.props, open: false }));
    first.view.rerender(createElement(SuggestionsDialog, { ...first.props, open: true }));
    expect(screen.queryByRole("checkbox", { name: "Legg til OLA" })).toBeNull();
    // «Vis skjulte» tar det tilbake
    fireEvent.click(screen.getByRole("button", { name: /Vis skjulte \(1\)/ }));
    expect(screen.getByRole("checkbox", { name: "Legg til OLA" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------- REQ-0309

const MEDIA: TakeMedia = {
  fileName: "AI-video (runway).mp4",
  mimeType: "video/mp4",
  byteSize: 1000,
  width: 1280,
  height: 720,
  fps: 24,
  durationMs: 5000,
  videoCodec: null,
  hasAudio: false,
};

/** En scene delt i to segmenter med hver sin AI-video. */
function sceneWithVideos() {
  const seed = seedProject(2);
  const occ = orderedOccurrences(seed.state, seed.mainId)[1]!.id as string;
  const ids = [tid<"production_segment">(), tid<"production_segment">()];
  const keys = keysEvenly(2);
  let s = mustApply(seed.state, {
    type: "ReplaceSegments",
    occurrenceId: occ,
    reason: "model_limit",
    removeSegmentIds: [],
    segments: ids.map((segmentId, i) => ({
      segmentId,
      orderKey: keys[i]!,
      startBlockId: null,
      endBlockId: null,
      startMs: i * 4000,
      endMs: (i + 1) * 4000,
    })),
  } as never);
  const takeIds: string[] = [];
  for (const segmentId of ids) {
    const takeId = tid<"take">();
    takeIds.push(takeId);
    s = mustApply(s, {
      type: "AddTake",
      takeId,
      occurrenceId: occ as never,
      segmentId: segmentId as never,
      kind: "ai_video",
      status: "in_progress",
      durationFrames: 100,
      mediaRef: `${s.project.id}/films/${takeId}/ai-video.mp4`,
      media: MEDIA,
    });
  }
  return { s, occ, takeIds, mainId: seed.mainId };
}

function renderUpdate(s: ProjectState, occ: string, takeIds: string[]) {
  const qc = new QueryClient();
  return render(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(AiUpdateSection, {
        state: s,
        occurrenceId: occ,
        // En fjernet linje kan ikke plasseres i tiden: alle segmenter med video tas med
        changes: [
          {
            blockId: "fjernet-linje",
            kind: "removed",
            blockKind: "dialogue",
            oldText: "Gammel replikk",
            newText: null,
          },
        ],
        takeIds,
      }),
    ),
  );
}

describe("REQ-0309 – kostnaden vises og godkjennes før regenerering fra avviket", () => {
  beforeEach(() => startVideoGeneration.mockClear());

  it("REQ-0309: knappen viser anslått kostnad, og ingenting startes før brukeren har bekreftet", async () => {
    const { s, occ, takeIds, mainId } = sceneWithVideos();
    expect(filmClips(s, mainId).some((c) => c.occurrenceId === occ)).toBe(true);
    renderUpdate(s, occ, takeIds);
    // To segmenter à 5 s med Runway Gen-4 Turbo (0,05 USD/s) = 0,50 USD
    const open = screen.getByRole("button", { name: /Oppdater med AI \(2 segmenter, ~\$0\.50\)/ });
    expect(startVideoGeneration).not.toHaveBeenCalled();
    fireEvent.click(open);
    const dialog = screen.getByRole("alertdialog", { name: "Bekreft ny video" });
    expect(dialog.textContent).toMatch(/2 nye videoer med Runway – Gen-4 Turbo/);
    expect(dialog.textContent).toMatch(/anslått \$0\.50/);
    expect(dialog.textContent).toMatch(/De gamle videoene beholdes/);
    // Beskrivelsene som sendes, kan ses før noe koster penger
    expect(within(dialog).getByText(/Se det som sendes til modellen/)).toBeInTheDocument();
    expect(startVideoGeneration).not.toHaveBeenCalled();
    // Avbryt: fortsatt ingenting startet
    fireEvent.click(within(dialog).getByRole("button", { name: "Avbryt" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(startVideoGeneration).not.toHaveBeenCalled();
    // Bekreft: én jobb per segment, merket som godkjent, med modellen kostnaden ble regnet for
    fireEvent.click(screen.getByRole("button", { name: /Oppdater med AI/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ja, lag nye videoer/ }));
    await waitFor(() => expect(startVideoGeneration).toHaveBeenCalledTimes(2));
    for (const [arg] of startVideoGeneration.mock.calls) {
      const data = (arg as { data: Record<string, unknown> }).data;
      expect(data["approved"]).toBe(true);
      expect(data["provider"]).toBe("runway");
      expect(data["model"]).toBe("gen4_turbo");
      expect(data["seconds"]).toBe(5);
    }
    await screen.findByText(/2 nye videoer er lagt i kø/);
  });

  it("REQ-0309: endringer som ikke synes i bildet gir ingen regenerering å godkjenne", () => {
    const { s, occ, takeIds } = sceneWithVideos();
    const qc = new QueryClient();
    render(
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(AiUpdateSection, {
          state: s,
          occurrenceId: occ,
          changes: [
            { blockId: "x", kind: "changed", blockKind: "note", oldText: "a", newText: "b" },
          ] as never,
          takeIds,
        }),
      ),
    );
    expect(screen.getByText(/synes ikke i bildet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Oppdater med AI/ })).toBeNull();
    expect(startVideoGeneration).not.toHaveBeenCalled();
  });
});
