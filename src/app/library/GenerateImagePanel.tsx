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
import { planBriefSave, shownBriefVersion, type BriefVersion, aiUsage, type Asset, type AssetMedia, type AssetVariant, type AssetVersion, type AttachedImage, attachedImages, promptFamilyOf, costBreakdown, estimateCostUsd, formatCredits, formatUsd, hasStyleGuide, IMAGE_PURPOSE_FOR_KIND, IMAGE_SIZE_LABEL, fullSizeOriginal, type ImageSize, imageSizesOf, lastImagePrompt, LOVABLE_CUTOUT_MODEL, LOVABLE_IMAGE_MODEL, MAX_PROMPT_CHARS, type Project, type ProjectState, profileBudgetRemaining, qualityProfileUsage, providerInfo, providerModel, providersFor, qualityProfileSnapshot, stripAttachedSection, tm } from "@/core";
import { QualityProfilePicker, chosenQualityProfile, type QualityProfileChoice } from "@/app/ai/QualityProfilePicker";
import { aiJobsKey, useAiJobs } from "@/app/ai/use-ai-jobs";
import { CUTOUT_MODEL, IMAGE_MODEL, generateImage } from "@/adapters/ai/generate-image.functions";
import { writeImagePrompt } from "@/adapters/ai/write-prompt.functions";
import { useImagePromptPreview } from "./image-prompt-preview";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { EffortPicker } from "@/app/ai/EffortPicker";
import { Button } from "@/components/ui/button";
import { CostLines } from "@/app/ai/CostLines";
import { t } from "@/core/i18n/keyed";

export interface GeneratedImage {
  readonly versionId: string;
  readonly media: AssetMedia;
  readonly model: string;
  /** Tekstversjonen bildet ble laget fra (migrasjon 0089). */
  readonly briefVersionId?: string;
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
  saveBriefVersions,
  onBriefShown,
}: {
  /**
   * Lagrer tekstversjonene av beskrivelsen på ressursen (Øystein 23.10): én angrebar kommando. Returnerer
   * feilmelding eller null. Utelatt: teksten lagres ikke som versjon (som før).
   */
  saveBriefVersions?: (versions: readonly BriefVersion[], activeId: string) => string | null;
  /** Tekstversjonen som står i feltet nå (for fremheving av bildene laget fra den), eller null. */
  onBriefShown?: (briefId: string | null) => void;
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
  // Kvalitetsprofil (M8, REQ-0854–0862): standard er prosjektets aktive profil, kan overstyres her
  const [profileChoice, setProfileChoice] = useState<QualityProfileChoice>("active");
  const profile = context ? chosenQualityProfile(context.state, profileChoice) : null;
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
  // B-105a: malene og stilreglene ligger på serveren. Her sendes bare innstillingene; svaret er den
  // automatiske beskrivelsen brukeren ser og kan redigere.
  const promptRequest = useMemo(
    () => ({
      kind: "asset" as const,
      assetId: asset.id,
      variantId: variant?.id ?? null,
      referenceVersionId: identity?.id ?? null,
      productionId: context?.productionId ?? null,
      occurrenceId: context?.occurrenceId ?? null,
      style: withStyle,
      fullSize,
      family,
      transparent,
    }),
    [asset.id, variant?.id, identity?.id, context?.productionId, context?.occurrenceId, withStyle, fullSize, family, transparent],
  );
  const serverPreview = useImagePromptPreview(projectId, promptRequest, context?.state ?? asset).data ?? null;
  const summary = serverPreview?.summary ?? null;
  const auto = serverPreview?.prompt ?? "";
  const openBrief = initialPrompt === undefined && saveBriefVersions ? shownBriefVersion(asset) : null;
  const [prompt, setPrompt] = useState(initialPrompt ?? openBrief?.text ?? auto);
  const [edited, setEdited] = useState((initialPrompt !== undefined && initialPrompt !== auto) || openBrief !== null);
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
  // Tekstversjoner (Øystein 23.10): feltet åpner med den sist brukte/redigerte, aldri standardteksten
  const briefs = asset.briefVersions ?? [];
  const [briefIdx, setBriefIdx] = useState<number | null>(() => {
    if (initialPrompt !== undefined || !saveBriefVersions) return null;
    const b = shownBriefVersion(asset);
    return b ? briefs.indexOf(b) : null;
  });
  const briefInit = useRef(false);
  if (!briefInit.current) {
    briefInit.current = true;
    if (briefIdx !== null && briefs[briefIdx]) {
      lastUsed.current = true;
    }
  }
  /** Feltet følger den automatiske beskrivelsen (til siste beskrivelse er satt inn, eller etter «Tilbakestill»). */
  const followAuto = useRef(openBrief === null);
  /** Den viste tekstversjonen, bare så lenge feltet har akkurat den teksten. */
  const shownBrief = briefIdx !== null && briefs[briefIdx] && briefs[briefIdx].text === stripAttachedSection(prompt).replace(/\r\n?/g, "\n").trim() ? briefs[briefIdx] : null;
  useEffect(() => onBriefShown?.(shownBrief?.id ?? null), [shownBrief?.id, onBriefShown]);
  /** Lagrer teksten i feltet som tekstversjon (ny hvis den er endret); returnerer ID-en, eller undefined. */
  const saveBrief = (): string | undefined => {
    if (!saveBriefVersions || !editable) return undefined;
    const text = stripAttachedSection(promptRef.current);
    const plan = planBriefSave(assetRef.current, text, crypto.randomUUID(), new Date().toISOString());
    if (!plan) return shownBriefVersion(assetRef.current)?.text === text.replace(/\r\n?/g, "\n").trim() ? shownBriefVersion(assetRef.current)?.id : undefined;
    if (saveBriefVersions(plan.versions, plan.activeId)) return undefined;
    assetRef.current = { ...assetRef.current, briefVersions: plan.versions, activeBriefId: plan.activeId };
    setBriefIdx(plan.versions.findIndex((v) => v.id === plan.activeId));
    return plan.activeId;
  };
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const assetRef = useRef(asset);
  useEffect(() => {
    assetRef.current = asset;
  }, [asset]);
  const editedRef = useRef(edited);
  editedRef.current = edited;
  const saveRef = useRef(saveBrief);
  saveRef.current = saveBrief;
  // Teksten skal aldri gå tapt: en endret tekst lagres når dialogen lukkes
  useEffect(() => () => {
    if (editedRef.current) saveRef.current();
  }, []);
  useEffect(() => {
    if (lastUsed.current || initialPrompt !== undefined || edited || !last) return;
    lastUsed.current = true;
    // Den automatiske beskrivelsen skal ikke overskrive den (heller ikke når effektene kjøres på nytt)
    followAuto.current = false;
    setPrompt(stripAttachedSection(last.prompt));
    setEdited(true);
    setOrigin(
      t("app-library-generate-image-panel.generate-image-panel.set-origin.af8d432801ee", { name: String(asset.name), when: String(last.when) }),
    );
  }, [last, initialPrompt, edited, asset.name]);
  useEffect(() => {
    if (!insertPrompt) return;
    followAuto.current = false;
    setPrompt(stripAttachedSection(insertPrompt.text));
    setEdited(true);
    setConfirm(false);
    setOrigin(
      t("app-library-generate-image-panel.generate-image-panel.set-origin.fa9b6457c535"),
    );
  }, [insertPrompt]);
  // Kandidater (mandat 19.7): flere bilder å velge mellom, hvert som egen versjon
  const [candidates, setCandidates] = useState(1);
  const usage = budget
    ? aiUsage(budget, jobs.data?.jobs ?? [], new Date(), jobs.data?.monthCount ?? undefined)
    : null;
  // Profilens budsjettgrense (M8, REQ-0858): gjelder i tillegg til prosjektets ramme
  const profileLeft = profileBudgetRemaining(profile, profile ? qualityProfileUsage(profile.id, jobs.data?.jobs ?? [], new Date()) : 0);
  const overBudget = (usage !== null && usage.remaining === 0) || (profileLeft !== null && profileLeft < candidates) || (profile?.spec.budgetLimit != null && !jobs.data);
  // Profilens valg fylles inn når den velges (brukerens egne valg overstyres ikke etterpå)
  const appliedProfile = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || appliedProfile.current === profile.id) return;
    appliedProfile.current = profile.id;
    const m = profile.spec.models?.image;
    if (m) {
      const hit = options.find((o) => o.models.some((mm) => mm.id === m));
      if (hit) setPick(`${hit.provider.id}|${m}`);
    }
    if (profile.spec.resolution) setSizePick(profile.spec.resolution);
    if (profile.spec.variants) setCandidates(Math.max(1, Math.min(4, profile.spec.variants)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);
  // Følg den automatiske beskrivelsen til brukeren har endret den selv
  useEffect(() => {
    if (!edited && followAuto.current) setPrompt(auto);
  }, [auto, edited]);
  const [confirm, setConfirm] = useState(false);
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
      promptRef.current = r.prompt;
      setEdited(true);
      saveBrief();
      setWritten({ model: r.model, images: attachedKey });
    } catch (e) {
      setError(
        (e as Error).message ||
          t("app-library-generate-image-panel.write.set-error.21074e547fa9"),
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
      const briefVersionId = saveBrief();
      let made = 0;
      for (let c = 0; c < candidates; c++) {
        const r = await generateImage({
          data: {
            projectId,
            assetId: asset.id,
            // Listen over bildene som sendes, er alltid fersk (en gammel liste i teksten byttes ut), så
            // teksten og bildene ikke kan komme i utakt
            // Serveren legger til en fersk liste over vedleggene, så teksten og bildene ikke kommer i utakt
            prompt: stripAttachedSection(prompt),
            referencePaths: [],
            promptRequest,
            identityFirst: attached[0]?.role === "identity",
            purpose: IMAGE_PURPOSE_FOR_KIND[asset.kind],
            variantId: variant?.id ?? null,
            provider: choice.provider,
            model: choice.provider === "lovable" ? null : choice.model,
            size,
            // M8 (REQ-0859): profilen bildet lages med, som øyeblikksbilde i jobbens metadata
            ...(profile ? { qualityProfile: qualityProfileSnapshot(profile) } : {}),
            approved: true,
          },
        });
        if (!r.ok) {
          setError(
            made
              ? t("app-library-generate-image-panel.run.set-error.105685bd9481", { made: String(made), candidates: String(candidates), value3: String(tm(r.message)) })
              : tm(r.message),
          );
          return;
        }
        const err = await onGenerated({ versionId: r.versionId, media: r.media, model: r.model, ...(briefVersionId ? { briefVersionId } : {}) });
        if (err) {
          setError(err);
          return;
        }
        made++;
      }
      setDone(
        candidates > 1
          ? t("app-library-generate-image-panel.run.set-done.748fb0b5d751", { made: String(made) })
          : t("app-library-generate-image-panel.run.set-done.9710f9ab86da"),
      );
    } catch (e) {
      setError(lostConnection((e as Error).message));
    } finally {
      setRunning(false);
      void queryClient.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    }
  }

  // Beskrivelsen og listen over bildene må få plass sammen
  const legendLength = serverPreview?.legendChars ?? 0;
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
        {t("app-library-generate-image-panel.generate-image-panel.h3.f7137e7df9de")}
      </h3>
      <p className="text-xs text-text-tertiary">
        {context
          ? t("app-library-generate-image-panel.generate-image-panel.p.6e7de831eb73")
          : t("app-library-generate-image-panel.generate-image-panel.p.0023a4920019")}{" "}
        {t("app-library-generate-image-panel.generate-image-panel.p.369696db8c8d")}
        {variant
          ? t("app-library-generate-image-panel.in-variant", { name: variant.name || t("app-library-generate-image-panel.in-variant-unnamed") })
          : ""}{" "}
        {t("app-library-generate-image-panel.generate-image-panel.p.47f4f640efe3")}
      </p>
      {context && !hasStyleGuide(context.state) ? (
        <p className="rounded-sm border border-accent-warm/40 bg-surface-2 px-2 py-1.5 text-xs text-text-secondary">
          {t("app-library-generate-image-panel.generate-image-panel.p.e5f92a562441")}{" "}
          {onOpenStyleGuide ? (
            <button
              type="button"
              onClick={onOpenStyleGuide}
              className="font-medium text-text-primary underline underline-offset-2 hover:text-accent-brand"
            >
              {t("app-library-generate-image-panel.generate-image-panel.button.7b749a7e6da9")}
            </button>
          ) : (
            t("app-library-generate-image-panel.generate-image-panel.p.c6da9b6d9aee")
          )}
        </p>
      ) : context && onOpenStyleGuide ? (
        <p className="text-xs text-text-tertiary">
          <button
            type="button"
            onClick={onOpenStyleGuide}
            className="underline underline-offset-2 hover:text-text-primary"
          >
            {t("app-library-generate-image-panel.generate-image-panel.button.448bd157997f")}
          </button>
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 @2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          {summary ? (
            <div
              aria-label={t("app-library-generate-image-panel.generate-image-panel.aria-label.6eac5653b1de")}
              className="rounded-sm border border-border bg-surface-2 px-2 py-1.5 text-[11px] leading-snug text-text-secondary"
            >
              <p className="font-medium text-text-primary">
                {t("app-library-generate-image-panel.generate-image-panel.p.6eac5653b1de")}
              </p>
              <ul className="list-disc pl-4">
                {summary.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              {visualBrief ? <div className="mt-1.5">{visualBrief}</div> : null}
            </div>
          ) : null}
          <label className="flex flex-1 flex-col gap-1 text-xs text-text-secondary">
            <span className="flex items-center justify-between">
              {t("app-library-generate-image-panel.generate-image-panel.span.f985152b1196")}
              <span className="ml-auto flex items-center gap-1">
              {saveBriefVersions && briefs.length > 0 ? (
                <BriefNav
                  index={briefIdx}
                  total={briefs.length}
                  disabled={!editable || running || writing}
                  onGo={(i) => {
                    if (edited && !shownBrief) saveBrief();
                    const list = assetRef.current.briefVersions ?? briefs;
                    const b = list[i];
                    if (!b) return;
                    followAuto.current = false;
                    setPrompt(b.text);
                    setEdited(true);
                    setOrigin(null);
                    setConfirm(false);
                    setBriefIdx(i);
                  }}
                  count={(assetRef.current.briefVersions ?? briefs).length}
                />
              ) : null}
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
                  title={t("app-library-generate-image-panel.generate-image-panel.title.833045f236e3")}
                >
                  <RotateCcw className="size-3" aria-hidden /> {t("app-library-generate-image-panel.generate-image-panel.button.6d3464efba3d")}
                </button>
              ) : null}
              </span>
            </span>
            <textarea
              value={prompt}
              onBlur={() => {
                if (edited) saveBrief();
              }}
              onChange={(e) => {
                setPrompt(e.target.value);
                setEdited(true);
                setConfirm(false);
                setOrigin(null);
              }}
              disabled={!editable || running || writing}
              rows={context ? 14 : 6}
              aria-label={t("app-library-generate-image-panel.generate-image-panel.aria-label.28ffd82da557")}
              className="min-h-24 flex-1 resize-y rounded-sm border border-border-control bg-surface-3 p-1.5 font-mono text-[11px] leading-snug text-text-primary"
            />
            {origin ? <span className="text-[11px] text-text-tertiary">{origin}</span> : null}
            {tooLong ? (
              <span className="text-status-danger">
                {t("app-library-generate-image-panel.generate-image-panel.span.2ef7be350cda")} (
                {stripAttachedSection(prompt).length + legendLength} {t("app-library-generate-image-panel.generate-image-panel.span.8dcec8542f6d")}{" "}
                {MAX_PROMPT_CHARS} {t("app-library-generate-image-panel.generate-image-panel.span.1d756f586b3e")}
                {legendLength
                  ? t("app-library-generate-image-panel.generate-image-panel.span.3e869a9eb207")
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
              title={t("app-library-generate-image-panel.generate-image-panel.title.9c26aeab4880")}
            >
              {writing ? <Loader2 className="animate-spin" /> : <AiGlyph />}
              {writing
                ? t("app-library-generate-image-panel.generate-image-panel.button.15388f0ed6fe")
                : written
                  ? t("app-library-generate-image-panel.generate-image-panel.button.187cbde97a02")
                  : t("app-library-generate-image-panel.generate-image-panel.button.ad9910320245")}
            </Button>
            <span className="text-[11px] text-text-tertiary">
              {t("app-library-generate-image-panel.generate-image-panel.span.05bd9b9aeedc")}
            </span>
          </div>
          {written ? (
            <p
              role="status"
              className={"text-[11px] " + (stale ? "text-status-uncertain" : "text-text-secondary")}
            >
              {stale
                ? t("app-library-generate-image-panel.generate-image-panel.p.22963b0ba2c8")
                : t("app-library-generate-image-panel.generate-image-panel.p.eddef8c64107", { model: String(written.model) })}
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
              {t("app-library-generate-image-panel.generate-image-panel.label.6cd2f309c3c8")}
              <select
                aria-label={t("app-library-generate-image-panel.generate-image-panel.aria-label.6cd2f309c3c8")}
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
          {context ? (
            <QualityProfilePicker
              state={context.state}
              value={profileChoice}
              onChange={(v) => {
                setProfileChoice(v);
                setConfirm(false);
              }}
              disabled={!editable || running}
            />
          ) : null}
          {chosenModel &&
          IMAGE_PURPOSE_FOR_KIND[asset.kind] === "cutout" &&
          !chosenModel.transparent ? (
            <p className="text-[11px] text-status-uncertain">
              {t("app-library-generate-image-panel.generate-image-panel.p.d711cab7fc79")}
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
              {t("app-library-generate-image-panel.generate-image-panel.label.0e5e237256f6", { number: String(reference.number) })}
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
              {t("app-library-generate-image-panel.generate-image-panel.label.7a9660c1f053")}
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
              {t("app-library-generate-image-panel.send-originals", { count: originals.size })}
            </label>
          ) : null}
          {attached.length ? (
            <div className="text-[11px] text-text-tertiary">
              {t("app-library-generate-image-panel.generate-image-panel.div.609dba5b72e9")}
              <ol className="ml-4 list-decimal">
                {attached.map((a) => (
                  <li key={a.versionId}>
                    {a.label}
                    {a.role === "identity"
                      ? t("app-library-generate-image-panel.generate-image-panel.li.150d0b38aa87")
                      : t("app-library-generate-image-panel.generate-image-panel.li.6784aa0831bc")}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {sizes.sizes.length > 1 ? (
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              {t("app-library-generate-image-panel.generate-image-panel.label.924cc768c0b6")}
              <select
                aria-label={t("app-library-generate-image-panel.generate-image-panel.aria-label.924cc768c0b6")}
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
              {t("app-library-generate-image-panel.generate-image-panel.p.d1aa4e3f94da")} {IMAGE_SIZE_LABEL[sizes.standard]}{" "}
              {t("app-library-generate-image-panel.generate-image-panel.p.a47da21afeff")}
            </p>
          ) : chosenModel?.resolution ? (
            <p className="text-[11px] text-text-tertiary">
              {t("app-library-generate-image-panel.generate-image-panel.p.d1aa4e3f94da.2")} {chosenModel.resolution}{" "}
              {t("app-library-generate-image-panel.generate-image-panel.p.a47da21afeff.2")}
            </p>
          ) : null}
          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            {t("app-library-generate-image-panel.generate-image-panel.label.02a2d5239e5f")}
            <select
              aria-label={t("app-library-generate-image-panel.generate-image-panel.aria-label.9e128cdb7529")}
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
                {t("app-library-generate-image-panel.candidate-images", { count: candidates })}
              </span>
            ) : null}
          </label>
          {confirm ? (
            <div
              ref={confirmRef}
              role="alertdialog"
              aria-label={t("app-library-generate-image-panel.generate-image-panel.aria-label.5729ea679c31")}
              // Bekreftelsen står alltid synlig nederst i dialogen («Ja, generer» havnet under bretten)
              className="sticky bottom-0 z-10 flex flex-col gap-2 rounded-sm border border-accent-warm/60 bg-surface-2 p-2 shadow-[0_-8px_16px_rgba(0,0,0,0.25)]"
            >
              <p className="text-xs text-text-primary">
                {choice.provider === "lovable" ? (
                  <>
                    {t("r6-brand.image-credits")}
                    {candidates > 1
                      ? t("app-library-generate-image-panel.generate-image-panel.p.30915c9b7fc9", { candidates: String(candidates) })
                      : t("app-library-generate-image-panel.generate-image-panel.p.14451055cdf1")}
                    {usage?.nextCost !== null && usage?.nextCost !== undefined
                      ? t("app-library-generate-image-panel.generate-image-panel.p.fcbd5958af13", { value1: String(formatCredits(usage.nextCost * candidates)) })
                      : t("app-library-generate-image-panel.generate-image-panel.p.223f1926d20e")}
                    ).
                  </>
                ) : (
                  <>
                    {t("app-library-generate-image-panel.generate-image-panel.p.b9225cd2f304")}{" "}
                    {providerInfo(choice.provider)?.name}
                    {t("app-library-generate-image-panel.generate-image-panel.p.7ad4ac216d7e")}
                    {candidates > 1
                      ? t("app-library-generate-image-panel.generate-image-panel.p.30915c9b7fc9.2", { candidates: String(candidates) })
                      : t("app-library-generate-image-panel.generate-image-panel.p.14451055cdf1.2")}
                    {t("app-library-generate-image-panel.generate-image-panel.p.e3db731f8849")}{" "}
                    {costUsd !== null
                      ? formatUsd(costUsd * candidates)
                      : t("app-library-generate-image-panel.generate-image-panel.p.2b6ce351bdc4")}{" "}
                    {t("app-library-generate-image-panel.generate-image-panel.p.0e5279847698")}
                  </>
                )}{" "}
                {t("app-library-generate-image-panel.generate-image-panel.p.4bfa620e3738")}
              </p>
              <CostLines
                lines={
                  chosenModel && providerInfo(choice.provider)
                    ? costBreakdown(providerInfo(choice.provider)!, chosenModel, {
                        candidates,
                        targetsLabel: t("app-library-generate-image-panel.targets-label.targets-label.c033e25d3dbd"),
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
                          label: t("app-library-generate-image-panel.label.label.ce5c2ab7029a"),
                          value: t("app-library-generate-image-panel.value.value.0a91ac13c9f7"),
                        },
                        {
                          label: t("app-library-generate-image-panel.label.label.bfd80eaeddbd"),
                          value:
                            candidates > 1
                              ? t("app-library-generate-image-panel.value.value.e89f114998b0", { candidates: String(candidates) })
                              : t("app-library-generate-image-panel.value.value.af141b19c297"),
                        },
                        {
                          label: t("app-library-generate-image-panel.label.label.6d04cb168ac2"),
                          value: t("app-library-generate-image-panel.value.value.c84b3d7ecaae"),
                        },
                        {
                          label: t("app-library-generate-image-panel.label.label.3113022c2c74"),
                          value:
                            usage?.nextCost !== null && usage?.nextCost !== undefined
                              ? formatCredits(usage.nextCost * candidates)
                              : t("app-library-generate-image-panel.value.value.5dde0bb6f2b5"),
                        },
                      ]
                }
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void run()} disabled={!canRun}>
                  <AiGlyph /> {t("app-library-generate-image-panel.generate-image-panel.button.0758d8cca839")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  {t("app-library-generate-image-panel.generate-image-panel.button.4df37c4080c5")}
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
                ? t("app-library-generate-image-panel.generate-image-panel.button.a047f8567741")
                : t("app-library-generate-image-panel.generate-image-panel.button.56a2ccb973a1")}
            </Button>
          )}
          {usage ? (
            <p
              className={
                "text-[11px] " + (overBudget ? "text-status-danger" : "text-text-tertiary")
              }
            >
              {usage.limit !== null
                ? t("app-library-generate-image-panel.generate-image-panel.p.8ca16bb84212", { used: String(usage.used), limit: String(usage.limit) })
                : t("app-library-generate-image-panel.generate-image-panel.p.e3db49489073", { used: String(usage.used) })}
              {overBudget
                ? t("app-library-generate-image-panel.generate-image-panel.p.5714e03c691a")
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
    return t("app-library-generate-image-panel.lost-connection.message.e72c8e457e28");
  return tm(m);
}

/** ‹ 3/5 › over tekstfeltet: bla mellom tekstversjonene (Øystein 23.10). */
function BriefNav({ index, total, count, disabled, onGo }: { index: number | null; total: number; count: number; disabled: boolean; onGo: (i: number) => void }) {
  const n = Math.max(total, count);
  // En endret, ulagret tekst står «etter» den siste versjonen
  const at = index ?? n;
  const btn = "rounded-sm px-1 text-[13px] leading-none text-text-secondary hover:bg-surface-3 hover:text-text-primary disabled:opacity-50 disabled:hover:bg-transparent";
  return (
    <span className="flex items-center gap-0.5" data-testid="brief-nav">
      <button type="button" className={btn} disabled={disabled || at <= 0} onClick={() => onGo(at - 1)} aria-label={t("brief.versions.previous")} title={t("brief.versions.previous")}>‹</button>
      <span className="tabular-nums text-[11px] text-text-tertiary" data-testid="brief-counter" aria-label={t("brief.versions.counter", { current: String(index === null ? "–" : index + 1), total: String(n) })}>
        {index === null ? "–" : index + 1}/{n}
      </span>
      <button type="button" className={btn} disabled={disabled || at >= n - 1} onClick={() => onGo(at + 1)} aria-label={t("brief.versions.next")} title={t("brief.versions.next")}>›</button>
    </span>
  );
}
