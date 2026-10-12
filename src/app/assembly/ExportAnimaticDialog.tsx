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
  filmSelection,
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
  type FilmRange,
  type ProjectState,
} from "@/core";
import { ExportError, canExportVideo, exportAnimatic, loadImages } from "@/engine/export/animatic";
import {
  STEM_MAX_SECONDS,
  dialogueItems,
  exportDialogueStemParts,
} from "@/engine/export/audio-stem";
import { FilmLanguagePicker, type FilmLanguage } from "./use-film-language";
import { isEmbedded, prepareDownload, type ReadyFile } from "@/app/download";
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

type Scope = "film" | "selected" | "range" | "pick";
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
}: {
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
  const [scope, setScope] = useState<Scope>("film");
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  /** «Valgte scener» (DEC-0072): vilkårlige scener, også med hull mellom. */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [size, setSize] = useState<Size>("full");
  const [mono, setMono] = useState(monochrome);
  /** «video»: film med lyd. «dialogue»: bare dialogsporet som WAV (REQ-0350). */
  const [output, setOutput] = useState<"video" | "dialogue">("video");
  const langName = (LANGUAGE_LABEL[language.dialogue] ?? language.dialogue).toLowerCase();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<(ReadyFile & { bytes: number }) | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Standardvalg hver gang dialogen åpnes
  useEffect(() => {
    if (!open) return;
    setReady(null);
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
    if (scope === "selected" && !selectedId) setScope("film");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(
    () => () => {
      if (ready) URL.revokeObjectURL(ready.url);
    },
    [ready],
  );
  // Lukkes dialogen under eksport: avbryt
  useEffect(() => {
    if (!open) abort.current?.abort();
  }, [open]);

  const range: FilmRange =
    scope === "film"
      ? { kind: "film" }
      : scope === "selected"
        ? { kind: "scenes", fromOccurrenceId: selectedId ?? "", toOccurrenceId: selectedId ?? "" }
        : { kind: "scenes", fromOccurrenceId: fromId, toOccurrenceId: toId };
  const rangeSel = useMemo(() => filmRange(clips, range), [clips, scope, fromId, toId, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  const fps = state.project.fps;
  const pickSel = useMemo(
    () => (scope === "pick" ? filmSelection(clips, picked) : null),
    [scope, clips, picked],
  );
  const sel = pickSel ?? rangeSel;
  // Ved vilkårlige scener flyttes lyd og undertekster sammen med scenene sine
  const audioItems = useMemo(
    () =>
      pickSel
        ? shiftAudioItems(allAudioItems, pickSel.shiftOf, fps, pickSel.runEndOf)
        : allAudioItems,
    [pickSel, allAudioItems, fps],
  );
  const subtitles = useMemo(
    () =>
      pickSel
        ? shiftCues(allSubtitles, clips, pickSel.shiftOf, fps, pickSel.runEndOf)
        : allSubtitles,
    [pickSel, allSubtitles, clips, fps],
  );

  const fullW = state.project.frameWidth;
  const fullH = state.project.frameHeight;
  const outW = size === "full" ? fullW : Math.round(fullW / 2);
  const outH = size === "full" ? fullH : Math.round(fullH / 2);

  // Eksportkontroll (mandat 29.6): sceneorden, skjulte scener, materiale og manglende filer
  const { checks, paths, audioPaths } = useMemo(() => {
    const out: Check[] = [];
    const n = sel.clips.length;
    out.push({
      level: n > 0 ? "ok" : "warn",
      text:
        n > 0
          ? `${n} ${n === 1 ? "scene" : "scener"} i manusets rekkefølge, ${formatSeconds(
              framesToSeconds(sel.endFrame - sel.startFrame, fps),
            )}.`
          : "Utvalget har ingen scener.",
    });
    if (scope === "film") {
      const inactive = orderedOccurrences(state, productionId).filter((o) => !o.active).length;
      if (inactive > 0)
        out.push({
          level: "info",
          text: `${inactive} ${inactive === 1 ? "deaktivert scene er" : "deaktiverte scener er"} ikke med.`,
        });
    }
    const placeholders = sel.clips.filter((c) => c.source === "placeholder");
    if (placeholders.length > 0)
      out.push({
        level: "warn",
        text: `${placeholders.length} ${
          placeholders.length === 1 ? "scene" : "scener"
        } uten 2D-scene vises som tittelkort (${placeholders
          .slice(0, 4)
          .map((c) => c.productionNumber ?? formatHeading(c.heading))
          .join(", ")}${placeholders.length > 4 ? " …" : ""}).`,
      });
    const films = sel.clips.filter((c) => c.source === "film");
    if (films.length > 0)
      out.push({
        level: filmMediaPaths(films).some((p) => !filmUrls?.[p]) ? "warn" : "ok",
        text: `${films.length} ${films.length === 1 ? "scene bruker" : "scener bruker"} film, AI-video eller stillbilde.`,
      });
    const estimated = sel.clips.filter((c) => c.durationKind === "estimate").length;
    if (estimated > 0)
      out.push({
        level: "info",
        text: `${estimated} ${estimated === 1 ? "scene har" : "scener har"} lengde beregnet fra manuset.`,
      });
    const need = new Set<string>();
    let missingVersions = 0;
    for (const c of sel.clips) {
      if (!c.compositionId || !c.parts.some((p) => p.source === "composition")) continue;
      for (const l of layersOf(state, c.compositionId)) {
        if (!l.visible) continue;
        const vs = layerVersions(state, l);
        for (const v of vs) need.add(v.mediaPath);
        if (vs.length === 0 && l.assetId !== null) missingVersions++;
      }
    }
    if (missingVersions > 0)
      out.push({
        level: "warn",
        text: `${missingVersions} ${
          missingVersions === 1 ? "lag mangler" : "lag mangler"
        } bilde i biblioteket og blir usynlige.`,
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
        text: `${audible.length} ${audible.length === 1 ? "lydklipp" : "lydklipp"} med i videoen${
          audible.length < sounds.length
            ? ` (${sounds.length - audible.length} i dempede spor er ikke med)`
            : ""
        }.`,
      });
    const noFile = sounds.filter((it) => it.version === null).length;
    if (noFile > 0)
      out.push({
        level: "warn",
        text: `${noFile} ${noFile === 1 ? "lydklipp mangler" : "lydklipp mangler"} lydfil og blir stille.`,
      });
    // Språkversjonen (DEC-0059)
    const mixed = sounds.filter(
      (it) =>
        it.film && it.film.audioLanguage !== "none" && it.film.audioLanguage !== language.dialogue,
    ).length;
    if (mixed > 0)
      out.push({
        level: "warn",
        text: `${mixed} ${mixed === 1 ? "filmklipp har" : "filmklipp har"} dialog på et annet språk blandet inn i lyden. Den kan ikke fjernes, og spilles som den er.`,
      });
    const voices = dialogueItems(audible);
    if (output === "dialogue")
      out.push({
        level: voices.length > 0 ? "ok" : "warn",
        text:
          voices.length > 0
            ? `Dialogspor (${langName}): ${voices.length} ${voices.length === 1 ? "lydklipp" : "lydklipp"} med dialog og forteller. Musikk, effekter og lyden i importert film er ikke med.`
            : `Ingen dialog på ${langName} i utvalget – dialogsporet blir stille.`,
      });
    if (output === "dialogue" && to - from > STEM_MAX_SECONDS)
      out.push({
        level: "warn",
        text: `Dialogsporet lages for de første ${STEM_MAX_SECONDS / 3600} timene (grensen for WAV-filer). Velg et utvalg av scener for resten.`,
      });
    if (output === "video" && language.subtitles) {
      const n = subtitles.filter((c) => c.startMs < to * 1000 && c.endMs > from * 1000).length;
      out.push({
        level: n > 0 ? "ok" : "warn",
        text:
          n > 0
            ? `${n} undertekster på ${(LANGUAGE_LABEL[language.subtitles] ?? language.subtitles).toLowerCase()} brennes inn i bildet.`
            : "Ingen undertekster i utvalget (replikkene mangler oversettelse eller tid).",
      });
    }
    const usedAudio = output === "dialogue" ? voices : audible;
    const audioPaths = [
      ...new Set(usedAudio.flatMap((it) => (it.version ? [it.version.mediaPath] : []))),
    ];
    return { checks: out, paths: output === "dialogue" ? [] : [...need], audioPaths };
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

  const warnings = checks.some((c) => c.level === "warn");
  const busy = progress !== null && ready === null && error === null;
  const supported = canExportVideo();

  async function run() {
    setError(null);
    const saved = state.productions[productionId]?.exportSettings;
    if (
      onSaveSettings &&
      (!saved || saved.size !== size || saved.monochrome !== mono || saved.output !== output)
    )
      onSaveSettings({ size, monochrome: mono, output });
    setReady(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
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
      if (ctrl.signal.aborted) throw new DOMException("Avbrutt", "AbortError");
      const date = new Date().toISOString().slice(0, 10);
      const what =
        scope === "film"
          ? "animatic"
          : scope === "pick" && sel.clips.length > 1
            ? `${sel.clips.length} scener`
            : sel.clips.length === 1
              ? `scene ${sel.clips[0]!.productionNumber ?? ""}`.trim()
              : `scener ${sel.clips[0]!.productionNumber ?? ""}–${sel.clips[sel.clips.length - 1]!.productionNumber ?? ""}`;
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
        const name = safeName(`${state.project.name} – ${what} – dialog ${langName} – ${date}.wav`);
        const f = prepareDownload(stem.parts, name, "audio/wav");
        setReady({ ...f, bytes: stem.bytes });
        if (lostAudio > 0)
          setError(
            `Ferdig, men ${lostAudio} ${lostAudio === 1 ? "lydfil" : "lydfiler"} kunne ikke leses og mangler.`,
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
        ...(language.subtitles ? { subtitles } : {}),
        onProgress: (done, total) => {
          if (abort.current === ctrl) setProgress({ done, total });
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
      const lost = failed.length + missingUrl.length;
      const notes: string[] = [];
      if (lost > 0)
        notes.push(
          `${lost} ${lost === 1 ? "bilde" : "bilder"} kunne ikke lastes og mangler i videoen`,
        );
      if (lostAudio > 0)
        notes.push(
          `${lostAudio} ${lostAudio === 1 ? "lydfil" : "lydfiler"} kunne ikke leses og mangler`,
        );
      if (audioPaths.length > lostAudio && file.audioCodec === null)
        notes.push("nettleseren kunne ikke kode lyd, så videoen er uten lyd");
      if (notes.length) setError(`Ferdig, men ${notes.join("; ")}.`);
    } catch (e) {
      if (abort.current !== ctrl) return;
      if ((e as Error).name === "AbortError") setProgress(null);
      else
        setError(
          e instanceof ExportError
            ? e.message
            : `Eksporten stoppet: ${(e as Error).message || "ukjent feil"}`,
        );
    } finally {
      if (abort.current === ctrl) abort.current = null;
    }
  }

  const radio = "flex items-start gap-2 text-[13px] text-text-primary";
  const legend = "mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary";
  const select =
    "h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>Eksporter animatic</DialogTitle>
          <DialogDescription>
            Videoen lages her i nettleseren av alt som er i filmen – 2D-scener, importert film,
            AI-video og lydsporene – uten nye kostnader. Eksporten endrer ingenting i prosjektet.
            Produksjon: <strong>{state.productions[productionId]?.name ?? "–"}</strong> (en spinoff,
            trailer eller pitchfilm velges øverst i monteringen).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-5">
          <fieldset className="flex flex-col gap-2" disabled={busy}>
            <legend className={legend}>Hva</legend>
            <label className={radio}>
              <input
                type="radio"
                name="scope"
                checked={scope === "film"}
                onChange={() => setScope("film")}
                className="mt-1"
              />
              <span>
                Hele filmen
                <span className="block text-xs text-text-tertiary">Alle aktive scener</span>
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
                Valgt scene
                <span className="block text-xs text-text-tertiary">
                  {selectedId
                    ? (() => {
                        const c = clips.find((x) => x.occurrenceId === selectedId);
                        return c
                          ? `${c.productionNumber ?? ""} ${formatHeading(c.heading)}`.trim()
                          : "–";
                      })()
                    : "Velg en scene i tidslinjen først"}
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
                Fra scene til scene
                <span className="flex flex-col gap-1 text-xs text-text-tertiary">
                  <select
                    aria-label="Første scene"
                    value={fromId}
                    onChange={(e) => {
                      setFromId(e.target.value);
                      setScope("range");
                    }}
                    className={select}
                  >
                    {clips.map((c) => (
                      <option key={c.occurrenceId} value={c.occurrenceId}>
                        {c.productionNumber ?? "–"} {formatHeading(c.heading)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Siste scene"
                    value={toId}
                    onChange={(e) => {
                      setToId(e.target.value);
                      setScope("range");
                    }}
                    className={select}
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
                Valgte scener
                <span className="block text-xs text-text-tertiary">
                  Kryss av scenene; de settes etter hverandre i filmens rekkefølge
                </span>
              </span>
            </label>
            {scope === "pick" ? (
              <div className="flex flex-col gap-1">
                <ul
                  aria-label="Scener i eksporten"
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
                    Alle
                  </button>
                  <button
                    type="button"
                    className="text-text-secondary hover:underline"
                    onClick={() => setPicked(new Set())}
                  >
                    Ingen
                  </button>
                </span>
              </div>
            ) : null}
          </fieldset>

          <fieldset className="flex flex-col gap-2" disabled={busy}>
            <legend className={legend}>Størrelse</legend>
            <label className={radio}>
              <input
                type="radio"
                name="size"
                checked={size === "full"}
                onChange={() => setSize("full")}
                className="mt-1"
              />
              <span>
                Full størrelse
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
                Halv størrelse
                <span className="block text-xs text-text-tertiary">
                  {Math.round(fullW / 2)} × {Math.round(fullH / 2)} px – raskere og mindre fil
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
              Hele filmen i svart-hvitt
            </label>
            <p className="pt-1 text-xs text-text-tertiary">
              Scener som er satt til svart-hvitt, blir det uansett. MP4 (H.264) der nettleseren kan,
              ellers WebM. Med lyden fra lydsporene (dempede spor er ikke med).
            </p>
          </fieldset>
        </div>

        <fieldset className="flex flex-col gap-2" disabled={busy}>
          <legend className={legend}>Språk og innhold</legend>
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
                Video
                <span className="block text-xs text-text-tertiary">
                  Bilde og all lyd på {langName}
                  {language.subtitles ? ", med undertekster" : ""}
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
                Bare dialogspor (WAV)
                <span className="block text-xs text-text-tertiary">
                  Dialog og forteller på {langName}, uten musikk og effekter
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <section aria-label="Kontroll før eksport" className="flex flex-col gap-1.5">
          <h3 className={legend}>Kontroll før eksport</h3>
          <ul className="flex flex-col gap-1">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                {c.level === "ok" ? (
                  <CheckCircle2
                    className="mt-px size-3.5 shrink-0 text-status-success"
                    aria-label="OK"
                  />
                ) : c.level === "warn" ? (
                  <AlertTriangle
                    className="mt-px size-3.5 shrink-0 text-status-discrepancy"
                    aria-label="Merk"
                  />
                ) : (
                  <Info className="mt-px size-3.5 shrink-0 text-text-tertiary" aria-label="Info" />
                )}
                {c.text}
              </li>
            ))}
          </ul>
        </section>

        {!supported ? (
          <p role="alert" className="text-xs text-status-danger">
            Denne nettleseren kan ikke lage video. Bruk en nyere utgave av Chrome, Edge, Safari
            eller Firefox.
          </p>
        ) : null}

        {progress && !ready ? (
          <div className="flex flex-col gap-1" aria-live="polite">
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Fremdrift"
              className="h-1.5 overflow-hidden rounded-full bg-surface-3"
            >
              <div
                className="h-full bg-accent-brand transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-text-tertiary">
              Bilde {progress.done} av {progress.total} ({formatTimecode(progress.done, fps)}) –{" "}
              {pct} %
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}

        {ready ? (
          <p
            className="flex flex-wrap items-center gap-2 text-xs text-text-secondary"
            role="status"
          >
            Ferdig: {ready.name} (
            {(ready.bytes / 1024 / 1024).toLocaleString("nb-NO", {
              maximumFractionDigits: 1,
            })}{" "}
            MB).
            <a
              href={ready.url}
              download={ready.name}
              className="inline-flex items-center gap-1 text-accent-brand hover:underline"
            >
              <Download className="size-3.5" aria-hidden />
              Last ned
            </a>
            {isEmbedded() ? (
              <span className="text-text-tertiary">
                Hvis nedlastingen ikke starter: åpne programmet i en egen fane.
              </span>
            ) : null}
          </p>
        ) : null}

        <DialogFooter>
          {busy ? (
            <Button variant="ghost" onClick={() => abort.current?.abort()}>
              Avbryt
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Lukk
            </Button>
          )}
          <Button
            onClick={() => void run()}
            disabled={
              busy ||
              (!supported && output === "video") ||
              sel.clips.length === 0 ||
              (urls === null && paths.length > 0)
            }
          >
            <Download />
            {warnings ? "Eksporter likevel" : "Eksporter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
