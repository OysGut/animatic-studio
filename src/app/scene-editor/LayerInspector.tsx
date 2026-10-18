/**
 * Egenskaper for valgt lag (plassering, dybde, bilde, synlighet) og for selve 2D-scenen når ingen lag er valgt.
 * Hver endring er én kommando som kan angres. UpdateLayers erstatter alle felter, så vi bygger alltid fra laget.
 */
import { LayerEvents } from "./LayerEvents";
import { LayerSwaps } from "./LayerSwaps";
import { LayerMotion } from "./LayerMotion";
import { LayerMaskSection } from "./LayerMaskSection";
import {
  AlertTriangle,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Image as ImageIcon,
  Ratio,
  Trash2,
  ZoomIn,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  ErrorText,
  Field,
  Hint,
  KeyMarker,
  NumberField,
  Section,
  TextField,
  inputClass,
} from "./inspector-fields";
import {
  L,
  COMPOSITION_FORMATS,
  DEFAULT_PARALLAX,
  LAYER_KINDS,
  LAYER_KIND_LABEL,
  keyBetween,
  fieldsWithTransformAt,
  isAnimated,
  layersOf,
  newId,
  removeKeyframesAt,
  setKeyframe,
  transformAt,
  normalizeColor,
  variantsOf,
  versionsOf,
  type Command,
  type Composition,
  type CompositionFields,
  type TransformProperty,
  type CompositionLayer,
  type LayerFields,
  type LayerKind,
  type LayerTransform,
  type ProjectState,
  assetWorklist,
  layerContinuity,
  mainProduction,
  newVersionWorkItemCommands,
  outdatedLayers,
} from "@/core";
import {
  FLIP_MODE_LABEL,
  MAGNIFICATION_WARN,
  aspectResetScale,
  flippedKeyframesFrom,
  flippedTransformPatch,
  fpsToNumber,
  isSquished,
  layerFieldsOf,
  maxLayerMagnification,
  regroupFields,
  translatePath,
  type FlipMode,
} from "@/core";
import { removeLayer } from "./layer-actions";
import { Button } from "@/components/ui/button";

type Run = (command: Command, label: string, group?: string) => string | null;

/** Alle redigerbare felter på et lag (grunnlaget for UpdateLayers). */
const fieldsOf = layerFieldsOf;

function compositionFieldsOf(c: Composition): CompositionFields {
  return {
    name: c.name,
    width: c.width,
    height: c.height,
    durationFrames: c.durationFrames,
    background: c.background,
  };
}

/** Fargevelger og hex-felt. Fargen lagres når du er ferdig med velgeren eller forlater hex-feltet. */
function ColorField({
  label,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  value: string;
  onCommit: (hex: string) => void;
  disabled: boolean;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [hex, setHex] = useState<string | null>(null);
  const hexCancelled = useRef(false);
  function commitHex(text: string) {
    const c = normalizeColor(text);
    if (c && c !== normalizeColor(value)) onCommit(c);
  }
  return (
    <div className="flex flex-col gap-1 text-xs text-text-secondary">
      <span id={`color-${label}`}>{label}</span>
      <div className="flex items-center gap-2" role="group" aria-labelledby={`color-${label}`}>
        <input
          type="color"
          aria-label={`${label} ${L("(fargevelger)", "(colour picker)")}`}
          value={pick ?? normalizeColor(value) ?? "#000000"}
          disabled={disabled}
          onChange={(e) => setPick(e.target.value)}
          onBlur={() => {
            if (pick !== null) commitHex(pick);
            setPick(null);
          }}
          className="h-7 w-9 shrink-0 cursor-pointer rounded-sm border border-border-control bg-surface-3 p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <input
          type="text"
          aria-label={`${label} (hex)`}
          value={hex ?? pick ?? value}
          disabled={disabled}
          maxLength={7}
          spellCheck={false}
          onFocus={() => setHex(value)}
          onChange={(e) => setHex(e.target.value)}
          onBlur={() => {
            if (hex !== null && !hexCancelled.current) commitHex(hex);
            hexCancelled.current = false;
            setHex(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              hexCancelled.current = true;
              setHex(null);
              e.currentTarget.blur();
            }
          }}
          className={inputClass + " font-mono"}
        />
      </div>
    </div>
  );
}

// ---------- Lag ----------

export function LayerInspector({
  state,
  composition,
  layer,
  editable,
  run,
  frame,
  autoKey,
  onOpenImage,
  onSeek,
  onUpscale,
  durationFrames,
  drawingPath = false,
  onDrawingPathChange,
}: {
  state: ProjectState;
  composition: Composition;
  layer: CompositionLayer;
  durationFrames: number;
  /** Tegnes en bevegelsesbane i scenen nå (DEC-0052)? */
  drawingPath?: boolean;
  onDrawingPathChange?: (on: boolean) => void;
  editable: boolean;
  run: Run;
  frame: number;
  autoKey: boolean;
  /** Åpne bildevalget for laget (samme som dobbeltklikk, DEC-0044). */
  onOpenImage?: () => void;
  /** Flytt avspillingshodet (hendelser i manuset). */
  onSeek?: (frame: number) => void;
  /** Oppskaler bildet laget viser (advarselen om forstørrelse over 1:1). Utelatt: ingen knapp. */
  onUpscale?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const off = !editable;
  /** Hvordan «Speilvend» virker: hele laget, eller fra avspillingshodet (glidende eller brått). */
  const [flipMode, setFlipMode] = useState<FlipMode>("whole");
  // Forstørrelse over 1:1 (Mars 2026-10-13): bildet tegnes større enn sine egne piksler og blir uskarpt
  const magnification = useMemo(
    () => maxLayerMagnification(state, composition.id, layer.id, frame),
    [state, composition.id, layer.id, frame],
  );

  function flip(axis: "x" | "y") {
    const what = axis === "x" ? L("vannrett", "horizontally") : L("loddrett", "vertically");
    if (flipMode !== "whole") {
      // Et halvt sekund når laget ikke har nøkkelbilder før avspillingshodet
      const span = Math.round(fpsToNumber(state.project.fps) / 2);
      const keys = flippedKeyframesFrom(layer, axis, frame, flipMode, span);
      if (keys) {
        apply(
          L(`Speilvend ${what} fra bilde ${frame + 1}`, `Flip ${what} from frame ${frame + 1}`),
          {
            keyframes: keys,
          },
        );
        return;
      }
    }
    apply(L(`Speilvend ${what}`, `Flip ${what}`), flippedTransformPatch(layer, axis));
  }

  function apply(label: string, patch: Partial<LayerFields>) {
    setError(
      run(
        {
          type: "UpdateLayers",
          layers: [{ layerId: layer.id, fields: { ...fieldsOf(layer), ...patch } }],
        },
        label,
      ),
    );
  }
  /** Verdiene på gjeldende bilde (animerte egenskaper følger nøkkelbildene). */
  const t = transformAt(layer, frame);
  const setT = (label: string, patch: Partial<LayerTransform>) => {
    // Lag med bevegelsesbane: X/Y flytter hele banen (posisjonen ellers følger banen, DEC-0052)
    if (layer.path && (patch.x !== undefined || patch.y !== undefined)) {
      const dx = (patch.x ?? t.x) - t.x;
      const dy = (patch.y ?? t.y) - t.y;
      apply(label, { path: translatePath(layer.path, dx, dy) });
      return;
    }
    setError(
      run(
        {
          type: "UpdateLayers",
          layers: [
            {
              layerId: layer.id,
              fields: fieldsWithTransformAt(
                layer,
                fieldsOf(layer),
                frame,
                { ...t, ...patch },
                { autoKey },
              ),
            },
          ],
        },
        label,
      ),
    );
  };

  /** Setter eller fjerner nøkkelbildet for én egenskap på gjeldende bilde. */
  function toggleKey(property: TransformProperty) {
    const has = layer.keyframes.some((k) => k.property === property && k.frame === frame);
    const keyframes = has
      ? removeKeyframesAt(layer.keyframes, frame, [property])
      : setKeyframe(layer.keyframes, property, frame, t[property]);
    apply(has ? L("Fjern nøkkelbilde", "Remove keyframe") : L("Sett nøkkelbilde", "Set keyframe"), {
      keyframes,
    });
  }
  const marker = (property: TransformProperty, label: string) => (
    <KeyMarker
      label={label}
      animated={isAnimated(layer, property)}
      keyed={layer.keyframes.some((k) => k.property === property && k.frame === frame)}
      disabled={off}
      onToggle={() => toggleKey(property)}
    />
  );

  function changeKind(kind: LayerKind) {
    if (kind === layer.kind) return;
    // Parallaksen følger lagtypen bare hvis den fortsatt har standardverdien for den gamle typen
    const patch: Partial<LayerFields> =
      layer.parallax === DEFAULT_PARALLAX[layer.kind]
        ? { kind, parallax: DEFAULT_PARALLAX[kind] }
        : { kind };
    apply(L("Endre lagtype", "Change layer type"), patch);
  }

  function duplicate() {
    // Også slettede lag har plass i rekkefølgen (de kan hentes tilbake med angre)
    const ordered = layersOf(state, composition.id, { includeRemoved: true });
    const i = ordered.findIndex((l) => l.id === layer.id);
    const next = i >= 0 ? ordered[i + 1] : undefined;
    const f = fieldsOf(layer);
    const layerId = newId<"composition_layer">();
    let orderKey: string | undefined;
    try {
      orderKey = keyBetween(layer.orderKey, next?.orderKey ?? null);
    } catch {
      orderKey = undefined; // faller tilbake til øverst
    }
    setError(
      run(
        {
          type: "AddLayers",
          layers: [
            {
              layerId,
              compositionId: composition.id,
              ...(orderKey !== undefined ? { orderKey } : {}),
              fields: {
                ...f,
                name: L(`${f.name} (kopi)`, `${f.name} (copy)`).slice(0, 200),
                transform: { ...f.transform, x: f.transform.x + 40, y: f.transform.y + 40 },
                // Animert posisjon flyttes også, ellers havner kopien oppå originalen
                keyframes: f.keyframes.map((k) =>
                  k.property === "x" || k.property === "y" ? { ...k, value: k.value + 40 } : k,
                ),
                path: f.path ? translatePath(f.path, 40, 40) : null,
              },
            },
          ],
        },
        L(`Dupliser lag «${layer.name}»`, `Duplicate layer “${layer.name}”`),
      ),
    );
  }

  function remove() {
    setError(
      removeLayer(
        run,
        state,
        layer,
        frame,
        L(`Slett lag «${layer.name}»`, `Delete layer “${layer.name}”`),
      ),
    );
  }

  const asset = layer.assetId ? state.assets[layer.assetId] : undefined;
  const variants = layer.assetId
    ? variantsOf(state, layer.assetId).filter((v) => !v.archived || v.id === layer.assetVariantId)
    : [];
  const versions = layer.assetVariantId ? versionsOf(state, layer.assetVariantId) : [];
  const approvedId = layer.assetVariantId
    ? (state.assetVariants[layer.assetVariantId]?.approvedVersionId ?? null)
    : null;
  // Kontinuitet (DEC-0055): utseendet karakteren skal ha i denne scenen ifølge fortellingstiden
  const sceneId = state.variants[composition.variantId]?.sceneId;
  const continuity = sceneId ? layerContinuity(state, layer, sceneId) : null;
  // Låst til en eldre versjon enn den godkjente (DEC-0056, REQ-0132)
  const outdated = outdatedLayers(state, composition.id).find((x) => x.layerId === layer.id);
  // Bildeskifter og språkbilder med eldre versjon (KI-106, KI-173): samme valg som i arbeidslisten
  const otherOutdated = useMemo(() => {
    const main = mainProduction(state);
    return main
      ? assetWorklist(state, main.id).filter(
          (x) =>
            x.kind === "layer" && x.targetId === layer.id && x.oldVersionId !== outdated?.versionId,
        )
      : [];
  }, [state, layer.id, outdated?.versionId]);
  const selectClass = inputClass;
  const isGroup = layer.kind === "group";
  const groups = isGroup ? [] : layersOf(state, composition.id).filter((l) => l.kind === "group");

  return (
    <div aria-label={L("Egenskaper for lag", "Layer properties")} className="p-3">
      <Section title={L("Lag", "Layer")}>
        <TextField
          label={L("Navn", "Name")}
          value={layer.name}
          disabled={off}
          onCommit={(name) => apply(L("Endre navn på lag", "Rename layer"), { name })}
        />
        <Field label="Type">
          <select
            value={layer.kind}
            disabled={off || isGroup}
            onChange={(e) => {
              const k = LAYER_KINDS.find((x) => x === e.target.value);
              if (k) changeKind(k);
            }}
            className={selectClass}
          >
            {LAYER_KINDS.filter((k) => (k === "group") === isGroup).map((k) => (
              <option key={k} value={k}>
                {LAYER_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        {groups.length > 0 || layer.groupId ? (
          <Field label={L("Gruppe", "Group")}>
            <select
              value={layer.groupId ?? ""}
              disabled={off}
              onChange={(e) => {
                const g = e.target.value ? state.layers[e.target.value] : undefined;
                // Laget blir stående der det er (plassering regnes om til gruppens koordinater)
                setError(
                  run(
                    {
                      type: "UpdateLayers",
                      layers: [
                        {
                          layerId: layer.id,
                          fields: regroupFields(state, layer, g?.id ?? null, frame),
                        },
                      ],
                    },
                    g
                      ? L(
                          `Legg «${layer.name}» i «${g.name}»`,
                          `Put “${layer.name}” in “${g.name}”`,
                        )
                      : L("Ta ut av gruppe", "Remove from group"),
                  ),
                );
              }}
              className={selectClass}
            >
              <option value="">{L("Ingen gruppe", "No group")}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || L("Gruppe", "Group")}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {isGroup ? (
          <Hint>
            {L(
              "Lagene i gruppen flyttes, roteres og skaleres sammen rundt gruppens ankerpunkt. Velg gruppe for et lag under «Gruppe» i lagets egenskaper.",
              "The layers in the group are moved, rotated and scaled together around the group's anchor point. Choose a group for a layer under “Group” in the layer's properties.",
            )}
          </Hint>
        ) : null}
      </Section>

      <Section title={L("Plassering", "Placement")}>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="X (px)"
            marker={marker("x", "X (px)")}
            value={t.x}
            disabled={off}
            onCommit={(x) => setT(L("Flytt lag", "Move layer"), { x })}
          />
          <NumberField
            label="Y (px)"
            marker={marker("y", "Y (px)")}
            value={t.y}
            disabled={off}
            onCommit={(y) => setT(L("Flytt lag", "Move layer"), { y })}
          />
          <NumberField
            label={L("Skalering X (%)", "Scale X (%)")}
            marker={
              <>
                {marker("scaleX", L("Skalering X (%)", "Scale X (%)"))}
                <ResetAspectButton
                  keep="x"
                  disabled={off || !isSquished(t)}
                  onClick={() =>
                    setT(
                      L("Nullstill format (behold bredden)", "Reset aspect (keep width)"),
                      aspectResetScale(t, "x"),
                    )
                  }
                />
              </>
            }
            value={t.scaleX * 100}
            disabled={off}
            valid={(n) => n !== 0}
            onCommit={(n) => setT(L("Skaler lag", "Scale layer"), { scaleX: n / 100 })}
          />
          <NumberField
            label={L("Skalering Y (%)", "Scale Y (%)")}
            marker={
              <>
                {marker("scaleY", L("Skalering Y (%)", "Scale Y (%)"))}
                <ResetAspectButton
                  keep="y"
                  disabled={off || !isSquished(t)}
                  onClick={() =>
                    setT(
                      L("Nullstill format (behold høyden)", "Reset aspect (keep height)"),
                      aspectResetScale(t, "y"),
                    )
                  }
                />
              </>
            }
            value={t.scaleY * 100}
            disabled={off}
            valid={(n) => n !== 0}
            onCommit={(n) => setT(L("Skaler lag", "Scale layer"), { scaleY: n / 100 })}
          />
          <NumberField
            label={L("Rotasjon (°)", "Rotation (°)")}
            marker={marker("rotation", L("Rotasjon (°)", "Rotation (°)"))}
            value={t.rotation}
            disabled={off}
            onCommit={(rotation) => setT(L("Roter lag", "Rotate layer"), { rotation })}
          />
          <NumberField
            label={L("Gjennomsiktighet (%)", "Opacity (%)")}
            marker={marker("opacity", L("Gjennomsiktighet (%)", "Opacity (%)"))}
            value={t.opacity * 100}
            disabled={off}
            min={0}
            max={100}
            onCommit={(n) =>
              setT(L("Endre gjennomsiktighet", "Change opacity"), { opacity: n / 100 })
            }
          />
        </div>
        {/* Speilvend i denne scenen (DEC-0079); «fra her» tweenes mellom nøkkelbilder (DEC-0080) */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-text-secondary">{L("Speilvend", "Flip")}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={off}
            onClick={() => flip("x")}
            title={
              flipMode === "whole"
                ? L(
                    "Speilvend laget vannrett i hele scenen (bildet i biblioteket endres ikke)",
                    "Flip the layer horizontally throughout the scene (the image in the library is not changed)",
                  )
                : L(
                    "Laget snur vannrett fram til avspillingshodet og er speilvendt resten av scenen",
                    "The layer turns horizontally up to the playhead and stays flipped for the rest of the scene",
                  )
            }
          >
            <FlipHorizontal2 /> {L("Vannrett", "Horizontal")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={off}
            onClick={() => flip("y")}
            title={
              flipMode === "whole"
                ? L(
                    "Speilvend laget loddrett i hele scenen",
                    "Flip the layer vertically throughout the scene",
                  )
                : L(
                    "Laget snur loddrett fram til avspillingshodet og er speilvendt resten av scenen",
                    "The layer turns vertically up to the playhead and stays flipped for the rest of the scene",
                  )
            }
          >
            <FlipVertical2 /> {L("Loddrett", "Vertical")}
          </Button>
        </div>
        <select
          aria-label={L("Hvordan speilvendingen virker", "How the flip works")}
          value={flipMode}
          disabled={off}
          onChange={(e) => setFlipMode(e.target.value as FlipMode)}
          className={inputClass + " mt-1.5 h-7 text-xs"}
        >
          {(Object.keys(FLIP_MODE_LABEL) as FlipMode[]).map((m) => (
            <option key={m} value={m}>
              {FLIP_MODE_LABEL[m]}
            </option>
          ))}
        </select>
        {flipMode !== "whole" ? (
          <Hint>
            {L(
              "Laget snur fra forrige nøkkelbilde (ellers et halvt sekund før) til avspillingshodet, og er speilvendt resten av scenen.",
              "The layer turns from the previous keyframe (otherwise half a second earlier) up to the playhead, and stays flipped for the rest of the scene.",
            )}{" "}
            {flipMode === "smooth"
              ? L(
                  "Glidende: bildet klemmes smalt og vokser ut speilvendt, som et kort som snus.",
                  "Smooth: the image is squeezed narrow and grows out flipped, like a card being turned.",
                )
              : L(
                  "Brått: snur på ett bilde, som i stop motion.",
                  "Abrupt: turns on a single frame, as in stop motion.",
                )}
          </Hint>
        ) : null}
        {magnification && magnification.value > MAGNIFICATION_WARN ? (
          <div
            role="status"
            className="mt-2 flex flex-col gap-1.5 rounded-sm border border-accent-warm/50 bg-surface-1 p-2 text-xs text-text-secondary"
          >
            <p className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-accent-warm" aria-hidden />
              <span>
                {L(
                  `Bildet vises i ${Math.round(magnification.value * 100)} % av sin egen størrelse${magnification.frame !== frame ? ` (bilde ${magnification.frame + 1})` : ""} – større enn pikslene i bildet, så det kan bli uskarpt.`,
                  `The image is shown at ${Math.round(magnification.value * 100)} % of its own size${magnification.frame !== frame ? ` (frame ${magnification.frame + 1})` : ""} – larger than the image's pixels, so it may look blurred.`,
                )}
              </span>
            </p>
            {onUpscale ? (
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                disabled={off}
                onClick={onUpscale}
              >
                <ZoomIn /> {L("Oppskaler bildet …", "Upscale image …")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </Section>

      {isGroup ? null : (
        <Section title={L("Dybde", "Depth")}>
          <NumberField
            label={L("Parallakse", "Parallax")}
            value={layer.parallax}
            disabled={off}
            step={0.05}
            min={0}
            max={4}
            onCommit={(parallax) => apply(L("Endre parallakse", "Change parallax"), { parallax })}
          />
          <Hint>
            {L(
              "0 = står stille når kameraet beveger seg · 1 = følger scenen · over 1 = nærmere enn scenen",
              "0 = stays still when the camera moves · 1 = follows the scene · over 1 = closer than the scene",
            )}
          </Hint>
        </Section>
      )}

      {isGroup ? null : (
        <LayerMaskSection
          state={state}
          composition={composition}
          layer={layer}
          editable={editable}
          apply={apply}
          frame={frame}
          autoKey={autoKey}
        />
      )}

      {isGroup ? null : (
        <Section title={L("Bilde", "Image")}>
          {onOpenImage ? (
            <Button size="sm" variant="secondary" className="self-start" onClick={onOpenImage}>
              <ImageIcon />
              {layer.assetId
                ? L("Velg eller last opp bilde …", "Choose or upload image …")
                : L("Koble til ressurs …", "Connect to asset …")}
            </Button>
          ) : null}
          {layer.assetId ? (
            <>
              <p className="truncate text-[13px] text-text-primary">
                {asset?.name ?? L("Ukjent ressurs", "Unknown asset")}
              </p>
              <Field label="Variant">
                <select
                  value={layer.assetVariantId ?? ""}
                  disabled={off}
                  onChange={(e) =>
                    apply(L("Bytt bilde", "Change image"), {
                      assetVariantId: (e.target.value || null) as LayerFields["assetVariantId"],
                      versionId: null,
                    })
                  }
                  className={selectClass}
                >
                  <option value="">{L("Standard (forsidebildet)", "Default (cover image)")}</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name || L("Uten navn", "Untitled")}
                      {v.archived ? L(" (arkivert)", " (archived)") : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={L("Versjon", "Version")}>
                <select
                  value={layer.versionId ?? ""}
                  disabled={off || layer.assetVariantId === null}
                  onChange={(e) =>
                    apply(L("Bytt bilde", "Change image"), {
                      versionId: (e.target.value || null) as LayerFields["versionId"],
                    })
                  }
                  className={selectClass}
                >
                  <option value="">{L("Godkjent / nyeste", "Approved / latest")}</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.number}
                      {v.id === approvedId ? L(" (godkjent)", " (approved)") : ""}
                    </option>
                  ))}
                </select>
              </Field>
              {layer.assetVariantId === null ? (
                <Hint>
                  {L(
                    "Velg en variant for å låse en bestemt versjon.",
                    "Choose a variant to lock a specific version.",
                  )}
                </Hint>
              ) : null}
              {outdated ? (
                <div className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface-2 p-2 text-xs text-text-primary">
                  <span>
                    {L(
                      `Laget viser v${state.assetVersions[outdated.versionId]?.number}, men v${state.assetVersions[outdated.approvedVersionId]?.number} er godkjent nå.`,
                      `The layer shows v${state.assetVersions[outdated.versionId]?.number}, but v${state.assetVersions[outdated.approvedVersionId]?.number} is approved now.`,
                    )}
                  </span>
                  {editable ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="self-start"
                      onClick={() =>
                        apply(L("Bruk den godkjente versjonen", "Use the approved version"), {
                          versionId: outdated.approvedVersionId as LayerFields["versionId"],
                        })
                      }
                    >
                      {L(
                        `Bruk v${state.assetVersions[outdated.approvedVersionId]?.number}`,
                        `Use v${state.assetVersions[outdated.approvedVersionId]?.number}`,
                      )}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {otherOutdated.map((x) => {
                const a = state.assets[x.assetId];
                return (
                  <div
                    key={x.key}
                    className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface-2 p-2 text-xs text-text-primary"
                  >
                    <span>
                      {L(
                        `Et bildeskifte eller språkbilde viser ${a?.name ?? "ressursen"} v${state.assetVersions[x.oldVersionId]?.number}, men v${state.assetVersions[x.newVersionId]?.number} er godkjent nå.`,
                        `An image swap or language image shows ${a?.name ?? "the asset"} v${state.assetVersions[x.oldVersionId]?.number}, but v${state.assetVersions[x.newVersionId]?.number} is approved now.`,
                      )}
                    </span>
                    {editable ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="self-start"
                        onClick={() => {
                          const cmds = newVersionWorkItemCommands(state, x, null, () => newId());
                          const group = newId();
                          for (const c of cmds ?? []) {
                            const e = run(
                              c,
                              L("Bruk den godkjente versjonen", "Use the approved version"),
                              group,
                            );
                            if (e) {
                              setError(e);
                              break;
                            }
                          }
                        }}
                      >
                        {L(
                          `Bruk v${state.assetVersions[x.newVersionId]?.number}`,
                          `Use v${state.assetVersions[x.newVersionId]?.number}`,
                        )}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
              {continuity?.mismatch && continuity.expected ? (
                <div
                  role="alert"
                  className="flex flex-col gap-1.5 rounded-sm border border-status-moved/50 bg-status-uncertain-bg p-2 text-xs text-text-primary"
                >
                  <span className="flex items-start gap-1.5">
                    <AlertTriangle
                      className="mt-0.5 size-3.5 shrink-0 text-status-moved"
                      aria-hidden
                    />
                    <span>
                      {L(
                        `Kontinuitet: i denne scenen skal ${asset?.name ?? "ressursen"} ha utseendet «${continuity.expected.name}».`,
                        `Continuity: in this scene ${asset?.name ?? "the asset"} should look like “${continuity.expected.name}”.`,
                      )}
                    </span>
                  </span>
                  {editable ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="self-start"
                      onClick={() =>
                        apply(
                          L("Bruk utseendet fra kontinuiteten", "Use the look from continuity"),
                          {
                            assetVariantId: continuity.expected!.id,
                            versionId: null,
                          },
                        )
                      }
                    >
                      {L(`Bruk «${continuity.expected.name}»`, `Use “${continuity.expected.name}”`)}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {variants.length > 0 ? (
                // Språkavhengig bilde (DEC-0059, REQ-0337): f.eks. et skilt med engelsk tekst
                <Field label={L("Bilde i engelsk versjon", "Image in English version")}>
                  <select
                    aria-label={L("Bilde i engelsk versjon", "Image in English version")}
                    value={
                      layer.languageImages?.find((x) => x.language === "en")?.assetVariantId ?? ""
                    }
                    disabled={off}
                    onChange={(e) => {
                      const id = e.target.value;
                      const rest = (layer.languageImages ?? []).filter((x) => x.language !== "en");
                      apply(
                        id
                          ? L("Eget bilde i engelsk versjon", "Own image in English version")
                          : L("Samme bilde i engelsk versjon", "Same image in English version"),
                        {
                          languageImages: id
                            ? [
                                ...rest,
                                { language: "en", assetVariantId: id as never, versionId: null },
                              ]
                            : rest,
                        },
                      );
                    }}
                    className={selectClass}
                    title={L(
                      "Vis en annen variant av ressursen når filmen spilles eller eksporteres på engelsk. Den norske versjonen endres ikke.",
                      "Show a different variant of the asset when the film is played or exported in English. The Norwegian version is not changed.",
                    )}
                  >
                    <option value="">{L("Samme som norsk", "Same as Norwegian")}</option>
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name || L("Uten navn", "Untitled")}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </>
          ) : (
            <>
              <ColorField
                label={L("Farge", "Colour")}
                value={layer.fill ?? "#000000"}
                disabled={off}
                onCommit={(fill) => apply(L("Endre farge", "Change colour"), { fill })}
              />
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label={L("Bredde (px)", "Width (px)")}
                  value={layer.width}
                  disabled={off}
                  integer
                  min={1}
                  max={16384}
                  onCommit={(width) => apply(L("Endre størrelse", "Change size"), { width })}
                />
                <NumberField
                  label={L("Høyde (px)", "Height (px)")}
                  value={layer.height}
                  disabled={off}
                  integer
                  min={1}
                  max={16384}
                  onCommit={(height) => apply(L("Endre størrelse", "Change size"), { height })}
                />
              </div>
            </>
          )}
        </Section>
      )}

      {isGroup || !layer.assetId ? null : (
        <LayerSwaps
          state={state}
          layer={layer}
          editable={editable}
          frame={frame}
          run={run}
          {...(onSeek ? { onSeek } : {})}
        />
      )}

      <LayerMotion
        state={state}
        layer={layer}
        editable={editable}
        durationFrames={durationFrames}
        run={run}
        drawing={drawingPath}
        onDrawingChange={(on) => onDrawingPathChange?.(on)}
      />

      <Section title={L("Synlighet", "Visibility")}>
        <label className="flex items-center gap-2 text-[13px] text-text-primary">
          <input
            type="checkbox"
            checked={layer.visible}
            disabled={off}
            onChange={(e) =>
              apply(e.target.checked ? L("Vis lag", "Show layer") : L("Skjul lag", "Hide layer"), {
                visible: e.target.checked,
              })
            }
            className="size-3.5 accent-[var(--accent-brand)]"
          />
          {L("Synlig", "Visible")}
        </label>
        <label className="flex items-center gap-2 text-[13px] text-text-primary">
          <input
            type="checkbox"
            checked={layer.locked}
            disabled={off}
            onChange={(e) =>
              apply(
                e.target.checked ? L("Lås lag", "Lock layer") : L("Lås opp lag", "Unlock layer"),
                { locked: e.target.checked },
              )
            }
            className="size-3.5 accent-[var(--accent-brand)]"
          />
          {L("Låst", "Locked")}
        </label>
      </Section>

      <LayerEvents
        state={state}
        composition={composition}
        layer={layer}
        editable={editable}
        frame={frame}
        run={run}
        {...(onSeek ? { onSeek } : {})}
      />

      <ErrorText message={error} />

      {editable ? (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={duplicate}>
            <Copy className="size-3.5" />
            {L("Dupliser", "Duplicate")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={remove}
            className="ml-auto text-status-danger hover:text-status-danger"
          >
            <Trash2 className="size-3.5" />
            {L("Slett lag", "Delete layer")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------- Selve 2D-scenen ----------

/** Etiketten for «på toere» osv. */
const STEP_LABEL = (step: number): string =>
  step === 2 ? L("toere", "twos") : step === 3 ? L("treere", "threes") : L("firere", "fours");

export function CompositionInspector({
  composition,
  editable,
  run,
  onChangeDuration,
}: {
  composition: Composition;
  editable: boolean;
  run: Run;
  /** Åpner «Endre scenevarighet» (SV1). */
  onChangeDuration?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const off = !editable;

  function apply(label: string, patch: Partial<CompositionFields>) {
    setError(
      run(
        {
          type: "UpdateComposition",
          compositionId: composition.id,
          fields: { ...compositionFieldsOf(composition), ...patch },
        },
        label,
      ),
    );
  }

  return (
    <div aria-label={L("Egenskaper for 2D-scenen", "Properties for the 2D scene")} className="p-3">
      <h2 className="mb-3 text-[13px] font-medium text-text-primary">
        {L("2D-scene", "2D scene")}
      </h2>
      <Section title="Scene">
        <TextField
          label={L("Navn", "Name")}
          value={composition.name}
          disabled={off}
          allowEmpty
          placeholder={L("Uten navn", "Untitled")}
          onCommit={(name) => apply(L("Endre navn på 2D-scene", "Rename 2D scene"), { name })}
        />
        {onChangeDuration ? (
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            disabled={off}
            data-testid="inspector-change-duration"
            onClick={onChangeDuration}
          >
            {L("Endre scenevarighet …", "Change scene duration …")}
          </Button>
        ) : null}
      </Section>

      <Section title="Format">
        <p className="text-[13px] text-text-secondary">
          {composition.width} × {composition.height} px
        </p>
        <p className="text-xs text-text-tertiary">
          {L(
            "Bildeformat og bildefrekvens gjelder hele prosjektet og endres på prosjektoversikten.",
            "Frame size and frame rate apply to the whole project and are changed on the project overview.",
          )}
        </p>
      </Section>

      <Section title={L("Bakgrunn", "Background")}>
        <ColorField
          label={L("Bakgrunnsfarge", "Background colour")}
          value={composition.background}
          disabled={off}
          onCommit={(background) => apply(L("Endre bakgrunn", "Change background"), { background })}
        />
      </Section>

      <Section title={L("Bevegelse", "Motion")}>
        <label className="flex items-center justify-between gap-2 text-xs text-text-secondary">
          {L("Animer", "Animate")}
          <select
            aria-label={L(
              "Animer på enere, toere, treere eller firere",
              "Animate on ones, twos, threes or fours",
            )}
            value={composition.step ?? 1}
            disabled={off}
            onChange={(e) => {
              const step = Number(e.target.value);
              setError(
                run(
                  { type: "SetCompositionStep", compositionId: composition.id, step },
                  step === 1
                    ? L("Animer hvert bilde", "Animate every frame")
                    : L(`Animer på ${STEP_LABEL(step)}`, `Animate on ${STEP_LABEL(step)}`),
                ),
              );
            }}
            className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
          >
            <option value={1}>{L("hvert bilde", "every frame")}</option>
            <option value={2}>{L("på toere", "on twos")}</option>
            <option value={3}>{L("på treere", "on threes")}</option>
            <option value={4}>{L("på firere", "on fours")}</option>
          </select>
        </label>
        <p className="text-xs text-text-tertiary">
          {L(
            "På toere oppdateres bevegelsen hvert annet bilde, som i stop motion. Filmen beholder bildefrekvensen sin.",
            "On twos the motion updates every other frame, as in stop motion. The film keeps its frame rate.",
          )}
        </p>
      </Section>

      <ErrorText message={error} />
      <Hint>
        {L(
          "Velg et lag i scenen eller i listen for å endre det.",
          "Choose a layer in the scene or in the list to change it.",
        )}
      </Hint>
    </div>
  );
}

/** «Nullstill format» ved skaleringen (DEC-0080): bildets egne proporsjoner, med bredden eller høyden beholdt. */
function ResetAspectButton({
  keep,
  disabled,
  onClick,
}: {
  keep: "x" | "y";
  disabled: boolean;
  onClick: () => void;
}) {
  const label =
    keep === "x"
      ? L(
          "Nullstill format – behold bredden (høyden rettes til bildets proporsjoner)",
          "Reset aspect – keep the width (the height is set to the image's proportions)",
        )
      : L(
          "Nullstill format – behold høyden (bredden rettes til bildets proporsjoner)",
          "Reset aspect – keep the height (the width is set to the image's proportions)",
        );
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={
        disabled
          ? L("Laget har bildets egne proporsjoner", "The layer has the image's own proportions")
          : label
      }
      className="rounded-sm p-0.5 text-text-tertiary hover:bg-surface-3 hover:text-text-primary disabled:pointer-events-none disabled:opacity-30"
    >
      <Ratio className="size-3.5" aria-hidden />
    </button>
  );
}
