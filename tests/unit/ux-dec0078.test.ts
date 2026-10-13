// @vitest-environment jsdom
/**
 * UX-runden DEC-0078 (jsdom, Testing Library):
 * - KI-182 / REQ-0522: en avvist tekstendring (revisjonskonflikt) kastes ikke – teksten vises med «Kopier
 *   teksten», og en manuslinje kan legges oppå siste versjon med «Prøv igjen med min tekst» uten at den
 *   andres tekst går tapt (den kan hentes med Angre).
 * - KI-183 / UX-gjennomgang funn 5 og 10: visningsvalgene i monteringen ligger i «Visning», sjeldne handlinger
 *   i «Mer», og radhandlingene i kontinuitetsanalysen har tekst og aria-label.
 * - P7: hurtigtastene vises i en egen oversikt og i verktøytips.
 *
 * Serverfunksjonen runCommand er en attrapp; ingen ekte tjenester kalles.
 */
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { continuityAnalysis, mainProduction, scriptView, type ProjectState } from "@/core";
import {
  rejectedEdit,
  rejectedText,
  useCommands,
  type RejectedEdit,
} from "@/app/project/use-commands";
import { foreignChangeListeners, projectStateKey } from "@/app/project/use-project";
import { RejectedTextNotice } from "@/app/project/RejectedTextNotice";
import { ShortcutsDialog } from "@/app/shortcuts/ShortcutsDialog";
import { SHORTCUT_GROUPS, isShortcutHelpKey, withShortcut } from "@/app/shortcuts/shortcut-list";
import { AssemblyMoreMenu, AssemblyViewMenu } from "@/app/assembly/AssemblyToolbarMenus";
import { ContinuityAnalysisPanel } from "@/app/continuity/ContinuityAnalysisPanel";
import { BOB, mustApply, seedProject } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const h = vi.hoisted(() => ({
  runCommand: null as unknown as Mock<(arg: unknown) => Promise<unknown>>,
}));
h.runCommand = vi.fn();

vi.mock("@/adapters/storage/commands.functions", () => ({
  runCommand: (a: unknown) => h.runCommand(a),
}));
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  Link: ({
    children,
    to,
    title,
    search,
  }: {
    children: React.ReactNode;
    to: string;
    title?: string;
    search?: object;
  }) =>
    createElement("a", { href: to, title, "data-search": JSON.stringify(search ?? {}) }, children),
}));

const USER = "00000000-0000-7000-8000-a11ce0000001";

beforeEach(() => {
  h.runCommand.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function hookWith(s: ProjectState) {
  const qc = new QueryClient();
  qc.setQueryData(projectStateKey(s.project.id), s);
  const hook = renderHook(() => useCommands(s.project.id, USER, true), {
    wrapper: ({ children }) => createElement(QueryClientProvider, { client: qc }, children),
  });
  return { qc, ...hook };
}

const sent = (i: number) =>
  (
    h.runCommand.mock.calls[i]![0] as {
      data: { command: { type: string; text?: string }; baseRevisions: Record<string, number> };
    }
  ).data;

// ---------------------------------------------------------------- KI-182

describe("KI-182 – avvist tekst tas vare på ved revisjonskonflikt", () => {
  it("KI-182: teksten brukeren skrev, ligger i rejected etter konflikten (meldingen er uendret)", async () => {
    const seed = seedProject(2);
    const s = seed.state;
    const block = scriptView(s, seed.mainId)[0]!.blocks.find((b) => b.kind === "dialogue")!;
    const { result } = hookWith(s);
    h.runCommand.mockResolvedValueOnce({
      ok: false,
      code: "revision_conflict",
      message: "endret av en annen",
    });
    act(() => {
      result.current.run(
        {
          type: "EditBlockText",
          productionId: seed.mainId as never,
          blockId: block.id,
          text: "Min nye replikk",
        },
        "Rediger replikk",
      );
    });
    await waitFor(() => expect(result.current.status.kind).toBe("error"));
    expect(result.current.status).toEqual({
      kind: "error",
      message: "Noen andre endret dette samtidig. Siste versjon er hentet – prøv igjen.",
    });
    expect(result.current.rejected[0]).toMatchObject({
      text: "Min nye replikk",
      label: "Rediger replikk",
      retryable: true,
      conflict: true,
    });
    expect(result.current.canUndo).toBe(false);
    // Lukk: teksten forkastes først når brukeren selv ber om det
    act(() => result.current.dismissRejected());
    expect(result.current.rejected).toEqual([]);
  });

  it("KI-182: «Prøv igjen med min tekst» legger teksten oppå siste versjon, og den andres tekst kan hentes med Angre", async () => {
    const seed = seedProject(2);
    const s = seed.state;
    const block = scriptView(s, seed.mainId)[0]!.blocks.find((b) => b.kind === "dialogue")!;
    const { qc, result } = hookWith(s);
    h.runCommand.mockResolvedValueOnce({
      ok: false,
      code: "revision_conflict",
      message: "endret av en annen",
    });
    act(() => {
      result.current.run(
        {
          type: "EditBlockText",
          productionId: seed.mainId as never,
          blockId: block.id,
          text: "Min tekst",
        },
        "Rediger replikk",
      );
    });
    await waitFor(() => expect(result.current.rejected).toHaveLength(1));
    // Siste versjon fra serveren: Bob har skrevet sin egen tekst (ny revisjon)
    const theirs = mustApply(
      s,
      {
        type: "EditBlockText",
        productionId: seed.mainId as never,
        blockId: block.id,
        text: "Bobs tekst",
      },
      BOB,
    );
    expect(theirs.blocks[block.id]!.revision).not.toBe(s.blocks[block.id]!.revision);
    qc.setQueryData(projectStateKey(s.project.id), theirs);
    h.runCommand.mockResolvedValueOnce({ ok: true, inverse: null });
    let err: string | null = "ikke kjørt";
    await act(async () => {
      err = await result.current.retryRejected();
    });
    expect(err).toBe(null);
    await waitFor(() => expect(result.current.status.kind).toBe("idle"));
    expect(result.current.rejected).toEqual([]);
    // Sendt med revisjonen i Bobs versjon (ikke den gamle), så ingenting overskrives i stillhet
    const retry = sent(1);
    expect(retry.command).toMatchObject({ type: "EditBlockText", text: "Min tekst" });
    expect(retry.baseRevisions[block.id]).toBe(theirs.blocks[block.id]!.revision);
    expect(
      qc.getQueryData<ProjectState>(projectStateKey(s.project.id))!.blocks[block.id]!.text,
    ).toBe("Min tekst");
    // Angre gir Bobs tekst tilbake
    expect(result.current.canUndo).toBe(true);
    h.runCommand.mockResolvedValueOnce({ ok: true, inverse: null });
    act(() => result.current.undo());
    await waitFor(() => expect(h.runCommand).toHaveBeenCalledTimes(3));
    expect(sent(2).command).toMatchObject({ type: "EditBlockText", text: "Bobs tekst" });
  });

  it("KI-182: har den andre skrevet akkurat det samme, gjøres ingenting – og varselet forsvinner", async () => {
    const seed = seedProject(2);
    const s = seed.state;
    const block = scriptView(s, seed.mainId)[0]!.blocks.find((b) => b.kind === "dialogue")!;
    const { qc, result } = hookWith(s);
    h.runCommand.mockResolvedValueOnce({ ok: false, code: "revision_conflict", message: "x" });
    act(() => {
      result.current.run(
        {
          type: "EditBlockText",
          productionId: seed.mainId as never,
          blockId: block.id,
          text: "Lik",
        },
        "Rediger replikk",
      );
    });
    await waitFor(() => expect(result.current.rejected).toHaveLength(1));
    qc.setQueryData(
      projectStateKey(s.project.id),
      mustApply(
        s,
        {
          type: "EditBlockText",
          productionId: seed.mainId as never,
          blockId: block.id,
          text: "Lik",
        },
        BOB,
      ),
    );
    await act(async () => {
      await result.current.retryRejected();
    });
    expect(result.current.rejected).toEqual([]);
    expect(h.runCommand).toHaveBeenCalledTimes(1);
  });

  it("KI-182: feiler lagringen av andre grunner (nettverk), tas teksten også vare på – merket som ikke-konflikt", async () => {
    const seed = seedProject(2);
    const s = seed.state;
    const block = scriptView(s, seed.mainId)[0]!.blocks.find((b) => b.kind === "dialogue")!;
    const { result } = hookWith(s);
    h.runCommand.mockRejectedValueOnce(new Error("Nettverksfeil"));
    act(() => {
      result.current.run(
        {
          type: "EditBlockText",
          productionId: seed.mainId as never,
          blockId: block.id,
          text: "Tekst",
        },
        "Rediger replikk",
      );
    });
    await waitFor(() => expect(result.current.rejected).toHaveLength(1));
    expect(result.current.rejected[0]).toMatchObject({ text: "Tekst", conflict: false });
  });

  it("KI-182: avvist angring gir ingen «din tekst» (den gamle teksten er ikke noe brukeren skrev nå)", async () => {
    const seed = seedProject(2);
    const s = seed.state;
    const block = scriptView(s, seed.mainId)[0]!.blocks.find((b) => b.kind === "dialogue")!;
    const { result } = hookWith(s);
    h.runCommand.mockResolvedValueOnce({ ok: true, inverse: null });
    act(() => {
      result.current.run(
        {
          type: "EditBlockText",
          productionId: seed.mainId as never,
          blockId: block.id,
          text: "Ny",
        },
        "Rediger replikk",
      );
    });
    await waitFor(() => expect(result.current.status.kind).toBe("idle"));
    h.runCommand.mockResolvedValueOnce({ ok: false, code: "revision_conflict", message: "x" });
    act(() => result.current.undo());
    await waitFor(() => expect(result.current.status.kind).toBe("error"));
    expect(result.current.rejected).toEqual([]);
  });

  it("KI-182: etter «Prøv igjen med min tekst» kan endringen angres selv om den andres endring er varslet (den andres tekst er sett)", async () => {
    const seed = seedProject(2);
    const s = seed.state;
    const block = scriptView(s, seed.mainId)[0]!.blocks.find((b) => b.kind === "dialogue")!;
    const { qc, result } = hookWith(s);
    h.runCommand.mockResolvedValueOnce({ ok: false, code: "revision_conflict", message: "x" });
    act(() => {
      result.current.run(
        {
          type: "EditBlockText",
          productionId: seed.mainId as never,
          blockId: block.id,
          text: "Min tekst",
        },
        "Rediger replikk",
      );
    });
    await waitFor(() => expect(result.current.rejected).toHaveLength(1));
    // Sanntidsvarselet om Bobs endring av linjen
    act(() => {
      for (const f of foreignChangeListeners) f([block.id]);
    });
    const theirs = mustApply(
      s,
      {
        type: "EditBlockText",
        productionId: seed.mainId as never,
        blockId: block.id,
        text: "Bobs tekst",
      },
      BOB,
    );
    qc.setQueryData(projectStateKey(s.project.id), theirs);
    // Varselet viser Bobs tekst slik den står nå
    expect(result.current.currentTextOf(result.current.rejected[0]!)).toBe("Bobs tekst");
    h.runCommand.mockResolvedValueOnce({ ok: true, inverse: null });
    await act(async () => {
      await result.current.retryRejected(result.current.rejected[0]!.id);
    });
    await waitFor(() => expect(result.current.status.kind).toBe("idle"));
    h.runCommand.mockResolvedValueOnce({ ok: true, inverse: null });
    act(() => result.current.undo());
    await waitFor(() => expect(h.runCommand).toHaveBeenCalledTimes(3));
    expect(sent(2).command).toMatchObject({ type: "EditBlockText", text: "Bobs tekst" });
    expect(result.current.status.kind).not.toBe("error");
  });

  it("KI-182: en endring den andre gjør etter «Prøv igjen», stopper fortsatt angring", async () => {
    const seed = seedProject(2);
    const s = seed.state;
    const block = scriptView(s, seed.mainId)[0]!.blocks.find((b) => b.kind === "dialogue")!;
    const { result } = hookWith(s);
    h.runCommand.mockResolvedValueOnce({ ok: true, inverse: null });
    act(() => {
      result.current.run(
        {
          type: "EditBlockText",
          productionId: seed.mainId as never,
          blockId: block.id,
          text: "Min tekst",
        },
        "Rediger replikk",
      );
    });
    await waitFor(() => expect(result.current.status.kind).toBe("idle"));
    act(() => {
      for (const f of foreignChangeListeners) f([block.id]);
    });
    act(() => result.current.undo());
    expect(result.current.status).toEqual({
      kind: "error",
      message:
        "Kan ikke angre: noen andre har endret det samme etterpå. Endringen deres er beholdt.",
    });
    expect(h.runCommand).toHaveBeenCalledTimes(1);
  });

  it("KI-182: tekst som ikke ble sendt fordi en tidligere endring feilet, tas også vare på – alle avviste tekster beholdes", async () => {
    const seed = seedProject(2);
    const s = seed.state;
    const blocks = scriptView(s, seed.mainId)[0]!.blocks;
    const a = blocks[0]!;
    const b = blocks[1]!;
    const { result } = hookWith(s);
    h.runCommand.mockResolvedValueOnce({ ok: false, code: "revision_conflict", message: "x" });
    act(() => {
      result.current.run(
        { type: "EditBlockText", productionId: seed.mainId as never, blockId: a.id, text: "Først" },
        "Rediger linje",
      );
      result.current.run(
        { type: "EditBlockText", productionId: seed.mainId as never, blockId: b.id, text: "Så" },
        "Rediger linje",
      );
    });
    await waitFor(() => expect(result.current.rejected).toHaveLength(2));
    expect(h.runCommand).toHaveBeenCalledTimes(1);
    expect(result.current.rejected[0]).toMatchObject({ text: "Først", conflict: true });
    expect(result.current.rejected[1]).toMatchObject({
      text: "Så",
      conflict: false,
      skipped: true,
      retryable: true,
    });
    // Lukk én: den andre står igjen
    act(() => result.current.dismissRejected(result.current.rejected[0]!.id));
    expect(result.current.rejected.map((r) => r.text)).toEqual(["Så"]);
  });

  it("whenIdle venter til alle endringer i køen er lagret", async () => {
    const seed = seedProject(2);
    const s = seed.state;
    const block = scriptView(s, seed.mainId)[0]!.blocks[0]!;
    const { result } = hookWith(s);
    let answer: (v: unknown) => void = () => undefined;
    h.runCommand.mockImplementationOnce(() => new Promise((res) => (answer = res)));
    act(() => {
      result.current.run(
        {
          type: "EditBlockText",
          productionId: seed.mainId as never,
          blockId: block.id,
          text: "Ny",
        },
        "Rediger linje",
      );
    });
    let idle = false;
    const waiting = result.current.whenIdle().then(() => {
      idle = true;
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(idle).toBe(false);
    await act(async () => {
      answer({ ok: true, inverse: null });
      await waiting;
    });
    expect(idle).toBe(true);
    // Tom kø: avgjøres med en gang
    await expect(result.current.whenIdle()).resolves.toBeUndefined();
  });

  it("KI-182: rejectedText henter teksten fra tekstkommandoene og ignorerer andre kommandoer", () => {
    const seed = seedProject(1);
    const block = scriptView(seed.state, seed.mainId)[0]!.blocks[0]!;
    expect(
      rejectedText({
        type: "EditBlockText",
        productionId: seed.mainId as never,
        blockId: block.id,
        text: "A",
      }),
    ).toBe("A");
    expect(
      rejectedText({ type: "EditAnnotation", annotationId: "x" as never, text: "Notat" }),
    ).toBe("Notat");
    expect(
      rejectedText({
        type: "InsertBlock",
        productionId: seed.mainId as never,
        variantId: block.variantId,
        block: { blockId: "b" as never, kind: "action", text: "Ny linje", orderKey: "a0" },
      }),
    ).toBe("Ny linje");
    expect(
      rejectedText({
        type: "SetOccurrenceActive",
        occurrenceId: "o" as never,
        active: false,
      }),
    ).toBe(null);
    // Bare manuslinjer kan prøves igjen automatisk; tom tekst gir ikke noe varsel
    expect(
      rejectedEdit(
        "1",
        { type: "EditAnnotation", annotationId: "x" as never, text: "N" },
        "L",
        true,
      )?.retryable,
    ).toBe(false);
    expect(
      rejectedEdit(
        "1",
        { type: "EditAnnotation", annotationId: "x" as never, text: "  " },
        "L",
        true,
      ),
    ).toBe(null);
  });
});

describe("KI-182 – varselet med den avviste teksten", () => {
  const edit = (over: Partial<RejectedEdit> = {}): RejectedEdit => ({
    id: "c1",
    label: "Rediger replikk",
    text: "Hører du det? Noen banker på døra!",
    command: {
      type: "EditBlockText",
      productionId: "p" as never,
      blockId: "b" as never,
      text: "Hører du det? Noen banker på døra!",
    },
    retryable: true,
    conflict: true,
    ...over,
  });

  it("KI-182: viser teksten, kopierer den til utklippstavlen og prøver igjen på forespørsel", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const retryRejected = vi.fn().mockResolvedValue(null);
    const dismissRejected = vi.fn();
    render(
      createElement(RejectedTextNotice, {
        cmds: { rejected: [edit()], retryRejected, dismissRejected },
      }),
    );
    const notice = screen.getByRole("alert", { name: "Teksten din ble ikke lagret" });
    expect(within(notice).getByText(/Noen andre endret det samme samtidig/)).toBeTruthy();
    expect(within(notice).getByLabelText("Teksten din").textContent).toBe(
      "Hører du det? Noen banker på døra!",
    );
    await act(async () => {
      fireEvent.click(within(notice).getByRole("button", { name: /Kopier teksten/ }));
    });
    expect(writeText).toHaveBeenCalledWith("Hører du det? Noen banker på døra!");
    expect(within(notice).getByRole("button", { name: /Kopiert/ })).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(notice).getByRole("button", { name: /Prøv igjen med min tekst/ }));
    });
    expect(retryRejected).toHaveBeenCalledTimes(1);
    fireEvent.click(within(notice).getByRole("button", { name: "Lukk varselet" }));
    expect(dismissRejected).toHaveBeenCalledTimes(1);
  });

  it("KI-182: alle avviste tekster vises, hver med egne knapper, og den andres tekst vises før nytt forsøk", () => {
    const retryRejected = vi.fn().mockResolvedValue(null);
    const dismissRejected = vi.fn();
    render(
      createElement(RejectedTextNotice, {
        cmds: {
          rejected: [
            edit(),
            edit({ id: "c2", text: "Andre linje", conflict: false, skipped: true }),
          ],
          retryRejected,
          dismissRejected,
          currentTextOf: (r) => (r.id === "c1" ? "Bobs versjon" : null),
        },
      }),
    );
    const notices = screen.getAllByRole("alert", { name: "Teksten din ble ikke lagret" });
    expect(notices).toHaveLength(2);
    expect(within(notices[0]!).getByLabelText("Teksten som står nå").textContent).toBe(
      "Bobs versjon",
    );
    expect(within(notices[1]!).getByText(/fordi en tidligere endring feilet/)).toBeTruthy();
    expect(within(notices[1]!).queryByLabelText("Teksten som står nå")).toBe(null);
    fireEvent.click(within(notices[1]!).getByRole("button", { name: "Lukk varselet" }));
    expect(dismissRejected).toHaveBeenCalledWith("c2");
    fireEvent.click(within(notices[0]!).getByRole("button", { name: /Prøv igjen med min tekst/ }));
    expect(retryRejected).toHaveBeenCalledWith("c1");
  });

  it("KI-182: notater (ikke manuslinjer) kan bare kopieres; ingenting vises uten avvist tekst", () => {
    const { rerender } = render(
      createElement(RejectedTextNotice, {
        cmds: {
          rejected: [edit({ retryable: false, conflict: false })],
          retryRejected: vi.fn(),
          dismissRejected: vi.fn(),
        },
      }),
    );
    expect(screen.getByRole("button", { name: /Kopier teksten/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Prøv igjen med min tekst/ })).toBe(null);
    rerender(
      createElement(RejectedTextNotice, {
        cmds: { rejected: [], retryRejected: vi.fn(), dismissRejected: vi.fn() },
      }),
    );
    expect(screen.queryByRole("alert")).toBe(null);
  });
});

// ---------------------------------------------------------------- Hurtigtaster (P7)

describe("P7 – hurtigtaster vises", () => {
  it("P7: «?» åpner oversikten, men ikke med Ctrl/Cmd/Alt; verktøytips får tasten i parentes", () => {
    expect(isShortcutHelpKey({ key: "?", metaKey: false, ctrlKey: false, altKey: false })).toBe(
      true,
    );
    expect(isShortcutHelpKey({ key: "?", metaKey: true, ctrlKey: false, altKey: false })).toBe(
      false,
    );
    expect(isShortcutHelpKey({ key: "/", metaKey: false, ctrlKey: false, altKey: false })).toBe(
      false,
    );
    expect(withShortcut("Spill av", "mellomrom")).toBe("Spill av (mellomrom)");
    expect(withShortcut("Løkke", null)).toBe("Løkke");
  });

  it("P7: oversikten viser tastene i monteringen (de som er koblet opp i AssemblyWorkspace) og arbeidsflaten man står i først", () => {
    const keys = SHORTCUT_GROUPS.find((g) => g.id === "montering")!.shortcuts.flatMap(
      (s) => s.keys,
    );
    for (const k of ["Mellomrom", "K", "S", "T", "Enter", "Home", "End", "Delete"])
      expect(keys).toContain(k);
    render(
      createElement(ShortcutsDialog, {
        open: true,
        onOpenChange: () => {},
        current: "sceneeditor",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: /Hurtigtaster/ });
    const headings = within(dialog)
      .getAllByRole("heading", { level: 3 })
      .map((x) => x.textContent);
    expect(headings[0]).toBe("Sceneeditor (her)");
    expect(headings).toContain("Montering");
    expect(within(dialog).getAllByText("Mellomrom").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- KI-183 / funn 5

describe("KI-183 – monteringens verktøylinje: Visning og Mer", () => {
  it("KI-183: visningsvalgene ligger i «Visning» med tekst og forklaring, og endrer bare visningen", () => {
    const onMonochrome = vi.fn();
    const onTechnical = vi.fn();
    const onPopout = vi.fn();
    render(
      createElement(AssemblyViewMenu, {
        monochrome: false,
        onMonochrome,
        technical: true,
        onTechnical,
        popout: false,
        onPopout,
        hasClips: true,
      }),
    );
    const trigger = screen.getByRole("button", { name: /^Visning/ });
    // Et valg er endret fra standard: markert også for skjermleser
    expect(trigger.textContent).toContain("(endret)");
    expect(trigger.getAttribute("title")).toMatch(/Svart-hvitt/);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("checkbox", { name: /Svart-hvitt/ }));
    expect(onMonochrome).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Teknisk visning/ }));
    expect(onTechnical).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("checkbox", { name: /Eget vindu/ }));
    expect(onPopout).toHaveBeenCalledWith(true);
  });

  it("KI-183: «Mer» har de sjeldnere handlingene med tekst; lang film og video for flere scener bare for redaktører", async () => {
    const calls: string[] = [];
    const props = {
      hasClips: true,
      onStandardTransition: () => calls.push("standard"),
      onLongFilm: () => calls.push("lang"),
      onBatchVideo: () => calls.push("video"),
      onLanguage: () => calls.push("språk"),
      onSubtitles: () => calls.push("tekst"),
    };
    const { unmount } = render(createElement(AssemblyMoreMenu, { ...props, editable: true }));
    const open = () => {
      const t = screen.getByRole("button", { name: /^Mer/ });
      // Tastaturet åpner menyen (Radix reagerer på pekerhendelser jsdom ikke har)
      t.focus();
      fireEvent.keyDown(t, { key: "Enter" });
    };
    open();
    const items = (await screen.findAllByRole("menuitem")).map((i) => i.textContent ?? "");
    expect(items.map((t) => t.split(" …")[0])).toEqual([
      "Standardovergang",
      "Importer lang film",
      "Video for flere scener",
      "Språkversjon",
      "Undertekster",
    ]);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Video for flere scener/ }));
    expect(calls).toEqual(["video"]);
    unmount();
    render(createElement(AssemblyMoreMenu, { ...props, editable: false }));
    open();
    const readOnly = (await screen.findAllByRole("menuitem")).map(
      (i) => (i.textContent ?? "").split(" …")[0],
    );
    expect(readOnly).toEqual(["Standardovergang", "Språkversjon", "Undertekster"]);
  });
});

// ---------------------------------------------------------------- funn 10

describe("UX-gjennomgang funn 10 – kontinuitetsanalysen: handlinger med tekst", () => {
  it("funn 10: «Bibliotek» og «Skjul» har synlig tekst, verktøytips og et navn for skjermleser", () => {
    const s = fixture.state;
    const main = mainProduction(s)!;
    const withAsset = continuityAnalysis(s, main.id).filter((f) => f.assetId);
    expect(withAsset.length).toBeGreaterThan(0);
    const qc = new QueryClient();
    render(
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(ContinuityAnalysisPanel, {
          state: s,
          projectId: s.project.id,
          productionId: main.id,
        }),
      ),
    );
    const library = screen.getAllByRole("link", { name: "Bibliotek" });
    expect(library.length).toBe(withAsset.length);
    expect(library[0]!.getAttribute("title")).toBe("Åpne ressursen i biblioteket");
    const hide = screen.getAllByRole("button", { name: "Skjul funnet" });
    expect(hide[0]!.textContent).toBe("Skjul");
    expect(hide[0]!.getAttribute("title")).toMatch(/Skjul funnet/);
    fireEvent.click(hide[0]!);
    // Skjult: «Vis skjulte (1)» – og etter visning heter knappen «Vis»
    fireEvent.click(screen.getByRole("button", { name: /Vis skjulte \(1\)/ }));
    const show = screen.getByRole("button", { name: "Vis funnet" });
    expect(show.textContent).toBe("Vis");
  });
});
