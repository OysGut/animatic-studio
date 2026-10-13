/**
 * Visuelle stilprofiler i ressursbiblioteket (REQ-0121, mandat 8 og 9.4, DEC-0078). Profilene er de samme som
 * under «Filmens visuelle stil» på prosjektoversikten; redigeringen bruker samme dialog (StyleGuideDialog).
 */
import { Palette, Plus } from "lucide-react";
import {
  STYLE_TEXT_FIELDS,
  type LibraryStyleProfile,
  type ProjectState,
  type StyleTextField,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { StyleGuideDialog } from "@/app/projects/StyleGuideSection";
import { Button } from "@/components/ui/button";
import { useImageUrls } from "./asset-images";

/** Feltene som vises i oversikten (resten ses i dialogen). */
const SHOWN: readonly { key: StyleTextField; label: string }[] = [
  { key: "visualStyle", label: "Visuell stil" },
  { key: "technique", label: "Teknikk og materialer" },
  { key: "lighting", label: "Lys" },
  { key: "mood", label: "Stemning" },
  { key: "characterDesign", label: "Figurer" },
  { key: "environmentDesign", label: "Omgivelser" },
  { key: "avoid", label: "Unngå" },
];

function Swatches({ colors }: { colors: readonly string[] }) {
  return (
    <>
      {colors.map((c) => (
        <span
          key={c}
          aria-hidden
          className="inline-block size-2.5 rounded-full border border-border align-middle"
          style={{ background: c }}
        />
      ))}
    </>
  );
}

/** Listen over stilprofiler (i stedet for ressurslisten når «Stilprofiler» er valgt). */
export function StyleProfileList({
  items,
  selected,
  onSelect,
  editable,
  onNew,
  emptyText,
}: {
  items: readonly LibraryStyleProfile[];
  selected: string | null;
  onSelect: (id: string) => void;
  editable: boolean;
  /** «Ny stilprofil» (eller «Lag filmens visuelle stil» når ingen finnes). */
  onNew: () => void;
  emptyText: string;
}) {
  const hasDefault = items.some((p) => p.isDefault);
  return (
    <ul aria-label="Stilprofiler" className="min-h-0 flex-1 overflow-y-auto py-1">
      {items.length === 0 ? (
        <li className="px-3 py-4 text-[13px] text-text-tertiary">{emptyText}</li>
      ) : null}
      {items.map((p) => (
        <li key={p.profile.id}>
          <button
            type="button"
            onClick={() => onSelect(p.profile.id)}
            aria-current={p.profile.id === selected ? "true" : undefined}
            className={
              "grid w-full grid-cols-[36px_1fr] items-center gap-2 px-2 py-1.5 text-left " +
              (p.profile.id === selected ? "bg-accent-selection" : "hover:bg-surface-3")
            }
          >
            <span className="flex size-9 items-center justify-center rounded-sm bg-surface-3 text-text-tertiary">
              <Palette className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] text-text-primary">{p.profile.name}</span>
              <span className="flex items-center gap-1 truncate text-[11px] text-text-tertiary">
                {p.isDefault ? "Standard · " : ""}
                {p.usesLabel}
                {p.profile.guide.palette.colors.length ? (
                  <span className="ml-1 flex items-center gap-0.5">
                    <Swatches colors={p.profile.guide.palette.colors.slice(0, 6)} />
                  </span>
                ) : null}
              </span>
            </span>
          </button>
        </li>
      ))}
      {editable ? (
        <li className="px-2 pt-1">
          <Button size="sm" variant="ghost" onClick={onNew} className="w-full justify-start">
            <Plus />
            {hasDefault
              ? "Ny stilprofil (plakater, steder, AI-video …)"
              : "Lag filmens visuelle stil"}
          </Button>
        </li>
      ) : null}
    </ul>
  );
}

/** Oversikt over én stilprofil med knapp til redigeringen. */
export function StyleProfileDetail({
  state,
  item,
  editable,
  onEdit,
}: {
  state: ProjectState;
  item: LibraryStyleProfile;
  editable: boolean;
  onEdit: () => void;
}) {
  const g = item.profile.guide;
  const refs = g.referenceVersionIds
    .map((id) => state.assetVersions[id])
    .filter((v): v is NonNullable<typeof v> => !!v);
  const urls = useImageUrls(refs.map((v) => v.mediaPath)).data ?? {};
  return (
    <div className="flex max-w-[860px] flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
            Visuell stilprofil
          </p>
          <h2 className="text-lg font-semibold text-text-primary">{item.profile.name}</h2>
          <p className="text-xs text-text-secondary">
            {item.isDefault
              ? "Standard – brukes i alle AI-beskrivelser der ingen annen profil er valgt"
              : `Gjelder for: ${item.usesLabel}`}
            {item.isDefault && item.uses.length ? ` · også valgt for ${item.usesLabel}` : ""}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onEdit}>
          <Palette />
          {editable ? "Rediger …" : "Vis …"}
        </Button>
      </div>
      <section className="border border-border bg-surface-1 px-4 py-3 text-[13px] text-text-secondary">
        {item.summary ? <p className="text-text-primary">{item.summary}</p> : null}
        <p className="mt-1 text-xs text-text-tertiary">
          {item.filled} av {STYLE_TEXT_FIELDS.length} felt fylt ut · {refs.length} forbildebilder
          {g.palette.colors.length ? " · " : ""}
          <Swatches colors={g.palette.colors} />
        </p>
        {g.palette.description ? (
          <p className="mt-1 text-xs text-text-secondary">{g.palette.description}</p>
        ) : null}
      </section>
      <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
        {SHOWN.filter((f) => g[f.key].trim()).map((f) => (
          <div key={f.key} className="contents">
            <dt className="text-xs text-text-tertiary">{f.label}</dt>
            <dd className="whitespace-pre-wrap text-text-primary">{g[f.key]}</dd>
          </div>
        ))}
      </dl>
      {refs.length ? (
        <section aria-label="Forbildebilder" className="flex flex-col gap-1">
          <h3 className="text-xs font-medium text-text-tertiary">Forbildebilder</h3>
          <ul className="flex flex-wrap gap-2">
            {refs.map((v) => {
              const va = state.assetVariants[v.variantId];
              const a = va ? state.assets[va.assetId] : undefined;
              const label = `${a?.name ?? "Ressurs"} – ${va?.name ?? ""} v${v.number}`;
              return (
                <li key={v.id} className="flex w-28 flex-col gap-1 text-[11px] text-text-secondary">
                  <span className="flex h-20 items-center justify-center overflow-hidden bg-surface-3">
                    {urls[v.mediaPath] ? (
                      <img
                        src={urls[v.mediaPath]}
                        alt={label}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : null}
                  </span>
                  <span className="line-clamp-2">{label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {item.filled === 0 ? (
        <p className="text-[13px] text-text-secondary">
          Ikke fylt ut. En bildemodell vet ingenting om filmen – her beskriver dere stil, teknikk,
          farger, lys og stemning, så alle bilder AI lager, passer inn.
        </p>
      ) : null}
    </div>
  );
}

/** Dialogen for stilprofiler: «default» = standardprofilen, «new» = ny egen profil, ellers profilens id. */
export function LibraryStyleDialog({
  state,
  cmds,
  editable,
  target,
  onClose,
}: {
  state: ProjectState;
  cmds: Commands;
  editable: boolean;
  target: string;
  onClose: () => void;
}) {
  return (
    <StyleGuideDialog
      state={state}
      cmds={cmds}
      editable={editable}
      profileId={target === "default" ? null : target}
      onClose={onClose}
    />
  );
}
