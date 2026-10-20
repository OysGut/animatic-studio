/**
 * Visuelle stilprofiler i ressursbiblioteket (REQ-0121, mandat 8 og 9.4, DEC-0078). Profilene er de samme som
 * under «Filmens visuelle stil» på prosjektoversikten; redigeringen bruker samme dialog (StyleGuideDialog).
 */
import { Palette, Plus } from "lucide-react";
import { STYLE_TEXT_FIELDS, type LibraryStyleProfile, type ProjectState, type StyleTextField } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { StyleGuideDialog } from "@/app/projects/StyleGuideSection";
import { Button } from "@/components/ui/button";
import { useImageUrls } from "./asset-images";
import { t } from "@/core/i18n/keyed";

/** Feltene som vises i oversikten (resten ses i dialogen). */
const shown = (): readonly { key: StyleTextField; label: string }[] => [
  { key: "visualStyle", label: t("app-library-style-profiles-panel.label.label.f44f2af09965") },
  { key: "technique", label: t("app-library-style-profiles-panel.label.label.b5563d8b62f8") },
  { key: "lighting", label: t("app-library-style-profiles-panel.label.label.9b3346a579c0") },
  { key: "mood", label: t("app-library-style-profiles-panel.label.label.0558d9b49a26") },
  { key: "characterDesign", label: t("app-library-style-profiles-panel.label.label.b75a6a27ab02") },
  { key: "environmentDesign", label: t("app-library-style-profiles-panel.label.label.d856fbfbb47b") },
  { key: "avoid", label: t("app-library-style-profiles-panel.label.label.1457a2a03402") },
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
    <ul
      aria-label={t("app-library-style-profiles-panel.style-profile-list.aria-label.29c07dff0a85")}
      className="min-h-0 flex-1 overflow-y-auto py-1"
    >
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
                {p.isDefault ? t("app-library-style-profiles-panel.style-profile-list.span.9673cf13d08d") : ""}
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
              ? t("app-library-style-profiles-panel.style-profile-list.button.e51b6f38822f")
              : t("app-library-style-profiles-panel.style-profile-list.button.52ad89848f13")}
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
          <p className="text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
            {t("app-library-style-profiles-panel.style-profile-detail.p.dd7703121164")}
          </p>
          <h2 className="text-lg font-semibold text-text-primary">{item.profile.name}</h2>
          <p className="text-xs text-text-secondary">
            {item.isDefault
              ? t("app-library-style-profiles-panel.style-profile-detail.p.6fa7e9761168")
              : t("app-library-style-profiles-panel.style-profile-detail.p.20c2f1c93630", { usesLabel: String(item.usesLabel) })}
            {item.isDefault && item.uses.length
              ? t("app-library-style-profiles-panel.style-profile-detail.p.a985272b5d55", { usesLabel: String(item.usesLabel) })
              : ""}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onEdit}>
          <Palette />
          {editable ? t("app-library-style-profiles-panel.style-profile-detail.button.00cae1197825") : t("app-library-style-profiles-panel.style-profile-detail.button.d2ab745677b3")}
        </Button>
      </div>
      <section className="border border-border bg-surface-1 px-4 py-3 text-[13px] text-text-secondary">
        {item.summary ? <p className="text-text-primary">{item.summary}</p> : null}
        <p className="mt-1 text-xs text-text-tertiary">
          {item.filled} {t("app-library-style-profiles-panel.style-profile-detail.p.2ceb29348105")} {STYLE_TEXT_FIELDS.length}{" "}
          {t("app-library-style-profiles-panel.style-profile-detail.p.27c0847f24a8")} · {refs.length}{" "}
          {t("app-library-style-profiles-panel.style-profile-detail.p.3fbfc6514119")}
          {g.palette.colors.length ? " · " : ""}
          <Swatches colors={g.palette.colors} />
        </p>
        {g.palette.description ? (
          <p className="mt-1 text-xs text-text-secondary">{g.palette.description}</p>
        ) : null}
      </section>
      <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
        {shown()
          .filter((f) => g[f.key].trim())
          .map((f) => (
            <div key={f.key} className="contents">
              <dt className="text-xs text-text-tertiary">{f.label}</dt>
              <dd className="whitespace-pre-wrap text-text-primary">{g[f.key]}</dd>
            </div>
          ))}
      </dl>
      {refs.length ? (
        <section
          aria-label={t("app-library-style-profiles-panel.style-profile-detail.aria-label.aaacd0b2b958")}
          className="flex flex-col gap-1"
        >
          <h3 className="text-xs font-medium text-text-tertiary">
            {t("app-library-style-profiles-panel.style-profile-detail.h3.aaacd0b2b958")}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {refs.map((v) => {
              const va = state.assetVariants[v.variantId];
              const a = va ? state.assets[va.assetId] : undefined;
              const label = t("app-library-style-profiles-panel.reference-label", { asset: a?.name ?? t("app-library-style-profiles-panel.reference-label-asset"), variant: va?.name ?? "", version: v.number });
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
          {t("app-library-style-profiles-panel.style-profile-detail.p.804c82d786f5")}
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
