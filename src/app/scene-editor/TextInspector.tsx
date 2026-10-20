/**
 * Egenskaper for tekst, form, effekter, inn-/utanimasjon og mal (MTS MT2–MT5). Delene vises i det vanlige
 * egenskapspanelet for laget. Hver endring er én UpdateLayers-kommando (kan angres), som i resten av panelet.
 */
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  FONT_CATALOG,
  L,
  MAX_TEXT_CHARS,
  MOTION_PRESETS,
  MOTION_PRESET_LABEL,
  TEMPLATE_CATEGORIES,
  applyMotionPreset,
  letterAnimWith,
  normalizeLetterAnim,
  presetWindow,
  fontById,
  fpsToNumber,
  layerFieldsOf,
  newerTemplateVersion,
  normalizeColor,
  type Composition,
  type CompositionLayer,
  type LayerEffects,
  type LayerFields,
  type LetterAnimation,
  type MotionPreset,
  type PresetDirection,
  type ProjectState,
  type ShapeSpec,
  type TemplateCategory,
  type TextSpec,
} from "@/core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Hint, NumberField, Section, inputClass } from "./inspector-fields";
import { useTextFonts } from "@/engine/typography/fonts";
import {
  saveAsTemplate,
  updateInstanceValues,
  updateInstanceVersion,
  type Run,
  type RunAndWait,
} from "./mts-actions";
import { t } from "@/core/i18n/keyed";

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  get lower_third() {
    return t("app-scene-editor-text-inspector.category-label.message.20382ac35166");
  },
  get title() {
    return t("app-scene-editor-text-inspector.category-label.message.f6c3b9aa603d");
  },
  get text_card() {
    return t("app-scene-editor-text-inspector.category-label.message.6ab90540dba7");
  },
  get text_object() {
    return t("app-scene-editor-text-inspector.category-label.message.e42ec243a038");
  },
  get credits() {
    return t("app-scene-editor-text-inspector.category-label.message.81e7744850ab");
  },
};

function Color({
  label,
  value,
  onCommit,
  disabled,
  testId,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  disabled: boolean;
  testId?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-text-secondary">
      <span>{label}</span>
      <input
        type="color"
        aria-label={label}
        data-testid={testId}
        value={normalizeColor(value) ?? "#000000"}
        disabled={disabled}
        onChange={(e) => {
          const c = normalizeColor(e.target.value);
          if (c) onCommit(c);
        }}
        className="h-7 w-9 shrink-0 cursor-pointer rounded-sm border border-border-control bg-surface-3 p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}

export function TextInspector({
  state,
  composition,
  layer,
  editable,
  run,
  frame,
  durationFrames,
  projectId,
  runAndWait,
  onError,
}: {
  state: ProjectState;
  composition: Composition;
  layer: CompositionLayer;
  editable: boolean;
  run: Run;
  frame: number;
  durationFrames: number;
  projectId?: string;
  runAndWait?: RunAndWait;
  onError: (e: string | null) => void;
}) {
  const off = !editable;
  function apply(label: string, patch: Partial<LayerFields>) {
    onError(
      run(
        { type: "UpdateLayers", layers: [{ layerId: layer.id, fields: { ...layerFieldsOf(layer), ...patch } }] },
        label,
      ),
    );
  }
  const text = layer.kind === "text" ? (layer.text ?? null) : null;
  const isFill = layer.kind !== "text" && layer.kind !== "group" && layer.fill !== null && layer.assetId === null;
  return (
    <>
      {text ? <TextSection text={text} off={off} apply={apply} /> : null}
      {text ? <LetterSection text={text} off={off} apply={apply} /> : null}
      {isFill ? <ShapeSection shape={layer.shape ?? null} off={off} apply={apply} /> : null}
      {layer.kind !== "group" ? (
        <EffectsSection effects={layer.effects ?? null} off={off} apply={apply} />
      ) : null}
      <PresetSection
        layer={layer}
        off={off}
        apply={apply}
        frame={frame}
        durationFrames={durationFrames}
        fps={fpsToNumber(state.project.fps)}
      />
      <TemplateSection
        state={state}
        composition={composition}
        layer={layer}
        off={off}
        run={run}
        frame={frame}
        onError={onError}
        {...(projectId && runAndWait ? { projectId, runAndWait } : {})}
      />
    </>
  );
}

// ---------- Tekst (MT2) ----------

function TextSection({
  text,
  off,
  apply,
}: {
  text: TextSpec;
  off: boolean;
  apply: (label: string, patch: Partial<LayerFields>) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const fonts = useTextFonts([text]);
  const font = fontById(text.fontId);
  const set = (label: string, p: Partial<TextSpec>) => apply(label, { text: { ...text, ...p } });
  const value = draft ?? text.content;
  const tooLong = value.length > MAX_TEXT_CHARS;
  const label = t("app-scene-editor-text-inspector.label.message.5f575c69272d");
  return (
    <Section title={t("app-scene-editor-text-inspector.text-section.title.7976b553e93e")}>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        <span>{t("app-scene-editor-text-inspector.text-section.span.3ea2ff1c5e24")}</span>
        <textarea
          data-testid="mts-text-content"
          className={inputClass + " h-20 py-1"}
          value={value}
          disabled={off}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== null && draft !== text.content && !tooLong) set(label, { content: draft });
            if (!tooLong) setDraft(null);
          }}
        />
        <span
          data-testid="mts-text-count"
          className={tooLong ? "text-status-danger" : "text-text-tertiary"}
          role={tooLong ? "alert" : undefined}
        >
          {tooLong
            ? t("app-scene-editor-text-inspector.text-section.span.2124b4882462", { length: String(value.length), MAX_TEXT_CHARS: String(MAX_TEXT_CHARS) })
            : t("app-scene-editor-text-inspector.text-section.span.23cd0dbe0dc7", { length: String(value.length), MAX_TEXT_CHARS: String(MAX_TEXT_CHARS) })}
        </span>
      </label>
      <Field label={t("app-scene-editor-text-inspector.text-section.label.0286fd399ac1")}>
        <select
          data-testid="mts-font"
          className={inputClass}
          value={text.fontId}
          disabled={off}
          onChange={(e) => set(t("app-scene-editor-text-inspector.text-section.set.368732226d08"), { fontId: e.target.value })}
        >
          {FONT_CATALOG.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
      {fonts.missing.length > 0 ? (
        <p role="alert" data-testid="mts-font-missing" className="flex items-start gap-1 text-xs text-status-discrepancy">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("app-scene-editor-text-inspector.text-section.p.2cfcace8eeb3", { value1: String(fonts.missing.join(", ")) })}
        </p>
      ) : null}
      {font ? (
        <Hint>
          {t("app-scene-editor-text-inspector.text-section.hint.39ba46a10c55", { license: String(font.license), source: String(font.source) })}
        </Hint>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label={t("app-scene-editor-text-inspector.text-section.label.6e2162a63710")}
          value={text.size}
          min={1}
          max={2000}
          disabled={off}
          onCommit={(size) => set(t("app-scene-editor-text-inspector.text-section.set.e7ddb0a9a187"), { size })}
        />
        <Field label={t("app-scene-editor-text-inspector.text-section.label.67a824460feb")}>
          <select
            data-testid="mts-weight"
            className={inputClass}
            value={text.weight}
            disabled={off}
            onChange={(e) => set(t("app-scene-editor-text-inspector.text-section.set.d34f87e78fbc"), { weight: Number(e.target.value) })}
          >
            {(font?.weights ?? [400, 700]).map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </Field>
        <NumberField
          label={t("app-scene-editor-text-inspector.text-section.label.4d328e0d6426")}
          value={text.letterSpacing}
          min={-500}
          max={500}
          disabled={off}
          onCommit={(letterSpacing) => set(t("app-scene-editor-text-inspector.text-section.set.70f1045f1fe5"), { letterSpacing })}
        />
        <NumberField
          label={t("app-scene-editor-text-inspector.text-section.label.baeab00169d8")}
          value={text.lineHeight}
          step={0.05}
          min={0.5}
          max={4}
          disabled={off}
          onCommit={(lineHeight) => set(t("app-scene-editor-text-inspector.text-section.set.8df602791835"), { lineHeight })}
        />
      </div>
      <Color
        label={t("app-scene-editor-text-inspector.text-section.label.d824ce94cafe")}
        testId="mts-text-color"
        value={text.color}
        disabled={off}
        onCommit={(color) => set(t("app-scene-editor-text-inspector.text-section.set.89424a182e1d"), { color })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("app-scene-editor-text-inspector.text-section.label.760241859576")}>
          <select
            data-testid="mts-align"
            className={inputClass}
            value={text.align}
            disabled={off}
            onChange={(e) => set(t("app-scene-editor-text-inspector.text-section.set.9c02eda8f51c"), { align: e.target.value as TextSpec["align"] })}
          >
            <option value="left">{t("app-scene-editor-text-inspector.text-section.option.dc5019a86592")}</option>
            <option value="center">{t("app-scene-editor-text-inspector.text-section.option.5066ba20a778")}</option>
            <option value="right">{t("app-scene-editor-text-inspector.text-section.option.dc2e3a16a480")}</option>
          </select>
        </Field>
        <Field label={t("app-scene-editor-text-inspector.text-section.label.227941359fe2")}>
          <select
            className={inputClass}
            value={text.vAlign}
            disabled={off}
            onChange={(e) => set(t("app-scene-editor-text-inspector.text-section.set.9c02eda8f51c.2"), { vAlign: e.target.value as TextSpec["vAlign"] })}
          >
            <option value="top">{t("app-scene-editor-text-inspector.text-section.option.4a9ef4e5a031")}</option>
            <option value="middle">{t("app-scene-editor-text-inspector.text-section.option.51bf00f6e117")}</option>
            <option value="bottom">{t("app-scene-editor-text-inspector.text-section.option.36df391b07fe")}</option>
          </select>
        </Field>
      </div>
      <div className="flex gap-4 text-xs text-text-secondary">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={text.italic}
            disabled={off}
            onChange={(e) => set(t("app-scene-editor-text-inspector.text-section.set.d932624f2c61"), { italic: e.target.checked })}
          />
          {t("app-scene-editor-text-inspector.text-section.label.d932624f2c61")}
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={text.wrap}
            disabled={off}
            onChange={(e) => set(t("app-scene-editor-text-inspector.text-section.set.06715f50e8ec"), { wrap: e.target.checked })}
          />
          {t("app-scene-editor-text-inspector.text-section.label.fecef2f2beb0")}
        </label>
      </div>
    </Section>
  );
}

// ---------- Bokstavanimasjon (MT3, §9, §29) ----------


function LetterSection({
  text,
  off,
  apply,
}: {
  text: TextSpec;
  off: boolean;
  apply: (label: string, patch: Partial<LayerFields>) => void;
}) {
  const a = text.letterAnim ?? null;
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<LetterAnimation> | null) => {
    // Mangler laget bokstavanimasjon, brukes standardverdiene (enhet, forsinkelse, varighet …)
    const next = p === null ? null : letterAnimWith(a, p);
    const checked = normalizeLetterAnim(next);
    if (!checked.ok) {
      setErr(checked.error);
      return;
    }
    setErr(null);
    apply(t("app-scene-editor-text-inspector.set.apply.a1c6dfc18e85"), { text: { ...text, letterAnim: checked.value } });
  };
  return (
    <Section title={t("app-scene-editor-text-inspector.letter-section.title.f24ba95e9ad1")}>
      {err ? (
        <p role="alert" data-testid="mts-letter-error" className="text-xs text-status-discrepancy">
          {err}
        </p>
      ) : null}
      <Field label={t("app-scene-editor-text-inspector.letter-section.label.116dc40a203c")}>
        <select
          data-testid="mts-letter-effect"
          className={inputClass}
          value={a?.effect ?? "none"}
          disabled={off}
          onChange={(e) =>
            e.target.value === "none" ? set(null) : set({ effect: e.target.value as LetterAnimation["effect"] })
          }
        >
          <option value="none">{t("app-scene-editor-text-inspector.letter-section.option.e260952cb446")}</option>
          <option value="appear">{t("app-scene-editor-text-inspector.letter-section.option.c1d3537f209b")}</option>
          <option value="fade">{t("app-scene-editor-text-inspector.letter-section.option.1e19ace0be4d")}</option>
          <option value="slide">{t("app-scene-editor-text-inspector.letter-section.option.75d3f6f78f64")}</option>
          <option value="scale">{t("app-scene-editor-text-inspector.letter-section.option.d5674df1f7a5")}</option>
        </select>
      </Field>
      {a ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("app-scene-editor-text-inspector.letter-section.label.21d712a73c9f")}>
            <select
              data-testid="mts-letter-unit"
              className={inputClass}
              value={a.unit}
              disabled={off}
              onChange={(e) => set({ unit: e.target.value as LetterAnimation["unit"] })}
            >
              <option value="letter">{t("app-scene-editor-text-inspector.letter-section.option.a8f45b31b2bd")}</option>
              <option value="word">{t("app-scene-editor-text-inspector.letter-section.option.a519beb728e3")}</option>
              <option value="line">{t("app-scene-editor-text-inspector.letter-section.option.50a594e6b3cc")}</option>
            </select>
          </Field>
          <Field label={t("app-scene-editor-text-inspector.letter-section.label.329318247726")}>
            <select
              className={inputClass}
              value={a.order}
              disabled={off}
              onChange={(e) => set({ order: e.target.value as LetterAnimation["order"] })}
            >
              <option value="start">{t("app-scene-editor-text-inspector.letter-section.option.6e4ff510b53f")}</option>
              <option value="end">{t("app-scene-editor-text-inspector.letter-section.option.e07af7e4986e")}</option>
              <option value="center">{t("app-scene-editor-text-inspector.letter-section.option.7db911814b35")}</option>
              <option value="random">{t("app-scene-editor-text-inspector.letter-section.option.4ccfaee99bed")}</option>
            </select>
          </Field>
          <NumberField
            label={t("app-scene-editor-text-inspector.letter-section.label.8ddb740ac2e6")}
            value={a.startFrame}
            integer
            min={0}
            disabled={off}
            onCommit={(startFrame) => set({ startFrame })}
          />
          <NumberField
            label={t("app-scene-editor-text-inspector.letter-section.label.9173594af03f")}
            value={a.delayFrames}
            integer
            min={0}
            disabled={off}
            onCommit={(delayFrames) => set({ delayFrames })}
          />
          <NumberField
            label={t("app-scene-editor-text-inspector.letter-section.label.f7f2072642a1")}
            value={a.durationFrames}
            integer
            min={0}
            disabled={off}
            onCommit={(durationFrames) => set({ durationFrames })}
          />
        </div>
      ) : null}
    </Section>
  );
}

// ---------- Form (MT2, §6) ----------

function ShapeSection({
  shape,
  off,
  apply,
}: {
  shape: ShapeSpec | null;
  off: boolean;
  apply: (label: string, patch: Partial<LayerFields>) => void;
}) {
  const s: ShapeSpec = shape ?? { type: "rect", radius: 0, stroke: null };
  const set = (p: Partial<ShapeSpec>) => apply(t("app-scene-editor-text-inspector.set.apply.bd7df46e43ac"), { shape: { ...s, ...p } });
  return (
    <Section title={t("app-scene-editor-text-inspector.shape-section.title.cf0a3d225c6e")}>
      <Field label={t("app-scene-editor-text-inspector.shape-section.label.cf0a3d225c6e")}>
        <select
          data-testid="mts-shape"
          className={inputClass}
          value={shape ? s.type : "none"}
          disabled={off}
          onChange={(e) =>
            e.target.value === "none"
              ? apply(t("app-scene-editor-text-inspector.shape-section.apply.dfe067ffe3ff"), { shape: null })
              : set({ type: e.target.value as ShapeSpec["type"] })
          }
        >
          <option value="none">{t("app-scene-editor-text-inspector.shape-section.option.2e5b9375f9cf")}</option>
          <option value="rect">{t("app-scene-editor-text-inspector.shape-section.option.e5bcf79231a1")}</option>
          <option value="ellipse">{t("app-scene-editor-text-inspector.shape-section.option.4a06e493543f")}</option>
          <option value="line">{t("app-scene-editor-text-inspector.shape-section.option.0c8dc1eccc12")}</option>
        </select>
      </Field>
      {shape?.type === "rect" ? (
        <NumberField
          label={t("app-scene-editor-text-inspector.shape-section.label.66f1f1b45414")}
          value={s.radius}
          min={0}
          max={10000}
          disabled={off}
          onCommit={(radius) => set({ radius })}
        />
      ) : null}
    </Section>
  );
}

// ---------- Effekter (MT2, §7) ----------

function EffectsSection({
  effects,
  off,
  apply,
}: {
  effects: LayerEffects | null;
  off: boolean;
  apply: (label: string, patch: Partial<LayerFields>) => void;
}) {
  const e = effects ?? {};
  const set = (p: Partial<LayerEffects>) => {
    const next = { ...e, ...p };
    const empty = !next.shadow && !next.glow && !next.outline;
    apply(t("app-scene-editor-text-inspector.set.apply.25faac387f73"), { effects: empty ? null : next });
  };
  return (
    <Section title={t("app-scene-editor-text-inspector.effects-section.title.14c7f7d9ce89")}>
      <label className="flex items-center gap-1.5 text-xs text-text-secondary">
        <input
          type="checkbox"
          data-testid="mts-effect-shadow"
          checked={!!e.shadow}
          disabled={off}
          onChange={(x) =>
            set({ shadow: x.target.checked ? { color: "#000000", blur: 12, offsetX: 4, offsetY: 4 } : null })
          }
        />
        {t("app-scene-editor-text-inspector.effects-section.label.2b1a9a7a805b")}
      </label>
      {e.shadow ? (
        <div className="grid grid-cols-2 gap-2 pl-5">
          <Color label={t("app-scene-editor-text-inspector.effects-section.label.0b16e471cffa")} value={e.shadow.color} disabled={off} onCommit={(color) => set({ shadow: { ...e.shadow!, color } })} />
          <NumberField label={t("app-scene-editor-text-inspector.effects-section.label.681d30682ecf")} value={e.shadow.blur} min={0} max={500} disabled={off} onCommit={(blur) => set({ shadow: { ...e.shadow!, blur } })} />
          <NumberField label="X" value={e.shadow.offsetX} min={-1000} max={1000} disabled={off} onCommit={(offsetX) => set({ shadow: { ...e.shadow!, offsetX } })} />
          <NumberField label="Y" value={e.shadow.offsetY} min={-1000} max={1000} disabled={off} onCommit={(offsetY) => set({ shadow: { ...e.shadow!, offsetY } })} />
        </div>
      ) : null}
      <label className="flex items-center gap-1.5 text-xs text-text-secondary">
        <input
          type="checkbox"
          data-testid="mts-effect-glow"
          checked={!!e.glow}
          disabled={off}
          onChange={(x) => set({ glow: x.target.checked ? { color: "#ffffff", blur: 20 } : null })}
        />
        {t("app-scene-editor-text-inspector.effects-section.label.255214464828")}
      </label>
      {e.glow ? (
        <div className="grid grid-cols-2 gap-2 pl-5">
          <Color label={t("app-scene-editor-text-inspector.effects-section.label.0b16e471cffa.2")} value={e.glow.color} disabled={off} onCommit={(color) => set({ glow: { ...e.glow!, color } })} />
          <NumberField label={t("app-scene-editor-text-inspector.effects-section.label.681d30682ecf.2")} value={e.glow.blur} min={0} max={500} disabled={off} onCommit={(blur) => set({ glow: { ...e.glow!, blur } })} />
        </div>
      ) : null}
      <label className="flex items-center gap-1.5 text-xs text-text-secondary">
        <input
          type="checkbox"
          data-testid="mts-effect-outline"
          checked={!!e.outline}
          disabled={off}
          onChange={(x) => set({ outline: x.target.checked ? { color: "#000000", width: 4 } : null })}
        />
        {t("app-scene-editor-text-inspector.effects-section.label.a5ad8ad2cc88")}
      </label>
      {e.outline ? (
        <div className="grid grid-cols-2 gap-2 pl-5">
          <Color label={t("app-scene-editor-text-inspector.effects-section.label.0b16e471cffa.3")} value={e.outline.color} disabled={off} onCommit={(color) => set({ outline: { ...e.outline!, color } })} />
          <NumberField label={t("app-scene-editor-text-inspector.effects-section.label.349e1b851a7c")} value={e.outline.width} min={0} max={200} disabled={off} onCommit={(width) => set({ outline: { ...e.outline!, width } })} />
        </div>
      ) : null}
    </Section>
  );
}

// ---------- Inn- og utanimasjon (MT3, §8) ----------

function PresetSection({
  layer,
  off,
  apply,
  frame,
  durationFrames,
  fps,
}: {
  layer: CompositionLayer;
  off: boolean;
  apply: (label: string, patch: Partial<LayerFields>) => void;
  frame: number;
  durationFrames: number;
  fps: number;
}) {
  const [preset, setPreset] = useState<MotionPreset>("fade");
  const [dir, setDir] = useState<PresetDirection>("left");
  const [secs, setSecs] = useState(0.5);
  const len = Math.max(1, Math.round(secs * fps));
  const [err, setErr] = useState<string | null>(null);
  function add(phase: "in" | "out") {
    const w = presetWindow(layer, phase, { frame, sceneFrames: durationFrames, durationFrames: len });
    if (!w.ok) {
      setErr(w.reason);
      return;
    }
    setErr(null);
    const startFrame = w.startFrame;
    const keyframes = applyMotionPreset(layer, preset, {
      phase,
      startFrame,
      durationFrames: len,
      direction: dir,
      distance: 200,
    });
    apply(
      phase === "in"
        ? t("app-scene-editor-text-inspector.add.apply.07ca9c795e69", { value1: String(MOTION_PRESET_LABEL[preset]) })
        : t("app-scene-editor-text-inspector.add.apply.2df8d62721ef", { value1: String(MOTION_PRESET_LABEL[preset]) }),
      { keyframes },
    );
  }
  return (
    <Section title={t("app-scene-editor-text-inspector.preset-section.title.2a04b08dd595")}>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("app-scene-editor-text-inspector.preset-section.label.2381622e5aa9")}>
          <select
            data-testid="mts-preset"
            className={inputClass}
            value={preset}
            disabled={off}
            onChange={(e) => setPreset(e.target.value as MotionPreset)}
          >
            {MOTION_PRESETS.map((p) => (
              <option key={p} value={p}>
                {MOTION_PRESET_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <NumberField
          label={t("app-scene-editor-text-inspector.preset-section.label.dd18230f23ab")}
          value={secs}
          step={0.1}
          min={0.04}
          max={60}
          disabled={off}
          onCommit={setSecs}
        />
        {preset === "slide" ? (
          <Field label={t("app-scene-editor-text-inspector.preset-section.label.f9ad5f1245fa")}>
            <select className={inputClass} value={dir} disabled={off} onChange={(e) => setDir(e.target.value as PresetDirection)}>
              <option value="left">{t("app-scene-editor-text-inspector.preset-section.option.640dcf929a12")}</option>
              <option value="right">{t("app-scene-editor-text-inspector.preset-section.option.64faaf30efbb")}</option>
              <option value="up">{t("app-scene-editor-text-inspector.preset-section.option.ccafc0e7d10d")}</option>
              <option value="down">{t("app-scene-editor-text-inspector.preset-section.option.71f6d2e43824")}</option>
            </select>
          </Field>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" data-testid="mts-preset-in" disabled={off} onClick={() => add("in")}>
          {t("app-scene-editor-text-inspector.preset-section.button.4a383fccde6e")}
        </Button>
        <Button size="sm" variant="secondary" data-testid="mts-preset-out" disabled={off} onClick={() => add("out")}>
          {t("app-scene-editor-text-inspector.preset-section.button.7b42f6b2d66f")}
        </Button>
      </div>
      {err ? (
        <p role="alert" data-testid="mts-preset-error" className="text-xs text-status-discrepancy">
          {err}
        </p>
      ) : null}
      <Hint>
        {t("app-scene-editor-text-inspector.preset-section.hint.98d4e693e118")}
      </Hint>
    </Section>
  );
}

// ---------- Mal og innhold (MT4/MT5) ----------

function TemplateSection({
  state,
  composition,
  layer,
  off,
  run,
  frame,
  onError,
  projectId,
  runAndWait,
}: {
  state: ProjectState;
  composition: Composition;
  layer: CompositionLayer;
  off: boolean;
  run: Run;
  frame: number;
  onError: (e: string | null) => void;
  projectId?: string;
  runAndWait?: RunAndWait;
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  const instanceId = layer.template?.instanceId ?? null;
  const inst = instanceId ? state.templateInstances[instanceId] : undefined;
  const ver = inst ? state.assetVersions[inst.templateVersionId] : undefined;
  const def = ver?.template;
  const newer = useMemo(() => (instanceId ? newerTemplateVersion(state, instanceId) : null), [state, instanceId]);
  const newerNumber = newer ? state.assetVersions[newer]?.number : null;
  // Utvalget som lagres: gruppen laget ligger i, ellers laget selv
  const selection = layer.groupId ? [layer.groupId] : [layer.id];
  return (
    <Section title={t("app-scene-editor-text-inspector.template-section.title.08cf8bfe5932")}>
      {inst && def ? (
        <div data-testid="mts-template-instance" className="flex flex-col gap-2">
          <Hint>
            {L(
              `${state.assets[inst.templateAssetId]?.name ?? "Mal"}, versjon ${ver?.number ?? "?"}. Innholdet her endrer ikke malen.`,
              `${state.assets[inst.templateAssetId]?.name ?? "Template"}, version ${ver?.number ?? "?"}. The content here does not change the template.`,
            )}
          </Hint>
          {def.slots
            .filter((s) => s.kind === "text")
            .map((s) => {
              const v = inst.values[s.key];
              const cur = v && "text" in v ? v.text : "";
              return (
                <label key={s.key} className="flex flex-col gap-1 text-xs text-text-secondary">
                  <span>{s.label}</span>
                  <input
                    key={cur}
                    data-testid={`mts-template-field-${s.key}`}
                    className={inputClass}
                    defaultValue={cur}
                    disabled={off}
                    maxLength={MAX_TEXT_CHARS}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    onBlur={(e) => {
                      if (e.target.value !== cur)
                        onError(updateInstanceValues(run, state, inst.id, { [s.key]: { text: e.target.value } }));
                    }}
                  />
                </label>
              );
            })}
          {newer ? (
            <div
              role="status"
              data-testid="mts-template-newer"
              className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface-2 p-2 text-xs text-text-secondary"
            >
              {t("app-scene-editor-text-inspector.template-section.div.87d71bc95594", { newerNumber: String(newerNumber) })}
              <Button
                size="sm"
                variant="secondary"
                data-testid="mts-template-update"
                disabled={off}
                onClick={() => onError(updateInstanceVersion(run, state, inst.id, newer))}
              >
                {t("app-scene-editor-text-inspector.template-section.button.acf425c5276a")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {projectId && runAndWait ? (
        <Button
          size="sm"
          variant="secondary"
          data-testid="mts-save-template"
          disabled={off}
          onClick={() => setSaveOpen(true)}
        >
          {t("app-scene-editor-text-inspector.template-section.button.f52670cd8206")}
        </Button>
      ) : null}
      {saveOpen && projectId && runAndWait ? (
        <SaveTemplateDialog
          state={state}
          composition={composition}
          layerIds={selection}
          frame={frame}
          projectId={projectId}
          runAndWait={runAndWait}
          existing={inst ? { variantId: ver?.variantId ?? "", name: state.assets[inst.templateAssetId]?.name ?? "" } : null}
          defaultCategory={def?.category ?? "lower_third"}
          onClose={() => setSaveOpen(false)}
        />
      ) : null}
    </Section>
  );
}

function SaveTemplateDialog({
  state,
  composition,
  layerIds,
  frame,
  projectId,
  runAndWait,
  existing,
  defaultCategory,
  onClose,
}: {
  state: ProjectState;
  composition: Composition;
  layerIds: string[];
  frame: number;
  projectId: string;
  runAndWait: RunAndWait;
  existing: { variantId: string; name: string } | null;
  defaultCategory: TemplateCategory;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? state.layers[layerIds[0] ?? ""]?.name ?? "");
  const [category, setCategory] = useState<TemplateCategory>(defaultCategory);
  const [asNewVersion, setAsNewVersion] = useState(!!existing?.variantId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await saveAsTemplate(runAndWait, state, projectId, composition, layerIds, {
        name,
        category,
        frame,
        ...(asNewVersion && existing?.variantId ? { existingVariantId: existing.variantId } : {}),
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("app-scene-editor-text-inspector.save.set-err.41e0363720ec"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => (!o && !busy ? onClose() : undefined)}>
      <DialogContent data-testid="mts-save-template-dialog">
        <DialogHeader>
          <DialogTitle>{t("app-scene-editor-text-inspector.save-template-dialog.dialog-title.49ac0da87e9a")}</DialogTitle>
          <DialogDescription>
            {t("app-scene-editor-text-inspector.save-template-dialog.dialog-description.10fce92ed74d")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {existing?.variantId ? (
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                data-testid="mts-save-template-new-version"
                checked={asNewVersion}
                onChange={(e) => setAsNewVersion(e.target.checked)}
              />
              {t("app-scene-editor-text-inspector.save-template-dialog.label.98ad6af1a94c", { name: String(existing.name) })}
            </label>
          ) : null}
          {!asNewVersion ? (
            <>
              <Field label={t("app-scene-editor-text-inspector.save-template-dialog.label.9cebefedbeda")}>
                <input
                  data-testid="mts-save-template-name"
                  className={inputClass}
                  value={name}
                  maxLength={200}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label={t("app-scene-editor-text-inspector.save-template-dialog.label.abc1278d570a")}>
                <select
                  data-testid="mts-save-template-category"
                  className={inputClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                >
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}
          {err ? (
            <p role="alert" className="text-xs text-status-danger">
              {err}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("app-scene-editor-text-inspector.save-template-dialog.button.f51c48dccfd4")}
          </Button>
          <Button data-testid="mts-save-template-confirm" onClick={() => void save()} disabled={busy}>
            {busy ? t("app-scene-editor-text-inspector.save-template-dialog.button.61a46eefd623") : t("app-scene-editor-text-inspector.save-template-dialog.button.c26874d027a3")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
