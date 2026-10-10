/**
 * «Generer et nytt bilde med AI» (DEC-0045, M5 del 1). Beskrivelsen (prompten) bygges fra ressursen,
 * varianten og stilen og vises i et redigerbart felt før noe sendes. Hver generering må bekreftes i to
 * steg fordi den bruker kreditter i Lovable-arbeidsområdet. Selve kallet går via serverfunksjonen
 * generateImage (nøkkelen er aldri i nettleseren); resultatet lagres som ny versjon av ressursen.
 */
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildImagePrompt,
  IMAGE_PURPOSE_FOR_KIND,
  MAX_PROMPT_CHARS,
  type Asset,
  type AssetMedia,
  type AssetVariant,
  type AssetVersion,
} from "@/core";
import { generateImage } from "@/adapters/ai/generate-image.functions";
import { Button } from "@/components/ui/button";

export interface GeneratedImage {
  readonly versionId: string;
  readonly media: AssetMedia;
  readonly model: string;
}

export function GenerateImagePanel({
  projectId,
  filmTitle,
  asset,
  variant,
  reference,
  editable,
  disabled,
  onGenerated,
}: {
  projectId: string;
  filmTitle: string;
  asset: Asset;
  /** Varianten bildet lagres i (null: en ny lages). */
  variant: AssetVariant | null;
  /** Bildet som kan sendes med som forbilde (det som vises nå), eller null. */
  reference: AssetVersion | null;
  editable: boolean;
  /** Annet arbeid pågår (f.eks. opplasting). */
  disabled: boolean;
  /** Lagrer bildet som ny versjon; returnerer feilmelding eller null. */
  onGenerated: (img: GeneratedImage) => Promise<string | null>;
}) {
  const [withRef, setWithRef] = useState(reference !== null);
  const auto = useMemo(
    () =>
      buildImagePrompt({
        asset,
        variant,
        filmTitle,
        withReference: withRef && reference !== null,
      }),
    [asset, variant, filmTitle, withRef, reference],
  );
  const [prompt, setPrompt] = useState(auto);
  const [edited, setEdited] = useState(false);
  // Følg den automatiske beskrivelsen til brukeren har endret den selv
  useEffect(() => {
    if (!edited) setPrompt(auto);
  }, [auto, edited]);
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run() {
    setConfirm(false);
    setError(null);
    setDone(null);
    setRunning(true);
    try {
      const r = await generateImage({
        data: {
          projectId,
          assetId: asset.id,
          prompt,
          referencePath: withRef && reference ? reference.mediaPath : null,
          purpose: IMAGE_PURPOSE_FOR_KIND[asset.kind],
          approved: true,
        },
      });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      const err = await onGenerated({ versionId: r.versionId, media: r.media, model: r.model });
      if (err) setError(err);
      else setDone("Nytt bilde laget og tatt i bruk.");
    } catch (e) {
      setError((e as Error).message || "Genereringen feilet.");
    } finally {
      setRunning(false);
    }
  }

  const tooLong = prompt.length > MAX_PROMPT_CHARS;
  const canRun = editable && !disabled && !running && prompt.trim().length > 0 && !tooLong;

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-3">
      <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
        <Sparkles className="size-4" aria-hidden /> Generer et nytt bilde med AI
      </h3>
      <p className="text-xs text-text-tertiary">
        Beskrivelsen er laget fra ressursen og stilen. Du kan endre den før du sender. Bildet lagres
        som ny versjon{variant ? ` i «${variant.name || "Uten navn"}»` : ""} og brukes på laget.
      </p>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        <span className="flex items-center justify-between">
          Beskrivelse (engelsk gir best resultat)
          {edited ? (
            <button
              type="button"
              onClick={() => {
                setEdited(false);
                setPrompt(auto);
              }}
              className="flex items-center gap-0.5 rounded-sm px-1 text-[11px] text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
              title="Bruk den automatiske beskrivelsen igjen"
            >
              <RotateCcw className="size-3" aria-hidden /> Tilbakestill
            </button>
          ) : null}
        </span>
        <textarea
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setEdited(true);
            setConfirm(false);
          }}
          disabled={!editable || running}
          rows={6}
          aria-label="Beskrivelse for AI-generering"
          className="min-h-24 resize-y rounded-sm border border-border-control bg-surface-3 p-1.5 font-mono text-[11px] leading-snug text-text-primary"
        />
        {tooLong ? (
          <span className="text-status-danger">
            Beskrivelsen er for lang ({prompt.length} av {MAX_PROMPT_CHARS} tegn).
          </span>
        ) : null}
      </label>
      {reference ? (
        <label className="flex items-center gap-1.5 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={withRef}
            onChange={(e) => {
              setWithRef(e.target.checked);
              setConfirm(false);
            }}
            disabled={!editable || running}
          />
          Bruk dagens bilde (v{reference.number}) som forbilde
        </label>
      ) : null}
      {confirm ? (
        <div
          role="alertdialog"
          aria-label="Bekreft generering"
          className="flex flex-col gap-2 rounded-sm border border-accent-warm/60 bg-surface-2 p-2"
        >
          <p className="text-xs text-text-primary">
            Dette bruker kreditter i Lovable-arbeidsområdet (ett bilde). Vil du generere nå?
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void run()} disabled={!canRun}>
              <Sparkles /> Ja, generer
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
          disabled={!canRun}
          onClick={() => setConfirm(true)}
          className="self-start"
        >
          {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {running ? "Genererer … (kan ta opptil ett minutt)" : "Generer …"}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-xs text-status-success">
          {done}
        </p>
      ) : null}
    </div>
  );
}
