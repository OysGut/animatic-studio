/**
 * «Generer et nytt bilde med AI» (DEC-0045, M5 del 1). Beskrivelsen (prompten) bygges fra ressursen,
 * varianten og stilen og vises i et redigerbart felt før noe sendes. Hver generering må bekreftes i to
 * steg fordi den bruker kreditter i Lovable-arbeidsområdet. Selve kallet går via serverfunksjonen
 * generateImage (nøkkelen er aldri i nettleseren); resultatet lagres som ny versjon av ressursen.
 */
import { Loader2, RotateCcw } from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  aiUsage,
  type Asset,
  type AssetMedia,
  type AssetVariant,
  type AssetVersion,
  type AttachedImage,
  attachedImages,
  buildContextImagePrompt,
  buildImagePrompt,
  costBreakdown,
  describeAttached,
  estimateCostUsd,
  formatCredits,
  formatUsd,
  hasStyleGuide,
  IMAGE_PURPOSE_FOR_KIND,
  IMAGE_SIZE_LABEL,
  fullSizeOriginal,
  type ImageSize,
  imageSizesOf,
  lastImagePrompt,
  LOVABLE_CUTOUT_MODEL,
  LOVABLE_IMAGE_MODEL,
  MAX_PROMPT_CHARS,
  type Project,
  type ProjectState,
  providerInfo,
  providerModel,
  providersFor,
  stripAttachedSection,
  withAttachedLegend,
} from "@/core";
import { aiJobsKey, useAiJobs } from "@/app/ai/use-ai-jobs";
import { CUTOUT_MODEL, IMAGE_MODEL, generateImage } from "@/adapters/ai/generate-image.functions";
import { writeImagePrompt } from "@/adapters/ai/write-prompt.functions";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { EffortPicker } from "@/app/ai/EffortPicker";
import { Button } from "@/components/ui/button";
import { CostLines } from "@/app/ai/CostLines";

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
  budget,
  initialPrompt,
  insertPrompt,
  context,
}: {
  /**
   * Prosjektet, produksjonen og ev. scenen bildet lages til (DEC-0065): beskrivelsen bygges da med
   * filmens visuelle stil, scenene, lyset og godkjente bilder.
   */
  context?: {
    readonly state: ProjectState;
    readonly productionId: string;
    readonly occurrenceId: string | null;
  };
  /** Prosjektets AI-budsjett (DEC-0053): anslag og månedens forbruk vises før generering. */
  budget?: Pick<Project, "aiMonthLimit" | "aiPricePerImage">;
  /** Start med en bestemt beskrivelse (f.eks. «Prøv igjen» fra jobblisten). */
  initialPrompt?: string;
  /**
   * «Sett inn denne beskrivelsen» fra et bilde (Mars 2026-10-13): beskrivelsen som laget et tidligere bilde
   * settes inn i feltet. `n` øker for hvert klikk, så samme tekst kan settes inn flere ganger.
   */
  insertPrompt?: { readonly text: string; readonly n: number } | null;
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
  /** Send filmens godkjente bilder med som stilforbilder (DEC-0066). */
  const [withStyle, setWithStyle] = useState(true);
  const identity =
    withRef && reference && reference.mimeType.startsWith("image/") ? reference : null;
  /** Bildene som sendes med til bildemodellen, i rekkefølge. */
  const attached = useMemo((): readonly AttachedImage[] => {
    if (context)
      return attachedImages(context.state, {
        assetId: asset.id,
        productionId: context.productionId,
        occurrenceId: context.occurrenceId,
        identityVersionId: identity?.id ?? null,
        style: withStyle,
      });
    return identity
      ? [
          {
            versionId: identity.id,
            path: identity.mediaPath,
            mimeType: identity.mimeType,
            role: "identity",
            label: `the current design of ${asset.name} (v${identity.number})`,
          },
        ]
      : [];
  }, [context, asset, identity, withStyle]);
  // Forbildebilder sendes som standard i arbeidsstørrelse (tilpasset scenen); originalen i full størrelse
  // kan velges, f.eks. for karakterkort (Mars 2026-10-13, DEC-0079)
  const [fullSize, setFullSize] = useState(false);
  const originals = useMemo(
    () =>
      context
        ? new Map(
            attached.flatMap((a) => {
              const o = fullSizeOriginal(context.state, a.versionId);
              return o ? [[a.versionId, o] as const] : [];
            }),
          )
        : new Map<string, never>(),
    [context, attached],
  );
  const sentPaths = attached.map((a) =>
    fullSize ? (originals.get(a.versionId)?.mediaPath ?? a.path) : a.path,
  );
  /** Hvor mange stilforbilder som finnes (for valget), uansett om de sendes nå. */
  const styleAvailable = useMemo(
    () =>
      context
        ? attachedImages(context.state, {
            assetId: asset.id,
            productionId: context.productionId,
            occurrenceId: context.occurrenceId,
            identityVersionId: null,
            style: true,
          }).length
        : 0,
    [context, asset],
  );
  const auto = useMemo(
    () =>
      context
        ? buildContextImagePrompt(context.state, {
            assetId: asset.id,
            variantId: variant?.id ?? null,
            productionId: context.productionId,
            occurrenceId: context.occurrenceId,
            withReference: identity !== null,
            attached,
          })
        : buildImagePrompt({
            asset,
            variant,
            filmTitle,
            withReference: identity !== null,
          }),
    [asset, variant, filmTitle, identity, attached, context],
  );
  const [prompt, setPrompt] = useState(initialPrompt ?? auto);
  const [edited, setEdited] = useState(initialPrompt !== undefined && initialPrompt !== auto);
  /** Hvor teksten i feltet kom fra, når den ikke er den automatiske. */
  const [origin, setOrigin] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const jobs = useAiJobs(projectId, editable);
  // Husk siste beskrivelse for ressursen (Mars 2026-10-13): den forrige genereringen er utgangspunktet
  const last = useMemo(
    () => lastImagePrompt(jobs.data?.jobs ?? [], asset.id),
    [jobs.data, asset.id],
  );
  const lastUsed = useRef(false);
  /** Feltet følger den automatiske beskrivelsen (til siste beskrivelse er satt inn, eller etter «Tilbakestill»). */
  const followAuto = useRef(true);
  useEffect(() => {
    if (lastUsed.current || initialPrompt !== undefined || edited || !last) return;
    lastUsed.current = true;
    // Den automatiske beskrivelsen skal ikke overskrive den (heller ikke når effektene kjøres på nytt)
    followAuto.current = false;
    setPrompt(stripAttachedSection(last.prompt));
    setEdited(true);
    setOrigin(
      `Siste beskrivelse for ${asset.name} (${last.when}). «Tilbakestill» gir den automatiske.`,
    );
  }, [last, initialPrompt, edited, asset.name]);
  useEffect(() => {
    if (!insertPrompt) return;
    followAuto.current = false;
    setPrompt(stripAttachedSection(insertPrompt.text));
    setEdited(true);
    setConfirm(false);
    setOrigin("Beskrivelsen fra bildet du valgte er satt inn.");
  }, [insertPrompt]);
  const usage = budget
    ? aiUsage(budget, jobs.data?.jobs ?? [], new Date(), jobs.data?.monthCount ?? undefined)
    : null;
  const overBudget = usage !== null && usage.remaining === 0;
  // Følg den automatiske beskrivelsen til brukeren har endret den selv
  useEffect(() => {
    if (!edited && followAuto.current) setPrompt(auto);
  }, [auto, edited]);
  const [confirm, setConfirm] = useState(false);
  // Kandidater (mandat 19.7): flere bilder å velge mellom, hvert som egen versjon
  const [candidates, setCandidates] = useState(1);
  // Leverandør og modell (DEC-0069): innebygd, eller en prosjektets eiere har koblet til
  const available = useProjectProviders(projectId, editable);
  const options = providersFor("image", new Set(available.data?.providers ?? []));
  const [pick, setPick] = useState<string>("lovable|");
  const choice = (() => {
    const [provider, model] = pick.split("|") as [string, string];
    const ok = options.find((o) => o.provider.id === provider);
    if (!ok) return { provider: "lovable", model: "" };
    return { provider, model: model || ok.models[0]?.id || "" };
  })();
  // Bildestørrelse (Mars 2026-10-13): eget valg der modellen tar imot det
  const [sizePick, setSizePick] = useState<ImageSize | null>(null);
  // Innebygd: serveren velger modellen ut fra formålet (vises i bekreftelsen, REQ-0280)
  const chosenModel =
    choice.provider === "lovable"
      ? (providerModel(
          "lovable",
          IMAGE_PURPOSE_FOR_KIND[asset.kind] === "cutout"
            ? LOVABLE_CUTOUT_MODEL
            : LOVABLE_IMAGE_MODEL,
        ) ?? null)
      : providerModel(choice.provider, choice.model);
  const sizes = imageSizesOf(chosenModel ?? undefined);
  const size: ImageSize | null =
    sizePick && sizes.sizes.includes(sizePick) ? sizePick : sizes.standard;
  const costUsd =
    choice.provider === "lovable"
      ? null
      : estimateCostUsd(choice.provider, choice.model, size ? { size } : {});
  // Endres beskrivelsen etter at brukeren har bedt om å generere, må hun bekrefte på nytt
  useEffect(() => {
    if (!edited) setConfirm(false);
  }, [auto, edited]);

  const [running, setRunning] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (confirm) confirmRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [confirm]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  /** Beskrivelsen er skrevet av AI (modell, og hvilke bilder den ble skrevet for). */
  const [written, setWritten] = useState<{ model: string; images: string } | null>(null);
  const [writing, setWriting] = useState(false);
  const attachedKey = attached.map((a) => a.versionId).join(",");

  async function write() {
    setError(null);
    setDone(null);
    setConfirm(false);
    setWriting(true);
    try {
      const r = await writeImagePrompt({
        data: {
          projectId,
          assetId: asset.id,
          brief: prompt,
          purpose: IMAGE_PURPOSE_FOR_KIND[asset.kind],
          images: attached.map((a) => ({ path: a.path, label: a.label })),
          approved: true,
        },
      });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setPrompt(r.prompt);
      setEdited(true);
      setWritten({ model: r.model, images: attachedKey });
    } catch (e) {
      setError((e as Error).message || "Beskrivelsen ble ikke skrevet.");
    } finally {
      setWriting(false);
      void queryClient.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    }
  }

  async function run() {
    setConfirm(false);
    setError(null);
    setDone(null);
    setRunning(true);
    try {
      let made = 0;
      for (let c = 0; c < candidates; c++) {
        const r = await generateImage({
          data: {
            projectId,
            assetId: asset.id,
            // Listen over bildene som sendes, er alltid fersk (en gammel liste i teksten byttes ut), så
            // teksten og bildene ikke kan komme i utakt
            prompt: withAttachedLegend(prompt, asset.name, attached),
            referencePaths: sentPaths,
            identityFirst: attached[0]?.role === "identity",
            purpose: IMAGE_PURPOSE_FOR_KIND[asset.kind],
            variantId: variant?.id ?? null,
            provider: choice.provider,
            model: choice.provider === "lovable" ? null : choice.model,
            size,
            approved: true,
          },
        });
        if (!r.ok) {
          setError(made ? `${made} av ${candidates} laget. ${r.message}` : r.message);
          return;
        }
        const err = await onGenerated({ versionId: r.versionId, media: r.media, model: r.model });
        if (err) {
          setError(err);
          return;
        }
        made++;
      }
      setDone(
        candidates > 1
          ? `${made} kandidater laget og lagret som nye versjoner. Sammenlign dem i biblioteket og godkjenn den du vil bruke.`
          : "Nytt bilde laget og lagret som ny versjon.",
      );
    } catch (e) {
      setError(lostConnection((e as Error).message));
    } finally {
      setRunning(false);
      void queryClient.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    }
  }

  // Beskrivelsen og listen over bildene må få plass sammen
  const legendLength = attached.length ? describeAttached(asset.name, attached).length + 2 : 0;
  const tooLong =
    prompt.length > MAX_PROMPT_CHARS ||
    stripAttachedSection(prompt).length + legendLength > MAX_PROMPT_CHARS;
  /** AI skrev teksten for et annet sett bilder: den kan omtale feil bilde, så den må skrives på nytt. */
  const stale = written !== null && written.images !== attachedKey;
  // En utdatert AI-tekst varsles, men hindrer ikke generering (Mars 2026-10-13: «flagg, ikke hindre»)
  const canRun =
    editable &&
    !disabled &&
    !running &&
    !writing &&
    prompt.trim().length > 0 &&
    !tooLong &&
    !overBudget;
  const canWrite =
    editable &&
    !disabled &&
    !running &&
    !writing &&
    prompt.trim().length > 0 &&
    !tooLong &&
    !overBudget;

  // Bred flate (bildedialogen på store skjermer): beskrivelsen til venstre, valg og bekreftelse til høyre.
  // Smal flate (f.eks. «Prøv igjen»): én kolonne. Styres av panelets egen bredde (container query), så
  // det virker likt uansett hvilken dialog panelet står i (UX-gjennomgang DEC-0076 funn 8, DEC-0078).
  return (
    <div className="@container flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-3">
      <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
        <AiGlyph className="size-4" aria-hidden /> Generer et nytt bilde med AI
      </h3>
      <p className="text-xs text-text-tertiary">
        {context
          ? "Beskrivelsen er satt sammen av filmens visuelle stil, ressursen, scenene den er med i (sted, tid på døgnet, lys, hvem som er der) og godkjente bilder i filmen."
          : "Beskrivelsen er laget fra ressursen og stilen."}{" "}
        Du kan endre den før du sender. Bildet lagres som ny versjon
        {variant ? ` i «${variant.name || "Uten navn"}»` : ""} og brukes på laget.
      </p>
      {context && !hasStyleGuide(context.state) ? (
        <p className="rounded-sm border border-accent-warm/40 bg-surface-2 px-2 py-1.5 text-xs text-text-secondary">
          Filmens visuelle stil er ikke fylt ut ennå. Beskrivelsen blir mye bedre når den er det:
          Prosjektoversikt → «Filmens visuelle stil».
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 @2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs text-text-secondary">
            <span className="flex items-center justify-between">
              Beskrivelse (engelsk gir best resultat)
              {edited ? (
                <button
                  type="button"
                  onClick={() => {
                    setEdited(false);
                    setWritten(null);
                    setOrigin(null);
                    followAuto.current = true;
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
                setOrigin(null);
              }}
              disabled={!editable || running || writing}
              rows={context ? 14 : 6}
              aria-label="Beskrivelse for AI-generering"
              className="min-h-24 flex-1 resize-y rounded-sm border border-border-control bg-surface-3 p-1.5 font-mono text-[11px] leading-snug text-text-primary"
            />
            {origin ? <span className="text-[11px] text-text-tertiary">{origin}</span> : null}
            {tooLong ? (
              <span className="text-status-danger">
                Beskrivelsen er for lang ({stripAttachedSection(prompt).length + legendLength} av{" "}
                {MAX_PROMPT_CHARS} tegn
                {legendLength ? ", med listen over bildene som sendes med" : ""}).
              </span>
            ) : null}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void write()}
              disabled={!canWrite}
              title="En språkmodell leser alt over (og ser bildene som sendes med) og skriver en presis beskrivelse. Du kan endre den før du genererer."
            >
              {writing ? <Loader2 className="animate-spin" /> : <AiGlyph />}
              {writing
                ? "Skriver … (kan ta et halvt minutt)"
                : written
                  ? "Skriv på nytt med AI"
                  : "Skriv beskrivelsen med AI"}
            </Button>
            <span className="text-[11px] text-text-tertiary">
              Bruker litt kreditter (langt mindre enn et bilde), teller ikke i bildebudsjettet.
            </span>
          </div>
          {written ? (
            <p
              role="status"
              className={"text-[11px] " + (stale ? "text-status-uncertain" : "text-text-secondary")}
            >
              {stale
                ? "Bildene som sendes med er endret etter at AI skrev beskrivelsen, så den kan omtale feil bilde. Du kan likevel generere – eller skrive den på nytt først."
                : `Skrevet av AI (${written.model}). Les gjennom og endre det som ikke stemmer før du genererer.`}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          {options.length > 1 ? (
            <EffortPicker
              capability="image"
              connected={new Set(available.data?.providers ?? [])}
              chosen={(() => {
                const o = options.find((x) => x.provider.id === choice.provider);
                const m =
                  choice.provider === "lovable"
                    ? // Innebygd: modellen serveren faktisk bruker (frilagt figur eller bakgrunn), så nivået stemmer med bekreftelsen
                      (o?.models.find((x) => x.id === chosenModel?.id) ?? o?.models[0])
                    : o?.models.find((x) => x.id === choice.model);
                return o && m ? { provider: o.provider, model: m } : null;
              })()}
              disabled={!editable || running || writing}
              onChoose={(c) => {
                setPick(
                  c.provider.id === "lovable" ? "lovable|" : `${c.provider.id}|${c.model.id}`,
                );
                setConfirm(false);
              }}
            />
          ) : null}
          {options.length > 1 || choice.provider !== "lovable" ? (
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              Leverandør og modell
              <select
                aria-label="Leverandør og modell"
                value={`${choice.provider}|${choice.provider === "lovable" ? "" : choice.model}`}
                disabled={!editable || running || writing}
                onChange={(e) => {
                  setPick(e.target.value);
                  setConfirm(false);
                }}
                className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
              >
                {options.map((o) =>
                  o.provider.id === "lovable" ? (
                    <option key="lovable" value="lovable|">
                      {o.provider.name}
                    </option>
                  ) : (
                    o.models.map((m) => (
                      <option key={`${o.provider.id}|${m.id}`} value={`${o.provider.id}|${m.id}`}>
                        {o.provider.name} – {m.label} (~{formatUsd(m.priceUsd)})
                      </option>
                    ))
                  ),
                )}
              </select>
            </label>
          ) : null}
          {chosenModel &&
          IMAGE_PURPOSE_FOR_KIND[asset.kind] === "cutout" &&
          !chosenModel.transparent ? (
            <p className="text-[11px] text-status-uncertain">
              Denne modellen kan ikke lage gjennomsiktig bakgrunn. Bruk «Frilegg bildet» etterpå,
              eller velg en modell merket «frilagt».
            </p>
          ) : null}
          {reference ? (
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={withRef}
                onChange={(e) => {
                  setWithRef(e.target.checked);
                  setConfirm(false);
                }}
                disabled={!editable || running || writing}
              />
              Bruk dagens bilde (v{reference.number}) som forbilde
            </label>
          ) : null}
          {styleAvailable > 0 ? (
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={withStyle}
                onChange={(e) => {
                  setWithStyle(e.target.checked);
                  setConfirm(false);
                }}
                disabled={!editable || running || writing}
              />
              Send filmens godkjente bilder med som stilforbilder
            </label>
          ) : null}
          {originals.size > 0 ? (
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={fullSize}
                onChange={(e) => {
                  setFullSize(e.target.checked);
                  setConfirm(false);
                }}
                disabled={!editable || running || writing}
              />
              Send forbildene i full størrelse ({originals.size}{" "}
              {originals.size === 1 ? "original" : "originaler"}) – for karakterkort og detaljer
            </label>
          ) : null}
          {attached.length ? (
            <div className="text-[11px] text-text-tertiary">
              Sendes med til bildemodellen:
              <ol className="ml-4 list-decimal">
                {attached.map((a) => (
                  <li key={a.versionId}>
                    {a.label}
                    {a.role === "identity" ? " – utseendet beholdes" : " – bare stilen"}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {sizes.sizes.length > 1 ? (
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              Bildestørrelse
              <select
                aria-label="Bildestørrelse"
                value={size ?? ""}
                disabled={!editable || running || writing}
                onChange={(e) => {
                  setSizePick(e.target.value as ImageSize);
                  setConfirm(false);
                }}
                className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
              >
                {sizes.sizes.map((z) => (
                  <option key={z} value={z}>
                    {IMAGE_SIZE_LABEL[z]}
                    {estimateCostUsd(choice.provider, choice.model, { size: z }) !== null
                      ? ` (~${formatUsd(estimateCostUsd(choice.provider, choice.model, { size: z })!)})`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : sizes.standard ? (
            <p className="text-[11px] text-text-tertiary">
              Bildestørrelse: {IMAGE_SIZE_LABEL[sizes.standard]} (modellens faste størrelse)
            </p>
          ) : chosenModel?.resolution ? (
            <p className="text-[11px] text-text-tertiary">
              Bildestørrelse: {chosenModel.resolution} (modellens faste størrelse)
            </p>
          ) : null}
          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            Kandidater
            <select
              aria-label="Antall kandidater"
              value={candidates}
              disabled={!editable || running || writing}
              onChange={(e) => {
                setCandidates(Number(e.target.value));
                setConfirm(false);
              }}
              className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {candidates > 1 ? (
              <span className="text-text-tertiary">
                {candidates} bilder, hvert som egen versjon – koster {candidates} ganger så mye
              </span>
            ) : null}
          </label>
          {confirm ? (
            <div
              ref={confirmRef}
              role="alertdialog"
              aria-label="Bekreft generering"
              // Bekreftelsen står alltid synlig nederst i dialogen («Ja, generer» havnet under bretten)
              className="sticky bottom-0 z-10 flex flex-col gap-2 rounded-sm border border-accent-warm/60 bg-surface-2 p-2 shadow-[0_-8px_16px_rgba(0,0,0,0.25)]"
            >
              <p className="text-xs text-text-primary">
                {choice.provider === "lovable" ? (
                  <>
                    Dette bruker kreditter i Lovable-arbeidsområdet (
                    {candidates > 1 ? `${candidates} bilder` : "ett bilde"}
                    {usage?.nextCost !== null && usage?.nextCost !== undefined
                      ? `, anslått ${formatCredits(usage.nextCost * candidates)} – et anslag`
                      : ", prisen er ukjent"}
                    ).
                  </>
                ) : (
                  <>
                    Dette belastes {providerInfo(choice.provider)?.name}-kontoen til prosjektets
                    eier ({candidates > 1 ? `${candidates} bilder` : "ett bilde"}, anslått{" "}
                    {costUsd !== null ? formatUsd(costUsd * candidates) : "ukjent pris"} – et
                    anslag).
                  </>
                )}{" "}
                Vil du generere nå?
              </p>
              <CostLines
                lines={
                  chosenModel && providerInfo(choice.provider)
                    ? costBreakdown(providerInfo(choice.provider)!, chosenModel, {
                        candidates,
                        targetsLabel: "bilder",
                        total:
                          choice.provider === "lovable"
                            ? usage?.nextCost !== null && usage?.nextCost !== undefined
                              ? formatCredits(usage.nextCost * candidates)
                              : null
                            : costUsd !== null
                              ? `ca. ${formatUsd(costUsd * candidates)}`
                              : null,
                      })
                    : [
                        { label: "Modell", value: "Innebygd bildemodell (Lovable AI)" },
                        {
                          label: "Antall",
                          value: candidates > 1 ? `${candidates} bilder` : "1 bilde",
                        },
                        {
                          label: "Ekstrarunder",
                          value: "ingen automatiske – nye forsøk startes bare av deg",
                        },
                        {
                          label: "Samlet anslag",
                          value:
                            usage?.nextCost !== null && usage?.nextCost !== undefined
                              ? formatCredits(usage.nextCost * candidates)
                              : "ukjent pris",
                        },
                      ]
                }
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void run()} disabled={!canRun}>
                  <AiGlyph /> Ja, generer
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
              className="sticky bottom-0 z-10 self-start shadow-[0_-4px_12px_rgba(0,0,0,0.2)]"
            >
              {running ? <Loader2 className="animate-spin" /> : <AiGlyph />}
              {running ? "Genererer … (kan ta opptil ett minutt)" : "Generer …"}
            </Button>
          )}
          {usage ? (
            <p
              className={
                "text-[11px] " + (overBudget ? "text-status-danger" : "text-text-tertiary")
              }
            >
              {usage.limit !== null
                ? `Denne måneden: ${usage.used} av ${usage.limit} genereringer i prosjektets budsjett.`
                : `Denne måneden: ${usage.used} genereringer (ingen egen ramme – faste grenser gjelder).`}
              {overBudget
                ? " Budsjettet er brukt opp; eieren kan endre det på prosjektoversikten."
                : ""}
            </p>
          ) : null}
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
      </div>
    </div>
  );
}

/**
 * Serveren mistet forbindelsen (f.eks. «Internal server error» fra plattformen): tjenesten kan ha laget og
 * tatt betalt for bildet uten at det kom fram (Mars 2026-10-13, Nano Banana Pro med fire bilder).
 */
export function lostConnection(message: string | undefined): string {
  const m = (message ?? "").trim();
  if (!m || /internal server error|failed to fetch|network|timeout|50[234]|load failed/i.test(m))
    return "Forbindelsen til serveren brøt mens bildet ble laget. Tjenesten kan likevel ha laget – og tatt betalt for – bildet. Se AI-jobbene før du prøver igjen, og velg gjerne mindre bildestørrelse eller færre forbildebilder.";
  return m;
}
