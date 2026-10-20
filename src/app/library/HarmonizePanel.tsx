/**
 * P8 «Harmoniser stil …» (REQ-0137–0145, REQ-0400–0402): tegn om bildet til en felles stil fra en stilprofil
 * eller et referansebilde, med identiteten bevart. Kostnaden bekreftes før hver generering; modell og
 * størrelse følger kvalitetsprofilen (M8) og kan overstyres. Resultatet sammenlignes med originalen før noe
 * lagres, og brukeren velger selv hva det brukes til. Originalen endres aldri; alt kan angres. Publisering
 * til det globale biblioteket er alltid et eget klikk.
 */
import { Globe, Loader2, Palette, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  L,
  tm,
  buildHarmonizePrompt,
  harmonizeAttachments,
  harmonizeNote,
  harmonizedVariantName,
  harmonizationOf,
  HARMONIZE_IDENTITY_WARNING,
  newId,
  preferredStyleReference,
  profileChoice,
  qualityProfileSnapshot,
  withAttachedLegend,
  type AssetMedia,
  type AssetVersion,
  type HarmonizationUse,
  type StyleHarmonizationFields,
} from "@/core";
import { generateImage } from "@/adapters/ai/generate-image.functions";
import { saveAssetToGlobal } from "@/adapters/global/global-library.functions";
import { aiJobsKey } from "@/app/ai/use-ai-jobs";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { QualityProfileBudget, QualityProfilePicker, useQualityProfile } from "@/app/ai/QualityProfilePicker";
import { useProjectWorkspace } from "@/app/global/use-global";
import { Button } from "@/components/ui/button";
import { lostConnection } from "./GenerateImagePanel";
import { CostConfirm, ImageModelFields, PromptPreview } from "./ImageAiPanels";
import { HarmonizeCompare } from "./HarmonizeCompare";
import { HarmonizeBatchPanel } from "./HarmonizeBatchPanel";
import { useImageModel } from "./image-model";
import { useImageUrls } from "./asset-images";
import type { LightboxTools } from "./ImageLightbox";

const field = "h-7 w-full rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";

interface Pending {
  readonly versionId: string;
  readonly media: AssetMedia;
  readonly model: string;
  readonly styleProfileId: string | null;
  readonly referenceVersionId: string | null;
  readonly qualityProfile: ReturnType<typeof qualityProfileSnapshot> | null;
}
interface Saved {
  readonly harmonizationId: string;
  readonly versionId: string;
  readonly variantId: string;
  readonly use: HarmonizationUse;
  readonly fields: StyleHarmonizationFields;
}

export function HarmonizePanel({
  tools,
  version,
  projectId,
  onClose,
}: {
  tools: LightboxTools;
  version: AssetVersion;
  projectId: string;
  onClose: () => void;
}) {
  const { state, asset } = tools;
  const qc = useQueryClient();
  const m = useImageModel(projectId, tools.editable);
  const quality = useQualityProfile(state);
  const available = useProjectProviders(projectId, tools.editable);
  const profiles = Object.values(state.styleProfiles).filter((p) => !p.removed);
  const [source, setSource] = useState<"profile" | "reference">(profiles.length ? "profile" : "reference");
  const [profileId, setProfileId] = useState<string>(profiles.find((p) => p.isDefault)?.id ?? profiles[0]?.id ?? "");
  const references = useMemo(
    () =>
      Object.values(state.assetVersions)
        .filter((v) => v.mimeType.startsWith("image/") && v.id !== version.id)
        .map((v) => {
          const va = state.assetVariants[v.variantId];
          const a = va ? state.assets[va.assetId] : undefined;
          return a && !a.removed && va ? { id: v.id as string, label: `${a.name} – ${va.name} v${v.number}` } : null;
        })
        .filter((x): x is { id: string; label: string } => !!x)
        .slice(0, 300),
    [state, version.id],
  );
  const [referenceId, setReferenceId] = useState<string>("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [batch, setBatch] = useState(false);
  const ws = useProjectWorkspace(projectId);

  // Kvalitetsprofilen foreslår modell og størrelse (REQ-0401); brukeren kan overstyre etterpå
  const recommended = profileChoice("image", quality.profile, new Set(available.data?.providers ?? []));
  const recommendedKey = recommended ? `${recommended.provider.id}|${recommended.model.id}` : null;
  useEffect(() => {
    if (recommendedKey && m.choices.some((c) => c.key === recommendedKey)) m.setPick(recommendedKey);
    const res = quality.profile?.spec.resolution;
    if (res) m.setSizePick(res);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality.profile?.id, recommendedKey, m.choices.length]);

  const input = {
    assetId: asset.id,
    versionId: version.id,
    styleProfileId: source === "profile" && profileId ? profileId : null,
    referenceVersionId: source === "reference" && referenceId ? referenceId : null,
  };
  const preview = useMemo(() => {
    const prompt = buildHarmonizePrompt(state, input);
    if (!prompt) return null;
    const attached = harmonizeAttachments(state, input);
    return { prompt: withAttachedLegend(prompt, asset.name, attached), negative: null, attached };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, input.styleProfileId, input.referenceVersionId, version.id]);
  const profileName = input.styleProfileId ? (state.styleProfiles[input.styleProfileId]?.name ?? null) : null;
  const urls = useImageUrls([version.mediaPath, ...(pending ? [pending.media.path] : [])]);
  const existing = harmonizationOf(state, version.id);
  const existingProfile = existing?.styleProfileId ? state.styleProfiles[existing.styleProfileId]?.name : null;

  async function run() {
    if (!m.choice || !preview) return;
    const choice = m.choice;
    setConfirm(false);
    setMsg(null);
    setSaved(null);
    setBusy(L("Harmoniserer stilen … (kan ta et minutt)", "Harmonizing the style … (can take a minute)"));
    try {
      const qp = quality.profile ? qualityProfileSnapshot(quality.profile) : null;
      const r = await generateImage({
        data: {
          projectId,
          assetId: asset.id,
          prompt: preview.prompt,
          referencePaths: preview.attached.map((a) => a.path),
          identityFirst: true,
          purpose: "cutout",
          variantId: null,
          provider: choice.provider.id,
          model: choice.provider.id === "lovable" ? null : choice.model.id,
          size: m.size,
          approved: true,
          qualityProfile: qp,
        },
      });
      if (!r.ok) throw new Error(tm(r.message));
      setPending({ versionId: r.versionId, media: r.media, model: r.model, styleProfileId: input.styleProfileId, referenceVersionId: input.referenceVersionId, qualityProfile: qp });
    } catch (e) {
      setMsg({ kind: "error", text: lostConnection((e as Error).message) });
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    }
  }

  /** Lagrer resultatet som ny versjon i en egen variant (aldri i stedet for en eksisterende). */
  async function save(use: "local" | "variant") {
    if (!pending) return;
    const name = pending.styleProfileId ? (state.styleProfiles[pending.styleProfileId]?.name ?? null) : null;
    const note = harmonizeNote(name, pending.model);
    const harmonizationId = newId<"command">();
    const variantId = newId<"asset_variant">();
    const fields = {
      versionId: pending.versionId,
      sourceVersionId: version.id,
      model: pending.model.slice(0, 200),
      qualityProfile: pending.qualityProfile,
      styleProfileId: pending.styleProfileId,
      referenceVersionId: pending.referenceVersionId,
      use,
      note,
    };
    const r = await tools.cmds.runAndWait(
      {
        type: "ApplyHarmonizedImage",
        harmonizationId,
        variantId: variantId as never,
        versionId: pending.versionId as never,
        media: pending.media,
        note,
        fields,
        newVariant: {
          assetId: asset.id,
          fields: { name: use === "local" ? `${harmonizedVariantName(name)} (${L("lokal", "local")})`.slice(0, 80) : harmonizedVariantName(name), style: "other", appearance: "" },
          ...(use === "local" ? { archived: true } : {}),
        },
      },
      L(`Harmonisert stil for «${asset.name}»`, `Harmonized style for “${asset.name}”`),
    );
    if (r.error) {
      setMsg({ kind: "error", text: r.error });
      return;
    }
    setSaved({ harmonizationId, versionId: pending.versionId, variantId, use, fields });
    setPending(null);
    if (use === "local") {
      tools.onUseHere?.(pending.versionId);
      setMsg({ kind: "ok", text: L("Brukt bare her. Ressursen i biblioteket er uendret.", "Used only here. The asset in the library is unchanged.") });
    } else {
      tools.onSaved?.({ versionId: pending.versionId, variantId, assetId: asset.id });
      setMsg({ kind: "ok", text: L("Lagret som ny variant. Originalen er beholdt.", "Saved as a new variant. The original is kept.") });
    }
  }

  async function markPreferred() {
    if (!saved || !saved.fields.styleProfileId) return;
    const group = `pref-${saved.harmonizationId}`;
    const a = await tools.cmds.runAndWait(
      { type: "SetPreferredStyleReference", referenceId: newId<"command">(), fields: { assetId: asset.id, styleProfileId: saved.fields.styleProfileId, variantId: saved.variantId } },
      L("Foretrukket referanse", "Preferred reference"),
      group,
    );
    if (a.error) return setMsg({ kind: "error", text: a.error });
    await tools.cmds.runAndWait(
      { type: "SetStyleHarmonization", harmonizationId: saved.harmonizationId, fields: { ...saved.fields, use: "reference" } },
      L("Foretrukket referanse", "Preferred reference"),
      group,
    );
    setSaved({ ...saved, use: "reference", fields: { ...saved.fields, use: "reference" } });
    setMsg({ kind: "ok", text: L("Merket som foretrukket referanse for stilprofilen.", "Marked as the preferred reference for the style profile.") });
  }

  async function publish() {
    if (!saved || !ws.workspaceId) return;
    setBusy(L("Publiserer …", "Publishing …"));
    try {
      await saveAssetToGlobal({ data: { projectId, assetId: asset.id, workspaceId: ws.workspaceId } });
      await tools.cmds.runAndWait(
        { type: "SetStyleHarmonization", harmonizationId: saved.harmonizationId, fields: { ...saved.fields, use: "published" } },
        L("Publisert til det globale biblioteket", "Published to the global library"),
      );
      setSaved({ ...saved, use: "published", fields: { ...saved.fields, use: "published" } });
      setMsg({ kind: "ok", text: L("Publisert til det globale biblioteket som ny stilvariant.", "Published to the global library as a new style variant.") });
    } catch (e) {
      setMsg({ kind: "error", text: tm((e as Error).message) });
    } finally {
      setBusy(null);
    }
  }

  if (batch)
    return <HarmonizeBatchPanel tools={tools} projectId={projectId} styleProfileId={input.styleProfileId} referenceVersionId={input.referenceVersionId} m={m} quality={quality} onClose={() => setBatch(false)} />;
  if (!m.choices.length)
    return <p className="text-xs text-text-tertiary">{L("Ingen bildemodeller er tilgjengelige.", "No image models are available.")}</p>;
  const preferred = input.styleProfileId ? preferredStyleReference(state, asset.id, input.styleProfileId) : null;
  return (
    <div data-testid="harmonize-panel" className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-2 text-xs text-text-secondary">
      <h4 className="flex items-center gap-1 font-medium text-text-primary">
        <Palette className="size-3.5" aria-hidden /> {L("Harmoniser stil", "Harmonize style")}
      </h4>
      {existing ? (
        <p data-testid="harmonize-made-with" className="text-text-tertiary">
          {existingProfile
            ? L(`Laget med profil «${existingProfile}»`, `Made with profile “${existingProfile}”`)
            : L("Laget med et referansebilde", "Made with a reference image")}{" "}
          ({existing.model})
        </p>
      ) : null}
      <fieldset className="flex flex-col gap-1" disabled={!!busy || !!pending}>
        <legend className="mb-1">{L("Stilen hentes fra", "Take the style from")}</legend>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="harmonize-source" data-testid="harmonize-source-profile" checked={source === "profile"} disabled={!profiles.length} onChange={() => setSource("profile")} />
          {L("En stilprofil", "A style profile")}
        </label>
        {source === "profile" ? (
          <select value={profileId} data-testid="harmonize-profile" onChange={(e) => { setProfileId(e.target.value); setConfirm(false); }} className={field}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : null}
        <label className="flex items-center gap-1.5">
          <input type="radio" name="harmonize-source" data-testid="harmonize-source-reference" checked={source === "reference"} onChange={() => setSource("reference")} />
          {L("Et referansebilde", "A reference image")}
        </label>
        {source === "reference" ? (
          <select value={referenceId} data-testid="harmonize-reference" onChange={(e) => { setReferenceId(e.target.value); setConfirm(false); }} className={field}>
            <option value="">{L("Velg et bilde …", "Choose an image …")}</option>
            {references.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        ) : null}
      </fieldset>
      <p className="text-text-tertiary">
        {L(
          "Stilen dekker tegnestil, fargepalett, lyssetting, tekstur, detaljgrad og atmosfære.",
          "The style covers drawing style, colour palette, lighting, texture, level of detail and atmosphere.",
        )}
      </p>
      <p role="note" data-testid="harmonize-warning" className="rounded-sm border border-accent-warm/50 bg-surface-1 p-1.5 text-text-primary">
        {HARMONIZE_IDENTITY_WARNING()}
      </p>
      <QualityProfilePicker state={state} value={quality.choice} disabled={!!busy} onChange={(v) => { quality.setChoice(v); setConfirm(false); }} />
      <QualityProfileBudget error={quality.budgetError} />
      <ImageModelFields m={m} disabled={!!busy || !!pending} onChange={() => setConfirm(false)} />
      <PromptPreview preview={preview} />
      {pending ? (
        <div className="flex flex-col gap-1.5" data-testid="harmonize-result">
          <HarmonizeCompare original={urls.data?.[version.mediaPath]} result={urls.data?.[pending.media.path]} />
          <p className="text-text-tertiary">{harmonizeNote(profileName, pending.model)}</p>
          <div className="flex flex-wrap gap-1.5">
            {tools.onUseHere ? (
              <Button size="sm" data-testid="harmonize-use-local" onClick={() => void save("local")}>
                {L("Bruk bare her", "Use only here")}
              </Button>
            ) : null}
            <Button size="sm" variant={tools.onUseHere ? "secondary" : "default"} data-testid="harmonize-use-variant" onClick={() => void save("variant")}>
              {L("Lagre som alternativ variant", "Save as an alternative variant")}
            </Button>
            <Button size="sm" variant="ghost" data-testid="harmonize-discard" onClick={() => setPending(null)}>
              {L("Forkast", "Discard")}
            </Button>
          </div>
        </div>
      ) : saved ? (
        <div className="flex flex-col gap-1.5" data-testid="harmonize-saved">
          <p data-testid="harmonize-saved-note" className="text-text-primary">
            {saved.fields.styleProfileId
              ? L(`Laget med profil «${state.styleProfiles[saved.fields.styleProfileId]?.name ?? ""}»`, `Made with profile “${state.styleProfiles[saved.fields.styleProfileId]?.name ?? ""}”`)
              : L("Laget med et referansebilde", "Made with a reference image")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {saved.use !== "local" && saved.fields.styleProfileId ? (
              <Button size="sm" variant="secondary" data-testid="harmonize-mark-preferred" disabled={saved.use === "reference" || preferred?.variantId === saved.variantId} onClick={() => void markPreferred()}>
                <Star /> {L("Merk som foretrukket referanse", "Mark as preferred reference")}
              </Button>
            ) : null}
            {saved.use !== "local" && ws.ready && ws.workspaceId && ws.rights.publish && !asset.globalAssetId ? (
              <Button size="sm" variant="secondary" data-testid="harmonize-publish" disabled={!!busy || saved.use === "published"} onClick={() => void publish()}
                title={L("Eget, eksplisitt valg: kopierer ressursen med den nye stilvarianten til det globale biblioteket.", "A separate, explicit choice: copies the asset with the new style variant to the global library.")}>
                <Globe /> {L("Publiser globalt …", "Publish globally …")}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={onClose}>{L("Lukk", "Close")}</Button>
          </div>
        </div>
      ) : (
        <>
          <CostConfirm
            m={m}
            count={preview && !quality.budgetError ? 1 : 0}
            confirm={confirm}
            onConfirm={setConfirm}
            onRun={() => void run()}
            onClose={onClose}
            disabled={!tools.editable}
            busy={!!busy}
            emptyText={L("Velg en utfylt stilprofil eller et referansebilde.", "Choose a filled-in style profile or a reference image.")}
            confirmLabel={L("Bekreft stilharmonisering", "Confirm style harmonization")}
            icon={<Palette />}
            startLabel={L("Harmoniser …", "Harmonize …")}
          />
          <Button size="sm" variant="ghost" data-testid="harmonize-batch-open" disabled={!tools.editable || !!busy} onClick={() => setBatch(true)}>
            {L("Harmoniser flere karakterer …", "Harmonize more characters …")}
          </Button>
        </>
      )}
      {busy ? (
        <p role="status" className="flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" aria-hidden /> {busy}</p>
      ) : msg ? (
        <p role={msg.kind === "error" ? "alert" : "status"} data-testid="harmonize-message" className={msg.kind === "error" ? "text-status-danger" : "text-status-success"}>{msg.text}</p>
      ) : null}
    </div>
  );
}
