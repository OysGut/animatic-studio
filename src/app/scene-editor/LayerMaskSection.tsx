/**
 * Maske og blandingsmodus for valgt lag (REQ-0175, mandat 11.2). Hver endring er én UpdateLayers-kommando
 * som kan angres. Rektangel og ellipse måles i lagets egne piksler (0,0 = lagets øverste venstre hjørne),
 * så masken følger laget når det flyttes, skaleres og roteres. Plassering og størrelse kan animeres med
 * nøkkelbilder som lagets egne egenskaper (DEC-0072): tallene viser masken på gjeldende bilde.
 */
import { Field, Hint, KeyMarker, NumberField, Section, inputClass } from "./inspector-fields";
import { BLEND_LABEL, BLEND_MODES, MASK_FIELD, MAX_MASK_FEATHER, fieldsWithMaskAt, isAnimated, layerFieldsOf, layerSize, layersOf, maskAt, removeKeyframesAt, setKeyframe, type BlendMode, type Composition, type CompositionLayer, type LayerFields, type LayerMask, type MaskProperty, type MaskRect, type ProjectState } from "@/core";
import { t, tLocalized } from "@/core/i18n/keyed";

type MaskChoice = "none" | "rect" | "ellipse" | "layer";
type ShapeMask = Exclude<LayerMask, { kind: "layer" }>;

const MASK_LABEL: Record<MaskChoice, string> = tLocalized({ none: "app-scene-editor-layer-mask-section.mask-label.none.5b5854e79a9c", rect: "app-scene-editor-layer-mask-section.mask-label.rect.d38f1a5c9698", ellipse: "app-scene-editor-layer-mask-section.mask-label.ellipse.4fcaaf762aa4", layer: "app-scene-editor-layer-mask-section.mask-label.layer.b0665d381c77" });

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
    if (kind === "none") return setMask(t("app-scene-editor-layer-mask-section.change-kind.set-mask.6b4a3280f2a6"), null);
    const invert = mask?.invert ?? false;
    if (kind === "layer") {
      const first = others[0];
      if (!first) return;
      return setMask(t("app-scene-editor-layer-mask-section.change-kind.set-mask.a944c6d7c8aa"), {
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
      kind === "rect" ? t("app-scene-editor-layer-mask-section.change-kind.set-mask.5bb0e4978d40") : t("app-scene-editor-layer-mask-section.change-kind.set-mask.cf83a0e4c7fa"),
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
        ? t("app-scene-editor-layer-mask-section.toggle-key.apply.d60fc2cff470")
        : t("app-scene-editor-layer-mask-section.toggle-key.apply.e28cc7c22f8a"),
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
    <Section title={t("app-scene-editor-layer-mask-section.layer-mask-section.title.6ed7ad60aecf")}>
      <Field label={t("app-scene-editor-layer-mask-section.layer-mask-section.label.54780a40f896")}>
        <select
          aria-label={t("app-scene-editor-layer-mask-section.layer-mask-section.aria-label.54780a40f896")}
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
          <Field label={t("app-scene-editor-layer-mask-section.layer-mask-section.label.26c444143440")}>
            <select
              aria-label={t("app-scene-editor-layer-mask-section.layer-mask-section.aria-label.26c444143440")}
              value={mask.layerId}
              disabled={off}
              onChange={(e) =>
                setMask(t("app-scene-editor-layer-mask-section.layer-mask-section.set-mask.7afcdb47a5e2"), {
                  ...mask,
                  layerId: e.target.value,
                })
              }
              className={inputClass}
            >
              {state.layers[mask.layerId] && !others.some((l) => l.id === mask.layerId) ? (
                <option value={mask.layerId}>
                  {state.layers[mask.layerId]!.name || t("app-scene-editor-layer-mask-section.layer-mask-section.option.d33ad9d0215c")} (
                  {t("app-scene-editor-layer-mask-section.layer-mask-section.option.325b8aebfae6")})
                </option>
              ) : null}
              {!state.layers[mask.layerId] ? (
                <option value={mask.layerId}>
                  {t("app-scene-editor-layer-mask-section.layer-mask-section.option.794abb4adb73")}
                </option>
              ) : null}
              {others.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name || t("app-scene-editor-layer-mask-section.layer-mask-section.option.d33ad9d0215c.2")}
                </option>
              ))}
            </select>
          </Field>
          <Hint>
            {t("app-scene-editor-layer-mask-section.layer-mask-section.hint.d83380fb2fc6")}
          </Hint>
        </>
      ) : null}
      {shape && now ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="X (px)"
            value={now.x}
            disabled={off}
            marker={marker("maskX", t("app-scene-editor-layer-mask-section.layer-mask-section.marker.96619dad9b7f"))}
            onCommit={(x) => setRect(t("app-scene-editor-layer-mask-section.layer-mask-section.set-rect.2e5db6787d89"), { x })}
          />
          <NumberField
            label="Y (px)"
            value={now.y}
            disabled={off}
            marker={marker("maskY", t("app-scene-editor-layer-mask-section.layer-mask-section.marker.63b6e77d31af"))}
            onCommit={(y) => setRect(t("app-scene-editor-layer-mask-section.layer-mask-section.set-rect.2e5db6787d89.2"), { y })}
          />
          <NumberField
            label={t("app-scene-editor-layer-mask-section.layer-mask-section.label.8c35e7859bc9")}
            value={now.width}
            disabled={off}
            valid={(n) => n > 0}
            marker={marker("maskWidth", t("app-scene-editor-layer-mask-section.layer-mask-section.marker.75839cbf8c19"))}
            onCommit={(width) => setRect(t("app-scene-editor-layer-mask-section.layer-mask-section.set-rect.477b61a3b09d"), { width })}
          />
          <NumberField
            label={t("app-scene-editor-layer-mask-section.layer-mask-section.label.531d6ca01bd1")}
            value={now.height}
            disabled={off}
            valid={(n) => n > 0}
            marker={marker("maskHeight", t("app-scene-editor-layer-mask-section.layer-mask-section.marker.36d62c6acd64"))}
            onCommit={(height) => setRect(t("app-scene-editor-layer-mask-section.layer-mask-section.set-rect.477b61a3b09d.2"), { height })}
          />
          <NumberField
            label={t("app-scene-editor-layer-mask-section.layer-mask-section.label.0e395c28826f")}
            value={shape.feather}
            disabled={off}
            min={0}
            max={MAX_MASK_FEATHER}
            onCommit={(feather) => setShape(t("app-scene-editor-layer-mask-section.layer-mask-section.set-shape.b647848d2291"), { feather })}
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
                  ? t("app-scene-editor-layer-mask-section.layer-mask-section.set-mask.a11eb6e9b279")
                  : t("app-scene-editor-layer-mask-section.layer-mask-section.set-mask.eb1c49b35641"),
                {
                  ...mask,
                  invert: e.target.checked,
                },
              )
            }
          />
          {t("app-scene-editor-layer-mask-section.layer-mask-section.label.a11eb6e9b279")}
        </label>
      ) : null}
      {shape ? (
        <Hint>
          {t("app-scene-editor-layer-mask-section.layer-mask-section.hint.283ccf1f1faf")} (
          {Math.round(size.width)} × {Math.round(size.height)}){" "}
          {t("app-scene-editor-layer-mask-section.layer-mask-section.hint.83ffbc5c204e")}{" "}
          {t("app-scene-editor-layer-mask-section.layer-mask-section.hint.d1934ee63424")}
        </Hint>
      ) : null}
      <Field label={t("app-scene-editor-layer-mask-section.layer-mask-section.label.4a1c475f64ff")}>
        <select
          aria-label={t("app-scene-editor-layer-mask-section.layer-mask-section.aria-label.4a1c475f64ff")}
          value={layer.blend ?? "normal"}
          disabled={off}
          onChange={(e) => {
            const b = BLEND_MODES.find((x) => x === e.target.value) as BlendMode | undefined;
            if (b && b !== (layer.blend ?? "normal"))
              apply(t("app-scene-editor-layer-mask-section.layer-mask-section.apply.8fbbd1fea987", { value1: String(BLEND_LABEL[b]) }), { blend: b });
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
