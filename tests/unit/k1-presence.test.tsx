// @vitest-environment jsdom
/**
 * K-1: varsel når en annen redigerer samme scene (presence) og brukerens valg etter en revisjonskonflikt.
 * runCommand er en attrapp; ingen ekte tjenester kalles.
 */
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ProjectState } from "@/core";
import { addConflict, useCommands } from "@/app/project/use-commands";
import { projectStateKey } from "@/app/project/use-project";
import { alsoEditingText, joinNames, presenceByOccurrence } from "@/app/project/presence-view";
import { SceneConflictNotice, ScenePresenceBadge } from "@/app/scene-editor/SceneCollabNotice";
import { seedProject } from "../helpers/fixtures";

const h = vi.hoisted(() => ({ runCommand: null as unknown as Mock<(arg: unknown) => Promise<unknown>> }));
h.runCommand = vi.fn();
vi.mock("@/adapters/storage/commands.functions", () => ({ runCommand: (a: unknown) => h.runCommand(a) }));

const USER = "00000000-0000-7000-8000-a11ce0000001";
beforeEach(() => h.runCommand.mockReset());
afterEach(() => cleanup());

function hookWith(s: ProjectState) {
  const qc = new QueryClient();
  qc.setQueryData(projectStateKey(s.project.id), s);
  return renderHook(() => useCommands(s.project.id, USER, true), {
    wrapper: ({ children }) => createElement(QueryClientProvider, { client: qc }, children),
  });
}

describe("K-1 visning av tilstedeværelse", () => {
  const others = [
    { userId: "b", name: "Bo", occurrenceId: "occ-1" },
    { userId: "a", name: "Ada", occurrenceId: "occ-1" },
    { userId: "c", name: "Cy", occurrenceId: "occ-2" },
    { userId: "d", name: "Di", occurrenceId: null },
  ];
  it("grupperer andre per sceneforekomst, sortert, og utelater dem uten scene", () => {
    const m = presenceByOccurrence(others);
    expect(m.get("occ-1")).toEqual(["Ada", "Bo"]);
    expect(m.get("occ-2")).toEqual(["Cy"]);
    expect(m.size).toBe(2);
  });
  it("én person gir navnet, flere gir alle navnene, ingen gir ingen tekst", () => {
    expect(alsoEditingText(["Ada"])).toContain("Ada");
    const many = alsoEditingText(["Ada", "Bo"])!;
    expect(many).toContain("Ada");
    expect(many).toContain("Bo");
    expect(alsoEditingText([])).toBeNull();
    expect(alsoEditingText(undefined)).toBeNull();
    expect(joinNames(["Ada", "Bo", "Cy"])).toMatch(/Ada.*Bo.*Cy/);
  });
  it("merket vises bare når noen andre står i scenen", () => {
    const { rerender } = render(createElement(ScenePresenceBadge, { names: undefined }));
    expect(screen.queryByTestId("scene-presence-badge")).toBeNull();
    rerender(createElement(ScenePresenceBadge, { names: ["Ada"] }));
    expect(screen.getByTestId("scene-presence-badge").textContent).toContain("Ada");
  });
});

describe("K-1 konfliktflyt", () => {
  it("addConflict holder hver kommando én gang", () => {
    const c = { id: "1", label: "x", command: { type: "SetOccurrenceColor" } as never, affected: [] };
    expect(addConflict(addConflict([], c), c)).toHaveLength(1);
  });

  async function conflicted() {
    const seed = seedProject(2);
    const occ = Object.values(seed.state.occurrences)[0]!;
    const { result } = hookWith(seed.state);
    h.runCommand.mockResolvedValueOnce({ ok: false, code: "revision_conflict", message: "x" });
    act(() => {
      result.current.run({ type: "SetOccurrenceColor", occurrenceId: occ.id, color: "#ff0000" } as never, "Farge");
    });
    await waitFor(() => expect(result.current.conflicts).toHaveLength(1));
    return { result, occ };
  }

  it("konflikt i en sceneendring venter på brukerens valg; ingenting sendes på nytt av seg selv", async () => {
    const { result } = await conflicted();
    expect(result.current.conflicts[0]).toMatchObject({ label: "Farge" });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.runCommand).toHaveBeenCalledTimes(1);
  });

  it("«Forkast min endring» fjerner konflikten uten å sende noe", async () => {
    const { result } = await conflicted();
    await act(async () => {
      expect(await result.current.resolveConflict(result.current.conflicts[0]!.id, "discard")).toBeNull();
    });
    expect(result.current.conflicts).toEqual([]);
    expect(h.runCommand).toHaveBeenCalledTimes(1);
  });

  it("«Legg min endring oppå» sender samme endring på nytt mot siste versjon", async () => {
    const { result, occ } = await conflicted();
    h.runCommand.mockResolvedValueOnce({ ok: true, inverse: null });
    await act(async () => {
      expect(await result.current.resolveConflict(result.current.conflicts[0]!.id, "rebase")).toBeNull();
    });
    await waitFor(() => expect(h.runCommand).toHaveBeenCalledTimes(2));
    const second = (h.runCommand.mock.calls[1]![0] as { data: { command: { type: string; occurrenceId: string; color: string } } }).data.command;
    expect(second).toMatchObject({ type: "SetOccurrenceColor", occurrenceId: occ.id, color: "#ff0000" });
    expect(result.current.conflicts).toEqual([]);
    expect(result.current.canUndo).toBe(true);
  });

  it("varselet viser hvem som sist endret og kaller valget brukeren tar", async () => {
    const resolveConflict = vi.fn(async () => null);
    render(
      createElement(SceneConflictNotice, {
        cmds: { conflicts: [{ id: "c1", label: "Farge", command: {} as never, affected: [] }], resolveConflict },
        lastChange: { at: "2026-10-22T10:00:00Z", actorName: "Ada", logged: true },
      }),
    );
    expect(screen.getByTestId("scene-conflict-by").textContent).toContain("Ada");
    fireEvent.click(screen.getByTestId("scene-conflict-discard"));
    await waitFor(() => expect(resolveConflict).toHaveBeenCalledWith("c1", "discard"));
    fireEvent.click(screen.getByTestId("scene-conflict-rebase"));
    await waitFor(() => expect(resolveConflict).toHaveBeenCalledWith("c1", "rebase"));
  });
});
