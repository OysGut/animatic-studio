/** SL4: sekvensielle bolker, samtykke, pause, stopp og hurtigbuffer (mockede tjenester). */
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyStoryProfile } from "@/core";
import { GroupConversationView } from "@/app/storylab/GroupConversationView";
import type { StorySession, StoredTurn } from "@/adapters/storylab/sessions.functions";
import { fixture } from "../visual/fixture-state";

const h = vi.hoisted(() => ({ gen: vi.fn(), append: vi.fn(), fork: vi.fn(), suggest: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/adapters/ai/text.functions", () => ({ generateText: (arg: unknown) => h.gen(arg) }));
vi.mock("@/adapters/storylab/sessions.functions", () => ({
  appendStoryTurns: (arg: unknown) => h.append(arg), forkStorySession: (arg: unknown) => h.fork(arg),
  getStorySession: vi.fn(), saveStorySuggestion: (arg: unknown) => h.suggest(arg),
}));
vi.mock("@/app/storylab/storylab-data", () => ({
  names: (s: typeof fixture.state) => Object.fromEntries(Object.values(s.assets).map((a) => [a.id, a.name])),
  sceneLabel: () => "", usd: (cost: number) => `$${cost.toFixed(2)}`,
  useTextEstimate: () => ({ usd: 0.01, label: "Test model", loading: false, error: null, builtIn: false }),
}));
vi.mock("@/app/library/AssetSymbolIcon", () => ({ AssetSymbolIcon: () => null }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);
function setup() {
  const chars = Object.values(fixture.state.assets).filter((a) => a.kind === "character");
  const a = chars[0]; const b = chars[1];
  if (!a || !b) throw new Error("two participants required");
  const session: StorySession = { id: "00000000-0000-7000-8000-000000000123", kind: "group", title: "Group", status: "active", parentSessionId: null,
    fromTurn: null, costUsd: 0, createdBy: "user", createdAt: "2026-10-18", updatedAt: "2026-10-18",
    context: { participants: [a.id, b.id], sceneId: null, situation: "", mode: "improv", seed: 42,
      profiles: JSON.parse(JSON.stringify({ [a.id]: emptyStoryProfile(), [b.id]: emptyStoryProfile() })) }, turns: [] };
  let stored: StoredTurn[] = [];
  let cost = 0;
  let status = "active";
  h.append.mockImplementation(async ({ data }: { data: { turns: StoredTurn[]; addCostUsd: number; status?: string } }) => {
    stored = [...stored, ...data.turns]; cost += data.addCostUsd;
    if (data.status) status = data.status;
    return { ok: true, turns: stored.length, costUsd: cost };
  });
  const answer = { ok: true, text: "Hello", costUsd: 0.01, usedFallback: false };
  h.gen.mockResolvedValue(answer);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["story-session", "project", session.id], { ok: true, session });
  const view = () => createElement(QueryClientProvider, { client: qc }, createElement(GroupConversationView, {
    state: fixture.state, projectId: "project", session, editable: true, onOpen: vi.fn(),
  }));
  const rendered = render(view());
  return { ...rendered, view, session, qc, answer, stored: () => stored, status: () => status };
}

it("krever bekreftelse, kjører åtte sekvensielle kall per bolk, lagrer pause og gjenåpner turene", async () => {
  const s = setup();
  fireEvent.click(screen.getByTestId("storylab-run-batch"));
  expect(h.gen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("storylab-confirm-send"));
  await waitFor(() => expect(s.status()).toBe("paused"));
  expect(h.gen).toHaveBeenCalledTimes(8);
  expect(s.stored()).toHaveLength(8);
  expect(s.qc.getQueryData(["story-session", "project", s.session.id])).toMatchObject({ ok: true, session: { costUsd: 0.08, status: "paused", turns: s.stored() } });
  fireEvent.click(screen.getByTestId("storylab-resume"));
  await waitFor(() => expect(s.stored()).toHaveLength(16));
  await waitFor(() => expect(screen.getByTestId("storylab-resume")).not.toBeDisabled());
  expect(h.gen).toHaveBeenCalledTimes(16);
  const cached = s.qc.getQueryData<{ ok: true; session: StorySession }>(["story-session", "project", s.session.id]);
  if (!cached) throw new Error("missing cached session");
  s.unmount();
  render(createElement(QueryClientProvider, { client: s.qc }, createElement(GroupConversationView, {
    state: fixture.state, projectId: "project", session: cached.session, editable: true, onOpen: vi.fn(),
  })));
  expect(screen.getAllByTestId("storylab-turn")).toHaveLength(16);
  expect(h.gen).toHaveBeenCalledTimes(16);
});

it("Pause fullfører og lagrer pågående kall, og Stopp låser inndata uten å sperre forgrening", async () => {
  const s = setup();
  let finish: ((value: typeof s.answer) => void) | undefined;
  h.gen.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  fireEvent.click(screen.getByTestId("storylab-run-batch"));
  fireEvent.click(screen.getByTestId("storylab-confirm-send"));
  await waitFor(() => expect(h.gen).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByTestId("storylab-pause"));
  expect(s.stored()).toHaveLength(0);
  if (!finish) throw new Error("missing pending generation");
  finish(s.answer);
  await waitFor(() => expect(s.status()).toBe("paused"));
  expect(s.stored()).toHaveLength(1);
  expect(h.gen).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("storylab-input")).not.toBeDisabled();
  fireEvent.click(screen.getByTestId("storylab-stop"));
  await waitFor(() => expect(screen.getByTestId("storylab-input")).toBeDisabled());
  expect(s.status()).toBe("stopped");
  expect(screen.getByTestId("storylab-fork")).not.toBeDisabled();
});

it("Stopp under et kall lagrer svaret og stopped før det tillates nye turer", async () => {
  const s = setup();
  let finish: ((value: typeof s.answer) => void) | undefined;
  h.gen.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  fireEvent.click(screen.getByTestId("storylab-run-batch"));
  fireEvent.click(screen.getByTestId("storylab-confirm-send"));
  await waitFor(() => expect(h.gen).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByTestId("storylab-stop"));
  if (!finish) throw new Error("missing pending generation");
  finish(s.answer);
  await waitFor(() => expect(s.status()).toBe("stopped"));
  expect(s.stored()).toHaveLength(1);
  expect(h.gen).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("storylab-run-batch")).toBeDisabled();
});

it("Stopp lagres også når pågående generering feiler", async () => {
  const s = setup();
  let finish: ((value: unknown) => void) | undefined;
  h.gen.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  fireEvent.click(screen.getByTestId("storylab-run-batch"));
  fireEvent.click(screen.getByTestId("storylab-confirm-send"));
  await waitFor(() => expect(h.gen).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByTestId("storylab-stop"));
  if (!finish) throw new Error("missing pending generation");
  finish({ ok: false, message: "Feil fra tjenesten" });
  await waitFor(() => expect(s.status()).toBe("stopped"));
  expect(s.stored()).toHaveLength(0);
  expect(screen.getByTestId("storylab-input")).toBeDisabled();
});

it("mislykket lagring prøves igjen uten et nytt betalt AI-kall", async () => {
  const s = setup();
  h.append.mockImplementationOnce(async () => ({ ok: true, turns: 0, costUsd: 0 }));
  h.append.mockImplementationOnce(async () => ({ ok: false, message: "Lagring feilet" }));
  fireEvent.click(screen.getByTestId("storylab-run-batch"));
  fireEvent.click(screen.getByTestId("storylab-confirm-send"));
  await waitFor(() => expect(screen.getByTestId("storylab-retry")).not.toBeDisabled());
  expect(h.gen).toHaveBeenCalledTimes(1);
  expect(s.stored()).toHaveLength(0);
  fireEvent.click(screen.getByTestId("storylab-retry"));
  await waitFor(() => expect(s.stored()).toHaveLength(1));
  expect(h.gen).toHaveBeenCalledTimes(1);
});