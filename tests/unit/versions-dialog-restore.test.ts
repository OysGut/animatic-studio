// @vitest-environment jsdom
/**
 * «Gjør denne versjonen gjeldende» i manusversjonene (REQ-0077, KI-27): forhåndsvisning før bekreftelse og
 * én angregruppe. Databasen er en attrapp; ingen ekte tjenester kalles.
 */
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCommand,
  blocksOfVariant,
  orderedOccurrences,
  snapshotFromState,
  type Command,
  type ScriptSnapshot,
} from "@/core";
import { PARTIAL_RESTORE, VersionsDialog } from "@/app/script/VersionsDialog";
import { envelope, mustApply, seedProject } from "../helpers/fixtures";

const h = vi.hoisted(() => ({ snapshot: null as unknown }));

vi.mock("@/adapters/browser/versions", () => ({
  listScriptVersions: vi.fn(async () => [
    {
      id: "v1",
      number: 1,
      name: "Første utkast",
      note: null,
      parent_version_id: null,
      created_at: "2026-10-01T10:00:00.000Z",
      created_by: "u1",
    },
  ]),
  fetchScriptSnapshot: vi.fn(async () => h.snapshot),
  createScriptVersion: vi.fn(async () => "v2"),
}));
vi.mock("@/app/project/use-project", () => ({
  useProfiles: () => ({ data: { u1: { display_name: "Anita" } } }),
}));
vi.mock("@/app/shell/use-schema", () => ({ useSchemaAtLeast: () => false }));

afterEach(cleanup);

describe("Gjør en manusversjon gjeldende i dialogen (REQ-0077)", () => {
  it("viser hva som endres og utfører alt i én angregruppe etter bekreftelse", async () => {
    const { state, mainId } = seedProject();
    h.snapshot = snapshotFromState(state, mainId) satisfies ScriptSnapshot;
    const o = orderedOccurrences(state, mainId)[0]!;
    const b = blocksOfVariant(state, o.variantId)[0]!;
    const now = mustApply(state, {
      type: "EditBlockText",
      productionId: mainId as never,
      blockId: b.id,
      text: "Helt ny handling",
    });
    const runs: { command: Command; group: string | undefined }[] = [];
    let s = now;
    const onRun = (command: Command, _label: string, group?: string) => {
      runs.push({ command, group });
      const r = applyCommand(s, envelope(command));
      if (!r.ok) return { error: r.error.message, done: Promise.resolve(r.error.message) };
      s = r.state;
      return { error: null, done: Promise.resolve(null) };
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(VersionsDialog, {
          open: true,
          onOpenChange: () => undefined,
          projectId: "p",
          productionId: mainId,
          state: now,
          editable: true,
          saving: false,
          onGoToScene: () => undefined,
          onRun,
        }),
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: /Vis/ }));
    const restore = await screen.findByRole("button", { name: /Gjør denne versjonen gjeldende/ });
    await waitFor(() => expect(restore).not.toBeDisabled());
    fireEvent.click(restore);
    // Forhåndsvisning: scenen og den endrede linjen
    const list = await screen.findByRole("list", { name: "Dette endres i manuset" });
    expect(list.textContent).toContain("Endret handling");
    expect(list.textContent).toContain("1 linje endret");
    expect(list.querySelector("del")?.textContent).toContain("Helt ny");
    expect(runs).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Gjør v1 gjeldende/ }));
    expect(runs.length).toBeGreaterThan(0);
    expect(new Set(runs.map((r) => r.group)).size).toBe(1);
    expect(runs[0]!.group).toBeTruthy();
    expect(s.blocks[b.id]!.text).toBe(b.text);
    // Tilbake i listen med forslag om å lagre en ny versjon
    expect(await screen.findByText(/Manuset er nå som v1/)).toBeTruthy();
  });

  it("avviser serveren en del av gjenopprettingen, vises det at den bare ble delvis utført (ingen suksessmelding)", async () => {
    const { state, mainId } = seedProject();
    h.snapshot = snapshotFromState(state, mainId) satisfies ScriptSnapshot;
    const o = orderedOccurrences(state, mainId)[0]!;
    const [b1, b2] = blocksOfVariant(state, o.variantId);
    let now = mustApply(state, {
      type: "EditBlockText",
      productionId: mainId as never,
      blockId: b1!.id,
      text: "Helt ny handling",
    });
    now = mustApply(now, {
      type: "EditBlockText",
      productionId: mainId as never,
      blockId: b2!.id,
      text: "Enda en ny linje",
    });
    let calls = 0;
    let release: (v: string | null) => void = () => undefined;
    // Første endring lagres; den andre avvises av serveren (resten sendes ikke)
    const onRun = () => {
      calls++;
      if (calls === 1) return { error: null, done: Promise.resolve(null) };
      return {
        error: null,
        done: new Promise<string | null>((res) => {
          if (calls === 2) release = res;
          else res("Ikke lagret fordi en tidligere endring feilet. Siste versjon er hentet.");
        }),
      };
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(VersionsDialog, {
          open: true,
          onOpenChange: () => undefined,
          projectId: "p",
          productionId: mainId,
          state: now,
          editable: true,
          saving: false,
          onGoToScene: () => undefined,
          onRun,
        }),
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: /Vis/ }));
    const restore = await screen.findByRole("button", { name: /Gjør denne versjonen gjeldende/ });
    await waitFor(() => expect(restore).not.toBeDisabled());
    fireEvent.click(restore);
    await screen.findByRole("list", { name: "Dette endres i manuset" });
    fireEvent.click(screen.getByRole("button", { name: /Gjør v1 gjeldende/ }));
    expect(calls).toBeGreaterThan(1);
    // Mens serveren lagrer, vises ingen melding ennå
    expect(screen.queryByText(/Manuset er nå som v1/)).toBeNull();
    release("Noen andre endret dette samtidig. Siste versjon er hentet – prøv igjen.");
    expect(await screen.findByText(PARTIAL_RESTORE)).toBeTruthy();
    expect(screen.queryByText(/Manuset er nå som v1/)).toBeNull();
  });

  it("uten mulighet til å endre manuset vises ikke knappen", async () => {
    const { state, mainId } = seedProject();
    h.snapshot = snapshotFromState(state, mainId);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(VersionsDialog, {
          open: true,
          onOpenChange: () => undefined,
          projectId: "p",
          productionId: mainId,
          state,
          editable: false,
          saving: false,
          onGoToScene: () => undefined,
        }),
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: /Vis/ }));
    await screen.findByRole("button", { name: /Eksporter PDF/ });
    expect(screen.queryByRole("button", { name: /Gjør denne versjonen gjeldende/ })).toBeNull();
  });
});
