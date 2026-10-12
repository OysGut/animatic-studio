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
  layersOf,
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

const MASK_LABEL: Record<MaskChoice, string> = {
  none: "Ingen",
  rect: "Rektangel",
  ellipse: "Ellipse",
  layer: "Bruk et annet lag",
};

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
    if (kind === "none") return setMask("Fjern maske", null);
    const invert = mask?.invert ?? false;
    if (kind === "layer") {
      const first = others[0];
      if (!first) return;
      return setMask("Bruk lag som maske", { kind: "layer", layerId: first.id, invert });
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
    setMask(kind === "rect" ? "Rektangelmaske" : "Ellipsemaske", { kind, ...shape, invert });
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
    apply(has ? "Fjern nøkkelbilde for maske" : "Sett nøkkelbilde for maske", { keyframes });
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
    <Section title="Maske og blanding">
      <Field label="Maske">
        <select
          aria-label="Maske"
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
          <Field label="Maskelag">
            <select
              aria-label="Maskelag"
              value={mask.layerId}
              disabled={off}
              onChange={(e) => setMask("Bytt maskelag", { ...mask, layerId: e.target.value })}
              className={inputClass}
            >
              {state.layers[mask.layerId] && !others.some((l) => l.id === mask.layerId) ? (
                <option value={mask.layerId}>
                  {state.layers[mask.layerId]!.name || "Uten navn"} (slettet)
                </option>
              ) : null}
              {!state.layers[mask.layerId] ? (
                <option value={mask.layerId}>Laget finnes ikke</option>
              ) : null}
              {others.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name || "Uten navn"}
                </option>
              ))}
            </select>
          </Field>
          <Hint>
            Laget vises bare der maskelaget dekker. Skjul maskelaget hvis det ikke skal synes selv.
          </Hint>
        </>
      ) : null}
      {shape && now ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="X (px)"
            value={now.x}
            disabled={off}
            marker={marker("maskX", "Maske X (px)")}
            onCommit={(x) => setRect("Flytt maske", { x })}
          />
          <NumberField
            label="Y (px)"
            value={now.y}
            disabled={off}
            marker={marker("maskY", "Maske Y (px)")}
            onCommit={(y) => setRect("Flytt maske", { y })}
          />
          <NumberField
            label="Bredde (px)"
            value={now.width}
            disabled={off}
            valid={(n) => n > 0}
            marker={marker("maskWidth", "Maskebredde (px)")}
            onCommit={(width) => setRect("Endre størrelse på maske", { width })}
          />
          <NumberField
            label="Høyde (px)"
            value={now.height}
            disabled={off}
            valid={(n) => n > 0}
            marker={marker("maskHeight", "Maskehøyde (px)")}
            onCommit={(height) => setRect("Endre størrelse på maske", { height })}
          />
          <NumberField
            label="Myk kant (px)"
            value={shape.feather}
            disabled={off}
            min={0}
            max={MAX_MASK_FEATHER}
            onCommit={(feather) => setShape("Endre myk kant", { feather })}
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
              setMask(e.target.checked ? "Snu masken" : "Snu masken tilbake", {
                ...mask,
                invert: e.target.checked,
              })
            }
          />
          Snu masken
        </label>
      ) : null}
      {shape ? (
        <Hint>
          Målt i lagets egne piksler ({Math.round(size.width)} × {Math.round(size.height)}) fra
          øverste venstre hjørne. Masken følger laget. Dra midtpunktet eller hjørnene på masken i
          scenen, og sett nøkkelbilder for å animere den.
        </Hint>
      ) : null}
      <Field label="Blanding">
        <select
          aria-label="Blanding"
          value={layer.blend ?? "normal"}
          disabled={off}
          onChange={(e) => {
            const b = BLEND_MODES.find((x) => x === e.target.value) as BlendMode | undefined;
            if (b && b !== (layer.blend ?? "normal"))
              apply(`Blanding: ${BLEND_LABEL[b]}`, { blend: b });
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
