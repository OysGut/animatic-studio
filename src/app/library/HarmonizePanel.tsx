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
import { tm, harmonizeNote, harmonizedVariantName, harmonizationOf, HARMONIZE_IDENTITY_WARNING, newId, preferredStyleReference, profileChoice, qualityProfileSnapshot, type AssetMedia, type AssetVersion, type HarmonizationUse, type StyleHarmonizationFields } from "@/core";
import { generateImage } from "@/adapters/ai/generate-image.functions";
import { publishVersionToGlobal, saveAssetToGlobal, setGlobalVersionWithdrawn } from "@/adapters/global/global-library.functions";
import { registerHistoryEffect } from "@/app/project/use-commands";
import { aiJobsKey } from "@/app/ai/use-ai-jobs";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { QualityProfileBudget, QualityProfilePicker, useQualityProfile } from "@/app/ai/QualityProfilePicker";
import { useProjectWorkspace } from "@/app/global/use-global";
import { Button } from "@/components/ui/button";
import { lostConnection } from "./GenerateImagePanel";
import { CostConfirm, ImageModelFields, PromptPreview } from "./ImageAiPanels";
import { HarmonizeCompare } from "./HarmonizeCompare";
import { HarmonizeBatchPanel } from "./HarmonizeBatchPanel";
import { useImagePromptPreview } from "./image-prompt-preview";
import { useImageModel } from "./image-model";
import { useImageUrls } from "./asset-images";
import type { LightboxTools } from "./ImageLightbox";
import { t } from "@/core/i18n/keyed";

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
  // B-105a: prompten bygges på serveren; her vises bare forhåndsvisningen
  const promptRequest = { kind: "harmonize" as const, ...input };
  const preview = useImagePromptPreview(projectId, promptRequest, state).data ?? null;
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
    setBusy(t("app-library-harmonize-panel.run.set-busy.aa330672b739"));
    try {
      const qp = quality.profile ? qualityProfileSnapshot(quality.profile) : null;
      const r = await generateImage({
        data: {
          projectId,
          assetId: asset.id,
          prompt: "",
          referencePaths: [],
          promptRequest,
          identityFirst: true,
          purpose: "cutout",
          variantId: null,
          provider: choice.provider.id,
          model: choice.model.id,
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
          fields: { name: use === "local" ? `${harmonizedVariantName(name)} (${t("app-library-harmonize-panel.name.harmonized-variant-name-name-l-lokal-local-slice.65c96b9590dd")})`.slice(0, 80) : harmonizedVariantName(name), style: "other", appearance: "" },
          ...(use === "local" ? { archived: true } : {}),
        },
      },
      t("app-library-harmonize-panel.r.tools-cmds-run-and-wait.ab928293f84b", { name: String(asset.name) }),
    );
    if (r.error) {
      setMsg({ kind: "error", text: r.error });
      return;
    }
    setSaved({ harmonizationId, versionId: pending.versionId, variantId, use, fields });
    setPending(null);
    if (use === "local") {
      tools.onUseHere?.(pending.versionId);
      setMsg({ kind: "ok", text: t("app-library-harmonize-panel.text.text.1025fec05fa8") });
    } else {
      tools.onSaved?.({ versionId: pending.versionId, variantId, assetId: asset.id });
      setMsg({ kind: "ok", text: t("app-library-harmonize-panel.text.text.4830628cecf6") });
    }
  }

  async function markPreferred() {
    if (!saved || !saved.fields.styleProfileId) return;
    const group = `pref-${saved.harmonizationId}`;
    const a = await tools.cmds.runAndWait(
      { type: "SetPreferredStyleReference", referenceId: newId<"command">(), fields: { assetId: asset.id, styleProfileId: saved.fields.styleProfileId, variantId: saved.variantId } },
      t("app-library-harmonize-panel.a.tools-cmds-run-and-wait.43eafb111d6b"),
      group,
    );
    if (a.error) return setMsg({ kind: "error", text: a.error });
    await tools.cmds.runAndWait(
      { type: "SetStyleHarmonization", harmonizationId: saved.harmonizationId, fields: { ...saved.fields, use: "reference" } },
      t("app-library-harmonize-panel.mark-preferred.tools-cmds-run-and-wait.ba0436a052af"),
      group,
    );
    setSaved({ ...saved, use: "reference", fields: { ...saved.fields, use: "reference" } });
    setMsg({ kind: "ok", text: t("app-library-harmonize-panel.text.text.84c4ec175809") });
  }

  async function publish() {
    if (!saved || !ws.workspaceId) return;
    setBusy(t("app-library-harmonize-panel.publish.set-busy.4c7f80318bb2"));
    try {
      if (asset.globalAssetId) {
        // R3: ressursen er allerede global – ny global versjon (eller variant) på den, ikke en ny ressurs.
        // «Angre» trekker versjonen tilbake globalt; «gjør om» publiserer den igjen.
        const r = await publishVersionToGlobal({ data: { projectId, versionId: saved.versionId, workspaceId: ws.workspaceId } });
        const group = `r3-publish-${r.globalVersionId}`;
        const effect = (withdrawn: boolean) => async () => {
          try { await setGlobalVersionWithdrawn({ data: { versionId: r.globalVersionId, withdrawn } }); return null; }
          catch (e) { return tm((e as Error).message); }
        };
        registerHistoryEffect(group, { undo: effect(true), redo: effect(false) });
        const a = await tools.cmds.runAndWait(
          { type: "SetStyleHarmonization", harmonizationId: saved.harmonizationId, fields: { ...saved.fields, use: "published" } },
          t("r3-global.undo-label", { number: r.number }),
          group,
        );
        // Lagres ikke markeringen, trekkes versjonen tilbake igjen, så ingen publisering står uten angring
        if (a.error) { await effect(true)(); return setMsg({ kind: "error", text: a.error }); }
        setSaved({ ...saved, use: "published", fields: { ...saved.fields, use: "published" } });
        setMsg({ kind: "ok", text: r.newVariant ? t("r3-global.published-variant", { number: r.number }) : t("r3-global.published-version", { number: r.number }) });
        return;
      }
      await saveAssetToGlobal({ data: { projectId, assetId: asset.id, workspaceId: ws.workspaceId } });
      await tools.cmds.runAndWait(
        { type: "SetStyleHarmonization", harmonizationId: saved.harmonizationId, fields: { ...saved.fields, use: "published" } },
        t("app-library-harmonize-panel.publish.tools-cmds-run-and-wait.429acd6298d5"),
      );
      setSaved({ ...saved, use: "published", fields: { ...saved.fields, use: "published" } });
      setMsg({ kind: "ok", text: t("app-library-harmonize-panel.text.text.86977fd83b0a") });
    } catch (e) {
      setMsg({ kind: "error", text: tm((e as Error).message) });
    } finally {
      setBusy(null);
    }
  }

  if (batch)
    return <HarmonizeBatchPanel tools={tools} projectId={projectId} styleProfileId={input.styleProfileId} referenceVersionId={input.referenceVersionId} m={m} quality={quality} onClose={() => setBatch(false)} />;
  if (!m.choices.length)
    return <p className="text-xs text-text-tertiary">{t("app-library-harmonize-panel.harmonize-panel.p.09c4a0937d84")}</p>;
  const preferred = input.styleProfileId ? preferredStyleReference(state, asset.id, input.styleProfileId) : null;
  return (
    <div data-testid="harmonize-panel" className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-2 text-xs text-text-secondary">
      <h4 className="flex items-center gap-1 font-medium text-text-primary">
        <Palette className="size-3.5" aria-hidden /> {t("app-library-harmonize-panel.harmonize-panel.h4.967a9a7f7af8")}
      </h4>
      {existing ? (
        <p data-testid="harmonize-made-with" className="text-text-tertiary">
          {existingProfile
            ? t("app-library-harmonize-panel.harmonize-panel.p.0bd79de7c469", { existingProfile: String(existingProfile) })
            : t("app-library-harmonize-panel.harmonize-panel.p.8b7ee42013fb")}{" "}
          ({existing.model})
        </p>
      ) : null}
      <fieldset className="flex flex-col gap-1" disabled={!!busy || !!pending}>
        <legend className="mb-1">{t("app-library-harmonize-panel.harmonize-panel.legend.8b7983bbabf5")}</legend>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="harmonize-source" data-testid="harmonize-source-profile" checked={source === "profile"} disabled={!profiles.length} onChange={() => setSource("profile")} />
          {t("app-library-harmonize-panel.harmonize-panel.label.93f13fb1082a")}
        </label>
        {source === "profile" ? (
          <select value={profileId} data-testid="harmonize-profile" onChange={(e) => { setProfileId(e.target.value); setConfirm(false); }} className={field}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : null}
        <label className="flex items-center gap-1.5">
          <input type="radio" name="harmonize-source" data-testid="harmonize-source-reference" checked={source === "reference"} onChange={() => setSource("reference")} />
          {t("app-library-harmonize-panel.harmonize-panel.label.363fe64c14e1")}
        </label>
        {source === "reference" ? (
          <select value={referenceId} data-testid="harmonize-reference" onChange={(e) => { setReferenceId(e.target.value); setConfirm(false); }} className={field}>
            <option value="">{t("app-library-harmonize-panel.harmonize-panel.option.0616f2fa3a27")}</option>
            {references.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        ) : null}
      </fieldset>
      <p className="text-text-tertiary">
        {t("app-library-harmonize-panel.harmonize-panel.p.fb1bf62ba729")}
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
                {t("app-library-harmonize-panel.harmonize-panel.button.37fd31700a6c")}
              </Button>
            ) : null}
            <Button size="sm" variant={tools.onUseHere ? "secondary" : "default"} data-testid="harmonize-use-variant" onClick={() => void save("variant")}>
              {t("app-library-harmonize-panel.harmonize-panel.button.a0e39b3fd5fc")}
            </Button>
            <Button size="sm" variant="ghost" data-testid="harmonize-discard" onClick={() => setPending(null)}>
              {t("app-library-harmonize-panel.harmonize-panel.button.efb8f570a7b8")}
            </Button>
          </div>
        </div>
      ) : saved ? (
        <div className="flex flex-col gap-1.5" data-testid="harmonize-saved">
          <p data-testid="harmonize-saved-note" className="text-text-primary">
            {saved.fields.styleProfileId
              ? t("app-library-harmonize-panel.harmonize-panel.p.543ff15a6522", { value1: String(state.styleProfiles[saved.fields.styleProfileId]?.name ?? "") })
              : t("app-library-harmonize-panel.harmonize-panel.p.8b7ee42013fb.2")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {saved.use !== "local" && saved.fields.styleProfileId ? (
              <Button size="sm" variant="secondary" data-testid="harmonize-mark-preferred" disabled={saved.use === "reference" || preferred?.variantId === saved.variantId} onClick={() => void markPreferred()}>
                <Star /> {t("app-library-harmonize-panel.harmonize-panel.button.b25d79029c66")}
              </Button>
            ) : null}
            {saved.use !== "local" && ws.ready && ws.workspaceId && ws.rights.publish ? (
              <Button size="sm" variant="secondary" data-testid="harmonize-publish" disabled={!!busy || saved.use === "published"} onClick={() => void publish()}
                title={asset.globalAssetId ? t("r3-global.publish-title") : t("app-library-harmonize-panel.harmonize-panel.title.adfe35737267")}>
                <Globe /> {t("app-library-harmonize-panel.harmonize-panel.button.e7c31b69ff7a")}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={onClose}>{t("app-library-harmonize-panel.harmonize-panel.button.5ea1153a88ba")}</Button>
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
            emptyText={t("app-library-harmonize-panel.harmonize-panel.empty-text.019188dd067d")}
            confirmLabel={t("app-library-harmonize-panel.harmonize-panel.confirm-label.48f33bc9a77a")}
            icon={<Palette />}
            startLabel={t("app-library-harmonize-panel.harmonize-panel.start-label.81dee04b3a38")}
          />
          <Button size="sm" variant="ghost" data-testid="harmonize-batch-open" disabled={!tools.editable || !!busy} onClick={() => setBatch(true)}>
            {t("app-library-harmonize-panel.harmonize-panel.button.c45b65e4926e")}
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
