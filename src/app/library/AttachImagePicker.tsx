/**
 * «Legg til bilde …» (Øystein 23.10): søk i prosjektets godkjente bildeversjoner i aktive varianter,
 * filtrert på type, med miniatyrer (felles Thumbnail, contain). Brukeren velger rollen bildet får.
 */
import { useMemo, useState } from "react";
import { ASSET_KIND_LABEL, attachableVersions, versionImagePath, type ProjectState } from "@/core";
import { Thumbnail } from "@/app/shared/Thumbnail";
import { Button } from "@/components/ui/button";
import { useImageUrls } from "./asset-images";
import { t } from "@/core/i18n/keyed";

export function AttachImagePicker({
  state,
  skip,
  onPick,
  onClose,
}: {
  state: ProjectState;
  /** Versjoner som allerede er i listen (eller er ressursens egne). */
  skip: ReadonlySet<string>;
  onPick: (versionId: string, role: "style" | "view") => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>("");
  const [role, setRole] = useState<"style" | "view">("style");
  const all = useMemo(() => attachableVersions(state).filter((v) => !skip.has(v.versionId)), [state, skip]);
  const kinds = useMemo(() => [...new Set(all.map((v) => v.kind))], [all]);
  const q = query.trim().toLowerCase();
  const shown = all
    .filter((v) => (!kind || v.kind === kind) && (!q || `${v.assetName} ${v.variantName}`.toLowerCase().includes(q)))
    .slice(0, 60);
  const paths = shown.map((v) => versionImagePath(state.assetVersions[v.versionId]!, "thumbnail"));
  const urls = useImageUrls(paths).data ?? {};
  return (
    <div
      role="group"
      aria-label={t("attach.picker.title")}
      className="mt-1 space-y-1.5 rounded-sm border border-border-control bg-surface-2 p-2"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("attach.picker.search")}
          aria-label={t("attach.picker.search")}
          className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
        />
        <select
          aria-label={t("attach.picker.kind")}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
        >
          <option value="">{t("attach.picker.allKinds")}</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {ASSET_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <select
          aria-label={t("attach.picker.role")}
          value={role}
          onChange={(e) => setRole(e.target.value as "style" | "view")}
          className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
        >
          <option value="style">{t("attach.picker.roleStyle")}</option>
          <option value="view">{t("attach.picker.roleSame")}</option>
        </select>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          {t("attach.picker.close")}
        </Button>
      </div>
      {shown.length ? (
        <ul className="grid max-h-60 grid-cols-4 gap-1.5 overflow-y-auto">
          {shown.map((v, i) => {
            const label = `${v.assetName} – ${v.variantName} v${v.number}`;
            return (
              <li key={v.versionId}>
                <button
                  type="button"
                  onClick={() => onPick(v.versionId, role)}
                  aria-label={t("attach.picker.pick", { label })}
                  title={label}
                  className="flex w-full flex-col items-stretch gap-0.5 rounded-sm border border-border-control p-1 text-left hover:border-accent"
                >
                  <span className="block aspect-[4/3] w-full">
                    {urls[paths[i]!] ? <Thumbnail src={urls[paths[i]!]} alt="" /> : null}
                  </span>
                  <span className="truncate text-[10px] text-text-secondary">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[11px] text-text-tertiary">{t("attach.picker.empty")}</p>
      )}
    </div>
  );
}
