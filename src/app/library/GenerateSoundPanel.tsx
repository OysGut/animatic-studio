/**
 * Lag lyd med AI (DEC-0069, Mars: «og lyder?»): en lydeffekt fra en beskrivelse, med en leverandør
 * prosjektets eiere har koblet til (ElevenLabs). Kostnaden vises og må bekreftes (REQ-0279). Resultatet
 * legges inn som ny versjon av varianten (AddAssetVersion) og kan angres; ingenting godkjennes automatisk.
 */
import { UiId } from "@/app/shared/UiId";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { type Asset, type AssetVariant, costBreakdown, profileChoice, qualityProfileSnapshot, defaultSoundPrompt, estimateCostUsd, formatUsd, providerInfo, providersFor, tm } from "@/core";
import { generateSound } from "@/adapters/ai/sound.functions";
import type { Commands } from "@/app/project/use-commands";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { aiJobsKey } from "@/app/ai/use-ai-jobs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { signedUrls } from "./asset-images";
import { audioDuration } from "./asset-audio";
import { QualityProfilePicker, QualityProfileBudget, useQualityProfile } from "@/app/ai/QualityProfilePicker";
import { CostLines } from "@/app/ai/CostLines";
import { t } from "@/core/i18n/keyed";

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
  const state = typeof cmds.current === "function" ? cmds.current() : null;
  const quality = useQualityProfile(state);
  const recommended = profileChoice("sound", quality.profile, new Set(available.data?.providers ?? []));
  const chosen = models.find((m) => `${m.provider.id}|${m.model.id}` === pick) ?? (recommended ? models.find(m => m.model.id === recommended.model.id) : null) ?? models[0];
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
  const canRun = !!chosen && !!prompt.trim() && !running && !quality.budgetError;

  async function run() {
    if (!chosen || !canRun) return;
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
          approved: true, qualityProfile: quality.profile ? qualityProfileSnapshot(quality.profile) : null,
        },
      });
      if (!r.ok) {
        setError(tm(r.message));
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
          note: t("app-library-generate-sound-panel.note.l-generert-med-ai-r-model-prompt-trim-generated-with-ai-r-model-prompt-trim-slice.50a5946fb31e", { model: String(r.model), value2: String(prompt.trim()) }).slice(0, 500),
        },
        t("app-library-generate-sound-panel.res.cmds-run-and-wait.15701010066e", { name: String(variant.name) }),
      );
      if (res.error) setError(res.error);
      else
        setDone(
          t("app-library-generate-sound-panel.run.set-done.f320210cf318"),
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    }
  }

  return (
    <section
      aria-label={t("app-library-generate-sound-panel.generate-sound-panel.aria-label.bb1d4f0336c2")}
      className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-2"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-text-primary">
          {t("app-library-generate-sound-panel.generate-sound-panel.h4.bb1d4f0336c2")}
        </h4>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={running}>
          {t("app-library-generate-sound-panel.generate-sound-panel.button.b2d20478ce14")}
        </Button>
      </div>
      {available.isLoading ? (
        <p className="text-xs text-text-tertiary">
          {t("app-library-generate-sound-panel.generate-sound-panel.p.7f3e08418b4b")}
        </p>
      ) : !chosen ? (
        <p className="text-xs text-text-secondary">
          {t("app-library-generate-sound-panel.generate-sound-panel.p.9f97ded97f7e")}
        </p>
      ) : (
        <>
          {state ? <QualityProfilePicker state={state} value={quality.choice} disabled={running} onChange={v => { quality.setChoice(v); setPick(null); setConfirm(false); }} /> : null}<QualityProfileBudget error={quality.budgetError} />
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("app-library-generate-sound-panel.generate-sound-panel.label.6bab6a686bc0")}
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
                {t("app-library-generate-sound-panel.generate-sound-panel.label.bfc44e2bfaae")}
                <select
                  aria-label={t("app-library-generate-sound-panel.generate-sound-panel.aria-label.90c6b1a920e8")}
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
              {t("app-library-generate-sound-panel.generate-sound-panel.label.401b22f9b62c")}
              <select
                aria-label={t("app-library-generate-sound-panel.generate-sound-panel.aria-label.844c9add189c")}
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
                    {s === null ? t("app-library-generate-sound-panel.generate-sound-panel.option.b3d2dc389bd1") : `${s} s`}
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
              {t("app-library-generate-sound-panel.generate-sound-panel.label.3bd4b115b5e0")}
            </label>
          </div>
          {confirm ? (
            <div
              role="alertdialog"
              aria-label={t("app-library-generate-sound-panel.generate-sound-panel.aria-label.3823ab83a6ad")}
              className="relative flex flex-col gap-2 rounded-sm border border-accent-warm/60 bg-surface-1 p-2"
            ><UiId id="V-152" />
              <p className="text-xs text-text-primary">
                {t("app-library-generate-sound-panel.confirm-sound", {
  provider: providerInfo(chosen.provider.id)?.name ?? "",
  cost: cost !== null ? formatUsd(cost) : t("app-library-generate-sound-panel.confirm-sound-unknown-price"),
  longest: seconds === null ? t("app-library-generate-sound-panel.confirm-sound-longest", { seconds: maxS }) : "",
})}
              </p>
              <CostLines
                lines={costBreakdown(chosen.provider, chosen.model, {
                  seconds: seconds !== null ? [seconds] : [],
                  ...(seconds === null ? { assumedMaxSeconds: maxS } : {}),
                  total:
                    cost !== null
                      ? t("app-library-generate-sound-panel.total.total.ad2104f4e760", { value1: String(formatUsd(cost)) })
                      : null,
                })}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void run()} disabled={!canRun}>
                  <AiGlyph /> {t("app-library-generate-sound-panel.generate-sound-panel.button.7c6b3c48bd97")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  {t("app-library-generate-sound-panel.generate-sound-panel.button.465a418f20d9")}
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
              {running ? t("app-library-generate-sound-panel.generate-sound-panel.button.633f7288b3d0") : t("app-library-generate-sound-panel.generate-sound-panel.button.babd46c2c06b")}
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
