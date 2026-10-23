/**
 * Dialog med AI-stemmer (DEC-0071): replikkene i scenen leses inn med hver karakters stemme (ElevenLabs,
 * tekst til tale) og legges på dialogsporet der replikken skjer. Brukeren velger stemme per karakter (lagres på
 * karakteren), velger replikker, ser anslått pris og bekrefter. Hver replikk blir en lydressurs koblet til
 * replikken og karakteren; alt kan angres. Opptak og importert dialog røres ikke.
 */
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { CircleCheck, CircleDashed, Loader2, Mic, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { costBreakdown, type FilmClip, formatUsd, locale, newId, type ProjectState, providerInfo, providerModel, sceneDialogueLines, speechCostUsd, SPEECH_MODEL, catalogSettings, isModelEnabled, tm, audioVersion, voiceUsers } from "@/core";
import { generateSpeech, listVoices } from "@/adapters/ai/speech.functions";
import type { Commands } from "@/app/project/use-commands";
import { aiJobsKey } from "@/app/ai/use-ai-jobs";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { signedUrls } from "@/app/library/asset-images";
import { audioDuration } from "@/app/library/asset-audio";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CostLines } from "@/app/ai/CostLines";
import { t as tk } from "@/core/i18n/keyed";

const ctl =
  "h-7 min-w-0 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary disabled:opacity-50";

export function AiDialogueDialog({
  open,
  onOpenChange,
  state,
  clip,
  cmds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  clip: FilmClip | null;
  cmds: Commands;
}) {
  const projectId = state.project.id;
  const qc = useQueryClient();
  const providers = useProjectProviders(projectId, open);
  // Avslått av administrator (DEC-0088) regnes som ikke tilkoblet
  const connected =
    (providers.data?.providers ?? []).includes("elevenlabs") &&
    isModelEnabled(catalogSettings(), "elevenlabs", SPEECH_MODEL);
  const voices = useQuery({
    queryKey: ["ai-voices", projectId],
    enabled: open && connected,
    staleTime: 10 * 60_000,
    queryFn: () => listVoices({ data: { projectId } }),
  });
  const lines = useMemo(() => (clip ? sceneDialogueLines(state, clip) : []), [state, clip]);
  const characters = useMemo(
    () => [
      ...new Map(
        lines.filter((l) => l.character).map((l) => [l.character!.id, l.character!]),
      ).values(),
    ],
    [lines],
  );
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  const defaultPick = new Set(
    lines.filter((l) => !l.hasAudio && l.character?.voice).map((l) => l.blockId),
  );
  const chosen = picked ?? defaultPick;
  const runnable = lines.filter((l) => chosen.has(l.blockId) && l.character?.voice);
  const cost = speechCostUsd(runnable);
  const speechModel = providerModel("elevenlabs", SPEECH_MODEL);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const running = useRef(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const users = useMemo(() => voiceUsers(state), [state]);
  const withAudio = lines.filter((l) => l.audio).length;

  // Avspilling: en stemmeprøve eller replikkens innleste lyd (DEC-0079)
  const player = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  function stopPlaying() {
    player.current?.pause();
    player.current = null;
    setPlaying(null);
  }
  useEffect(() => {
    if (!open) stopPlaying();
  }, [open]);
  async function playUrl(key: string, url: string | null | undefined) {
    if (playing === key) {
      stopPlaying();
      return;
    }
    stopPlaying();
    if (!url) return;
    const a = new Audio(url);
    player.current = a;
    setPlaying(key);
    a.onended = () => setPlaying((p) => (p === key ? null : p));
    try {
      await a.play();
    } catch {
      setPlaying(null);
      setMsg({
        kind: "error",
        text: tk("app-assembly-ai-dialogue-dialog.text.text.88c0ff05514d"),
      });
    }
  }
  async function playLine(blockId: string, clipId: string) {
    const c = state.audioClips[clipId];
    const v = c ? audioVersion(state, c) : null;
    if (!v) {
      setMsg({ kind: "error", text: tk("app-assembly-ai-dialogue-dialog.text.text.4e568150b005") });
      return;
    }
    const url = (await signedUrls([v.mediaPath], 600))[v.mediaPath];
    await playUrl(`line:${blockId}`, url);
  }
  const voiceList = voices.data?.ok ? voices.data.voices : [];

  function setVoice(assetId: string, voiceId: string) {
    const v = voices.data?.ok ? voices.data.voices.find((x) => x.voiceId === voiceId) : undefined;
    const e = cmds.run(
      {
        type: "SetAssetVoice",
        assetId,
        voice: v ? { provider: "elevenlabs", voiceId: v.voiceId, label: v.name } : null,
      } as never,
      tk("app-assembly-ai-dialogue-dialog.e.cmds-run.83f6ced7c610"),
    );
    if (e) setMsg({ kind: "error", text: e });
  }

  async function run() {
    // Dobbeltklikk skal aldri starte (og betale for) innlesingen to ganger
    if (!clip || running.current) return;
    running.current = true;
    try {
      await runAll();
    } finally {
      running.current = false;
    }
  }

  async function runAll() {
    if (!clip) return;
    setConfirm(false);
    setMsg(null);
    const errors: string[] = [];
    let made = 0;
    for (const [n, l] of runnable.entries()) {
      setBusy(
        tk("app-assembly-ai-dialogue-dialog.run-all.set-busy.c66b6321c670", { value1: String(n + 1), length: String(runnable.length) }),
      );
      try {
        const r = await generateSpeech({
          data: {
            projectId,
            blockId: l.blockId,
            voiceId: l.character!.voice!.voiceId,
            approved: true,
          },
        });
        if (!r.ok) {
          errors.push(`${l.speaker}: ${tm(r.message)}`);
          if (/taket|budsjett/i.test(r.message)) break;
          continue;
        }
        // Lengden måles i nettleseren
        let durationMs: number | null = null;
        try {
          const url = (await signedUrls([r.media.path], 600))[r.media.path];
          if (url) {
            const res = await fetch(url);
            if (res.ok) durationMs = await audioDuration(await res.arrayBuffer());
          }
        } catch {
          durationMs = null;
        }
        const name = `${l.speaker} – ${l.text.split(" ").slice(0, 5).join(" ")}`.slice(0, 120);
        const variantId = newId<"asset_variant">();
        const dialogueClipId = newId<"audio_clip">();
        const group = newId();
        const steps = [
          {
            type: "CreateAssets",
            assets: [
              {
                assetId: r.assetId,
                fields: {
                  kind: "sound",
                  name,
                  names: [],
                  description: tk("app-assembly-ai-dialogue-dialog.description.l-lest-inn-med-ai-stemmen-l-character-voice-label-l-text-read-in-with-the-ai-voice-l-character-voice-label-l-text-slice.a711e60de6d4", { label: String(l.character!.voice!.label), text: String(l.text) }).slice(0, 2000),
                  category: "Dialog (AI)",
                  tags: ["AI-stemme"],
                },
              },
            ],
          },
          {
            type: "CreateAssetVariant",
            variantId,
            assetId: r.assetId,
            fields: { name: tk("app-assembly-ai-dialogue-dialog.name.name.21288548c6ec"), style: "other", appearance: "" },
          },
          {
            type: "AddAssetVersion",
            versionId: r.versionId,
            variantId,
            media: { ...r.media, durationMs },
            note: tk("app-assembly-ai-dialogue-dialog.note.note.c44b36ed3e4f", { SPEECH_MODEL: String(SPEECH_MODEL) }),
          },
          {
            type: "AddAudioClips",
            dialogueMeta: { source: "ai", provider: "elevenlabs", voiceId: l.character?.voice?.voiceId ?? null, modelId: SPEECH_MODEL, settings: { language: "no" }, scriptRevision: r.scriptRevision, parentVersionId: null },
            clips: [
              {
                clipId: dialogueClipId,
                fields: {
                  occurrenceId: clip.occurrenceId,
                  kind: "dialogue",
                  name,
                  assetId: r.assetId,
                  assetVariantId: null,
                  versionId: null,
                  blockId: l.blockId,
                  offsetMs: l.startMs,
                  sourceInMs: 0,
                  lengthMs: Math.max(1, durationMs ?? 2000),
                  gainDb: 0,
                  fadeInMs: 0,
                  fadeOutMs: 0,
                  muted: false,
                  continues: false,
                  volumeKeys: [],
                },
              },
            ],
          },
          ...(l.character ? [{ type: "SetDialogueCharacter", clipIds: [dialogueClipId], characterAssetId: l.character.id }] : []),
        ];
        let err: string | null = null;
        for (const c of steps) {
          const res = await cmds.runAndWait(
            c as never,
            tk("app-assembly-ai-dialogue-dialog.res.cmds-run-and-wait.322a48f3e6d4", { name: String(name) }),
            group,
          );
          if (res.error) {
            err = res.error;
            break;
          }
        }
        if (err) {
          errors.push(`${l.speaker}: ${err}`);
          continue;
        }
        // Kobling til replikken og karakteren (REQ-0204); krever migrasjon 0025, hoppes over ellers
        await cmds.runAndWait(
          {
            type: "SetSoundLinks",
            assetId: r.assetId,
            links: [
              { kind: "block", id: l.blockId },
              { kind: "asset", id: l.character!.id },
            ],
          } as never,
          tk("app-assembly-ai-dialogue-dialog.run-all.cmds-run-and-wait.c9fdf50ebd5e", { name: String(name) }),
          group,
        );
        made++;
      } catch (e) {
        errors.push(`${l.speaker}: ${(e as Error).message}`);
      }
    }
    setBusy(null);
    setPicked(null);
    void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    setMsg(
      errors.length
        ? {
            kind: "error",
            text: tk("app-assembly-ai-dialogue-dialog.text.text.55b21ca2d050", { made: String(made), value2: String(errors.slice(0, 5).join(" · ")) }),
          }
        : {
            kind: "ok",
            text: tk("app-assembly-ai-dialogue-dialog.lines-read-in", { count: made }),
          },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <ResizableDialogContent sizeKey="ai-dialogue" className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Mic className="size-4" aria-hidden />{" "}
            {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.dialog-title.00f0c4e97559")}
          </DialogTitle>
          <DialogDescription>
            {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.dialog-description.4e82a8ff8da1")}
          </DialogDescription>
        </DialogHeader>
        {!clip ? null : providers.isLoading ? (
          <p className="text-xs text-text-tertiary">
            {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.p.bb93ceb0b628")}
          </p>
        ) : !connected ? (
          <p className="text-[13px] text-text-secondary">
            {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.p.63253e65c278")}
          </p>
        ) : lines.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.p.864affde88cc")}
          </p>
        ) : (
          <>
            <section aria-label={tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.aria-label.58e105143702")} className="flex flex-col gap-1">
              <p className="text-xs font-medium text-text-secondary">
                {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.p.04cd8630ea62")}
              </p>
              {voices.isLoading ? (
                <p className="text-xs text-text-tertiary">
                  {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.p.80873a842fb8")}
                </p>
              ) : voices.data && !voices.data.ok ? (
                <p role="alert" className="text-xs text-status-danger">
                  {tm(voices.data.message)}
                </p>
              ) : null}
              {characters.map((c) => {
                const others = (c.voice ? (users.get(c.voice.voiceId) ?? []) : []).filter(
                  (n) => n !== c.name,
                );
                const preview = voiceList.find((v) => v.voiceId === c.voice?.voiceId)?.previewUrl;
                return (
                  <div key={c.id} className="flex flex-col gap-0.5">
                    <label className="flex items-center gap-2 text-xs text-text-secondary">
                      <span className="w-40 truncate text-text-primary">{c.name}</span>
                      <select
                        aria-label={tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.aria-label.ec1b8aa253ef", { name: String(c.name) })}
                        value={c.voice?.voiceId ?? ""}
                        disabled={!!busy || !voices.data?.ok}
                        onChange={(e) => setVoice(c.id, e.target.value)}
                        className={ctl + " flex-1"}
                      >
                        <option value="">{tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.option.e5845bc6c891")}</option>
                        {c.voice && !voiceList.some((v) => v.voiceId === c.voice!.voiceId) ? (
                          <option value={c.voice.voiceId}>{c.voice.label}</option>
                        ) : null}
                        {voiceList.map((v) => {
                          // Hvem bruker stemmen alt? (kan likevel velges)
                          const used = (users.get(v.voiceId) ?? []).filter((n) => n !== c.name);
                          return (
                            <option key={v.voiceId} value={v.voiceId}>
                              {used.length ? "● " : ""}
                              {v.name}
                              {v.description ? ` – ${v.description}` : ""}
                              {used.length
                                ? tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.option.18adfd59df61", { value1: String(used.join(", ")) })
                                : ""}
                            </option>
                          );
                        })}
                      </select>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!preview}
                        onClick={() => void playUrl(`voice:${c.id}`, preview)}
                        aria-label={tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.aria-label.e6da7d599e00", { name: String(c.name) })}
                        title={
                          preview
                            ? tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.title.05954ad88fda")
                            : tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.title.d77529e07479")
                        }
                      >
                        {playing === `voice:${c.id}` ? <Pause /> : <Play />}
                        {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.button.c53a228ea155")}
                      </Button>
                    </label>
                    <p className="pl-[168px] text-[11px]">
                      {c.voice ? (
                        <span className="text-text-secondary">
                          {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.span.3406f6c1b00a")}{" "}
                          <span className="text-text-primary">{c.voice.label}</span>
                          {others.length ? (
                            <span className="text-status-uncertain">
                              {" "}
                              · {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.span.a4c8c2dc2f7e")} {others.join(", ")}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-status-uncertain">
                          {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.span.709df47b4c98")}
                        </span>
                      )}
                    </p>
                  </div>
                );
              })}
              {lines.some((l) => !l.character) ? (
                <p className="text-[11px] text-text-tertiary">
                  {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.p.e15eb6c56a7b")}
                </p>
              ) : null}
            </section>
            <p className="text-xs text-text-secondary" role="status">
              <span className="text-status-success">
                {withAudio} {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.span.f4cf1a3435e2")}
              </span>{" "}
              ·{" "}
              <span className={lines.length - withAudio ? "text-status-uncertain" : ""}>
                {lines.length - withAudio} {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.span.68068f09d385")}
              </span>{" "}
              {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.p.0311ceb517d3")} {lines.length} {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.p.f338fd22453a")}.{" "}
              {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.p.826dd297a583")}
            </p>
            <ul
              aria-label={tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.aria-label.dac1bec0120e")}
              className="max-h-[40vh] overflow-y-auto border border-border bg-surface-1"
            >
              {lines.map((l) => (
                <li
                  key={l.blockId}
                  className={
                    // i18n-ignore
                    "flex items-start border-b border-l-4 border-border last:border-b-0 " +
                    (l.audio ? "border-l-status-success" : "border-l-status-uncertain")
                  }
                >
                  <label className="flex flex-1 items-start gap-2 px-2 py-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={chosen.has(l.blockId)}
                      disabled={!!busy || !l.character?.voice}
                      onChange={(e) => {
                        const next = new Set(chosen);
                        if (e.target.checked) next.add(l.blockId);
                        else next.delete(l.blockId);
                        setPicked(next);
                        setConfirm(false);
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-text-tertiary">
                        {l.audio ? (
                          <span className="inline-flex items-center gap-0.5 rounded-sm bg-status-success/15 px-1 font-medium text-status-success">
                            <CircleCheck className="size-3" aria-hidden />
                            {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.span.436f8a785531")}
                            {l.audio.ai ? " (AI)" : tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.span.a24dea879231")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 rounded-sm bg-status-uncertain/15 px-1 font-medium text-status-uncertain">
                            <CircleDashed className="size-3" aria-hidden />
                            {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.span.89523b6c75bc")}
                          </span>
                        )}
                        <span>
                          {l.speaker || tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.span.eca9b3c9f787")} · {(l.startMs / 1000).toFixed(1)}{" "}
                          s
                        </span>
                        {l.character?.voice ? (
                          <span>
                            {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.span.8b2bc28e1525")} {l.character.voice.label}
                          </span>
                        ) : (
                          <span className="text-status-uncertain">
                            {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.span.b3d2460a4c9d")}
                          </span>
                        )}
                      </span>
                      <span className="text-text-primary">{l.text}</span>
                    </span>
                  </label>
                  {l.audio ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="m-1"
                      onClick={() => void playLine(l.blockId, l.audio!.clipId)}
                      aria-label={l.speaker ? tk("app-assembly-ai-dialogue-dialog.play-line-of", { speaker: l.speaker }) : tk("app-assembly-ai-dialogue-dialog.play-line-of-character")}
                      title={tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.title.2c63aef5e695")}
                    >
                      {playing === `line:${l.blockId}` ? <Pause /> : <Play />}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {confirm ? (
              <div
                role="alertdialog"
                aria-label={tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.aria-label.c43c89ca0d32")}
                className="flex flex-col gap-2 rounded-sm border border-accent-warm/60 bg-surface-2 p-2"
              >
                <p className="text-xs text-text-primary">
                  {runnable.length}{" "}
                  {runnable.length === 1 ? tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.p.eb8657322dc9") : tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.p.f338fd22453a.2")} (
                  {runnable.reduce((t, l) => t + l.text.length, 0)} {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.p.9de1d844099b")}){" "}
                  {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.p.100ef4070f6f")}{" "}
                  {cost !== null ? formatUsd(cost) : tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.p.4d53948d1ff4")}{" "}
                  {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.p.c4e7c7d62f28")}
                </p>
                {speechModel && providerInfo("elevenlabs") ? (
                  <CostLines
                    lines={[
                      ...costBreakdown(providerInfo("elevenlabs")!, speechModel, {
                        targets: runnable.length,
                        targetsLabel: tk("app-assembly-ai-dialogue-dialog.targets-label.targets-label.b9c7e2e02290"),
                        total:
                          cost !== null
                            ? tk("app-assembly-ai-dialogue-dialog.total.total.81ac5d637ce2", { value1: String(formatUsd(cost)) })
                            : null,
                      }).slice(0, -1),
                      {
                        label: tk("app-assembly-ai-dialogue-dialog.label.label.22038e56bfbf"),
                        value: runnable
                          .reduce((t, l) => t + l.text.length, 0)
                          .toLocaleString(locale()),
                      },
                      {
                        label: tk("app-assembly-ai-dialogue-dialog.label.label.fabf40c27ec9"),
                        value:
                          cost !== null
                            ? tk("app-assembly-ai-dialogue-dialog.value.value.98830544e254", { value1: String(formatUsd(cost)) })
                            : tk("app-assembly-ai-dialogue-dialog.value.value.e18ba2e3a24a"),
                      },
                    ]}
                  />
                ) : null}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void run()} disabled={!!busy}>
                    <Mic /> {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.button.10121f7d6fca")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                    {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.button.398764189aa2")}
                  </Button>
                </div>
              </div>
            ) : null}
            {busy ? (
              <p role="status" className="flex items-center gap-1 text-xs text-text-secondary">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> {busy}
              </p>
            ) : null}
          </>
        )}
        {msg ? (
          <p
            role={msg.kind === "error" ? "alert" : "status"}
            className={
              "text-xs " + (msg.kind === "error" ? "text-status-danger" : "text-status-success")
            }
          >
            {msg.text}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={!!busy}>
            {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.button.3035c28f2a84")}
          </Button>
          {connected && lines.length ? (
            <Button
              variant="secondary"
              disabled={!!busy || runnable.length === 0 || confirm}
              onClick={() => setConfirm(true)}
            >
              <Mic />
              {tk("app-assembly-ai-dialogue-dialog.ai-dialogue-dialog.button.b4921661c2ab")} ({runnable.length}, ~{cost !== null ? formatUsd(cost) : "?"}
              ) …
            </Button>
          ) : null}
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  );
}
