/**
 * Dialog med AI-stemmer (DEC-0071): replikkene i scenen leses inn med hver karakters stemme (ElevenLabs,
 * tekst til tale) og legges på dialogsporet der replikken skjer. Brukeren velger stemme per karakter (lagres på
 * karakteren), velger replikker, ser anslått pris og bekrefter. Hver replikk blir en lydressurs koblet til
 * replikken og karakteren; alt kan angres. Opptak og importert dialog røres ikke.
 */
import { Loader2, Mic } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  formatUsd,
  newId,
  sceneDialogueLines,
  speechCostUsd,
  type FilmClip,
  type ProjectState,
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
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const running = useRef(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function setVoice(assetId: string, voiceId: string) {
    const v = voices.data?.ok ? voices.data.voices.find((x) => x.voiceId === voiceId) : undefined;
    const e = cmds.run(
      {
        type: "SetAssetVoice",
        assetId,
        voice: v ? { provider: "elevenlabs", voiceId: v.voiceId, label: v.name } : null,
      } as never,
      "Stemme for karakteren",
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
      setBusy(`Leser inn … ${n + 1} av ${runnable.length}`);
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
          errors.push(`${l.speaker}: ${r.message}`);
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
                  description:
                    `Lest inn med AI-stemmen «${l.character!.voice!.label}»: «${l.text}»`.slice(
                      0,
                      2000,
                    ),
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
            fields: { name: "Lyd", style: "other", appearance: "" },
          },
          {
            type: "AddAssetVersion",
            versionId: r.versionId,
            variantId,
            media: { ...r.media, durationMs },
            note: "Lest inn med AI (elevenlabs/eleven_multilingual_v2)",
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
          const res = await cmds.runAndWait(c as never, `AI-stemme: ${name}`, group);
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
          `AI-stemme: ${name}`,
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
        ? { kind: "error", text: `${made} lest inn. ${errors.slice(0, 5).join(" · ")}` }
        : {
            kind: "ok",
            text: `${made} ${made === 1 ? "replikk er" : "replikker er"} lest inn og lagt på dialogsporet. Hver kan angres.`,
          },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Mic className="size-4" aria-hidden /> Dialog med AI-stemmer
          </DialogTitle>
          <DialogDescription>
            Replikkene leses inn med karakterens stemme og legges på dialogsporet der replikken
            skjer. Teksten er replikken slik den står i manuset. Opptak og importert dialog røres
            ikke.
          </DialogDescription>
        </DialogHeader>
        {!clip ? null : providers.isLoading ? (
          <p className="text-xs text-text-tertiary">Henter leverandører …</p>
        ) : !connected ? (
          <p className="text-[13px] text-text-secondary">
            ElevenLabs er ikke koblet til. Prosjektets eier kan koble det til under
            «AI-leverandører» på prosjektlisten.
          </p>
        ) : lines.length === 0 ? (
          <p className="text-[13px] text-text-secondary">Scenen har ingen replikker.</p>
        ) : (
          <>
            <section aria-label="Stemmer" className="flex flex-col gap-1">
              <p className="text-xs font-medium text-text-secondary">Stemme per karakter</p>
              {voices.isLoading ? (
                <p className="text-xs text-text-tertiary">Henter stemmer …</p>
              ) : voices.data && !voices.data.ok ? (
                <p role="alert" className="text-xs text-status-danger">
                  {voices.data.message}
                </p>
              ) : null}
              {characters.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-xs text-text-secondary">
                  <span className="w-40 truncate text-text-primary">{c.name}</span>
                  <select
                    aria-label={`Stemme for ${c.name}`}
                    value={c.voice?.voiceId ?? ""}
                    disabled={!!busy || !voices.data?.ok}
                    onChange={(e) => setVoice(c.id, e.target.value)}
                    className={ctl + " flex-1"}
                  >
                    <option value="">Ingen stemme</option>
                    {c.voice &&
                    voices.data?.ok &&
                    !voices.data.voices.some((v) => v.voiceId === c.voice!.voiceId) ? (
                      <option value={c.voice.voiceId}>{c.voice.label}</option>
                    ) : null}
                    {(voices.data?.ok ? voices.data.voices : []).map((v) => (
                      <option key={v.voiceId} value={v.voiceId}>
                        {v.name}
                        {v.description ? ` – ${v.description}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {lines.some((l) => !l.character) ? (
                <p className="text-[11px] text-text-tertiary">
                  Noen replikker har en karakter som ikke finnes i biblioteket; legg den til der for
                  å gi den stemme.
                </p>
              ) : null}
            </section>
            <ul
              aria-label="Replikker"
              className="max-h-[40vh] overflow-y-auto border border-border bg-surface-1"
            >
              {lines.map((l) => (
                <li key={l.blockId} className="border-b border-border last:border-b-0">
                  <label className="flex items-start gap-2 px-2 py-1.5 text-xs">
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
                      <span className="block text-[11px] text-text-tertiary">
                        {l.speaker || "Uten navn"} · {(l.startMs / 1000).toFixed(1)} s
                        {l.hasAudio ? " · har dialoglyd" : ""}
                        {!l.character?.voice ? " · mangler stemme" : ""}
                      </span>
                      <span className="text-text-primary">{l.text}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {confirm ? (
              <div
                role="alertdialog"
                aria-label="Bekreft innlesing"
                className="flex flex-col gap-2 rounded-sm border border-accent-warm/60 bg-surface-2 p-2"
              >
                <p className="text-xs text-text-primary">
                  {runnable.length} {runnable.length === 1 ? "replikk" : "replikker"} (
                  {runnable.reduce((t, l) => t + l.text.length, 0)} tegn) med ElevenLabs. Belastes
                  kontoen til prosjektets eier, anslått{" "}
                  {cost !== null ? formatUsd(cost) : "ukjent pris"} (et anslag). Vil du lese dem inn
                  nå?
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void run()} disabled={!!busy}>
                    <Mic /> Ja, les inn
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                    Avbryt
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
            Lukk
          </Button>
          {connected && lines.length ? (
            <Button
              variant="secondary"
              disabled={!!busy || runnable.length === 0 || confirm}
              onClick={() => setConfirm(true)}
            >
              <Mic />
              Les inn ({runnable.length}, ~{cost !== null ? formatUsd(cost) : "?"}) …
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
