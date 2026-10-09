/**
 * «I denne scenen» (DEC-0037): karakterene, stedene og objektene fra biblioteket som er brukt i scenen.
 * Dra en ressurs inn på lerretet for å legge den øverst i lagene, eller bruk «+». Klikk på navnet åpner
 * ressursen i biblioteket, der bilder lastes opp (og senere genereres).
 */
import { useNavigate } from "@tanstack/react-router";
import { ImageOff, Plus } from "lucide-react";
import { memo, useMemo } from "react";
import {
  ASSET_KIND_LABEL,
  USAGE_LABEL,
  assetsInScene,
  coverVersion,
  type ProjectState,
} from "@/core";
import { useImageUrls } from "@/app/library/asset-images";

/** Datatype for dra-og-slipp fra panelet til lerretet (verdien er ressursens ID). */
export const ASSET_DRAG_TYPE = "application/x-animatic-asset";

export const SceneAssetsPanel = memo(function SceneAssetsPanel({
  state,
  projectId,
  productionId,
  occurrenceId,
  editable,
  onAdd,
}: {
  state: ProjectState;
  projectId: string;
  productionId: string;
  occurrenceId: string;
  editable: boolean;
  /** Legg ressursen inn i scenen (øverst, midt i bildet). null = ingen 2D-scene ennå. */
  onAdd: ((assetId: string) => void) | null;
}) {
  const navigate = useNavigate();
  const items = useMemo(
    () => assetsInScene(state, productionId, occurrenceId),
    [state, productionId, occurrenceId],
  );
  const paths = useMemo(
    () =>
      items.flatMap(({ asset }) => {
        const v = coverVersion(state, asset.id);
        return v ? [v.mediaPath] : [];
      }),
    [items, state],
  );
  const urls = useImageUrls(paths);

  return (
    <section aria-label="I denne scenen" className="flex min-h-0 flex-col border-t border-border">
      <h2 className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-[0.04em] text-text-tertiary">
        I denne scenen ({items.length})
      </h2>
      {items.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-text-tertiary">
          Ingen ressurser fra biblioteket er funnet i scenen. Legg dem til i Ressursbiblioteket (for
          eksempel med «Forslag fra manuset»).
        </p>
      ) : (
        <>
          {onAdd && editable ? (
            <p className="px-3 pb-1 text-[11px] text-text-tertiary">Dra inn på lerretet.</p>
          ) : null}
          <ul className="grid grid-cols-2 gap-1.5 overflow-y-auto px-2 pb-2">
            {items.map(({ asset, how }) => {
              const v = coverVersion(state, asset.id);
              const url = v ? urls.data?.[v.mediaPath] : undefined;
              const draggable = !!onAdd && editable;
              return (
                <li
                  key={asset.id}
                  draggable={draggable}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  title={`${asset.name} – ${ASSET_KIND_LABEL[asset.kind]}, ${USAGE_LABEL[how]}`}
                  className={
                    "group relative flex flex-col overflow-hidden rounded-sm border border-border bg-surface-2 " +
                    (draggable ? "cursor-grab active:cursor-grabbing" : "")
                  }
                >
                  <div className="flex h-16 items-center justify-center bg-surface-3">
                    {url ? (
                      <img
                        src={url}
                        alt=""
                        draggable={false}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <ImageOff className="size-5 text-text-tertiary" aria-hidden />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void navigate({
                        to: "/prosjekt/$projectId/bibliotek",
                        params: { projectId },
                        search: { asset: asset.id },
                      })
                    }
                    className="truncate px-1.5 pt-1 text-left text-[12px] text-text-primary hover:text-accent-brand hover:underline"
                    title={`Åpne «${asset.name}» i biblioteket (bilder og varianter)`}
                  >
                    {asset.name}
                  </button>
                  <span className="truncate px-1.5 pb-1 text-[10px] text-text-tertiary">
                    {ASSET_KIND_LABEL[asset.kind]}
                    {v ? "" : " · uten bilde"}
                  </span>
                  {onAdd && editable ? (
                    <button
                      type="button"
                      onClick={() => onAdd(asset.id)}
                      aria-label={`Legg «${asset.name}» inn i scenen`}
                      title="Legg inn i scenen"
                      className="absolute right-1 top-1 hidden rounded-sm bg-surface-1/90 p-0.5 text-text-secondary hover:text-text-primary focus-visible:flex group-hover:flex [@media(hover:none)]:flex"
                    >
                      <Plus className="size-3.5" aria-hidden />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
});
