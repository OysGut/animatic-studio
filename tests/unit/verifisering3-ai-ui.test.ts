/**
 * Verifisering av krav (DEC-0075) i AI-flatene (jsdom, React Testing Library):
 * - REQ-0254: «Generer scene» på nytt sender den lagrede, redigerte beskrivelsen.
 * - REQ-0285: flere kandidater bestilles etter bekreftelse og sammenlignes side ved side.
 * - REQ-0290: «Video for flere scener» – valgte scener legges i kø etter godkjent samlet kostnad.
 * - REQ-0297: et segment med mislykket jobb kan startes på nytt.
 * - REQ-0265: «Sett sammen scenen» følger segmentplanen (rekkefølge, tider, myk overgang eller kutt).
 *
 * Nettverk og AI-tjenester er erstattet: kommandoene kjøres i domenekjernen, og startVideoGeneration er en
 * attrapp som registrerer kallene. Leverandør: Google Veo 3.1 (trenger ikke startbilde).
 */
import { createElement, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  applyCommand,
  filmClips,
  keysEvenly,
  orderedOccurrences,
  partBlendAt,
  sceneVideoWork,
  sourceAt,
  type Command,
  type GenerationJob,
  type ProjectState,
  type TakeMedia,
} from "@/core";
import { GenerateSceneDialog } from "@/app/assembly/GenerateSceneDialog";
import { BatchVideoDialog } from "@/app/assembly/BatchVideoDialog";
import { CompareTakesDialog } from "@/app/assembly/CompareTakesDialog";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const h = vi.hoisted(() => ({
  jobs: [] as unknown[],
  start: null as unknown as Mock<(arg: unknown) => Promise<unknown>>,
}));
h.start = vi.fn(async (_: unknown) => ({ ok: true as const, jobId: "j", costUsd: 1 }));

vi.mock("@/adapters/ai/video.functions", () => ({
  startVideoGeneration: (arg: unknown) => h.start(arg),
}));
vi.mock("@/app/ai/use-ai-jobs", () => ({
  aiJobsKey: (projectId: string) => ["ai-jobs", projectId],
  useAiJobs: () => ({ data: { jobs: h.jobs, monthCount: 0 } }),
}));
vi.mock("@/app/ai/use-project-providers", () => ({
  useProjectProviders: () => ({
    data: { providers: ["lovable", "google"], missing: false },
    isLoading: false,
  }),
}));
vi.mock("@/app/shell/use-schema", () => ({ useSchemaAtLeast: () => true }));
vi.mock("@/app/library/asset-images", () => ({
  useImageUrls: (paths: readonly string[]) => ({
    data: Object.fromEntries(paths.map((p) => [p, `blob:${p}`])),
  }),
}));

beforeEach(() => {
  h.jobs = [];
  h.start.mockClear();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/** Komponenten får tilstanden fra en ramme som kjører kommandoene i kjernen (som runCommand gjør). */
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
  const exec = (command: Command): string | null => {
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
    run: (c: Command) => exec(c),
    runAndWait: async (c: Command) => {
      const e = exec(c);
      return e ? { error: e } : { error: null, commandId: "x" };
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

const startCalls = () =>
  h.start.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);

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

async function generateFirstSegment() {
  const before = h.start.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: /^(Generer|Lag ny)$/ }));
  const confirm = screen.getByRole("alertdialog", { name: "Bekreft videogenerering" });
  // Ingenting startes før kostnaden er bekreftet
  expect(h.start.mock.calls.length).toBe(before);
  fireEvent.click(within(confirm).getByRole("button", { name: /Ja, generer/ }));
  await screen.findByText(/startet hos Google Gemini/);
}

// ---------------------------------------------------------------- REQ-0254

describe("REQ-0254 – «Generer scene» på nytt bruker den redigerte beskrivelsen", () => {
  it("REQ-0254: beskrivelsen lagres, og neste generering (etter bekreftelse) sender den – også etter en ny endring", async () => {
    const seed = seedProject(3);
    const occ = orderedOccurrences(seed.state, seed.mainId)[1]!.id as string;
    const ran = sceneDialog(seed.state, seed.mainId, occ);
    const box = screen.getByRole("textbox", { name: /Beskrivelse for (scenen|segment 1)/ });
    const edited = `${(box as HTMLTextAreaElement).value}\nEGEN ENDRING: kamera i lav vinkel.`;
    fireEvent.change(box, { target: { value: edited } });
    fireEvent.click(screen.getByRole("button", { name: "Lagre egen beskrivelse" }));
    await screen.findByText("Egen beskrivelse");
    expect(ran.map((c) => c.type)).toEqual(["ReplaceSegments", "SetGenerationPrompt"]);

    await generateFirstSegment();
    expect(startCalls()).toHaveLength(1);
    expect(String(startCalls()[0]!["prompt"])).toContain("EGEN ENDRING: kamera i lav vinkel.");
    expect(startCalls()[0]!["approved"]).toBe(true);

    // Brukeren endrer beskrivelsen igjen og kjører på nytt
    const box2 = screen.getByRole("textbox", { name: /Beskrivelse for (scenen|segment 1)/ });
    fireEvent.change(box2, {
      target: {
        value: (box2 as HTMLTextAreaElement).value.replace("lav vinkel", "fugleperspektiv"),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lagre egen beskrivelse" }));
    await waitFor(() =>
      expect(ran.filter((c) => c.type === "SetGenerationPrompt")).toHaveLength(2),
    );
    await generateFirstSegment();
    expect(startCalls()).toHaveLength(2);
    expect(String(startCalls()[1]!["prompt"])).toContain("kamera i fugleperspektiv");
    expect(String(startCalls()[1]!["prompt"])).not.toContain("lav vinkel");
    // Samme segment begge gangene
    expect(startCalls()[1]!["segmentId"]).toBe(startCalls()[0]!["segmentId"]);
  });
});

// ---------------------------------------------------------------- REQ-0297

describe("REQ-0297 – en mislykket jobb kan startes på nytt", () => {
  it("REQ-0297: segmentet viser at jobben feilet, og «Generer» starter en ny jobb etter bekreftelse", async () => {
    const seed = seedProject(3);
    const occ = orderedOccurrences(seed.state, seed.mainId)[1]!.id as string;
    const segId = tid<"production_segment">();
    const s = mustApply(seed.state, {
      type: "ReplaceSegments",
      occurrenceId: occ as never,
      reason: "model_limit",
      removeSegmentIds: [],
      segments: [
        {
          segmentId: segId,
          orderKey: keysEvenly(1)[0]!,
          startBlockId: null,
          endBlockId: null,
          startMs: 0,
          endMs: 4000,
        },
      ],
    } as never);
    h.jobs = [
      {
        id: tid(),
        kind: "video",
        provider: "google",
        model: "veo-3.1-generate-preview",
        prompt: "p",
        assetId: null,
        status: "failed",
        error: "Leverandøren avviste forespørselen",
        resultPath: null,
        resultText: null,
        createdAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        createdBy: "u",
        estimatedCost: null,
        occurrenceId: occ,
        segmentId: segId,
      } satisfies GenerationJob,
    ];
    sceneDialog(s, seed.mainId, occ);
    expect(screen.getByText(/Feilet: Leverandøren avviste forespørselen/)).toBeInTheDocument();
    const again = screen.getByRole("button", { name: /^Generer$/ });
    expect(again).toBeEnabled();
    await generateFirstSegment();
    expect(startCalls()).toEqual([
      expect.objectContaining({ segmentId: segId, occurrenceId: occ, approved: true }),
    ]);
  });
});

// ---------------------------------------------------------------- REQ-0285

const MEDIA: TakeMedia = {
  fileName: "AI-video (google).mp4",
  mimeType: "video/mp4",
  byteSize: 1000,
  width: 1280,
  height: 720,
  fps: 24,
  durationMs: 4000,
  videoCodec: null,
  hasAudio: false,
};

describe("REQ-0285 – flere kandidater bestilles og sammenlignes side ved side", () => {
  it("REQ-0285: tre kandidater koster tre ganger så mye, bekreftes én gang og gir tre jobber for segmentet", async () => {
    const seed = seedProject(3);
    const occ = orderedOccurrences(seed.state, seed.mainId)[1]!.id as string;
    sceneDialog(seed.state, seed.mainId, occ);
    // Inndelingen lagres først (som i dialogen): lagre en egen beskrivelse
    const box = screen.getByRole("textbox", { name: /Beskrivelse for (scenen|segment 1)/ });
    fireEvent.change(box, { target: { value: `${(box as HTMLTextAreaElement).value} x` } });
    fireEvent.click(screen.getByRole("button", { name: "Lagre egen beskrivelse" }));
    await screen.findByText("Egen beskrivelse");
    const one = screen.getByRole("button", { name: /Generer alle segmentene/ }).textContent!;
    fireEvent.change(screen.getByRole("combobox", { name: "Kandidater per segment" }), {
      target: { value: "3" },
    });
    expect(
      screen.getByText(/3 videoer per segment \(koster 3 ganger så mye\)/),
    ).toBeInTheDocument();
    const three = screen.getByRole("button", { name: /Generer alle segmentene/ }).textContent!;
    const usd = (t: string) => Number(/\$([\d.]+)/.exec(t)![1]);
    expect(usd(three)).toBeCloseTo(usd(one) * 3, 5);
    await generateFirstSegment();
    expect(startCalls()).toHaveLength(3);
    const seg = startCalls()[0]!["segmentId"];
    for (const d of startCalls()) expect(d).toMatchObject({ segmentId: seg, candidates: 3 });
  });

  it("REQ-0285: kandidatene vises to og to side ved side; valget beholder de andre", async () => {
    const seed = seedProject(3);
    const occ = orderedOccurrences(seed.state, seed.mainId)[1]!.id as string;
    const segId = tid<"production_segment">();
    let s = mustApply(seed.state, {
      type: "ReplaceSegments",
      occurrenceId: occ as never,
      reason: "model_limit",
      removeSegmentIds: [],
      segments: [
        {
          segmentId: segId,
          orderKey: keysEvenly(1)[0]!,
          startBlockId: null,
          endBlockId: null,
          startMs: 0,
          endMs: 4000,
        },
      ],
    } as never);
    const takes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const takeId = tid<"take">();
      takes.push(takeId);
      s = mustApply(s, {
        type: "AddTake",
        takeId,
        occurrenceId: occ as never,
        segmentId: segId as never,
        kind: "ai_video",
        status: "in_progress",
        durationFrames: 100,
        mediaRef: `${s.project.id}/films/${takeId}/ai-video.mp4`,
        media: MEDIA,
      });
    }
    const ran = renderWith(s, (state, cmds) =>
      createElement(CompareTakesDialog, {
        open: true,
        onOpenChange: () => undefined,
        state,
        occurrenceId: occ,
        segmentId: segId,
        title: "segment 1",
        jobs: [],
        editable: true,
        cmds,
        productionId: seed.mainId,
      }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Sammenlign videoer/)).toBeInTheDocument();
    const videos = dialog.querySelectorAll("video");
    expect(videos).toHaveLength(2);
    expect(videos[0]!.getAttribute("src")).not.toBe(videos[1]!.getAttribute("src"));
    // Alle tre kan velges på hver side
    const right = within(dialog).getByRole("combobox", { name: "Video til høyre" });
    expect(within(right).getAllByRole("option")).toHaveLength(3);
    const third = within(right).getAllByRole("option")[2]!.getAttribute("value")!;
    fireEvent.change(right, { target: { value: third } });
    expect(dialog.querySelectorAll("video")[1]!.getAttribute("src")).toContain(third);
    // Velg kandidaten til høyre: bare statusen endres, ingen video slettes
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Velg denne" })[1]!);
    await within(dialog).findByText("Brukes for segmentet");
    expect(ran.every((c) => c.type === "SetTakeStatus")).toBe(true);
    expect(ran.some((c) => c.type === "SetTakeStatus" && c.takeId === third)).toBe(true);
  });
});

// ---------------------------------------------------------------- REQ-0290

describe("REQ-0290 – massegenerering legger valgte scener i kø", () => {
  it("REQ-0290: 15 valgte scener gir én køjobb per segment etter at samlet anslag er godkjent", async () => {
    const seed = seedProject(15);
    const ran = renderWith(seed.state, (state, cmds) =>
      createElement(BatchVideoDialog, {
        open: true,
        onOpenChange: () => undefined,
        state,
        productionId: seed.mainId,
        cmds,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Velg alle uten video" }));
    const boxes = within(screen.getByRole("list", { name: "Scener" })).getAllByRole("checkbox");
    expect(boxes).toHaveLength(15);
    for (const b of boxes) expect(b).toBeChecked();
    const works = filmClips(seed.state, seed.mainId).map((c) =>
      sceneVideoWork(seed.state, seed.mainId, c),
    );
    const segments = works.reduce((t, w) => t + w.plan.length, 0);
    fireEvent.click(screen.getByRole("button", { name: /^Lag video \(/ }));
    const confirm = screen.getByRole("alertdialog", { name: "Bekreft videogenerering" });
    expect(confirm.textContent).toMatch(new RegExp(`${segments} segmenter i 15 scener`));
    expect(confirm.textContent).toMatch(/anslått \$[\d.]+/);
    expect(h.start).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: /Ja, legg i kø/ }));
    await screen.findByText(new RegExp(`${segments} videoer er lagt i kø`));
    const calls = startCalls();
    expect(calls).toHaveLength(segments);
    for (const d of calls) expect(d).toMatchObject({ queue: true, approved: true });
    expect(new Set(calls.map((d) => d["occurrenceId"]))).toEqual(
      new Set(works.map((w) => w.clip.occurrenceId)),
    );
    // Inndelingene ble lagret først, som ett angresteg
    expect(ran.filter((c) => c.type === "ReplaceSegments")).toHaveLength(15);
  });
});

// ---------------------------------------------------------------- REQ-0265

describe("REQ-0265 – sammensettingen følger segmentplanen: rekkefølge, tidspunkter og overganger", () => {
  it("REQ-0265: «Sett sammen scenen» legger videoene i planlagt rekkefølge på planlagte tider, klipper for lange videoer og setter myk overgang der den er valgt", async () => {
    const seed = seedProject(3);
    const occ = orderedOccurrences(seed.state, seed.mainId)[1]!.id as string;
    const plan = [
      [0, 3000],
      [3000, 7000],
      [7000, 12000],
    ] as const;
    const segIds = plan.map(() => tid<"production_segment">());
    const keys = keysEvenly(3);
    let s = mustApply(seed.state, {
      type: "ReplaceSegments",
      occurrenceId: occ as never,
      reason: "model_limit",
      removeSegmentIds: [],
      segments: segIds.map((segmentId, i) => ({
        segmentId,
        orderKey: keys[i]!,
        startBlockId: null,
        endBlockId: null,
        startMs: plan[i]![0],
        endMs: plan[i]![1],
      })),
    } as never);
    // Videoene kommer i omvendt rekkefølge, og to av dem er lengre enn segmentet
    const videoMs = [4000, 6000, 5000];
    const takeOf: string[] = [];
    for (const i of [2, 1, 0]) {
      const takeId = tid<"take">();
      takeOf[i] = takeId;
      s = mustApply(s, {
        type: "AddTake",
        takeId,
        occurrenceId: occ as never,
        segmentId: segIds[i] as never,
        kind: "ai_video",
        status: "in_progress",
        durationFrames: Math.round(videoMs[i]! / 40),
        mediaRef: `${s.project.id}/films/${takeId}/ai-video.mp4`,
        media: { ...MEDIA, durationMs: videoMs[i]! },
      });
    }
    const ran = sceneDialog(s, seed.mainId, occ);
    expect(screen.getByRole("checkbox", { name: /Myk overgang mellom videoene/ })).toBeChecked();
    fireEvent.click(
      screen.getByRole("button", { name: /Sett sammen scenen av videoene \(3\/3\)/ }),
    );
    await screen.findByText(/Scenen er satt sammen/);
    let after = s;
    for (const c of ran) after = mustApply(after, c);
    const clip = filmClips(after, seed.mainId).find((c) => c.occurrenceId === occ)!;
    const fps = after.project.fps;
    const f = (ms: number) => Math.round((ms / 1000) * (fps.num / fps.den));
    // Rekkefølgen er planens, ikke rekkefølgen videoene kom i
    expect(clip.parts.map((p) => p.take?.id)).toEqual(takeOf);
    // Hver del starter der segmentet starter og varer like lenge som segmentet (for lange videoer klippes)
    expect(clip.parts.map((p) => p.startFrame)).toEqual(plan.map(([a]) => f(a)));
    expect(clip.parts.map((p) => p.durationFrames)).toEqual(plan.map(([a, b]) => f(b - a)));
    expect(clip.durationFrames).toBe(f(12000));
    // Midt i segment 2 vises video 2, 1 sekund inn i videoen
    const mid = sourceAt(clip, f(4000), fps);
    expect(mid.kind).toBe("take");
    if (mid.kind === "take") {
      expect(mid.take.id).toBe(takeOf[1]);
      expect(mid.seconds).toBeCloseTo(1, 5);
    }
    // Myk overgang (0,5 s) ved skjøtene mellom videoene, ingen før første del
    expect(clip.parts.map((p) => p.transitionMs ?? 0)).toEqual([0, 500, 500]);
    expect(partBlendAt(clip, f(3000) - 1, fps)).not.toBe(null);
    expect(partBlendAt(clip, f(1500), fps)).toBe(null);
  });

  it("REQ-0265: uten myk overgang settes delene sammen med rene kutt", async () => {
    const seed = seedProject(3);
    const occ = orderedOccurrences(seed.state, seed.mainId)[1]!.id as string;
    const segIds = [tid<"production_segment">(), tid<"production_segment">()];
    const keys = keysEvenly(2);
    let s = mustApply(seed.state, {
      type: "ReplaceSegments",
      occurrenceId: occ as never,
      reason: "model_limit",
      removeSegmentIds: [],
      segments: segIds.map((segmentId, i) => ({
        segmentId,
        orderKey: keys[i]!,
        startBlockId: null,
        endBlockId: null,
        startMs: i * 4000,
        endMs: (i + 1) * 4000,
      })),
    } as never);
    for (const segmentId of segIds) {
      const takeId = tid<"take">();
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
    const ran = sceneDialog(s, seed.mainId, occ);
    fireEvent.click(screen.getByRole("checkbox", { name: /Myk overgang mellom videoene/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Sett sammen scenen av videoene \(2\/2\)/ }),
    );
    await screen.findByText(/Scenen er satt sammen/);
    let after = s;
    for (const c of ran) after = mustApply(after, c);
    const clip = filmClips(after, seed.mainId).find((c) => c.occurrenceId === occ)!;
    expect(clip.parts.map((p) => p.transitionMs ?? 0)).toEqual([0, 0]);
    expect(partBlendAt(clip, clip.parts[1]!.startFrame - 1, after.project.fps)).toBe(null);
  });
});
