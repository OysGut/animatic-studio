/**
 * Detaljer for én ressurs: navn og alternative navn (REQ-0126), kategori og stikkord (REQ-0124),
 * visuelle varianter med bildeversjoner og godkjenning (REQ-0135, REQ-0136, REQ-0146, REQ-0149)
 * og scenene der ressursen er brukt (REQ-0131).
 */
import { Archive, ArchiveRestore, Check, ImagePlus, Loader2, Music, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ASSET_KIND_LABEL,
  ASSET_KINDS,
  ASSET_MIME_TYPES,
  USAGE_LABEL,
  VISUAL_STYLES,
  allAssetUsage,
  formatHeading,
  newId,
  variantsOf,
  versionsOf,
  type Asset,
  type AssetFields,
  type AssetNameKind,
  type AssetVariant,
  type ProjectState,
  type VisualStyle,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { useProfiles } from "@/app/project/use-project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { uploadAssetImage, useImageUrls } from "./asset-images";
import { uploadAssetAudio } from "./asset-audio";
import { PaneResizer, usePaneSize } from "@/app/shell/pane-size";

const NAME_KIND_LABEL: Record<AssetNameKind, string> = {
  alias: "Alternativt navn",
  nickname: "Kallenavn",
  former: "Tidligere navn",
  language: "Annet språk",
};

const STYLE_LABEL: Record<VisualStyle, string> = {
  reference: "Originalt referansebilde",
  illustrated: "Illustrert",
  realistic: "Filmrealistisk",
  animatic: "Animatic",
  poster: "Plakat",
  other: "Annet",
};

interface Props {
  readonly state: ProjectState;
  readonly projectId: string;
  readonly productionId: string;
  readonly asset: Asset;
  readonly editable: boolean;
  readonly cmds: Commands;
  readonly onGoToScene: (occurrenceId: string) => void;
}

function fieldsOf(a: Asset): AssetFields {
  return {
    kind: a.kind,
    name: a.name,
    names: a.names,
    description: a.description,
    category: a.category,
    tags: a.tags,
  };
}

const same = (x: AssetFields, y: AssetFields) => JSON.stringify(x) === JSON.stringify(y);

export function AssetDetail(props: Props) {
  const { state, asset, editable, cmds, productionId } = props;
  const [draft, setDraft] = useState<AssetFields>(() => fieldsOf(asset));
  const [tagsText, setTagsText] = useState(asset.tags.join(", "));
  const [err, setErr] = useState<string | null>(null);
  const [usedWidth, setUsedWidth] = usePaneSize("asset-used-in", 280, 200, 520);
  const last = useRef(fieldsOf(asset));
  // Ta inn endringer utenfra (andre brukere, angre) bare hvis brukeren ikke har ulagrede endringer.
  // Lagres bare når innholdet faktisk er endret (ny innlasting gir nye objekter med samme innhold).
  useEffect(() => {
    const now = fieldsOf(asset);
    const prev = last.current;
    if (same(now, prev)) return;
    last.current = now;
    const untouched = same(draft, prev) && tagsText === prev.tags.join(", ");
    if (untouched) {
      setDraft(now);
      setTagsText(now.tags.join(", "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset]);

  const withTags: AssetFields = {
    ...draft,
    tags: tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
  const dirty = !same(withTags, fieldsOf(asset));
  const usage = useMemo(
    () => allAssetUsage(state, productionId).get(asset.id) ?? [],
    [state, productionId, asset],
  );

  function save() {
    setErr(
      cmds.run(
        { type: "UpdateAsset", assetId: asset.id, fields: withTags },
        `Endre «${asset.name}»`,
      ),
    );
  }

  const setName = (i: number, patch: Partial<AssetFields["names"][number]>) =>
    setDraft((d) => ({
      ...d,
      names: d.names.map((n, j) => (j === i ? { ...n, ...patch } : n)),
    }));

  return (
    <div className="mx-auto flex max-w-[1100px] gap-6 p-6">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {/* Navn og beskrivelse */}
        <section className="flex flex-col gap-3 border border-border bg-surface-1 p-4">
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor="a-name" className="text-xs text-text-tertiary">
                Foretrukket navn
              </label>
              <Input
                id="a-name"
                value={draft.name}
                maxLength={200}
                disabled={!editable}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="h-9 bg-surface-3 text-base font-medium"
              />
            </div>
            <div className="flex w-[180px] flex-col gap-1">
              <label htmlFor="a-kind" className="text-xs text-text-tertiary">
                Type
              </label>
              <select
                id="a-kind"
                value={draft.kind}
                disabled={!editable}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as Asset["kind"] })}
                className="h-9 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
              >
                {ASSET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ASSET_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-text-tertiary">
              Alternative navn – brukes for å kjenne igjen ressursen i manuset
            </span>
            {draft.names.length === 0 ? (
              <p className="text-xs text-text-tertiary">Ingen alternative navn.</p>
            ) : null}
            {draft.names.map((n, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  aria-label={`Alternativt navn ${i + 1}`}
                  value={n.name}
                  maxLength={200}
                  disabled={!editable}
                  onChange={(e) => setName(i, { name: e.target.value })}
                  className="h-8 min-w-0 flex-1 bg-surface-3 text-[13px]"
                />
                <select
                  aria-label={`Type navn ${i + 1}`}
                  value={n.kind}
                  disabled={!editable}
                  onChange={(e) =>
                    setName(i, {
                      kind: e.target.value as AssetNameKind,
                      language: e.target.value === "language" ? (n.language ?? "en") : null,
                    })
                  }
                  className="h-8 w-[150px] rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                >
                  {(Object.keys(NAME_KIND_LABEL) as AssetNameKind[]).map((k) => (
                    <option key={k} value={k}>
                      {NAME_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                {n.kind === "language" ? (
                  <Input
                    aria-label={`Språkkode for navn ${i + 1}`}
                    title="Språkkode, f.eks. en for engelsk"
                    value={n.language ?? ""}
                    maxLength={12}
                    disabled={!editable}
                    onChange={(e) => setName(i, { language: e.target.value.toLowerCase() })}
                    className="h-8 w-[56px] bg-surface-3 text-xs"
                  />
                ) : null}
                {editable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Fjern navnet ${n.name}`}
                    onClick={() =>
                      setDraft((d) => ({ ...d, names: d.names.filter((_, j) => j !== i) }))
                    }
                  >
                    <X />
                  </Button>
                ) : null}
              </div>
            ))}
            {editable ? (
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    names: [...d.names, { name: "", kind: "alias", language: null }],
                  }))
                }
              >
                <Plus />
                Legg til navn
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="a-cat" className="text-xs text-text-tertiary">
                Kategori
              </label>
              <Input
                id="a-cat"
                value={draft.category}
                maxLength={100}
                disabled={!editable}
                placeholder="F.eks. Familie, Rekvisitt, Gården"
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className="h-8 bg-surface-3 text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="a-tags" className="text-xs text-text-tertiary">
                Stikkord (skill med komma)
              </label>
              <Input
                id="a-tags"
                value={tagsText}
                disabled={!editable}
                placeholder="F.eks. hovedrolle, vinter"
                onChange={(e) => setTagsText(e.target.value)}
                className="h-8 bg-surface-3 text-[13px]"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="a-desc" className="text-xs text-text-tertiary">
              Beskrivelse
            </label>
            <Textarea
              id="a-desc"
              value={draft.description}
              maxLength={5000}
              disabled={!editable}
              rows={3}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="bg-surface-3 text-[13px]"
            />
          </div>
          {editable ? (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={!dirty}>
                <Check />
                Lagre endringer
              </Button>
              {dirty ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(fieldsOf(asset));
                    setTagsText(asset.tags.join(", "));
                  }}
                >
                  Forkast
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() =>
                  setErr(
                    cmds.run(
                      { type: "SetAssetArchived", assetId: asset.id, archived: !asset.archived },
                      asset.archived ? `Hent fram «${asset.name}»` : `Arkiver «${asset.name}»`,
                    ),
                  )
                }
                title={
                  asset.archived
                    ? "Vis ressursen i biblioteket igjen"
                    : "Skjul ressursen fra listen. Ingenting slettes, og scener som bruker den, påvirkes ikke."
                }
              >
                {asset.archived ? <ArchiveRestore /> : <Archive />}
                {asset.archived ? "Hent fram" : "Arkiver"}
              </Button>
            </div>
          ) : null}
          {err ? (
            <p role="alert" className="text-xs text-status-danger">
              {err}
            </p>
          ) : null}
        </section>

        <Variants {...props} />
      </div>

      {/* Bruk i manuset */}
      <aside aria-label="Brukt i scener" style={{ width: usedWidth }} className="relative shrink-0">
        <PaneResizer
          edge="left"
          size={usedWidth}
          onSize={setUsedWidth}
          min={200}
          max={520}
          label="Bredde på «Brukt i scener»"
        />
        <div className="border border-border bg-surface-1">
          <div className="flex h-8 items-center justify-between border-b border-border px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
            <span>Brukt i scener</span>
            <span className="tabular normal-case tracking-normal">{usage.length}</span>
          </div>
          {usage.length === 0 ? (
            <p className="px-3 py-3 text-xs text-text-tertiary">
              Ikke funnet i manuset under noen av navnene.
            </p>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto py-1">
              {usage.map((u) => {
                const occ = state.occurrences[u.occurrenceId]!;
                const v = state.variants[occ.variantId];
                return (
                  <li key={u.occurrenceId}>
                    <button
                      type="button"
                      onClick={() => props.onGoToScene(u.occurrenceId)}
                      title="Vis scenen i manus"
                      className={
                        "grid w-full grid-cols-[34px_1fr] gap-1.5 px-3 py-1 text-left hover:bg-surface-3" +
                        (u.active ? "" : " opacity-60")
                      }
                    >
                      <span className="tabular truncate text-right font-mono text-xs text-text-secondary">
                        {u.number ?? "–"}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs text-text-primary">
                          {v ? formatHeading(v.heading) : "—"}
                        </span>
                        <span className="block truncate text-[11px] text-text-tertiary">
                          {USAGE_LABEL[u.how]}
                          {u.matchedName !== asset.name ? ` som «${u.matchedName}»` : ""}
                          {u.active ? "" : " · deaktivert"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {asset.kind !== "character" && asset.kind !== "location" && usage.length ? (
            <p className="border-t border-border px-3 py-2 text-[11px] text-text-tertiary">
              Mulige treff: ord i teksten som begynner med navnet. Sjekk at de stemmer.
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

// ---------- Visuelle varianter og bildeversjoner ----------

function Variants({ state, projectId, asset, editable, cmds }: Props) {
  const variants = variantsOf(state, asset.id);
  const [name, setName] = useState("");
  const [style, setStyle] = useState<VisualStyle>("animatic");
  const [appearance, setAppearance] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const paths = variants.flatMap((v) => versionsOf(state, v.id).map((x) => x.mediaPath));
  const urls = useImageUrls(paths);
  const shown = variants.filter((v) => showArchived || !v.archived);
  const archivedCount = variants.length - variants.filter((v) => !v.archived).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="shrink-0 whitespace-nowrap text-sm font-medium text-text-primary">
          Visuelle varianter
        </h2>
        <span className="text-xs text-text-tertiary">
          Én identitet – flere utseender og stiler. Hver variant har egne versjoner og egen
          godkjenning.
        </span>
        {archivedCount ? (
          <label className="ml-auto flex items-center gap-1 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="size-3.5 accent-[var(--accent-brand)]"
            />
            Arkiverte ({archivedCount})
          </label>
        ) : null}
      </div>
      {shown.map((v) => (
        <VariantCard
          key={v.id}
          state={state}
          projectId={projectId}
          asset={asset}
          variant={v}
          editable={editable}
          cmds={cmds}
          urls={urls.data ?? {}}
        />
      ))}
      {variants.length === 0 ? (
        <p className="text-[13px] text-text-secondary">
          Ingen varianter ennå. En variant er for eksempel «Animatic», «Plakat» eller «Vinterklær».
          Last opp bilder til den – hvert bilde blir en versjon.
        </p>
      ) : null}
      {editable ? (
        <form
          className="flex flex-wrap items-end gap-2 border border-dashed border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim() || STYLE_LABEL[style];
            const r = cmds.run(
              {
                type: "CreateAssetVariant",
                variantId: newId<"asset_variant">(),
                assetId: asset.id,
                fields: { name: n, style, appearance },
              },
              `Ny variant «${n}»`,
            );
            setErr(r);
            if (!r) {
              setName("");
              setAppearance("");
            }
          }}
        >
          <Field label="Navn på variant">
            <Input
              value={name}
              maxLength={200}
              placeholder={STYLE_LABEL[style]}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-[180px] bg-surface-3 text-[13px]"
            />
          </Field>
          <Field label="Stil">
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as VisualStyle)}
              className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
            >
              {VISUAL_STYLES.map((s) => (
                <option key={s} value={s}>
                  {STYLE_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Utseende (valgfritt)">
            <Input
              value={appearance}
              maxLength={500}
              placeholder="F.eks. kort hår, vinterklær"
              onChange={(e) => setAppearance(e.target.value)}
              className="h-8 w-[220px] bg-surface-3 text-[13px]"
            />
          </Field>
          <Button type="submit" size="sm" variant="secondary">
            <Plus />
            Ny variant
          </Button>
          {err ? (
            <p role="alert" className="w-full text-xs text-status-danger">
              {err}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-tertiary">
      {label}
      {children}
    </label>
  );
}

function VariantCard({
  state,
  projectId,
  asset,
  variant,
  editable,
  cmds,
  urls,
}: {
  state: ProjectState;
  projectId: string;
  asset: Asset;
  variant: AssetVariant;
  editable: boolean;
  cmds: Commands;
  urls: Readonly<Record<string, string>>;
}) {
  const versions = versionsOf(state, variant.id);
  const profiles = useProfiles([...new Set(versions.map((v) => v.createdBy).filter(Boolean))]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [vName, setVName] = useState(variant.name);
  const [vStyle, setVStyle] = useState(variant.style);
  const [vAppearance, setVAppearance] = useState(variant.appearance);
  const input = useRef<HTMLInputElement | null>(null);

  async function upload(file: File) {
    setErr(null);
    setUploading(true);
    try {
      // Lydfiler (DEC-0044) og bilder lastes opp hver for seg
      const sound = asset.kind === "sound";
      const { versionId, media } = sound
        ? await uploadAssetAudio(projectId, asset.id, file)
        : await uploadAssetImage(projectId, asset.id, file);
      const r = await cmds.runAndWait(
        {
          type: "AddAssetVersion",
          versionId: versionId as never,
          variantId: variant.id,
          media,
          note: "",
        },
        `Nytt bilde i «${variant.name}»`,
      );
      if (r.error) setErr(r.error);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div
      className={
        "flex flex-col gap-2 border border-border bg-surface-1 p-3" +
        (variant.archived ? " opacity-70" : "")
      }
    >
      <div className="flex items-start gap-2">
        {editing ? (
          <form
            className="flex flex-1 flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const r = cmds.run(
                {
                  type: "UpdateAssetVariant",
                  variantId: variant.id,
                  fields: { name: vName, style: vStyle, appearance: vAppearance },
                },
                `Endre variant «${variant.name}»`,
              );
              setErr(r);
              if (!r) setEditing(false);
            }}
          >
            <Field label="Navn">
              <Input
                value={vName}
                maxLength={200}
                onChange={(e) => setVName(e.target.value)}
                className="h-8 w-[180px] bg-surface-3 text-[13px]"
              />
            </Field>
            <Field label="Stil">
              <select
                value={vStyle}
                onChange={(e) => setVStyle(e.target.value as VisualStyle)}
                className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
              >
                {VISUAL_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {STYLE_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Utseende">
              <Input
                value={vAppearance}
                maxLength={500}
                onChange={(e) => setVAppearance(e.target.value)}
                className="h-8 w-[220px] bg-surface-3 text-[13px]"
              />
            </Field>
            <Button type="submit" size="sm">
              Lagre
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Avbryt
            </Button>
          </form>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-text-primary">
              {variant.name}
              {variant.archived ? (
                <span className="ml-2 text-xs font-normal text-text-tertiary">Arkivert</span>
              ) : null}
            </p>
            <p className="text-xs text-text-tertiary">
              {STYLE_LABEL[variant.style]}
              {variant.appearance ? ` · ${variant.appearance}` : ""}
            </p>
          </div>
        )}
        {editable && !editing ? (
          <div className="flex shrink-0 items-center gap-1">
            <input
              ref={input}
              type="file"
              accept={
                asset.kind === "sound"
                  ? "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
                  : ASSET_MIME_TYPES.join(",")
              }
              className="hidden"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={uploading}
              onClick={() => input.current?.click()}
            >
              {uploading ? (
                <Loader2 className="animate-spin" />
              ) : asset.kind === "sound" ? (
                <Music />
              ) : (
                <ImagePlus />
              )}
              {uploading
                ? "Laster opp …"
                : asset.kind === "sound"
                  ? "Last opp lyd"
                  : "Last opp bilde"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setVName(variant.name);
                setVStyle(variant.style);
                setVAppearance(variant.appearance);
                setEditing(true);
              }}
            >
              Endre
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={variant.archived ? "Hent fram varianten" : "Arkiver varianten"}
              title={variant.archived ? "Hent fram" : "Arkiver (ingenting slettes)"}
              onClick={() =>
                setErr(
                  cmds.run(
                    {
                      type: "SetAssetVariantArchived",
                      variantId: variant.id,
                      archived: !variant.archived,
                    },
                    variant.archived ? "Hent fram variant" : "Arkiver variant",
                  ),
                )
              }
            >
              {variant.archived ? <ArchiveRestore /> : <Archive />}
            </Button>
          </div>
        ) : null}
      </div>

      {versions.length === 0 ? (
        <p className="text-xs text-text-tertiary">Ingen bilder ennå.</p>
      ) : (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={`Versjoner av ${variant.name}`}>
          {versions.map((ver) => {
            const approved = variant.approvedVersionId === ver.id;
            const url = urls[ver.mediaPath];
            return (
              <li
                key={ver.id}
                className={
                  "flex w-[148px] shrink-0 flex-col gap-1 border p-1.5 " +
                  (approved ? "border-status-success bg-status-success-bg" : "border-border")
                }
              >
                {asset.kind === "sound" ? (
                  <div className="flex h-[120px] flex-col items-center justify-center gap-2 bg-surface-3 px-1">
                    <Music className="size-6 text-text-tertiary" aria-hidden />
                    {url ? (
                      <audio
                        src={url}
                        controls
                        preload="none"
                        className="h-7 w-full"
                        aria-label={`${asset.name}, versjon ${ver.number}`}
                      />
                    ) : (
                      <Loader2 className="size-4 animate-spin text-text-tertiary" aria-hidden />
                    )}
                  </div>
                ) : (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-[120px] items-center justify-center overflow-hidden bg-surface-3"
                    title="Åpne bildet i full størrelse"
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={`${asset.name} – ${variant.name}, versjon ${ver.number}`}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <Loader2 className="size-4 animate-spin text-text-tertiary" aria-hidden />
                    )}
                  </a>
                )}
                <div className="flex items-center justify-between text-[11px]">
                  <span className="tabular font-mono text-text-secondary">v{ver.number}</span>
                  {approved ? (
                    <span className="flex items-center gap-0.5 font-medium text-status-success">
                      <Check className="size-3" aria-hidden />
                      Godkjent
                    </span>
                  ) : null}
                </div>
                <span
                  className="truncate text-[11px] text-text-tertiary"
                  title={ver.note || undefined}
                >
                  {new Date(ver.createdAt).toLocaleDateString("nb-NO")}
                  {profiles.data?.[ver.createdBy]?.display_name
                    ? ` · ${profiles.data[ver.createdBy]!.display_name}`
                    : ""}
                  {ver.width && ver.height ? ` · ${ver.width}×${ver.height}` : ""}
                  {ver.durationMs
                    ? ` · ${(ver.durationMs / 1000).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} s`
                    : ""}
                </span>
                {editable ? (
                  approved ? (
                    <button
                      type="button"
                      className="text-left text-[11px] text-text-tertiary hover:text-text-primary"
                      onClick={() =>
                        setErr(
                          cmds.run(
                            { type: "ApproveAssetVersion", variantId: variant.id, versionId: null },
                            "Fjern godkjenning",
                          ),
                        )
                      }
                    >
                      Fjern godkjenning
                    </button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 justify-start px-1 text-xs"
                      onClick={() =>
                        setErr(
                          cmds.run(
                            {
                              type: "ApproveAssetVersion",
                              variantId: variant.id,
                              versionId: ver.id,
                            },
                            `Godkjenn v${ver.number} av «${variant.name}»`,
                          ),
                        )
                      }
                    >
                      Godkjenn
                    </Button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {versions.length > 1 ? (
        <p className="text-[11px] text-text-tertiary">
          Nye bilder tas aldri i bruk automatisk. Scener som bruker en godkjent versjon, beholder
          den til du selv bytter.
        </p>
      ) : null}
      {err ? (
        <p role="alert" className="text-xs text-status-danger">
          {err}
        </p>
      ) : null}
    </div>
  );
}
