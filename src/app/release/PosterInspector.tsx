/**
 * Innstillinger for plakaten og valgt element (DEC-0061): format, språk, stil, innholdsvalg (REQ-0390),
 * utvalg av karakterer, steder og objekter (REQ-0388/0389), tekstene på norsk og engelsk (REQ-0403/0404),
 * elementets egenskaper (REQ-0398/0399) og kontrollen av lesbarhet (REQ-0392).
 */
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, LayoutTemplate, RotateCcw, Trash2 } from "lucide-react";
import { ASSET_KIND_LABEL, PALETTES, paletteLabel, POSTER_FORMATS, POSTER_KIND_LABEL, POSTER_OPTION_LABEL, ROLE_LABEL, minReadablePt, posterAnalysis, posterChecks, sortedAssets, versionsOf, languageLabel, posterLanguages, textIn, type LocalizedText, type Poster, type PosterCheck, type PosterDocument, type PosterElement, type PosterKind, type PosterOptions, type ProjectState } from "@/core";
import { PosterLanguageSelect } from "./PosterLanguageSelect";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";

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

/** G-1b: ett felt per språk plakaten bruker (plakatens språk og kildespråket). */
function Bilingual({
  label,
  value,
  onCommit,
  disabled,
  multiline,
  languages,
}: {
  label: string;
  value: LocalizedText;
  onCommit: (v: LocalizedText) => void;
  disabled: boolean;
  multiline?: boolean;
  languages: readonly string[];
}) {
  const reserve = languages[languages.length - 1] ?? "";
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {languages.map((l) => (
        <Field
          key={l}
          label={`${label} (${languageLabel(l)})`}
          value={textIn(value, l)}
          disabled={disabled}
          multiline={multiline ?? false}
          {...(l !== reserve ? { placeholder: t("g1b.poster.fallback-placeholder", { language: languageLabel(reserve) }) } : {})}
          onCommit={(v) => onCommit({ ...value, [l]: v })}
        />
      ))}
    </div>
  );
}

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
  const langs = posterLanguages(state, poster.language);
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
    onDocument({ ...doc, options: o }, t("app-release-poster-inspector.toggle.on-document.0faf3ea023af"));
  };
  const pick = (list: "characters" | "places" | "objects", id: string, on: boolean) => {
    const cur = doc[list];
    const next = on ? [...cur, id] : cur.filter((x) => x !== id);
    onDocument(
      { ...doc, [list]: next },
      t("app-release-poster-inspector.pick.on-document.9c091bedf2a3"),
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
      <Section title={t("app-release-poster-inspector.poster-settings.title.080c03a5a101")}>
        <Field
          label={t("app-release-poster-inspector.poster-settings.label.d618c321e720")}
          value={poster.name}
          disabled={ro}
          onCommit={(name) =>
            name.trim() && onPoster({ name }, t("app-release-poster-inspector.poster-settings.on-poster.668f5ed1f83d"))
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
                  t("app-release-poster-inspector.poster-settings.on-poster.95f5171868f5"),
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
            {t("app-release-poster-inspector.poster-settings.label.d24bde1ca89e")}
            <PosterLanguageSelect
              state={state}
              value={poster.language}
              disabled={ro}
              testId="poster-language"
              onChange={(language) =>
                onPoster({ language }, t("app-release-poster-inspector.poster-settings.on-poster.3e76f71503df"))
              }
              className={control}
            />
          </label>
        </div>
        <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
          Format
          <select
            value={format?.id ?? "custom"}
            disabled={ro}
            onChange={(e) => {
              const f = POSTER_FORMATS.find((x) => x.id === e.target.value);
              if (f) onPoster({ widthMm: f.w, heightMm: f.h }, t("app-release-poster-inspector.poster-settings.on-poster.7305f75e196e"));
            }}
            className={control}
          >
            {POSTER_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
            {!format ? <option value="custom">{t("app-release-poster-inspector.poster-settings.option.53af7efc3961")}</option> : null}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Field
            label={t("app-release-poster-inspector.poster-settings.label.f7167f2f6db5")}
            type="number"
            value={String(poster.widthMm / 10)}
            disabled={ro}
            onCommit={(v) => {
              const n = Number(v.replace(",", "."));
              if (n >= 5 && n <= 300)
                onPoster({ widthMm: n * 10 }, t("app-release-poster-inspector.poster-settings.on-poster.7305f75e196e.2"));
            }}
          />
          <Field
            label={t("app-release-poster-inspector.poster-settings.label.caea5248c457")}
            type="number"
            value={String(poster.heightMm / 10)}
            disabled={ro}
            onCommit={(v) => {
              const n = Number(v.replace(",", "."));
              if (n >= 5 && n <= 300)
                onPoster({ heightMm: n * 10 }, t("app-release-poster-inspector.poster-settings.on-poster.7305f75e196e.3"));
            }}
          />
        </div>
        <p className="text-[11px] text-text-tertiary">
          {t("app-release-poster-inspector.poster-settings.p.c843bbf68646")}{" "}
          {Math.round(minReadablePt(poster.widthMm))} pt.
        </p>
      </Section>

      <Section title={t("app-release-poster-inspector.poster-settings.title.62bd578be6e4")}>
        <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
          {t("app-release-poster-inspector.poster-settings.label.dc300cfc34a0")}
          <select
            value={PALETTES.find((p) => p.name === doc.palette.name)?.name ?? ""}
            disabled={ro}
            onChange={(e) => {
              const p = PALETTES.find((x) => x.name === e.target.value);
              if (p) onDocument({ ...doc, palette: p }, t("app-release-poster-inspector.poster-settings.on-document.def7df9d3fd9"));
            }}
            className={control}
          >
            {!PALETTES.some((p) => p.name === doc.palette.name) ? (
              <option value="">{t("app-release-poster-inspector.poster-settings.option.baae3966c5fc")}</option>
            ) : null}
            {PALETTES.map((p) => (
              <option key={p.name} value={p.name}>
                {paletteLabel(p.name)}
                {p.name === analysis.palette.name ? t("app-release-poster-inspector.poster-settings.option.3ca6b49373b6") : ""}
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
                    background: t("app-release-poster-inspector.background.background.b4b9947e469f"),
                    text: t("app-release-poster-inspector.text.text.8fc21fb0debb"),
                    accent: t("app-release-poster-inspector.accent.accent.31c7d61e82e7"),
                    muted: t("app-release-poster-inspector.muted.muted.6ed0859703dd"),
                  }[k]
                }
                value={doc.palette[k]}
                disabled={ro}
                onCommit={(value) =>
                  onDocument(
                    { ...doc, palette: { ...doc.palette, name: "Egen", [k]: value } },
                    t("app-release-poster-inspector.poster-settings.on-document.d6facbb2af09"),
                    `palette:${poster.id}:${k}`,
                  )
                }
                className="h-6"
              />
              {
                {
                  background: t("app-release-poster-inspector.background.background.909f488bfdb8"),
                  text: t("app-release-poster-inspector.text.text.91322597c1d2"),
                  accent: t("app-release-poster-inspector.accent.accent.9a36a844cd1c"),
                  muted: t("app-release-poster-inspector.muted.muted.f93aac6e9328"),
                }[k]
              }
            </label>
          ))}
        </div>
      </Section>

      <Section title={t("app-release-poster-inspector.poster-settings.title.5ea77e7fd94e")}>
        <Bilingual
          label={t("app-release-poster-inspector.poster-settings.label.76c766b3293e")}
          value={doc.title}
          languages={langs}
          disabled={ro}
          onCommit={(title) => onDocument({ ...doc, title }, t("app-release-poster-inspector.poster-settings.on-document.76cb1debf047"))}
        />
        <Bilingual
          label={t("app-release-poster-inspector.poster-settings.label.9843441a4ed2")}
          value={doc.genre}
          languages={langs}
          disabled={ro}
          onCommit={(genre) => onDocument({ ...doc, genre }, t("app-release-poster-inspector.poster-settings.on-document.413d1b72987d"))}
        />
        <Bilingual
          label={t("app-release-poster-inspector.poster-settings.label.bcea48b950bf")}
          value={doc.tagline}
          languages={langs}
          disabled={ro}
          onCommit={(tagline) =>
            onDocument({ ...doc, tagline }, t("app-release-poster-inspector.poster-settings.on-document.2a43aa2f90c6"))
          }
        />
        <Bilingual
          label="Logline"
          value={doc.logline}
          languages={langs}
          disabled={ro}
          multiline
          onCommit={(logline) =>
            onDocument({ ...doc, logline }, t("app-release-poster-inspector.poster-settings.on-document.22553ad64a2a"))
          }
        />
      </Section>

      <Section title={t("app-release-poster-inspector.poster-settings.title.3f66ceb9e842")}>
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
                characters: t("app-release-poster-inspector.characters.characters.6813a139c3eb"),
                places: t("app-release-poster-inspector.places.places.d595921f1fd8"),
                objects: t("app-release-poster-inspector.objects.objects.9f4ef282532e"),
              }[list]
            } (${doc[list].length} ${t("app-release-poster-inspector.poster-settings.title.ed32d315d129")})`}
          >
            {all.length === 0 ? (
              <p className="text-[11px] text-text-tertiary">
                {t("app-release-poster-inspector.poster-settings.p.6f14fe5f4a16")}
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
                            ? t("app-release-poster-inspector.rank", { lines: t("app-release-poster-inspector.rank-lines", { count: rank.lines }), scenes: t("app-release-poster-inspector.rank-scenes", { count: rank.scenes }) })
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
        <Section title={t("app-release-poster-inspector.poster-settings.title.a50a256fdc63")}>
          <p className="text-[11px] text-text-tertiary">
            {t("app-release-poster-inspector.poster-settings.p.fa63270ab77e")}
          </p>
          <Button size="sm" variant="secondary" onClick={onRedraft}>
            <LayoutTemplate />
            {t("app-release-poster-inspector.poster-settings.button.41c0a022c8ae")}
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
  onHarmonize,
}: {
  /** P8 (REQ-0400): «Harmoniser stil …» for bildet i elementet. Utelatt: ingen knapp. */
  onHarmonize?: () => void;
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
            t("app-release-poster-inspector.num.on-change.b6b1183fe4fd", { value1: String(label.toLowerCase()) }),
          );
      }}
    />
  );
  const asset = e.assetId ? state.assets[e.assetId] : undefined;
  const variants = asset
    ? Object.values(state.assetVariants).filter((v) => v.assetId === asset.id && (!v.archived || v.id === e.assetVariantId))
    : [];
  const versions = e.assetVariantId ? versionsOf(state, e.assetVariantId) : [];
  const images = sortedAssets(state).filter((a) => !a.archived && a.kind !== "sound");
  return (
    <div className="flex flex-col">
      <Section title={`Element: ${ROLE_LABEL[e.role] ?? e.role}${asset ? ` – ${asset.name}` : ""}`}>
        <p className="text-[11px] text-text-tertiary">
          {e.auto
            ? t("app-release-poster-inspector.element-inspector.p.241b7c63b034")
            : e.role === "custom"
              ? t("app-release-poster-inspector.element-inspector.p.c203b5a6725b")
              : t("app-release-poster-inspector.element-inspector.p.10a1b7bc27b5")}
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
                  ? t("app-release-poster-inspector.element-inspector.on-change.b556ee1a8cdf")
                  : t("app-release-poster-inspector.element-inspector.on-change.0c0e947baff3"),
              )
            }
            className="size-3.5 accent-[var(--accent-brand)]"
          />
          {t("app-release-poster-inspector.element-inspector.label.78b5be9a9eec")}
        </label>
        {e.kind !== "relation" ? (
          <div className="grid grid-cols-2 gap-1.5">
            {num("X", "x", 10, "cm")}
            {num("Y", "y", 10, "cm")}
            {num(t("app-release-poster-inspector.element-inspector.num.3212162adbb9"), "w", 10, "cm")}
            {num(t("app-release-poster-inspector.element-inspector.num.273f9af4132f"), "h", 10, "cm")}
            {num(t("app-release-poster-inspector.element-inspector.num.da69649b9eb8"), "rotation", 1, t("app-release-poster-inspector.element-inspector.num.7e6d751da4af"))}
          </div>
        ) : null}
      </Section>

      {e.kind === "text" || e.kind === "relation" ? (
        <Section title={t("app-release-poster-inspector.element-inspector.title.e9fbbd403aec")}>
          <Bilingual
            label={t("app-release-poster-inspector.element-inspector.label.e9fbbd403aec")}
            value={e.text ?? {}}
            languages={posterLanguages(state, poster.language)}
            disabled={ro}
            multiline
            onCommit={(text) => onChange({ text }, t("app-release-poster-inspector.element-inspector.on-change.d2d4d09164ef"))}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
              {t("app-release-poster-inspector.element-inspector.label.f918229d9270")}
              <select
                value={e.font ?? "serif"}
                disabled={ro}
                onChange={(ev) =>
                  onChange(
                    { font: ev.target.value as "serif" | "sans" },
                    t("app-release-poster-inspector.element-inspector.on-change.0aa1a59cf36f"),
                  )
                }
                className={control}
              >
                <option value="serif">{t("app-release-poster-inspector.element-inspector.option.835f0f675c81")}</option>
                <option value="sans">{t("app-release-poster-inspector.element-inspector.option.630edc49d5ca")}</option>
              </select>
            </label>
            {num(t("app-release-poster-inspector.element-inspector.num.3e623a8ea29f"), "size", 1, "pt")}
            {e.kind === "text" ? (
              <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
                {t("app-release-poster-inspector.element-inspector.label.dc05a260e3fa")}
                <select
                  value={e.align ?? "center"}
                  disabled={ro}
                  onChange={(ev) =>
                    onChange(
                      { align: ev.target.value as "left" | "center" | "right" },
                      t("app-release-poster-inspector.element-inspector.on-change.a2883ee2fad3"),
                    )
                  }
                  className={control}
                >
                  <option value="left">{t("app-release-poster-inspector.element-inspector.option.047d46e4c76b")}</option>
                  <option value="center">{t("app-release-poster-inspector.element-inspector.option.cc130b27b750")}</option>
                  <option value="right">{t("app-release-poster-inspector.element-inspector.option.0817808ae29a")}</option>
                </select>
              </label>
            ) : null}
            {e.kind === "text" ? num(t("app-release-poster-inspector.element-inspector.num.8a200f74cd6b"), "tracking", 1, "1/1000 em") : null}
            <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
              {t("app-release-poster-inspector.element-inspector.label.905640d8322f")}
              <ColorInput
                value={e.color ?? poster.document.palette.text}
                disabled={ro}
                onCommit={(value) =>
                  onChange({ color: value }, t("app-release-poster-inspector.element-inspector.on-change.e4e743923888"), `color:${e.id}`)
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
                    t("app-release-poster-inspector.element-inspector.on-change.0aa1a59cf36f.2"),
                  )
                }
                className="size-3.5 accent-[var(--accent-brand)]"
              />
              {t("app-release-poster-inspector.element-inspector.label.478ff984c35e")}
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
                      t("app-release-poster-inspector.element-inspector.on-change.0aa1a59cf36f.3"),
                    )
                  }
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                {t("app-release-poster-inspector.element-inspector.label.eac19d8e106e")}
              </label>
            ) : null}
            {e.kind === "text" ? (
              <label className="flex items-center gap-1.5 text-xs text-text-primary">
                <input
                  type="checkbox"
                  checked={e.uppercase ?? false}
                  disabled={ro}
                  onChange={(ev) =>
                    onChange({ uppercase: ev.target.checked }, t("app-release-poster-inspector.element-inspector.on-change.0aa1a59cf36f.4"))
                  }
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                {t("app-release-poster-inspector.element-inspector.label.9e443a3526a5")}
              </label>
            ) : null}
          </div>
        </Section>
      ) : null}

      {e.kind === "relation" ? (
        <Section title={t("app-release-poster-inspector.element-inspector.title.3cc1d71d3465")}>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
              {t("app-release-poster-inspector.element-inspector.label.a86049b85f6d")}
              <ColorInput
                value={e.stroke ?? "#ffffff"}
                disabled={ro}
                onCommit={(value) =>
                  onChange(
                    { stroke: value },
                    t("app-release-poster-inspector.element-inspector.on-change.d8705ce5e0f3"),
                    `stroke:${e.id}`,
                  )
                }
                className="h-7"
              />
            </label>
            {num(t("app-release-poster-inspector.element-inspector.num.8788f005a4dc"), "strokeWidth", 1, "mm")}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-text-primary">
            <input
              type="checkbox"
              checked={e.dashed ?? false}
              disabled={ro}
              onChange={(ev) =>
                onChange({ dashed: ev.target.checked }, t("app-release-poster-inspector.element-inspector.on-change.30fcdec342d4"))
              }
              className="size-3.5 accent-[var(--accent-brand)]"
            />
            {t("app-release-poster-inspector.element-inspector.label.43ca714179c4")}
          </label>
        </Section>
      ) : null}

      {e.kind === "image" ? (
        <Section title={t("app-release-poster-inspector.element-inspector.title.e98cd2f8a5a0")}>
          <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
            {t("app-release-poster-inspector.element-inspector.label.449e4324fffc")}
            <select
              value={e.assetId ?? ""}
              disabled={ro}
              onChange={(ev) =>
                onChange(
                  { assetId: ev.target.value as never, assetVariantId: null, versionId: null },
                  t("app-release-poster-inspector.element-inspector.on-change.f4fde8162495"),
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
                    t("app-release-poster-inspector.element-inspector.on-change.12b4624bd2fb"),
                  )
                }
                className={control}
              >
                <option value="">{t("app-release-poster-inspector.element-inspector.option.e4771266e271")}</option>
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
              {t("app-release-poster-inspector.element-inspector.label.b20262857972")}
              <select
                value={e.versionId ?? ""}
                disabled={ro}
                onChange={(ev) =>
                  onChange(
                    { versionId: (ev.target.value || null) as never },
                    t("app-release-poster-inspector.element-inspector.on-change.7a27c2072c12"),
                  )
                }
                className={control}
              >
                <option value="">{t("app-release-poster-inspector.element-inspector.option.37292afe116b")}</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {t("app-release-poster-inspector.element-inspector.option.b20262857972")} {v.number}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {onHarmonize && e.assetId ? (
            <Button
              size="sm"
              variant="secondary"
              className="self-start"
              disabled={ro}
              data-testid="poster-harmonize"
              onClick={onHarmonize}
              title={t("app-release-poster-inspector.element-inspector.title.a5dd5de6878f")}
            >
              {t("app-release-poster-inspector.element-inspector.button.f568217d5eee")}
            </Button>
          ) : null}
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
              {t("app-release-poster-inspector.element-inspector.label.8534544fad56")}
              <select
                value={e.fit ?? "cover"}
                disabled={ro}
                onChange={(ev) =>
                  onChange(
                    { fit: ev.target.value as "cover" | "contain" },
                    t("app-release-poster-inspector.element-inspector.on-change.f40d8e1e9fa6"),
                  )
                }
                className={control}
              >
                <option value="contain">{t("app-release-poster-inspector.element-inspector.option.cc93c9e05f5c")}</option>
                <option value="cover">{t("app-release-poster-inspector.element-inspector.option.e3f412286b9d")}</option>
              </select>
            </label>
            <Field
              label={t("app-release-poster-inspector.element-inspector.label.28d7250686e8")}
              type="number"
              value={String(Math.round((e.opacity ?? 1) * 100))}
              disabled={ro}
              onCommit={(v) => {
                const n = Number(v);
                if (n >= 0 && n <= 100)
                  onChange({ opacity: n / 100 }, t("app-release-poster-inspector.element-inspector.on-change.cb50faab5279"));
              }}
            />
          </div>
        </Section>
      ) : null}

      {e.kind === "rect" ? (
        <Section title={t("app-release-poster-inspector.element-inspector.title.6a5955d62cf5")}>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
              {t("app-release-poster-inspector.element-inspector.label.905640d8322f.2")}
              <ColorInput
                value={e.fill ?? "#000000"}
                disabled={ro}
                onCommit={(value) =>
                  onChange({ fill: value }, t("app-release-poster-inspector.element-inspector.on-change.e4e743923888.2"), `fill:${e.id}`)
                }
                className="h-7"
              />
            </label>
            <Field
              label={t("app-release-poster-inspector.element-inspector.label.28d7250686e8.2")}
              type="number"
              value={String(Math.round((e.opacity ?? 1) * 100))}
              disabled={ro}
              onCommit={(v) => {
                const n = Number(v);
                if (n >= 0 && n <= 100)
                  onChange({ opacity: n / 100 }, t("app-release-poster-inspector.element-inspector.on-change.cb50faab5279.2"));
              }}
            />
            {num(t("app-release-poster-inspector.element-inspector.num.099003fd2c1f"), "radius", 1, "mm")}
          </div>
        </Section>
      ) : null}

      {editable ? (
        <Section title={t("app-release-poster-inspector.element-inspector.title.e65d846821e0")}>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => onOrder("front")}>
              {t("app-release-poster-inspector.element-inspector.button.d2c02687b715")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onOrder("back")}>
              {t("app-release-poster-inspector.element-inspector.button.c6f0bfbd255e")}
            </Button>
            {!e.auto && e.role !== "custom" ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={onReset}
                title={t("app-release-poster-inspector.element-inspector.title.3dff3eeeb264")}
              >
                <RotateCcw />
                {t("app-release-poster-inspector.element-inspector.button.b56be23e106d")}
              </Button>
            ) : null}
            {e.role === "custom" ? (
              <Button size="sm" variant="ghost" onClick={onRemove}>
                <Trash2 />
                {t("app-release-poster-inspector.element-inspector.button.6c9ccab16bf6")}
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
  lang: string;
  onShow: (ids: readonly string[]) => void;
}) {
  const checks = useMemo<PosterCheck[]>(
    () => posterChecks(state, poster, lang),
    [state, poster, lang],
  );
  return (
    <ul
      className="flex flex-col gap-1.5 px-3 py-3"
      aria-label={t("app-release-poster-inspector.poster-checks-list.aria-label.4278fd595e5b")}
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
                aria-label={t("app-release-poster-inspector.poster-checks-list.aria-label.896b8a01afb9", { text: String(c.text) })}
                onClick={() => onShow(c.elementIds!)}
              >
                {t("app-release-poster-inspector.poster-checks-list.button.f1ac6a3203ce")}
              </button>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
