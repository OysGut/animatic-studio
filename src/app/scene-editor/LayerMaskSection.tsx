/**
 * Maske og blandingsmodus for valgt lag (REQ-0175, mandat 11.2). Hver endring er én UpdateLayers-kommando
 * som kan angres. Rektangel og ellipse måles i lagets egne piksler (0,0 = lagets øverste venstre hjørne),
 * så masken følger laget når det flyttes, skaleres og roteres. Plassering og størrelse kan animeres med
 * nøkkelbilder som lagets egne egenskaper (DEC-0072): tallene viser masken på gjeldende bilde.
 */
import { Field, Hint, KeyMarker, NumberField, Section, inputClass } from "./inspector-fields";
import {
  BLEND_LABEL,
  BLEND_MODES,
  MASK_FIELD,
  MAX_MASK_FEATHER,
  fieldsWithMaskAt,
  isAnimated,
  layerFieldsOf,
  layerSize,
  L,
  layersOf,
  localized,
  maskAt,
  removeKeyframesAt,
  setKeyframe,
  type BlendMode,
  type Composition,
  type CompositionLayer,
  type LayerFields,
  type LayerMask,
  type MaskProperty,
  type MaskRect,
  type ProjectState,
} from "@/core";

type MaskChoice = "none" | "rect" | "ellipse" | "layer";
type ShapeMask = Exclude<LayerMask, { kind: "layer" }>;

const MASK_LABEL: Record<MaskChoice, string> = localized({
  none: ["Ingen", "None"],
  rect: ["Rektangel", "Rectangle"],
  ellipse: ["Ellipse", "Ellipse"],
  layer: ["Bruk et annet lag", "Use another layer"],
});

export function LayerMaskSection({
  state,
  composition,
  layer,
  editable,
  apply,
  frame,
  autoKey,
}: {
  state: ProjectState;
  composition: Composition;
  layer: CompositionLayer;
  editable: boolean;
  apply: (label: string, patch: Partial<LayerFields>) => void;
  /** Gjeldende bilde (avspillingshodet). */
  frame: number;
  /** Automatiske nøkkelbilder: endringer i plassering og størrelse gir nøkkelbilde. */
  autoKey: boolean;
}) {
  const off = !editable;
  const mask = layer.mask ?? null;
  const choice: MaskChoice = mask ? mask.kind : "none";
  // Lag som kan brukes som maske: ikke grupper og ikke laget selv
  const others = layersOf(state, composition.id).filter(
    (l) => l.id !== layer.id && l.kind !== "group",
  );
  const size = layerSize(state, layer);

  function setMask(label: string, next: LayerMask | null) {
    apply(label, { mask: next });
  }

  function changeKind(kind: MaskChoice) {
    if (kind === choice) return;
    if (kind === "none") return setMask(L("Fjern maske", "Remove mask"), null);
    const invert = mask?.invert ?? false;
    if (kind === "layer") {
      const first = others[0];
      if (!first) return;
      return setMask(L("Bruk lag som maske", "Use layer as mask"), {
        kind: "layer",
        layerId: first.id,
        invert,
      });
    }
    // Ny form: behold størrelsen fra forrige form, ellers 80 % av laget midt i laget
    const shape =
      mask && mask.kind !== "layer"
        ? { x: mask.x, y: mask.y, width: mask.width, height: mask.height, feather: mask.feather }
        : {
            x: Math.round(size.width * 0.1),
            y: Math.round(size.height * 0.1),
            width: Math.max(1, Math.round(size.width * 0.8)),
            height: Math.max(1, Math.round(size.height * 0.8)),
            feather: 0,
          };
    setMask(
      kind === "rect" ? L("Rektangelmaske", "Rectangle mask") : L("Ellipsemaske", "Ellipse mask"),
      { kind, ...shape, invert },
    );
  }

  const shape: ShapeMask | null = mask && mask.kind !== "layer" ? mask : null;
  const setShape = (label: string, patch: Partial<ShapeMask>) => {
    if (shape) setMask(label, { ...shape, ...patch });
  };
  // Masken på gjeldende bilde (følger nøkkelbildene, DEC-0072)
  const nowMask = maskAt(layer, frame);
  const now: ShapeMask | null = nowMask && nowMask.kind !== "layer" ? nowMask : null;
  /** Ny plassering eller størrelse på gjeldende bilde (nøkkelbilde når den er animert eller ved autoKey). */
  const setRect = (label: string, patch: Partial<MaskRect>) => {
    if (!now) return;
    const f = fieldsWithMaskAt(
      layer,
      layerFieldsOf(layer),
      frame,
      { ...now, ...patch },
      { autoKey },
    );
    apply(label, { mask: f.mask ?? null, keyframes: f.keyframes });
  };
  /** Setter eller fjerner nøkkelbildet for én av maskens egenskaper på gjeldende bilde. */
  function toggleKey(property: MaskProperty) {
    if (!now) return;
    const has = layer.keyframes.some((k) => k.property === property && k.frame === frame);
    const keyframes = has
      ? removeKeyframesAt(layer.keyframes, frame, [property])
      : setKeyframe(layer.keyframes, property, frame, now[MASK_FIELD[property]]);
    apply(
      has
        ? L("Fjern nøkkelbilde for maske", "Remove keyframe for mask")
        : L("Sett nøkkelbilde for maske", "Set keyframe for mask"),
      { keyframes },
    );
  }
  const marker = (property: MaskProperty, label: string) => (
    <KeyMarker
      label={label}
      animated={isAnimated(layer, property)}
      keyed={layer.keyframes.some((k) => k.property === property && k.frame === frame)}
      disabled={off}
      onToggle={() => toggleKey(property)}
    />
  );

  return (
    <Section title={L("Maske og blanding", "Mask and blend")}>
      <Field label={L("Maske", "Mask")}>
        <select
          aria-label={L("Maske", "Mask")}
          value={choice}
          disabled={off}
          onChange={(e) => changeKind(e.target.value as MaskChoice)}
          className={inputClass}
        >
          {(Object.keys(MASK_LABEL) as MaskChoice[]).map((k) => (
            <option key={k} value={k} disabled={k === "layer" && others.length === 0}>
              {MASK_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      {mask?.kind === "layer" ? (
        <>
          <Field label={L("Maskelag", "Mask layer")}>
            <select
              aria-label={L("Maskelag", "Mask layer")}
              value={mask.layerId}
              disabled={off}
              onChange={(e) =>
                setMask(L("Bytt maskelag", "Change mask layer"), {
                  ...mask,
                  layerId: e.target.value,
                })
              }
              className={inputClass}
            >
              {state.layers[mask.layerId] && !others.some((l) => l.id === mask.layerId) ? (
                <option value={mask.layerId}>
                  {state.layers[mask.layerId]!.name || L("Uten navn", "Untitled")} (
                  {L("slettet", "deleted")})
                </option>
              ) : null}
              {!state.layers[mask.layerId] ? (
                <option value={mask.layerId}>
                  {L("Laget finnes ikke", "The layer does not exist")}
                </option>
              ) : null}
              {others.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name || L("Uten navn", "Untitled")}
                </option>
              ))}
            </select>
          </Field>
          <Hint>
            {L(
              "Laget vises bare der maskelaget dekker. Skjul maskelaget hvis det ikke skal synes selv.",
              "The layer is shown only where the mask layer covers. Hide the mask layer if it should not show itself.",
            )}
          </Hint>
        </>
      ) : null}
      {shape && now ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="X (px)"
            value={now.x}
            disabled={off}
            marker={marker("maskX", L("Maske X (px)", "Mask X (px)"))}
            onCommit={(x) => setRect(L("Flytt maske", "Move mask"), { x })}
          />
          <NumberField
            label="Y (px)"
            value={now.y}
            disabled={off}
            marker={marker("maskY", L("Maske Y (px)", "Mask Y (px)"))}
            onCommit={(y) => setRect(L("Flytt maske", "Move mask"), { y })}
          />
          <NumberField
            label={L("Bredde (px)", "Width (px)")}
            value={now.width}
            disabled={off}
            valid={(n) => n > 0}
            marker={marker("maskWidth", L("Maskebredde (px)", "Mask width (px)"))}
            onCommit={(width) => setRect(L("Endre størrelse på maske", "Resize mask"), { width })}
          />
          <NumberField
            label={L("Høyde (px)", "Height (px)")}
            value={now.height}
            disabled={off}
            valid={(n) => n > 0}
            marker={marker("maskHeight", L("Maskehøyde (px)", "Mask height (px)"))}
            onCommit={(height) => setRect(L("Endre størrelse på maske", "Resize mask"), { height })}
          />
          <NumberField
            label={L("Myk kant (px)", "Feather (px)")}
            value={shape.feather}
            disabled={off}
            min={0}
            max={MAX_MASK_FEATHER}
            onCommit={(feather) => setShape(L("Endre myk kant", "Change feather"), { feather })}
          />
        </div>
      ) : null}
      {mask ? (
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={mask.invert}
            disabled={off}
            onChange={(e) =>
              setMask(
                e.target.checked
                  ? L("Snu masken", "Invert the mask")
                  : L("Snu masken tilbake", "Revert the mask inversion"),
                {
                  ...mask,
                  invert: e.target.checked,
                },
              )
            }
          />
          {L("Snu masken", "Invert the mask")}
        </label>
      ) : null}
      {shape ? (
        <Hint>
          {L("Målt i lagets egne piksler", "Measured in the layer's own pixels")} (
          {Math.round(size.width)} × {Math.round(size.height)}){" "}
          {L("fra øverste venstre hjørne.", "from the top left corner.")}{" "}
          {L(
            "Masken følger laget. Dra midtpunktet eller hjørnene på masken i scenen, og sett nøkkelbilder for å animere den.",
            "The mask follows the layer. Drag the midpoint or the corners of the mask in the scene, and set keyframes to animate it.",
          )}
        </Hint>
      ) : null}
      <Field label={L("Blanding", "Blend")}>
        <select
          aria-label={L("Blanding", "Blend")}
          value={layer.blend ?? "normal"}
          disabled={off}
          onChange={(e) => {
            const b = BLEND_MODES.find((x) => x === e.target.value) as BlendMode | undefined;
            if (b && b !== (layer.blend ?? "normal"))
              apply(L(`Blanding: ${BLEND_LABEL[b]}`, `Blend: ${BLEND_LABEL[b]}`), { blend: b });
          }}
          className={inputClass}
        >
          {BLEND_MODES.map((b) => (
            <option key={b} value={b}>
              {BLEND_LABEL[b]}
            </option>
          ))}
        </select>
      </Field>
    </Section>
  );
}
