/**
 * Verifiseringsrunde 4 (DEC-0076) i AI-flatene (jsdom, React Testing Library):
 * - REQ-0280/REQ-0491: kostnadsanslaget i bekreftelsene (video for én scene og flere scener, «Oppdater med
 *   AI», bilde og lyd) viser modell, innsatsnivå, oppløsning, antall, lengde, ekstrarunder og samlet anslag,
 *   og ingenting sendes før brukeren har bekreftet.
 * - REQ-0489: beskrivelsene vises og kan endres før sending i «Oppdater med AI»; samme forespørsel kan sendes
 *   til to leverandører (Google og Runway) fra «Generer scene».
 * - REQ-0559: dobbeltklikk-dialogen for et lag – velg et annet bilde (brukes med én gang), last opp et nytt
 *   (ny versjon i biblioteket, brukes på laget) eller generer med AI (bare etter bekreftelse).
 * - REQ-0029/REQ-0592: oppfølgingen av jobber i nettleseren sender bare det brukeren har lagt i kø og henter
 *   resultater; den starter aldri en ny generering.
 *
 * Serverfunksjonene er attrapper som registrerer kallene; ingen ekte tjeneste kalles.
 */
import { createElement, useState } from "react";
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
  filmClips,
  keysEvenly,
  orderedOccurrences,
  providerModel,
  type Command,
  type GenerationJob,
  type ProjectState,
  type TakeMedia,
} from "@/core";
import { GenerateSceneDialog } from "@/app/assembly/GenerateSceneDialog";
import { BatchVideoDialog } from "@/app/assembly/BatchVideoDialog";
import { AiUpdateSection } from "@/app/assembly/AiUpdateSection";
import { GenerateImagePanel } from "@/app/library/GenerateImagePanel";
import { GenerateSoundPanel } from "@/app/library/GenerateSoundPanel";
import { LayerImageDialog } from "@/app/scene-editor/LayerImageDialog";
import { useVideoPolling } from "@/app/ai/video-jobs";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

type Fn = Mock<(arg: unknown) => Promise<unknown>>;
const h = vi.hoisted(() => ({
  providers: ["lovable"] as string[],
  jobs: [] as unknown[],
  start: null as unknown as Fn,
  poll: null as unknown as Fn,
  pump: null as unknown as Fn,
  image: null as unknown as Fn,
  write: null as unknown as Fn,
  sound: null as unknown as Fn,
  speech: null as unknown as Fn,
  upload: null as unknown as Fn,
}));
h.start = vi.fn(async () => ({ ok: true, jobId: "j", costUsd: 1 }));
h.poll = vi.fn(async () => ({ state: "running" }));
h.pump = vi.fn(async () => ({ sent: 0 }));
h.image = vi.fn();
h.write = vi.fn();
h.sound = vi.fn();
h.speech = vi.fn();
h.upload = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/adapters/ai/video.functions", () => ({
  startVideoGeneration: (a: unknown) => h.start(a),
  pollVideoJob: (a: unknown) => h.poll(a),
}));
vi.mock("@/adapters/ai/queue.functions", () => ({
  pumpProjectQueue: (a: unknown) => h.pump(a),
  updateQueuedJob: vi.fn(),
}));
vi.mock("@/adapters/ai/generate-image.functions", () => ({
  generateImage: (a: unknown) => h.image(a),
}));
vi.mock("@/adapters/ai/write-prompt.functions", () => ({
  writeImagePrompt: (a: unknown) => h.write(a),
}));
vi.mock("@/adapters/ai/sound.functions", () => ({ generateSound: (a: unknown) => h.sound(a) }));
vi.mock("@/adapters/ai/speech.functions", () => ({
  generateSpeech: (a: unknown) => h.speech(a),
  listVoices: vi.fn(),
}));
vi.mock("@/app/ai/use-ai-jobs", () => ({
  aiJobsKey: (projectId: string) => ["ai-jobs", projectId],
  useAiJobs: () => ({ data: { jobs: h.jobs, monthCount: 0 } }),
}));
vi.mock("@/app/ai/use-project-providers", () => ({
  useProjectProviders: () => ({
    data: { providers: h.providers, missing: false },
    isLoading: false,
  }),
}));
vi.mock("@/app/shell/use-schema", () => ({ useSchemaAtLeast: () => true }));
vi.mock("@/app/library/asset-images", async (orig) => ({
  ...(await orig<typeof import("@/app/library/asset-images")>()),
  useImageUrls: (paths: readonly string[]) => ({
    data: Object.fromEntries(paths.map((p) => [p, `blob:${p}`])),
  }),
  signedUrls: async () => ({}),
  uploadAssetImage: (...a: unknown[]) => h.upload(a),
}));
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    createElement("a", { href: to }, children),
}));

const STARTERS = () => [h.start, h.image, h.write, h.sound, h.speech];

beforeEach(() => {
  h.providers = ["lovable"];
  h.jobs = [];
  for (const f of [...STARTERS(), h.poll, h.pump, h.upload]) f.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

// ---------------------------------------------------------------- hjelpere

function Harness({
  initial,
  ran,
  children,
}: {
  initial: ProjectState;
  ran: Command[];
  children: (s: ProjectState, cmds: never) => React.ReactNode;
}) {
  const [state, setState] = useState(initial);
  const apply = (command: Command): string | null => {
    ran.push(command);
    let err: string | null = null;
    setState((cur) => {
      const r = applyCommand(cur, envelope(command));
      if (!r.ok) {
        err = r.error.message;
        return cur;
      }
      return r.state;
    });
    return err;
  };
  const cmds = {
    run: (c: Command) => apply(c),
    runAndWait: async (c: Command) => {
      const e = apply(c);
      return e ? { error: e, commandId: null } : { error: null, commandId: "x" };
    },
    current: () => state,
  };
  return createElement("div", null, children(state, cmds as never));
}

function renderWith(initial: ProjectState, ui: (s: ProjectState, cmds: never) => React.ReactNode) {
  const ran: Command[] = [];
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(Harness, { initial, ran, children: ui }),
    ),
  );
  return ran;
}

/** Linjene i kostnadsanslaget i en bekreftelse (CostLines). */
function costLines(confirm: HTMLElement): Record<string, string> {
  const dl = confirm.querySelector('dl[aria-label="Kostnadsanslag"]');
  expect(dl).not.toBeNull();
  const out: Record<string, string> = {};
  const dts = [...dl!.querySelectorAll("dt")];
  for (const dt of dts)
    out[dt.textContent!.trim()] = (dt.nextElementSibling?.textContent ?? "").trim();
  return out;
}

/** De sju elementene (REQ-0280); oppløsning bare når katalogen har den, lengde for video og lyd. */
function expectSeven(
  lines: Record<string, string>,
  o: { provider: string; model: string; count: RegExp; length: boolean },
) {
  const m = providerModel(o.provider, o.model)!;
  expect(m).toBeDefined();
  expect(lines["Modell"]).toContain(m.label);
  expect(lines["Innsatsnivå"]).toMatch(/\S/);
  if (m.resolution) expect(lines["Oppløsning"]).toBe(m.resolution);
  expect(lines["Antall"]).toMatch(o.count);
  if (o.length) expect(lines["Lengde"]).toMatch(/\d+(,\d)? s/);
  expect(lines["Ekstrarunder"]).toMatch(/ingen automatiske/);
  expect(lines["Samlet anslag"]).toMatch(/\$\d/);
  const expected = [
    "Modell",
    "Innsatsnivå",
    ...(m.resolution ? ["Oppløsning"] : []),
    "Antall",
    ...(o.length ? ["Lengde"] : []),
    "Ekstrarunder",
    "Samlet anslag",
  ];
  expect(Object.keys(lines)).toEqual(expected);
}

const nothingSent = () => {
  for (const f of STARTERS()) expect(f).not.toHaveBeenCalled();
};

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

/** En scene delt i to segmenter med hver sin AI-video (avviker når manuset endres). */
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

function sceneDialog(s: ProjectState, productionId: string, occurrenceId: string) {
  return renderWith(s, (state, cmds) => {
    const clip = filmClips(state, productionId).find((c) => c.occurrenceId === occurrenceId)!;
    return createElement(GenerateSceneDialog, {
      open: true,
      onOpenChange: () => undefined,
      state,
      productionId,
      clip,
      editable: true,
      cmds,
    });
  });
}

const startData = () =>
  h.start.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);

// ---------------------------------------------------------------- REQ-0280 / REQ-0491

describe("REQ-0280 REQ-0491 – kostnadsanslaget i bekreftelsene", () => {
  it("REQ-0280 REQ-0491: video for én scene (Generer scene) – sju elementer, ingenting sendt før «Ja, generer»", async () => {
    h.providers = ["lovable", "google"];
    const seed = seedProject(3);
    const occ = orderedOccurrences(seed.state, seed.mainId)[1]!.id as string;
    sceneDialog(seed.state, seed.mainId, occ);
    // Inndelingen lagres først (en egen beskrivelse), som i dialogen
    const box = screen.getByRole("textbox", { name: /Beskrivelse for (scenen|segment 1)/ });
    fireEvent.change(box, { target: { value: `${(box as HTMLTextAreaElement).value} x` } });
    fireEvent.click(screen.getByRole("button", { name: "Lagre egen beskrivelse" }));
    await screen.findByText("Egen beskrivelse");
    fireEvent.change(screen.getByRole("combobox", { name: "Kandidater per segment" }), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^(Generer|Lag ny)$/ }));
    const confirm = screen.getByRole("alertdialog", { name: "Bekreft videogenerering" });
    const lines = costLines(confirm);
    expectSeven(lines, {
      provider: "google",
      model: "veo-3.1-generate-preview",
      count: /2 genereringer \(2 kandidater\)/,
      length: true,
    });
    nothingSent();
    fireEvent.click(within(confirm).getByRole("button", { name: /Ja, generer/ }));
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(2));
    for (const d of startData()) expect(d).toMatchObject({ approved: true, provider: "google" });
  });

  it("REQ-0280 REQ-0491: video for flere scener – samlet antall segmenter, lengde og anslag før køen", async () => {
    h.providers = ["lovable", "google"];
    const seed = seedProject(4);
    renderWith(seed.state, (state, cmds) =>
      createElement(BatchVideoDialog, {
        open: true,
        onOpenChange: () => undefined,
        state,
        productionId: seed.mainId,
        cmds,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Velg alle uten video" }));
    fireEvent.click(screen.getByRole("button", { name: /^Lag video \(/ }));
    const confirm = screen.getByRole("alertdialog", { name: "Bekreft videogenerering" });
    expectSeven(costLines(confirm), {
      provider: "google",
      model: "veo-3.1-generate-preview",
      count: /\d+ genereringer \(\d+ segmenter\)/,
      length: true,
    });
    nothingSent();
  });

  it("REQ-0280 REQ-0491: «Oppdater med AI» – sju elementer for de berørte segmentene", () => {
    h.providers = ["lovable", "runway"];
    const { s, occ, takeIds } = sceneWithVideos();
    renderUpdate(s, occ, takeIds);
    fireEvent.click(screen.getByRole("button", { name: /Oppdater med AI/ }));
    const confirm = screen.getByRole("alertdialog", { name: "Bekreft ny video" });
    expectSeven(costLines(confirm), {
      provider: "runway",
      model: "gen4_turbo",
      count: /2 genereringer \(2 segmenter\)/,
      length: true,
    });
    nothingSent();
  });

  it("REQ-0280 REQ-0491: bilde med tilkoblet leverandør – modell, innsatsnivå, oppløsning, antall og anslag", async () => {
    h.providers = ["lovable", "openai"];
    const { state } = seedProject(1);
    const assetId = tid<"asset">();
    const s = mustApply(state, {
      type: "CreateAssets",
      assets: [
        {
          assetId,
          fields: {
            kind: "character",
            name: "Maja",
            names: [],
            description: "Ti år",
            category: "",
            tags: [],
          },
        },
      ],
    });
    render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(GenerateImagePanel, {
          projectId: s.project.id,
          filmTitle: "Prøve",
          asset: s.assets[assetId]!,
          variant: null,
          reference: null,
          editable: true,
          disabled: false,
          onGenerated: async () => null,
        }),
      ),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Leverandør og modell" }), {
      target: { value: "openai|gpt-image-2.5-flare" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Antall kandidater" }), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Generer …$/ }));
    const confirm = screen.getByRole("alertdialog", { name: "Bekreft generering" });
    expectSeven(costLines(confirm), {
      provider: "openai",
      model: "gpt-image-2.5-flare",
      count: /3 genereringer \(3 kandidater\)/,
      length: false,
    });
    nothingSent();
  });

  it("REQ-0280: bilde med innebygd Lovable AI – bekreftelsen viser modell, innsatsnivå, oppløsning, antall, ekstrarunder og anslag", () => {
    h.providers = ["lovable"];
    const { state } = seedProject(1);
    const assetId = tid<"asset">();
    const s = mustApply(state, {
      type: "CreateAssets",
      assets: [
        {
          assetId,
          fields: {
            kind: "character",
            name: "Maja",
            names: [],
            description: "",
            category: "",
            tags: [],
          },
        },
      ],
    });
    render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(GenerateImagePanel, {
          projectId: s.project.id,
          filmTitle: "Prøve",
          asset: s.assets[assetId]!,
          variant: null,
          reference: null,
          editable: true,
          disabled: false,
          budget: { aiMonthLimit: 50, aiPricePerImage: 2 },
          onGenerated: async () => null,
        }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Generer …$/ }));
    const lines = costLines(screen.getByRole("alertdialog", { name: "Bekreft generering" }));
    // Rettet i DEC-0076: modellen serveren velger (frilagt figur) vises med nivå og oppløsning
    expect(Object.keys(lines)).toEqual([
      "Modell",
      "Innsatsnivå",
      "Oppløsning",
      "Antall",
      "Ekstrarunder",
      "Samlet anslag",
    ]);
    expect(lines["Modell"]).toMatch(/Sunburst|2\.5/i);
    expect(lines["Samlet anslag"]).toMatch(/kreditt/);
    nothingSent();
  });

  it("REQ-0280 REQ-0491: lyd – modell, innsatsnivå, antall, lengde (ikke valgt: regnet med lengste) og anslag", async () => {
    h.providers = ["lovable", "elevenlabs"];
    const { state } = seedProject(1);
    const assetId = tid<"asset">();
    const variantId = tid<"asset_variant">();
    let s = mustApply(state, {
      type: "CreateAssets",
      assets: [
        {
          assetId,
          fields: {
            kind: "sound",
            name: "Vind",
            names: [],
            description: "",
            category: "",
            tags: [],
          },
        },
      ],
    });
    s = mustApply(s, {
      type: "CreateAssetVariant",
      variantId,
      assetId,
      fields: { name: "Ute", style: "other", appearance: "" },
    });
    renderWith(s, (state2, cmds) =>
      createElement(GenerateSoundPanel, {
        projectId: state2.project.id,
        asset: state2.assets[assetId]!,
        variant: state2.assetVariants[variantId]!,
        cmds,
        onClose: () => undefined,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Lag lyd …$/ }));
    const lines = costLines(screen.getByRole("alertdialog", { name: "Bekreft generering" }));
    expectSeven(lines, {
      provider: "elevenlabs",
      model: "eleven_text_to_sound_v2",
      count: /^1 generering$/,
      length: true,
    });
    expect(lines["Lengde"]).toMatch(/ikke valgt – regnet med lengste/);
    // Valgt lengde vises som lengde
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Lengde på lyden" }), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Lag lyd …$/ }));
    expect(
      costLines(screen.getByRole("alertdialog", { name: "Bekreft generering" }))["Lengde"],
    ).toBe("5 s hver");
    nothingSent();
  });
});

// ---------------------------------------------------------------- REQ-0489

describe("REQ-0489 – modellagnostisk AI med synlige og redigerbare beskrivelser", () => {
  it("REQ-0489: «Oppdater med AI» – beskrivelsen per segment kan endres før sending, og det endrede sendes", async () => {
    h.providers = ["lovable", "runway"];
    const { s, occ, takeIds } = sceneWithVideos();
    renderUpdate(s, occ, takeIds);
    fireEvent.click(screen.getByRole("button", { name: /Oppdater med AI/ }));
    const confirm = screen.getByRole("alertdialog", { name: "Bekreft ny video" });
    const box = within(confirm).getByRole("textbox", { name: /^Beskrivelse for segment 1/ });
    const original = (box as HTMLTextAreaElement).value;
    expect(original).toMatch(/Animated film shot/);
    fireEvent.change(box, { target: { value: `${original}\nEGEN ENDRING: snøfokk.` } });
    // Endringen synes i det som sendes, og kan tilbakestilles
    // (Knappen ligger i samme <label> som feltet og overtar etiketten – se VISUAL_QA_DEC-0076.md)
    expect(within(confirm).getByText("Tilbake til forslaget").tagName).toBe("BUTTON");
    nothingSent();
    fireEvent.click(within(confirm).getByRole("button", { name: /Ja, lag nye videoer/ }));
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(2));
    const [first, second] = startData();
    expect(String(first!["prompt"])).toContain("EGEN ENDRING: snøfokk.");
    expect(String(second!["prompt"])).not.toContain("EGEN ENDRING");
    expect(first!["approved"]).toBe(true);
  });

  it("REQ-0489: samme beskrivelse kan sendes til to leverandører (Google Veo og OpenAI Sora) gjennom hver sin adapter", async () => {
    h.providers = ["lovable", "google", "openai"];
    const seed = seedProject(3);
    const occ = orderedOccurrences(seed.state, seed.mainId)[1]!.id as string;
    sceneDialog(seed.state, seed.mainId, occ);
    const box = screen.getByRole("textbox", { name: /Beskrivelse for (scenen|segment 1)/ });
    fireEvent.change(box, {
      target: { value: `${(box as HTMLTextAreaElement).value}\nFELLES: lav vinkel.` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lagre egen beskrivelse" }));
    await screen.findByText("Egen beskrivelse");
    const model = screen.getByRole("combobox", { name: "Videomodell" });
    const send = async (value: string) => {
      fireEvent.change(model, { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: /^(Generer|Lag ny)$/ }));
      const confirm = screen.getByRole("alertdialog", { name: "Bekreft videogenerering" });
      // Beskrivelsen som sendes, kan leses i bekreftelsen
      expect(within(confirm).getByText(/Se det som sendes til modellen/)).toBeInTheDocument();
      fireEvent.click(within(confirm).getByRole("button", { name: /Ja, generer/ }));
    };
    await send("google|veo-3.1-generate-preview");
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(1));
    await send("openai|sora-2");
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(2));
    const [g, r] = startData();
    expect([g!["provider"], r!["provider"]]).toEqual(["google", "openai"]);
    expect([g!["model"], r!["model"]]).toEqual(["veo-3.1-generate-preview", "sora-2"]);
    for (const d of [g!, r!]) {
      expect(String(d["prompt"])).toContain("FELLES: lav vinkel.");
      expect(d["segmentId"]).toBe(g!["segmentId"]);
      expect(d["approved"]).toBe(true);
    }
  });
});

// ---------------------------------------------------------------- REQ-0559

function layerSetup() {
  const s = fixture.state;
  const layer = Object.values(s.layers).find((l) => {
    if (!l.assetId) return false;
    const variants = Object.values(s.assetVariants).filter((v) => v.assetId === l.assetId);
    return (
      Object.values(s.assetVersions).filter((v) => variants.some((x) => x.id === v.variantId))
        .length >= 2
    );
  })!;
  expect(layer).toBeDefined();
  return { s, layer };
}

function renderLayerDialog(s: ProjectState, layerId: string) {
  return renderWith(s, (state, cmds) =>
    createElement(LayerImageDialog, {
      open: true,
      onOpenChange: () => undefined,
      state,
      projectId: state.project.id,
      layer: state.layers[layerId]!,
      editable: true,
      cmds,
    }),
  );
}

describe("REQ-0559 – bildevalget for et lag: velg, last opp eller generer", () => {
  it("REQ-0559: et annet bilde av samme ressurs brukes på laget med én gang", () => {
    const { s, layer } = layerSetup();
    const ran = renderLayerDialog(s, layer.id);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(new RegExp(`Bilde for «${layer.name}»`))).toBeInTheDocument();
    // Alle varianter og versjoner av ressursen vises
    const variants = Object.values(s.assetVariants).filter((v) => v.assetId === layer.assetId);
    for (const v of variants.filter((x) => !x.archived))
      expect(within(dialog).getByRole("region", { name: `Variant ${v.name}` })).toBeInTheDocument();
    const tiles = within(dialog).getAllByRole("button", { name: /^v\d+/ });
    const target = tiles.find((t) => t.getAttribute("aria-pressed") === "false")!;
    fireEvent.click(target);
    expect(ran.map((c) => c.type)).toEqual(["UpdateLayers"]);
    const fields = (ran[0] as Extract<Command, { type: "UpdateLayers" }>).layers[0]!.fields;
    expect(fields.versionId).not.toBe(layer.versionId);
    expect(within(dialog).getAllByRole("button", { pressed: true }).length).toBeGreaterThan(0);
    nothingSent();
  });

  it("REQ-0559: et opplastet bilde blir ny versjon i biblioteket og tas i bruk på laget", async () => {
    const { s, layer } = layerSetup();
    const versionId = tid<"asset_version">();
    h.upload.mockResolvedValueOnce({
      versionId,
      media: {
        path: `${s.project.id}/${layer.assetId}/${versionId}/ny.png`,
        mimeType: "image/png",
        width: 400,
        height: 300,
        byteSize: 1234,
        sha256: "b".repeat(64),
        durationMs: null,
      },
    });
    const ran = renderLayerDialog(s, layer.id);
    const file = new File([new Uint8Array([137, 80, 78, 71])], "ny.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Velg bildefil"), { target: { files: [file] } });
    await waitFor(() => expect(ran.map((c) => c.type)).toContain("UpdateLayers"));
    expect(h.upload).toHaveBeenCalledTimes(1);
    expect((h.upload.mock.calls[0]![0] as unknown[])[2]).toBe(file);
    expect(ran.map((c) => c.type)).toEqual(["AddAssetVersion", "UpdateLayers"]);
    const add = ran[0] as Extract<Command, { type: "AddAssetVersion" }>;
    expect(add.versionId).toBe(versionId);
    const upd = ran[1] as Extract<Command, { type: "UpdateLayers" }>;
    expect(upd.layers[0]!.fields.versionId).toBe(versionId);
    nothingSent();
  });

  it("REQ-0559: AI-generering fra bildevalget sender ingenting før kostnaden er bekreftet", async () => {
    const { s, layer } = layerSetup();
    h.image.mockResolvedValueOnce({ ok: false, message: "avbrutt i testen" });
    renderLayerDialog(s, layer.id);
    const region = screen.getByRole("region", { name: "Nytt bilde" });
    fireEvent.click(within(region).getByRole("button", { name: /^Generer …$/ }));
    const confirm = within(region).getByRole("alertdialog", { name: "Bekreft generering" });
    expect(confirm.textContent).toMatch(/kreditter|belastes/);
    nothingSent();
    fireEvent.click(within(confirm).getByRole("button", { name: "Avbryt" }));
    nothingSent();
    fireEvent.click(within(region).getByRole("button", { name: /^Generer …$/ }));
    fireEvent.click(within(region).getByRole("button", { name: /Ja, generer/ }));
    await waitFor(() => expect(h.image).toHaveBeenCalledTimes(1));
    expect((h.image.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({
      approved: true,
      assetId: layer.assetId,
    });
  });
});

// ---------------------------------------------------------------- REQ-0029 / REQ-0592

const job = (over: Partial<GenerationJob>): GenerationJob => ({
  id: tid(),
  kind: "video",
  provider: "runway",
  model: "gen4_turbo",
  prompt: "p",
  assetId: null,
  status: "queued",
  error: null,
  resultPath: null,
  resultText: null,
  createdAt: new Date().toISOString(),
  finishedAt: null,
  createdBy: "u",
  estimatedCost: null,
  occurrenceId: null,
  segmentId: null,
  ...over,
});

describe("REQ-0029 REQ-0592 – oppfølgingen i nettleseren starter aldri en generering", () => {
  it("REQ-0029 REQ-0592: med jobber i kø og i arbeid sendes bare køen og spørres bare etter status – i minutter", async () => {
    vi.useFakeTimers();
    const jobs = [
      job({ status: "queued" }),
      job({ status: "running" }),
      job({ status: "done", resultPath: "p/films/x/ai-video.mp4" }),
      job({ status: "failed", error: "avslått" }),
      job({
        kind: "image",
        status: "running",
        createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      }),
    ];
    const qc = new QueryClient();
    renderHook(() => useVideoPolling("prosjekt-1", jobs, true), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client: qc }, children),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * 60_000);
    });
    expect(h.pump.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(h.poll.mock.calls.length).toBeGreaterThanOrEqual(2);
    // Bare jobben som kjører, følges opp
    for (const [a] of h.poll.mock.calls)
      expect((a as { data: { jobId: string } }).data.jobId).toBe(jobs[1]!.id);
    nothingSent();
  });

  it("REQ-0029 REQ-0592: uten jobber i kø eller i arbeid skjer ingenting, og en leser følger ikke opp", async () => {
    vi.useFakeTimers();
    const qc = new QueryClient();
    const done = [job({ status: "done" }), job({ status: "failed" })];
    renderHook(() => useVideoPolling("prosjekt-1", done, true), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client: qc }, children),
    });
    renderHook(() => useVideoPolling("prosjekt-1", [job({ status: "queued" })], false), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client: qc }, children),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });
    expect(h.pump).not.toHaveBeenCalled();
    expect(h.poll).not.toHaveBeenCalled();
    nothingSent();
  });
});
