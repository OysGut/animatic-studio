/**
 * Dialog med AI-stemmer (DEC-0071): replikkene i scenen leses inn med hver karakters stemme (ElevenLabs,
 * tekst til tale) og legges på dialogsporet der replikken skjer. Brukeren velger stemme per karakter (lagres på
 * karakteren), velger replikker, ser anslått pris og bekrefter. Hver replikk blir en lydressurs koblet til
 * replikken og karakteren; alt kan angres. Opptak og importert dialog røres ikke.
 */
import { CircleCheck, CircleDashed, Loader2, Mic, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  costBreakdown,
  type FilmClip,
  formatUsd,
  L,
  locale,
  newId,
  type ProjectState,
  providerInfo,
  providerModel,
  sceneDialogueLines,
  speechCostUsd,
  SPEECH_MODEL,
  tm,
  audioVersion,
  voiceUsers,
} from "@/core";
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
  const connected = (providers.data?.providers ?? []).includes("elevenlabs");
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
        text: L("Lyden kunne ikke spilles av.", "The audio could not be played."),
      });
    }
  }
  async function playLine(blockId: string, clipId: string) {
    const c = state.audioClips[clipId];
    const v = c ? audioVersion(state, c) : null;
    if (!v) {
      setMsg({ kind: "error", text: L("Lydfilen mangler.", "The audio file is missing.") });
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
      L("Stemme for karakteren", "Voice for the character"),
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
        L(
          `Leser inn … ${n + 1} av ${runnable.length}`,
          `Reading in … ${n + 1} of ${runnable.length}`,
        ),
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
                  description: L(
                    `Lest inn med AI-stemmen «${l.character!.voice!.label}»: «${l.text}»`,
                    `Read in with the AI voice “${l.character!.voice!.label}”: “${l.text}”`,
                  ).slice(0, 2000),
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
            fields: { name: L("Lyd", "Sound"), style: "other", appearance: "" },
          },
          {
            type: "AddAssetVersion",
            versionId: r.versionId,
            variantId,
            media: { ...r.media, durationMs },
            note: L(
              `Lest inn med AI (elevenlabs/${SPEECH_MODEL})`,
              `Read in with AI (elevenlabs/${SPEECH_MODEL})`,
            ),
          },
          {
            type: "AddAudioClips",
            clips: [
              {
                clipId: newId<"audio_clip">(),
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
        ];
        let err: string | null = null;
        for (const c of steps) {
          const res = await cmds.runAndWait(
            c as never,
            L(`AI-stemme: ${name}`, `AI voice: ${name}`),
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
          L(`AI-stemme: ${name}`, `AI voice: ${name}`),
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
            text: L(
              `${made} lest inn. ${errors.slice(0, 5).join(" · ")}`,
              `${made} read in. ${errors.slice(0, 5).join(" · ")}`,
            ),
          }
        : {
            kind: "ok",
            text: L(
              `${made} ${made === 1 ? "replikk er" : "replikker er"} lest inn og lagt på dialogsporet. Hver kan angres.`,
              `${made} ${made === 1 ? "line is" : "lines are"} read in and added to the dialogue track. Each can be undone.`,
            ),
          },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Mic className="size-4" aria-hidden />{" "}
            {L("Dialog med AI-stemmer", "Dialogue with AI voices")}
          </DialogTitle>
          <DialogDescription>
            {L(
              "Replikkene leses inn med karakterens stemme og legges på dialogsporet der replikken skjer. Teksten er replikken slik den står i manuset. Opptak og importert dialog røres ikke.",
              "The lines are read in with the character's voice and added to the dialogue track where the line happens. The text is the line as it stands in the script. Recordings and imported dialogue are not touched.",
            )}
          </DialogDescription>
        </DialogHeader>
        {!clip ? null : providers.isLoading ? (
          <p className="text-xs text-text-tertiary">
            {L("Henter leverandører …", "Loading providers …")}
          </p>
        ) : !connected ? (
          <p className="text-[13px] text-text-secondary">
            {L(
              "ElevenLabs er ikke koblet til. Prosjektets eier kan koble det til under «AI-leverandører» på prosjektlisten.",
              "ElevenLabs is not connected. The project owner can connect it under “AI providers” on the project list.",
            )}
          </p>
        ) : lines.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            {L("Scenen har ingen replikker.", "The scene has no lines.")}
          </p>
        ) : (
          <>
            <section aria-label={L("Stemmer", "Voices")} className="flex flex-col gap-1">
              <p className="text-xs font-medium text-text-secondary">
                {L("Stemme per karakter", "Voice per character")}
              </p>
              {voices.isLoading ? (
                <p className="text-xs text-text-tertiary">
                  {L("Henter stemmer …", "Loading voices …")}
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
                        aria-label={L(`Stemme for ${c.name}`, `Voice for ${c.name}`)}
                        value={c.voice?.voiceId ?? ""}
                        disabled={!!busy || !voices.data?.ok}
                        onChange={(e) => setVoice(c.id, e.target.value)}
                        className={ctl + " flex-1"}
                      >
                        <option value="">{L("Ingen stemme", "No voice")}</option>
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
                                ? L(
                                    ` (brukes av ${used.join(", ")})`,
                                    ` (used by ${used.join(", ")})`,
                                  )
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
                        aria-label={L(
                          `Hør stemmen til ${c.name}`,
                          `Listen to the voice of ${c.name}`,
                        )}
                        title={
                          preview
                            ? L("Hør en prøve av stemmen", "Listen to a sample of the voice")
                            : L("Ingen prøve for stemmen", "No sample for the voice")
                        }
                      >
                        {playing === `voice:${c.id}` ? <Pause /> : <Play />}
                        {L("Prøve", "Preview")}
                      </Button>
                    </label>
                    <p className="pl-[168px] text-[11px]">
                      {c.voice ? (
                        <span className="text-text-secondary">
                          {L("Stemme:", "Voice:")}{" "}
                          <span className="text-text-primary">{c.voice.label}</span>
                          {others.length ? (
                            <span className="text-status-uncertain">
                              {" "}
                              · {L("brukes også av", "also used by")} {others.join(", ")}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-status-uncertain">
                          {L("Ingen stemme valgt", "No voice selected")}
                        </span>
                      )}
                    </p>
                  </div>
                );
              })}
              {lines.some((l) => !l.character) ? (
                <p className="text-[11px] text-text-tertiary">
                  {L(
                    "Noen replikker har en karakter som ikke finnes i biblioteket; legg den til der for å gi den stemme.",
                    "Some lines have a character that is not in the library; add it there to give it a voice.",
                  )}
                </p>
              ) : null}
            </section>
            <p className="text-xs text-text-secondary" role="status">
              <span className="text-status-success">
                {withAudio} {L("har lyd", "have audio")}
              </span>{" "}
              ·{" "}
              <span className={lines.length - withAudio ? "text-status-uncertain" : ""}>
                {lines.length - withAudio} {L("mangler", "missing")}
              </span>{" "}
              {L("av", "of")} {lines.length} {L("replikker", "lines")}.{" "}
              {L("Replikker uten lyd er valgt.", "Lines without audio are selected.")}
            </p>
            <ul
              aria-label={L("Replikker", "Lines")}
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
                            {L("Har lyd", "Has audio")}
                            {l.audio.ai ? " (AI)" : L(" (opptak/import)", " (recording/import)")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 rounded-sm bg-status-uncertain/15 px-1 font-medium text-status-uncertain">
                            <CircleDashed className="size-3" aria-hidden />
                            {L("Mangler lyd", "Missing audio")}
                          </span>
                        )}
                        <span>
                          {l.speaker || L("Uten navn", "No name")} · {(l.startMs / 1000).toFixed(1)}{" "}
                          s
                        </span>
                        {l.character?.voice ? (
                          <span>
                            {L("· stemme:", "· voice:")} {l.character.voice.label}
                          </span>
                        ) : (
                          <span className="text-status-uncertain">
                            {L("· mangler stemme", "· missing voice")}
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
                      aria-label={L(
                        `Spill av replikken til ${l.speaker || "karakteren"}`,
                        `Play the line of ${l.speaker || "the character"}`,
                      )}
                      title={L("Spill av lyden replikken har", "Play the audio the line has")}
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
                aria-label={L("Bekreft innlesing", "Confirm reading in")}
                className="flex flex-col gap-2 rounded-sm border border-accent-warm/60 bg-surface-2 p-2"
              >
                <p className="text-xs text-text-primary">
                  {runnable.length}{" "}
                  {runnable.length === 1 ? L("replikk", "line") : L("replikker", "lines")} (
                  {runnable.reduce((t, l) => t + l.text.length, 0)} {L("tegn", "characters")}){" "}
                  {L(
                    "med ElevenLabs. Belastes kontoen til prosjektets eier, anslått",
                    "with ElevenLabs. Charged to the project owner's account, estimated at",
                  )}{" "}
                  {cost !== null ? formatUsd(cost) : L("ukjent pris", "unknown price")}{" "}
                  {L(
                    "(et anslag). Vil du lese dem inn nå?",
                    "(an estimate). Do you want to read them in now?",
                  )}
                </p>
                {speechModel && providerInfo("elevenlabs") ? (
                  <CostLines
                    lines={[
                      ...costBreakdown(providerInfo("elevenlabs")!, speechModel, {
                        targets: runnable.length,
                        targetsLabel: L("replikker", "lines"),
                        total:
                          cost !== null
                            ? L(`ca. ${formatUsd(cost)}`, `approx. ${formatUsd(cost)}`)
                            : null,
                      }).slice(0, -1),
                      {
                        label: L("Tegn", "Characters"),
                        value: runnable
                          .reduce((t, l) => t + l.text.length, 0)
                          .toLocaleString(locale()),
                      },
                      {
                        label: L("Samlet anslag", "Estimated total"),
                        value:
                          cost !== null
                            ? L(`ca. ${formatUsd(cost)}`, `approx. ${formatUsd(cost)}`)
                            : L("ukjent pris", "unknown price"),
                      },
                    ]}
                  />
                ) : null}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void run()} disabled={!!busy}>
                    <Mic /> {L("Ja, les inn", "Yes, read in")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                    {L("Avbryt", "Cancel")}
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
            {L("Lukk", "Close")}
          </Button>
          {connected && lines.length ? (
            <Button
              variant="secondary"
              disabled={!!busy || runnable.length === 0 || confirm}
              onClick={() => setConfirm(true)}
            >
              <Mic />
              {L("Les inn", "Read in")} ({runnable.length}, ~{cost !== null ? formatUsd(cost) : "?"}
              ) …
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
