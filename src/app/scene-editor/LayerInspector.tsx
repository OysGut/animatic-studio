/**
 * Egenskaper for valgt lag (plassering, dybde, bilde, synlighet) og for selve 2D-scenen når ingen lag er valgt.
 * Hver endring er én kommando som kan angres. UpdateLayers erstatter alle felter, så vi bygger alltid fra laget.
 */
import { Copy, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import {
  COMPOSITION_FORMATS,
  DEFAULT_PARALLAX,
  LAYER_KINDS,
  LAYER_KIND_LABEL,
  keyBetween,
  layersOf,
  newId,
  normalizeColor,
  variantsOf,
  versionsOf,
  type Command,
  type Composition,
  type CompositionFields,
  type CompositionLayer,
  type LayerFields,
  type LayerKind,
  type LayerTransform,
  type ProjectState,
} from "@/core";
import { layerFieldsOf } from "@/core";
import { Button } from "@/components/ui/button";

type Run = (command: Command, label: string) => string | null;

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

// ---------- Små skjemaelementer ----------

const inputClass =
  "h-7 w-full min-w-0 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary placeholder:text-text-tertiary disabled:cursor-not-allowed disabled:opacity-50";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-[0.04em] text-text-tertiary">
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-text-secondary">
      {label}
      {children}
    </label>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-text-tertiary">{children}</p>;
}

function ErrorText({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="mb-3 text-xs text-status-danger">
      {message}
    </p>
  ) : null;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Tekstfelt som lagres når du forlater det eller trykker Enter. Esc forkaster. */
function TextField({
  label,
  value,
  onCommit,
  disabled,
  placeholder,
  allowEmpty,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  disabled: boolean;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false); // Esc forkaster (blur kjører med forrige utkast)
  function commit() {
    const text = (draft ?? value).trim();
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (text === value) return;
    if (text === "" && !allowEmpty) return;
    onCommit(text);
  }
  return (
    <Field label={label}>
      <input
        type="text"
        value={draft ?? value}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={200}
        onFocus={() => setDraft(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            cancelled.current = true;
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        className={inputClass}
      />
    </Field>
  );
}

/** Tallfelt med kladd: ugyldige tall forkastes, gyldige lagres ved blur eller Enter. */
function NumberField({
  label,
  value,
  onCommit,
  disabled,
  step = 1,
  min,
  max,
  integer,
  valid,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  disabled: boolean;
  step?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  valid?: (n: number) => boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  function commit() {
    const text = draft;
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (text === null) return;
    let n = Number(text.trim().replace(",", "."));
    if (text.trim() === "" || !Number.isFinite(n)) return;
    if (integer) n = Math.round(n);
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    if (valid && !valid(n)) return;
    if (fmt(n) === fmt(value)) return;
    onCommit(n);
  }
  return (
    <Field label={label}>
      <input
        type="number"
        inputMode="decimal"
        value={draft ?? fmt(value)}
        disabled={disabled}
        step={step}
        min={min}
        max={max}
        onFocus={() => setDraft(fmt(value))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            cancelled.current = true;
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        className={inputClass}
      />
    </Field>
  );
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
}: {
  state: ProjectState;
  composition: Composition;
  layer: CompositionLayer;
  editable: boolean;
  run: Run;
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
  const setT = (label: string, patch: Partial<LayerTransform>) =>
    apply(label, { transform: { ...layer.transform, ...patch } });

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
              },
            },
          ],
        },
        `Dupliser lag «${layer.name}»`,
      ),
    );
  }

  function remove() {
    setError(
      run(
        { type: "SetLayersRemoved", layerIds: [layer.id], removed: true },
        `Slett lag «${layer.name}»`,
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
  const t = layer.transform;
  const selectClass = inputClass;

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
            disabled={off}
            onChange={(e) => {
              const k = LAYER_KINDS.find((x) => x === e.target.value);
              if (k) changeKind(k);
            }}
            className={selectClass}
          >
            {LAYER_KINDS.map((k) => (
              <option key={k} value={k}>
                {LAYER_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Plassering">
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="X (px)"
            value={t.x}
            disabled={off}
            onCommit={(x) => setT("Flytt lag", { x })}
          />
          <NumberField
            label="Y (px)"
            value={t.y}
            disabled={off}
            onCommit={(y) => setT("Flytt lag", { y })}
          />
          <NumberField
            label="Skalering X (%)"
            value={t.scaleX * 100}
            disabled={off}
            valid={(n) => n !== 0}
            onCommit={(n) => setT("Skaler lag", { scaleX: n / 100 })}
          />
          <NumberField
            label="Skalering Y (%)"
            value={t.scaleY * 100}
            disabled={off}
            valid={(n) => n !== 0}
            onCommit={(n) => setT("Skaler lag", { scaleY: n / 100 })}
          />
          <NumberField
            label="Rotasjon (°)"
            value={t.rotation}
            disabled={off}
            onCommit={(rotation) => setT("Roter lag", { rotation })}
          />
          <NumberField
            label="Gjennomsiktighet (%)"
            value={t.opacity * 100}
            disabled={off}
            min={0}
            max={100}
            onCommit={(n) => setT("Endre gjennomsiktighet", { opacity: n / 100 })}
          />
        </div>
      </Section>

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
          0 = står stille når kameraet beveger seg · 1 = følger scenen · over 1 = nærmere enn scenen
        </Hint>
      </Section>

      <Section title="Bilde">
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
  const preset = COMPOSITION_FORMATS.findIndex(
    (f) => f.width === composition.width && f.height === composition.height,
  );
  const [customChosen, setCustom] = useState(false);
  // Egendefinert når brukeren har valgt det, eller når formatet (f.eks. etter angre) ikke er et av de faste
  const custom = customChosen || preset < 0;
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
        <Field label="Bildeformat">
          <select
            value={custom ? "custom" : String(preset)}
            disabled={off}
            onChange={(e) => {
              if (e.target.value === "custom") {
                setCustom(true);
                return;
              }
              const f = COMPOSITION_FORMATS[Number(e.target.value)];
              if (!f) return;
              setCustom(false);
              if (f.width !== composition.width || f.height !== composition.height)
                apply("Endre format", { width: f.width, height: f.height });
            }}
            className={inputClass}
          >
            {COMPOSITION_FORMATS.map((f, i) => (
              <option key={f.label} value={i}>
                {f.label}
              </option>
            ))}
            <option value="custom">Egendefinert</option>
          </select>
        </Field>
        {custom ? (
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Bredde (px)"
              value={composition.width}
              disabled={off}
              integer
              min={16}
              max={16384}
              onCommit={(width) => apply("Endre format", { width })}
            />
            <NumberField
              label="Høyde (px)"
              value={composition.height}
              disabled={off}
              integer
              min={16}
              max={16384}
              onCommit={(height) => apply("Endre format", { height })}
            />
          </div>
        ) : null}
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
