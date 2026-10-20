/**
 * «AI-video av scenen» i sceneeditoren (DEC-0083, utvidet i DEC-0085).
 *
 * - Scenen vises som: 2D-scenen, en AI-video (bitene satt sømløst sammen), opplastet film eller stillbilde.
 *   Ingenting slettes; valget kan angres. Ny video kan lastes opp, og scenen kan lastes ned (monteringen).
 * - Ny AI-video: det som sendes, er det scenen viser i avspillingen (2D-scenen, en tidligere AI-video eller
 *   opplastet film), uten undertekster, med eller uten scenens lyd. Lange scener deles i bitene modellen
 *   anbefaler. Bakgrunn og figurer sendes som referansebilder (et samlebilde når de er flere enn modellen
 *   tar imot). Beskrivelsen består av den globale beskrivelsen for prosjektet (kan slås av og redigeres
 *   for hele prosjektet) og scenebeskrivelsen (laget fra manuset, kan skrives med AI og redigeres).
 * - Anslått pris (USD, og kreditter hos Runway) må bekreftes før noe sendes. Status vises øverst i
 *   toppfeltet mens videoen lages, så brukeren kan jobbe videre.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  Clapperboard,
  Download,
  Film,
  ImageIcon,
  Layers,
  Loader2,
  RotateCcw,
  TriangleAlert,
  Upload,
} from "lucide-react";
import {
  L, profileChoice, qualityProfileSnapshot,
  tm,
  adaptPromptForModel,
  batchInUse,
  batchSceneEdit,
  buildSceneVideoPrompt,
  estimateCostUsd,
  filmAudio,
  filmClips,
  filmSelection,
  filmTakeAudio,
  formatUsd,
  layersOf,
  layerVersions,
  locale,
  newId,
  planReferences,
  planScenePieces,
  providerModel,
  providersFor,
  referenceCount,
  sceneBackground,
  sceneCast,
  sceneDescriptionFromScript,
  sceneDescriptionUserText,
  sceneVideoBatches,
  sceneVideoRefPath,
  sceneVideoSourcePath,
  stateWithSource,
  styleProfileFor,
  styleText,
  takeLabel,
  MAX_SCENE_VIDEO_INSTRUCTIONS,
  type FilmClip,
  type ProjectState,
  type SceneCastMember,
  type SceneVideoBatch,
  type SceneVideoSource,
  type Take,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { startVideoGeneration } from "@/adapters/ai/video.functions";
import { writeImagePrompt } from "@/adapters/ai/write-prompt.functions";
import { ASSET_BUCKET, uploadFile } from "@/adapters/browser/storage-files";
import { aiJobsKey, useAiJobs } from "@/app/ai/use-ai-jobs";
import { RefetchVideoButton, canRefetchVideo } from "@/app/ai/RefetchVideoButton";
import { QualityProfilePicker, QualityProfileBudget, useQualityProfile } from "@/app/ai/QualityProfilePicker";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { signedUrls, useImageUrls } from "@/app/library/asset-images";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { GlobalStyleText } from "@/app/projects/GlobalStyleText";
import { FILM_ACCEPT, uploadFilm } from "@/app/assembly/film-import";
import { audioBank } from "@/app/audio/use-audio-playback";
import { ExportError, canExportVideo, exportAnimatic, loadImages } from "@/engine/export/animatic";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t as tk } from "@/core/i18n/keyed";

const heading = "text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary";
const ctl =
  "h-7 min-w-0 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary disabled:opacity-50";

/** Størrelsen videoen lages i: prosjektets format, minst 720 og høyst 1920 piksler på sidene. */
export function sourceVideoSize(w: number, h: number): { width: number; height: number } {
  let scale = Math.min(1, 1920 / Math.max(w, h));
  if (Math.min(w, h) * scale < 720) scale = 720 / Math.min(w, h);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(w * scale), height: even(h * scale) };
}

/** Runway tar betalt i kreditter (1 kreditt = 0,01 USD). */
const creditsOf = (provider: string, usd: number) =>
  provider === "runway" ? Math.round(usd * 100) : null;

/** Et samlebilde av figurene med navn under hver (PNG), til modeller med få referanseplasser (DEC-0085). */
async function makeSheet(
  members: readonly SceneCastMember[],
  urls: Readonly<Record<string, string>>,
): Promise<Blob> {
  const cell = 512;
  const label = 56;
  const cols = Math.min(3, members.length);
  const rows = Math.ceil(members.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = rows * (cell + label);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await Promise.all(
    members.map(async (m, i) => {
      const x = (i % cols) * cell;
      const y = Math.floor(i / cols) * (cell + label);
      const url = m.imagePath ? urls[m.imagePath] : undefined;
      if (url) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;
        try {
          await img.decode();
          const k = Math.min(cell / img.naturalWidth, cell / img.naturalHeight);
          const w = img.naturalWidth * k;
          const h = img.naturalHeight * k;
          ctx.drawImage(img, x + (cell - w) / 2, y + (cell - h) / 2, w, h);
        } catch {
          // Bildet mangler: bare navnet
        }
      }
      ctx.fillStyle = "#111111";
      ctx.font = "600 30px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${i + 1}. ${m.name}`, x + cell / 2, y + cell + 38, cell - 16);
    }),
  );
  return await new Promise<Blob>((ok, fail) =>
    canvas.toBlob(
      (b) =>
        b
          ? ok(b)
          : fail(
              new Error(
                tk("app-scene-editor-scene-to-video-dialog.make-sheet.fail.c662077d7c13"),
              ),
            ),
      "image/png",
    ),
  );
}

type Phase =
  | { readonly kind: "idle" }
  | { readonly kind: "confirm" }
  | { readonly kind: "working"; readonly text: string }
  | { readonly kind: "sent"; readonly count: number };

/** Et valg for hva som sendes (kilden) eller hva scenen vises som. */
interface SourceChoice {
  readonly key: string;
  readonly label: string;
  readonly source: SceneVideoSource;
}

export function SceneToVideoDialog({
  open,
  onOpenChange,
  state,
  projectId,
  productionId,
  occurrenceId,
  cmds,
  editable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  projectId: string;
  productionId: string;
  occurrenceId: string;
  cmds: Commands;
  /** Brukeren kan redigere prosjektet (redaktør eller eier). */
  editable: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const occ = state.occurrences[occurrenceId];
  const fps = state.project.fps;
  const clip = useMemo(
    () => filmClips(state, productionId).find((c) => c.occurrenceId === occurrenceId) ?? null,
    [state, productionId, occurrenceId],
  );
  const occIds = useMemo(
    () => [occurrenceId, ...(clip?.inheritedFrom ? [clip.inheritedFrom] : [])],
    [occurrenceId, clip?.inheritedFrom],
  );
  const material = clip?.inheritedFrom ? state.occurrences[clip.inheritedFrom] : occ;

  // ------------------------------------------------ Resultatene og versjonene av scenen
  const jobs = useAiJobs(projectId, open);
  const batches = useMemo(
    () => sceneVideoBatches(state, jobs.data?.jobs ?? [], new Set([occurrenceId])),
    [state, jobs.data, occurrenceId],
  );
  const inBatches = useMemo(
    () => new Set(batches.flatMap((b) => b.takes.flatMap((t) => (t ? [t.id as string] : [])))),
    [batches],
  );
  const otherTakes = useMemo(
    () =>
      Object.values(state.takes)
        .filter(
          (t) =>
            (t.kind === "ai_video" || t.kind === "imported_film" || t.kind === "still") &&
            t.mediaRef !== null &&
            state.occurrences[t.occurrenceId]?.sceneId === occ?.sceneId &&
            !inBatches.has(t.id),
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
    [state.takes, state.occurrences, occ?.sceneId, inBatches],
  );
  const ownParts = Object.values(state.clipParts).some(
    (p) => p.occurrenceId === (material?.id ?? occurrenceId) && !p.removed,
  );
  const usesAnimatic = !ownParts && !material?.activeTakeId;
  const hasComposition = !!clip?.compositionId;

  // ------------------------------------------------ Hva som sendes (kilden)
  const sources = useMemo<SourceChoice[]>(() => {
    const out: SourceChoice[] = [];
    if (hasComposition)
      out.push({ key: "2d", label: tk("app-scene-editor-scene-to-video-dialog.label.label.f8cd1953e5af"), source: { kind: "animatic" } });
    for (const b of batches) {
      const edit = batchSceneEdit(state, b, () => newId());
      if (!edit) continue;
      out.push({
        key: `b:${b.batchId}`,
        label: tk("app-scene-editor-scene-to-video-dialog.label.label.1914121f8b6c", { value1: String(new Date(b.createdAt).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) }),
        source: edit.parts.length
          ? { kind: "parts", parts: edit.parts }
          : { kind: "take", takeId: edit.activeTakeId! },
      });
    }
    for (const t of otherTakes)
      if (t.kind !== "still")
        out.push({
          key: `t:${t.id}`,
          label: takeLabel(state, t),
          source: { kind: "take", takeId: t.id },
        });
    return out;
  }, [hasComposition, batches, otherTakes, state]);
  const [sourceKey, setSourceKey] = useState("");
  const chosenSource = sources.find((x) => x.key === sourceKey) ?? sources[0] ?? null;
  const fromFilm = chosenSource ? chosenSource.source.kind !== "animatic" : false;
  const src = useMemo(() => {
    if (!chosenSource) return null;
    const s2 = stateWithSource(state, occIds, chosenSource.source);
    const sel = filmSelection(filmClips(s2, productionId), new Set([occurrenceId]));
    return { state: s2, sel, clip: (sel.clips[0] ?? null) as FilmClip | null };
  }, [chosenSource, state, occIds, productionId, occurrenceId]);

  // ------------------------------------------------ Leverandør og modell
  const available = useProjectProviders(projectId, open && editable);
  const options = providersFor("video_edit", new Set(available.data?.providers ?? []));
  const flat = options.flatMap((o) => o.models.map((m) => ({ provider: o.provider, model: m })));
  const [pick, setPick] = useState("");
  const quality = useQualityProfile(state);
  const recommended = profileChoice("video_edit", quality.profile, new Set(available.data?.providers ?? []));
  const chosen = flat.find((x) => `${x.provider.id}|${x.model.id}` === pick) ?? (recommended ? flat.find(m => m.model.id === recommended.model.id) : null) ?? flat[0] ?? null;
  const [withAudio, setWithAudio] = useState(false);

  // ------------------------------------------------ Beskrivelsene
  const [useGlobal, setUseGlobal] = useState(true);
  const globalText = styleText(styleProfileFor(state, "ai_video")?.guide);
  const cast = useMemo(
    () => sceneCast(state, productionId, occurrenceId),
    [state, productionId, occurrenceId],
  );
  const generated = useMemo(
    () => (clip ? sceneDescriptionFromScript(state, productionId, clip, cast) : ""),
    [state, productionId, clip, cast],
  );
  const canSave = useSchemaAtLeast(32);
  const saved = occ?.videoInstructions ?? "";
  const [draft, setDraft] = useState(saved || generated);
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setDraft(saved || generated);
  }, [saved, generated]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);

  // ------------------------------------------------ Referansebildene
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const background = useMemo(
    () => sceneBackground(state, productionId, occurrenceId),
    [state, productionId, occurrenceId],
  );
  const [useBackground, setUseBackground] = useState(true);
  const refs = useMemo(
    () =>
      planReferences(
        cast.filter((m) => !excluded.has(m.assetId)),
        useBackground ? background : null,
        chosen?.model ?? {},
      ),
    [cast, excluded, background, useBackground, chosen],
  );
  const thumbs = useImageUrls([
    ...cast.flatMap((m) => (m.imagePath ? [m.imagePath] : [])),
    ...(background ? [background.imagePath] : []),
  ]);

  // ------------------------------------------------ Biter, beskrivelser og pris
  const plan = useMemo(
    () =>
      chosen && src?.clip ? planScenePieces(src.clip.durationFrames, fps, chosen.model) : null,
    [chosen, src, fps],
  );
  const prompts = useMemo(() => {
    if (!chosen || !src?.clip || !plan?.ok) return [];
    const refsOn = (chosen.model.maxElements ?? 0) > 0;
    return plan.pieces.map((piece) =>
      adaptPromptForModel(
        buildSceneVideoPrompt(src.state, {
          clip: src.clip!,
          productionId,
          piece,
          count: plan.pieces.length,
          cast,
          refs,
          globalStyle: useGlobal ? globalText : null,
          sceneDescription: draft,
          references: refsOn,
          withAudio,
          fromFilm,
          maxChars: chosen.model.maxPromptChars,
        }),
        chosen.model,
      ),
    );
  }, [
    chosen,
    src,
    plan,
    productionId,
    cast,
    refs,
    useGlobal,
    globalText,
    draft,
    withAudio,
    fromFilm,
  ]);
  const cost = useMemo(() => {
    if (!chosen || !plan?.ok) return null;
    let sum = 0;
    for (const p of plan.pieces) {
      const c = estimateCostUsd(chosen.provider.id, chosen.model.id, { seconds: p.billedSeconds });
      if (c === null) return null;
      sum += c;
    }
    return sum;
  }, [chosen, plan]);
  const credits = cost !== null && chosen ? creditsOf(chosen.provider.id, cost) : null;
  const priceText =
    cost === null
      ? tk("app-scene-editor-scene-to-video-dialog.price-text.message.cc4a7d5030ce")
      : credits !== null
        ? tk("app-scene-editor-scene-to-video-dialog.price-text.message.5a1a6c7beb4e", { value1: String(formatUsd(cost)), credits: String(credits) })
        : tk("app-scene-editor-scene-to-video-dialog.price-text.message.9dfa84f98891", { value1: String(formatUsd(cost)) });

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [busyUpload, setBusyUpload] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!open) {
      setPhase({ kind: "idle" });
      setError(null);
      setExcluded(new Set());
      touched.current = false;
    }
  }, [open]);

  // ------------------------------------------------ Handlinger
  function applyEdit(
    activeTakeId: string | null,
    parts: readonly {
      partId: string;
      source: "take" | "composition";
      takeId: string | null;
      inMs: number;
      outMs: number;
    }[],
    label: string,
  ) {
    const e = cmds.run(
      {
        type: "SetSceneEdit",
        occurrenceId: occurrenceId as never,
        activeTakeId: activeTakeId as never,
        parts: parts as never,
      },
      label,
    );
    setError(e);
  }
  function showAnimatic() {
    if (clip?.inheritedFrom) {
      // Spinoff som arver hovedfilmens versjon: 2D-scenen lagres som egen del (som i monteringen)
      const anim = stateWithSource(state, occIds, { kind: "animatic" });
      const c = filmClips(anim, productionId).find((x) => x.occurrenceId === occurrenceId);
      const ms = c ? Math.round((c.durationFrames / (fps.num / fps.den)) * 1000) : 0;
      if (ms > 0)
        applyEdit(
          null,
          [{ partId: newId(), source: "composition", takeId: null, inMs: 0, outMs: ms }],
          tk("app-scene-editor-scene-to-video-dialog.show-animatic.apply-edit.020992df8434"),
        );
      return;
    }
    applyEdit(null, [], tk("app-scene-editor-scene-to-video-dialog.show-animatic.apply-edit.020992df8434.2"));
  }
  function showBatch(b: SceneVideoBatch) {
    const edit = batchSceneEdit(state, b, () => newId());
    if (edit)
      applyEdit(
        edit.activeTakeId,
        edit.parts,
        tk("app-scene-editor-scene-to-video-dialog.show-batch.apply-edit.39152cb38070"),
      );
  }
  function showTake(t: Take) {
    applyEdit(t.id, [], tk("app-scene-editor-scene-to-video-dialog.show-take.apply-edit.b4190a2ba8ed", { value1: String(takeLabel(state, t)) }));
  }

  async function uploadVideo(file: File) {
    setBusyUpload(true);
    setError(null);
    try {
      const f = await uploadFilm(projectId, file, fps);
      const group = newId();
      const label = `${tk("app-scene-editor-scene-to-video-dialog.label.message.997376a3c707")} «${f.media.fileName}»`;
      const r = await cmds.runAndWait(
        {
          type: "AddTake",
          takeId: f.takeId as never,
          occurrenceId: occurrenceId as never,
          segmentId: null,
          kind: "imported_film",
          status: "approved",
          durationFrames: f.durationFrames,
          mediaRef: f.mediaRef,
          media: f.media,
        },
        label,
        group,
      );
      if (r.error) throw new Error(r.error);
      // Tas i bruk med en gang (kan angres som ett steg sammen med opplastingen)
      const e = cmds.run(
        {
          type: "SetSceneEdit",
          occurrenceId: occurrenceId as never,
          activeTakeId: f.takeId as never,
          parts: [],
        },
        label,
        group,
      );
      if (e) setError(e);
    } catch (e) {
      setError(
        tm(
          (e as Error).message ||
            tk("app-scene-editor-scene-to-video-dialog.upload-video.set-error.62443f9a5977"),
        ),
      );
    } finally {
      setBusyUpload(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function saveDescription(text: string): boolean {
    if (!canSave || !editable) return true;
    // Den genererte teksten lagres ikke (den lages på nytt fra manuset); bare brukerens egen
    const next = text.trim() === generated.trim() ? "" : text;
    if (next.trim() === saved.trim()) return true;
    const e = cmds.run(
      { type: "SetSceneVideoInstructions", occurrenceId: occurrenceId as never, text: next },
      tk("app-scene-editor-scene-to-video-dialog.e.cmds-run.6c945294d111"),
    );
    setSaveError(e);
    return !e;
  }

  async function writeWithAi() {
    if (!clip) return;
    setWriting(true);
    setSaveError(null);
    try {
      const r = await writeImagePrompt({
        data: {
          projectId,
          assetId: null,
          task: "scene",
          brief: sceneDescriptionUserText(state, clip, draft, cast),
          purpose: "background",
          images: [],
          approved: true,
        },
      });
      if (!r.ok) setSaveError(tm(r.message));
      else {
        touched.current = true;
        setDraft(r.prompt);
        saveDescription(r.prompt);
        void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
      }
    } catch (e) {
      setSaveError(tm((e as Error).message));
    } finally {
      setWriting(false);
    }
  }

  async function send() {
    if (!chosen || !plan?.ok || !src?.clip) return;
    const pieces = plan.pieces;
    const srcClip = src.clip;
    setError(null);
    saveDescription(draft);
    try {
      if (!canExportVideo())
        throw new ExportError(
          tk("app-scene-editor-scene-to-video-dialog.send.message.7f9d622370e6"),
        );
      setPhase({
        kind: "working",
        text: tk("app-scene-editor-scene-to-video-dialog.text.text.3465f1ae1894"),
      });
      // Bildene i 2D-scenen (også når en film sendes: 2D-delene av en klippet scene)
      const need = new Set<string>();
      if (srcClip.compositionId)
        for (const l of layersOf(src.state, srcClip.compositionId)) {
          if (!l.visible) continue;
          for (const v of layerVersions(src.state, l)) need.add(v.mediaPath);
        }
      const filmPaths = srcClip.parts.flatMap((p) => (p.take?.mediaRef ? [p.take.mediaRef] : []));
      const [{ images }, filmUrls] = await Promise.all([
        loadImages(need.size ? await signedUrls([...need], 3600) : {}),
        filmPaths.length ? signedUrls(filmPaths, 3600) : Promise.resolve({}),
      ]);
      // Scenens lyd (uten undertekster) når den skal sendes med
      let audio: Parameters<typeof exportAnimatic>[0]["audio"];
      if (withAudio) {
        const items = [
          ...filmAudio(src.state, src.sel.clips, fps),
          ...filmTakeAudio(src.sel.clips, fps),
        ];
        const paths = [
          ...new Set(items.flatMap((it) => (it.version ? [it.version.mediaPath] : []))),
        ];
        if (paths.length) await audioBank.loadAll(await signedUrls(paths, 3600));
        audio = { items, bank: audioBank };
      }
      const { width, height } = sourceVideoSize(
        state.project.frameWidth,
        state.project.frameHeight,
      );
      const batch = newId();
      const paths: string[] = [];
      for (const piece of pieces) {
        setPhase({
          kind: "working",
          text: tk("app-scene-editor-scene-to-video-dialog.text.text.8c88b09d3b7a", { value1: String(piece.index + 1), length: String(pieces.length) }),
        });
        const file = await exportAnimatic({
          state: src.state,
          clips: src.sel.clips,
          startFrame: srcClip.startFrame + piece.startFrame,
          endFrame: srcClip.startFrame + piece.endFrame,
          width,
          height,
          fps,
          images,
          filmUrls,
          mp4: true,
          // Undertekster sendes aldri (DEC-0085)
          ...(audio ? { audio } : {}),
        });
        if (!file.mimeType.includes("mp4"))
          throw new ExportError(
            tk("app-scene-editor-scene-to-video-dialog.send.message.6bf9f5a4ca1d"),
          );
        const path = sceneVideoSourcePath(projectId, batch, piece.index);
        const up = await uploadFile(
          ASSET_BUCKET,
          path,
          new Blob([file.bytes as BlobPart], { type: "video/mp4" }),
          { contentType: "video/mp4", upsert: false },
        );
        if (up)
          throw new Error(
            tk("app-scene-editor-scene-to-video-dialog.send.message.cc42e7ed1d17", { message: String(up.message) }),
          );
        paths.push(path);
      }
      // Samlebildet av figurene som ikke får egen plass
      let sheetPath: string | null = null;
      if (refs.sheet.length) {
        setPhase({
          kind: "working",
          text: tk("app-scene-editor-scene-to-video-dialog.text.text.4e7fac0b8bd9"),
        });
        const urls = await signedUrls(
          refs.sheet.flatMap((m) => (m.imagePath ? [m.imagePath] : [])),
          600,
        );
        const blob = await makeSheet(refs.sheet, urls);
        sheetPath = sceneVideoRefPath(projectId, batch, 0);
        const up = await uploadFile(ASSET_BUCKET, sheetPath, blob, {
          contentType: "image/png",
          upsert: false,
        });
        if (up)
          throw new Error(
            tk("app-scene-editor-scene-to-video-dialog.send.message.baebe6b95e6d", { message: String(up.message) }),
          );
      }
      setPhase({ kind: "working", text: tk("app-scene-editor-scene-to-video-dialog.text.text.0d6d1ab55395") });
      const aspect = state.project.frameWidth >= state.project.frameHeight ? "16:9" : "9:16";
      const elementPaths = refs.elements.map((m) => m.imagePath!);
      const imagePaths = [
        ...(refs.background ? [refs.background.imagePath] : []),
        ...(sheetPath ? [sheetPath] : []),
      ];
      const errors: string[] = [];
      let sent = 0;
      for (const piece of pieces) {
        if (quality.budgetError) throw new Error(quality.budgetError);
          const r = await startVideoGeneration({
          data: {
            projectId,
            occurrenceId,
            segmentId: null,
            prompt: prompts[piece.index]!.text,
            provider: chosen.provider.id,
            model: chosen.model.id,
            seconds: piece.billedSeconds,
            aspect,
            startImagePath: null,
            approved: true, qualityProfile: quality.profile ? qualityProfileSnapshot(quality.profile) : null,
            sourceVideoPath: paths[piece.index]!,
            elementPaths,
            imagePaths,
            withAudio,
            sourceKind: fromFilm ? "film" : "animatic",
            piece: {
              batch,
              index: piece.index,
              count: pieces.length,
              startMs: piece.startMs,
              endMs: piece.endMs,
            },
          },
        });
        if (r.ok) sent++;
        else errors.push(tm(r.message));
      }
      await qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
      setPhase(sent ? { kind: "sent", count: sent } : { kind: "idle" });
      if (errors.length) setError([...new Set(errors)].join(" "));
    } catch (e) {
      setPhase({ kind: "idle" });
      setError(tm((e as Error).message || tk("app-scene-editor-scene-to-video-dialog.send.set-error.b5831f293f6f")));
    }
  }

  // ------------------------------------------------ Visning
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(locale(), {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  const row = (on: boolean) =>
    "flex items-center gap-2 rounded-sm border px-2 py-1.5 text-xs " +
    (on ? "border-accent-brand bg-accent-selection/40" : "border-border bg-surface-2");
  const inUse = (
    <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-status-success">
      <Check className="size-3" aria-hidden />
      {tk("app-scene-editor-scene-to-video-dialog.in-use.span.87f77a3a5372")}
    </span>
  );
  const choiceButton = (onClick: () => void, name: string) =>
    editable ? (
      <button
        type="button"
        onClick={onClick}
        className="shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
        aria-label={tk("app-scene-editor-scene-to-video-dialog.choice-button.aria-label.4b80db290314", { name: String(name) })}
      >
        {tk("app-scene-editor-scene-to-video-dialog.choice-button.button.78bcf563c8d6")}
      </button>
    ) : null;
  const working = phase.kind === "working";

  return (
    <Dialog open={open} onOpenChange={(o) => (!working ? onOpenChange(o) : null)}>
      <DialogContent className="max-h-[92vh] max-w-[800px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AiGlyph className="size-4" aria-hidden />
            {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.dialog-title.80acf064604b")}
          </DialogTitle>
          <DialogDescription>
            {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.dialog-description.48b385e394c3")}
          </DialogDescription>
        </DialogHeader>
        <QualityProfilePicker state={state} value={quality.choice} disabled={phase.kind === "working"} onChange={v => { quality.setChoice(v); setPick(""); setPhase({ kind: "idle" }); }} /><QualityProfileBudget error={quality.budgetError} />

        {/* Hva viser scenen */}
        <section
          aria-label={tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.aria-label.ab0e1b734464")}
          className="flex flex-col gap-1.5"
        >
          <div className="flex items-center gap-2">
            <h3 className={heading}>{tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.h3.bb58fbe23bda")}</h3>
            <div className="ml-auto flex gap-1">
              {editable ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={FILM_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadVideo(f);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyUpload || working}
                    onClick={() => fileRef.current?.click()}
                    title={tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.title.e9b0e7fd4b32")}
                  >
                    {busyUpload ? <Loader2 className="animate-spin" /> : <Upload />}
                    {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.button.71f421529256")}
                  </Button>
                </>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                disabled={working}
                onClick={() =>
                  void navigate({
                    to: "/prosjekt/$projectId/montering",
                    params: { projectId },
                    search: { scene: occurrenceId, lastned: "1" },
                  })
                }
                title={tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.title.621da7f3600b")}
              >
                <Download />
                {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.button.0179925e0a1a")}
              </Button>
            </div>
          </div>
          {hasComposition ? (
            <div className={row(usesAnimatic)}>
              <Layers className="size-3.5 shrink-0 text-accent-brand" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-text-primary">
                {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.65043cefa612")}
              </span>
              {usesAnimatic ? inUse : choiceButton(showAnimatic, tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.choice-button.ccdac755ed35"))}
            </div>
          ) : null}
          {batches.map((b) => {
            const done = b.takes.filter(Boolean).length;
            const on = batchInUse(state, b, material?.id ?? occurrenceId);
            const failed = b.jobs.filter(
              (j) => j && (j.status === "failed" || j.status === "lost"),
            );
            const modelName = providerModel(b.provider, b.model)?.label ?? b.model;
            return (
              <div
                key={b.batchId}
                className="flex flex-col gap-0.5"
                data-testid="scene-video-batch"
              >
                <div className={row(on)}>
                  <AiGlyph className="size-3.5 shrink-0 text-accent-brand" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-text-primary">
                    {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.17d8fc9e23a5")}
                    <span className="text-text-tertiary">
                      {" "}
                      · {fmtDate(b.createdAt)} · {modelName}
                      {b.count > 1 ? tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.9916a51fd08d", { count: String(b.count) }) : ""}
                    </span>
                  </span>
                  {b.status === "done" ? (
                    on ? (
                      inUse
                    ) : (
                      choiceButton(() => showBatch(b), tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.choice-button.28388feb592c"))
                    )
                  ) : b.status === "running" ? (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-text-secondary">
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                      {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.4cd76e0f342e", { done: String(done), count: String(b.count) })}
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-status-danger">
                      <TriangleAlert className="size-3" aria-hidden />
                      {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.238d94bde2e0")}
                    </span>
                  )}
                </div>
                {failed.map((j) => (
                  <div key={j!.id} className="flex flex-wrap items-center gap-2 pl-6">
                    <p className="text-[11px] text-status-danger">
                      {b.count > 1
                        ? tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.p.9a0d008b0634", { value1: String(b.jobs.indexOf(j) + 1) })
                        : ""}
                      {tm(j!.error ?? tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.p.258576887209"))}
                    </p>
                    {editable && canRefetchVideo(j) ? (
                      <RefetchVideoButton projectId={projectId} job={j!} size="xs" />
                    ) : null}
                  </div>
                ))}
              </div>
            );
          })}
          {otherTakes.map((t) => {
            const on = !ownParts && material?.activeTakeId === t.id;
            const Icon =
              t.kind === "still" ? ImageIcon : t.kind === "ai_video" ? Clapperboard : Film;
            return (
              <div key={t.id} className={row(on)}>
                <Icon className="size-3.5 shrink-0 text-accent-warm" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-text-primary">
                  {takeLabel(state, t)}
                </span>
                {on ? inUse : choiceButton(() => showTake(t), takeLabel(state, t))}
              </div>
            );
          })}
          {ownParts && !batches.some((b) => batchInUse(state, b, material?.id ?? occurrenceId)) ? (
            <p className="text-[11px] text-text-tertiary">
              {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.p.c2c6e5e09d51")}
            </p>
          ) : null}
        </section>

        {/* Ny AI-video */}
        <section
          aria-label={tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.aria-label.7f840f37a0f4")}
          className="flex flex-col gap-2.5 border-t border-border pt-3"
        >
          <h3 className={heading}>{tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.h3.6385ef3f125b")}</h3>
          {!editable ? (
            <p className="text-xs text-text-tertiary">
              {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.p.076492be1e3a")}
            </p>
          ) : !chosenSource ? (
            <p className="text-xs text-text-secondary">
              {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.p.348d30ca7a5e")}
            </p>
          ) : available.isLoading ? (
            <p className="text-xs text-text-tertiary">
              {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.p.36d5674b5f0b")}
            </p>
          ) : !chosen ? (
            <p className="text-xs text-text-secondary">
              {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.p.0bf051dbd3bf")}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-secondary">
                <label className="flex items-center gap-1.5">
                  {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.label.ef9e6c3b2508")}
                  <select
                    className={ctl}
                    value={chosenSource.key}
                    onChange={(e) => setSourceKey(e.target.value)}
                    disabled={working}
                    data-testid="scene-video-source"
                  >
                    {sources.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.label.a8220e4adc64")}
                  <select
                    className={ctl}
                    value={`${chosen.provider.id}|${chosen.model.id}`}
                    onChange={(e) => setPick(e.target.value)}
                    disabled={working}
                  >
                    {flat.map((x) => (
                      <option
                        key={`${x.provider.id}|${x.model.id}`}
                        value={`${x.provider.id}|${x.model.id}`}
                      >
                        {x.model.label} – {x.provider.name} · {formatUsd(x.model.priceUsd)}
                        {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.option.3d038bbe4283")}
                        {x.provider.id === "runway"
                          ? tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.option.d711aee23f68", { value1: String(Math.round(x.model.priceUsd * 100)) })
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className="flex items-center gap-1.5"
                  title={tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.title.93f45ff01c42")}
                >
                  <input
                    type="checkbox"
                    checked={withAudio}
                    disabled={working}
                    onChange={(e) => setWithAudio(e.target.checked)}
                    className="size-3.5 accent-[var(--accent-brand)]"
                  />
                  {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.label.4b0a6e82c94a")}
                </label>
                <span className="text-[11px] text-text-tertiary">
                  {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.3fcb930584c6")}
                </span>
              </div>

              <GlobalStyleText
                state={state}
                cmds={cmds}
                editable={editable}
                include={{ value: useGlobal, onChange: setUseGlobal }}
              />

              <div className="flex flex-col gap-1 text-xs text-text-secondary">
                <div className="flex items-center gap-2">
                  <span>{tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.c28c1300d06d")}</span>
                  <span className="text-[11px] text-text-tertiary">
                    {saved
                      ? tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.cdf8dc043276")
                      : tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.8683223959e3")}
                  </span>
                  <div className="ml-auto flex gap-1">
                    <button
                      type="button"
                      disabled={working || writing}
                      onClick={() => {
                        touched.current = true;
                        setDraft(generated);
                        saveDescription(generated);
                      }}
                      className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary disabled:opacity-50"
                      title={tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.title.53023f5edec2")}
                    >
                      <RotateCcw className="size-3" aria-hidden />
                      {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.button.a1f6812693bd")}
                    </button>
                    <button
                      type="button"
                      disabled={working || writing}
                      onClick={() => void writeWithAi()}
                      className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary disabled:opacity-50"
                      title={tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.title.88cc225ceea7")}
                    >
                      {writing ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                      ) : (
                        <AiGlyph className="size-3" aria-hidden />
                      )}
                      {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.button.9671c947cd2e")}
                    </button>
                  </div>
                </div>
                <textarea
                  value={draft}
                  rows={6}
                  maxLength={MAX_SCENE_VIDEO_INSTRUCTIONS}
                  disabled={working || writing}
                  onChange={(e) => {
                    touched.current = true;
                    setDraft(e.target.value);
                  }}
                  onBlur={() => saveDescription(draft)}
                  aria-label={tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.aria-label.c28c1300d06d")}
                  className="resize-y rounded-sm border border-border-control bg-surface-3 px-2 py-1.5 font-mono text-[11px] text-text-primary"
                />
                <span className="text-[11px] text-text-tertiary">
                  {canSave
                    ? tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.f3bc88bab554")
                    : tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.a2e0120d867b")}
                </span>
                {saveError ? (
                  <span className="text-[11px] text-status-danger">{tm(saveError)}</span>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary">
                  {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.0978d3048bd0")}
                </span>
                {(chosen.model.maxElements ?? 0) === 0 ? (
                  <p className="text-[11px] text-text-tertiary">
                    {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.p.929153b44110")}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {background ? (
                      <li className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={useBackground}
                          disabled={working}
                          onChange={(e) => setUseBackground(e.target.checked)}
                          aria-label={tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.aria-label.f0c7a944ba7b", { name: String(background.name) })}
                          className="size-3.5 accent-[var(--accent-brand)]"
                        />
                        <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-3">
                          {thumbs.data?.[background.imagePath] ? (
                            <img
                              src={thumbs.data[background.imagePath]}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-text-primary">
                          {background.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-text-tertiary">
                          {refs.background
                            ? tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.8389eec0fe67")
                            : tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.46b2c6a3ca20")}
                        </span>
                      </li>
                    ) : null}
                    {cast.map((m) => {
                      const off = excluded.has(m.assetId);
                      const own = refs.elements.some((x) => x.assetId === m.assetId);
                      const sheet = refs.sheet.some((x) => x.assetId === m.assetId);
                      const url = m.imagePath ? thumbs.data?.[m.imagePath] : undefined;
                      return (
                        <li key={m.assetId} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={!off && !!m.imagePath}
                            disabled={!m.imagePath || working}
                            onChange={() => {
                              const next = new Set(excluded);
                              if (off) next.delete(m.assetId);
                              else next.add(m.assetId);
                              setExcluded(next);
                            }}
                            aria-label={tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.aria-label.ee82a54bba45", { name: String(m.name) })}
                            className="size-3.5 accent-[var(--accent-brand)]"
                          />
                          <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-3">
                            {url ? (
                              <img src={url} alt="" className="size-full object-cover" />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-text-primary">
                            {m.name}
                          </span>
                          <span className="shrink-0 text-[11px] text-text-tertiary">
                            {!m.imagePath
                              ? tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.8fabcf19d388")
                              : off
                                ? tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.46b2c6a3ca20.2")
                                : own
                                  ? tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.a49bc2c6f50f")
                                  : sheet
                                    ? tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.2e3e62c5c1c7")
                                    : ""}
                            {m.imagePath && !m.visualBrief
                              ? tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.55b3b8e6b883")
                              : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {(chosen.model.maxElements ?? 0) > 0 ? (
                  <span className="text-[11px] text-text-tertiary">
                    {L(
                      `Modellen tar imot ${chosen.model.maxElements} referansebilder; ${referenceCount(refs)} sendes.${refs.sheet.length ? ` ${refs.sheet.length} figurer settes sammen i ett samlebilde med navn.` : ""}`,
                      `The model accepts ${chosen.model.maxElements} reference images; ${referenceCount(refs)} are sent.${refs.sheet.length ? ` ${refs.sheet.length} figures are put together in one reference sheet with names.` : ""}`,
                    )}
                  </span>
                ) : null}
              </div>

              {plan && !plan.ok ? (
                <p className="text-xs text-status-danger">{plan.message}</p>
              ) : plan?.ok ? (
                <div className="flex flex-col gap-1 text-xs text-text-secondary">
                  <span>
                    {plan.pieces.length === 1
                      ? tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.8bec29a12f21", { value1: String(((plan.pieces[0]!.endMs - plan.pieces[0]!.startMs) / 1000).toFixed(1)) })
                      : tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.71fc7c0fdaca", { length: String(plan.pieces.length) })}{" "}
                    {priceText}
                  </span>
                  <details>
                    <summary className="cursor-pointer text-text-tertiary">
                      {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.summary.e4e92a1e268c")}
                    </summary>
                    {prompts.map((p, i) => (
                      <div key={i} className="mt-1">
                        {prompts.length > 1 ? (
                          <span className="text-[11px] text-text-tertiary">
                            {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.3b329b9e9b7b", { value1: String(i + 1) })}
                          </span>
                        ) : null}
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-surface-1 p-2 font-mono text-[11px] text-text-secondary">
                          {p.text}
                        </pre>
                        {p.notes.map((n, k) => (
                          <p key={k} className="text-[11px] text-text-tertiary">
                            {n}
                          </p>
                        ))}
                      </div>
                    ))}
                  </details>
                </div>
              ) : null}
            </>
          )}
          {phase.kind === "working" ? (
            <p role="status" className="flex items-center gap-1.5 text-xs text-text-secondary">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {phase.text}
            </p>
          ) : phase.kind === "sent" ? (
            <p role="status" className="text-xs text-status-success">
              {L(
                `Sendt (${phase.count} ${phase.count === 1 ? "del" : "deler"}). Videoen lages hos leverandøren og legges inn som ny versjon når den er ferdig – følg med i statusen øverst til høyre. Du kan lukke vinduet og jobbe videre.`,
                `Sent (${phase.count} ${phase.count === 1 ? "part" : "parts"}). The video is made by the provider and added as a new version when it is finished – follow the status at the top right. You can close the window and keep working.`,
              )}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-status-danger">
              {error}
            </p>
          ) : null}
        </section>

        <DialogFooter>
          {phase.kind === "confirm" ? (
            <>
              <span className="mr-auto text-xs text-text-secondary">
                {cost !== null
                  ? credits !== null
                    ? tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.e5a4ab2bf41f", { value1: String(formatUsd(cost)), credits: String(credits), value3: String(chosen?.provider.name ?? "") })
                    : tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.37ea703a8c20", { value1: String(formatUsd(cost)), value2: String(chosen?.provider.name ?? "") })
                  : tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.span.144ec15ec11c")}
              </span>
              <Button variant="ghost" onClick={() => setPhase({ kind: "idle" })}>
                {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.button.1f81b5dfb1f2")}
              </Button>
              <Button onClick={() => void send()}>
                <AiGlyph />
                {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.button.66d62ba26b37")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={working}>
                {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.button.cf325d03a3ed")}
              </Button>
              {editable && chosen && plan?.ok && chosenSource ? (
                <Button onClick={() => setPhase({ kind: "confirm" })} disabled={working}>
                  <AiGlyph />
                  {tk("app-scene-editor-scene-to-video-dialog.scene-to-video-dialog.button.7588e3e82429")}
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
