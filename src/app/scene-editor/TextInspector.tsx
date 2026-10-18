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

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  get lower_third() {
    return L("Lower third", "Lower third");
  },
  get title() {
    return L("Filmtittel", "Film title");
  },
  get text_card() {
    return L("Tekstscene", "Text scene");
  },
  get text_object() {
    return L("Tekstobjekt", "Text object");
  },
  get credits() {
    return L("Rulletekst", "Credits");
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
  const label = L("Endre tekst", "Edit text");
  return (
    <Section title={L("Tekst", "Text")}>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        <span>{L("Innhold", "Content")}</span>
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
            ? L(
                `For lang tekst: ${value.length} av høyst ${MAX_TEXT_CHARS} tegn. Ingenting er lagret; kort ned teksten.`,
                `Text too long: ${value.length} of at most ${MAX_TEXT_CHARS} characters. Nothing is saved; shorten the text.`,
              )
            : L(`${value.length} / ${MAX_TEXT_CHARS} tegn`, `${value.length} / ${MAX_TEXT_CHARS} characters`)}
        </span>
      </label>
      <Field label={L("Font", "Font")}>
        <select
          data-testid="mts-font"
          className={inputClass}
          value={text.fontId}
          disabled={off}
          onChange={(e) => set(L("Endre font", "Change font"), { fontId: e.target.value })}
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
          {L(
            `Fonten «${fonts.missing.join(", ")}» kunne ikke lastes. Teksten vises med en reservefont, også i eksporten.`,
            `The font “${fonts.missing.join(", ")}” could not be loaded. The text is shown with a fallback font, also in the export.`,
          )}
        </p>
      ) : null}
      {font ? (
        <Hint>
          {L(`Lisens ${font.license}, fra ${font.source}.`, `Licence ${font.license}, from ${font.source}.`)}
        </Hint>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label={L("Størrelse", "Size")}
          value={text.size}
          min={1}
          max={2000}
          disabled={off}
          onCommit={(size) => set(L("Endre tekststørrelse", "Change text size"), { size })}
        />
        <Field label={L("Vekt", "Weight")}>
          <select
            data-testid="mts-weight"
            className={inputClass}
            value={text.weight}
            disabled={off}
            onChange={(e) => set(L("Endre vekt", "Change weight"), { weight: Number(e.target.value) })}
          >
            {(font?.weights ?? [400, 700]).map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </Field>
        <NumberField
          label={L("Bokstavavstand", "Letter spacing")}
          value={text.letterSpacing}
          min={-500}
          max={500}
          disabled={off}
          onCommit={(letterSpacing) => set(L("Endre bokstavavstand", "Change letter spacing"), { letterSpacing })}
        />
        <NumberField
          label={L("Linjehøyde", "Line height")}
          value={text.lineHeight}
          step={0.05}
          min={0.5}
          max={4}
          disabled={off}
          onCommit={(lineHeight) => set(L("Endre linjehøyde", "Change line height"), { lineHeight })}
        />
      </div>
      <Color
        label={L("Farge", "Colour")}
        testId="mts-text-color"
        value={text.color}
        disabled={off}
        onCommit={(color) => set(L("Endre tekstfarge", "Change text colour"), { color })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Field label={L("Justering", "Alignment")}>
          <select
            data-testid="mts-align"
            className={inputClass}
            value={text.align}
            disabled={off}
            onChange={(e) => set(L("Endre justering", "Change alignment"), { align: e.target.value as TextSpec["align"] })}
          >
            <option value="left">{L("Venstre", "Left")}</option>
            <option value="center">{L("Midten", "Centre")}</option>
            <option value="right">{L("Høyre", "Right")}</option>
          </select>
        </Field>
        <Field label={L("Loddrett", "Vertical")}>
          <select
            className={inputClass}
            value={text.vAlign}
            disabled={off}
            onChange={(e) => set(L("Endre justering", "Change alignment"), { vAlign: e.target.value as TextSpec["vAlign"] })}
          >
            <option value="top">{L("Topp", "Top")}</option>
            <option value="middle">{L("Midten", "Middle")}</option>
            <option value="bottom">{L("Bunn", "Bottom")}</option>
          </select>
        </Field>
      </div>
      <div className="flex gap-4 text-xs text-text-secondary">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={text.italic}
            disabled={off}
            onChange={(e) => set(L("Kursiv", "Italic"), { italic: e.target.checked })}
          />
          {L("Kursiv", "Italic")}
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={text.wrap}
            disabled={off}
            onChange={(e) => set(L("Linjebryting", "Line wrapping"), { wrap: e.target.checked })}
          />
          {L("Bryt linjer", "Wrap lines")}
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
    apply(L("Endre bokstavanimasjon", "Change letter animation"), { text: { ...text, letterAnim: checked.value } });
  };
  return (
    <Section title={L("Bokstavanimasjon", "Letter animation")}>
      {err ? (
        <p role="alert" data-testid="mts-letter-error" className="text-xs text-status-discrepancy">
          {err}
        </p>
      ) : null}
      <Field label={L("Effekt", "Effect")}>
        <select
          data-testid="mts-letter-effect"
          className={inputClass}
          value={a?.effect ?? "none"}
          disabled={off}
          onChange={(e) =>
            e.target.value === "none" ? set(null) : set({ effect: e.target.value as LetterAnimation["effect"] })
          }
        >
          <option value="none">{L("Ingen", "None")}</option>
          <option value="appear">{L("Kommer fram (F → FI → FIL)", "Appear (F → FI → FIL)")}</option>
          <option value="fade">{L("Ton inn", "Fade in")}</option>
          <option value="slide">{L("Skli inn", "Slide in")}</option>
          <option value="scale">{L("Voks fram", "Scale up")}</option>
        </select>
      </Field>
      {a ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label={L("Enhet", "Unit")}>
            <select
              data-testid="mts-letter-unit"
              className={inputClass}
              value={a.unit}
              disabled={off}
              onChange={(e) => set({ unit: e.target.value as LetterAnimation["unit"] })}
            >
              <option value="letter">{L("Bokstav", "Letter")}</option>
              <option value="word">{L("Ord", "Word")}</option>
              <option value="line">{L("Linje", "Line")}</option>
            </select>
          </Field>
          <Field label={L("Rekkefølge", "Order")}>
            <select
              className={inputClass}
              value={a.order}
              disabled={off}
              onChange={(e) => set({ order: e.target.value as LetterAnimation["order"] })}
            >
              <option value="start">{L("Fra start", "From start")}</option>
              <option value="end">{L("Fra slutt", "From end")}</option>
              <option value="center">{L("Fra midten", "From centre")}</option>
              <option value="random">{L("Tilfeldig", "Random")}</option>
            </select>
          </Field>
          <NumberField
            label={L("Start (bilde)", "Start (frame)")}
            value={a.startFrame}
            integer
            min={0}
            disabled={off}
            onCommit={(startFrame) => set({ startFrame })}
          />
          <NumberField
            label={L("Forsinkelse (bilder)", "Delay (frames)")}
            value={a.delayFrames}
            integer
            min={0}
            disabled={off}
            onCommit={(delayFrames) => set({ delayFrames })}
          />
          <NumberField
            label={L("Varighet (bilder)", "Duration (frames)")}
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
  const set = (p: Partial<ShapeSpec>) => apply(L("Endre form", "Change shape"), { shape: { ...s, ...p } });
  return (
    <Section title={L("Form", "Shape")}>
      <Field label={L("Form", "Shape")}>
        <select
          data-testid="mts-shape"
          className={inputClass}
          value={shape ? s.type : "none"}
          disabled={off}
          onChange={(e) =>
            e.target.value === "none"
              ? apply(L("Endre form", "Change shape"), { shape: null })
              : set({ type: e.target.value as ShapeSpec["type"] })
          }
        >
          <option value="none">{L("Hel flate", "Full fill")}</option>
          <option value="rect">{L("Rektangel", "Rectangle")}</option>
          <option value="ellipse">{L("Ellipse", "Ellipse")}</option>
          <option value="line">{L("Linje", "Line")}</option>
        </select>
      </Field>
      {shape?.type === "rect" ? (
        <NumberField
          label={L("Avrunding", "Rounding")}
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
    apply(L("Endre effekter", "Change effects"), { effects: empty ? null : next });
  };
  return (
    <Section title={L("Effekter", "Effects")}>
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
        {L("Skygge", "Shadow")}
      </label>
      {e.shadow ? (
        <div className="grid grid-cols-2 gap-2 pl-5">
          <Color label={L("Farge", "Colour")} value={e.shadow.color} disabled={off} onCommit={(color) => set({ shadow: { ...e.shadow!, color } })} />
          <NumberField label={L("Uskarphet", "Blur")} value={e.shadow.blur} min={0} max={500} disabled={off} onCommit={(blur) => set({ shadow: { ...e.shadow!, blur } })} />
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
        {L("Glød", "Glow")}
      </label>
      {e.glow ? (
        <div className="grid grid-cols-2 gap-2 pl-5">
          <Color label={L("Farge", "Colour")} value={e.glow.color} disabled={off} onCommit={(color) => set({ glow: { ...e.glow!, color } })} />
          <NumberField label={L("Uskarphet", "Blur")} value={e.glow.blur} min={0} max={500} disabled={off} onCommit={(blur) => set({ glow: { ...e.glow!, blur } })} />
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
        {L("Kontur", "Outline")}
      </label>
      {e.outline ? (
        <div className="grid grid-cols-2 gap-2 pl-5">
          <Color label={L("Farge", "Colour")} value={e.outline.color} disabled={off} onCommit={(color) => set({ outline: { ...e.outline!, color } })} />
          <NumberField label={L("Bredde", "Width")} value={e.outline.width} min={0} max={200} disabled={off} onCommit={(width) => set({ outline: { ...e.outline!, width } })} />
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
        ? L(`Inn-animasjon: ${MOTION_PRESET_LABEL[preset]}`, `In animation: ${MOTION_PRESET_LABEL[preset]}`)
        : L(`Ut-animasjon: ${MOTION_PRESET_LABEL[preset]}`, `Out animation: ${MOTION_PRESET_LABEL[preset]}`),
      { keyframes },
    );
  }
  return (
    <Section title={L("Inn og ut", "In and out")}>
      <div className="grid grid-cols-2 gap-2">
        <Field label={L("Oppsett", "Preset")}>
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
          label={L("Varighet (s)", "Duration (s)")}
          value={secs}
          step={0.1}
          min={0.04}
          max={60}
          disabled={off}
          onCommit={setSecs}
        />
        {preset === "slide" ? (
          <Field label={L("Retning", "Direction")}>
            <select className={inputClass} value={dir} disabled={off} onChange={(e) => setDir(e.target.value as PresetDirection)}>
              <option value="left">{L("Fra venstre", "From the left")}</option>
              <option value="right">{L("Fra høyre", "From the right")}</option>
              <option value="up">{L("Ovenfra", "From above")}</option>
              <option value="down">{L("Nedenfra", "From below")}</option>
            </select>
          </Field>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" data-testid="mts-preset-in" disabled={off} onClick={() => add("in")}>
          {L("Legg til inn", "Add in")}
        </Button>
        <Button size="sm" variant="secondary" data-testid="mts-preset-out" disabled={off} onClick={() => add("out")}>
          {L("Legg til ut", "Add out")}
        </Button>
      </div>
      {err ? (
        <p role="alert" data-testid="mts-preset-error" className="text-xs text-status-discrepancy">
          {err}
        </p>
      ) : null}
      <Hint>
        {L(
          "Inn starter ved starten av laget (eller ved avspillingshodet når det står inne i laget), ut slutter ved slutten av laget. Nøkkelbildene kan endres i tidslinjen.",
          "In starts at the start of the layer (or at the playhead when it is inside the layer), out ends at the end of the layer. The keyframes can be changed in the timeline.",
        )}
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
    <Section title={L("Mal", "Template")}>
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
              {L(
                `Ny malversjon finnes (versjon ${newerNumber}). Scenen endres ikke før du velger å oppdatere.`,
                `A new template version exists (version ${newerNumber}). The scene is not changed until you choose to update.`,
              )}
              <Button
                size="sm"
                variant="secondary"
                data-testid="mts-template-update"
                disabled={off}
                onClick={() => onError(updateInstanceVersion(run, state, inst.id, newer))}
              >
                {L("Oppdater til ny versjon", "Update to the new version")}
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
          {L("Lagre som mal …", "Save as template …")}
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
      setErr(e instanceof Error ? e.message : L("Kunne ikke lagre malen", "Could not save the template"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => (!o && !busy ? onClose() : undefined)}>
      <DialogContent data-testid="mts-save-template-dialog">
        <DialogHeader>
          <DialogTitle>{L("Lagre som mal", "Save as template")}</DialogTitle>
          <DialogDescription>
            {L(
              "Designet, animasjonen og feltene lagres som en mal i biblioteket. Tekstlagene blir felt du fyller ut der malen brukes.",
              "The design, animation and fields are saved as a template in the library. The text layers become fields you fill in where the template is used.",
            )}
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
              {L(
                `Ny versjon av «${existing.name}» (forekomster som finnes, endres ikke)`,
                `New version of “${existing.name}” (existing uses are not changed)`,
              )}
            </label>
          ) : null}
          {!asNewVersion ? (
            <>
              <Field label={L("Navn", "Name")}>
                <input
                  data-testid="mts-save-template-name"
                  className={inputClass}
                  value={name}
                  maxLength={200}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label={L("Type", "Type")}>
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
            {L("Avbryt", "Cancel")}
          </Button>
          <Button data-testid="mts-save-template-confirm" onClick={() => void save()} disabled={busy}>
            {busy ? L("Lagrer …", "Saving …") : L("Lagre mal", "Save template")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
