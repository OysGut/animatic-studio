/**
 * «Oppdater materialet med AI» ved manusavvik (M6, valg B, DEC-0054). Tilbys i «Manuset er endret etter
 * materialet» når 2D-scenen er berørt. Ingenting skjer uten bekreftelse:
 * 1. Tekst-AI lager forslag (bildebeskrivelser og shotforslag) etter anslag og eksplisitt bekreftelse.
 * 2. Et nytt bilde lages med kostnadsport og kvalitetsprofil og blir en ny versjon (ikke godkjent);
 *    «Bruk i scenen» er et eget klikk. Gamle versjoner, godkjente ressurser og ferdig film røres ikke.
 * 3. Et shotforslag lagres som notat på linjen – manuset endres ikke.
 * 4. Røde replikker går til DV7 «Generer røde replikker» (egen kostnadsport).
 * Alt går via kommandoer og kan angres.
 */
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  L,
  materialUpdateFromJson,
  materialUpdatePrompt,
  materialUpdateTargets,
  newId,
  parseJsonLoose,
  qualityProfileSnapshot,
  shotSuggestionNote,
  tm,
  useVersionOnLayerCommand,
  type Command,
  type MaterialUpdateSuggestions,
  type ProjectState,
  type ScriptChange,
} from "@/core";
import { generateText } from "@/adapters/ai/text.functions";
import { generateImage } from "@/adapters/ai/generate-image.functions";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { QualityProfileBudget, QualityProfilePicker, useQualityProfile } from "@/app/ai/QualityProfilePicker";
import { useImageModel } from "@/app/library/image-model";
import { CostConfirm } from "@/app/library/ImageAiPanels";
import { DialogueBatchPanel } from "@/app/library/DialogueBatchPanel";
import { usd, useTextEstimate } from "@/app/storylab/storylab-data";
import { Button } from "@/components/ui/button";
import { t as tk } from "@/core/i18n/keyed";

type Run = (command: Command, label: string, group?: string) => string | null;
const OUT_TOKENS = 1500;

export function MaterialUpdateSection({
  state,
  occurrenceId,
  changes,
  run,
}: {
  state: ProjectState;
  occurrenceId: string;
  changes: readonly ScriptChange[];
  run: Run;
}) {
  const projectId = state.project.id;
  const targets = useMemo(() => materialUpdateTargets(state, occurrenceId, changes), [state, occurrenceId, changes]);
  const prompt = useMemo(() => materialUpdatePrompt(state, targets, changes), [state, targets, changes]);
  const est = useTextEstimate("general", prompt.system.length + prompt.user.length, OUT_TOKENS);
  const gen = useServerFn(generateText);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<MaterialUpdateSuggestions | null>(null);
  const textTargets = targets.images.length + targets.shots.length;
  if (textTargets === 0 && targets.dialogueCharacters.length === 0) return null;

  async function suggest() {
    setConfirm(false);
    setBusy(true);
    setErr(null);
    try {
      const r = await gen({
        data: { projectId, task: "general", json: true, system: prompt.system, messages: [{ role: "user", content: prompt.user }], maxTokens: OUT_TOKENS },
      });
      if (!r.ok) return setErr(tm(r.message));
      const parsed = materialUpdateFromJson(parseJsonLoose(r.text), targets);
      if (!parsed)
        return setErr(tk("app-assembly-material-update-section.suggest.set-err.21d0327a1e46"));
      setResult(parsed);
    } catch (e) {
      setErr(tm((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="material-update" className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface-1 p-2 text-xs">
      <p className="font-medium text-text-primary">{tk("app-assembly-material-update-section.material-update-section.p.ec2235904c46")}</p>
      <p className="text-text-secondary">
        {tk("app-assembly-material-update-section.material-update-section.p.e251a8fbdae9")}
      </p>
      {targets.dialogueCharacters.length ? (
        <div data-testid="material-update-dialogue" className="flex flex-wrap items-center gap-1.5">
          <span className="text-text-secondary">{tk("app-assembly-material-update-section.material-update-section.span.06cdf7450cbb")}</span>
          {targets.dialogueCharacters.map((id) =>
            state.assets[id] ? (
              <DialogueBatchPanel key={id} state={state} asset={state.assets[id]!} projectId={projectId} editable drift />
            ) : null,
          )}
        </div>
      ) : null}
      {textTargets > 0 && !result ? (
        confirm ? (
          <div role="alertdialog" aria-label={tk("app-assembly-material-update-section.material-update-section.aria-label.a252f79e8c42")} className="flex flex-col gap-1.5">
            <p data-testid="material-update-cost" className="text-text-primary">
              {L(
                `${targets.images.length} ${targets.images.length === 1 ? "bilde" : "bilder"} og ${targets.shots.length} ${targets.shots.length === 1 ? "linje" : "linjer"} · ${est.label} · anslått ${usd(est.usd)}. Vil du fortsette?`,
                `${targets.images.length} ${targets.images.length === 1 ? "image" : "images"} and ${targets.shots.length} ${targets.shots.length === 1 ? "line" : "lines"} · ${est.label} · estimated ${usd(est.usd)}. Do you want to continue?`,
              )}
            </p>
            <div className="flex gap-2">
              <Button size="sm" data-testid="material-update-run" onClick={() => void suggest()} disabled={busy || !!est.error}>
                <AiGlyph /> {tk("app-assembly-material-update-section.material-update-section.button.e85ea31c0da7")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                {tk("app-assembly-material-update-section.material-update-section.button.ac6617b6350a")}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="secondary" className="self-start" data-testid="material-update-open" disabled={busy || est.loading || !!est.error} onClick={() => setConfirm(true)}>
            {busy ? <Loader2 className="animate-spin" /> : <AiGlyph />}
            {err ? tk("app-assembly-material-update-section.material-update-section.button.4ca6aa5c4053") : tk("app-assembly-material-update-section.material-update-section.button.2e6c0830e3e8")}
          </Button>
        )
      ) : null}
      {est.error && textTargets > 0 ? <p className="text-text-tertiary">{est.error}</p> : null}
      {result ? (
        <div data-testid="material-update-result" className="flex flex-col gap-2">
          {result.images.map((x) => {
            const t = targets.images.find((y) => y.assetId === x.assetId)!;
            return <ImageSuggestion key={x.assetId} state={state} target={t} initialPrompt={x.prompt} run={run} />;
          })}
          {result.shots.map((x) => (
            <ShotSuggestion key={x.blockId} state={state} blockId={x.blockId} text={x.text} run={run} />
          ))}
          <Button size="sm" variant="ghost" className="self-start" onClick={() => setResult(null)}>
            {tk("app-assembly-material-update-section.material-update-section.button.07c67a9c84bd")}
          </Button>
        </div>
      ) : null}
      {err ? <p role="alert" className="text-status-danger">{err}</p> : null}
    </div>
  );
}

function ShotSuggestion({ state, blockId, text, run }: { state: ProjectState; blockId: string; text: string; run: Run }) {
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div data-testid="material-update-shot" className="flex flex-col gap-1 rounded-sm bg-surface-2 p-1.5">
      <p className="text-text-tertiary">{tk("app-assembly-material-update-section.shot-suggestion.p.aa5aa5166d5e")}</p>
      <p className="text-text-primary">{text}</p>
      {saved ? (
        <p role="status" className="text-status-success">{tk("app-assembly-material-update-section.shot-suggestion.p.b04882f6ada7")}</p>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={() => {
            const c = shotSuggestionNote(state, blockId, text, newId<"annotation">(), tk("app-assembly-material-update-section.c.shot-suggestion-note.7568761b1a80"), tk("app-assembly-material-update-section.c.shot-suggestion-note.64d558e7f269"));
            if (!c) return setErr(tk("app-assembly-material-update-section.shot-suggestion.set-err.3e298ea56fdc"));
            const e = run(c, tk("app-assembly-material-update-section.e.run.1361b547e4cc"));
            if (e) setErr(e);
            else setSaved(true);
          }}
        >
          {tk("app-assembly-material-update-section.shot-suggestion.button.9436df7232e9")}
        </Button>
      )}
      {err ? <p role="alert" className="text-status-danger">{err}</p> : null}
    </div>
  );
}

function ImageSuggestion({
  state,
  target,
  initialPrompt,
  run,
}: {
  state: ProjectState;
  target: ReturnType<typeof materialUpdateTargets>["images"][number];
  initialPrompt: string;
  run: Run;
}) {
  const projectId = state.project.id;
  const [prompt, setPrompt] = useState(initialPrompt);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ versionId: string; variantId: string; model: string } | null>(null);
  const [used, setUsed] = useState(false);
  const m = useImageModel(projectId, true);
  const quality = useQualityProfile(state);
  const variantId =
    target.variantId ??
    Object.values(state.assetVariants).find((v) => v.assetId === target.assetId && !v.archived)?.id ??
    null;
  const current =
    (target.versionId ? state.assetVersions[target.versionId] : null) ??
    (variantId && state.assetVariants[variantId]?.approvedVersionId
      ? state.assetVersions[state.assetVariants[variantId]!.approvedVersionId!]
      : null);

  async function make() {
    if (!m.choice || !variantId) return;
    setConfirm(false);
    setBusy(true);
    setErr(null);
    try {
      const r = await generateImage({
        data: {
          projectId,
          assetId: target.assetId,
          prompt,
          referencePaths: current ? [current.mediaPath] : [],
          identityFirst: !!current,
          purpose: "cutout",
          variantId,
          provider: m.choice.provider.id,
          model: m.choice.model.id,
          size: m.size,
          approved: true,
          qualityProfile: quality.profile ? qualityProfileSnapshot(quality.profile) : null,
        },
      });
      if (!r.ok) throw new Error(tm(r.message));
      // Ny versjon (ikke godkjent); den gamle og den godkjente beholdes
      const e = run(
        {
          type: "AddAssetVersion",
          versionId: r.versionId as never,
          variantId: variantId as never,
          media: r.media,
          note: `AI-oppdatering etter manusendring (${r.model})`.slice(0, 200),
        } as Command,
        tk("app-assembly-material-update-section.e.run.158a7aa59692", { name: String(target.name) }),
      );
      if (e) throw new Error(e);
      setMade({ versionId: r.versionId, variantId, model: r.model });
    } catch (e) {
      setErr(tm((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="material-update-image" className="flex flex-col gap-1 rounded-sm bg-surface-2 p-1.5">
      <label className="text-text-tertiary" htmlFor={`mu-${target.layerId}`}>
        {tk("app-assembly-material-update-section.image-suggestion.label.9124cba33494", { name: String(target.name) })}
      </label>
      <textarea
        id={`mu-${target.layerId}`}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        disabled={!!made}
        className="w-full resize-y rounded-sm border border-border-control bg-surface-3 p-1.5 font-mono text-[11px] text-text-primary"
      />
      {made ? (
        <div className="flex flex-col gap-1">
          <p role="status" className="text-status-success">
            {tk("app-assembly-material-update-section.image-suggestion.p.ee22c61fed17", { model: String(made.model) })}
          </p>
          {used ? (
            <p className="text-text-secondary">{tk("app-assembly-material-update-section.image-suggestion.p.6c6600289bca")}</p>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="self-start"
              data-testid="material-update-use"
              onClick={() => {
                const c = useVersionOnLayerCommand(state, target.layerId, made.variantId, made.versionId);
                if (!c) return setErr(tk("app-assembly-material-update-section.image-suggestion.set-err.65b282fe20df"));
                const e = run(c, tk("app-assembly-material-update-section.e.run.2c12a1655a02"));
                if (e) setErr(e);
                else setUsed(true);
              }}
            >
              {tk("app-assembly-material-update-section.image-suggestion.button.6bf8142245ff")}
            </Button>
          )}
        </div>
      ) : !variantId ? (
        <p className="text-text-tertiary">{tk("app-assembly-material-update-section.image-suggestion.p.905e6603d643")}</p>
      ) : (
        <>
          <QualityProfilePicker state={state} value={quality.choice} onChange={quality.setChoice} disabled={busy} />
          <QualityProfileBudget error={quality.budgetError} />
          <CostConfirm
            m={m}
            count={prompt.trim() && !quality.budgetError ? 1 : 0}
            confirm={confirm}
            onConfirm={setConfirm}
            onRun={() => void make()}
            onClose={() => setConfirm(false)}
            disabled={false}
            busy={busy}
            emptyText={tk("app-assembly-material-update-section.image-suggestion.empty-text.37a1f9cdd66a")}
            confirmLabel={tk("app-assembly-material-update-section.image-suggestion.confirm-label.740972fb70a3")}
            icon={<AiGlyph />}
            startLabel={tk("app-assembly-material-update-section.image-suggestion.start-label.26d5378e79b1")}
          />
        </>
      )}
      {err ? <p role="alert" className="text-status-danger">{err}</p> : null}
    </div>
  );
}
