/**
 * AI-verktøy i stor visning (DEC-0080):
 *
 * - Vinkelen bildet viser (front, tre kvart, side, bak, portrett, karakterark) – et merke på bildet.
 * - «Lag andre vinkler»: velg modell og hvilke vinkler; ett ark med alle vinklene (mest sammenheng, del opp
 *   etterpå) eller ett bilde per vinkel (hver nye vinkel sendes med som referanse til neste). Bildet du står
 *   i, er alltid identiteten; bilder med merket vinkel og noen stilforbilder sendes med.
 * - «Oppskaler»: SeedVR2 (skarpere, rimelig) eller Clarity (med AI-detaljer), 2× eller 4×.
 * - «Lag variasjoner» (Mars 15.10.2026): samme felt som vinkler, pluss «Hva ønsker du forskjellig?» (f.eks.
 *   «døren står åpen») og antall (1–4). Bildet er forbildet; bare det brukeren ber om endres.
 *
 * Alt som koster penger, viser anslaget og venter på «Ja» (DEC-0077: redaktører kan starte betalte jobber
 * innenfor budsjettet). Resultatene lagres som nye versjoner; originalen beholdes.
 */
import { UiId } from "@/app/shared/UiId";
import { Loader2, Rotate3d, Shuffle, ZoomIn } from "lucide-react";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { collation, IMAGE_PURPOSE_FOR_KIND, formatUsd, imageSizesOf, IMAGE_SIZE_LABEL, locale, mainProduction, tm, promptFamilyOf, providerModel, providersFor, TURNAROUND_VIEWS, VERSION_VIEW_LABEL, VERSION_VIEWS, estimateCostUsd, type AssetVersion, type ImageSize, type VersionView } from "@/core";
import { generateImage } from "@/adapters/ai/generate-image.functions";
import { aiJobsKey } from "@/app/ai/use-ai-jobs";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { Button } from "@/components/ui/button";
import { lostConnection } from "./GenerateImagePanel";
import {
  nearestAspect,
  preferredFor,
  useImageChoices,
  useImageModel,
  type ImageModelPick,
} from "./image-model";
import type { LightboxTools } from "./ImageLightbox";
import { useImagePromptPreview } from "./image-prompt-preview";
import { t } from "@/core/i18n/keyed";

const field =
  "h-7 w-full rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";

/** Vinkelmerket på bildet. */
export function ViewLabel({ tools, version }: { tools: LightboxTools; version: AssetVersion }) {
  const [err, setErr] = useState<string | null>(null);
  const cur = tools.state.assetVersions[version.id]?.view ?? null;
  return (
    <label className="flex flex-col gap-1 text-xs text-text-secondary">
      {t("app-library-image-ai-panels.view-label.label.226ae24f3dfd")}
      <select
        aria-label={t("app-library-image-ai-panels.view-label.aria-label.4f5733562a29")}
        value={cur ?? ""}
        disabled={!tools.editable}
        onChange={(e) => {
          const view = (e.target.value || null) as VersionView | null;
          setErr(
            tools.cmds.run(
              { type: "SetVersionView", versionId: version.id as never, view },
              view
                ? t("app-library-image-ai-panels.view-label.tools-cmds-run.a632e1989889", { value1: String(VERSION_VIEW_LABEL[view]) })
                : t("app-library-image-ai-panels.view-label.tools-cmds-run.ff053684ab84"),
            ),
          );
        }}
        className={field}
      >
        <option value="">{t("app-library-image-ai-panels.view-label.option.9528ce71f957")}</option>
        {VERSION_VIEWS.map((v) => (
          <option key={v} value={v}>
            {VERSION_VIEW_LABEL[v]}
          </option>
        ))}
      </select>
      {err ? (
        <span role="alert" className="text-status-danger">
          {err}
        </span>
      ) : null}
    </label>
  );
}

export function TurnaroundPanel({
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
  const choices = useImageChoices(projectId, tools.editable);
  const [pick, setPick] = useState<string | null>(null);
  const key =
    pick && choices.some((c) => c.key === pick) ? pick : preferredFor(choices.map((c) => c.key));
  const choice = choices.find((c) => c.key === key) ?? null;
  const own = state.assetVersions[version.id]?.view ?? null;
  const [mode, setMode] = useState<"sheet" | "each">("sheet");
  const [views, setViews] = useState<Set<VersionView>>(
    () =>
      new Set(
        (["front", "side", "back", "three_quarter"] as VersionView[]).filter((v) => v !== own),
      ),
  );
  const [sizePick, setSizePick] = useState<ImageSize | null>(null);
  const [withStyle, setWithStyle] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const qc = useQueryClient();
  const main = mainProduction(state);
  const ordered = TURNAROUND_VIEWS.filter((v) => views.has(v));
  // Arket: bildet du står i er med som første vinkel, så rekkefølgen og målestokken låses
  const sheetViews: VersionView[] =
    own && own !== "sheet" && !views.has(own) ? [own, ...ordered] : ordered;
  const count = mode === "sheet" ? (ordered.length ? 1 : 0) : ordered.length;
  const model = choice ? providerModel(choice.provider.id, choice.model.id) : undefined;
  const sizes = imageSizesOf(model);
  const size = sizePick && sizes.sizes.includes(sizePick) ? sizePick : sizes.standard;
  const unit =
    choice && choice.provider.id !== "lovable"
      ? estimateCostUsd(choice.provider.id, choice.model.id, size ? { size } : {})
      : null;
  const family = promptFamilyOf(choice?.provider.id ?? "lovable", choice?.model.id);

  /** B-105a: innstillingene prompten og vedleggene bygges fra på serveren. */
  function promptRequest(view: VersionView | null, extra: { versionId: string; view: VersionView }[]) {
    return {
      kind: "turnaround" as const,
      assetId: asset.id,
      versionId: version.id,
      view,
      views: [...sheetViews],
      extraViews: extra,
      style: withStyle,
      family,
      transparent: !!model?.transparent && mode !== "sheet",
    };
  }
  const preview =
    useImagePromptPreview(
      projectId,
      main && ordered.length ? promptRequest(mode === "sheet" ? null : ordered[0]!, []) : null,
      state,
    ).data ?? null;

  async function run() {
    if (!choice) return;
    setConfirm(false);
    setMsg(null);
    const made: { versionId: string; view: VersionView }[] = [];
    try {
      const jobs: (VersionView | null)[] = mode === "sheet" ? [null] : ordered;
      for (const [i, view] of jobs.entries()) {
        setBusy(
          mode === "sheet"
            ? t("app-library-image-ai-panels.run.set-busy.07b6dccfb31a")
            : t("app-library-image-ai-panels.run.set-busy.07437c0a99ae", { value1: String(VERSION_VIEW_LABEL[view!].toLocaleLowerCase(collation())), value2: String(i + 1), length: String(jobs.length) }),
        );
        if (!main)
          throw new Error(
            t("app-library-image-ai-panels.run.message.2db231af9756"),
          );
        const r = await generateImage({
          data: {
            projectId,
            assetId: asset.id,
            prompt: "",
            referencePaths: [],
            promptRequest: promptRequest(view, made),
            identityFirst: true,
            // Arket er bredt: den innebygde tjenesten lager da et liggende bilde
            purpose: mode === "sheet" ? "background" : "cutout",
            variantId: version.variantId,
            provider: choice.provider.id,
            model: choice.provider.id === "lovable" ? null : choice.model.id,
            size,
            aspect: mode === "sheet" ? "16:9" : view === "portrait" ? "1:1" : "2:3",
            approved: true,
          },
        });
        if (!r.ok)
          throw new Error(
            made.length
              ? t("app-library-image-ai-panels.run.message.f8ce4dd249c9", { length: String(made.length), value2: String(tm(r.message)) })
              : tm(r.message),
          );
        const label = view ? VERSION_VIEW_LABEL[view] : t("app-library-image-ai-panels.label.message.512ce45aaa2b");
        const group = `vinkel-${r.versionId}`;
        const a = await tools.cmds.runAndWait(
          {
            type: "AddAssetVersion",
            versionId: r.versionId as never,
            variantId: version.variantId,
            media: r.media,
            note: t("app-library-image-ai-panels.note.note.8cf8399adeab", { label: String(label), number: String(version.number), model: String(r.model) }),
          },
          t("app-library-image-ai-panels.a.tools-cmds-run-and-wait.3c713f4a9aa5", { name: String(asset.name) }),
          group,
        );
        if (a.error) throw new Error(a.error);
        const v = await tools.cmds.runAndWait(
          { type: "SetVersionView", versionId: r.versionId as never, view: view ?? "sheet" },
          t("app-library-image-ai-panels.v.tools-cmds-run-and-wait.2250f4d11d39", { label: String(label) }),
          group,
        );
        // Vinkelmerket krever migrasjon 0030; bildet er lagret uansett
        if (v.error)
          setMsg({
            kind: "error",
            text: t("app-library-image-ai-panels.text.text.51252432b44a", { error: String(v.error) }),
          });
        made.push({ versionId: r.versionId, view: view ?? "sheet" });
        tools.onSaved?.({
          versionId: r.versionId,
          variantId: version.variantId,
          assetId: asset.id,
        });
      }
      setMsg({
        kind: "ok",
        text:
          mode === "sheet"
            ? t("app-library-image-ai-panels.text.text.d697257a9d82")
            : t("app-library-image-ai-panels.text.text.512a5a405c7d", { length: String(made.length) }),
      });
    } catch (e) {
      setMsg({ kind: "error", text: lostConnection((e as Error).message) });
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    }
  }

  if (!choices.length)
    return (
      <p className="text-xs text-text-tertiary">
        {t("app-library-image-ai-panels.turnaround-panel.p.33d32bc64426")}
      </p>
    );
  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-2 text-xs text-text-secondary">
      <h4 className="flex items-center gap-1 font-medium text-text-primary">
        <Rotate3d className="size-3.5" aria-hidden /> {t("app-library-image-ai-panels.turnaround-panel.h4.2f56719bcdd4")}
      </h4>
      <label className="flex flex-col gap-1">
        {t("app-library-image-ai-panels.turnaround-panel.label.7f20f344e2d6")}
        <select
          value={key}
          onChange={(e) => {
            setPick(e.target.value);
            setConfirm(false);
          }}
          className={field}
          disabled={!!busy}
        >
          {choices.map((c) => (
            <option key={c.key} value={c.key}>
              {c.provider.name} – {c.model.label}
              {c.provider.id !== "lovable" ? ` (~${formatUsd(c.model.priceUsd)})` : ""}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-0.5">{t("app-library-image-ai-panels.turnaround-panel.legend.5ad5af1cd039")}</legend>
        <label className="flex items-start gap-1.5">
          <input type="radio" checked={mode === "sheet"} onChange={() => setMode("sheet")} />
          <span>
            {t("app-library-image-ai-panels.turnaround-panel.span.e4ba3862b912")}
            <b>{t("app-library-image-ai-panels.turnaround-panel.b.a3e1c1121472")}</b>
            {t("app-library-image-ai-panels.turnaround-panel.span.6440b580ee46")}
          </span>
        </label>
        <label className="flex items-start gap-1.5">
          <input type="radio" checked={mode === "each"} onChange={() => setMode("each")} />
          <span>
            {t("app-library-image-ai-panels.turnaround-panel.span.71b91e2c08dd")}
          </span>
        </label>
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-0.5">{t("app-library-image-ai-panels.turnaround-panel.legend.1c4c2fcb4bea")}</legend>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {TURNAROUND_VIEWS.filter((v) => v !== own).map((v) => (
            <label key={v} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={views.has(v)}
                onChange={(e) =>
                  setViews((cur) => {
                    const n = new Set(cur);
                    if (e.target.checked) n.add(v);
                    else n.delete(v);
                    return n;
                  })
                }
              />
              {VERSION_VIEW_LABEL[v]}
            </label>
          ))}
        </div>
      </fieldset>
      {sizes.sizes.length > 1 ? (
        <label className="flex flex-col gap-1">
          {t("app-library-image-ai-panels.turnaround-panel.label.350adb6bae41")}
          <select
            value={size ?? ""}
            onChange={(e) => setSizePick(e.target.value as ImageSize)}
            className={field}
          >
            {sizes.sizes.map((z) => (
              <option key={z} value={z}>
                {IMAGE_SIZE_LABEL[z]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={withStyle}
          onChange={(e) => setWithStyle(e.target.checked)}
        />
        {t("app-library-image-ai-panels.turnaround-panel.label.f41dd10576f6")}
      </label>
      {!own ? (
        <p className="text-text-tertiary">
          {t("app-library-image-ai-panels.turnaround-panel.p.c1c8707d17a2")}
        </p>
      ) : null}
      {preview ? (
        <div>
          <button
            type="button"
            onClick={() => setShowPrompt((x) => !x)}
            className="text-[11px] underline underline-offset-2 hover:text-text-primary"
          >
            {showPrompt
              ? t("app-library-image-ai-panels.turnaround-panel.button.4503ef35977b")
              : t("app-library-image-ai-panels.turnaround-panel.button.aa45b84a2f68")}{" "}
            ({preview.attached.length}{" "}
            {preview.attached.length === 1 ? t("app-library-image-ai-panels.turnaround-panel.button.a5e87c38896f") : t("app-library-image-ai-panels.turnaround-panel.button.40d3bd23c407")}{" "}
            {t("app-library-image-ai-panels.turnaround-panel.button.af3302c367bc")})
          </button>
          {showPrompt ? (
            <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-surface-3 p-1.5 font-mono text-[11px] leading-snug text-text-primary">
              {preview.prompt}
              {preview.negative ? `\n\nNEGATIVE: ${preview.negative}` : ""}
            </pre>
          ) : null}
        </div>
      ) : null}
      <p>
        {count === 0
          ? t("app-library-image-ai-panels.turnaround-panel.p.a2a2a5b8a0f8")
          : unit !== null ? t("app-library-image-ai-panels.images-estimate", { count, cost: formatUsd(unit * count) }) : t("app-library-image-ai-panels.images-credits", { count })}
      </p>
      {confirm ? (
        <div
          role="alertdialog"
          aria-label={t("app-library-image-ai-panels.turnaround-panel.aria-label.8e29c168bb08")}
          className="relative flex flex-col gap-1.5 rounded-sm border border-accent-warm/50 bg-surface-1 p-2"
        ><UiId id="V-155" />
          <p className="text-text-primary">
            {count} {count === 1 ? t("app-library-image-ai-panels.turnaround-panel.p.759ebaf60758") : t("app-library-image-ai-panels.turnaround-panel.p.06ea82e82e75")}{" "}
            {t("app-library-image-ai-panels.turnaround-panel.p.71461a3ed071")} {choice?.model.label}
            {unit !== null
              ? t("app-library-image-ai-panels.turnaround-panel.p.df169e62a747", { value1: String(formatUsd(unit * count)) })
              : ""}
            {t("app-library-image-ai-panels.turnaround-panel.p.5d69342f703b")}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void run()}>
              {t("app-library-image-ai-panels.turnaround-panel.button.08d61bf0b416")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              {t("app-library-image-ai-panels.turnaround-panel.button.e436478808c3")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            disabled={!tools.editable || count === 0 || !!busy || !choice}
            onClick={() => setConfirm(true)}
          >
            <Rotate3d />{" "}
            {count === 1
              ? t("app-library-image-ai-panels.turnaround-panel.button.a0b087dbb080")
              : t("app-library-image-ai-panels.turnaround-panel.button.bec6ac9e71ac", { count: String(count) })}
          </Button>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={onClose}>
            {t("app-library-image-ai-panels.turnaround-panel.button.8b380f08f40e")}
          </Button>
        </div>
      )}
      {busy ? (
        <p role="status" className="flex items-center gap-1.5">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> {busy}
        </p>
      ) : msg ? (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className={msg.kind === "error" ? "text-status-danger" : "text-status-success"}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}

/** Oppskaleringsmodellene blant de tilkoblede (fal.ai). */
function useUpscalers(projectId: string, enabled: boolean) {
  const available = useProjectProviders(projectId, enabled);
  return providersFor("upscale", new Set(available.data?.providers ?? [])).flatMap((o) =>
    o.models.map((m) => ({ provider: o.provider, model: m, key: `${o.provider.id}|${m.id}` })),
  );
}

export function UpscalePanel({
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
  const choices = useUpscalers(projectId, tools.editable);
  const [pick, setPick] = useState<string | null>(null);
  const key = pick && choices.some((c) => c.key === pick) ? pick : (choices[0]?.key ?? "");
  const choice = choices.find((c) => c.key === key) ?? null;
  const [factor, setFactor] = useState<2 | 4>(2);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const qc = useQueryClient();
  const w = version.width ?? 0;
  const h = version.height ?? 0;
  const mp = ((w && h ? w * h : 2048 * 2048) * factor * factor) / 1_000_000;
  const cost = choice
    ? estimateCostUsd(choice.provider.id, choice.model.id, { megapixels: mp })
    : null;
  const tooBig = w * factor > 8192 || h * factor > 8192;

  async function run() {
    if (!choice) return;
    setConfirm(false);
    setBusy(true);
    setMsg(null);
    try {
      const r = await generateImage({
        data: {
          projectId,
          assetId: tools.asset.id,
          prompt: `Upscale ${factor}× (${choice.model.label}) of ${tools.asset.name} v${version.number}.`,
          referencePaths: [version.mediaPath],
          identityFirst: true,
          purpose: "cutout",
          variantId: version.variantId,
          provider: choice.provider.id,
          model: choice.model.id,
          operation: "upscale",
          upscaleFactor: factor,
          approved: true,
        },
      });
      if (!r.ok) throw new Error(r.message);
      const group = `oppskalert-${r.versionId}`;
      const a = await tools.cmds.runAndWait(
        {
          type: "AddAssetVersion",
          versionId: r.versionId as never,
          variantId: version.variantId,
          media: r.media,
          note: t("app-library-image-ai-panels.note.note.31d1e81bd571", { factor: String(factor), number: String(version.number), model: String(r.model) }),
        },
        t("app-library-image-ai-panels.a.tools-cmds-run-and-wait.9f30ec149a3f", { name: String(tools.asset.name) }),
        group,
      );
      if (a.error) throw new Error(a.error);
      const view = tools.state.assetVersions[version.id]?.view;
      if (view)
        await tools.cmds.runAndWait(
          { type: "SetVersionView", versionId: r.versionId as never, view },
          t("app-library-image-ai-panels.run.tools-cmds-run-and-wait.3ed761d5bfd7", { value1: String(VERSION_VIEW_LABEL[view]) }),
          group,
        );
      tools.onSaved?.({
        versionId: r.versionId,
        variantId: version.variantId,
        assetId: tools.asset.id,
      });
      setMsg({
        kind: "ok",
        text: t("app-library-image-ai-panels.text.text.07247108d225", { value1: String(r.media.width ? ` (${r.media.width} × ${r.media.height} px)` : "") }),
      });
    } catch (e) {
      setMsg({ kind: "error", text: lostConnection((e as Error).message) });
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-2 text-xs text-text-secondary">
      <h4 className="flex items-center gap-1 font-medium text-text-primary">
        <ZoomIn className="size-3.5" aria-hidden /> {t("app-library-image-ai-panels.upscale-panel.h4.cd444ecd55c2")}
      </h4>
      {!choices.length ? (
        <p>
          {t("app-library-image-ai-panels.upscale-panel.p.2d7c52068ac8")}
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            {t("app-library-image-ai-panels.upscale-panel.label.02224be21eb8")}
            <select value={key} onChange={(e) => setPick(e.target.value)} className={field}>
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.model.label}
                </option>
              ))}
            </select>
          </label>
          {choice?.model.extras?.length ? (
            <p className="text-text-tertiary">{choice.model.extras.join(". ")}.</p>
          ) : null}
          <div className="flex gap-3">
            {([2, 4] as const).map((f) => (
              <label key={f} className="flex items-center gap-1.5">
                <input type="radio" checked={factor === f} onChange={() => setFactor(f)} />
                {f}×{w && h ? ` (${w * f} × ${h * f} px)` : ""}
              </label>
            ))}
          </div>
          {tooBig ? (
            <p className="text-status-uncertain">
              {t("app-library-image-ai-panels.upscale-panel.p.2131ad13909f")}
            </p>
          ) : null}
          <p>
            {t("app-library-image-ai-panels.upscale-panel.p.61797f690b0d")}{" "}
            {cost !== null ? formatUsd(cost) : t("app-library-image-ai-panels.upscale-panel.p.4f0c9f2c6cf8")} (
            {mp.toLocaleString(locale(), { maximumFractionDigits: 1 })}{" "}
            {t("app-library-image-ai-panels.upscale-panel.p.d15b327fb65c")}).{" "}
            {t("app-library-image-ai-panels.upscale-panel.p.fee21458a0a4")}
          </p>
          {confirm ? (
            <div
              role="alertdialog"
              aria-label={t("app-library-image-ai-panels.upscale-panel.aria-label.dd9477bdabe2")}
              className="relative flex flex-col gap-1.5 rounded-sm border border-accent-warm/50 bg-surface-1 p-2"
            ><UiId id="V-154" />
              <p className="text-text-primary">
                {t("app-library-image-ai-panels.upscale-panel.p.cd444ecd55c2")} {factor}× {t("app-library-image-ai-panels.upscale-panel.p.e1a8e5c99d46")} {choice?.model.label}
                {cost !== null
                  ? t("app-library-image-ai-panels.upscale-panel.p.e55848dafdf3", { value1: String(formatUsd(cost)) })
                  : ""}
                ?
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void run()}>
                  {t("app-library-image-ai-panels.upscale-panel.button.224c2028272c")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  {t("app-library-image-ai-panels.upscale-panel.button.a840b070fd19")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Button
                size="sm"
                disabled={!tools.editable || busy || !choice}
                onClick={() => setConfirm(true)}
              >
                <ZoomIn /> {t("app-library-image-ai-panels.upscale-panel.button.cb22cd70f320")}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
                {t("app-library-image-ai-panels.upscale-panel.button.7b75340334f1")}
              </Button>
            </div>
          )}
        </>
      )}
      {busy ? (
        <p role="status" className="flex items-center gap-1.5">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
          {t("app-library-image-ai-panels.upscale-panel.p.73d68d836c19")}
        </p>
      ) : msg ? (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className={msg.kind === "error" ? "text-status-danger" : "text-status-success"}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}

/** Modell og størrelse (samme felt som i «Lag andre vinkler»). */
export function ImageModelFields({
  m,
  disabled,
  onChange,
}: {
  m: ImageModelPick;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <>
      <label className="flex flex-col gap-1">
        {t("app-library-image-ai-panels.image-model-fields.label.b8c823827d12")}
        <select
          value={m.key}
          onChange={(e) => {
            m.setPick(e.target.value);
            onChange();
          }}
          className={field}
          disabled={disabled}
        >
          {m.choices.map((c) => (
            <option key={c.key} value={c.key}>
              {c.provider.name} – {c.model.label}
              {c.provider.id !== "lovable" ? ` (~${formatUsd(c.model.priceUsd)})` : ""}
            </option>
          ))}
        </select>
      </label>
      {m.sizes.sizes.length > 1 ? (
        <label className="flex flex-col gap-1">
          {t("app-library-image-ai-panels.image-model-fields.label.b68a61a9bb51")}
          <select
            value={m.size ?? ""}
            onChange={(e) => {
              m.setSizePick(e.target.value as ImageSize);
              onChange();
            }}
            className={field}
            disabled={disabled}
          >
            {m.sizes.sizes.map((z) => (
              <option key={z} value={z}>
                {IMAGE_SIZE_LABEL[z]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );
}

/** «Vis beskrivelsen som sendes» (samme som i «Lag andre vinkler»). */
export function PromptPreview({
  preview,
}: {
  preview: { prompt: string; negative: string | null; attached: readonly unknown[] } | null;
}) {
  const [show, setShow] = useState(false);
  if (!preview) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setShow((x) => !x)}
        className="text-[11px] underline underline-offset-2 hover:text-text-primary"
      >
        {show
          ? t("app-library-image-ai-panels.prompt-preview.button.77b138039c93")
          : t("app-library-image-ai-panels.prompt-preview.button.1afe0209e54f")}{" "}
        ({preview.attached.length}{" "}
        {preview.attached.length === 1 ? t("app-library-image-ai-panels.prompt-preview.button.f316e8036547") : t("app-library-image-ai-panels.prompt-preview.button.209273aef674")}{" "}
        {t("app-library-image-ai-panels.prompt-preview.button.348794d72f82")})
      </button>
      {show ? (
        <pre
          data-testid="prompt-preview"
          className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-surface-3 p-1.5 font-mono text-[11px] leading-snug text-text-primary"
        >
          {preview.prompt}
          {preview.negative ? `\n\nNEGATIVE: ${preview.negative}` : ""}
        </pre>
      ) : null}
    </div>
  );
}

/** Prislinjen og bekreftelsen før noe betales (samme mønster som «Lag andre vinkler»). */
export function CostConfirm({
  m,
  count,
  confirm,
  onConfirm,
  onRun,
  onClose,
  disabled,
  busy,
  emptyText,
  confirmLabel,
  icon,
  startLabel,
}: {
  m: ImageModelPick;
  count: number;
  confirm: boolean;
  onConfirm: (v: boolean) => void;
  onRun: () => void;
  onClose: () => void;
  disabled: boolean;
  busy: boolean;
  /** Teksten når ingenting kan lages ennå (f.eks. «Skriv hva som skal være forskjellig.»). */
  emptyText: string;
  /** Skjermlesernavnet på bekreftelsen. */
  confirmLabel: string;
  icon: React.ReactNode;
  startLabel: string;
}) {
  const unit = m.unit;
  return (
    <>
      <p>
        {count === 0
          ? emptyText
          : unit !== null ? t("app-library-image-ai-panels.images-estimate", { count, cost: formatUsd(unit * count) }) : t("app-library-image-ai-panels.images-credits", { count })}
      </p>
      {confirm ? (
        <div
          role="alertdialog"
          aria-label={confirmLabel}
          className="relative flex flex-col gap-1.5 rounded-sm border border-accent-warm/50 bg-surface-1 p-2"
        ><UiId id="V-153" />
          <p className="text-text-primary">
            {count} {count === 1 ? t("app-library-image-ai-panels.cost-confirm.p.7ff37f5fab39") : t("app-library-image-ai-panels.cost-confirm.p.86b60bd56ab8")}{" "}
            {t("app-library-image-ai-panels.cost-confirm.p.7f644122a14e")} {m.choice?.model.label}
            {unit !== null
              ? t("app-library-image-ai-panels.cost-confirm.p.c5d9188a907b", { value1: String(formatUsd(unit * count)) })
              : ""}
            {t("app-library-image-ai-panels.cost-confirm.p.f83230616852")}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={onRun}>
              {t("app-library-image-ai-panels.cost-confirm.button.ffcd9a7b3032")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onConfirm(false)}>
              {t("app-library-image-ai-panels.cost-confirm.button.eb5cf818161b")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            disabled={disabled || count === 0 || busy || !m.choice}
            onClick={() => onConfirm(true)}
          >
            {icon} {startLabel}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
            {t("app-library-image-ai-panels.cost-confirm.button.7f9610c91e00")}
          </Button>
        </div>
      )}
    </>
  );
}

/** Største antall variasjoner per gang. */
const MAX_VARIATIONS = 4;

/**
 * «Lag variasjoner» (Mars 15.10.2026): «for en dør f.eks så ønsker jeg den åpen … et felt som sier "hva
 * ønsker du forskjellig?"». Bildet du står i, er forbildet; hver variasjon lagres som ny versjon i samme
 * variant, med teksten i versjonsnotatet.
 */
export function VariationPanel({
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
  const m = useImageModel(projectId, tools.editable);
  const [change, setChange] = useState("");
  const [count, setCount] = useState(1);
  const [withStyle, setWithStyle] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const qc = useQueryClient();
  const main = mainProduction(state);
  const purpose = IMAGE_PURPOSE_FOR_KIND[asset.kind];
  const wanted = change.trim();

  /** B-105a: innstillingene for variasjon nr. `index`; prompten bygges på serveren. */
  const promptRequest = (index: number) => ({
    kind: "variation" as const,
    assetId: asset.id,
    versionId: version.id,
    change: wanted,
    index,
    count,
    style: withStyle,
    family: m.family,
    transparent: !!m.model?.transparent,
  });
  const preview = useImagePromptPreview(projectId, main ? promptRequest(0) : null, state).data ?? null;

  async function run() {
    if (!m.choice || !wanted) return;
    const choice = m.choice;
    setConfirm(false);
    setMsg(null);
    let made = 0;
    try {
      for (let i = 0; i < count; i++) {
        setBusy(
          t("app-library-image-ai-panels.run.set-busy.c5650e6c1174", { value1: String(i + 1), count: String(count) }),
        );
        if (!main)
          throw new Error(
            t("app-library-image-ai-panels.run.message.2db231af9756.2"),
          );
        const r = await generateImage({
          data: {
            projectId,
            assetId: asset.id,
            prompt: "",
            referencePaths: [],
            promptRequest: promptRequest(i),
            identityFirst: true,
            purpose,
            variantId: version.variantId,
            provider: choice.provider.id,
            model: choice.provider.id === "lovable" ? null : choice.model.id,
            size: m.size,
            aspect: nearestAspect(version.width, version.height),
            approved: true,
          },
        });
        if (!r.ok)
          throw new Error(
            made
              ? t("app-library-image-ai-panels.run.message.020200ad0736", { made: String(made), value2: String(tm(r.message)) })
              : tm(r.message),
          );
        const group = `variasjon-${r.versionId}`;
        const a = await tools.cmds.runAndWait(
          {
            type: "AddAssetVersion",
            versionId: r.versionId as never,
            variantId: version.variantId,
            media: r.media,
            note: t("app-library-image-ai-panels.note.l-variasjon-i-1-av-count-fra-v-version-number-wanted-r-model-variation-i-1-of-count-from-v-version-number-wanted-r-model-slice.a5412144dbca", { value1: String(i + 1), count: String(count), number: String(version.number), wanted: String(wanted), model: String(r.model) }).slice(0, 2000),
          },
          t("app-library-image-ai-panels.a.tools-cmds-run-and-wait.dd7b853571d6", { name: String(asset.name) }),
          group,
        );
        if (a.error) throw new Error(a.error);
        // Samme vinkel som originalen (variasjonen endrer ikke vinkelen)
        const view = state.assetVersions[version.id]?.view;
        if (view)
          await tools.cmds.runAndWait(
            { type: "SetVersionView", versionId: r.versionId as never, view },
            t("app-library-image-ai-panels.run.tools-cmds-run-and-wait.3ed761d5bfd7.2", { value1: String(VERSION_VIEW_LABEL[view]) }),
            group,
          );
        made++;
        tools.onSaved?.({
          versionId: r.versionId,
          variantId: version.variantId,
          assetId: asset.id,
        });
      }
      setMsg({
        kind: "ok",
        text: t("app-library-image-ai-panels.variations-saved", { count: made }),
      });
    } catch (e) {
      setMsg({ kind: "error", text: lostConnection((e as Error).message) });
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    }
  }

  if (!m.choices.length)
    return (
      <p className="text-xs text-text-tertiary">
        {t("app-library-image-ai-panels.variation-panel.p.fcfa59473ab2")}
      </p>
    );
  return (
    <div
      data-testid="variation-panel"
      className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-2 text-xs text-text-secondary"
    >
      <h4 className="flex items-center gap-1 font-medium text-text-primary">
        <Shuffle className="size-3.5" aria-hidden /> {t("app-library-image-ai-panels.variation-panel.h4.f5ac2c24f865")}
      </h4>
      <label className="flex flex-col gap-1">
        <span>
          {t("app-library-image-ai-panels.variation-panel.span.c8efa02f955a")}{" "}
          <span className="text-status-danger" aria-hidden>
            *
          </span>
        </span>
        <textarea
          value={change}
          required
          aria-required
          rows={2}
          maxLength={500}
          disabled={!!busy}
          placeholder={t("app-library-image-ai-panels.variation-panel.placeholder.c7ef4e7afdf2")}
          onChange={(e) => {
            setChange(e.target.value);
            setConfirm(false);
          }}
          className="min-h-[52px] w-full resize-y rounded-sm border border-border-control bg-surface-3 px-1.5 py-1 text-xs text-text-primary"
        />
      </label>
      <ImageModelFields m={m} disabled={!!busy} onChange={() => setConfirm(false)} />
      <label className="flex flex-col gap-1">
        {t("app-library-image-ai-panels.variation-panel.label.904c4b45ccac")}
        <select
          value={count}
          disabled={!!busy}
          onChange={(e) => {
            setCount(Math.max(1, Math.min(MAX_VARIATIONS, Number(e.target.value) || 1)));
            setConfirm(false);
          }}
          className="h-7 w-20 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
        >
          {Array.from({ length: MAX_VARIATIONS }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={withStyle}
          onChange={(e) => setWithStyle(e.target.checked)}
        />
        {t("app-library-image-ai-panels.variation-panel.label.b648cf98f3f9")}
      </label>
      <PromptPreview preview={preview} />
      <CostConfirm
        m={m}
        count={wanted ? count : 0}
        confirm={confirm}
        onConfirm={setConfirm}
        onRun={() => void run()}
        onClose={onClose}
        disabled={!tools.editable}
        busy={!!busy}
        emptyText={t("app-library-image-ai-panels.variation-panel.empty-text.99e79973aecb")}
        confirmLabel={t("app-library-image-ai-panels.variation-panel.confirm-label.1c2efd85a81c")}
        icon={<Shuffle />}
        startLabel={
          count === 1
            ? t("app-library-image-ai-panels.variation-panel.start-label.9fbc7d065b5d")
            : t("app-library-image-ai-panels.variation-panel.start-label.477a4bc4dd53", { count: String(count) })
        }
      />
      {busy ? (
        <p role="status" className="flex items-center gap-1.5">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> {busy}
        </p>
      ) : msg ? (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className={msg.kind === "error" ? "text-status-danger" : "text-status-success"}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
