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
import {
  L,
  ASSET_KIND_LABEL,
  ASSET_KINDS,
  buildContextImageBrief,
  buildPartPrompt,
  mainProduction,
  newId,
  polygonBounds,
  tm,
  turnaroundAttachments,
  withAttachedLegend,
  type AssetKind,
  type AssetVersion,
  type PartAnchor,
  type PixelBox,
} from "@/core";
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

const field =
  "h-7 w-full rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";

const anchorLabel = (a: PartAnchor) =>
  a === "left" ? L("Venstre", "Left") : a === "center" ? L("Midt", "Centre") : L("Høyre", "Right");
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
      title={L(
        "Ankerpunktet delen dreier eller smalner rundt (for et dørblad: hengselsiden)",
        "The anchor point the part turns or narrows around (for a door leaf: the hinge side)",
      )}
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
          <Scissors /> {L("Klipp ut (gratis)", "Cut out (free)")}
        </Button>
        <Button
          role="tab"
          aria-selected={tab === "ai"}
          size="sm"
          variant={tab === "ai" ? "default" : "secondary"}
          disabled={!!busy}
          onClick={() => onTab("ai")}
        >
          <AiGlyph aria-hidden /> {L("Lag med AI …", "Make with AI …")}
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
          aria-label={L("Delene som er laget", "The parts that have been made")}
          className="flex flex-col gap-1 rounded-sm border border-border bg-surface-2 p-2"
        >
          <h4 className="font-medium text-text-primary">
            {L("Laget i denne økten", "Made in this session")}
          </h4>
          <ul className="flex flex-col gap-1">
            {made.map((p, i) => (
              <li key={p.versionId} className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-text-primary" title={p.name}>
                  {p.name}
                  {p.rest ? (
                    <span className="text-text-tertiary"> {L("(resten)", "(the rest)")}</span>
                  ) : null}
                </span>
                <AnchorSelect
                  value={p.anchor}
                  label={L(`Ankerpunkt for «${p.name}»`, `Anchor point for “${p.name}”`)}
                  onChange={(a) =>
                    setMade((cur) => cur.map((x, j) => (j === i ? { ...x, anchor: a } : x)))
                  }
                />
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
              <Layers /> {L("Legg delene i scenen", "Put the parts in the scene")}
            </Button>
          ) : null}
        </section>
      ) : null}
      <Button size="sm" variant="ghost" className="self-start" disabled={!!busy} onClick={onDone}>
        {L("Ferdig", "Done")}
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
  const fallback = L(`${asset.name} – del ${count + 1}`, `${asset.name} – part ${count + 1}`);

  async function save() {
    if (!poly) return;
    const partName = name.trim() || fallback;
    await onJob(L(`Lager delen «${partName}» …`, `Making the part “${partName}” …`), async () => {
      const src = original.current ?? (original.current = await loadImage(url));
      // Markeringen er i bildets visningsmål; filen kan ha andre mål (skaler punktene)
      const k = { x: src.w / (version.width || src.w), y: src.h / (version.height || src.h) };
      const pts = poly.map((p) => ({ x: p.x * k.x, y: p.y * k.y }));
      const b = polygonBounds(pts, src.w, src.h);
      if (!b)
        throw new Error(
          L(
            "Markeringen er for liten. Tegn en større ramme.",
            "The selection is too small. Draw a larger frame.",
          ),
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
        L(
          `Del «${partName}» klippet ut av ${asset.name} v${version.number} (${out.width} × ${out.height} px, ankerpunkt: ${anchorLabel(anchor).toLowerCase()}).`,
          `Part “${partName}” cut out of ${asset.name} v${version.number} (${out.width} × ${out.height} px, anchor point: ${anchorLabel(anchor).toLowerCase()}).`,
        ),
        L(`Del «${partName}»`, `Part “${partName}”`),
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
          L(
            `Delen «${partName}» er fjernet (gjennomsiktig) fra v${version.number}.`,
            `The part “${partName}” has been removed (transparent) from v${version.number}.`,
          ),
          L(`Fjern «${partName}» fra «${asset.name}»`, `Remove “${partName}” from “${asset.name}”`),
          group,
        );
        if ("error" in r2)
          throw new Error(
            L(
              `Delen er lagret, men den ble ikke fjernet fra originalen: ${r2.error}`,
              `The part was saved, but it was not removed from the original: ${r2.error}`,
            ),
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
        removed = L(
          " Delen er fjernet fra originalen (ny versjon).",
          " The part has been removed from the original (new version).",
        );
      }
      setName("");
      onRedraw();
      return L(
        `«${partName}» er lagret som nytt objekt.${removed} Tegn rundt neste del, eller trykk «Ferdig».`,
        `“${partName}” has been saved as a new object.${removed} Draw around the next part, or press “Done”.`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p>
        {poly
          ? L("Gi delen et navn og lagre den.", "Name the part and save it.")
          : L(
              "Tegn en fri ramme rundt delen i bildet (f.eks. dørbladet). Hold mellomrom og dra for å flytte bildet.",
              "Draw a free frame around the part in the image (e.g. the door leaf). Hold space and drag to move the image.",
            )}
      </p>
      <label className="flex flex-col gap-1">
        {L("Navn på delen", "Name of the part")}
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
          {L("Type", "Type")}
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
          {L("Ankerpunkt", "Anchor point")}
          <AnchorSelect
            value={anchor}
            onChange={setAnchor}
            label={L("Ankerpunkt for delen", "Anchor point for the part")}
          />
        </label>
      </div>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} />
        {L("Fjern delen fra originalen", "Remove the part from the original")}
      </label>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
        {L("Fjern luften rundt", "Remove the air around")}
      </label>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" disabled={!poly || !!busy} onClick={() => void save()}>
          <Scissors /> {L("Lagre delen", "Save the part")}
        </Button>
        {poly ? (
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={onRedraw}>
            {L("Tegn på nytt", "Draw again")}
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
  const examples = [L("f.eks. dørramme", "e.g. door frame"), L("f.eks. dørblad", "e.g. door leaf")];

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
          L(
            `Lager «${partName}» (${i + 1} av ${todo.length}) … (kan ta et minutt)`,
            `Making “${partName}” (${i + 1} of ${todo.length}) … (can take a minute)`,
          ),
        );
        const req = request(partName);
        if (!req)
          throw new Error(
            L("Beskrivelsen kunne ikke lages.", "The description could not be created."),
          );
        const group = newId();
        // Det nye objektet lages først (bildet lagres på det)
        const c = await createAssetWithVariant(
          tools.cmds.runAndWait,
          partName,
          kind,
          L(
            `Del av «${asset.name}» (laget med AI fra v${version.number}).`,
            `Part of “${asset.name}” (made with AI from v${version.number}).`,
          ),
          L(`Del «${partName}»`, `Part “${partName}”`),
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
              ? L(`${made} laget. ${tm(r.message)}`, `${made} made. ${tm(r.message)}`)
              : tm(r.message),
          );
        const a = await tools.cmds.runAndWait(
          {
            type: "AddAssetVersion",
            versionId: r.versionId as never,
            variantId: c.variantId as never,
            media: r.media,
            note: L(
              `AI-del «${partName}» av ${asset.name} v${version.number} (${r.model}, ankerpunkt: ${anchorLabel(row.anchor).toLowerCase()}).`,
              `AI part “${partName}” of ${asset.name} v${version.number} (${r.model}, anchor point: ${anchorLabel(row.anchor).toLowerCase()}).`,
            ).slice(0, 2000),
          },
          L(`AI-del «${partName}»`, `AI part “${partName}”`),
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
        text: L(
          `${made} ${made === 1 ? "del er lagret som nytt objekt" : "deler er lagret som nye objekter"}.`,
          `${made} ${made === 1 ? "part has been saved as a new object" : "parts have been saved as new objects"}.`,
        ),
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
        {L("Ingen bildemodeller er tilgjengelige.", "No image models are available.")}
      </p>
    );
  const working = !!busy || !!outerBusy;
  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-2">
      <p>
        {L(
          "Hver del lages som eget objekt med bildet som forbilde, i samme stil.",
          "Each part is made as its own object with the image as reference, in the same style.",
        )}
      </p>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-0.5">
          {L("Delene (navn og ankerpunkt)", "The parts (name and anchor point)")}
        </legend>
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-1">
            <input
              value={r.name}
              maxLength={200}
              disabled={working}
              aria-label={L(`Navn på del ${i + 1}`, `Name of part ${i + 1}`)}
              placeholder={examples[i] ?? L("Navn på delen", "Name of the part")}
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
              label={L(`Ankerpunkt for del ${i + 1}`, `Anchor point for part ${i + 1}`)}
              onChange={(a) =>
                setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, anchor: a } : x)))
              }
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={working || rows.length <= 1}
              aria-label={L(`Fjern del ${i + 1}`, `Remove part ${i + 1}`)}
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
          <Plus /> {L("Legg til en del", "Add a part")}
        </Button>
      </fieldset>
      <label className="flex flex-col gap-1">
        {L("Type", "Type")}
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
        {L("Send med to stilforbilder fra filmen", "Send along two style references from the film")}
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
        emptyText={L("Skriv navnet på minst én del.", "Write the name of at least one part.")}
        confirmLabel={L("Bekreft generering av deler", "Confirm generation of parts")}
        icon={<AiGlyph aria-hidden />}
        startLabel={
          names.length === 1
            ? L("Lag delen …", "Make the part …")
            : L(`Lag ${names.length} deler …`, `Make ${names.length} parts …`)
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
