/**
 * P8 massemodus (krav 6): harmoniser flere karakterer mot samme stil i én jobb, med samlet kostnadsanslag og
 * én godkjenning. Jobben er varig på serveren (lease og kvitteringer); et resultat som kan ha vært fakturert,
 * kjøres aldri på nytt. Hvert resultat blir en ny variant – originalene endres aldri.
 */
import { Loader2, Palette } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { L, estimateCostUsd, formatUsd, localized, tm, newId, qualityProfileSnapshot, type ProjectState } from "@/core";
import {
  advanceHarmonizeBatch,
  createHarmonizeBatch,
  listHarmonizeBatches,
  resumeHarmonizeBatch,
  type HarmonizeBatchView,
} from "@/adapters/storage/harmonize-batch.functions";
import { aiJobsKey } from "@/app/ai/use-ai-jobs";
import { useQualityProfile } from "@/app/ai/QualityProfilePicker";
import { Button } from "@/components/ui/button";
import { CostConfirm } from "./ImageAiPanels";
import type { ImageModelPick } from "./image-model";
import type { LightboxTools } from "./ImageLightbox";

/** Bildet som harmoniseres for en ressurs: godkjent versjon i første aktive variant, ellers det nyeste. */
export function harmonizeSourceOf(s: ProjectState, assetId: string): string | null {
  const variants = Object.values(s.assetVariants).filter((v) => v.assetId === assetId && !v.archived);
  for (const va of variants) {
    const ap = va.approvedVersionId ? s.assetVersions[va.approvedVersionId] : null;
    if (ap?.mimeType.startsWith("image/")) return ap.id;
  }
  const ids = new Set(variants.map((v) => v.id));
  const latest = Object.values(s.assetVersions)
    .filter((v) => ids.has(v.variantId) && v.mimeType.startsWith("image/"))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
  return latest?.id ?? null;
}

const STATUS: Record<string, string> = localized({
  waiting: ["Venter", "Waiting"],
  generating: ["Lager …", "Making …"],
  ready: ["Legges inn …", "Saving …"],
  done: ["Ferdig", "Done"],
  failed: ["Feilet", "Failed"],
  skipped: ["Hoppet over", "Skipped"],
});

export function HarmonizeBatchPanel({
  tools,
  projectId,
  styleProfileId,
  referenceVersionId,
  m,
  quality,
  onClose,
}: {
  tools: LightboxTools;
  projectId: string;
  styleProfileId: string | null;
  referenceVersionId: string | null;
  m: ImageModelPick;
  quality: ReturnType<typeof useQualityProfile>;
  onClose: () => void;
}) {
  const { state } = tools;
  const qc = useQueryClient();
  const candidates = useMemo(
    () =>
      Object.values(state.assets)
        .filter((a) => !a.removed && (a.kind === "character" || a.kind === "animal"))
        .map((a) => ({ asset: a, sourceVersionId: harmonizeSourceOf(state, a.id) }))
        .filter((x): x is { asset: typeof x.asset; sourceVersionId: string } => !!x.sourceVersionId),
    [state],
  );
  const [chosen, setChosen] = useState<Set<string>>(() => new Set([tools.asset.id].filter((id) => candidates.some((c) => c.asset.id === id))));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<HarmonizeBatchView | null>(null);
  const requestId = useRef(newId<"command">());
  const count = chosen.size;
  const noStyle = !styleProfileId && !referenceVersionId;
  // Samlet anslag (P8-avvik 2): pris per bilde for valgt modell og størrelse fra kvalitetsprofilen, ganger antallet.
  // Profilens budsjett kontrolleres for hele antallet, ikke bare ett bilde.
  const batchQuality = useQualityProfile(state, Math.max(1, count));
  useEffect(() => {
    batchQuality.setChoice(quality.choice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality.choice]);
  const unitUsd = m.choice
    ? estimateCostUsd(m.choice.provider.id, m.choice.model.id, { images: 1, ...(m.size ? { size: m.size } : {}) })
    : null;
  const priced = { ...m, unit: unitUsd };
  const budgetError = batchQuality.budgetError ?? quality.budgetError;

  async function refresh(id: string) {
    const list = await listHarmonizeBatches({ data: { projectId } });
    setJob(list.find((b) => b.id === id) ?? null);
    return list.find((b) => b.id === id) ?? null;
  }
  // Drivkraften er serveren; fanen spør bare om neste steg mens jobben kjører
  useEffect(() => {
    if (!job || job.status !== "running") return;
    let stop = false;
    const t = setTimeout(async () => {
      try {
        await advanceHarmonizeBatch({ data: { projectId, batchId: job.id } });
      } catch (e) {
        setError(tm((e as Error).message));
      }
      if (!stop) await refresh(job.id);
      void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    }, 800);
    return () => {
      stop = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  async function start() {
    if (!m.choice) return;
    setConfirm(false);
    setBusy(true);
    setError(null);
    try {
      const r = await createHarmonizeBatch({
        data: {
          projectId,
          requestId: requestId.current,
          styleProfileId,
          referenceVersionId,
          provider: m.choice.provider.id,
          model: m.choice.model.id,
          size: m.size,
          qualityProfile: quality.profile ? qualityProfileSnapshot(quality.profile) : null,
          items: candidates.filter((c) => chosen.has(c.asset.id)).map((c) => ({ assetId: c.asset.id, sourceVersionId: c.sourceVersionId })),
          approved: true,
        },
      });
      await refresh(r.id);
    } catch (e) {
      setError(tm((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="harmonize-batch-panel" className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-2 text-xs text-text-secondary">
      <h4 className="flex items-center gap-1 font-medium text-text-primary">
        <Palette className="size-3.5" aria-hidden /> {L("Harmoniser flere karakterer", "Harmonize more characters")}
      </h4>
      {job ? (
        <>
          <ul className="flex flex-col gap-0.5" data-testid="harmonize-batch-progress">
            {job.items.map((i) => (
              <li key={i.id} data-testid="harmonize-batch-item" className="flex justify-between gap-2">
                <span>{state.assets[i.asset_id]?.name ?? "?"}</span>
                <span className={i.status === "failed" ? "text-status-danger" : ""}>{STATUS[i.status] ?? i.status}</span>
              </li>
            ))}
          </ul>
          {job.status === "paused" ? (
            <>
              <p role="alert" className="text-status-danger">{tm(job.pause_reason ?? "")}</p>
              <Button size="sm" variant="secondary" data-testid="harmonize-batch-resume" onClick={() => void resumeHarmonizeBatch({ data: { projectId, batchId: job.id, approved: true } }).then(() => refresh(job.id)).catch((e: unknown) => setError(tm((e as Error).message)))}>
                {L("Bekreft og fortsett (bare bilder som sikkert ikke er laget)", "Approve and continue (only images certainly not made)")}
              </Button>
            </>
          ) : job.status === "done" ? (
            <p role="status" className="text-status-success">{L("Ferdig. Hvert resultat er en ny variant; originalene er uendret.", "Done. Each result is a new variant; the originals are unchanged.")}</p>
          ) : (
            <p role="status" className="flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" aria-hidden /> {L("Jobben kjører – den fortsetter selv om du lukker.", "The job is running – it continues even if you close.")}</p>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>{L("Lukk", "Close")}</Button>
        </>
      ) : (
        <>
          <fieldset className="flex max-h-48 flex-col gap-0.5 overflow-auto" disabled={busy}>
            <legend className="mb-1">{L("Karakterer med bilde", "Characters with an image")}</legend>
            {candidates.map((c) => (
              <label key={c.asset.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  data-testid="harmonize-batch-choice"
                  checked={chosen.has(c.asset.id)}
                  onChange={(e) => {
                    const n = new Set(chosen);
                    if (e.target.checked) n.add(c.asset.id);
                    else n.delete(c.asset.id);
                    setChosen(n);
                    setConfirm(false);
                  }}
                />
                {c.asset.name}
              </label>
            ))}
          </fieldset>
          {count > 0 && !noStyle ? (
            <p data-testid="harmonize-batch-estimate" className="text-text-primary">
              {L(
                `Samlet anslag: ${count} ${count === 1 ? "generering" : "genereringer"} med ${m.choice?.model.label ?? "?"}${unitUsd !== null ? ` · ${formatUsd(unitUsd)} per bilde · totalt ${formatUsd(unitUsd * count)}` : " · prisen er ukjent"}${m.size ? ` · ${m.size}` : ""}${quality.profile ? ` · profil «${quality.profile.name}»` : ""}.`,
                `Total estimate: ${count} ${count === 1 ? "generation" : "generations"} with ${m.choice?.model.label ?? "?"}${unitUsd !== null ? ` · ${formatUsd(unitUsd)} per image · ${formatUsd(unitUsd * count)} in total` : " · the price is unknown"}${m.size ? ` · ${m.size}` : ""}${quality.profile ? ` · profile “${quality.profile.name}”` : ""}.`,
              )}
            </p>
          ) : null}
          {budgetError ? <p role="alert" data-testid="harmonize-batch-budget" className="text-status-danger">{budgetError}</p> : null}
          <CostConfirm
            m={priced}
            count={noStyle || budgetError ? 0 : count}
            confirm={confirm}
            onConfirm={setConfirm}
            onRun={() => void start()}
            onClose={onClose}
            disabled={!tools.editable}
            busy={busy}
            emptyText={noStyle ? L("Velg en stilprofil eller et referansebilde først.", "Choose a style profile or a reference image first.") : L("Velg minst én karakter.", "Choose at least one character.")}
            confirmLabel={L("Bekreft masseharmonisering", "Confirm batch harmonization")}
            icon={<Palette />}
            startLabel={L(`Harmoniser ${count} …`, `Harmonize ${count} …`)}
          />
        </>
      )}
      {error ? <p role="alert" data-testid="harmonize-batch-error" className="text-status-danger">{error}</p> : null}
    </div>
  );
}
