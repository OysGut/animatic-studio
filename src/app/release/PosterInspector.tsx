/**
 * Innstillinger for plakaten og valgt element (DEC-0061): format, språk, stil, innholdsvalg (REQ-0390),
 * utvalg av karakterer, steder og objekter (REQ-0388/0389), tekstene på norsk og engelsk (REQ-0403/0404),
 * elementets egenskaper (REQ-0398/0399) og kontrollen av lesbarhet (REQ-0392).
 */
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, LayoutTemplate, RotateCcw, Trash2 } from "lucide-react";
import {
  ASSET_KIND_LABEL,
  PALETTES,
  paletteLabel,
  POSTER_FORMATS,
  POSTER_KIND_LABEL,
  POSTER_OPTION_LABEL,
  ROLE_LABEL,
  minReadablePt,
  posterAnalysis,
  posterChecks,
  sortedAssets,
  versionsOf,
  type LocalizedText,
  type Poster,
  type PosterCheck,
  type PosterDocument,
  type PosterElement,
  type PosterKind,
  type PosterOptions,
  type ProjectState,
  L,
} from "@/core";
import { Button } from "@/components/ui/button";

const control =
  "h-7 w-full min-w-0 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary disabled:opacity-60";

/** Felt som lagres når brukeren forlater det (eller trykker Enter). */
function Field({
  label,
  value,
  onCommit,
  disabled,
  multiline,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  type?: "text" | "number";
  placeholder?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  // Det siste som er skrevet, lagres også når feltet forsvinner før det mister fokus (f.eks. når
  // brukeren klikker i plakaten og innstillingene byttes ut)
  const latest = useRef({ v, value, onCommit });
  latest.current = { v, value, onCommit };
  useEffect(
    () => () => {
      const l = latest.current;
      if (l.v !== l.value) l.onCommit(l.v);
    },
    [],
  );
  const commit = () => {
    if (v === value) return;
    onCommit(v);
    // Ble verdien ikke tatt imot (ugyldig), vises den lagrede verdien igjen
    setTimeout(() => {
      if (latest.current.value === value) setV(value);
    }, 0);
  };
  return (
    <label className="flex min-w-0 flex-col gap-0.5 text-[11px] text-text-secondary">
      {label}
      {multiline ? (
        <textarea
          value={v}
          disabled={disabled}
          placeholder={placeholder}
          rows={3}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          className="min-h-14 w-full rounded-sm border border-border-control bg-surface-3 px-1.5 py-1 text-xs text-text-primary disabled:opacity-60"
        />
      ) : (
        <input
          type={type}
          value={v}
          disabled={disabled}
          placeholder={placeholder}
          step={type === "number" ? "any" : undefined}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className={control}
        />
      )}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-border px-3 py-3">
      <PanelHeader as="h3" className="-mx-3" title={title} />
      {children}
    </section>
  );
}

function Bilingual({
  label,
  value,
  onCommit,
  disabled,
  multiline,
}: {
  label: string;
  value: LocalizedText;
  onCommit: (v: LocalizedText) => void;
  disabled: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      <Field
        label={`${label} (${L("norsk", "Norwegian")})`}
        value={value.nb}
        disabled={disabled}
        multiline={multiline ?? false}
        onCommit={(nb) => onCommit({ ...value, nb })}
      />
      <Field
        label={`${label} (${L("engelsk", "English")})`}
        value={value.en}
        disabled={disabled}
        multiline={multiline ?? false}
        placeholder={L("Tom: norsk tekst brukes", "Empty: the Norwegian text is used")}
        onCommit={(en) => onCommit({ ...value, en })}
      />
    </div>
  );
}

/**
 * Fargevelger som lagrer når brukeren har sluttet å dra i fargen (eller forlater feltet), ikke for hver
 * bevegelse – ellers blir det en lagring og ny komposisjon per musebevegelse.
 */
function ColorInput({
  value,
  onCommit,
  disabled,
  className,
  ...rest
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ v, value, onCommit });
  latest.current = { v, value, onCommit };
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const l = latest.current;
    if (l.v !== l.value) l.onCommit(l.v);
  };
  useEffect(() => () => flush(), []);
  return (
    <input
      type="color"
      {...rest}
      value={v}
      disabled={disabled}
      onChange={(e) => {
        setV(e.target.value);
        latest.current = { ...latest.current, v: e.target.value };
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, 350);
      }}
      onBlur={flush}
      className={`${className ?? "h-7"} w-full cursor-pointer rounded-sm border border-border-control bg-transparent`}
    />
  );
}

// ---------- Plakaten ----------

export function PosterSettings({
  state,
  poster,
  editable,
  onPoster,
  onDocument,
  onRedraft,
}: {
  state: ProjectState;
  poster: Poster;
  editable: boolean;
  /** Endrer plakatens felt (navn, språk, format, type) – format og type gir ny komposisjon. */
  onPoster: (
    patch: Partial<Pick<Poster, "name" | "language" | "kind" | "widthMm" | "heightMm">>,
    label: string,
  ) => void;
  /** Endrer dokumentet (innhold) – gir ny komposisjon. */
  onDocument: (doc: PosterDocument, label: string, group?: string) => void;
  /** Lag utkastet på nytt (fjerner brukerens endringer). */
  onRedraft: () => void;
}) {
  const doc = poster.document;
  const analysis = useMemo(
    () => posterAnalysis(state, poster.productionId),
    [state, poster.productionId],
  );
  const format = POSTER_FORMATS.find((f) => f.w === poster.widthMm && f.h === poster.heightMm);
  const ro = !editable;
  const toggle = (k: keyof PosterOptions, on: boolean) => {
    let o: PosterOptions = { ...doc.options, [k]: on };
    // Korte og utfyllende beskrivelser utelukker hverandre
    if (k === "shortDescriptions" && on) o = { ...o, longDescriptions: false };
    if (k === "longDescriptions" && on) o = { ...o, shortDescriptions: false };
    if (k === "imagesAndNamesOnly" && on)
      o = { ...o, shortDescriptions: false, longDescriptions: false, relationTexts: false };
    if ((k === "shortDescriptions" || k === "longDescriptions") && on)
      o = { ...o, imagesAndNamesOnly: false };
    onDocument({ ...doc, options: o }, L("Endre innhold på plakaten", "Change poster content"));
  };
  const pick = (list: "characters" | "places" | "objects", id: string, on: boolean) => {
    const cur = doc[list];
    const next = on ? [...cur, id] : cur.filter((x) => x !== id);
    onDocument(
      { ...doc, [list]: next },
      L("Endre utvalget på plakaten", "Change the selection on the poster"),
    );
  };
  const candidates = (list: "characters" | "places" | "objects") => {
    const ranked =
      list === "characters"
        ? analysis.characters.map((c) => c.asset)
        : list === "places"
          ? analysis.places.map((c) => c.asset)
          : analysis.objects.map((c) => c.asset);
    const kinds =
      list === "characters"
        ? ["character", "animal"]
        : list === "places"
          ? ["location", "environment"]
          : ["object", "vehicle", "prop", "costume"];
    const rest = sortedAssets(state).filter(
      (a) => !a.archived && kinds.includes(a.kind) && !ranked.some((r) => r.id === a.id),
    );
    // Valgte først, i valgt rekkefølge
    const chosen = doc[list].map((id) => state.assets[id]).filter((a) => !!a);
    const others = [...ranked, ...rest].filter((a) => !doc[list].includes(a.id));
    return [...chosen, ...others];
  };

  return (
    <div className="flex flex-col">
      <Section title={L("Plakat", "Poster")}>
        <Field
          label={L("Navn", "Name")}
          value={poster.name}
          disabled={ro}
          onCommit={(name) =>
            name.trim() && onPoster({ name }, L("Endre navn på plakaten", "Rename the poster"))
          }
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
            Type
            <select
              value={poster.kind}
              disabled={ro}
              onChange={(e) =>
                onPoster(
                  { kind: e.target.value as PosterKind },
                  L("Endre plakattype", "Change poster type"),
                )
              }
              className={control}
            >
              {(Object.keys(POSTER_KIND_LABEL) as PosterKind[]).map((k) => (
                <option key={k} value={k}>
                  {POSTER_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
            {L("Språk", "Language")}
            <select
              value={poster.language}
              disabled={ro}
              onChange={(e) =>
                onPoster(
                  { language: e.target.value as "nb" | "en" },
                  L("Endre språk på plakaten", "Change the poster language"),
                )
              }
              className={control}
            >
              <option value="nb">{L("Norsk", "Norwegian")}</option>
              <option value="en">{L("Engelsk", "English")}</option>
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
          Format
          <select
            value={format?.id ?? "custom"}
            disabled={ro}
            onChange={(e) => {
              const f = POSTER_FORMATS.find((x) => x.id === e.target.value);
              if (f) onPoster({ widthMm: f.w, heightMm: f.h }, L("Endre format", "Change format"));
            }}
            className={control}
          >
            {POSTER_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
            {!format ? <option value="custom">{L("Eget format", "Custom format")}</option> : null}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Field
            label={L("Bredde (cm)", "Width (cm)")}
            type="number"
            value={String(poster.widthMm / 10)}
            disabled={ro}
            onCommit={(v) => {
              const n = Number(v.replace(",", "."));
              if (n >= 5 && n <= 300)
                onPoster({ widthMm: n * 10 }, L("Endre format", "Change format"));
            }}
          />
          <Field
            label={L("Høyde (cm)", "Height (cm)")}
            type="number"
            value={String(poster.heightMm / 10)}
            disabled={ro}
            onCommit={(v) => {
              const n = Number(v.replace(",", "."));
              if (n >= 5 && n <= 300)
                onPoster({ heightMm: n * 10 }, L("Endre format", "Change format"));
            }}
          />
        </div>
        <p className="text-[11px] text-text-tertiary">
          {L("Minste lesbare tekst i dette formatet:", "Smallest readable text in this format:")}{" "}
          {Math.round(minReadablePt(poster.widthMm))} pt.
        </p>
      </Section>

      <Section title={L("Stil", "Style")}>
        <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
          {L("Fargepalett", "Colour palette")}
          <select
            value={PALETTES.find((p) => p.name === doc.palette.name)?.name ?? ""}
            disabled={ro}
            onChange={(e) => {
              const p = PALETTES.find((x) => x.name === e.target.value);
              if (p) onDocument({ ...doc, palette: p }, L("Endre stil", "Change style"));
            }}
            className={control}
          >
            {!PALETTES.some((p) => p.name === doc.palette.name) ? (
              <option value="">{L("Egen", "Custom")}</option>
            ) : null}
            {PALETTES.map((p) => (
              <option key={p.name} value={p.name}>
                {paletteLabel(p.name)}
                {p.name === analysis.palette.name ? L(" (foreslått)", " (suggested)") : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          {(["background", "text", "accent", "muted"] as const).map((k) => (
            <label
              key={k}
              className="flex flex-col items-center gap-0.5 text-[11px] text-text-tertiary"
            >
              <ColorInput
                aria-label={
                  {
                    background: L("Bakgrunnsfarge", "Background colour"),
                    text: L("Tekstfarge", "Text colour"),
                    accent: L("Aksentfarge", "Accent colour"),
                    muted: L("Dempet farge", "Muted colour"),
                  }[k]
                }
                value={doc.palette[k]}
                disabled={ro}
                onCommit={(value) =>
                  onDocument(
                    { ...doc, palette: { ...doc.palette, name: "Egen", [k]: value } },
                    L("Endre farge", "Change colour"),
                    `palette:${poster.id}:${k}`,
                  )
                }
                className="h-6"
              />
              {
                {
                  background: L("Bakgrunn", "Background"),
                  text: L("Tekst", "Text"),
                  accent: L("Aksent", "Accent"),
                  muted: L("Dempet", "Muted"),
                }[k]
              }
            </label>
          ))}
        </div>
      </Section>

      <Section title={L("Tekster", "Texts")}>
        <Bilingual
          label={L("Tittel", "Title")}
          value={doc.title}
          disabled={ro}
          onCommit={(title) => onDocument({ ...doc, title }, L("Endre tittel", "Change title"))}
        />
        <Bilingual
          label={L("Sjanger og stemning", "Genre and mood")}
          value={doc.genre}
          disabled={ro}
          onCommit={(genre) => onDocument({ ...doc, genre }, L("Endre sjanger", "Change genre"))}
        />
        <Bilingual
          label={L("Slagord", "Tagline")}
          value={doc.tagline}
          disabled={ro}
          onCommit={(tagline) =>
            onDocument({ ...doc, tagline }, L("Endre slagord", "Change tagline"))
          }
        />
        <Bilingual
          label="Logline"
          value={doc.logline}
          disabled={ro}
          multiline
          onCommit={(logline) =>
            onDocument({ ...doc, logline }, L("Endre logline", "Change logline"))
          }
        />
      </Section>

      <Section title={L("Innhold", "Content")}>
        <div className="grid grid-cols-1 gap-1">
          {POSTER_OPTION_LABEL.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-xs text-text-primary">
              <input
                type="checkbox"
                checked={doc.options[k]}
                disabled={ro}
                onChange={(e) => toggle(k, e.target.checked)}
                className="size-3.5 accent-[var(--accent-brand)]"
              />
              {label}
            </label>
          ))}
        </div>
      </Section>

      {(["characters", "places", "objects"] as const).map((list) => {
        const all = candidates(list);
        return (
          <Section
            key={list}
            title={`${
              {
                characters: L("Karakterer", "Characters"),
                places: L("Steder", "Places"),
                objects: L("Objekter", "Objects"),
              }[list]
            } (${doc[list].length} ${L("valgt", "selected")})`}
          >
            {all.length === 0 ? (
              <p className="text-[11px] text-text-tertiary">
                {L("Ingen i biblioteket.", "None in the library.")}
              </p>
            ) : (
              <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                {all.map((a) => {
                  const rank =
                    list === "characters"
                      ? analysis.characters.find((c) => c.asset.id === a.id)
                      : undefined;
                  return (
                    <li key={a.id}>
                      <label className="flex items-center gap-2 text-xs text-text-primary">
                        <input
                          type="checkbox"
                          checked={doc[list].includes(a.id)}
                          disabled={ro}
                          onChange={(e) => pick(list, a.id, e.target.checked)}
                          className="size-3.5 accent-[var(--accent-brand)]"
                        />
                        <span className="truncate">{a.name}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-text-tertiary">
                          {rank
                            ? L(
                                `${rank.lines === 1 ? "1 replikk" : `${rank.lines} replikker`} · ${rank.scenes === 1 ? "1 scene" : `${rank.scenes} scener`}`,
                                `${rank.lines === 1 ? "1 line" : `${rank.lines} lines`} · ${rank.scenes === 1 ? "1 scene" : `${rank.scenes} scenes`}`,
                              )
                            : ASSET_KIND_LABEL[a.kind]}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        );
      })}

      {editable ? (
        <Section title={L("Utkast", "Draft")}>
          <p className="text-[11px] text-text-tertiary">
            {L(
              "Lager plakaten på nytt fra innholdet over. Det du har flyttet eller endret selv, forsvinner (kan angres).",
              "Makes the poster again from the content above. What you have moved or changed yourself disappears (can be undone).",
            )}
          </p>
          <Button size="sm" variant="secondary" onClick={onRedraft}>
            <LayoutTemplate />
            {L("Lag utkastet på nytt", "Redraft the poster")}
          </Button>
        </Section>
      ) : null}
    </div>
  );
}

// ---------- Valgt element ----------

export function ElementInspector({
  state,
  poster,
  element,
  editable,
  onChange,
  onReset,
  onRemove,
  onOrder,
}: {
  state: ProjectState;
  poster: Poster;
  element: PosterElement;
  editable: boolean;
  onChange: (patch: Partial<PosterElement>, label: string, group?: string) => void;
  onReset: () => void;
  onRemove: () => void;
  onOrder: (dir: "front" | "back") => void;
}) {
  const e = element;
  const ro = !editable;
  const num = (
    label: string,
    key: "x" | "y" | "w" | "h" | "rotation" | "size" | "tracking" | "radius" | "strokeWidth",
    scale = 1,
    unit = "",
  ) => (
    <Field
      label={`${label}${unit ? ` (${unit})` : ""}`}
      type="number"
      value={
        e[key] === undefined ? "" : String(Math.round(((e[key] as number) / scale) * 100) / 100)
      }
      disabled={ro}
      onCommit={(v) => {
        const n = Number(v.replace(",", "."));
        if (Number.isFinite(n))
          onChange(
            { [key]: n * scale },
            L(`Endre ${label.toLowerCase()}`, `Change ${label.toLowerCase()}`),
          );
      }}
    />
  );
  const asset = e.assetId ? state.assets[e.assetId] : undefined;
  const variants = asset
    ? Object.values(state.assetVariants).filter((v) => v.assetId === asset.id && !v.archived)
    : [];
  const versions = e.assetVariantId ? versionsOf(state, e.assetVariantId) : [];
  const images = sortedAssets(state).filter((a) => !a.archived && a.kind !== "sound");
  return (
    <div className="flex flex-col">
      <Section title={`Element: ${ROLE_LABEL[e.role] ?? e.role}${asset ? ` – ${asset.name}` : ""}`}>
        <p className="text-[11px] text-text-tertiary">
          {e.auto
            ? L(
                "Laget av programmet. Endrer du det, blir det ditt og står når innholdet endres.",
                "Made by the app. If you change it, it becomes yours and stays when the content changes.",
              )
            : e.role === "custom"
              ? L("Eget element.", "Custom element.")
              : L(
                  "Endret av deg. Står når innholdet endres.",
                  "Changed by you. Stays when the content changes.",
                )}
        </p>
        <label className="flex items-center gap-2 text-xs text-text-primary">
          <input
            type="checkbox"
            checked={e.visible}
            disabled={ro}
            onChange={(ev) =>
              onChange(
                { visible: ev.target.checked },
                ev.target.checked
                  ? L("Vis element", "Show element")
                  : L("Skjul element", "Hide element"),
              )
            }
            className="size-3.5 accent-[var(--accent-brand)]"
          />
          {L("Synlig", "Visible")}
        </label>
        {e.kind !== "relation" ? (
          <div className="grid grid-cols-2 gap-1.5">
            {num("X", "x", 10, "cm")}
            {num("Y", "y", 10, "cm")}
            {num(L("Bredde", "Width"), "w", 10, "cm")}
            {num(L("Høyde", "Height"), "h", 10, "cm")}
            {num(L("Rotasjon", "Rotation"), "rotation", 1, L("grader", "degrees"))}
          </div>
        ) : null}
      </Section>

      {e.kind === "text" || e.kind === "relation" ? (
        <Section title={L("Tekst", "Text")}>
          <Bilingual
            label={L("Tekst", "Text")}
            value={e.text ?? { nb: "", en: "" }}
            disabled={ro}
            multiline
            onCommit={(text) => onChange({ text }, L("Endre tekst", "Change text"))}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
              {L("Skrift", "Font")}
              <select
                value={e.font ?? "serif"}
                disabled={ro}
                onChange={(ev) =>
                  onChange(
                    { font: ev.target.value as "serif" | "sans" },
                    L("Endre skrift", "Change font"),
                  )
                }
                className={control}
              >
                <option value="serif">{L("Antikva (Times)", "Serif (Times)")}</option>
                <option value="sans">{L("Grotesk (Helvetica)", "Sans (Helvetica)")}</option>
              </select>
            </label>
            {num(L("Størrelse", "Size"), "size", 1, "pt")}
            {e.kind === "text" ? (
              <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
                {L("Justering", "Alignment")}
                <select
                  value={e.align ?? "center"}
                  disabled={ro}
                  onChange={(ev) =>
                    onChange(
                      { align: ev.target.value as "left" | "center" | "right" },
                      L("Endre justering", "Change alignment"),
                    )
                  }
                  className={control}
                >
                  <option value="left">{L("Venstre", "Left")}</option>
                  <option value="center">{L("Midtstilt", "Centred")}</option>
                  <option value="right">{L("Høyre", "Right")}</option>
                </select>
              </label>
            ) : null}
            {e.kind === "text" ? num(L("Sperring", "Tracking"), "tracking", 1, "1/1000 em") : null}
            <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
              {L("Farge", "Colour")}
              <ColorInput
                value={e.color ?? poster.document.palette.text}
                disabled={ro}
                onCommit={(value) =>
                  onChange({ color: value }, L("Endre farge", "Change colour"), `color:${e.id}`)
                }
                className="h-7"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5 text-xs text-text-primary">
              <input
                type="checkbox"
                checked={e.bold ?? false}
                disabled={ro}
                onChange={(ev) =>
                  onChange(
                    { bold: ev.target.checked, ...(ev.target.checked ? { italic: false } : {}) },
                    L("Endre skrift", "Change font"),
                  )
                }
                className="size-3.5 accent-[var(--accent-brand)]"
              />
              {L("Halvfet", "Bold")}
            </label>
            {(e.font ?? "serif") === "serif" ? (
              <label className="flex items-center gap-1.5 text-xs text-text-primary">
                <input
                  type="checkbox"
                  checked={e.italic ?? false}
                  disabled={ro}
                  onChange={(ev) =>
                    onChange(
                      { italic: ev.target.checked, ...(ev.target.checked ? { bold: false } : {}) },
                      L("Endre skrift", "Change font"),
                    )
                  }
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                {L("Kursiv", "Italic")}
              </label>
            ) : null}
            {e.kind === "text" ? (
              <label className="flex items-center gap-1.5 text-xs text-text-primary">
                <input
                  type="checkbox"
                  checked={e.uppercase ?? false}
                  disabled={ro}
                  onChange={(ev) =>
                    onChange({ uppercase: ev.target.checked }, L("Endre skrift", "Change font"))
                  }
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                {L("Store bokstaver", "Capitals")}
              </label>
            ) : null}
          </div>
        </Section>
      ) : null}

      {e.kind === "relation" ? (
        <Section title={L("Linje", "Line")}>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
              {L("Linjefarge", "Line colour")}
              <ColorInput
                value={e.stroke ?? "#ffffff"}
                disabled={ro}
                onCommit={(value) =>
                  onChange(
                    { stroke: value },
                    L("Endre linjefarge", "Change line colour"),
                    `stroke:${e.id}`,
                  )
                }
                className="h-7"
              />
            </label>
            {num(L("Tykkelse", "Thickness"), "strokeWidth", 1, "mm")}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-text-primary">
            <input
              type="checkbox"
              checked={e.dashed ?? false}
              disabled={ro}
              onChange={(ev) =>
                onChange({ dashed: ev.target.checked }, L("Endre linje", "Change line"))
              }
              className="size-3.5 accent-[var(--accent-brand)]"
            />
            {L("Stiplet", "Dashed")}
          </label>
        </Section>
      ) : null}

      {e.kind === "image" ? (
        <Section title={L("Bilde", "Image")}>
          <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
            {L("Ressurs", "Asset")}
            <select
              value={e.assetId ?? ""}
              disabled={ro}
              onChange={(ev) =>
                onChange(
                  { assetId: ev.target.value as never, assetVariantId: null, versionId: null },
                  L("Bytt bilde", "Change image"),
                )
              }
              className={control}
            >
              {images.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({ASSET_KIND_LABEL[a.kind]})
                </option>
              ))}
            </select>
          </label>
          {variants.length > 0 ? (
            <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
              Variant
              <select
                value={e.assetVariantId ?? ""}
                disabled={ro}
                onChange={(ev) =>
                  onChange(
                    { assetVariantId: (ev.target.value || null) as never, versionId: null },
                    L("Bytt variant", "Change variant"),
                  )
                }
                className={control}
              >
                <option value="">{L("Forsidebildet", "The cover image")}</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {versions.length > 1 ? (
            <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
              {L("Versjon", "Version")}
              <select
                value={e.versionId ?? ""}
                disabled={ro}
                onChange={(ev) =>
                  onChange(
                    { versionId: (ev.target.value || null) as never },
                    L("Bytt versjon", "Change version"),
                  )
                }
                className={control}
              >
                <option value="">{L("Godkjent eller nyeste", "Approved or latest")}</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {L("Versjon", "Version")} {v.number}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
              {L("Tilpasning", "Fit")}
              <select
                value={e.fit ?? "cover"}
                disabled={ro}
                onChange={(ev) =>
                  onChange(
                    { fit: ev.target.value as "cover" | "contain" },
                    L("Endre tilpasning", "Change fit"),
                  )
                }
                className={control}
              >
                <option value="contain">{L("Hele bildet", "Whole image")}</option>
                <option value="cover">{L("Fyll rammen", "Fill the frame")}</option>
              </select>
            </label>
            <Field
              label={L("Dekkevne (%)", "Opacity (%)")}
              type="number"
              value={String(Math.round((e.opacity ?? 1) * 100))}
              disabled={ro}
              onCommit={(v) => {
                const n = Number(v);
                if (n >= 0 && n <= 100)
                  onChange({ opacity: n / 100 }, L("Endre dekkevne", "Change opacity"));
              }}
            />
          </div>
        </Section>
      ) : null}

      {e.kind === "rect" ? (
        <Section title={L("Flate", "Fill")}>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
              {L("Farge", "Colour")}
              <ColorInput
                value={e.fill ?? "#000000"}
                disabled={ro}
                onCommit={(value) =>
                  onChange({ fill: value }, L("Endre farge", "Change colour"), `fill:${e.id}`)
                }
                className="h-7"
              />
            </label>
            <Field
              label={L("Dekkevne (%)", "Opacity (%)")}
              type="number"
              value={String(Math.round((e.opacity ?? 1) * 100))}
              disabled={ro}
              onCommit={(v) => {
                const n = Number(v);
                if (n >= 0 && n <= 100)
                  onChange({ opacity: n / 100 }, L("Endre dekkevne", "Change opacity"));
              }}
            />
            {num(L("Hjørner", "Corners"), "radius", 1, "mm")}
          </div>
        </Section>
      ) : null}

      {editable ? (
        <Section title={L("Handlinger", "Actions")}>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => onOrder("front")}>
              {L("Flytt fram", "Bring forward")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onOrder("back")}>
              {L("Flytt bak", "Send back")}
            </Button>
            {!e.auto && e.role !== "custom" ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={onReset}
                title={L("Programmet lager elementet på nytt", "The app makes the element again")}
              >
                <RotateCcw />
                {L("Tilbakestill", "Reset")}
              </Button>
            ) : null}
            {e.role === "custom" ? (
              <Button size="sm" variant="ghost" onClick={onRemove}>
                <Trash2 />
                {L("Fjern", "Remove")}
              </Button>
            ) : null}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

// ---------- Kontroll ----------

export function PosterChecksList({
  state,
  poster,
  lang,
  onShow,
}: {
  state: ProjectState;
  poster: Poster;
  lang: "nb" | "en";
  onShow: (ids: readonly string[]) => void;
}) {
  const checks = useMemo<PosterCheck[]>(
    () => posterChecks(state, poster, lang),
    [state, poster, lang],
  );
  return (
    <ul
      className="flex flex-col gap-1.5 px-3 py-3"
      aria-label={L("Kontroll av plakaten", "Check of the poster")}
    >
      {checks.map((c, i) => (
        <li
          key={i}
          className={
            "flex gap-2 rounded-sm border px-2 py-1.5 text-xs " +
            (c.level === "warn"
              ? "border-status-discrepancy/40 bg-status-discrepancy-bg text-text-primary"
              : c.level === "ok"
                ? "border-border bg-surface-2 text-text-secondary"
                : "border-border bg-surface-2 text-text-secondary")
          }
        >
          {c.level === "warn" ? (
            <AlertTriangle
              className="mt-0.5 size-3.5 shrink-0 text-status-discrepancy"
              aria-hidden
            />
          ) : c.level === "ok" ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-status-success" aria-hidden />
          ) : (
            <Info className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            {c.text}
            {c.elementIds?.length ? (
              <button
                type="button"
                className="ml-1 text-accent-brand underline-offset-2 hover:underline"
                aria-label={L(`Vis i plakaten: ${c.text}`, `Show in the poster: ${c.text}`)}
                onClick={() => onShow(c.elementIds!)}
              >
                {L("Vis", "Show")}
              </button>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
