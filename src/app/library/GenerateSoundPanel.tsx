/**
 * Lag lyd med AI (DEC-0069, Mars: «og lyder?»): en lydeffekt fra en beskrivelse, med en leverandør
 * prosjektets eiere har koblet til (ElevenLabs). Kostnaden vises og må bekreftes (REQ-0279). Resultatet
 * legges inn som ny versjon av varianten (AddAssetVersion) og kan angres; ingenting godkjennes automatisk.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import {
  type Asset,
  type AssetVariant,
  costBreakdown,
  defaultSoundPrompt,
  estimateCostUsd,
  formatUsd,
  providerInfo,
  providersFor,
} from "@/core";
import { generateSound } from "@/adapters/ai/sound.functions";
import type { Commands } from "@/app/project/use-commands";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { aiJobsKey } from "@/app/ai/use-ai-jobs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { signedUrls } from "./asset-images";
import { audioDuration } from "./asset-audio";
import { CostLines } from "@/app/ai/CostLines";

const LENGTHS: readonly (number | null)[] = [null, 1, 2, 3, 5, 8, 10, 15, 20, 30];

export function GenerateSoundPanel({
  projectId,
  asset,
  variant,
  cmds,
  onClose,
}: {
  projectId: string;
  asset: Asset;
  variant: AssetVariant;
  cmds: Commands;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const available = useProjectProviders(projectId);
  const options = providersFor("sound", new Set(available.data?.providers ?? []));
  const models = options.flatMap((o) => o.models.map((m) => ({ provider: o.provider, model: m })));
  const [pick, setPick] = useState<string | null>(null);
  const chosen = models.find((m) => `${m.provider.id}|${m.model.id}` === pick) ?? models[0];
  const [prompt, setPrompt] = useState(() => defaultSoundPrompt(asset, variant));
  const [seconds, setSeconds] = useState<number | null>(null);
  const [loop, setLoop] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Lengdene modellen tar imot (tidsbegrensningen i katalogen, REQ-0273)
  const maxS = chosen?.model.soundSeconds?.max ?? 30;
  const minS = chosen?.model.soundSeconds?.min ?? 0.5;
  const lengths = LENGTHS.filter((x) => x === null || (x >= minS && x <= maxS));
  const cost = chosen
    ? estimateCostUsd(chosen.provider.id, chosen.model.id, { seconds: seconds ?? maxS })
    : null;
  const canRun = !!chosen && !!prompt.trim() && !running;

  async function run() {
    if (!chosen) return;
    setConfirm(false);
    setRunning(true);
    setError(null);
    setDone(null);
    try {
      const r = await generateSound({
        data: {
          projectId,
          assetId: asset.id,
          prompt: prompt.trim(),
          provider: chosen.provider.id,
          model: chosen.model.id,
          seconds,
          loop,
          approved: true,
        },
      });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      // Lengden måles i nettleseren (som ved opplasting); feiler det, lagres versjonen uten lengde
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
      const res = await cmds.runAndWait(
        {
          type: "AddAssetVersion",
          versionId: r.versionId as never,
          variantId: variant.id,
          media: { ...r.media, durationMs },
          note: `Generert med AI (${r.model}): ${prompt.trim()}`.slice(0, 500),
        },
        `AI-lyd i «${variant.name}»`,
      );
      if (res.error) setError(res.error);
      else setDone("Lyden er lagt inn som ny versjon. Lytt og godkjenn den hvis den passer.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    }
  }

  return (
    <section
      aria-label="Lag lyd med AI"
      className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-2"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-text-primary">Lag lyd med AI</h4>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={running}>
          Lukk
        </Button>
      </div>
      {available.isLoading ? (
        <p className="text-xs text-text-tertiary">Henter leverandører …</p>
      ) : !chosen ? (
        <p className="text-xs text-text-secondary">
          Ingen av prosjektets eiere har koblet til en lydleverandør ennå. Eieren kan koble til
          ElevenLabs under «AI-leverandører» på prosjektlisten.
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Beskriv lyden (gjerne på engelsk)
            <Textarea
              value={prompt}
              maxLength={1000}
              rows={3}
              disabled={running}
              onChange={(e) => {
                setPrompt(e.target.value);
                setConfirm(false);
              }}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
            {models.length > 1 ? (
              <label className="flex items-center gap-1">
                Modell
                <select
                  aria-label="Lydmodell"
                  value={`${chosen.provider.id}|${chosen.model.id}`}
                  disabled={running}
                  onChange={(e) => {
                    setPick(e.target.value);
                    setConfirm(false);
                  }}
                  className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                >
                  {models.map((m) => (
                    <option
                      key={`${m.provider.id}|${m.model.id}`}
                      value={`${m.provider.id}|${m.model.id}`}
                    >
                      {m.provider.name} – {m.model.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span>
                {chosen.provider.name} – {chosen.model.label}
              </span>
            )}
            <label className="flex items-center gap-1">
              Lengde
              <select
                aria-label="Lengde på lyden"
                value={seconds === null ? "" : String(seconds)}
                disabled={running}
                onChange={(e) => {
                  setSeconds(e.target.value ? Number(e.target.value) : null);
                  setConfirm(false);
                }}
                className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
              >
                {lengths.map((s) => (
                  <option key={s ?? "auto"} value={s === null ? "" : String(s)}>
                    {s === null ? "Automatisk" : `${s} s`}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={loop}
                disabled={running}
                onChange={(e) => {
                  setLoop(e.target.checked);
                  setConfirm(false);
                }}
              />
              Sømløs løkke (bakgrunnslyd)
            </label>
          </div>
          {confirm ? (
            <div
              role="alertdialog"
              aria-label="Bekreft generering"
              className="flex flex-col gap-2 rounded-sm border border-accent-warm/60 bg-surface-1 p-2"
            >
              <p className="text-xs text-text-primary">
                Dette belastes {providerInfo(chosen.provider.id)?.name}-kontoen til prosjektets eier
                (én lyd, anslått høyst {cost !== null ? formatUsd(cost) : "ukjent pris"}
                {seconds === null ? ` regnet med lengste lengde, ${maxS} sekunder` : ""} – et
                anslag). Vil du lage lyden nå?
              </p>
              <CostLines
                lines={costBreakdown(chosen.provider, chosen.model, {
                  seconds: seconds !== null ? [seconds] : [],
                  ...(seconds === null ? { assumedMaxSeconds: maxS } : {}),
                  total: cost !== null ? `høyst ${formatUsd(cost)}` : null,
                })}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void run()} disabled={!canRun}>
                  <AiGlyph /> Ja, lag lyden
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  Avbryt
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="self-start"
              disabled={!canRun}
              onClick={() => setConfirm(true)}
            >
              {running ? <Loader2 className="animate-spin" /> : <AiGlyph />}
              {running ? "Lager lyden …" : "Lag lyd …"}
            </Button>
          )}
        </>
      )}
      {done ? (
        <p role="status" className="text-xs text-status-success">
          {done}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
