/**
 * AI-verktøy i stor visning (DEC-0080):
 *
 * - Vinkelen bildet viser (front, tre kvart, side, bak, portrett, karakterark) – et merke på bildet.
 * - «Lag andre vinkler»: velg modell og hvilke vinkler; ett ark med alle vinklene (mest sammenheng, del opp
 *   etterpå) eller ett bilde per vinkel (hver nye vinkel sendes med som referanse til neste). Bildet du står
 *   i, er alltid identiteten; bilder med merket vinkel og noen stilforbilder sendes med.
 * - «Oppskaler»: SeedVR2 (skarpere, rimelig) eller Clarity (med AI-detaljer), 2× eller 4×.
 *
 * Alt som koster penger, viser anslaget og venter på «Ja» (DEC-0077: redaktører kan starte betalte jobber
 * innenfor budsjettet). Resultatene lagres som nye versjoner; originalen beholdes.
 */
import { Loader2, Rotate3d, ZoomIn } from "lucide-react";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  L,
  buildContextImageBrief,
  collation,
  formatUsd,
  imageSizesOf,
  IMAGE_SIZE_LABEL,
  locale,
  mainProduction,
  tm,
  promptFamilyOf,
  providerModel,
  providersFor,
  renderBrief,
  turnaroundAttachments,
  TURNAROUND_VIEWS,
  VERSION_VIEW_LABEL,
  VERSION_VIEWS,
  withAttachedLegend,
  estimateCostUsd,
  type AssetVersion,
  type ImageSize,
  type VersionView,
} from "@/core";
import { generateImage } from "@/adapters/ai/generate-image.functions";
import { aiJobsKey } from "@/app/ai/use-ai-jobs";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { Button } from "@/components/ui/button";
import { lostConnection } from "./GenerateImagePanel";
import type { LightboxTools } from "./ImageLightbox";

const field =
  "h-7 w-full rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";

/** Vinkelmerket på bildet. */
export function ViewLabel({ tools, version }: { tools: LightboxTools; version: AssetVersion }) {
  const [err, setErr] = useState<string | null>(null);
  const cur = tools.state.assetVersions[version.id]?.view ?? null;
  return (
    <label className="flex flex-col gap-1 text-xs text-text-secondary">
      {L("Bildet viser", "The image shows")}
      <select
        aria-label={L("Vinkelen bildet viser", "The angle the image shows")}
        value={cur ?? ""}
        disabled={!tools.editable}
        onChange={(e) => {
          const view = (e.target.value || null) as VersionView | null;
          setErr(
            tools.cmds.run(
              { type: "SetVersionView", versionId: version.id as never, view },
              view
                ? L(`Vinkel: ${VERSION_VIEW_LABEL[view]}`, `View: ${VERSION_VIEW_LABEL[view]}`)
                : L("Fjern vinkel", "Remove view"),
            ),
          );
        }}
        className={field}
      >
        <option value="">{L("Ikke merket", "Not marked")}</option>
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

/** Modellene som kan lage et bilde fra et forbilde (alle bildemodeller tar imot forbilder). */
function useImageChoices(projectId: string, enabled: boolean) {
  const available = useProjectProviders(projectId, enabled);
  return providersFor("image", new Set(available.data?.providers ?? [])).flatMap((o) =>
    o.models
      .filter((m) => m.acceptsImage)
      .map((m) => ({ provider: o.provider, model: m, key: `${o.provider.id}|${m.id}` })),
  );
}

/** Foretrukket modell for vinkler: Nano Banana Pro, så Seedream, så det som finnes. */
function preferredFor(keys: readonly string[]): string {
  for (const k of ["google|gemini-3-pro-image", "fal|fal-ai/bytedance/seedream/v4.5"])
    if (keys.includes(k)) return k;
  return keys[0] ?? "";
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

  /** Beskrivelse og bilder for én generering. */
  function request(view: VersionView | null, extra: { versionId: string; view: VersionView }[]) {
    if (!main) return null;
    const attached = turnaroundAttachments(state, {
      assetId: asset.id,
      productionId: main.id,
      identityVersionId: version.id,
      extraViews: extra,
      style: withStyle,
    });
    const brief = buildContextImageBrief(state, {
      assetId: asset.id,
      variantId: version.variantId,
      productionId: main.id,
      occurrenceId: null,
      withReference: true,
      attached,
      family,
      transparent: !!model?.transparent && mode !== "sheet",
      task: view ? "view" : "sheet",
      views: view ? [view] : sheetViews,
    });
    if (!brief) return null;
    const r = renderBrief(brief, family);
    return {
      attached,
      prompt: withAttachedLegend(r.prompt, asset.name, attached),
      negative: r.negative,
    };
  }
  const preview = useMemo(
    () => (ordered.length ? request(mode === "sheet" ? null : ordered[0]!, []) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, mode, views, withStyle, key],
  );

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
            ? L(
                "Lager karakterarket … (kan ta opptil et par minutter)",
                "Making the character sheet … (can take up to a few minutes)",
              )
            : L(
                `Lager ${VERSION_VIEW_LABEL[view!].toLocaleLowerCase(collation())} (${i + 1} av ${jobs.length}) …`,
                `Making ${VERSION_VIEW_LABEL[view!].toLocaleLowerCase(collation())} (${i + 1} of ${jobs.length}) …`,
              ),
        );
        const req = request(view, made);
        if (!req)
          throw new Error(
            L("Beskrivelsen kunne ikke lages.", "The description could not be created."),
          );
        const r = await generateImage({
          data: {
            projectId,
            assetId: asset.id,
            prompt: req.prompt,
            referencePaths: req.attached.map((a) => a.path),
            identityFirst: true,
            // Arket er bredt: den innebygde tjenesten lager da et liggende bilde
            purpose: mode === "sheet" ? "background" : "cutout",
            variantId: version.variantId,
            provider: choice.provider.id,
            model: choice.provider.id === "lovable" ? null : choice.model.id,
            size,
            aspect: mode === "sheet" ? "16:9" : view === "portrait" ? "1:1" : "2:3",
            ...(req.negative ? { negativePrompt: req.negative } : {}),
            approved: true,
          },
        });
        if (!r.ok)
          throw new Error(
            made.length
              ? L(`${made.length} laget. ${tm(r.message)}`, `${made.length} made. ${tm(r.message)}`)
              : tm(r.message),
          );
        const label = view ? VERSION_VIEW_LABEL[view] : L("karakterark", "character sheet");
        const group = `vinkel-${r.versionId}`;
        const a = await tools.cmds.runAndWait(
          {
            type: "AddAssetVersion",
            versionId: r.versionId as never,
            variantId: version.variantId,
            media: r.media,
            note: L(
              `Generert vinkel: ${label}, fra v${version.number} (${r.model}).`,
              `Generated angle: ${label}, from v${version.number} (${r.model}).`,
            ),
          },
          L(`AI-vinkel av «${asset.name}»`, `AI angle of “${asset.name}”`),
          group,
        );
        if (a.error) throw new Error(a.error);
        const v = await tools.cmds.runAndWait(
          { type: "SetVersionView", versionId: r.versionId as never, view: view ?? "sheet" },
          L(`Vinkel: ${label}`, `View: ${label}`),
          group,
        );
        // Vinkelmerket krever migrasjon 0030; bildet er lagret uansett
        if (v.error)
          setMsg({
            kind: "error",
            text: L(
              `Bildet er lagret, men vinkelen ble ikke merket: ${v.error}`,
              `The image was saved, but the angle was not marked: ${v.error}`,
            ),
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
            ? L(
                "Karakterarket er lagret som ny versjon. Åpne det og bruk «Del opp i ruter» for å dele vinklene.",
                "The character sheet has been saved as a new version. Open it and use “Split into grid” to split the angles.",
              )
            : L(
                `${made.length} vinkler er lagret som nye versjoner, merket med vinkel.`,
                `${made.length} angles have been saved as new versions, marked with their angle.`,
              ),
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
        {L("Ingen bildemodeller er tilgjengelige.", "No image models are available.")}
      </p>
    );
  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-2 text-xs text-text-secondary">
      <h4 className="flex items-center gap-1 font-medium text-text-primary">
        <Rotate3d className="size-3.5" aria-hidden /> {L("Lag andre vinkler", "Make other angles")}
      </h4>
      <label className="flex flex-col gap-1">
        {L("Modell", "Model")}
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
        <legend className="mb-0.5">{L("Slik", "How")}</legend>
        <label className="flex items-start gap-1.5">
          <input type="radio" checked={mode === "sheet"} onChange={() => setMode("sheet")} />
          <span>
            {L(
              "Ett ark med alle vinklene side om side – ",
              "One sheet with all the angles side by side – ",
            )}
            <b>{L("mest sammenheng", "most coherence")}</b>
            {L(
              ", del opp med «Del opp i ruter» etterpå",
              ", split it into grid cells afterwards with “Split into grid”",
            )}
          </span>
        </label>
        <label className="flex items-start gap-1.5">
          <input type="radio" checked={mode === "each"} onChange={() => setMode("each")} />
          <span>
            {L(
              "Ett bilde per vinkel – høyere oppløsning; hver ny vinkel sendes med til neste",
              "One image per angle – higher resolution; each new angle is sent along to the next",
            )}
          </span>
        </label>
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-0.5">{L("Vinkler", "Angles")}</legend>
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
          {L("Størrelse", "Size")}
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
        {L("Send med to stilforbilder fra filmen", "Send along two style references from the film")}
      </label>
      {!own ? (
        <p className="text-text-tertiary">
          {L(
            "Tips: merk først hvilken vinkel dette bildet viser (over), så vet modellen hva den har å gå ut fra.",
            "Tip: first mark which angle this image shows (above), so the model knows what it has to work from.",
          )}
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
              ? L("Skjul beskrivelsen", "Hide the description")
              : L("Vis beskrivelsen som sendes", "Show the description being sent")}{" "}
            ({preview.attached.length}{" "}
            {preview.attached.length === 1 ? L("bilde", "image") : L("bilder", "images")}{" "}
            {L("med", "attached")})
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
          ? L("Velg minst én vinkel.", "Choose at least one angle.")
          : L(
              `${count} ${count === 1 ? "bilde" : "bilder"}${
                unit !== null
                  ? ` · anslått ${formatUsd(unit * count)}`
                  : " · bruker Lovable-kreditter"
              }. Teller i prosjektets AI-budsjett.`,
              `${count} ${count === 1 ? "image" : "images"}${
                unit !== null
                  ? ` · estimated ${formatUsd(unit * count)}`
                  : " · uses Lovable credits"
              }. Counts towards the project's AI budget.`,
            )}
      </p>
      {confirm ? (
        <div
          role="alertdialog"
          aria-label={L("Bekreft generering av vinkler", "Confirm generation of angles")}
          className="flex flex-col gap-1.5 rounded-sm border border-accent-warm/50 bg-surface-1 p-2"
        >
          <p className="text-text-primary">
            {count} {count === 1 ? L("generering", "generation") : L("genereringer", "generations")}{" "}
            {L("med", "with")} {choice?.model.label}
            {unit !== null
              ? L(`, anslått ${formatUsd(unit * count)}`, `, estimated ${formatUsd(unit * count)}`)
              : ""}
            {L(". Vil du fortsette?", ". Do you want to continue?")}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void run()}>
              {L("Ja, generer", "Yes, generate")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              {L("Avbryt", "Cancel")}
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
              ? L("Lag bildet …", "Make the image …")
              : L(`Lag ${count} bilder …`, `Make ${count} images …`)}
          </Button>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={onClose}>
            {L("Lukk", "Close")}
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
          note: L(
            `Oppskalert ${factor}× fra v${version.number} (${r.model}).`,
            `Upscaled ${factor}× from v${version.number} (${r.model}).`,
          ),
        },
        L(`Oppskaler «${tools.asset.name}»`, `Upscale “${tools.asset.name}”`),
        group,
      );
      if (a.error) throw new Error(a.error);
      const view = tools.state.assetVersions[version.id]?.view;
      if (view)
        await tools.cmds.runAndWait(
          { type: "SetVersionView", versionId: r.versionId as never, view },
          L(`Vinkel: ${VERSION_VIEW_LABEL[view]}`, `View: ${VERSION_VIEW_LABEL[view]}`),
          group,
        );
      tools.onSaved?.({
        versionId: r.versionId,
        variantId: version.variantId,
        assetId: tools.asset.id,
      });
      setMsg({
        kind: "ok",
        text: L(
          `Lagret som ny versjon${r.media.width ? ` (${r.media.width} × ${r.media.height} px)` : ""}. Godkjenn den i biblioteket, eller velg den på laget.`,
          `Saved as a new version${r.media.width ? ` (${r.media.width} × ${r.media.height} px)` : ""}. Approve it in the library, or choose it for the layer.`,
        ),
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
        <ZoomIn className="size-3.5" aria-hidden /> {L("Oppskaler", "Upscale")}
      </h4>
      {!choices.length ? (
        <p>
          {L(
            "Oppskalering bruker fal.ai. Koble til fal.ai under «AI-leverandører» på prosjektlisten (eieren gjør det), så blir valget tilgjengelig her.",
            "Upscaling uses fal.ai. Connect fal.ai under “AI providers” on the project list (the owner does this), and the option will be available here.",
          )}
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            {L("Modell", "Model")}
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
              {L(
                "Resultatet blir svært stort. Velg 2×, eller frilegg og fjern luften rundt først.",
                "The result will be very large. Choose 2×, or cut out the subject and remove the surrounding space first.",
              )}
            </p>
          ) : null}
          <p>
            {L("Anslått", "Estimated")}{" "}
            {cost !== null ? formatUsd(cost) : L("ukjent pris", "unknown price")} (
            {mp.toLocaleString(locale(), { maximumFractionDigits: 1 })}{" "}
            {L("megapiksler", "megapixels")}).{" "}
            {L("Teller i prosjektets AI-budsjett.", "Counts towards the project's AI budget.")}
          </p>
          {confirm ? (
            <div
              role="alertdialog"
              aria-label={L("Bekreft oppskalering", "Confirm upscaling")}
              className="flex flex-col gap-1.5 rounded-sm border border-accent-warm/50 bg-surface-1 p-2"
            >
              <p className="text-text-primary">
                {L("Oppskaler", "Upscale")} {factor}× {L("med", "with")} {choice?.model.label}
                {cost !== null
                  ? L(`, anslått ${formatUsd(cost)}`, `, estimated ${formatUsd(cost)}`)
                  : ""}
                ?
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void run()}>
                  {L("Ja, oppskaler", "Yes, upscale")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  {L("Avbryt", "Cancel")}
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
                <ZoomIn /> {L("Oppskaler …", "Upscale …")}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
                {L("Lukk", "Close")}
              </Button>
            </div>
          )}
        </>
      )}
      {busy ? (
        <p role="status" className="flex items-center gap-1.5">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
          {L("Oppskalerer … (kan ta et minutt)", "Upscaling … (can take a minute)")}
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
