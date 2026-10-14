/**
 * «Generer et nytt bilde med AI» (DEC-0045, M5 del 1). Beskrivelsen (prompten) bygges fra ressursen,
 * varianten og stilen og vises i et redigerbart felt før noe sendes. Hver generering må bekreftes i to
 * steg fordi den bruker kreditter i Lovable-arbeidsområdet. Selve kallet går via serverfunksjonen
 * generateImage (nøkkelen er aldri i nettleseren); resultatet lagres som ny versjon av ressursen.
 */
import { Loader2, RotateCcw } from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  aiUsage,
  type Asset,
  type AssetMedia,
  type AssetVariant,
  type AssetVersion,
  type AttachedImage,
  attachedImages,
  buildContextImageBrief,
  buildContextImagePrompt,
  buildImagePrompt,
  briefSummaryNb,
  promptFamilyOf,
  renderBrief,
  VERSION_VIEW_LABEL,
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
  L,
  tm,
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
  onOpenStyleGuide,
  visualBrief,
}: {
  /** Det visuelle faktaarket for ressursen (vises i oppsummeringen, DEC-0080). */
  visualBrief?: ReactNode;
  /**
   * Åpner «Filmens visuelle stil» oppå dialogen (Mars 2026-10-13): når den lukkes, er brukeren tilbake her.
   * Utelatt: hintet viser bare veien dit.
   */
  onOpenStyleGuide?: () => void;
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
  // Formen på beskrivelsen følger modellen (DEC-0080): fortellende for Nano Banana og GPT Image, kort og
  // presis med identiteten først for Seedream, Qwen og FLUX
  const family = promptFamilyOf(choice.provider, chosenModel?.id);
  const transparent = !!chosenModel?.transparent;
  const promptInput = useMemo(
    () =>
      context
        ? {
            assetId: asset.id,
            variantId: variant?.id ?? null,
            productionId: context.productionId,
            occurrenceId: context.occurrenceId,
            withReference: identity !== null,
            attached,
            family,
            transparent,
          }
        : null,
    [asset.id, variant?.id, context, identity, attached, family, transparent],
  );
  const brief = useMemo(
    () => (context && promptInput ? buildContextImageBrief(context.state, promptInput) : null),
    [context, promptInput],
  );
  const negative = useMemo(
    () => (brief && family === "compact" ? renderBrief(brief, family).negative : null),
    [brief, family],
  );
  const auto = useMemo(
    () =>
      context && promptInput
        ? buildContextImagePrompt(context.state, promptInput)
        : buildImagePrompt({
            asset,
            variant,
            filmTitle,
            withReference: identity !== null,
          }),
    [asset, variant, filmTitle, identity, context, promptInput],
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
      L(
        `Siste beskrivelse for ${asset.name} (${last.when}). «Tilbakestill» gir den automatiske.`,
        `Last description for ${asset.name} (${last.when}). “Reset” gives back the automatic one.`,
      ),
    );
  }, [last, initialPrompt, edited, asset.name]);
  useEffect(() => {
    if (!insertPrompt) return;
    followAuto.current = false;
    setPrompt(stripAttachedSection(insertPrompt.text));
    setEdited(true);
    setConfirm(false);
    setOrigin(
      L(
        "Beskrivelsen fra bildet du valgte er satt inn.",
        "The description from the image you chose has been inserted.",
      ),
    );
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
          task: "prompt",
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
      setError(
        (e as Error).message ||
          L("Beskrivelsen ble ikke skrevet.", "The description could not be written."),
      );
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
            ...(negative ? { negativePrompt: negative } : {}),
            approved: true,
          },
        });
        if (!r.ok) {
          setError(
            made
              ? L(
                  `${made} av ${candidates} laget. ${tm(r.message)}`,
                  `${made} of ${candidates} made. ${tm(r.message)}`,
                )
              : tm(r.message),
          );
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
          ? L(
              `${made} kandidater laget og lagret som nye versjoner. Sammenlign dem i biblioteket og godkjenn den du vil bruke.`,
              `${made} candidates made and saved as new versions. Compare them in the library and approve the one you want to use.`,
            )
          : L(
              "Nytt bilde laget og lagret som ny versjon.",
              "New image made and saved as a new version.",
            ),
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
        <AiGlyph className="size-4" aria-hidden />{" "}
        {L("Generer et nytt bilde med AI", "Generate a new image with AI")}
      </h3>
      <p className="text-xs text-text-tertiary">
        {context
          ? L(
              "Beskrivelsen er satt sammen av filmens visuelle stil, ressursen, scenene den er med i (sted, tid på døgnet, lys, hvem som er der) og godkjente bilder i filmen.",
              "The description is put together from the film's visual style, the asset, the scenes it appears in (place, time of day, light, who is there) and the approved images in the film.",
            )
          : L(
              "Beskrivelsen er laget fra ressursen og stilen.",
              "The description is made from the asset and the style.",
            )}{" "}
        {L(
          "Du kan endre den før du sender. Bildet lagres som ny versjon",
          "You can change it before you send. The image is saved as a new version",
        )}
        {variant
          ? L(` i «${variant.name || "Uten navn"}»`, ` in “${variant.name || "Without name"}”`)
          : ""}{" "}
        {L("og brukes på laget.", "and used on the layer.")}
      </p>
      {context && !hasStyleGuide(context.state) ? (
        <p className="rounded-sm border border-accent-warm/40 bg-surface-2 px-2 py-1.5 text-xs text-text-secondary">
          {L(
            "Filmens visuelle stil er ikke fylt ut ennå. Beskrivelsen blir mye bedre når den er det:",
            "The film's visual style is not filled in yet. The description will be much better once it is:",
          )}{" "}
          {onOpenStyleGuide ? (
            <button
              type="button"
              onClick={onOpenStyleGuide}
              className="font-medium text-text-primary underline underline-offset-2 hover:text-accent-brand"
            >
              {L("Fyll ut «Filmens visuelle stil» …", "Fill in “The film's visual style” …")}
            </button>
          ) : (
            L(
              "Prosjektoversikt → «Filmens visuelle stil».",
              "Project overview → “The film's visual style”.",
            )
          )}
        </p>
      ) : context && onOpenStyleGuide ? (
        <p className="text-xs text-text-tertiary">
          <button
            type="button"
            onClick={onOpenStyleGuide}
            className="underline underline-offset-2 hover:text-text-primary"
          >
            {L(
              "Se eller endre «Filmens visuelle stil» …",
              "View or change “The film's visual style” …",
            )}
          </button>
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 @2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          {brief ? (
            <div
              aria-label={L("Bestillingen kort", "Brief summary")}
              className="rounded-sm border border-border bg-surface-2 px-2 py-1.5 text-[11px] leading-snug text-text-secondary"
            >
              <p className="font-medium text-text-primary">
                {L("Bestillingen kort", "Brief summary")}
              </p>
              <ul className="list-disc pl-4">
                {briefSummaryNb(brief, family, (v) => VERSION_VIEW_LABEL[v]).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              {visualBrief ? <div className="mt-1.5">{visualBrief}</div> : null}
            </div>
          ) : null}
          <label className="flex flex-1 flex-col gap-1 text-xs text-text-secondary">
            <span className="flex items-center justify-between">
              {L(
                "Beskrivelse (engelsk gir best resultat)",
                "Description (English gives the best result)",
              )}
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
                  title={L(
                    "Bruk den automatiske beskrivelsen igjen",
                    "Use the automatic description again",
                  )}
                >
                  <RotateCcw className="size-3" aria-hidden /> {L("Tilbakestill", "Reset")}
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
              aria-label={L("Beskrivelse for AI-generering", "Description for AI generation")}
              className="min-h-24 flex-1 resize-y rounded-sm border border-border-control bg-surface-3 p-1.5 font-mono text-[11px] leading-snug text-text-primary"
            />
            {origin ? <span className="text-[11px] text-text-tertiary">{origin}</span> : null}
            {tooLong ? (
              <span className="text-status-danger">
                {L("Beskrivelsen er for lang", "The description is too long")} (
                {stripAttachedSection(prompt).length + legendLength} {L("av", "of")}{" "}
                {MAX_PROMPT_CHARS} {L("tegn", "characters")}
                {legendLength
                  ? L(
                      ", med listen over bildene som sendes med",
                      ", including the list of images sent with it",
                    )
                  : ""}
                ).
              </span>
            ) : null}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void write()}
              disabled={!canWrite}
              title={L(
                "En språkmodell leser alt over (og ser bildene som sendes med) og skriver en presis beskrivelse. Du kan endre den før du genererer.",
                "A language model reads everything above (and sees the images sent with it) and writes a precise description. You can change it before you generate.",
              )}
            >
              {writing ? <Loader2 className="animate-spin" /> : <AiGlyph />}
              {writing
                ? L("Skriver … (kan ta et halvt minutt)", "Writing … (may take half a minute)")
                : written
                  ? L("Skriv på nytt med AI", "Write again with AI")
                  : L("Skriv beskrivelsen med AI", "Write the description with AI")}
            </Button>
            <span className="text-[11px] text-text-tertiary">
              {L(
                "Bruker litt kreditter (langt mindre enn et bilde), teller ikke i bildebudsjettet.",
                "Uses a few credits (far less than an image), does not count towards the image budget.",
              )}
            </span>
          </div>
          {written ? (
            <p
              role="status"
              className={"text-[11px] " + (stale ? "text-status-uncertain" : "text-text-secondary")}
            >
              {stale
                ? L(
                    "Bildene som sendes med er endret etter at AI skrev beskrivelsen, så den kan omtale feil bilde. Du kan likevel generere – eller skrive den på nytt først.",
                    "The images sent with it have changed since the AI wrote the description, so it may refer to the wrong image. You can still generate – or write it again first.",
                  )
                : L(
                    `Skrevet av AI (${written.model}). Les gjennom og endre det som ikke stemmer før du genererer.`,
                    `Written by AI (${written.model}). Read through it and change anything that is wrong before you generate.`,
                  )}
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
              {L("Leverandør og modell", "Provider and model")}
              <select
                aria-label={L("Leverandør og modell", "Provider and model")}
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
              {L(
                "Denne modellen kan ikke lage gjennomsiktig bakgrunn. Bruk «Frilegg bildet» etterpå, eller velg en modell merket «frilagt».",
                "This model cannot make a transparent background. Use “Cut out image” afterwards, or choose a model marked “cut out”.",
              )}
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
              {L(
                `Bruk dagens bilde (v${reference.number}) som forbilde`,
                `Use the current image (v${reference.number}) as reference`,
              )}
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
              {L(
                "Send filmens godkjente bilder med som stilforbilder",
                "Send the film's approved images along as style references",
              )}
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
              {L(
                `Send forbildene i full størrelse (${originals.size} ${originals.size === 1 ? "original" : "originaler"}) – for karakterkort og detaljer`,
                `Send the reference images at full size (${originals.size} ${originals.size === 1 ? "original" : "originals"}) – for character sheets and details`,
              )}
            </label>
          ) : null}
          {attached.length ? (
            <div className="text-[11px] text-text-tertiary">
              {L("Sendes med til bildemodellen:", "Sent to the image model:")}
              <ol className="ml-4 list-decimal">
                {attached.map((a) => (
                  <li key={a.versionId}>
                    {a.label}
                    {a.role === "identity"
                      ? L(" – utseendet beholdes", " – the appearance is kept")
                      : L(" – bare stilen", " – style only")}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {sizes.sizes.length > 1 ? (
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              {L("Bildestørrelse", "Image size")}
              <select
                aria-label={L("Bildestørrelse", "Image size")}
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
              {L("Bildestørrelse:", "Image size:")} {IMAGE_SIZE_LABEL[sizes.standard]}{" "}
              {L("(modellens faste størrelse)", "(the model's fixed size)")}
            </p>
          ) : chosenModel?.resolution ? (
            <p className="text-[11px] text-text-tertiary">
              {L("Bildestørrelse:", "Image size:")} {chosenModel.resolution}{" "}
              {L("(modellens faste størrelse)", "(the model's fixed size)")}
            </p>
          ) : null}
          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            {L("Kandidater", "Candidates")}
            <select
              aria-label={L("Antall kandidater", "Number of candidates")}
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
                {L(
                  `${candidates} bilder, hvert som egen versjon – koster ${candidates} ganger så mye`,
                  `${candidates} images, each as its own version – costs ${candidates} times as much`,
                )}
              </span>
            ) : null}
          </label>
          {confirm ? (
            <div
              ref={confirmRef}
              role="alertdialog"
              aria-label={L("Bekreft generering", "Confirm generation")}
              // Bekreftelsen står alltid synlig nederst i dialogen («Ja, generer» havnet under bretten)
              className="sticky bottom-0 z-10 flex flex-col gap-2 rounded-sm border border-accent-warm/60 bg-surface-2 p-2 shadow-[0_-8px_16px_rgba(0,0,0,0.25)]"
            >
              <p className="text-xs text-text-primary">
                {choice.provider === "lovable" ? (
                  <>
                    {L(
                      "Dette bruker kreditter i Lovable-arbeidsområdet (",
                      "This uses credits in the Lovable workspace (",
                    )}
                    {candidates > 1
                      ? L(`${candidates} bilder`, `${candidates} images`)
                      : L("ett bilde", "one image")}
                    {usage?.nextCost !== null && usage?.nextCost !== undefined
                      ? L(
                          `, anslått ${formatCredits(usage.nextCost * candidates)} – et anslag`,
                          `, estimated at ${formatCredits(usage.nextCost * candidates)} – an estimate`,
                        )
                      : L(", prisen er ukjent", ", the price is unknown")}
                    ).
                  </>
                ) : (
                  <>
                    {L("Dette belastes", "This is charged to the")}{" "}
                    {providerInfo(choice.provider)?.name}
                    {L("-kontoen til prosjektets eier (", " account of the project's owner (")}
                    {candidates > 1
                      ? L(`${candidates} bilder`, `${candidates} images`)
                      : L("ett bilde", "one image")}
                    {L(", anslått", ", estimated at")}{" "}
                    {costUsd !== null
                      ? formatUsd(costUsd * candidates)
                      : L("ukjent pris", "unknown price")}{" "}
                    {L("– et anslag).", "– an estimate).")}
                  </>
                )}{" "}
                {L("Vil du generere nå?", "Do you want to generate now?")}
              </p>
              <CostLines
                lines={
                  chosenModel && providerInfo(choice.provider)
                    ? costBreakdown(providerInfo(choice.provider)!, chosenModel, {
                        candidates,
                        targetsLabel: L("bilder", "images"),
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
                        {
                          label: L("Modell", "Model"),
                          value: L(
                            "Innebygd bildemodell (Lovable AI)",
                            "Built-in image model (Lovable AI)",
                          ),
                        },
                        {
                          label: L("Antall", "Number"),
                          value:
                            candidates > 1
                              ? L(`${candidates} bilder`, `${candidates} images`)
                              : L("1 bilde", "1 image"),
                        },
                        {
                          label: L("Ekstrarunder", "Extra rounds"),
                          value: L(
                            "ingen automatiske – nye forsøk startes bare av deg",
                            "none automatic – new attempts are only started by you",
                          ),
                        },
                        {
                          label: L("Samlet anslag", "Estimated total"),
                          value:
                            usage?.nextCost !== null && usage?.nextCost !== undefined
                              ? formatCredits(usage.nextCost * candidates)
                              : L("ukjent pris", "unknown price"),
                        },
                      ]
                }
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void run()} disabled={!canRun}>
                  <AiGlyph /> {L("Ja, generer", "Yes, generate")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  {L("Avbryt", "Cancel")}
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
              {running
                ? L(
                    "Genererer … (kan ta opptil ett minutt)",
                    "Generating … (may take up to a minute)",
                  )
                : L("Generer …", "Generate …")}
            </Button>
          )}
          {usage ? (
            <p
              className={
                "text-[11px] " + (overBudget ? "text-status-danger" : "text-text-tertiary")
              }
            >
              {usage.limit !== null
                ? L(
                    `Denne måneden: ${usage.used} av ${usage.limit} genereringer i prosjektets budsjett.`,
                    `This month: ${usage.used} of ${usage.limit} generations in the project's budget.`,
                  )
                : L(
                    `Denne måneden: ${usage.used} genereringer (ingen egen ramme – faste grenser gjelder).`,
                    `This month: ${usage.used} generations (no separate limit – fixed limits apply).`,
                  )}
              {overBudget
                ? L(
                    " Budsjettet er brukt opp; eieren kan endre det på prosjektoversikten.",
                    " The budget is used up; the owner can change it on the project overview.",
                  )
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
    return L(
      "Forbindelsen til serveren brøt mens bildet ble laget. Tjenesten kan likevel ha laget – og tatt betalt for – bildet. Se AI-jobbene før du prøver igjen, og velg gjerne mindre bildestørrelse eller færre forbildebilder.",
      "The connection to the server broke while the image was being made. The service may still have made – and charged for – the image. Check the AI jobs before you try again, and consider a smaller image size or fewer reference images.",
    );
  return tm(m);
}
