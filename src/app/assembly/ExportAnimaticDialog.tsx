/**
 * Eksport av animatic (M4 del 1, mandat 14.2, 29.1 og 29.6, DEC-0043): hele filmen, valgt scene eller et
 * utvalg av scener, som video laget i nettleseren – uten AI og uten betalte tjenester (REQ-0213/0416).
 * Før eksporten vises en kontroll (REQ-0422); man kan eksportere selv om noe mangler (REQ-0423).
 * Eksporten endrer ingenting i prosjektet.
 */
import { AlertTriangle, CheckCircle2, Download, Info } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  filmMediaPaths,
  filmRange,
  shiftAudioItems,
  shiftCues,
  formatHeading,
  formatTimecode,
  framesToSeconds,
  layerVersion,
  layerVersions,
  layersOf,
  orderedOccurrences,
  LANGUAGE_LABEL,
  MAIN_LANGUAGE,
  type SubtitleCue,
  type AudioKind,
  type FilmAudioItem,
  type ExportSettings,
  type FilmClip,
  type ProjectState,
  L, qualityProfileSnapshot,
  locale,
  languageWord,
  toSrt,
  toVtt,
} from "@/core";
import { useTextFonts } from "@/engine/typography/fonts";
import type { TextSpec } from "@/core";
import { ExportError, canExportVideo, exportAnimatic, loadImages } from "@/engine/export/animatic";
import {
  STEM_MAX_SECONDS,
  dialogueItems,
  exportDialogueStemParts,
} from "@/engine/export/audio-stem";
import { FilmLanguagePicker, type FilmLanguage } from "./use-film-language";
import { isEmbedded, prepareDownload, type ReadyFile } from "@/app/download";
import { ExportHistory } from "@/app/projects/ExportHistory";
import { useRecordExport } from "@/app/projects/use-history-records";
import { FilmShareDialog, type ShareSource } from "@/app/share/FilmShareDialog";
import { occurrenceKind } from "@/core";
import { QrCode as QrCodeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { audioBank } from "@/app/audio/use-audio-playback";
import { signedUrls } from "@/app/library/asset-images";
import { formatSeconds } from "./FilmTimeline";
import { exportSelection, type ExportScope } from "./export-selection";
import { hasSeparateCharacterLayers } from "@/core/animation/character";
import { exportQueue } from "./export-queue";
import { QualityProfilePicker, useQualityProfile } from "@/app/ai/QualityProfilePicker";
import { AlphaExportDialog } from "./AlphaExportDialog";

type Scope = ExportScope;
type Size = "full" | "half";

interface Check {
  readonly level: "ok" | "info" | "warn";
  readonly text: string;
}

async function freshFilmUrls(
  clips: readonly FilmClip[],
  fallback: Readonly<Record<string, string>> | null,
): Promise<Record<string, string>> {
  const paths = filmMediaPaths(clips);
  if (paths.length === 0) return {};
  try {
    return await signedUrls(paths, 4 * 60 * 60);
  } catch {
    return { ...(fallback ?? {}) };
  }
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "-").trim();
}

export function ExportAnimaticDialog({
  open,
  onOpenChange,
  state,
  productionId,
  clips,
  selectedId,
  urls,
  audioItems: allAudioItems,
  audioUrls,
  mutedKinds,
  filmUrls,
  monochrome = false,
  language,
  onLanguage,
  subtitles: allSubtitles,
  onSaveSettings,
  initialScope,
}: {
  /** Utvalget dialogen åpnes med (f.eks. «valgt scene» fra sceneeditoren, DEC-0085). */
  initialScope?: Scope | undefined;
  /** Lagre innstillingene for produksjonen når eksporten startes (DEC-0072). */
  onSaveSettings?: (settings: ExportSettings) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  productionId: string;
  clips: readonly FilmClip[];
  selectedId: string | null;
  /** Mediesti → signert lenke for bildene i filmen (null mens de hentes). */
  urls: Readonly<Record<string, string>> | null;
  /** Lyden i filmen (DEC-0044) og lenker til lydfilene. */
  audioItems: readonly FilmAudioItem[];
  audioUrls: Readonly<Record<string, string>> | null;
  mutedKinds: ReadonlySet<AudioKind>;
  /** Importert film (DEC-0047): mediesti → signert lenke. */
  filmUrls: Readonly<Record<string, string>> | null;
  /** Svart-hvitt er slått på i visningen: foreslås for eksporten (REQ-0573). */
  monochrome?: boolean;
  /**
   * Språkversjonen (DEC-0059, REQ-0348/0352): dialogspråket og undertekstene som brennes inn. Endres her og i
   * monteringen samtidig; `state`, `clips` og `audioItems` er allerede for dialogspråket.
   */
  language: FilmLanguage;
  onLanguage: (patch: Partial<FilmLanguage>) => void;
  subtitles: readonly SubtitleCue[];
}) {
  const quality = useQualityProfile(state);
  const appliedProfile = useRef<string | null>(null);
  const queueId = useRef<string | null>(null);
  const [profileResolution, setProfileResolution] = useState<string | null>(null);
  const [bitrateKbps, setBitrateKbps] = useState<number | null>(null);
  const [scope, setScope] = useState<Scope>("film");
  const [alphaOpen, setAlphaOpen] = useState(false);
  const alphaClip = clips.find(c => c.occurrenceId === selectedId);
  const alphaComposition = alphaClip?.compositionId ? state.compositions[alphaClip.compositionId] : undefined;
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  /** «Valgte scener» (DEC-0072): vilkårlige scener, også med hull mellom. */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [size, setSize] = useState<Size>("full");
  const [mono, setMono] = useState(monochrome);
  /** «video»: film med lyd. «dialogue»: bare dialogsporet som WAV (REQ-0350). */
  const [output, setOutput] = useState<"video" | "dialogue">("video");
  // Filformat og undertekster (DEC-0085): eget valg i nedlastingen
  const [container, setContainer] = useState<"mp4" | "webm">("mp4");
  const [subMode, setSubMode] = useState<"burn" | "srt" | "vtt" | "none">("burn");
  const [subFile, setSubFile] = useState<ReadyFile | null>(null);
  const [charFile, setCharFile] = useState<ReadyFile | null>(null);
  const separateLayers = hasSeparateCharacterLayers(state);
  const langName = languageWord(language.dialogue);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<(ReadyFile & { bytes: number }) | null>(null);
  const [shareSource, setShareSource] = useState<ShareSource | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // «Inkluder rulletekst» (MTS MT8, §26/§57): på som standard; valget filtrerer bare i eksporten
  const [includeCredits, setIncludeCredits] = useState(true);
  const abort = useRef<AbortController | null>(null);
  // Eksportloggen (REQ-0037, migrasjon 0028): registreres når filen er laget
  const recordExport = useRecordExport(state.project.id);

  // Standardvalg hver gang dialogen åpnes
  useEffect(() => {
    if (!open) return;
    appliedProfile.current = null;
    setReady(null);
    setShareSource(null);
    setSubFile(null);
    setCharFile(null);
    setError(null);
    setProgress(null);
    const first = clips[0]?.occurrenceId ?? "";
    const last = clips[clips.length - 1]?.occurrenceId ?? "";
    setFromId(selectedId ?? first);
    setToId(last);
    // Innstillingene sist brukt for produksjonen (DEC-0072, REQ-0407); ellers standard
    const saved = state.productions[productionId]?.exportSettings;
    setMono(saved ? saved.monochrome || monochrome : monochrome);
    if (saved) {
      setSize(saved.size);
      setOutput(saved.output);
    }
    setIncludeCredits(saved?.includeCredits ?? true);
    if (initialScope && (initialScope !== "selected" || selectedId)) setScope(initialScope);
    else if (scope === "selected" && !selectedId) setScope("film");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(
    () => () => {
      if (ready) URL.revokeObjectURL(ready.url);
    },
    [ready],
  );
  useEffect(() => {
    const key = quality.profile ? JSON.stringify(quality.profile) : null;
    if (!open || key === appliedProfile.current) return;
    appliedProfile.current = key;
    const preset = quality.profile?.spec.export;
    if (preset?.format === "mp4" || preset?.format === "webm") setContainer(preset.format);
    setBitrateKbps(preset?.bitrateKbps ?? null);
    setProfileResolution(quality.profile?.spec.resolution ?? null);
  }, [quality.profile, open]);

  const fps = state.project.fps;
  // Alle utvalg unntatt hele filmen går gjennom filmSelection: lyd og undertekster følger scenen sin, så lyd
  // fra scenen før ikke lekker inn i overlappen (KI-85, som «Valgte scener» etter KI-172)
  const exportClips = useMemo(
    () =>
      includeCredits
        ? clips
        : clips.filter((c) => state.occurrences[c.occurrenceId] !== undefined && occurrenceKind(state.occurrences[c.occurrenceId]!) !== "credits"),
    [clips, includeCredits, state],
  );
  const partSel = useMemo(
    () => exportSelection(exportClips, scope, { selectedId, fromId, toId, picked }),
    [exportClips, scope, selectedId, fromId, toId, picked],
  );
  const filmSel = useMemo(() => filmRange(exportClips, { kind: "film" }), [exportClips]);
  const sel = partSel ?? filmSel;
  const audioItems = useMemo(
    () =>
      partSel
        ? shiftAudioItems(allAudioItems, partSel.shiftOf, fps, partSel.runEndOf)
        : allAudioItems,
    [partSel, allAudioItems, fps],
  );
  const subtitles = useMemo(
    () =>
      partSel
        ? shiftCues(allSubtitles, clips, partSel.shiftOf, fps, partSel.runEndOf)
        : allSubtitles,
    [partSel, allSubtitles, clips, fps],
  );

  const fullW = state.project.frameWidth;
  const fullH = state.project.frameHeight;
  const targetSide = profileResolution === "1K" ? 1024 : profileResolution === "2K" ? 2048 : profileResolution === "4K" ? 4096 : Math.max(fullW, fullH);
  const scale = targetSide / Math.max(fullW, fullH) * (size === "half" ? 0.5 : 1);
  const outW = Math.max(2, Math.round(fullW * scale / 2) * 2);
  const outH = Math.max(2, Math.round(fullH * scale / 2) * 2);

  // Eksportkontroll (mandat 29.6): sceneorden, skjulte scener, materiale og manglende filer
  const { checks: baseChecks, paths, audioPaths, texts } = useMemo(() => {
    const out: Check[] = [];
    const n = sel.clips.length;
    out.push({
      level: n > 0 ? "ok" : "warn",
      text:
        n > 0
          ? L(
              `${n} ${n === 1 ? "scene" : "scener"} i manusets rekkefølge, ${formatSeconds(
                framesToSeconds(sel.endFrame - sel.startFrame, fps),
              )}.`,
              `${n} ${n === 1 ? "scene" : "scenes"} in script order, ${formatSeconds(
                framesToSeconds(sel.endFrame - sel.startFrame, fps),
              )}.`,
            )
          : L("Utvalget har ingen scener.", "The selection has no scenes."),
    });
    if (scope === "film") {
      const inactive = orderedOccurrences(state, productionId).filter((o) => !o.active).length;
      if (inactive > 0)
        out.push({
          level: "info",
          text: L(
            `${inactive} ${inactive === 1 ? "deaktivert scene er" : "deaktiverte scener er"} ikke med.`,
            `${inactive} ${inactive === 1 ? "deactivated scene is" : "deactivated scenes are"} not included.`,
          ),
        });
    }
    const placeholders = sel.clips.filter((c) => c.source === "placeholder");
    if (placeholders.length > 0)
      out.push({
        level: "warn",
        text: L(
          `${placeholders.length} ${
            placeholders.length === 1 ? "scene" : "scener"
          } uten 2D-scene vises som tittelkort (${placeholders
            .slice(0, 4)
            .map((c) => c.productionNumber ?? formatHeading(c.heading))
            .join(", ")}${placeholders.length > 4 ? " …" : ""}).`,
          `${placeholders.length} ${
            placeholders.length === 1 ? "scene" : "scenes"
          } without a 2D scene are shown as title cards (${placeholders
            .slice(0, 4)
            .map((c) => c.productionNumber ?? formatHeading(c.heading))
            .join(", ")}${placeholders.length > 4 ? " …" : ""}).`,
        ),
      });
    const films = sel.clips.filter((c) => c.source === "film");
    if (films.length > 0)
      out.push({
        level: filmMediaPaths(films).some((p) => !filmUrls?.[p]) ? "warn" : "ok",
        text: L(
          `${films.length} ${films.length === 1 ? "scene bruker" : "scener bruker"} film, AI-video eller stillbilde.`,
          `${films.length} ${films.length === 1 ? "scene uses" : "scenes use"} film, AI video or a still image.`,
        ),
      });
    const estimated = sel.clips.filter((c) => c.durationKind === "estimate").length;
    if (estimated > 0)
      out.push({
        level: "info",
        text: L(
          `${estimated} ${estimated === 1 ? "scene har" : "scener har"} lengde beregnet fra manuset.`,
          `${estimated} ${estimated === 1 ? "scene has" : "scenes have"} a length estimated from the script.`,
        ),
      });
    const need = new Set<string>();
    const texts: TextSpec[] = [];
    let missingVersions = 0;
    for (const c of sel.clips) {
      if (!c.compositionId || !c.parts.some((p) => p.source === "composition")) continue;
      for (const l of layersOf(state, c.compositionId)) {
        if (!l.visible) continue;
        if (l.kind === "text" && l.text) texts.push(l.text);
        const vs = layerVersions(state, l);
        for (const v of vs) need.add(v.mediaPath);
        if (vs.length === 0 && l.assetId !== null) missingVersions++;
      }
    }
    if (missingVersions > 0)
      out.push({
        level: "warn",
        text: L(
          `${missingVersions} ${missingVersions === 1 ? "lag mangler" : "lag mangler"} bilde i biblioteket og blir usynlige.`,
          `${missingVersions} ${missingVersions === 1 ? "layer is" : "layers are"} missing an image in the library and will be invisible.`,
        ),
      });
    // Lyd i utvalget
    const from = framesToSeconds(sel.startFrame, fps);
    const to = framesToSeconds(sel.endFrame, fps);
    const sounds = audioItems.filter(
      (it) => !it.clip.muted && it.start < to && it.start + it.length > from,
    );
    const audible = sounds.filter((it) => !mutedKinds.has(it.clip.kind));
    if (sounds.length > 0)
      out.push({
        level: "ok",
        text: L(
          `${audible.length} ${audible.length === 1 ? "lydklipp" : "lydklipp"} med i videoen${
            audible.length < sounds.length
              ? ` (${sounds.length - audible.length} i dempede spor er ikke med)`
              : ""
          }.`,
          `${audible.length} ${audible.length === 1 ? "audio clip" : "audio clips"} included in the video${
            audible.length < sounds.length
              ? ` (${sounds.length - audible.length} in muted tracks are not included)`
              : ""
          }.`,
        ),
      });
    const noFile = sounds.filter((it) => it.version === null).length;
    if (noFile > 0)
      out.push({
        level: "warn",
        text: L(
          `${noFile} ${noFile === 1 ? "lydklipp mangler" : "lydklipp mangler"} lydfil og blir stille.`,
          `${noFile} ${noFile === 1 ? "audio clip is" : "audio clips are"} missing an audio file and will be silent.`,
        ),
      });
    // Språkversjonen (DEC-0059)
    const mixed = sounds.filter(
      (it) =>
        it.film && it.film.audioLanguage !== "none" && it.film.audioLanguage !== language.dialogue,
    ).length;
    if (mixed > 0)
      out.push({
        level: "warn",
        text: L(
          `${mixed} ${mixed === 1 ? "filmklipp har" : "filmklipp har"} dialog på et annet språk blandet inn i lyden. Den kan ikke fjernes, og spilles som den er.`,
          `${mixed} ${mixed === 1 ? "film clip has" : "film clips have"} dialogue in another language mixed into the sound. It cannot be removed, and is played as it is.`,
        ),
      });
    const voices = dialogueItems(audible);
    if (output === "dialogue")
      out.push({
        level: voices.length > 0 ? "ok" : "warn",
        text:
          voices.length > 0
            ? L(
                `Dialogspor (${langName}): ${voices.length} ${voices.length === 1 ? "lydklipp" : "lydklipp"} med dialog og forteller. Musikk, effekter og lyden i importert film er ikke med.`,
                `Dialogue track (${langName}): ${voices.length} ${voices.length === 1 ? "audio clip" : "audio clips"} with dialogue and narration. Music, effects and the sound in imported film are not included.`,
              )
            : L(
                `Ingen dialog på ${langName} i utvalget – dialogsporet blir stille.`,
                `No dialogue in ${langName} in the selection – the dialogue track will be silent.`,
              ),
      });
    if (output === "dialogue" && to - from > STEM_MAX_SECONDS)
      out.push({
        level: "warn",
        text: L(
          `Dialogsporet lages for de første ${STEM_MAX_SECONDS / 3600} timene (grensen for WAV-filer). Velg et utvalg av scener for resten.`,
          `The dialogue track is made for the first ${STEM_MAX_SECONDS / 3600} hours (the limit for WAV files). Choose a selection of scenes for the rest.`,
        ),
      });
    if (output === "video" && language.subtitles && subMode === "burn") {
      const n = subtitles.filter((c) => c.startMs < to * 1000 && c.endMs > from * 1000).length;
      out.push({
        level: n > 0 ? "ok" : "warn",
        text:
          n > 0
            ? L(
                `${n} undertekster på ${languageWord(language.subtitles)} brennes inn i bildet.`,
                `${n} subtitles in ${languageWord(language.subtitles)} are burned into the image.`,
              )
            : L(
                "Ingen undertekster i utvalget (replikkene mangler oversettelse eller tid).",
                "No subtitles in the selection (the lines lack a translation or timing).",
              ),
      });
    }
    const usedAudio = output === "dialogue" ? voices : audible;
    const audioPaths = [
      ...new Set(usedAudio.flatMap((it) => (it.version ? [it.version.mediaPath] : []))),
    ];
    return { checks: out, paths: output === "dialogue" ? [] : [...need], audioPaths, texts };
  }, [
    sel,
    scope,
    state,
    productionId,
    fps,
    audioItems,
    mutedKinds,
    filmUrls,
    output,
    language,
    langName,
    subtitles,
  ]);

  // Fontene for tekstlagene (MTS §61): lastes nå; eksporten venter på dem. Manglende font gir advarsel.
  const fontState = useTextFonts(output === "dialogue" ? [] : texts);
  const checks: Check[] =
    fontState.missing.length > 0
      ? [
          ...baseChecks,
          {
            level: "warn",
            text: L(
              `Fonten mangler: ${fontState.missing.join(", ")}. Teksten tegnes med en reservefont.`,
              `Missing font: ${fontState.missing.join(", ")}. The text is drawn with a fallback font.`,
            ),
          },
        ]
      : baseChecks;
  const warnings = checks.some((c) => c.level === "warn");
  const busy = progress !== null && ready === null && error === null;
  const supported = canExportVideo();

  function enqueueExport() {
    const snapshot = quality.profile ? qualityProfileSnapshot(quality.profile) : null;
    setProgress({ done: 0, total: sel.endFrame - sel.startFrame });
    queueId.current = exportQueue.enqueue(state.project.name, async (signal, report) => {
      await run(signal, report);
    }, snapshot);
  }
  async function run(queueSignal: AbortSignal, report: (done: number, total: number) => void) {
    setError(null);
    const saved = state.productions[productionId]?.exportSettings;
    if (
      onSaveSettings &&
      (!saved || saved.size !== size || saved.monochrome !== mono || saved.output !== output)
    )
      onSaveSettings({ size, monochrome: mono, output, includeCredits });
    setReady(null);
    setShareSource(null);
    setSubFile(null);
    setCharFile(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    queueSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
    if (queueSignal.aborted) ctrl.abort();
    setProgress({ done: 0, total: sel.endFrame - sel.startFrame });
    try {
      const subset: Record<string, string> = {};
      const missingUrl: string[] = [];
      for (const p of paths) {
        const u = urls?.[p];
        if (u) subset[p] = u;
        else missingUrl.push(p);
      }
      const audioSubset: Record<string, string> = {};
      for (const p of audioPaths) {
        const u = audioUrls?.[p];
        if (u) audioSubset[p] = u;
      }
      const [{ images, failed }] = await Promise.all([
        loadImages(subset),
        audioBank.loadAll(audioSubset),
      ]);
      const lostAudio = audioPaths.filter((p) => !audioBank.get(p)).length;
      if (ctrl.signal.aborted) throw new DOMException(L("Avbrutt", "Cancelled"), "AbortError");
      const date = new Date().toISOString().slice(0, 10);
      const what =
        scope === "film"
          ? "animatic"
          : scope === "pick" && sel.clips.length > 1
            ? L(`${sel.clips.length} scener`, `${sel.clips.length} scenes`)
            : sel.clips.length === 1
              ? L(
                  `scene ${sel.clips[0]!.productionNumber ?? ""}`.trim(),
                  `scene ${sel.clips[0]!.productionNumber ?? ""}`.trim(),
                )
              : L(
                  `scener ${sel.clips[0]!.productionNumber ?? ""}–${sel.clips[sel.clips.length - 1]!.productionNumber ?? ""}`,
                  `scenes ${sel.clips[0]!.productionNumber ?? ""}–${sel.clips[sel.clips.length - 1]!.productionNumber ?? ""}`,
                );
      if (output === "dialogue") {
        // Bare dialogsporet som WAV (DEC-0059, REQ-0350)
        const stem = await exportDialogueStemParts({
          items: audioItems.filter((it) => !mutedKinds.has(it.clip.kind)),
          bank: audioBank,
          from: framesToSeconds(sel.startFrame, fps),
          seconds: framesToSeconds(sel.endFrame - sel.startFrame, fps),
          signal: ctrl.signal,
          onProgress: (done, total) => {
            if (abort.current === ctrl)
              setProgress({
                done: Math.round((done / Math.max(1e-9, total)) * (sel.endFrame - sel.startFrame)),
                total: sel.endFrame - sel.startFrame,
              });
          },
        });
        if (abort.current !== ctrl || ctrl.signal.aborted) return;
        const name = safeName(
          `${state.project.name} – ${what} – ${L("dialog", "dialogue")} ${langName} – ${date}.wav`,
        );
        const f = prepareDownload(stem.parts, name, "audio/wav");
        setReady({ ...f, bytes: stem.bytes });
        recordExport({
          productionId,
          kind: "audio",
          fileName: name,
          settings: { output, scope, language: language.dialogue, qualityProfileId: quality.profile?.id ?? null, qualityProfileName: quality.profile?.name ?? null, qualityProfileSnapshot: quality.profile ? JSON.stringify(qualityProfileSnapshot(quality.profile)) : null },
          occurrenceIds: sel.clips.map((c) => c.occurrenceId),
        });
        if (lostAudio > 0)
          setError(
            L(
              `Ferdig, men ${lostAudio} ${lostAudio === 1 ? "lydfil" : "lydfiler"} kunne ikke leses og mangler.`,
              `Done, but ${lostAudio} ${lostAudio === 1 ? "audio file" : "audio files"} could not be read and are missing.`,
            ),
          );
        return;
      }
      const file = await exportAnimatic({
        state,
        // Bare utvalget: et utsnitt begynner og slutter rent (ingen overgang fra scener utenfor)
        clips: sel.clips,
        startFrame: sel.startFrame,
        endFrame: sel.endFrame,
        width: outW,
        height: outH,
        fps,
        monochrome: mono,
        images,
        signal: ctrl.signal,
        audio: { items: audioItems, bank: audioBank, mutedKinds },
        // Nye lenker rett før eksporten (en lang eksport skal ikke treffe lenker som går ut)
        filmUrls: await freshFilmUrls(sel.clips, filmUrls),
        // Undertekstene brennes bare inn når det er valgt (DEC-0085)
        ...(language.subtitles && subMode === "burn" ? { subtitles } : {}),
        bitrateKbps,
        mp4: container === "mp4",
        webm: container === "webm",
        // CA8: karakterlag satt til «eget lag» utelates fra hovedfilmen og lages som egen fil
        ...(separateLayers ? { characterPass: "main" as const } : {}),
        onProgress: (done, total) => {
          if (abort.current === ctrl) { setProgress({ done, total }); report(done, total); }
        },
      });
      // Dialogen ble lukket (eller en ny eksport startet) mens denne pågikk
      if (abort.current !== ctrl || ctrl.signal.aborted) return;
      // Språket i filnavnet når det ikke er hovedspråket (DEC-0059)
      const lang = language.dialogue === MAIN_LANGUAGE ? "" : ` – ${langName}`;
      const name = safeName(
        `${state.project.name} – ${what}${lang} – ${date}.${file.extension.replace(/^\./, "")}`,
      );
      const f = prepareDownload(file.bytes, name, file.mimeType);
      setReady({ ...f, bytes: file.bytes.byteLength });
      if (separateLayers) {
        const layers = await exportAnimatic({
          state, clips: sel.clips, startFrame: sel.startFrame, endFrame: sel.endFrame, width: outW, height: outH, fps,
          images, signal: ctrl.signal, mp4: container === "mp4", webm: container === "webm", characterPass: "separate",
        });
        if (abort.current !== ctrl || ctrl.signal.aborted) return;
        const layerName = name.replace(/(\.[^.]+)$/, `${L(" – karakterlag", " – character layers")}.${layers.extension.replace(/^\./, "")}`);
        setCharFile(prepareDownload(layers.bytes, layerName, layers.mimeType));
      }
      // Undertekstene som egen fil (SRT/VTT), med samme tider som videoen
      if (language.subtitles && (subMode === "srt" || subMode === "vtt")) {
        const from = (sel.startFrame * fps.den * 1000) / fps.num;
        const to = (sel.endFrame * fps.den * 1000) / fps.num;
        const cues = subtitles
          .filter((c) => c.startMs < to && c.endMs > from)
          .map((c) => ({
            ...c,
            startMs: Math.max(0, c.startMs - from),
            endMs: Math.min(to, c.endMs) - from,
          }));
        const text = subMode === "srt" ? toSrt(cues) : toVtt(cues);
        const subName = name.replace(/\.[^.]+$/, `.${subMode}`);
        setSubFile(
          prepareDownload(
            new TextEncoder().encode(text),
            subName,
            subMode === "srt" ? "application/x-subrip" : "text/vtt",
          ),
        );
      }
      const recordP = recordExport({
        productionId,
        kind: "film",
        fileName: name,
        settings: {
          output,
          scope,
          size,
          width: outW,
          height: outH,
          monochrome: mono,
          language: language.dialogue,
          subtitles: !!language.subtitles && subMode !== "none",
          subtitleMode: language.subtitles ? subMode : "none",
          subtitleLanguage: language.subtitles,
          format: container, bitrateKbps, qualityProfileId: quality.profile?.id ?? null, qualityProfileName: quality.profile?.name ?? null, qualityProfileSnapshot: quality.profile ? JSON.stringify(qualityProfileSnapshot(quality.profile)) : null,
        },
        occurrenceIds: sel.clips.map((c) => c.occurrenceId),
      });
      // QR-deling (GP5): bundet til denne filmversjonen
      setShareSource({
        file: new Blob([file.bytes as BlobPart], { type: file.mimeType }),
        mimeType: file.mimeType,
        codec: file.codec,
        audioCodec: file.audioCodec,
        bytes: file.bytes.byteLength,
        width: outW,
        height: outH,
        durationMs: Math.max(1, Math.round(((sel.endFrame - sel.startFrame) * fps.den * 1000) / fps.num)),
        title: `${state.project.name} – ${what}`,
        exportRecord: recordP,
        // Delingen gjelder alltid denne eksporterte filmversjonen (MTS MT8)
        creditsIncluded: includeCredits,
      });
      const lost = failed.length + missingUrl.length;
      const notes: string[] = [];
      if (lost > 0)
        notes.push(
          L(
            `${lost} ${lost === 1 ? "bilde" : "bilder"} kunne ikke lastes og mangler i videoen`,
            `${lost} ${lost === 1 ? "image" : "images"} could not be loaded and are missing from the video`,
          ),
        );
      if (lostAudio > 0)
        notes.push(
          L(
            `${lostAudio} ${lostAudio === 1 ? "lydfil" : "lydfiler"} kunne ikke leses og mangler`,
            `${lostAudio} ${lostAudio === 1 ? "audio file" : "audio files"} could not be read and are missing`,
          ),
        );
      if (audioPaths.length > lostAudio && file.audioCodec === null)
        notes.push(
          L(
            "nettleseren kunne ikke kode lyd, så videoen er uten lyd",
            "the browser could not encode audio, so the video has no sound",
          ),
        );
      if (notes.length)
        setError(L(`Ferdig, men ${notes.join("; ")}.`, `Done, but ${notes.join("; ")}.`));
    } catch (e) {
      if (abort.current !== ctrl) return;
      if ((e as Error).name === "AbortError") setProgress(null);
      else
        setError(
          e instanceof ExportError
            ? e.message
            : L(
                `Eksporten stoppet: ${(e as Error).message || "ukjent feil"}`,
                `The export stopped: ${(e as Error).message || "unknown error"}`,
              ),
        );
      throw e;
    } finally {
      if (abort.current === ctrl) { abort.current = null; setProgress(null); }
    }
  }

  const radio = "flex items-start gap-2 text-[13px] text-text-primary";
  const legend = "mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary";
  const select =
    "h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <>
    {alphaComposition && alphaOpen ? <AlphaExportDialog state={state} composition={alphaComposition} open={alphaOpen} onOpenChange={setAlphaOpen} /> : null}
    <Dialog open={open && !alphaOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{L("Eksporter animatic", "Export animatic")}</DialogTitle>
          <DialogDescription>
            {L(
              "Videoen lages her i nettleseren av alt som er i filmen – 2D-scener, importert film, AI-video og lydsporene – uten nye kostnader. Eksporten endrer ingenting i prosjektet.",
              "The video is made here in the browser from everything in the film – 2D scenes, imported film, AI video and the audio tracks – at no extra cost. The export changes nothing in the project.",
            )}{" "}
            {L("Produksjon:", "Production:")}{" "}
            <strong>{state.productions[productionId]?.name ?? "–"}</strong>{" "}
            {L(
              "(en spinoff, trailer eller pitchfilm velges øverst i monteringen).",
              "(a spin-off, trailer or pitch film is chosen at the top of the assembly).",
            )}
          </DialogDescription>
        </DialogHeader>
        <QualityProfilePicker state={state} value={quality.choice} disabled={busy} onChange={quality.setChoice} />
        <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
          <label>{L("Oppløsning", "Resolution")} <select data-testid="export-profile-resolution" value={profileResolution ?? ""} disabled={busy} onChange={e => setProfileResolution(e.target.value || null)} className="h-7 border border-border-control bg-surface-3"><option value="">{L("Prosjektformat", "Project format")}</option>{["1K","2K","4K"].map(r => <option key={r}>{r}</option>)}</select></label>
          <label>{L("Bitrate (kbps)", "Bitrate (kbps)")} <input data-testid="export-profile-bitrate" type="number" min={100} max={100000} value={bitrateKbps ?? ""} disabled={busy} onChange={e => setBitrateKbps(e.target.value ? Number(e.target.value) : null)} className="h-7 w-24 border border-border-control bg-surface-3" /></label>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <fieldset className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-3" disabled={busy}>
            <legend className={legend}>{L("Hva", "What")}</legend>
            <label className={radio}>
              <input
                type="radio"
                name="scope"
                checked={scope === "film"}
                onChange={() => setScope("film")}
                className="mt-1"
              />
              <span>
                {L("Hele filmen", "The whole film")}
                <span className="block text-xs text-text-tertiary">
                  {L("Alle aktive scener", "All active scenes")}
                </span>
              </span>
            </label>
            <label className={radio + (selectedId ? "" : " opacity-50")}>
              <input
                type="radio"
                name="scope"
                disabled={!selectedId}
                checked={scope === "selected"}
                onChange={() => setScope("selected")}
                className="mt-1"
              />
              <span>
                {L("Valgt scene", "Selected scene")}
                <span className="block text-xs text-text-tertiary">
                  {selectedId
                    ? (() => {
                        const c = clips.find((x) => x.occurrenceId === selectedId);
                        return c
                          ? `${c.productionNumber ?? ""} ${formatHeading(c.heading)}`.trim()
                          : "–";
                      })()
                    : L("Velg en scene i tidslinjen først", "Select a scene in the timeline first")}
                </span>
              </span>
            </label>
            <label className={radio}>
              <input
                type="radio"
                name="scope"
                checked={scope === "range"}
                onChange={() => setScope("range")}
                className="mt-1"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                {L("Fra scene til scene", "From scene to scene")}
                {/* Lange scenehoder skal ikke presse valgene ut av kolonnen */}
                <span className="flex min-w-0 flex-col gap-1 overflow-hidden text-xs text-text-tertiary">
                  <select
                    aria-label={L("Første scene", "First scene")}
                    value={fromId}
                    onChange={(e) => {
                      setFromId(e.target.value);
                      setScope("range");
                    }}
                    className={select + " w-full max-w-full truncate"}
                  >
                    {clips.map((c) => (
                      <option key={c.occurrenceId} value={c.occurrenceId}>
                        {c.productionNumber ?? "–"} {formatHeading(c.heading)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={L("Siste scene", "Last scene")}
                    value={toId}
                    onChange={(e) => {
                      setToId(e.target.value);
                      setScope("range");
                    }}
                    className={select + " w-full max-w-full truncate"}
                  >
                    {clips.map((c) => (
                      <option key={c.occurrenceId} value={c.occurrenceId}>
                        {c.productionNumber ?? "–"} {formatHeading(c.heading)}
                      </option>
                    ))}
                  </select>
                </span>
              </span>
            </label>
            <label className={radio}>
              <input
                type="radio"
                name="scope"
                checked={scope === "pick"}
                onChange={() => setScope("pick")}
                className="mt-1"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                {L("Valgte scener", "Selected scenes")}
                <span className="block text-xs text-text-tertiary">
                  {L(
                    "Kryss av scenene; de settes etter hverandre i filmens rekkefølge",
                    "Tick the scenes; they are put one after another in the film's order",
                  )}
                </span>
              </span>
            </label>
            {scope === "pick" ? (
              <div className="flex flex-col gap-1">
                <ul
                  aria-label={L("Scener i eksporten", "Scenes in the export")}
                  className="max-h-40 overflow-y-auto border border-border bg-surface-1"
                >
                  {clips.map((c) => (
                    <li key={c.occurrenceId}>
                      <label className="flex items-center gap-2 px-2 py-0.5 text-xs text-text-primary">
                        <input
                          type="checkbox"
                          checked={picked.has(c.occurrenceId)}
                          onChange={(e) => {
                            const next = new Set(picked);
                            if (e.target.checked) next.add(c.occurrenceId);
                            else next.delete(c.occurrenceId);
                            setPicked(next);
                          }}
                        />
                        <span className="truncate">
                          {c.productionNumber ?? "–"} {formatHeading(c.heading)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <span className="flex gap-2 text-[11px]">
                  <button
                    type="button"
                    className="text-text-secondary hover:underline"
                    onClick={() => setPicked(new Set(clips.map((c) => c.occurrenceId)))}
                  >
                    {L("Alle", "All")}
                  </button>
                  <button
                    type="button"
                    className="text-text-secondary hover:underline"
                    onClick={() => setPicked(new Set())}
                  >
                    {L("Ingen", "None")}
                  </button>
                </span>
              </div>
            ) : null}
          </fieldset>

          <fieldset className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-3" disabled={busy}>
            <legend className={legend}>{L("Størrelse", "Size")}</legend>
            <label className={radio}>
              <input
                type="radio"
                name="size"
                checked={size === "full"}
                onChange={() => setSize("full")}
                className="mt-1"
              />
              <span>
                {L("Full størrelse", "Full size")}
                <span className="block text-xs text-text-tertiary">
                  {fullW} × {fullH} px
                </span>
              </span>
            </label>
            <label className={radio}>
              <input
                type="radio"
                name="size"
                checked={size === "half"}
                onChange={() => setSize("half")}
                className="mt-1"
              />
              <span>
                {L("Halv størrelse", "Half size")}
                <span className="block text-xs text-text-tertiary">
                  {Math.round(fullW / 2)} × {Math.round(fullH / 2)} px –{" "}
                  {L("raskere og mindre fil", "faster and a smaller file")}
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 pt-1 text-[13px] text-text-primary">
              <input
                type="checkbox"
                checked={mono}
                onChange={(e) => setMono(e.target.checked)}
                className="size-3.5 accent-[var(--accent-brand)]"
              />
              {L("Hele filmen i svart-hvitt", "The whole film in black and white")}
            </label>
            <label className="flex items-center gap-2 pt-1 text-[13px] text-text-primary">
              <input
                type="checkbox"
                data-testid="export-include-credits"
                checked={includeCredits}
                onChange={(e) => setIncludeCredits(e.target.checked)}
                className="size-3.5 accent-[var(--accent-brand)]"
              />
              {L("Inkluder rulletekst", "Include credits")}
            </label>
            <p className="pt-1 text-xs text-text-tertiary">
              {L(
                "Scener som er satt til svart-hvitt, blir det uansett. Med lyden fra lydsporene (dempede spor er ikke med). Filformat og undertekster velges under.",
                "Scenes set to black and white stay that way. With the sound from the audio tracks (muted tracks are not included). File format and subtitles are chosen below.",
              )}
            </p>
          </fieldset>
        </div>

        <fieldset className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-3" disabled={busy}>
          <legend className={legend}>{L("Språk og innhold", "Language and content")}</legend>
          <FilmLanguagePicker value={language} onChange={onLanguage} />
          <div className="flex flex-wrap gap-4">
            <label className={radio}>
              <input
                type="radio"
                name="output"
                checked={output === "video"}
                onChange={() => setOutput("video")}
                className="mt-1"
              />
              <span>
                {L("Video", "Video")}
                <span className="block text-xs text-text-tertiary">
                  {L("Bilde og all lyd på", "Picture and all sound in")} {langName}
                  {language.subtitles && subMode === "burn"
                    ? L(", med undertekster i bildet", ", with subtitles in the picture")
                    : ""}
                </span>
              </span>
            </label>
            <label className={radio}>
              <input
                type="radio"
                name="output"
                checked={output === "dialogue"}
                onChange={() => setOutput("dialogue")}
                className="mt-1"
              />
              <span>
                {L("Bare dialogspor (WAV)", "Dialogue track only (WAV)")}
                <span className="block text-xs text-text-tertiary">
                  {L("Dialog og forteller på", "Dialogue and narration in")} {langName}
                  {L(", uten musikk og effekter", ", without music and effects")}
                </span>
              </span>
            </label>
          </div>
          {output === "video" ? (
            <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
              <label className="flex items-center gap-1.5">
                {L("Filformat", "File format")}
                <select
                  value={container}
                  onChange={(e) => setContainer(e.target.value as "mp4" | "webm")}
                  className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                  data-testid="export-format"
                >
                  <option value="mp4">
                    {L("MP4 (H.264 – spilles overalt)", "MP4 (H.264 – plays everywhere)")}
                  </option>
                  <option value="webm">
                    {L("WebM (VP9 – mindre fil)", "WebM (VP9 – smaller file)")}
                  </option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                {L("Undertekster", "Subtitles")}
                <select
                  value={language.subtitles ? subMode : "none"}
                  disabled={!language.subtitles}
                  onChange={(e) => setSubMode(e.target.value as typeof subMode)}
                  className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary disabled:opacity-50"
                  data-testid="export-subtitles"
                  title={
                    language.subtitles
                      ? undefined
                      : L(
                          "Velg et språk for undertekster over for å få undertekster",
                          "Choose a subtitle language above to get subtitles",
                        )
                  }
                >
                  <option value="burn">{L("Brent inn i bildet", "Burned into the picture")}</option>
                  <option value="srt">{L("Egen fil (SRT)", "Separate file (SRT)")}</option>
                  <option value="vtt">{L("Egen fil (WebVTT)", "Separate file (WebVTT)")}</option>
                  <option value="none">{L("Ingen", "None")}</option>
                </select>
              </label>
            </div>
          ) : null}
        </fieldset>

        <section
          aria-label={L("Kontroll før eksport", "Check before export")}
          className="flex flex-col gap-1.5"
        >
          <h3 className={legend}>{L("Kontroll før eksport", "Check before export")}</h3>
          <ul className="flex flex-col gap-1">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                {c.level === "ok" ? (
                  <CheckCircle2
                    className="mt-px size-3.5 shrink-0 text-status-success"
                    aria-label={L("OK", "OK")}
                  />
                ) : c.level === "warn" ? (
                  <AlertTriangle
                    className="mt-px size-3.5 shrink-0 text-status-discrepancy"
                    aria-label={L("Merk", "Note")}
                  />
                ) : (
                  <Info
                    className="mt-px size-3.5 shrink-0 text-text-tertiary"
                    aria-label={L("Info", "Info")}
                  />
                )}
                {c.text}
              </li>
            ))}
          </ul>
        </section>

        {!supported ? (
          <p role="alert" className="text-xs text-status-danger">
            {L(
              "Denne nettleseren kan ikke lage video. Bruk en nyere utgave av Chrome, Edge, Safari eller Firefox.",
              "This browser cannot make video. Use a newer version of Chrome, Edge, Safari or Firefox.",
            )}
          </p>
        ) : null}

        {progress && !ready ? (
          <div data-testid="export-progress" className="flex flex-col gap-1.5 rounded-sm border border-accent-brand/50 bg-accent-selection p-3" aria-live="polite">
            <p className="text-[13px] font-medium text-text-primary">{L("Eksporterer …", "Exporting …")}</p>
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={L("Fremdrift", "Progress")}
              className="h-2 overflow-hidden rounded-full bg-surface-3"
            >
              <div
                className="h-full bg-accent-brand transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-text-tertiary">
              {L("Bilde", "Image")} {progress.done} {L("av", "of")} {progress.total} (
              {formatTimecode(progress.done, fps)}) – {pct} %
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-sm border border-status-danger/50 bg-status-danger-bg p-3 text-xs text-status-danger">
            {error}
          </p>
        ) : null}

        {ready ? (
          <p
            data-testid="export-done"
            className="flex flex-wrap items-center gap-2 rounded-sm border border-status-success/50 bg-status-success-bg p-3 text-xs text-text-secondary"
            role="status"
          >
            <CheckCircle2 className="size-4 shrink-0 text-status-success" aria-hidden />
            {L("Ferdig:", "Done:")} {ready.name} (
            {(ready.bytes / 1024 / 1024).toLocaleString(locale(), {
              maximumFractionDigits: 1,
            })}{" "}
            MB).
            <a
              href={ready.url}
              download={ready.name}
              className="inline-flex items-center gap-1 text-accent-brand hover:underline"
            >
              <Download className="size-3.5" aria-hidden />
              {L("Last ned", "Download")}
            </a>
            {shareSource ? (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="inline-flex items-center gap-1 text-accent-brand hover:underline"
                data-testid="film-share-open"
              >
                <QrCodeIcon className="size-3.5" aria-hidden />
                {L("Del med QR-kode …", "Share with QR code …")}
              </button>
            ) : null}
            {charFile ? (
              <a
                href={charFile.url}
                download={charFile.name}
                data-testid="export-character-layers"
                className="inline-flex items-center gap-1 text-accent-brand hover:underline"
              >
                <Download className="size-3.5" aria-hidden />
                {L("Last ned karakterlagene", "Download the character layers")}
              </a>
            ) : null}
            {subFile ? (
              <a
                href={subFile.url}
                download={subFile.name}
                className="inline-flex items-center gap-1 text-accent-brand hover:underline"
              >
                <Download className="size-3.5" aria-hidden />
                {L("Last ned undertekstene", "Download the subtitles")}
              </a>
            ) : null}
            {isEmbedded() ? (
              <span className="text-text-tertiary">
                {L(
                  "Hvis nedlastingen ikke starter: åpne programmet i en egen fane.",
                  "If the download does not start: open the app in a separate tab.",
                )}
              </span>
            ) : null}
          </p>
        ) : null}

        <ExportHistory productionId={productionId} kinds={["film", "audio"]} />
        <Button variant="outline" size="sm" data-testid="export-alpha-open" disabled={busy || !alphaComposition} onClick={() => setAlphaOpen(true)} title={L("Velg en scene med 2D-komposisjon i monteringen.", "Select a scene with a 2D composition in the assembly.")}>
          <Download />{L("Eksporter lag med gjennomsiktighet …", "Export layers with transparency …")}
        </Button>

        <DialogFooter>
          {busy ? (
            <Button variant="ghost" onClick={() => queueId.current ? exportQueue.cancel(queueId.current) : abort.current?.abort()}>
              {L("Avbryt", "Cancel")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {L("Lukk", "Close")}
            </Button>
          )}
          <Button
            onClick={enqueueExport}
            disabled={
              busy ||
              (!supported && output === "video") ||
              sel.clips.length === 0 ||
              (urls === null && paths.length > 0)
            }
          >
            <Download />
            {warnings ? L("Eksporter likevel", "Export anyway") : L("Eksporter", "Export")}
          </Button>
        </DialogFooter>
      </DialogContent>
      {shareSource ? (
        <FilmShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          projectId={state.project.id}
          source={shareSource}
        />
      ) : null}
    </Dialog>
    </>
  );
}
