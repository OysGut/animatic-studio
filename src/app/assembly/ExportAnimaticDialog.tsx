/**
 * Eksport av animatic (M4 del 1, mandat 14.2, 29.1 og 29.6, DEC-0043): hele filmen, valgt scene eller et
 * utvalg av scener, som video laget i nettleseren – uten AI og uten betalte tjenester (REQ-0213/0416).
 * Før eksporten vises en kontroll (REQ-0422); man kan eksportere selv om noe mangler (REQ-0423).
 * Eksporten endrer ingenting i prosjektet.
 */
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { SceneSelect, mainOccurrenceOfScene } from "@/app/shell/SceneSelect";
import { SceneMark } from "@/app/shell/SceneMark";
import { AlertTriangle, CheckCircle2, Download, Info } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { filmMediaPaths, filmRange, shiftAudioItems, shiftCues, formatHeading, formatTimecode, framesToSeconds, layerVersion, layerVersions, layersOf, orderedOccurrences, LANGUAGE_LABEL, MAIN_LANGUAGE, exportImageSource, storyboardAudioItems, type ExportImageSource, type SubtitleCue, type AudioKind, type FilmAudioItem, type ExportSettings, type FilmClip, type ProjectState, qualityProfileSnapshot, locale, languageWord, toSrt, toVtt } from "@/core";
import { useTextFonts } from "@/engine/typography/fonts";
import type { TextSpec } from "@/core";
import { ExportError, canExportVideo, exportAnimatic, loadImages } from "@/engine/export/animatic";
import { supportsProRes } from "@/engine/export/prores-support";
import { PRORES_FILM_KINDS, PRORES_NAME, PRORES_UNSUPPORTED, formatBytes, proresBytesEstimate, type ProResKind } from "@/core/prores-export";
import { openAlphaSink } from "@/engine/export/alpha";
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
import { ShotlistExport } from "./ShotlistExport";
import { StoryboardPrintExport } from "./StoryboardPrintExport";
import { t, tLocalized } from "@/core/i18n/keyed";

type Scope = ExportScope;
type Size = "full" | "half";
const IMAGE_SOURCE_KEY = tLocalized<ExportImageSource>({
  animation: "sb4.export.source-animation",
  film: "sb4.export.source-film",
  storyboard: "sb4.export.source-storyboard",
});

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
  // R4: ProRes-profilen for filmeksport (422 HQ som standard; 422, LT og Proxy valgfritt)
  const [proresKind, setProresKind] = useState<ProResKind>("hq");
  const [scope, setScope] = useState<Scope>("film");
  // SB-4: bildet i eksporten kan komme fra animasjonen (som før), importert film eller storyboardpanelene.
  const [imageSource, setImageSource] = useState<ExportImageSource>("animation");
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
  const [container, setContainer] = useState<"mp4" | "webm" | "mov">("mp4");
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
    else if (preset?.format === "prores" && supportsProRes()) setContainer("mov");
    setBitrateKbps(preset?.bitrateKbps ?? null);
    setProfileResolution(quality.profile?.spec.resolution ?? null);
  }, [quality.profile, open]);

  const fps = state.project.fps;
  // SB-4: bildekilden velges her; «animasjon» er dagens oppførsel uendret. Adapteren gir en visning
  // (state + klipp) – prosjektdata endres aldri. Lyden er alltid den samme filmlyden, flyttet i tid.
  const adapted = useMemo(() => exportImageSource(state, clips, imageSource), [state, clips, imageSource]);
  const exState = adapted.state;
  const exClips = adapted.clips;
  const exAudioItems = useMemo(
    () => (imageSource === "storyboard" ? storyboardAudioItems(clips, adapted.shots, allAudioItems, fps) : allAudioItems),
    [imageSource, clips, adapted, allAudioItems, fps],
  );
  // Alle utvalg unntatt hele filmen går gjennom filmSelection: lyd og undertekster følger scenen sin, så lyd
  // fra scenen før ikke lekker inn i overlappen (KI-85, som «Valgte scener» etter KI-172)
  const exportClips = useMemo(
    () =>
      includeCredits
        ? exClips
        : exClips.filter((c) => exState.occurrences[c.occurrenceId] !== undefined && occurrenceKind(exState.occurrences[c.occurrenceId]!) !== "credits"),
    [exClips, includeCredits, exState],
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
        ? shiftAudioItems(exAudioItems, partSel.shiftOf, fps, partSel.runEndOf)
        : exAudioItems,
    [partSel, exAudioItems, fps],
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
          ? t("app-assembly-export-animatic-dialog.scenes-in-order", { count: n, duration: formatSeconds(framesToSeconds(sel.endFrame - sel.startFrame, fps)) })
          : t("app-assembly-export-animatic-dialog.text.text.75885539b60d"),
    });
    if (scope === "film") {
      const inactive = orderedOccurrences(exState, productionId).filter((o) => !o.active).length;
      if (inactive > 0)
        out.push({
          level: "info",
          text: t("app-assembly-export-animatic-dialog.inactive-not-included", { count: inactive }),
        });
    }
    const placeholders = sel.clips.filter((c) => c.source === "placeholder");
    if (placeholders.length > 0)
      out.push({
        level: "warn",
        text: t("app-assembly-export-animatic-dialog.placeholders-title-cards", { count: placeholders.length, scenes: placeholders.slice(0, 4).map((c) => c.productionNumber ?? formatHeading(c.heading)).join(", ") + (placeholders.length > 4 ? " …" : "") }),
      });
    const films = sel.clips.filter((c) => c.source === "film");
    if (films.length > 0)
      out.push({
        level: filmMediaPaths(films).some((p) => !filmUrls?.[p]) ? "warn" : "ok",
        text: t("app-assembly-export-animatic-dialog.scenes-use-film", { count: films.length }),
      });
    const estimated = sel.clips.filter((c) => c.durationKind === "estimate").length;
    if (estimated > 0)
      out.push({
        level: "info",
        text: t("app-assembly-export-animatic-dialog.scenes-estimated", { count: estimated }),
      });
    const need = new Set<string>();
    const texts: TextSpec[] = [];
    let missingVersions = 0;
    for (const c of sel.clips) {
      if (!c.compositionId || !c.parts.some((p) => p.source === "composition")) continue;
      for (const l of layersOf(exState, c.compositionId)) {
        if (!l.visible) continue;
        if (l.kind === "text" && l.text) texts.push(l.text);
        const vs = layerVersions(exState, l);
        for (const v of vs) need.add(v.mediaPath);
        if (vs.length === 0 && l.assetId !== null) missingVersions++;
      }
    }
    if (missingVersions > 0)
      out.push({
        level: "warn",
        text: t("app-assembly-export-animatic-dialog.layers-missing-image", { count: missingVersions }),
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
        text: audible.length < sounds.length ? t("app-assembly-export-animatic-dialog.audio-clips-included-muted", { count: audible.length, muted: sounds.length - audible.length }) : t("app-assembly-export-animatic-dialog.audio-clips-included", { count: audible.length }),
      });
    const noFile = sounds.filter((it) => it.version === null).length;
    if (noFile > 0)
      out.push({
        level: "warn",
        text: t("app-assembly-export-animatic-dialog.audio-clips-no-file", { count: noFile }),
      });
    // Språkversjonen (DEC-0059)
    const mixed = sounds.filter(
      (it) =>
        it.film && it.film.audioLanguage !== "none" && it.film.audioLanguage !== language.dialogue,
    ).length;
    if (mixed > 0)
      out.push({
        level: "warn",
        text: t("app-assembly-export-animatic-dialog.film-clips-mixed-dialogue", { count: mixed }),
      });
    const voices = dialogueItems(audible);
    if (output === "dialogue")
      out.push({
        level: voices.length > 0 ? "ok" : "warn",
        text:
          voices.length > 0
            ? t("app-assembly-export-animatic-dialog.dialogue-track", { count: voices.length, language: langName })
            : t("app-assembly-export-animatic-dialog.text.text.5bf200104906", { langName: String(langName) }),
      });
    if (output === "dialogue" && to - from > STEM_MAX_SECONDS)
      out.push({
        level: "warn",
        text: t("app-assembly-export-animatic-dialog.text.text.c8d201ba6102", { value1: String(STEM_MAX_SECONDS / 3600) }),
      });
    if (output === "video" && language.subtitles && subMode === "burn") {
      const n = subtitles.filter((c) => c.startMs < to * 1000 && c.endMs > from * 1000).length;
      out.push({
        level: n > 0 ? "ok" : "warn",
        text:
          n > 0
            ? t("app-assembly-export-animatic-dialog.text.text.88ce0c88ca76", { n: String(n), value2: String(languageWord(language.subtitles)) })
            : t("app-assembly-export-animatic-dialog.text.text.871c91046db1"),
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
    exState,
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
            text: t("app-assembly-export-animatic-dialog.text.text.cabe1e05bf3e", { value1: String(fontState.missing.join(", ")) }),
          },
        ]
      : baseChecks;
  const warnings = checks.some((c) => c.level === "warn");
  const busy = progress !== null && ready === null && error === null;
  const proresOk = supportsProRes();
  const supported = container === "mov" ? proresOk : canExportVideo();

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
      // SB-4: storyboardpanelenes bilder er ikke med i monteringens lenkesett – hent dem her
      if (missingUrl.length > 0 && imageSource === "storyboard") {
        try {
          const fresh = await signedUrls(missingUrl, 4 * 60 * 60);
          for (const p of missingUrl) if (fresh[p]) { subset[p] = fresh[p]; }
        } catch { /* telles som tapt under */ }
        for (let i = missingUrl.length - 1; i >= 0; i--) if (subset[missingUrl[i]!]) missingUrl.splice(i, 1);
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
      if (ctrl.signal.aborted) throw new DOMException(t("app-assembly-export-animatic-dialog.run.message.13e8459375d0"), "AbortError");
      const date = new Date().toISOString().slice(0, 10);
      const what =
        scope === "film"
          ? "animatic"
          : scope === "pick" && sel.clips.length > 1
            ? t("app-assembly-export-animatic-dialog.what.message.3a6e463a56aa", { length: String(sel.clips.length) })
            : sel.clips.length === 1
              ? t("app-assembly-export-animatic-dialog.scene-number", { number: sel.clips[0]!.productionNumber ?? "" }).trim()
              : t("app-assembly-export-animatic-dialog.what.message.9903432debbd", { value1: String(sel.clips[0]!.productionNumber ?? ""), value2: String(sel.clips[sel.clips.length - 1]!.productionNumber ?? "") });
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
          `${state.project.name} – ${what} – ${t("app-assembly-export-animatic-dialog.name.safe-name.dd70017cc00c")} ${langName} – ${date}.wav`,
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
            t("app-assembly-export-animatic-dialog.done-audio-lost", { count: lostAudio }),
          );
        return;
      }
      if (container === "mov") {
        // P7/R4: ProRes (valgt profil, Apples målbitrate) i MOV, strømmet til nettleserens lagring (OPFS) der det støttes
        const lang = language.dialogue === MAIN_LANGUAGE ? "" : ` – ${langName}`;
        const name = safeName(`${state.project.name} – ${what}${lang} – ${date}.mov`);
        const { exportProResFilm } = await import("@/engine/export/prores-export");
        const sink = await openAlphaSink(name, "video/quicktime");
        try {
          const res = await exportProResFilm({
            state: exState, clips: sel.clips, startFrame: sel.startFrame, endFrame: sel.endFrame, width: outW, height: outH, fps,
            monochrome: mono, images, signal: ctrl.signal, sink, profile: proresKind,
            audio: { items: audioItems, bank: audioBank, mutedKinds },
            filmUrls: await freshFilmUrls(sel.clips, filmUrls),
            ...(language.subtitles && subMode === "burn" ? { subtitles } : {}),
            ...(separateLayers ? { characterPass: "main" as const } : {}),
            onProgress: (done, total) => { if (abort.current === ctrl) { setProgress({ done, total }); report(done, total); } },
          });
          if (abort.current !== ctrl || ctrl.signal.aborted) { await sink.abort(); return; }
          await sink.close();
          const link = sink.link?.();
          if (link) setReady({ ...link, bytes: res.bytes });
          void recordExport({
            productionId, kind: "film", fileName: name,
            settings: { output, scope, size, width: outW, height: outH, monochrome: mono, language: language.dialogue,
              subtitles: !!language.subtitles && subMode === "burn", subtitleMode: language.subtitles ? subMode : "none",
              subtitleLanguage: language.subtitles, format: proresKind === "hq" ? "mov-prores422hq" : `mov-prores422${proresKind === "422" ? "" : proresKind}`, bitrateKbps: null,
              qualityProfileId: quality.profile?.id ?? null, qualityProfileName: quality.profile?.name ?? null,
              qualityProfileSnapshot: quality.profile ? JSON.stringify(qualityProfileSnapshot(quality.profile)) : null },
            occurrenceIds: sel.clips.map((c) => c.occurrenceId),
          });
        } catch (e) { await sink.abort().catch(() => undefined); throw e; }
        return;
      }
      const file = await exportAnimatic({
        state: exState,
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
          state: exState, clips: sel.clips, startFrame: sel.startFrame, endFrame: sel.endFrame, width: outW, height: outH, fps,
          images, signal: ctrl.signal, mp4: container === "mp4", webm: container === "webm", characterPass: "separate",
        });
        if (abort.current !== ctrl || ctrl.signal.aborted) return;
        const layerName = name.replace(/(\.[^.]+)$/, `${t("app-assembly-export-animatic-dialog.layer-name.name-replace.d5c1e01b1ae9")}.${layers.extension.replace(/^\./, "")}`);
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
          t("app-assembly-export-animatic-dialog.images-lost", { count: lost }),
        );
      if (lostAudio > 0)
        notes.push(
          t("app-assembly-export-animatic-dialog.audio-lost", { count: lostAudio }),
        );
      if (audioPaths.length > lostAudio && file.audioCodec === null)
        notes.push(
          t("app-assembly-export-animatic-dialog.run.notes-push.92d5ae0011bd"),
        );
      if (notes.length)
        setError(t("app-assembly-export-animatic-dialog.run.set-error.91c5e749a865", { value1: String(notes.join("; ")) }));
    } catch (e) {
      if (abort.current !== ctrl) return;
      if ((e as Error).name === "AbortError") setProgress(null);
      else
        setError(
          e instanceof ExportError
            ? e.message
            : (e as Error).message ? t("app-assembly-export-animatic-dialog.export-stopped", { error: (e as Error).message }) : t("app-assembly-export-animatic-dialog.export-stopped-unknown"),
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
      <ResizableDialogContent uiId="V-042" sizeKey="export-animatic" minWidth={560} className="@container max-h-[90dvh] w-[calc(100vw-48px)] max-w-[1280px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{t("app-assembly-export-animatic-dialog.export-animatic-dialog.dialog-title.f19f9faf7736")}</DialogTitle>
          <DialogDescription>
            {t("app-assembly-export-animatic-dialog.export-animatic-dialog.dialog-description.0b1d776f5d50")}{" "}
            {t("app-assembly-export-animatic-dialog.export-animatic-dialog.dialog-description.bc2b417caa92")}{" "}
            <strong>{state.productions[productionId]?.name ?? "–"}</strong>{" "}
            {t("app-assembly-export-animatic-dialog.export-animatic-dialog.dialog-description.44d85f195f4d")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 grid-cols-1 gap-6 @[1000px]:grid-cols-2">
        <div data-testid="export-animatic-column" className="flex min-w-0 flex-col gap-4">
        <QualityProfilePicker state={state} value={quality.choice} disabled={busy} onChange={quality.setChoice} />
        <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
          <label>{t("app-assembly-export-animatic-dialog.export-animatic-dialog.label.5d34e7666129")} <select data-testid="export-profile-resolution" value={profileResolution ?? ""} disabled={busy} onChange={e => setProfileResolution(e.target.value || null)} className="h-7 border border-border-control bg-surface-3"><option value="">{t("app-assembly-export-animatic-dialog.export-animatic-dialog.option.ba073253e1c7")}</option>{["1K","2K","4K"].map(r => <option key={r}>{r}</option>)}</select></label>
          <label>{t("app-assembly-export-animatic-dialog.export-animatic-dialog.label.2c678aca5ccf")} <input data-testid="export-profile-bitrate" type="number" min={100} max={100000} value={bitrateKbps ?? ""} disabled={busy} onChange={e => setBitrateKbps(e.target.value ? Number(e.target.value) : null)} className="h-7 w-24 border border-border-control bg-surface-3" /></label>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <fieldset className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-3" disabled={busy}>
            <legend className={legend}>{t("app-assembly-export-animatic-dialog.export-animatic-dialog.legend.615a07faf36f")}</legend>
            <label className={radio}>
              <input
                type="radio"
                name="scope"
                checked={scope === "film"}
                onChange={() => setScope("film")}
                className="mt-1"
              />
              <span>
                {t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.a903a50c6b16")}
                <span className="block text-xs text-text-tertiary">
                  {t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.6c196015cc85")}
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
                {t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.0668da8035a2")}
                <span className="block text-xs text-text-tertiary">
                  {selectedId
                    ? (() => {
                        const c = clips.find((x) => x.occurrenceId === selectedId);
                        return c
                          ? `${c.productionNumber ?? ""} ${formatHeading(c.heading)}`.trim()
                          : "–";
                      })()
                    : t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.8110be288723")}
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
                {t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.f85957df67da")}
                {/* Lange scenehoder skal ikke presse valgene ut av kolonnen */}
                <span className="flex min-w-0 flex-col gap-1 overflow-hidden text-xs text-text-tertiary">
                  <SceneSelect
                    ariaLabel={t("app-assembly-export-animatic-dialog.export-animatic-dialog.aria-label.b9d371cb37dc")}
                    value={fromId}
                    onChange={(v) => {
                      setFromId(v);
                      setScope("range");
                    }}
                    className={select + " w-full max-w-full"}
                    options={clips.map((c) => ({ value: c.occurrenceId, number: c.productionNumber ?? "–", label: formatHeading(c.heading), occurrence: state.occurrences[c.occurrenceId] }))}
                  />
                  <SceneSelect
                    ariaLabel={t("app-assembly-export-animatic-dialog.export-animatic-dialog.aria-label.35a8e5049bbd")}
                    value={toId}
                    onChange={(v) => {
                      setToId(v);
                      setScope("range");
                    }}
                    className={select + " w-full max-w-full"}
                    options={clips.map((c) => ({ value: c.occurrenceId, number: c.productionNumber ?? "–", label: formatHeading(c.heading), occurrence: state.occurrences[c.occurrenceId] }))}
                  />
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
                {t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.d672908d89ab")}
                <span className="block text-xs text-text-tertiary">
                  {t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.3c06d61df09f")}
                </span>
              </span>
            </label>
            {scope === "pick" ? (
              <div className="flex flex-col gap-1">
                <ul
                  aria-label={t("app-assembly-export-animatic-dialog.export-animatic-dialog.aria-label.a55a23ad7ecc")}
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
                        <SceneMark occurrence={state.occurrences[c.occurrenceId]}>
                          {c.productionNumber ?? "–"} {formatHeading(c.heading)}
                        </SceneMark>
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
                    {t("app-assembly-export-animatic-dialog.export-animatic-dialog.button.12f530b9d538")}
                  </button>
                  <button
                    type="button"
                    className="text-text-secondary hover:underline"
                    onClick={() => setPicked(new Set())}
                  >
                    {t("app-assembly-export-animatic-dialog.export-animatic-dialog.button.3e118f61a604")}
                  </button>
                </span>
              </div>
            ) : null}
          </fieldset>

          <fieldset className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-3" disabled={busy} data-testid="export-image-source">
            <legend className={legend}>{t("sb4.export.image-source")}</legend>
            {(["animation", "film", "storyboard"] as const).map((src) => (
              <label key={src} className={radio}>
                <input
                  type="radio"
                  name="imageSource"
                  checked={imageSource === src}
                  onChange={() => setImageSource(src)}
                  className="mt-1"
                  data-testid={`export-source-${src}`}
                />
                <span>{IMAGE_SOURCE_KEY[src]}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-3" disabled={busy}>
            <legend className={legend}>{t("app-assembly-export-animatic-dialog.export-animatic-dialog.legend.5aedb80937f3")}</legend>
            <label className={radio}>
              <input
                type="radio"
                name="size"
                checked={size === "full"}
                onChange={() => setSize("full")}
                className="mt-1"
              />
              <span>
                {t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.50e6c869c89f")}
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
                {t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.4786d6ff3d56")}
                <span className="block text-xs text-text-tertiary">
                  {Math.round(fullW / 2)} × {Math.round(fullH / 2)} px –{" "}
                  {t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.01940e0f9135")}
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
              {t("app-assembly-export-animatic-dialog.export-animatic-dialog.label.5f480757a5cd")}
            </label>
            <label className="flex items-center gap-2 pt-1 text-[13px] text-text-primary">
              <input
                type="checkbox"
                data-testid="export-include-credits"
                checked={includeCredits}
                onChange={(e) => setIncludeCredits(e.target.checked)}
                className="size-3.5 accent-[var(--accent-brand)]"
              />
              {t("app-assembly-export-animatic-dialog.export-animatic-dialog.label.8ed585b4e68c")}
            </label>
            <p className="pt-1 text-xs text-text-tertiary">
              {t("app-assembly-export-animatic-dialog.export-animatic-dialog.p.abc8b0f00b0f")}
            </p>
          </fieldset>
        </div>

        <fieldset className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-3" disabled={busy}>
          <legend className={legend}>{t("app-assembly-export-animatic-dialog.export-animatic-dialog.legend.ce685e047b9b")}</legend>
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
                {t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.c5a5dd431c08")}
                <span className="block text-xs text-text-tertiary">
                  {t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.34d2cfe81860")} {langName}
                  {language.subtitles && subMode === "burn"
                    ? t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.afd88c929cf8")
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
                {t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.d9fec06c5ad4")}
                <span className="block text-xs text-text-tertiary">
                  {t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.297264f4ac41")} {langName}
                  {t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.d0a240494b79")}
                </span>
              </span>
            </label>
          </div>
          {output === "video" ? (
            <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
              <label className="flex items-center gap-1.5">
                {t("app-assembly-export-animatic-dialog.export-animatic-dialog.label.b1d0162bac69")}
                <select
                  value={container}
                  onChange={(e) => setContainer(e.target.value as "mp4" | "webm" | "mov")}
                  className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                  data-testid="export-format"
                >
                  <option value="mp4">
                    {t("app-assembly-export-animatic-dialog.export-animatic-dialog.option.153f422a846d")}
                  </option>
                  <option value="webm">
                    {t("app-assembly-export-animatic-dialog.export-animatic-dialog.option.764c8c46455e")}
                  </option>
                  <option value="mov" disabled={!proresOk}>
                    {t("r4-prores.film-option")}
                  </option>
                </select>
              </label>
              {!proresOk ? <p role="status" data-testid="export-prores-unavailable" className="w-full">{PRORES_UNSUPPORTED()}</p> : null}
              {container === "mov" ? (
                <>
                  <label className="flex items-center gap-1.5">
                    {t("r4-prores.profile-label")}
                    <select
                      value={proresKind}
                      onChange={(e) => setProresKind(e.target.value as ProResKind)}
                      className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                      data-testid="export-prores-profile"
                    >
                      {PRORES_FILM_KINDS.map((k) => <option key={k} value={k}>{PRORES_NAME[k]}</option>)}
                    </select>
                  </label>
                  <p data-testid="export-prores-note" className="w-full">{t("r4-prores.film-note", { profile: PRORES_NAME[proresKind] })}</p>
                  <p data-testid="export-prores-estimate" className="w-full">
                    {t("r4-prores.estimate", { size: formatBytes(proresBytesEstimate(outW, outH, Math.max(0, sel.endFrame - sel.startFrame), proresKind, fps, audioItems.length > 0)) })}
                  </p>
                </>
              ) : null}
              <label className="flex items-center gap-1.5">
                {t("app-assembly-export-animatic-dialog.export-animatic-dialog.label.65f5cf932bea")}
                <select
                  value={language.subtitles ? subMode : "none"}
                  disabled={!language.subtitles}
                  onChange={(e) => setSubMode(e.target.value as typeof subMode)}
                  className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary disabled:opacity-50"
                  data-testid="export-subtitles"
                  title={
                    language.subtitles
                      ? undefined
                      : t("app-assembly-export-animatic-dialog.export-animatic-dialog.title.7a2a35a8ab00")
                  }
                >
                  <option value="burn">{t("app-assembly-export-animatic-dialog.export-animatic-dialog.option.b08e214de259")}</option>
                  <option value="srt">{t("app-assembly-export-animatic-dialog.export-animatic-dialog.option.0ebe3e55b619")}</option>
                  <option value="vtt">{t("app-assembly-export-animatic-dialog.export-animatic-dialog.option.2b5e1d4e3c6e")}</option>
                  <option value="none">{t("app-assembly-export-animatic-dialog.export-animatic-dialog.option.3e118f61a604")}</option>
                </select>
              </label>
            </div>
          ) : null}
        </fieldset>

        <section
          aria-label={t("app-assembly-export-animatic-dialog.export-animatic-dialog.aria-label.ad4ffafdd70d")}
          className="flex flex-col gap-1.5"
        >
          <h3 className={legend}>{t("app-assembly-export-animatic-dialog.export-animatic-dialog.h3.ad4ffafdd70d")}</h3>
          <ul className="flex flex-col gap-1">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                {c.level === "ok" ? (
                  <CheckCircle2
                    className="mt-px size-3.5 shrink-0 text-status-success"
                    aria-label={t("app-assembly-export-animatic-dialog.export-animatic-dialog.aria-label.71e6fb36d69d")}
                  />
                ) : c.level === "warn" ? (
                  <AlertTriangle
                    className="mt-px size-3.5 shrink-0 text-status-discrepancy"
                    aria-label={t("app-assembly-export-animatic-dialog.export-animatic-dialog.aria-label.c5724fbd8c35")}
                  />
                ) : (
                  <Info
                    className="mt-px size-3.5 shrink-0 text-text-tertiary"
                    aria-label={t("app-assembly-export-animatic-dialog.export-animatic-dialog.aria-label.aed8a09c683a")}
                  />
                )}
                {c.text}
              </li>
            ))}
          </ul>
        </section>

        {!supported ? (
          <p role="alert" className="text-xs text-status-danger">
            {t("app-assembly-export-animatic-dialog.export-animatic-dialog.p.f77b75c919bf")}
          </p>
        ) : null}

        {progress && !ready ? (
          <div data-testid="export-progress" className="flex flex-col gap-1.5 rounded-sm border border-accent-brand/50 bg-accent-selection p-3" aria-live="polite">
            <p className="text-[13px] font-medium text-text-primary">{t("app-assembly-export-animatic-dialog.export-animatic-dialog.p.7f00060d6fdc")}</p>
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("app-assembly-export-animatic-dialog.export-animatic-dialog.aria-label.8071e51b2042")}
              className="h-2 overflow-hidden rounded-full bg-surface-3"
            >
              <div
                className="h-full bg-accent-brand transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-text-tertiary">
              {t("app-assembly-export-animatic-dialog.export-animatic-dialog.p.e33a9cb0d6da")} {progress.done} {t("app-assembly-export-animatic-dialog.export-animatic-dialog.p.cc610166b8e0")} {progress.total} (
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
            {t("app-assembly-export-animatic-dialog.export-animatic-dialog.p.2fb3e37c871d")} {ready.name} (
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
              {t("app-assembly-export-animatic-dialog.export-animatic-dialog.a.1596dc39c65c")}
            </a>
            {shareSource ? (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="inline-flex items-center gap-1 text-accent-brand hover:underline"
                data-testid="film-share-open"
              >
                <QrCodeIcon className="size-3.5" aria-hidden />
                {t("app-assembly-export-animatic-dialog.export-animatic-dialog.button.2b28b2dd28a0")}
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
                {t("app-assembly-export-animatic-dialog.export-animatic-dialog.a.151b30635bc0")}
              </a>
            ) : null}
            {subFile ? (
              <a
                href={subFile.url}
                download={subFile.name}
                className="inline-flex items-center gap-1 text-accent-brand hover:underline"
              >
                <Download className="size-3.5" aria-hidden />
                {t("app-assembly-export-animatic-dialog.export-animatic-dialog.a.be9aad8ec9f6")}
              </a>
            ) : null}
            {isEmbedded() ? (
              <span className="text-text-tertiary">
                {t("app-assembly-export-animatic-dialog.export-animatic-dialog.span.2dc1a9f9edd0")}
              </span>
            ) : null}
          </p>
        ) : null}

        <Button variant="outline" size="sm" data-testid="export-alpha-open" disabled={busy || !alphaComposition} onClick={() => setAlphaOpen(true)} title={t("app-assembly-export-animatic-dialog.export-animatic-dialog.title.d2997bee334d")}>
          <Download />{t("app-assembly-export-animatic-dialog.export-animatic-dialog.button.4ca3b34859ad")}
        </Button>

        </div>
        <ShotlistExport state={state} productionId={productionId} clips={sel.clips} language={language} disabled={busy} />
        <StoryboardPrintExport state={state} clips={clips.filter(c => sel.clips.some(selected => selected.occurrenceId === c.occurrenceId))} imageSource={imageSource} language={language.dialogue} disabled={busy} />
        </div>
        <details data-testid="export-history-section" className="rounded-sm border border-border bg-surface-1 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-text-secondary">{t("ptg.layout.history")}</summary>
          <div className="mt-2 flex flex-col gap-2">
            <ExportHistory productionId={productionId} kinds={["film", "audio"]} />
            <ExportHistory productionId={productionId} kinds={["script"]} />
          </div>
        </details>

        <DialogFooter className="border-t border-border bg-surface-2 py-2">
          {busy ? (
            <Button variant="ghost" onClick={() => queueId.current ? exportQueue.cancel(queueId.current) : abort.current?.abort()}>
              {t("app-assembly-export-animatic-dialog.export-animatic-dialog.button.d51bb9abaaf8")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("app-assembly-export-animatic-dialog.export-animatic-dialog.button.fab9aaaf69c0")}
            </Button>
          )}
          <Button
            data-testid="export-start"
            onClick={enqueueExport}
            disabled={
              busy ||
              (!supported && output === "video") ||
              sel.clips.length === 0 ||
              (urls === null && paths.length > 0)
            }
          >
            <Download />
            {warnings ? t("app-assembly-export-animatic-dialog.export-animatic-dialog.button.93f2ccf9eceb") : t("app-assembly-export-animatic-dialog.export-animatic-dialog.button.24d7c267343a")}
          </Button>
        </DialogFooter>
      </ResizableDialogContent>
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
