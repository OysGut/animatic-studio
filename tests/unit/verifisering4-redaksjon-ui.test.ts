/**
 * Verifiseringsrunde 4 (DEC-0076) – redaksjonell kontroll og lagring i grensesnittet (jsdom, Testing Library):
 * - REQ-0327: forslag fra systemet (usikker tolkning i inspektøren, kontinuitetsforslag, manusendringer mot
 *   materialet) gjør ingenting før brukeren godkjenner; godkjenningen endrer ikke manusteksten.
 * - REQ-0486: for et flagget avvik tilbys godkjenn, oppdater og angre, og hvert valg gir forventet tilstand.
 * - REQ-0522: samme blokk endret av en annen samtidig – konflikten vises (ikke stille tap), siste versjon
 *   hentes, og endringen kan gjøres på nytt.
 * - REQ-0053: originalen lastes opp uendret og registreres med kontrollsum; feiler registreringen, vises det
 *   og den kan prøves igjen uten dobbel registrering.
 *
 * Supabase og serverfunksjonene er attrapper; ingen ekte tjenester kalles.
 */
import { File as NodeFile } from "node:buffer";
import { createElement, createRef, useState } from "react";
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
import {
  applyCommand,
  blocksOfVariant,
  continuitySuggestions,
  discrepancies,
  filmClips,
  mainProduction,
  orderedOccurrences,
  scriptView,
  type Command,
  type ProjectState,
} from "@/core";
import { Inspector } from "@/app/script/Inspector";
import { ContinuityPanel } from "@/app/library/ContinuityPanel";
import { ScriptChanges } from "@/app/assembly/ScriptChanges";
import { ImportDialog } from "@/app/script/ImportDialog";
import { useCommands } from "@/app/project/use-commands";
import { projectStateKey } from "@/app/project/use-project";
import { envelope, mustApply, seedProject } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  runCommand: null as unknown as Mock<(arg: unknown) => Promise<unknown>>,
  uploads: [] as { bucket: string; path: string; bytes: Uint8Array }[],
  docs: [] as Row[],
  rpcCalls: [] as Row[],
  rpcFails: 0,
  /** Første registrering lykkes i databasen, men svaret kommer ikke fram. */
  lostAnswer: false,
}));
h.runCommand = vi.fn();

vi.mock("@/adapters/storage/commands.functions", () => ({
  runCommand: (a: unknown) => h.runCommand(a),
}));
vi.mock("@/adapters/ai/video.functions", () => ({ startVideoGeneration: vi.fn() }));
vi.mock("@/app/storylab/suggestions-data", () => ({ useStorySuggestions: () => ({ data: [] }) }));
vi.mock("@/app/ai/use-ai-jobs", () => ({
  aiJobsKey: (projectId: string) => ["ai-jobs", projectId],
  useAiJobs: () => ({ data: { jobs: [], monthCount: 0 } }),
}));
vi.mock("@/app/ai/use-project-providers", () => ({
  useProjectProviders: () => ({
    data: { providers: ["lovable"], missing: false },
    isLoading: false,
  }),
}));
vi.mock("@/app/library/asset-images", async (orig) => ({
  ...(await orig<typeof import("@/app/library/asset-images")>()),
  useImageUrls: () => ({ data: {} }),
}));
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  Link: ({ children, to, search }: { children: React.ReactNode; to: string; search?: object }) =>
    createElement("a", { href: to, "data-search": JSON.stringify(search ?? {}) }, children),
}));

/** Supabase-klienten: lagring av originalfilen, oppslag i imported_documents og registreringen (RPC). */
vi.mock("@/integrations/supabase/client", () => {
  const query = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => {
        filters.push((r) => r[k] === v);
        return q;
      },
      limit: () => q,
      order: () => q,
      rows: () =>
        (table === "imported_documents" ? h.docs : []).filter((r) => filters.every((f) => f(r))),
      maybeSingle: () => Promise.resolve({ data: q.rows()[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: q.rows(), error: null }).then(ok),
    };
    return q;
  };
  return {
    supabase: {
      from: query,
      rpc: async (fn: string, args: Row) => {
        h.rpcCalls.push({ fn, ...args });
        if (h.lostAnswer) {
          h.lostAnswer = false;
          h.docs.push({
            project_id: args["p_project"],
            sha256: args["p_sha256"],
            change_id: args["p_change_id"],
          });
          return { data: null, error: { message: "Tidsavbrudd" } };
        }
        if (h.rpcFails > 0) {
          h.rpcFails--;
          return { data: null, error: { message: "Nettverksfeil" } };
        }
        h.docs.push({
          project_id: args["p_project"],
          sha256: args["p_sha256"],
          change_id: args["p_change_id"],
        });
        return { data: "dok-1", error: null };
      },
      storage: {
        from: (bucket: string) => ({
          upload: async (path: string, blob: Blob) => {
            // jsdom sin Blob har ikke arrayBuffer(): les med FileReader
            const buf = await new Promise<ArrayBuffer>((ok) => {
              const fr = new FileReader();
              fr.onload = () => ok(fr.result as ArrayBuffer);
              fr.readAsArrayBuffer(blob);
            });
            h.uploads.push({ bucket, path, bytes: new Uint8Array(buf) });
            return { data: { path }, error: null };
          },
        }),
      },
      auth: { getSession: async () => ({ data: { session: null } }) },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => undefined,
    },
  };
});

beforeEach(() => {
  h.runCommand.mockReset();
  h.uploads = [];
  h.docs = [];
  h.rpcCalls = [];
  h.rpcFails = 0;
  h.lostAnswer = false;
});
afterEach(() => cleanup());

/** Kommandoer kjøres i kjernen mot en tilstand testen kan lese etterpå. */
function runner(initial: ProjectState) {
  const ran: Command[] = [];
  let state = initial;
  const run = (c: Command): string | null => {
    ran.push(c);
    const r = applyCommand(state, envelope(c));
    if (!r.ok) return r.error.message;
    state = r.state;
    return null;
  };
  return { ran, run, state: () => state };
}

const textOf = (s: ProjectState) =>
  JSON.stringify(Object.values(s.blocks).map((b) => [b.id, b.text, b.kind, b.removed]));

// ---------------------------------------------------------------- REQ-0327

describe("REQ-0327 – forslag påvirker ikke manuset før brukeren godkjenner", () => {
  it("REQ-0327: usikker tolkning ved import – inspektøren viser den; bare «Tolkningen er riktig» fjerner merket, teksten er uendret", () => {
    const seed = seedProject(2);
    const view = scriptView(seed.state, seed.mainId);
    const block = view[0]!.blocks.find((b) => b.kind === "character")!;
    const s = mustApply(seed.state, {
      type: "SetUncertainty",
      productionId: seed.mainId as never,
      targetId: block.id,
      uncertainty: "Kan være en handlingslinje i store bokstaver.",
    });
    const r = runner(s);
    render(
      createElement(Inspector, {
        projectId: s.project.id,
        state: s,
        productionId: seed.mainId,
        selection: { occurrenceId: view[0]!.occurrenceId, blockId: block.id },
        editable: true,
        startPages: {},
        textRef: createRef<HTMLTextAreaElement>(),
        run: r.run,
        onSelect: () => undefined,
        onNextUncertain: () => undefined,
        uncertainCount: 1,
        structureEditing: false,
        authorName: "Mars",
        focusNote: null,
      }),
    );
    expect(screen.getByText(/Usikker tolkning:/)).toBeInTheDocument();
    expect(r.ran).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /Tolkningen er riktig/ }));
    expect(r.ran.map((c) => c.type)).toEqual(["SetUncertainty"]);
    expect(r.state().blocks[block.id]!.uncertainty).toBe(null);
    expect(textOf(r.state())).toBe(textOf(s));
  });

  it("REQ-0327: kontinuitetsforslag – ingenting lagres før brukeren godkjenner eller avviser; manuset endres aldri", () => {
    const s = fixture.state;
    const maja = Object.values(s.assets).find((a) => a.name === "Maja")!;
    const suggestions = continuitySuggestions(s, maja.id);
    expect(suggestions.length).toBeGreaterThan(0);
    const r = runner(s);
    const cmds = {
      run: r.run,
      runAndWait: async (c: Command) => ({ error: r.run(c), commandId: "x" }),
    };
    render(
      createElement(ContinuityPanel, {
        state: s,
        asset: maja,
        editable: true,
        cmds: cmds as never,
        onGoToScene: () => undefined,
      }),
    );
    expect(screen.getByText(/Ingenting brukes før du\s+godkjenner/)).toBeInTheDocument();
    expect(r.ran).toEqual([]);
    // «Godkjenn …» åpner bare skjemaet; først «Lagre hendelsen» lagrer
    fireEvent.click(screen.getAllByRole("button", { name: /Godkjenn …/ })[0]!);
    expect(r.ran).toEqual([]);
    const form = screen.getByRole("form", { name: "Ny kontinuitetshendelse" });
    fireEvent.click(within(form).getByRole("button", { name: /Lagre hendelsen/ }));
    expect(r.ran.map((c) => c.type)).toEqual(["AddContinuityEvents"]);
    const added = (r.ran[0] as Extract<Command, { type: "AddContinuityEvents" }>).events[0]!;
    expect(added.fields.status).toBe("approved");
    expect(added.fields.blockId).toBe(suggestions[0]!.blockId);
    // Manusteksten er uendret
    expect(textOf(r.state())).toBe(textOf(s));
  });

  it("REQ-0327: et avvist kontinuitetsforslag lagres som avvist og endrer heller ikke manuset", () => {
    const s = fixture.state;
    const maja = Object.values(s.assets).find((a) => a.name === "Maja")!;
    const r = runner(s);
    render(
      createElement(ContinuityPanel, {
        state: s,
        asset: maja,
        editable: true,
        cmds: { run: r.run } as never,
        onGoToScene: () => undefined,
      }),
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Avvis/ })[0]!);
    expect(r.ran.map((c) => c.type)).toEqual(["AddContinuityEvents"]);
    expect(
      (r.ran[0] as Extract<Command, { type: "AddContinuityEvents" }>).events[0]!.fields.status,
    ).toBe("dismissed");
    expect(textOf(r.state())).toBe(textOf(s));
  });
});

// ---------------------------------------------------------------- REQ-0486 (og REQ-0327)

function changedScene() {
  const s = fixture.state;
  const main = mainProduction(s)!;
  const found = discrepancies(s, filmClips(s, main.id));
  const d = found.find((x) => x.material.kind === "composition")!;
  expect(d).toBeDefined();
  const occurrenceId = d.occurrenceId;
  return { s, main, occurrenceId, found: found.filter((x) => x.occurrenceId === occurrenceId) };
}

function renderChanges(
  s: ProjectState,
  occurrenceId: string,
  found: ReturnType<typeof changedScene>["found"],
) {
  const r = runner(s);
  render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(ScriptChanges, {
        state: s,
        projectId: s.project.id,
        occurrenceId,
        found,
        editable: true,
        run: r.run,
      }),
    ),
  );
  return r;
}

const flagged = (s: ProjectState, occurrenceId: string) => {
  const o = s.occurrences[occurrenceId]!;
  return discrepancies(s, filmClips(s, o.productionId)).filter(
    (d) => d.occurrenceId === occurrenceId,
  );
};

describe("REQ-0486 – godkjenne avvik, oppdatere materialet eller angre manusendringen", () => {
  it("REQ-0486 REQ-0327: avviket vises med gammel og ny tekst og tre valg; ingenting skjer før brukeren velger", () => {
    const { s, occurrenceId, found } = changedScene();
    const r = renderChanges(s, occurrenceId, found);
    const region = screen.getByRole("region", { name: "Manuset er endret etter materialet" });
    expect(region.textContent).toMatch(/ingenting endres automatisk/);
    const change = found[0]!.changes[0]!;
    expect(region.textContent).toContain(change.oldText!);
    expect(within(region).getByRole("button", { name: /^Godkjenn$/ })).toBeInTheDocument();
    expect(
      within(region).getByRole("link", { name: /Oppdater i sceneeditoren/ }),
    ).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: /Angre manusendringene/ })).toBeEnabled();
    expect(r.ran).toEqual([]);
  });

  it("REQ-0486: «Godkjenn» – materialet godkjennes mot manuset slik det er nå; manuset og 2D-scenen er uendret", () => {
    const { s, occurrenceId, found } = changedScene();
    const r = renderChanges(s, occurrenceId, found);
    fireEvent.click(screen.getByRole("button", { name: /^Godkjenn$/ }));
    expect(r.ran.map((c) => c.type)).toEqual(["AcceptScriptChanges"]);
    expect(flagged(r.state(), occurrenceId)).toEqual([]);
    expect(textOf(r.state())).toBe(textOf(s));
    // 2D-scenen (lagene) er uendret; bare godkjenningen er registrert
    expect(r.state().layers).toEqual(s.layers);
  });

  it("REQ-0486: «Oppdater» – lenken åpner sceneeditoren for scenen; avviket står til materialet er oppdatert og godkjent", () => {
    const { s, occurrenceId, found } = changedScene();
    const r = renderChanges(s, occurrenceId, found);
    const link = screen.getByRole("link", { name: /Oppdater i sceneeditoren/ });
    expect(link.getAttribute("href")).toBe("/prosjekt/$projectId/scene");
    expect(JSON.parse(link.getAttribute("data-search")!)).toEqual({ scene: occurrenceId });
    expect(r.ran).toEqual([]);
    expect(flagged(r.state(), occurrenceId).length).toBe(found.length);
  });

  it("REQ-0486: «Angre manusendringene» – bekreftes først; linjene settes tilbake og avviket forsvinner", () => {
    const { s, occurrenceId, found } = changedScene();
    const r = renderChanges(s, occurrenceId, found);
    fireEvent.click(screen.getByRole("button", { name: /Angre manusendringene/ }));
    expect(r.ran).toEqual([]);
    const confirm = screen.getByRole("alertdialog", { name: "Bekreft angring" });
    fireEvent.click(within(confirm).getByRole("button", { name: /Ja, angre manusendringene/ }));
    expect(r.ran.length).toBeGreaterThan(0);
    expect(
      r.ran.every(
        (c) =>
          ["EditBlockText", "InsertBlocks", "RemoveBlock", "RestoreBlock"].includes(c.type) ||
          c.type.includes("Block"),
      ),
    ).toBe(true);
    for (const c of found[0]!.changes)
      if (c.kind === "changed") expect(r.state().blocks[c.blockId]!.text).toBe(c.oldText);
    expect(flagged(r.state(), occurrenceId)).toEqual([]);
    // Materialet er uendret
    expect(r.state().compositions).toEqual(s.compositions);
  });
});

// ---------------------------------------------------------------- REQ-0522

describe("REQ-0522 – samtidig redigering av samme blokk: konflikten vises og kan løses", () => {
  it("REQ-0522: serveren avviser endringen (revisjonskonflikt) – brukeren får beskjed, siste versjon hentes, og ny endring lagres", async () => {
    const seed = seedProject(2);
    const s = seed.state;
    const block = scriptView(s, seed.mainId)[0]!.blocks.find((b) => b.kind === "dialogue")!;
    const qc = new QueryClient();
    qc.setQueryData(projectStateKey(s.project.id), s);
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    h.runCommand.mockResolvedValueOnce({
      ok: false,
      code: "revision_conflict",
      message: `Blokken ${block.id} er endret av en annen`,
    });
    const { result } = renderHook(
      () => useCommands(s.project.id, "00000000-0000-7000-8000-a11ce0000001", true),
      {
        wrapper: ({ children }) => createElement(QueryClientProvider, { client: qc }, children),
      },
    );
    let err: string | null = "";
    act(() => {
      err = result.current.run(
        {
          type: "EditBlockText",
          productionId: seed.mainId as never,
          blockId: block.id,
          text: "Min tekst",
        },
        "Rediger replikk",
      );
    });
    // Lokalt godtatt med en gang …
    expect(err).toBe(null);
    // … men serveren avviste: ikke i stillhet
    await waitFor(() => expect(result.current.status.kind).toBe("error"));
    expect(result.current.status).toEqual({
      kind: "error",
      message: "Noen andre endret dette samtidig. Siste versjon er hentet – prøv igjen.",
    });
    // Den andres versjon hentes (prosjektet lastes på nytt), og den avviste endringen står ikke på angrelisten
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectStateKey(s.project.id) });
    expect(result.current.canUndo).toBe(false);
    // Sendt med revisjonene brukeren så (revisjonskontroll i backend)
    const sent = (
      h.runCommand.mock.calls[0]![0] as { data: { baseRevisions: Record<string, number> } }
    ).data;
    expect(sent.baseRevisions[block.id]).toBe(s.blocks[block.id]!.revision);
    // Løsning: brukeren gjør endringen på nytt mot siste versjon, og den lagres
    qc.setQueryData(projectStateKey(s.project.id), s);
    h.runCommand.mockResolvedValueOnce({ ok: true, inverse: null });
    act(() => {
      result.current.clearError();
      result.current.run(
        {
          type: "EditBlockText",
          productionId: seed.mainId as never,
          blockId: block.id,
          text: "Min tekst igjen",
        },
        "Rediger replikk",
      );
    });
    await waitFor(() => expect(result.current.status.kind).toBe("idle"));
    expect(result.current.canUndo).toBe(true);
    expect(
      qc.getQueryData<ProjectState>(projectStateKey(s.project.id))!.blocks[block.id]!.text,
    ).toBe("Min tekst igjen");
  });
});

// ---------------------------------------------------------------- REQ-0053

function ImportHarness({ initial, ran }: { initial: ProjectState; ran: Command[] }) {
  const [state, setState] = useState(initial);
  const main = mainProduction(state)!;
  return createElement(ImportDialog, {
    open: true,
    onOpenChange: () => undefined,
    projectId: state.project.id,
    productionId: main.id,
    state,
    authorName: "Mars",
    runAndWait: async (c: Command) => {
      ran.push(c);
      const r = applyCommand(state, envelope(c));
      if (!r.ok) return { error: r.error.message, commandId: null };
      setState(r.state);
      return { error: null, commandId: "00000000-0000-7000-8000-00000000c0de" };
    },
  });
}

const FOUNTAIN =
  "Title: Prøve\n\nINT. STUE - DAG #1#\n\nMaja kommer inn.\n\nMAJA\nHei, æøå!\n\nEXT. TUNET - KVELD #2#\n\nDet snør.\n";

async function importFountain() {
  const { state } = seedProject(0);
  const ran: Command[] = [];
  render(createElement(ImportHarness, { initial: state, ran }));
  const bytes = new TextEncoder().encode(FOUNTAIN);
  fireEvent.change(screen.getByLabelText("Velg manusfil"), {
    // Nodes File (jsdom sin mangler arrayBuffer)
    target: { files: [new NodeFile([bytes.slice()], "prove.fountain", { type: "text/plain" })] },
  });
  fireEvent.click(await screen.findByRole("button", { name: /^Importer \d+ scener$/ }));
  await screen.findByText(/scener er importert/, undefined, { timeout: 5000 });
  return { state, ran, bytes };
}

async function sha256(b: Uint8Array) {
  const d = await crypto.subtle.digest("SHA-256", b.slice().buffer);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

describe("REQ-0053 – originaldokumentet bevares uendret med kontrollsum", () => {
  it("REQ-0053: originalen lastes opp byte-identisk og registreres med kontrollsummen av de samme bytene", async () => {
    const { bytes, ran } = await importFountain();
    expect(ran.map((c) => c.type)).toContain("ImportScreenplay");
    expect(h.uploads).toHaveLength(1);
    expect(h.uploads[0]!.bucket).toBe("sources");
    expect(Buffer.from(h.uploads[0]!.bytes).equals(Buffer.from(bytes))).toBe(true);
    expect(h.rpcCalls).toHaveLength(1);
    expect(h.rpcCalls[0]).toMatchObject({
      fn: "register_imported_document",
      p_sha256: await sha256(bytes),
      p_byte_size: bytes.byteLength,
      p_storage_key: h.uploads[0]!.path,
      p_format: "fountain",
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("REQ-0053: feiler registreringen, sies det; «Prøv registreringen igjen» registrerer samme fil og kontrollsum", async () => {
    h.rpcFails = 1;
    const { bytes } = await importFountain();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/ble ikke registrert med kontrollsum \(Nettverksfeil\)/);
    expect(alert.textContent).toMatch(/Ikke importer på nytt/);
    fireEvent.click(within(alert).getByRole("button", { name: /Prøv registreringen igjen/ }));
    await screen.findByText("Originalen er registrert med kontrollsum.");
    expect(h.rpcCalls).toHaveLength(2);
    expect(h.rpcCalls[1]).toEqual(h.rpcCalls[0]);
    expect(h.rpcCalls[1]!["p_sha256"]).toBe(await sha256(bytes));
    expect(h.docs).toHaveLength(1);
    // Originalen ble ikke lastet opp på nytt
    expect(h.uploads).toHaveLength(1);
  });

  it("REQ-0053: kom ikke svaret fram selv om registreringen lyktes, registreres den ikke to ganger", async () => {
    h.lostAnswer = true;
    await importFountain();
    const alert = await screen.findByRole("alert");
    fireEvent.click(within(alert).getByRole("button", { name: /Prøv registreringen igjen/ }));
    await screen.findByText("Originalen er registrert med kontrollsum.");
    expect(h.rpcCalls).toHaveLength(1);
    expect(h.docs).toHaveLength(1);
  });
});

void blocksOfVariant;
void orderedOccurrences;
