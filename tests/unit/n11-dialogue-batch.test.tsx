/** N11: akseptansetester for scene-/replikkvalg, språkjobber og eksplisitt kostnadsport. Alle tjenester er mocket. */
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { characterDialogueCoverage, estimateCostUsd, formatUsd, setLanguage } from "@/core";
import { dvBase } from "../helpers/dialogue-fixture";

const h = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn(async () => []), advance: vi.fn(async () => ({ processed: 0 })) }));
vi.mock("@/adapters/storage/dialogue-batch.functions", () => ({
  createDialogueBatch: h.create, listDialogueBatches: h.list, advanceDialogueBatch: h.advance,
  resumeDialogueBatch: vi.fn(), undoDialogueBatchJob: vi.fn(), reconfirmDialogueBatch: vi.fn(), dialogueBatchHistory: vi.fn(async () => []),
}));
vi.mock("@/adapters/ai/speech.functions", () => ({ listSpeechModels: vi.fn(async () => ({ ok: true, models: [{ modelId: "eleven_v3", languages: [{ code: "no", name: "Norwegian" }, { code: "es", name: "Spanish" }] }] })) }));
vi.mock("@/app/ai/QualityProfilePicker", () => ({ QualityProfilePicker: () => null, QualityProfileBudget: () => null,
  useQualityProfile: () => ({ choice: "none", setChoice: vi.fn(), profile: null, budgetError: null }) }));
vi.mock("@/app/account/ui-prefs", async () => { const React = await import("react"); return { useUiPref: <T,>(_key: string, fallback: T) => React.useState(fallback) }; });
vi.mock("@/app/project/use-commands", () => ({ adoptServerHistory: vi.fn(), registerServerHistoryCatchUp: vi.fn() }));
vi.mock("@/app/audio/VoiceControls", () => ({ VoiceControls: () => null }));
import { DialogueBatchPanel } from "@/app/library/DialogueBatchPanel";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
function mount(lang: "nb" | "en", drift = false) {
  setLanguage(lang);
  const { s } = dvBase();
  const asset = Object.values(s.assets).find(a => a.kind === "character" && characterDialogueCoverage(s, a.id).flatMap(x => x.lines).length >= 3);
  if (!asset) throw new Error("Fixture needs three character lines");
  const voice = { provider: "elevenlabs" as const, voiceId: "mock_voice", label: "Test voice", modelId: "eleven_v3", language: "no" };
  const coverage = characterDialogueCoverage(s, asset.id);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  h.create.mockResolvedValue({ id: "batch-n11" });
  render(<QueryClientProvider client={client}><DialogueBatchPanel state={s} asset={{ ...asset, voice }} projectId={s.project.id} editable drift={drift} /></QueryClientProvider>);
  fireEvent.click(screen.getByTestId(drift ? "dialogue-drift-open" : "dialogue-batch-open"));
  return { s, asset, coverage, lines: coverage.flatMap(x => x.lines) };
}
const checked = () => screen.getAllByTestId<HTMLInputElement>("dialogue-batch-line").map(x => x.checked);
async function approve() {
  await waitFor(() => expect(screen.getByTestId("dialogue-batch-start")).not.toBeDisabled());
  fireEvent.click(screen.getByTestId("dialogue-batch-start"));
  expect(h.create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("dialogue-batch-approve"));
  await waitFor(() => expect(h.create).toHaveBeenCalled());
}

describe.each(["nb", "en"] as const)("N11 batch – %s", lang => {
  it("REQ-0782/0815: scene og enkeltreplikk kan velges bort; bare valgte permanente ID-er sendes", async () => {
    const { lines, coverage } = mount(lang);
    fireEvent.click(screen.getByTestId("dialogue-batch-all"));
    expect(checked().every(Boolean)).toBe(true);
    const inputs = screen.getAllByTestId("dialogue-batch-line");
    const first = inputs[0];
    if (!first) throw new Error("Missing first line");
    fireEvent.click(first);
    expect(checked()[0]).toBe(false);
    expect(checked().slice(1).every(Boolean)).toBe(true);
    const scenes = screen.getAllByTestId("dialogue-batch-scene");
    const secondScene = scenes[1];
    if (!secondScene) throw new Error("Fixture needs two scenes");
    fireEvent.click(secondScene);
    const selected = checked().flatMap((yes, i) => yes ? [lines[i]?.key] : []);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected).not.toContain(lines[0]?.key);
    for (const line of coverage[1]?.lines ?? []) expect(selected).not.toContain(line.key);
    fireEvent.click(screen.getByTestId("dialogue-batch-together"));
    await approve();
    expect(h.create.mock.calls[0]?.[0].data.lines.map((l: { key: string }) => l.key)).toEqual(selected);
    expect(h.create.mock.calls[0]?.[0].data.approved).toBe(true);
  });

  it("REQ-0798/0816: samlet valg og kostnad er synlige før godkjenning; generering starter ikke på egen hånd", async () => {
    const { lines } = mount(lang);
    fireEvent.click(screen.getByTestId("dialogue-batch-all"));
    fireEvent.click(screen.getByTestId("dialogue-batch-together"));
    expect(screen.getByTestId("dialogue-batch-together")).toBeChecked();
    expect(screen.getByTestId("dialogue-batch-warning")).toBeVisible();
    const cost = estimateCostUsd("elevenlabs", "eleven_v3", { characters: lines.reduce((n,l) => n + l.text.replace(/\s+/g, " ").trim().length, 0) });
    if (cost === null) throw new Error("Missing fixed price");
    expect(screen.getByTestId("dialogue-batch-estimate")).toHaveTextContent(formatUsd(cost));
    expect(screen.getAllByTestId("dialogue-batch-language-name")[0]).toBeVisible();
    expect(h.create).not.toHaveBeenCalled();
    await approve();
    expect(h.create.mock.calls[0]?.[0].data.voice.language).toBe("no");
  });

  it("REQ-0800: valgte replikker fordeles i språkjobber med egen pris og sendes bare til sitt språk", async () => {
    const { lines } = mount(lang);
    fireEvent.click(screen.getByTestId("dialogue-batch-all"));
    const tags = screen.getAllByTestId("dialogue-batch-line-language");
    tags.forEach((input, i) => fireEvent.change(input, { target: { value: i === 0 ? "es" : "no" } }));
    const last = screen.getAllByTestId("dialogue-batch-line")[lines.length - 1];
    if (!last) throw new Error("Missing final line");
    fireEvent.click(last);
    fireEvent.click(screen.getByTestId("dialogue-batch-split"));
    expect(screen.getAllByTestId("dialogue-language-job")).toHaveLength(2);
    const estimates = screen.getAllByTestId("dialogue-batch-estimate");
    expect(estimates).toHaveLength(2);
    for (const [i, chosen] of [[0, lines.slice(0,1)], [1, lines.slice(1,-1)]] as const) {
      const cost = estimateCostUsd("elevenlabs", "eleven_v3", { characters: chosen.reduce((n,l) => n + l.text.replace(/\s+/g," ").trim().length,0) });
      if (cost === null) throw new Error("Missing price");
      expect(estimates[i]).toHaveTextContent(formatUsd(cost));
    }
    await approve();
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(2));
    const requests = h.create.mock.calls.map(([arg]) => arg.data);
    expect(requests[0].lines.map((l: {key:string}) => l.key)).toEqual([lines[0]?.key]);
    expect(requests[1].lines.map((l: {key:string}) => l.key)).toEqual(lines.slice(1,-1).map(l=>l.key));
    expect(requests.map(r => r.voice.language)).toEqual(["es", "nb"]);
  });
});