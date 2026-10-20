/**
 * «Lyd i scenene rundt» (DEC-0045): bla bakover og framover i filmen og se lyden som er brukt i scenene
 * før og etter. «Bruk i scenen» legger samme lyd (spor, volum, toninger, volumpunkter) inn i scenen man
 * jobber med – enkelt å føre atmosfære og musikk videre.
 */
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { Check, ChevronLeft, ChevronRight, Pause, Play, Plus } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AUDIO_KIND_LABEL, audioClipFieldsOf, audioVersion, formatHeading, neighbourSceneAudio, LANGUAGE_LABEL, newId, type AudioClip, type Command, type FilmClip, type ProjectState, locale, languageWord } from "@/core";
import { useImageUrls } from "@/app/library/asset-images";
import { AUDIO_KIND_COLOR } from "@/app/assembly/AudioTracks";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

const fmt = (ms: number) => `${(Math.round(ms / 100) / 10).toLocaleString(locale())} s`;

export const NearbyAudioPanel = memo(function NearbyAudioPanel({
  state,
  clips,
  occurrenceId,
  editable,
  run,
}: {
  state: ProjectState;
  /** Filmens scener i rekkefølge. */
  clips: readonly FilmClip[];
  occurrenceId: string;
  editable: boolean;
  run: (command: Command, label: string) => string | null;
}) {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const index = clips.findIndex((c) => c.occurrenceId === occurrenceId);
  const [step, setStep] = useState(-1);
  // Ny scene: start med forrige scene igjen
  useEffect(() => setStep(-1), [occurrenceId]);
  const minStep = -index;
  const maxStep = clips.length - 1 - index;
  // Aldri scenen selv (0): første scene starter med neste scene
  let s = Math.max(minStep, Math.min(maxStep, step));
  if (s === 0) s = minStep < 0 ? -1 : 1;
  const prevStep = s - 1 === 0 ? -1 : s - 1;
  const nextStep = s + 1 === 0 ? 1 : s + 1;
  const { clip, audio } = useMemo(
    () => neighbourSceneAudio(state, clips, occurrenceId, s),
    [state, clips, occurrenceId, s],
  );
  const here = useMemo(
    () =>
      Object.values(state.audioClips).filter((a) => a.occurrenceId === occurrenceId && !a.removed),
    [state.audioClips, occurrenceId],
  );
  const paths = useMemo(
    () =>
      audio.flatMap((a) => {
        const v = audioVersion(state, a);
        return v ? [v.mediaPath] : [];
      }),
    [state, audio],
  );
  const urls = useImageUrls(paths).data ?? {};
  const [error, setError] = useState<string | null>(null);

  // Forhåndslytting med ett felles lydelement
  const player = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  useEffect(
    () => () => {
      player.current?.pause();
    },
    [],
  );
  function preview(a: AudioClip) {
    const v = audioVersion(state, a);
    const url = v ? urls[v.mediaPath] : undefined;
    if (!url) return;
    if (playingId === a.id) {
      player.current?.pause();
      setPlayingId(null);
      return;
    }
    player.current?.pause();
    const el = new Audio(url);
    el.currentTime = a.sourceInMs / 1000;
    el.volume = Math.min(1, Math.pow(10, a.gainDb / 20));
    el.onended = () => setPlayingId(null);
    el.ontimeupdate = () => {
      if (el.currentTime >= (a.sourceInMs + a.lengthMs) / 1000) {
        el.pause();
        setPlayingId(null);
      }
    };
    void el.play().catch(() => setPlayingId(null));
    player.current = el;
    setPlayingId(a.id);
  }

  function use(a: AudioClip) {
    const f = audioClipFieldsOf(a);
    setError(
      run(
        {
          type: "AddAudioClips",
          clips: [
            {
              clipId: newId<"audio_clip">(),
              fields: {
                ...f,
                occurrenceId: occurrenceId as never,
                // Starter i begynnelsen av scenen; replikken hører til den andre scenen
                offsetMs: 0,
                blockId: null,
              },
            },
          ],
        },
        t("app-scene-editor-nearby-audio-panel.use-in-scene", { name: a.name || t("app-scene-editor-nearby-audio-panel.use-in-scene-audio") }),
      ),
    );
  }

  if (index < 0 || clips.length < 2) return null;
  const label =
    s < 0
      ? s === -1
        ? t("app-scene-editor-nearby-audio-panel.label.memo.81524b621b38")
        : t("app-scene-editor-nearby-audio-panel.label.memo.4654b35a0cd5", { value1: String(-s) })
      : s === 1
        ? t("app-scene-editor-nearby-audio-panel.label.memo.4a47fe5ec44c")
        : t("app-scene-editor-nearby-audio-panel.label.memo.df9b65194dd2", { s: String(s) });

  return (
    <section
      aria-label={t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.aria-label.5d63fd0b349d")}
      className="flex min-h-0 flex-col border-t border-border"
    >
      <PanelHeader as="h2" title={t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.title.5d63fd0b349d")} />
      <div className="flex items-center gap-1 px-2 pb-1">
        <button
          type="button"
          onClick={() => setStep(prevStep)}
          disabled={prevStep < minStep}
          aria-label={t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.aria-label.1a5cf8d406fd")}
          title={t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.title.a923e1cce9a3")}
          className="rounded-sm p-0.5 text-text-secondary hover:bg-surface-3 hover:text-text-primary disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span
          className="min-w-0 flex-1 truncate text-center text-[11px] text-text-secondary"
          title={clip ? formatHeading(clip.heading) : ""}
        >
          {label}
          {clip ? (
            <span className="text-text-tertiary">
              {" "}
              · {clip.productionNumber ?? ""} {formatHeading(clip.heading)}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => setStep(nextStep)}
          disabled={nextStep > maxStep}
          aria-label={t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.aria-label.5c5fc0b6d742")}
          title={t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.title.06866d98d7dc")}
          className="rounded-sm p-0.5 text-text-secondary hover:bg-surface-3 hover:text-text-primary disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      {audio.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-text-tertiary">
          {t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.p.adbb2054f9b6")}
        </p>
      ) : (
        <ul className="flex flex-col overflow-y-auto px-1 pb-2">
          {audio.map((a) => {
            const inUse = here.some((h) => h.assetId === a.assetId && h.kind === a.kind);
            const color = a.continues ? "var(--accent-warm)" : AUDIO_KIND_COLOR[a.kind];
            return (
              <li key={a.id} className="flex flex-col rounded-sm px-2 py-1 hover:bg-surface-3">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="truncate text-[12px] text-text-primary" title={a.name}>
                    {a.name || t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.span.713ef6fced8a")}
                    {a.language && a.language !== "*" ? ` (${languageWord(a.language)})` : ""}
                  </span>
                </span>
                <span className="flex min-w-0 items-center gap-1 pl-3.5">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-text-tertiary">
                    {AUDIO_KIND_LABEL[a.kind]} · {fmt(a.lengthMs)}
                    {a.continues ? t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.span.c737330ef882") : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => preview(a)}
                    aria-label={
                      playingId === a.id
                        ? t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.aria-label.3c28b9a35dad", { name: String(a.name) })
                        : t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.aria-label.df4c9847f246", { name: String(a.name) })
                    }
                    title={playingId === a.id ? t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.title.21dc72f27b65") : t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.title.78be1ac4f30d")}
                    className="rounded-sm p-0.5 text-text-tertiary hover:text-text-primary"
                  >
                    {playingId === a.id ? (
                      <Pause className="size-3.5" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                  </button>
                  {editable ? (
                    inUse ? (
                      <span
                        className="flex shrink-0 items-center gap-0.5 text-[11px] text-status-success"
                        title={t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.title.4883df11f2d3")}
                      >
                        <Check className="size-3" aria-hidden />
                        {t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.span.0f0743fdd872")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => use(a)}
                        className="flex shrink-0 items-center gap-0.5 rounded-sm px-1 text-[11px] text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                        title={t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.title.aeaffbac7eff")}
                      >
                        <Plus className="size-3" aria-hidden />
                        {t("app-scene-editor-nearby-audio-panel.nearby-audio-panel.button.6c82d4f1f493")}
                      </button>
                    )
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p role="alert" className="px-3 pb-2 text-xs text-status-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
});
