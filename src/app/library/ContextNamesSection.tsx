/**
 * Betegnelser i bestemte linjer (mandat 8.2, REQ-0127, DEC-0071): «onkel» kan være Laurits i noen replikker
 * uten at alle «onkel» blir Laurits. Brukeren skriver betegnelsen, ser linjene der den står, og krysser av for
 * de som gjelder denne ressursen. Linjene lagres med permanente ID-er og følger med når scener flyttes.
 */
import { Plus, Tags, X } from "lucide-react";
import { useMemo, useState } from "react";
import { collation, formatHeading, linesWithWord, type Asset, type ContextName, type ProjectState } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";

export function ContextNamesSection({
  state,
  asset,
  productionId,
  editable,
  cmds,
}: {
  state: ProjectState;
  asset: Asset;
  productionId: string;
  editable: boolean;
  cmds: Commands;
}) {
  const list = asset.contextNames ?? [];
  const [word, setWord] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const lines = useMemo(
    () => linesWithWord(state, productionId, word),
    [state, productionId, word],
  );
  const existing = list.find(
    (n) => n.name.toLocaleLowerCase(collation()) === word.trim().toLocaleLowerCase(collation()),
  );
  const chosen = picked ?? new Set(existing?.blockIds ?? []);

  function save(next: readonly ContextName[], label: string) {
    const e = cmds.run(
      { type: "SetContextNames", assetId: asset.id, contextNames: next } as never,
      label,
    );
    setErr(e);
    return !e;
  }

  function store() {
    const name = word.trim();
    const ids = [...chosen];
    const others = list.filter((n) => n !== existing);
    const ok = save(
      ids.length ? [...others, { name, blockIds: ids }] : others,
      ids.length
        ? t("app-library-context-names-section.ok.save.35e49a47ab73", { name: String(name), name2: String(asset.name) })
        : t("app-library-context-names-section.ok.save.7aaa05d457a2", { name: String(name) }),
    );
    if (ok) {
      setWord("");
      setPicked(null);
    }
  }

  const sceneText = (occurrenceId: string) => {
    const o = state.occurrences[occurrenceId];
    const v = o ? state.variants[o.variantId] : undefined;
    return `${o?.productionNumber ?? ""} ${v ? formatHeading(v.heading) : ""}`.trim();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 text-xs text-text-secondary">
        <Tags className="size-3.5" aria-hidden />{" "}
        {t("app-library-context-names-section.context-names-section.p.eddb7bb23d38")}
      </p>
      {list.length ? (
        <ul
          className="flex flex-wrap gap-1"
          aria-label={t("app-library-context-names-section.context-names-section.aria-label.eddb7bb23d38")}
        >
          {list.map((n) => (
            <li
              key={n.name}
              className="flex items-center gap-1 rounded-sm bg-surface-3 px-1.5 py-0.5 text-xs"
            >
              <button
                type="button"
                className="text-text-primary hover:underline"
                onClick={() => {
                  setWord(n.name);
                  setPicked(null);
                }}
                title={t("app-library-context-names-section.context-names-section.title.f4b832274ed2")}
              >
                «{n.name}»
              </button>
              <span className="text-text-tertiary">
                {n.blockIds.length}{" "}
                {n.blockIds.length === 1 ? t("app-library-context-names-section.context-names-section.span.e2622c84aff4") : t("app-library-context-names-section.context-names-section.span.7a8f08077845")}
              </span>
              {editable ? (
                <button
                  type="button"
                  aria-label={t("app-library-context-names-section.context-names-section.aria-label.8000142029e5", { name: String(n.name) })}
                  className="rounded-sm p-0.5 text-text-tertiary hover:text-text-primary"
                  onClick={() =>
                    save(
                      list.filter((x) => x !== n),
                      t("app-library-context-names-section.context-names-section.save.b9957137c32b", { name: String(n.name) }),
                    )
                  }
                >
                  <X className="size-3" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-text-tertiary">
          {t("app-library-context-names-section.context-names-section.p.4eb446330c64", { name: String(asset.name) })}
        </p>
      )}
      {editable ? (
        <>
          <input
            type="text"
            aria-label={t("app-library-context-names-section.context-names-section.aria-label.690f825e0dea")}
            placeholder={t("app-library-context-names-section.context-names-section.placeholder.13ef361697d5")}
            value={word}
            onChange={(e) => {
              setWord(e.target.value);
              setPicked(null);
            }}
            className="h-7 w-56 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary placeholder:text-text-tertiary"
          />
          {word.trim().length >= 2 ? (
            lines.length === 0 ? (
              <p className="text-[11px] text-text-tertiary">
                {t("app-library-context-names-section.context-names-section.p.3d81c82d5cef")}
              </p>
            ) : (
              <>
                <ul
                  aria-label={t("app-library-context-names-section.context-names-section.aria-label.0b995103ee8a")}
                  className="max-h-56 overflow-y-auto border border-border bg-surface-1"
                >
                  {lines.map((l) => (
                    <li key={l.blockId} className="border-b border-border last:border-b-0">
                      <label className="flex items-start gap-2 px-2 py-1 text-xs">
                        <input
                          type="checkbox"
                          checked={chosen.has(l.blockId)}
                          onChange={(e) => {
                            const next = new Set(chosen);
                            if (e.target.checked) next.add(l.blockId);
                            else next.delete(l.blockId);
                            setPicked(next);
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block text-[11px] text-text-tertiary">
                            {sceneText(l.occurrenceId)}
                          </span>
                          <span className="line-clamp-2 text-text-primary">{l.text}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={store}
                    disabled={chosen.size === 0 && !existing}
                  >
                    <Plus />
                    {chosen.size
                      ? t("app-library-context-names-section.word-is-asset", { word: word.trim(), asset: asset.name, count: chosen.size })
                      : existing
                        ? t("app-library-context-names-section.context-names-section.button.c41f949f2532")
                        : t("app-library-context-names-section.context-names-section.button.4038097b7114")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPicked(new Set(lines.map((l) => l.blockId)))}
                  >
                    {t("app-library-context-names-section.context-names-section.button.29008e48b9b4")}
                  </Button>
                </div>
              </>
            )
          ) : null}
        </>
      ) : null}
      {err ? (
        <p role="alert" className="text-xs text-status-danger">
          {err}
        </p>
      ) : null}
    </div>
  );
}
