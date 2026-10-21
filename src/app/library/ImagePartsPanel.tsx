/**
 * «Deler …» i stor visning (Mars 15.10.2026): «for en dør så ønsker en at en kan lage en dørramme og et
 * dørblad … ulike objekter slik at en kan animere at den åpner seg (gjør dørbladet sakte smalere, med et
 * ankerpunkt på den siden døren henger på)».
 *
 * a) Klipp ut av bildet (gratis): fri markering rundt delen → nytt objekt med navn. Valgfritt fjernes delen
 *    fra originalen (ny versjon der området er gjennomsiktig), så resten står alene. Flere deler etter
 *    hverandre i samme økt; delene klippes alltid ut av originalbildet, mens det som er fjernet samles.
 * b) Lag delene med AI: en liste med delnavn; hver del lages som eget nytt objekt med originalen som
 *    forbilde, i samme stil (samme kostnadsbekreftelse som vinkler og variasjoner).
 * c) Hver del får et ankerpunkt (venstre, midt, høyre). Delene kan legges i scenen når sceneeditoren gir
 *    `onPlaceParts`.
 *
 * Alt lagres som nye objekter og nye versjoner; originalen beholdes som før.
 */
import { Layers, Loader2, Plus, Scissors, Trash2 } from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ASSET_KIND_LABEL, ASSET_KINDS, buildContextImageBrief, buildPartPrompt, mainProduction, newId, polygonBounds, tm, turnaroundAttachments, withAttachedLegend, type AssetKind, type AssetVersion, type PartAnchor, type PixelBox } from "@/core";
import { generateImage } from "@/adapters/ai/generate-image.functions";
import { aiJobsKey } from "@/app/ai/use-ai-jobs";
import { Button } from "@/components/ui/button";
import { lostConnection } from "./GenerateImagePanel";
import { CostConfirm, ImageModelFields, PromptPreview } from "./ImageAiPanels";
import { useImageModel } from "./image-model";
import type { LightboxPart, LightboxTools } from "./ImageLightbox";
import {
  canvasToPng,
  createAssetWithVariant,
  cropCanvas,
  eraseCanvas,
  loadImage,
  saveImageTo,
  trimCanvasInfo,
  type LoadedImage,
  type Polygon,
} from "./image-actions";
import { t as tk } from "@/core/i18n/keyed";

const field =
  "h-7 w-full rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";

const anchorLabel = (a: PartAnchor) =>
  a === "left" ? tk("app-library-image-parts-panel.anchor-label.message.8a7e21853cf2") : a === "center" ? tk("app-library-image-parts-panel.anchor-label.message.fbbc8592ccc5") : tk("app-library-image-parts-panel.anchor-label.message.0ede8d3a7e62");
const ANCHORS: readonly PartAnchor[] = ["left", "center", "right"];

/** En del som er laget i denne økten. */
interface MadePart extends LightboxPart {
  readonly name: string;
  /** Resten av originalen (etter at delene er fjernet), ikke en ny del. */
  readonly rest?: boolean;
}

export type PartsTab = "cut" | "ai";

function AnchorSelect({
  value,
  onChange,
  label,
  disabled,
}: {
  value: PartAnchor;
  onChange: (a: PartAnchor) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={label}
      title={tk("app-library-image-parts-panel.anchor-select.title.c3956c0b3923")}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as PartAnchor)}
      className="h-7 w-[84px] shrink-0 rounded-sm border border-border-control bg-surface-3 px-1 text-xs text-text-primary"
    >
      {ANCHORS.map((a) => (
        <option key={a} value={a}>
          {anchorLabel(a)}
        </option>
      ))}
    </select>
  );
}

export function PartsPanel({
  tools,
  projectId,
  version,
  url,
  poly,
  tab,
  onTab,
  busy,
  onJob,
  onRedraw,
  onErased,
  onDone,
}: {
  tools: LightboxTools;
  projectId: string;
  version: AssetVersion;
  url: string;
  /** Den lukkede markeringen (bildets visningsmål), eller null. */
  poly: Polygon | null;
  tab: PartsTab;
  onTab: (t: PartsTab) => void;
  busy: string | null;
  onJob: (label: string, fn: () => Promise<string>) => Promise<void>;
  onRedraw: () => void;
  /** Områdene som er fjernet fra originalen i denne økten (bildets visningsmål), for visningen. */
  onErased: (polys: Polygon[]) => void;
  onDone: () => void;
}) {
  const [made, setMade] = useState<MadePart[]>([]);
  const [source, setSource] = useState<{ width: number; height: number } | null>(null);
  return (
    <div data-testid="parts-panel" className="flex flex-col gap-2 text-xs text-text-secondary">
      <div role="tablist" className="flex gap-1">
        <Button
          role="tab"
          aria-selected={tab === "cut"}
          size="sm"
          variant={tab === "cut" ? "default" : "secondary"}
          disabled={!!busy}
          onClick={() => onTab("cut")}
        >
          <Scissors /> {tk("app-library-image-parts-panel.parts-panel.button.16cebe721831")}
        </Button>
        <Button
          role="tab"
          aria-selected={tab === "ai"}
          size="sm"
          variant={tab === "ai" ? "default" : "secondary"}
          disabled={!!busy}
          onClick={() => onTab("ai")}
        >
          <AiGlyph aria-hidden /> {tk("app-library-image-parts-panel.parts-panel.button.535a214b79b9")}
        </Button>
      </div>
      {tab === "cut" ? (
        <CutPart
          tools={tools}
          projectId={projectId}
          version={version}
          url={url}
          poly={poly}
          busy={busy}
          onJob={onJob}
          onRedraw={onRedraw}
          onErased={onErased}
          onMade={(p, src) => {
            setSource(src);
            setMade((cur) => [...cur.filter((x) => !(p.rest && x.rest)), p]);
          }}
          count={made.filter((p) => !p.rest).length}
        />
      ) : (
        <AiParts
          tools={tools}
          projectId={projectId}
          version={version}
          busy={busy}
          onClose={onDone}
          onMade={(p) => {
            setSource({ width: version.width || 0, height: version.height || 0 });
            setMade((cur) => [...cur, p]);
          }}
        />
      )}
      {made.length ? (
        <section
          aria-label={tk("app-library-image-parts-panel.parts-panel.aria-label.7b6eaa8a888a")}
          className="flex flex-col gap-1 rounded-sm border border-border bg-surface-2 p-2"
        >
          <h4 className="font-medium text-text-primary">
            {tk("app-library-image-parts-panel.parts-panel.h4.8d8db323ee7b")}
          </h4>
          <ul className="flex flex-col gap-1">
            {made.map((p, i) => (
              <li key={p.versionId} className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-text-primary" title={p.name}>
                  {p.name}
                  {p.rest ? (
                    <span className="text-text-tertiary"> {tk("app-library-image-parts-panel.parts-panel.span.fa3dabefba12")}</span>
                  ) : null}
                </span>
                <AnchorSelect
                  value={p.anchor}
                  label={tk("app-library-image-parts-panel.parts-panel.label.20eefc113faf", { name: String(p.name) })}
                  onChange={(a) =>
                    setMade((cur) => cur.map((x, j) => (j === i ? { ...x, anchor: a } : x)))
                  }
                />
                {!p.rest && tools.onPlaceParts ? (
                  <div className="grid grid-cols-4 gap-1" data-testid="part-placement">
                    {(["x", "y", "w", "h"] as const).map((key) => (
                      <input key={key} type="number" className={field} value={p.box[key]} min={key === "w" || key === "h" ? 1 : 0}
                        aria-label={tk("app-library-image-parts-panel.parts-panel.aria-label.5b020d9ecb9c", { key: String(key), name: String(p.name) })}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (!Number.isFinite(value) || value < (key === "w" || key === "h" ? 1 : 0)) return;
                          setMade((cur) => cur.map((part, j) => j === i ? { ...part, box: { ...part.box, [key]: value } } : part));
                        }} />
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {tools.onPlaceParts ? (
            <Button
              size="sm"
              className="self-start"
              disabled={!!busy || !source}
              onClick={() =>
                source &&
                tools.onPlaceParts!(
                  made.map((p) => ({
                    assetId: p.assetId,
                    versionId: p.versionId,
                    box: p.box,
                    anchor: p.anchor,
                  })),
                  source,
                )
              }
            >
              <Layers /> {tk("app-library-image-parts-panel.parts-panel.button.45e00a7f849e")}
            </Button>
          ) : null}
        </section>
      ) : null}
      <Button size="sm" variant="ghost" className="self-start" disabled={!!busy} onClick={onDone}>
        {tk("app-library-image-parts-panel.parts-panel.button.c91ec8b00a5c")}
      </Button>
    </div>
  );
}

function CutPart({
  tools,
  projectId,
  version,
  url,
  poly,
  busy,
  onJob,
  onRedraw,
  onErased,
  onMade,
  count,
}: {
  tools: LightboxTools;
  projectId: string;
  version: AssetVersion;
  url: string;
  poly: Polygon | null;
  busy: string | null;
  onJob: (label: string, fn: () => Promise<string>) => Promise<void>;
  onRedraw: () => void;
  onErased: (polys: Polygon[]) => void;
  onMade: (p: MadePart, source: { width: number; height: number }) => void;
  count: number;
}) {
  const { asset } = tools;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AssetKind>(
    asset.kind === "location" || asset.kind === "environment" ? "object" : asset.kind,
  );
  const [anchor, setAnchor] = useState<PartAnchor>("left");
  const [remove, setRemove] = useState(true);
  const [trim, setTrim] = useState(true);
  /** Originalbildet (delene klippes alltid ut av det) og originalen med delene fjernet så langt. */
  const original = useRef<LoadedImage | null>(null);
  const rest = useRef<HTMLCanvasElement | null>(null);
  const erased = useRef<Polygon[]>([]);
  useEffect(() => {
    original.current = null;
    rest.current = null;
    erased.current = [];
  }, [version.id]);
  const fallback = tk("app-library-image-parts-panel.fallback.message.e6e273f59500", { name: String(asset.name), value2: String(count + 1) });

  async function save() {
    if (!poly) return;
    const partName = name.trim() || fallback;
    await onJob(tk("app-library-image-parts-panel.save.on-job.77ca92e970a8", { partName: String(partName) }), async () => {
      const src = original.current ?? (original.current = await loadImage(url));
      // Markeringen er i bildets visningsmål; filen kan ha andre mål (skaler punktene)
      const k = { x: src.w / (version.width || src.w), y: src.h / (version.height || src.h) };
      const pts = poly.map((p) => ({ x: p.x * k.x, y: p.y * k.y }));
      const b = polygonBounds(pts, src.w, src.h);
      if (!b)
        throw new Error(
          tk("app-library-image-parts-panel.save.on-job.63dd161fea79"),
        );
      const c = cropCanvas(src, b, pts, false);
      let out = c;
      let box: PixelBox = b;
      if (trim) {
        const t = trimCanvasInfo(c);
        if ("canvas" in t) {
          out = t.canvas;
          box = { x: b.x + t.box.x, y: b.y + t.box.y, w: t.box.w, h: t.box.h };
        }
      }
      const group = newId();
      const file = await canvasToPng(out, partName);
      const r = await saveImageTo(
        tools.cmds.runAndWait,
        tools.state,
        projectId,
        { kind: "new", name: partName, assetKind: kind },
        file,
        tk("app-library-image-parts-panel.r.save-image-to.59d8e4d1e8d1", { partName: String(partName), name: String(asset.name), number: String(version.number), width: String(out.width), height: String(out.height), value6: String(anchorLabel(anchor).toLowerCase()) }),
        tk("app-library-image-parts-panel.r.save-image-to.3e0b9773a0c5", { partName: String(partName) }),
        group,
      );
      if ("error" in r) throw new Error(r.error);
      const sourceSize = { width: src.w, height: src.h };
      onMade(
        { assetId: r.assetId, versionId: r.versionId, box, anchor, name: partName },
        sourceSize,
      );
      let removed = "";
      if (remove) {
        const base = rest.current ?? src.canvas;
        const cleared = eraseCanvas(base, pts);
        // i18n-ignore: filnavn
        const f2 = await canvasToPng(cleared, `${asset.name}-uten-${partName}`);
        const r2 = await saveImageTo(
          tools.cmds.runAndWait,
          tools.state,
          projectId,
          { kind: "existing", assetId: asset.id, variantId: version.variantId },
          f2,
          tk("app-library-image-parts-panel.r2.save-image-to.0c0b6f932690", { partName: String(partName), number: String(version.number) }),
          tk("app-library-image-parts-panel.r2.save-image-to.d859ca8ae1e3", { partName: String(partName), name: String(asset.name) }),
          group,
        );
        if ("error" in r2)
          throw new Error(
            tk("app-library-image-parts-panel.save.on-job.17dfc97bc33e", { error: String(r2.error) }),
          );
        rest.current = cleared;
        erased.current = [...erased.current, poly];
        onErased(erased.current);
        onMade(
          {
            assetId: asset.id,
            versionId: r2.versionId,
            box: { x: 0, y: 0, w: src.w, h: src.h },
            anchor: "center",
            name: asset.name,
            rest: true,
          },
          sourceSize,
        );
        removed = tk("app-library-image-parts-panel.save.on-job.d22ef40b12ca");
      }
      setName("");
      onRedraw();
      return tk("app-library-image-parts-panel.save.on-job.f8a3089c7dd3", { partName: String(partName), removed: String(removed) });
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p>
        {poly
          ? tk("app-library-image-parts-panel.cut-part.p.db31a6621cea")
          : tk("app-library-image-parts-panel.cut-part.p.b11dfd8543ff")}
      </p>
      <label className="flex flex-col gap-1">
        {tk("app-library-image-parts-panel.cut-part.label.6c5cb17f34dd")}
        <input
          value={name}
          maxLength={200}
          placeholder={fallback}
          onChange={(e) => setName(e.target.value)}
          className={field}
        />
      </label>
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          {tk("app-library-image-parts-panel.cut-part.label.cf12ea140d4c")}
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as AssetKind)}
            className={field}
          >
            {ASSET_KINDS.filter((k) => k !== "sound").map((k) => (
              <option key={k} value={k}>
                {ASSET_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {tk("app-library-image-parts-panel.cut-part.label.aa33dbe6aea3")}
          <AnchorSelect
            value={anchor}
            onChange={setAnchor}
            label={tk("app-library-image-parts-panel.cut-part.label.1fdc6934bcd5")}
          />
        </label>
      </div>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} />
        {tk("app-library-image-parts-panel.cut-part.label.d9609f6bf5f4")}
      </label>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
        {tk("app-library-image-parts-panel.cut-part.label.7dfe17c03963")}
      </label>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" disabled={!poly || !!busy} onClick={() => void save()}>
          <Scissors /> {tk("app-library-image-parts-panel.cut-part.button.04c35bc6c729")}
        </Button>
        {poly ? (
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={onRedraw}>
            {tk("app-library-image-parts-panel.cut-part.button.b012c4c76e6e")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AiParts({
  tools,
  projectId,
  version,
  busy: outerBusy,
  onClose,
  onMade,
}: {
  tools: LightboxTools;
  projectId: string;
  version: AssetVersion;
  busy: string | null;
  onClose: () => void;
  onMade: (p: MadePart) => void;
}) {
  const { state, asset } = tools;
  const m = useImageModel(projectId, tools.editable);
  const [rows, setRows] = useState<{ id: string; name: string; anchor: PartAnchor }[]>(() => [
    { id: newId(), name: "", anchor: "center" },
    { id: newId(), name: "", anchor: "left" },
  ]);
  const [kind, setKind] = useState<AssetKind>(
    asset.kind === "location" || asset.kind === "environment" ? "object" : asset.kind,
  );
  const [withStyle, setWithStyle] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const qc = useQueryClient();
  const main = mainProduction(state);
  const names = rows.map((r) => r.name.trim()).filter(Boolean);
  const examples = [tk("app-library-image-parts-panel.examples.message.3a0118fea91a"), tk("app-library-image-parts-panel.examples.message.6ef0e4c072f3")];

  function request(part: string) {
    if (!main) return null;
    // Originalen (identitet) og stilforbilder
    const attached = turnaroundAttachments(state, {
      assetId: asset.id,
      productionId: main.id,
      identityVersionId: version.id,
      style: withStyle,
    }).filter((a) => a.role !== "view");
    const brief = buildContextImageBrief(state, {
      assetId: asset.id,
      variantId: version.variantId,
      productionId: main.id,
      occurrenceId: null,
      withReference: true,
      attached,
      family: m.family,
      transparent: !!m.model?.transparent,
    });
    if (!brief) return null;
    const r = buildPartPrompt(brief, part, names, m.family);
    return {
      attached,
      prompt: withAttachedLegend(r.prompt, asset.name, attached),
      negative: r.negative,
    };
  }
  const preview = useMemo(
    () => (names.length ? request(names[0]!) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, rows, withStyle, m.key],
  );

  async function run() {
    if (!m.choice) return;
    const choice = m.choice;
    const todo = rows.filter((r) => r.name.trim());
    setConfirm(false);
    setMsg(null);
    let made = 0;
    try {
      for (const [i, row] of todo.entries()) {
        const partName = row.name.trim();
        setBusy(
          tk("app-library-image-parts-panel.run.set-busy.7bd5665bbe4c", { partName: String(partName), value2: String(i + 1), length: String(todo.length) }),
        );
        const req = request(partName);
        if (!req)
          throw new Error(
            tk("app-library-image-parts-panel.run.message.7968b741a95e"),
          );
        const group = newId();
        // Det nye objektet lages først (bildet lagres på det)
        const c = await createAssetWithVariant(
          tools.cmds.runAndWait,
          partName,
          kind,
          tk("app-library-image-parts-panel.c.create-asset-with-variant.1b90c54c7db1", { name: String(asset.name), number: String(version.number) }),
          tk("app-library-image-parts-panel.c.create-asset-with-variant.97c70aa1611e", { partName: String(partName) }),
          group,
        );
        if ("error" in c) throw new Error(c.error);
        const r = await generateImage({
          data: {
            projectId,
            assetId: c.assetId,
            prompt: req.prompt,
            referencePaths: req.attached.map((a) => a.path),
            identityFirst: true,
            purpose: "cutout",
            variantId: c.variantId,
            provider: choice.provider.id,
            model: choice.provider.id === "lovable" ? null : choice.model.id,
            size: m.size,
            ...(req.negative ? { negativePrompt: req.negative } : {}),
            approved: true,
          },
        });
        if (!r.ok)
          throw new Error(
            made
              ? tk("app-library-image-parts-panel.run.message.22265bae0d3b", { made: String(made), value2: String(tm(r.message)) })
              : tm(r.message),
          );
        const a = await tools.cmds.runAndWait(
          {
            type: "AddAssetVersion",
            versionId: r.versionId as never,
            variantId: c.variantId as never,
            media: r.media,
            note: tk("app-library-image-parts-panel.note.l-ai-del-part-name-av-asset-name-v-version-number-r-model-ankerpunkt-anchor-label-row-anchor-to-lower-case-ai-part-part-name-of-asset-name-v-version-number-r-model-anchor-point-anchor-label-row-anchor-to-lower-case-slice.8d39fbce4e2d", { partName: String(partName), name: String(asset.name), number: String(version.number), model: String(r.model), value5: String(anchorLabel(row.anchor).toLowerCase()) }).slice(0, 2000),
          },
          tk("app-library-image-parts-panel.a.tools-cmds-run-and-wait.ffafcea6273f", { partName: String(partName) }),
          group,
        );
        if (a.error) throw new Error(a.error);
        made++;
        // Hvor delen ligger i originalen er ukjent for AI-deler: hele bildet
        onMade({
          assetId: c.assetId,
          versionId: r.versionId,
          box: { x: 0, y: 0, w: version.width || 0, h: version.height || 0 },
          anchor: row.anchor,
          name: partName,
        });
        tools.onSaved?.({ versionId: r.versionId, variantId: c.variantId, assetId: c.assetId });
      }
      setMsg({
        kind: "ok",
        text: tk("app-library-image-parts-panel.parts-saved", { count: made }),
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
      <p className="text-text-tertiary">
        {tk("app-library-image-parts-panel.ai-parts.p.7c501efe403a")}
      </p>
    );
  const working = !!busy || !!outerBusy;
  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-2">
      <p>
        {tk("app-library-image-parts-panel.ai-parts.p.3f411614298e")}
      </p>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-0.5">
          {tk("app-library-image-parts-panel.ai-parts.legend.f463567ffb54")}
        </legend>
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-1">
            <input
              value={r.name}
              maxLength={200}
              disabled={working}
              aria-label={tk("app-library-image-parts-panel.ai-parts.aria-label.c55f66613905", { value1: String(i + 1) })}
              placeholder={examples[i] ?? tk("app-library-image-parts-panel.ai-parts.placeholder.89ae14dddd59")}
              onChange={(e) => {
                setConfirm(false);
                setRows((cur) =>
                  cur.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)),
                );
              }}
              className={field}
            />
            <AnchorSelect
              value={r.anchor}
              disabled={working}
              label={tk("app-library-image-parts-panel.ai-parts.label.7e8cfcde9cdf", { value1: String(i + 1) })}
              onChange={(a) =>
                setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, anchor: a } : x)))
              }
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={working || rows.length <= 1}
              aria-label={tk("app-library-image-parts-panel.ai-parts.aria-label.aa76cabca6b5", { value1: String(i + 1) })}
              onClick={() => setRows((cur) => cur.filter((x) => x.id !== r.id))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          disabled={working || rows.length >= 8}
          onClick={() => setRows((cur) => [...cur, { id: newId(), name: "", anchor: "center" }])}
        >
          <Plus /> {tk("app-library-image-parts-panel.ai-parts.button.fdada512d499")}
        </Button>
      </fieldset>
      <label className="flex flex-col gap-1">
        {tk("app-library-image-parts-panel.ai-parts.label.1493c492b2c1")}
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as AssetKind)}
          className={field}
        >
          {ASSET_KINDS.filter((k) => k !== "sound").map((k) => (
            <option key={k} value={k}>
              {ASSET_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <ImageModelFields m={m} disabled={working} onChange={() => setConfirm(false)} />
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={withStyle}
          onChange={(e) => setWithStyle(e.target.checked)}
        />
        {tk("app-library-image-parts-panel.ai-parts.label.b08b4f2da1f3")}
      </label>
      <PromptPreview preview={preview} />
      <CostConfirm
        m={m}
        count={names.length}
        confirm={confirm}
        onConfirm={setConfirm}
        onRun={() => void run()}
        onClose={onClose}
        disabled={!tools.editable}
        busy={working}
        emptyText={tk("app-library-image-parts-panel.ai-parts.empty-text.e04bb1b9cf8d")}
        confirmLabel={tk("app-library-image-parts-panel.ai-parts.confirm-label.7b67b91284f5")}
        icon={<AiGlyph aria-hidden />}
        startLabel={
          names.length === 1
            ? tk("app-library-image-parts-panel.ai-parts.start-label.d0a001e58308")
            : tk("app-library-image-parts-panel.ai-parts.start-label.e9c612ee64ba", { length: String(names.length) })
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
