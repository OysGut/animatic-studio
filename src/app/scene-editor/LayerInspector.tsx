/**
 * Egenskaper for valgt lag (plassering, dybde, bilde, synlighet) og for selve 2D-scenen når ingen lag er valgt.
 * Hver endring er én kommando som kan angres. UpdateLayers erstatter alle felter, så vi bygger alltid fra laget.
 */
import { LayerEvents } from "./LayerEvents";
import { LayerSwaps } from "./LayerSwaps";
import { LayerMotion } from "./LayerMotion";
import { LayerMaskSection } from "./LayerMaskSection";
import { AlertTriangle, Copy, Image as ImageIcon, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
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
  type AnimatedProperty,
  type CompositionLayer,
  type LayerFields,
  type LayerKind,
  type LayerTransform,
  type ProjectState,
  layerContinuity,
  outdatedLayers,
} from "@/core";
import { layerFieldsOf, regroupFields, translatePath } from "@/core";
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
          aria-label={`${label} (fargevelger)`}
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
}) {
  const [error, setError] = useState<string | null>(null);
  const off = !editable;

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
  function toggleKey(property: AnimatedProperty) {
    const has = layer.keyframes.some((k) => k.property === property && k.frame === frame);
    const keyframes = has
      ? removeKeyframesAt(layer.keyframes, frame, [property])
      : setKeyframe(layer.keyframes, property, frame, t[property]);
    apply(has ? "Fjern nøkkelbilde" : "Sett nøkkelbilde", { keyframes });
  }
  const marker = (property: AnimatedProperty, label: string) => (
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
    apply("Endre lagtype", patch);
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
                name: `${f.name} (kopi)`.slice(0, 200),
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
        `Dupliser lag «${layer.name}»`,
      ),
    );
  }

  function remove() {
    setError(removeLayer(run, state, layer, frame, `Slett lag «${layer.name}»`));
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
  const selectClass = inputClass;
  const isGroup = layer.kind === "group";
  const groups = isGroup ? [] : layersOf(state, composition.id).filter((l) => l.kind === "group");

  return (
    <div aria-label="Egenskaper for lag" className="p-3">
      <Section title="Lag">
        <TextField
          label="Navn"
          value={layer.name}
          disabled={off}
          onCommit={(name) => apply("Endre navn på lag", { name })}
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
          <Field label="Gruppe">
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
                    g ? `Legg «${layer.name}» i «${g.name}»` : "Ta ut av gruppe",
                  ),
                );
              }}
              className={selectClass}
            >
              <option value="">Ingen gruppe</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || "Gruppe"}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {isGroup ? (
          <Hint>
            Lagene i gruppen flyttes, roteres og skaleres sammen rundt gruppens ankerpunkt. Velg
            gruppe for et lag under «Gruppe» i lagets egenskaper.
          </Hint>
        ) : null}
      </Section>

      <Section title="Plassering">
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="X (px)"
            marker={marker("x", "X (px)")}
            value={t.x}
            disabled={off}
            onCommit={(x) => setT("Flytt lag", { x })}
          />
          <NumberField
            label="Y (px)"
            marker={marker("y", "Y (px)")}
            value={t.y}
            disabled={off}
            onCommit={(y) => setT("Flytt lag", { y })}
          />
          <NumberField
            label="Skalering X (%)"
            marker={marker("scaleX", "Skalering X (%)")}
            value={t.scaleX * 100}
            disabled={off}
            valid={(n) => n !== 0}
            onCommit={(n) => setT("Skaler lag", { scaleX: n / 100 })}
          />
          <NumberField
            label="Skalering Y (%)"
            marker={marker("scaleY", "Skalering Y (%)")}
            value={t.scaleY * 100}
            disabled={off}
            valid={(n) => n !== 0}
            onCommit={(n) => setT("Skaler lag", { scaleY: n / 100 })}
          />
          <NumberField
            label="Rotasjon (°)"
            marker={marker("rotation", "Rotasjon (°)")}
            value={t.rotation}
            disabled={off}
            onCommit={(rotation) => setT("Roter lag", { rotation })}
          />
          <NumberField
            label="Gjennomsiktighet (%)"
            marker={marker("opacity", "Gjennomsiktighet (%)")}
            value={t.opacity * 100}
            disabled={off}
            min={0}
            max={100}
            onCommit={(n) => setT("Endre gjennomsiktighet", { opacity: n / 100 })}
          />
        </div>
      </Section>

      {isGroup ? null : (
        <Section title="Dybde">
          <NumberField
            label="Parallakse"
            value={layer.parallax}
            disabled={off}
            step={0.05}
            min={0}
            max={4}
            onCommit={(parallax) => apply("Endre parallakse", { parallax })}
          />
          <Hint>
            0 = står stille når kameraet beveger seg · 1 = følger scenen · over 1 = nærmere enn
            scenen
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
        />
      )}

      {isGroup ? null : (
        <Section title="Bilde">
          {onOpenImage ? (
            <Button size="sm" variant="secondary" className="self-start" onClick={onOpenImage}>
              <ImageIcon />
              {layer.assetId ? "Velg eller last opp bilde …" : "Koble til ressurs …"}
            </Button>
          ) : null}
          {layer.assetId ? (
            <>
              <p className="truncate text-[13px] text-text-primary">
                {asset?.name ?? "Ukjent ressurs"}
              </p>
              <Field label="Variant">
                <select
                  value={layer.assetVariantId ?? ""}
                  disabled={off}
                  onChange={(e) =>
                    apply("Bytt bilde", {
                      assetVariantId: (e.target.value || null) as LayerFields["assetVariantId"],
                      versionId: null,
                    })
                  }
                  className={selectClass}
                >
                  <option value="">Standard (forsidebildet)</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name || "Uten navn"}
                      {v.archived ? " (arkivert)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Versjon">
                <select
                  value={layer.versionId ?? ""}
                  disabled={off || layer.assetVariantId === null}
                  onChange={(e) =>
                    apply("Bytt bilde", {
                      versionId: (e.target.value || null) as LayerFields["versionId"],
                    })
                  }
                  className={selectClass}
                >
                  <option value="">Godkjent / nyeste</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.number}
                      {v.id === approvedId ? " (godkjent)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              {layer.assetVariantId === null ? (
                <Hint>Velg en variant for å låse en bestemt versjon.</Hint>
              ) : null}
              {outdated ? (
                <div className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface-2 p-2 text-xs text-text-primary">
                  <span>
                    Laget viser v{state.assetVersions[outdated.versionId]?.number}, men v
                    {state.assetVersions[outdated.approvedVersionId]?.number} er godkjent nå.
                  </span>
                  {editable ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="self-start"
                      onClick={() =>
                        apply("Bruk den godkjente versjonen", {
                          versionId: outdated.approvedVersionId as LayerFields["versionId"],
                        })
                      }
                    >
                      Bruk v{state.assetVersions[outdated.approvedVersionId]?.number}
                    </Button>
                  ) : null}
                </div>
              ) : null}
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
                      Kontinuitet: i denne scenen skal {asset?.name ?? "ressursen"} ha utseendet «
                      {continuity.expected.name}».
                    </span>
                  </span>
                  {editable ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="self-start"
                      onClick={() =>
                        apply("Bruk utseendet fra kontinuiteten", {
                          assetVariantId: continuity.expected!.id,
                          versionId: null,
                        })
                      }
                    >
                      Bruk «{continuity.expected.name}»
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {variants.length > 0 ? (
                // Språkavhengig bilde (DEC-0059, REQ-0337): f.eks. et skilt med engelsk tekst
                <Field label="Bilde i engelsk versjon">
                  <select
                    aria-label="Bilde i engelsk versjon"
                    value={
                      layer.languageImages?.find((x) => x.language === "en")?.assetVariantId ?? ""
                    }
                    disabled={off}
                    onChange={(e) => {
                      const id = e.target.value;
                      const rest = (layer.languageImages ?? []).filter((x) => x.language !== "en");
                      apply(id ? "Eget bilde i engelsk versjon" : "Samme bilde i engelsk versjon", {
                        languageImages: id
                          ? [
                              ...rest,
                              { language: "en", assetVariantId: id as never, versionId: null },
                            ]
                          : rest,
                      });
                    }}
                    className={selectClass}
                    title="Vis en annen variant av ressursen når filmen spilles eller eksporteres på engelsk. Den norske versjonen endres ikke."
                  >
                    <option value="">Samme som norsk</option>
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name || "Uten navn"}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </>
          ) : (
            <>
              <ColorField
                label="Farge"
                value={layer.fill ?? "#000000"}
                disabled={off}
                onCommit={(fill) => apply("Endre farge", { fill })}
              />
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Bredde (px)"
                  value={layer.width}
                  disabled={off}
                  integer
                  min={1}
                  max={16384}
                  onCommit={(width) => apply("Endre størrelse", { width })}
                />
                <NumberField
                  label="Høyde (px)"
                  value={layer.height}
                  disabled={off}
                  integer
                  min={1}
                  max={16384}
                  onCommit={(height) => apply("Endre størrelse", { height })}
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

      <Section title="Synlighet">
        <label className="flex items-center gap-2 text-[13px] text-text-primary">
          <input
            type="checkbox"
            checked={layer.visible}
            disabled={off}
            onChange={(e) =>
              apply(e.target.checked ? "Vis lag" : "Skjul lag", { visible: e.target.checked })
            }
            className="size-3.5 accent-[var(--accent-brand)]"
          />
          Synlig
        </label>
        <label className="flex items-center gap-2 text-[13px] text-text-primary">
          <input
            type="checkbox"
            checked={layer.locked}
            disabled={off}
            onChange={(e) =>
              apply(e.target.checked ? "Lås lag" : "Lås opp lag", { locked: e.target.checked })
            }
            className="size-3.5 accent-[var(--accent-brand)]"
          />
          Låst
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
            Dupliser
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={remove}
            className="ml-auto text-status-danger hover:text-status-danger"
          >
            <Trash2 className="size-3.5" />
            Slett lag
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------- Selve 2D-scenen ----------

export function CompositionInspector({
  composition,
  editable,
  run,
}: {
  composition: Composition;
  editable: boolean;
  run: Run;
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
    <div aria-label="Egenskaper for 2D-scenen" className="p-3">
      <h2 className="mb-3 text-[13px] font-medium text-text-primary">2D-scene</h2>
      <Section title="Scene">
        <TextField
          label="Navn"
          value={composition.name}
          disabled={off}
          allowEmpty
          placeholder="Uten navn"
          onCommit={(name) => apply("Endre navn på 2D-scene", { name })}
        />
      </Section>

      <Section title="Format">
        <p className="text-[13px] text-text-secondary">
          {composition.width} × {composition.height} px
        </p>
        <p className="text-xs text-text-tertiary">
          Bildeformat og bildefrekvens gjelder hele prosjektet og endres på prosjektoversikten.
        </p>
      </Section>

      <Section title="Bakgrunn">
        <ColorField
          label="Bakgrunnsfarge"
          value={composition.background}
          disabled={off}
          onCommit={(background) => apply("Endre bakgrunn", { background })}
        />
      </Section>

      <ErrorText message={error} />
      <Hint>Velg et lag i scenen eller i listen for å endre det.</Hint>
    </div>
  );
}
