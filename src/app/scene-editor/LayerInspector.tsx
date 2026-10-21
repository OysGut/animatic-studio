/**
 * Egenskaper for valgt lag (plassering, dybde, bilde, synlighet) og for selve 2D-scenen når ingen lag er valgt.
 * Hver endring er én kommando som kan angres. UpdateLayers erstatter alle felter, så vi bygger alltid fra laget.
 */
import { LayerEvents } from "./LayerEvents";
import { LayerSwaps } from "./LayerSwaps";
import { LayerMotion } from "./LayerMotion";
import { LayerMaskSection } from "./LayerMaskSection";
import { TextInspector } from "./TextInspector";
import type { RunAndWait } from "./mts-actions";
import {
  AlertTriangle,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Clapperboard,
  Image as ImageIcon,
  Ratio,
  Trash2,
  ZoomIn, Palette } from "lucide-react";
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
import { COMPOSITION_FORMATS, DEFAULT_PARALLAX, LAYER_KINDS, LAYER_KIND_LABEL, keyBetween, fieldsWithTransformAt, isAnimated, layersOf, newId, removeKeyframesAt, setKeyframe, transformAt, normalizeColor, variantsOf, versionsOf, type Command, type Composition, type CompositionFields, type TransformProperty, type CompositionLayer, type LayerFields, type LayerKind, type LayerTransform, type ProjectState, assetWorklist, layerContinuity, mainProduction, newVersionWorkItemCommands, outdatedLayers } from "@/core";
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
import { t as tk } from "@/core/i18n/keyed";

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
          aria-label={`${label} ${tk("app-scene-editor-layer-inspector.color-field.aria-label.3a66704c353e")}`}
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
  onOpenAssetStudio,
  onCarryNext,
  onCarryPick,
  onSeek,
  onUpscale,
  onHarmonize,
  durationFrames,
  drawingPath = false,
  onDrawingPathChange,
  projectId,
  runAndWait,
}: {
  /** For «Lagre som mal» (MTS MT4): opplasting av miniatyren og kommandoer som ventes på. */
  projectId?: string;
  runAndWait?: RunAndWait;
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
  /** Åpne laget i Asset Studio (AS1). Utelatt: ingen knapp. */
  onOpenAssetStudio?: () => void;
  /** «Bruk videre i neste scene» (GP3). Gir meldingen som vises. Utelatt: ingen knapp. */
  onCarryNext?: () => Promise<string | null>;
  /** «Bruk også i …» (GP3). Utelatt: ingen knapp. */
  onCarryPick?: () => void;
  /** Flytt avspillingshodet (hendelser i manuset). */
  onSeek?: (frame: number) => void;
  /** Oppskaler bildet laget viser (advarselen om forstørrelse over 1:1). Utelatt: ingen knapp. */
  onUpscale?: () => void;
  /** P8: «Harmoniser stil …» for bildet laget viser. Utelatt: ingen knapp. */
  onHarmonize?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [carryMsg, setCarryMsg] = useState<string | null>(null);
  const off = !editable;
  /** Hvordan «Speilvend» virker: hele laget, eller fra avspillingshodet (glidende eller brått). */
  const [flipMode, setFlipMode] = useState<FlipMode>("whole");
  // Forstørrelse over 1:1 (Mars 2026-10-13): bildet tegnes større enn sine egne piksler og blir uskarpt
  const magnification = useMemo(
    () => maxLayerMagnification(state, composition.id, layer.id, frame),
    [state, composition.id, layer.id, frame],
  );

  function flip(axis: "x" | "y") {
    const what = axis === "x" ? tk("app-scene-editor-layer-inspector.what.message.e077f11671a9") : tk("app-scene-editor-layer-inspector.what.message.52130d780cb4");
    if (flipMode !== "whole") {
      // Et halvt sekund når laget ikke har nøkkelbilder før avspillingshodet
      const span = Math.round(fpsToNumber(state.project.fps) / 2);
      const keys = flippedKeyframesFrom(layer, axis, frame, flipMode, span);
      if (keys) {
        apply(
          tk("app-scene-editor-layer-inspector.flip.apply.3b782138f916", { what: String(what), value2: String(frame + 1) }),
          {
            keyframes: keys,
          },
        );
        return;
      }
    }
    apply(tk("app-scene-editor-layer-inspector.flip.apply.e20c19dbc8c1", { what: String(what) }), flippedTransformPatch(layer, axis));
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
    apply(has ? tk("app-scene-editor-layer-inspector.toggle-key.apply.bf80aa84511d") : tk("app-scene-editor-layer-inspector.toggle-key.apply.4c77d7ef5c6a"), {
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
    apply(tk("app-scene-editor-layer-inspector.change-kind.apply.358048d422a2"), patch);
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
                name: tk("app-scene-editor-layer-inspector.name.l-f-name-kopi-f-name-copy-slice.76ea7b2e479d", { name: String(f.name) }).slice(0, 200),
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
        tk("app-scene-editor-layer-inspector.duplicate.run.607a76cf9da4", { name: String(layer.name) }),
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
        tk("app-scene-editor-layer-inspector.remove.remove-layer.6379d567d16c", { name: String(layer.name) }),
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
    <div aria-label={tk("app-scene-editor-layer-inspector.layer-inspector.aria-label.390e4e1ae608")} className="p-3">
      <Section title={tk("app-scene-editor-layer-inspector.layer-inspector.title.4a7464f2b6a1")}>
        <TextField
          label={tk("app-scene-editor-layer-inspector.layer-inspector.label.9c13c3b3438d")}
          value={layer.name}
          disabled={off}
          onCommit={(name) => apply(tk("app-scene-editor-layer-inspector.layer-inspector.apply.3d8c235b12ab"), { name })}
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
          <Field label={tk("app-scene-editor-layer-inspector.layer-inspector.label.42f20eddd552")}>
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
                      ? tk("app-scene-editor-layer-inspector.layer-inspector.run.1d9dede3b5f3", { name: String(layer.name), name2: String(g.name) })
                      : tk("app-scene-editor-layer-inspector.layer-inspector.run.64ae7cdcbbf4"),
                  ),
                );
              }}
              className={selectClass}
            >
              <option value="">{tk("app-scene-editor-layer-inspector.layer-inspector.option.ca94c09b593d")}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || tk("app-scene-editor-layer-inspector.layer-inspector.option.42f20eddd552")}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {isGroup ? (
          <Hint>
            {tk("app-scene-editor-layer-inspector.layer-inspector.hint.194c562de84c")}
          </Hint>
        ) : null}
      </Section>

      <Section title={tk("app-scene-editor-layer-inspector.layer-inspector.title.bc93a9762cff")}>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="X (px)"
            marker={marker("x", "X (px)")}
            value={t.x}
            disabled={off}
            onCommit={(x) => setT(tk("app-scene-editor-layer-inspector.layer-inspector.set-t.24dce699d358"), { x })}
          />
          <NumberField
            label="Y (px)"
            marker={marker("y", "Y (px)")}
            value={t.y}
            disabled={off}
            onCommit={(y) => setT(tk("app-scene-editor-layer-inspector.layer-inspector.set-t.24dce699d358.2"), { y })}
          />
          <NumberField
            label={tk("app-scene-editor-layer-inspector.layer-inspector.label.8bb0a95c64c3")}
            marker={
              <>
                {marker("scaleX", tk("app-scene-editor-layer-inspector.layer-inspector.marker.8bb0a95c64c3"))}
                <ResetAspectButton
                  keep="x"
                  disabled={off || !isSquished(t)}
                  onClick={() =>
                    setT(
                      tk("app-scene-editor-layer-inspector.layer-inspector.set-t.dcc9a737bccb"),
                      aspectResetScale(t, "x"),
                    )
                  }
                />
              </>
            }
            value={t.scaleX * 100}
            disabled={off}
            valid={(n) => n !== 0}
            onCommit={(n) => setT(tk("app-scene-editor-layer-inspector.layer-inspector.set-t.05c5a96616b5"), { scaleX: n / 100 })}
          />
          <NumberField
            label={tk("app-scene-editor-layer-inspector.layer-inspector.label.bce68472b3da")}
            marker={
              <>
                {marker("scaleY", tk("app-scene-editor-layer-inspector.layer-inspector.marker.bce68472b3da"))}
                <ResetAspectButton
                  keep="y"
                  disabled={off || !isSquished(t)}
                  onClick={() =>
                    setT(
                      tk("app-scene-editor-layer-inspector.layer-inspector.set-t.255f1b31d935"),
                      aspectResetScale(t, "y"),
                    )
                  }
                />
              </>
            }
            value={t.scaleY * 100}
            disabled={off}
            valid={(n) => n !== 0}
            onCommit={(n) => setT(tk("app-scene-editor-layer-inspector.layer-inspector.set-t.05c5a96616b5.2"), { scaleY: n / 100 })}
          />
          <NumberField
            label={tk("app-scene-editor-layer-inspector.layer-inspector.label.ff8164b6b52b")}
            marker={marker("rotation", tk("app-scene-editor-layer-inspector.layer-inspector.marker.ff8164b6b52b"))}
            value={t.rotation}
            disabled={off}
            onCommit={(rotation) => setT(tk("app-scene-editor-layer-inspector.layer-inspector.set-t.ae6e6d268b85"), { rotation })}
          />
          <NumberField
            label={tk("app-scene-editor-layer-inspector.layer-inspector.label.9db1e6dc22e0")}
            marker={marker("opacity", tk("app-scene-editor-layer-inspector.layer-inspector.marker.9db1e6dc22e0"))}
            value={t.opacity * 100}
            disabled={off}
            min={0}
            max={100}
            onCommit={(n) =>
              setT(tk("app-scene-editor-layer-inspector.layer-inspector.set-t.b457e2d5f31f"), { opacity: n / 100 })
            }
          />
        </div>
        {/* Speilvend i denne scenen (DEC-0079); «fra her» tweenes mellom nøkkelbilder (DEC-0080) */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-text-secondary">{tk("app-scene-editor-layer-inspector.layer-inspector.span.3e0c500704b1")}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={off}
            onClick={() => flip("x")}
            title={
              flipMode === "whole"
                ? tk("app-scene-editor-layer-inspector.layer-inspector.title.8b1a05309fa8")
                : tk("app-scene-editor-layer-inspector.layer-inspector.title.59f320728f79")
            }
          >
            <FlipHorizontal2 /> {tk("app-scene-editor-layer-inspector.layer-inspector.button.cfb184335255")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={off}
            onClick={() => flip("y")}
            title={
              flipMode === "whole"
                ? tk("app-scene-editor-layer-inspector.layer-inspector.title.10dae0c7f2bb")
                : tk("app-scene-editor-layer-inspector.layer-inspector.title.90597bdab94a")
            }
          >
            <FlipVertical2 /> {tk("app-scene-editor-layer-inspector.layer-inspector.button.068c0f24d469")}
          </Button>
        </div>
        <select
          aria-label={tk("app-scene-editor-layer-inspector.layer-inspector.aria-label.dc0b215c5e27")}
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
            {tk("app-scene-editor-layer-inspector.layer-inspector.hint.d2d12f0c6c3a")}{" "}
            {flipMode === "smooth"
              ? tk("app-scene-editor-layer-inspector.layer-inspector.hint.08bbbf89bd2f")
              : tk("app-scene-editor-layer-inspector.layer-inspector.hint.da0ebc05b49d")}
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
                {magnification.frame !== frame ? tk("app-scene-editor-layer-inspector.magnified-frame", { percent: Math.round(magnification.value * 100), frame: magnification.frame + 1 }) : tk("app-scene-editor-layer-inspector.magnified", { percent: Math.round(magnification.value * 100) })}
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
                <ZoomIn /> {tk("app-scene-editor-layer-inspector.layer-inspector.button.e0235f32dc81")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </Section>

      {isGroup ? null : (
        <Section title={tk("app-scene-editor-layer-inspector.layer-inspector.title.1384397cdc14")}>
          <NumberField
            label={tk("app-scene-editor-layer-inspector.layer-inspector.label.5931082eeac9")}
            value={layer.parallax}
            disabled={off}
            step={0.05}
            min={0}
            max={4}
            onCommit={(parallax) => apply(tk("app-scene-editor-layer-inspector.layer-inspector.apply.7bf050999a04"), { parallax })}
          />
          <Hint>
            {tk("app-scene-editor-layer-inspector.layer-inspector.hint.9d5e5271497b")}
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
        <Section title={tk("app-scene-editor-layer-inspector.layer-inspector.title.91a30bb4f563")}>
          {onHarmonize && layer.assetId ? (
            <Button
              size="sm"
              variant="secondary"
              className="self-start"
              disabled={off}
              onClick={onHarmonize}
              data-testid="layer-harmonize"
              title={tk("app-scene-editor-layer-inspector.layer-inspector.title.e861175e0c92")}
            >
              <Palette /> {tk("app-scene-editor-layer-inspector.layer-inspector.button.f86952a2be5b")}
            </Button>
          ) : null}
          {onOpenAssetStudio ? (
            <Button
              size="sm"
              variant="secondary"
              className="self-start"
              onClick={onOpenAssetStudio}
              data-testid="open-asset-studio"
              title={tk("app-scene-editor-layer-inspector.layer-inspector.title.2b433b40fd23")}
            >
              <Clapperboard />
              {tk("app-scene-editor-layer-inspector.layer-inspector.button.e628489fa299")}
            </Button>
          ) : null}
          {editable && (onCarryNext || onCarryPick) ? (
            <div className="flex flex-wrap gap-1" data-testid="carry-over-actions">
              {onCarryNext ? (
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="carry-next"
                  title={tk("app-scene-editor-layer-inspector.layer-inspector.title.86b8b114bb9b")}
                  onClick={() => {
                    setCarryMsg(null);
                    void onCarryNext().then(setCarryMsg);
                  }}
                >
                  {tk("app-scene-editor-layer-inspector.layer-inspector.button.ba32a3db9d39")}
                </Button>
              ) : null}
              {onCarryPick ? (
                <Button size="sm" variant="ghost" data-testid="carry-pick" onClick={onCarryPick}>
                  {tk("app-scene-editor-layer-inspector.layer-inspector.button.348d9bec122d")}
                </Button>
              ) : null}
            </div>
          ) : null}
          {carryMsg ? (
            <p role="status" className="text-xs text-text-secondary" data-testid="carry-over-status">
              {carryMsg}
            </p>
          ) : null}
          {onOpenImage ? (
            <Button size="sm" variant="secondary" className="self-start" onClick={onOpenImage}>
              <ImageIcon />
              {layer.assetId
                ? tk("app-scene-editor-layer-inspector.layer-inspector.button.c17406d80aac")
                : tk("app-scene-editor-layer-inspector.layer-inspector.button.3d5ea4304fa6")}
            </Button>
          ) : null}
          {layer.assetId ? (
            <>
              <p className="truncate text-[13px] text-text-primary">
                {asset?.name ?? tk("app-scene-editor-layer-inspector.layer-inspector.p.63b13bf071c2")}
              </p>
              <Field label="Variant">
                <select
                  value={layer.assetVariantId ?? ""}
                  disabled={off}
                  onChange={(e) =>
                    apply(tk("app-scene-editor-layer-inspector.layer-inspector.apply.d3c8d15b735d"), {
                      assetVariantId: (e.target.value || null) as LayerFields["assetVariantId"],
                      versionId: null,
                    })
                  }
                  className={selectClass}
                >
                  <option value="">{tk("app-scene-editor-layer-inspector.layer-inspector.option.16e77947ffff")}</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name || tk("app-scene-editor-layer-inspector.layer-inspector.option.f7795a80552d")}
                      {v.archived ? tk("app-scene-editor-layer-inspector.layer-inspector.option.4641b429bab2") : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={tk("app-scene-editor-layer-inspector.layer-inspector.label.dc2613b27e2c")}>
                <select
                  value={layer.versionId ?? ""}
                  disabled={off || layer.assetVariantId === null}
                  onChange={(e) =>
                    apply(tk("app-scene-editor-layer-inspector.layer-inspector.apply.d3c8d15b735d.2"), {
                      versionId: (e.target.value || null) as LayerFields["versionId"],
                    })
                  }
                  className={selectClass}
                >
                  <option value="">{tk("app-scene-editor-layer-inspector.layer-inspector.option.e4825dde3296")}</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.number}
                      {v.id === approvedId ? tk("app-scene-editor-layer-inspector.layer-inspector.option.2ab91b502eda") : ""}
                    </option>
                  ))}
                </select>
              </Field>
              {layer.assetVariantId === null ? (
                <Hint>
                  {tk("app-scene-editor-layer-inspector.layer-inspector.hint.dd25a1bbba64")}
                </Hint>
              ) : null}
              {outdated ? (
                <div className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface-2 p-2 text-xs text-text-primary">
                  <span>
                    {tk("app-scene-editor-layer-inspector.layer-inspector.span.5432bea25aae", { number: String(state.assetVersions[outdated.versionId]?.number), number2: String(state.assetVersions[outdated.approvedVersionId]?.number) })}
                  </span>
                  {editable ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="self-start"
                      onClick={() =>
                        apply(tk("app-scene-editor-layer-inspector.layer-inspector.apply.c2404005c950"), {
                          versionId: outdated.approvedVersionId as LayerFields["versionId"],
                        })
                      }
                    >
                      {tk("app-scene-editor-layer-inspector.layer-inspector.button.5dcb8daae385", { number: String(state.assetVersions[outdated.approvedVersionId]?.number) })}
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
                      {tk("app-scene-editor-layer-inspector.swap-outdated", { asset: a?.name ?? tk("app-scene-editor-layer-inspector.swap-outdated-asset"), old: state.assetVersions[x.oldVersionId]?.number ?? "", current: state.assetVersions[x.newVersionId]?.number ?? "" })}
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
                              tk("app-scene-editor-layer-inspector.e.run.af96ba5b8433"),
                              group,
                            );
                            if (e) {
                              setError(e);
                              break;
                            }
                          }
                        }}
                      >
                        {tk("app-scene-editor-layer-inspector.layer-inspector.button.04731a6db7dc", { number: String(state.assetVersions[x.newVersionId]?.number) })}
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
                      {tk("app-scene-editor-layer-inspector.continuity-look", { asset: asset?.name ?? tk("app-scene-editor-layer-inspector.continuity-look-asset"), look: continuity.expected.name })}
                    </span>
                  </span>
                  {editable ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="self-start"
                      onClick={() =>
                        apply(
                          tk("app-scene-editor-layer-inspector.layer-inspector.apply.6ec4f8b2b65c"),
                          {
                            assetVariantId: continuity.expected!.id,
                            versionId: null,
                          },
                        )
                      }
                    >
                      {tk("app-scene-editor-layer-inspector.layer-inspector.button.33c112803461", { name: String(continuity.expected.name) })}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {variants.length > 0 ? (
                // Språkavhengig bilde (DEC-0059, REQ-0337): f.eks. et skilt med engelsk tekst
                <Field label={tk("app-scene-editor-layer-inspector.layer-inspector.label.4f123e87f87a")}>
                  <select
                    aria-label={tk("app-scene-editor-layer-inspector.layer-inspector.aria-label.4f123e87f87a")}
                    value={
                      layer.languageImages?.find((x) => x.language === "en")?.assetVariantId ?? ""
                    }
                    disabled={off}
                    onChange={(e) => {
                      const id = e.target.value;
                      const rest = (layer.languageImages ?? []).filter((x) => x.language !== "en");
                      apply(
                        id
                          ? tk("app-scene-editor-layer-inspector.layer-inspector.apply.9609d9a7816d")
                          : tk("app-scene-editor-layer-inspector.layer-inspector.apply.5c7249332234"),
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
                    title={tk("app-scene-editor-layer-inspector.layer-inspector.title.8c9366dd218d")}
                  >
                    <option value="">{tk("app-scene-editor-layer-inspector.layer-inspector.option.094e7f4ca86f")}</option>
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name || tk("app-scene-editor-layer-inspector.layer-inspector.option.f7795a80552d.2")}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </>
          ) : (
            <>
              <ColorField
                label={tk("app-scene-editor-layer-inspector.layer-inspector.label.eb639ff25614")}
                value={layer.fill ?? "#000000"}
                disabled={off}
                onCommit={(fill) => apply(tk("app-scene-editor-layer-inspector.layer-inspector.apply.b074722d6a6e"), { fill })}
              />
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label={tk("app-scene-editor-layer-inspector.layer-inspector.label.9f00d829865e")}
                  value={layer.width}
                  disabled={off}
                  integer
                  min={1}
                  max={16384}
                  onCommit={(width) => apply(tk("app-scene-editor-layer-inspector.layer-inspector.apply.f772058468ce"), { width })}
                />
                <NumberField
                  label={tk("app-scene-editor-layer-inspector.layer-inspector.label.5216934aba3c")}
                  value={layer.height}
                  disabled={off}
                  integer
                  min={1}
                  max={16384}
                  onCommit={(height) => apply(tk("app-scene-editor-layer-inspector.layer-inspector.apply.f772058468ce.2"), { height })}
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

      <TextInspector
        state={state}
        composition={composition}
        layer={layer}
        editable={editable}
        run={run}
        frame={frame}
        durationFrames={durationFrames}
        onError={setError}
        {...(projectId && runAndWait ? { projectId, runAndWait } : {})}
      />
      <Section title={tk("app-scene-editor-layer-inspector.layer-inspector.title.f3de8b5b0fe5")}>
        <label className="flex items-center gap-2 text-[13px] text-text-primary">
          <input
            type="checkbox"
            checked={layer.visible}
            disabled={off}
            onChange={(e) =>
              apply(e.target.checked ? tk("app-scene-editor-layer-inspector.layer-inspector.apply.a9cefac8a4f0") : tk("app-scene-editor-layer-inspector.layer-inspector.apply.ff8aa20999f9"), {
                visible: e.target.checked,
              })
            }
            className="size-3.5 accent-[var(--accent-brand)]"
          />
          {tk("app-scene-editor-layer-inspector.layer-inspector.label.2d2adcf7f65c")}
        </label>
        <label className="flex items-center gap-2 text-[13px] text-text-primary">
          <input
            type="checkbox"
            checked={layer.locked}
            disabled={off}
            onChange={(e) =>
              apply(
                e.target.checked ? tk("app-scene-editor-layer-inspector.layer-inspector.apply.7cca0a4e2f5e") : tk("app-scene-editor-layer-inspector.layer-inspector.apply.a8d3655e6307"),
                { locked: e.target.checked },
              )
            }
            className="size-3.5 accent-[var(--accent-brand)]"
          />
          {tk("app-scene-editor-layer-inspector.layer-inspector.label.59933de3f9c3")}
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
            {tk("app-scene-editor-layer-inspector.layer-inspector.button.bf7b21871442")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={remove}
            className="ml-auto text-status-danger hover:text-status-danger"
          >
            <Trash2 className="size-3.5" />
            {tk("app-scene-editor-layer-inspector.layer-inspector.button.738292fc9af7")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------- Selve 2D-scenen ----------

/** Etiketten for «på toere» osv. */
const STEP_LABEL = (step: number): string =>
  step === 2 ? tk("app-scene-editor-layer-inspector.step-label.message.1043d080b517") : step === 3 ? tk("app-scene-editor-layer-inspector.step-label.message.4bc8574b0759") : tk("app-scene-editor-layer-inspector.step-label.message.f57a43554f05");

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
    <div aria-label={tk("app-scene-editor-layer-inspector.composition-inspector.aria-label.39419b2e045b")} className="p-3">
      <h2 className="mb-3 text-[13px] font-medium text-text-primary">
        {tk("app-scene-editor-layer-inspector.composition-inspector.h2.1bf0b9ef1123")}
      </h2>
      <Section title="Scene">
        <TextField
          label={tk("app-scene-editor-layer-inspector.composition-inspector.label.b5fb251149b2")}
          value={composition.name}
          disabled={off}
          allowEmpty
          placeholder={tk("app-scene-editor-layer-inspector.composition-inspector.placeholder.a8d10a8d5461")}
          onCommit={(name) => apply(tk("app-scene-editor-layer-inspector.composition-inspector.apply.77ddbc7d08dd"), { name })}
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
            {tk("app-scene-editor-layer-inspector.composition-inspector.button.ad44769668f8")}
          </Button>
        ) : null}
      </Section>

      <Section title="Format">
        <p className="text-[13px] text-text-secondary">
          {composition.width} × {composition.height} px
        </p>
        <p className="text-xs text-text-tertiary">
          {tk("app-scene-editor-layer-inspector.composition-inspector.p.2823f27a855a")}
        </p>
      </Section>

      <Section title={tk("app-scene-editor-layer-inspector.composition-inspector.title.3bd4ee136f7c")}>
        <ColorField
          label={tk("app-scene-editor-layer-inspector.composition-inspector.label.dda7066c2362")}
          value={composition.background}
          disabled={off}
          onCommit={(background) => apply(tk("app-scene-editor-layer-inspector.composition-inspector.apply.52268fb302b5"), { background })}
        />
      </Section>

      <Section title={tk("app-scene-editor-layer-inspector.composition-inspector.title.dfc893e77d34")}>
        <label className="flex items-center justify-between gap-2 text-xs text-text-secondary">
          {tk("app-scene-editor-layer-inspector.composition-inspector.label.3481ff9cff92")}
          <select
            aria-label={tk("app-scene-editor-layer-inspector.composition-inspector.aria-label.d1dda7dd0826")}
            value={composition.step ?? 1}
            disabled={off}
            onChange={(e) => {
              const step = Number(e.target.value);
              setError(
                run(
                  { type: "SetCompositionStep", compositionId: composition.id, step },
                  step === 1
                    ? tk("app-scene-editor-layer-inspector.composition-inspector.run.ce1e0c9beba8")
                    : tk("app-scene-editor-layer-inspector.composition-inspector.run.9a851b42c36e", { value1: String(STEP_LABEL(step)) }),
                ),
              );
            }}
            className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
          >
            <option value={1}>{tk("app-scene-editor-layer-inspector.composition-inspector.option.1da73b935fe1")}</option>
            <option value={2}>{tk("app-scene-editor-layer-inspector.composition-inspector.option.b9378f8eba47")}</option>
            <option value={3}>{tk("app-scene-editor-layer-inspector.composition-inspector.option.d675cba8e976")}</option>
            <option value={4}>{tk("app-scene-editor-layer-inspector.composition-inspector.option.1727fcd237b8")}</option>
          </select>
        </label>
        <p className="text-xs text-text-tertiary">
          {tk("app-scene-editor-layer-inspector.composition-inspector.p.2de8a183c94d")}
        </p>
      </Section>

      <ErrorText message={error} />
      <Hint>
        {tk("app-scene-editor-layer-inspector.composition-inspector.hint.23e7bd554865")}
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
      ? tk("app-scene-editor-layer-inspector.label.message.8cfb5e8988fc")
      : tk("app-scene-editor-layer-inspector.label.message.e16a78e21ae3");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={
        disabled
          ? tk("app-scene-editor-layer-inspector.reset-aspect-button.title.f898b74b8a98")
          : label
      }
      className="rounded-sm p-0.5 text-text-tertiary hover:bg-surface-3 hover:text-text-primary disabled:pointer-events-none disabled:opacity-30"
    >
      <Ratio className="size-3.5" aria-hidden />
    </button>
  );
}
