/**
 * Betegnelser i bestemte linjer (mandat 8.2, REQ-0127, DEC-0071): «onkel» kan være Laurits i noen replikker
 * uten at alle «onkel» blir Laurits. Brukeren skriver betegnelsen, ser linjene der den står, og krysser av for
 * de som gjelder denne ressursen. Linjene lagres med permanente ID-er og følger med når scener flyttes.
 */
import { Plus, Tags, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  collation,
  formatHeading,
  L,
  linesWithWord,
  type Asset,
  type ContextName,
  type ProjectState,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";

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
        ? L(
            `Betegnelsen «${name}» gjelder ${asset.name}`,
            `The term “${name}” refers to ${asset.name}`,
          )
        : L(`Fjern betegnelsen «${name}»`, `Remove the term “${name}”`),
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
        {L("Betegnelser i bestemte linjer", "Terms in specific lines")}
      </p>
      {list.length ? (
        <ul
          className="flex flex-wrap gap-1"
          aria-label={L("Betegnelser i bestemte linjer", "Terms in specific lines")}
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
                title={L("Vis og endre linjene", "Show and change the lines")}
              >
                «{n.name}»
              </button>
              <span className="text-text-tertiary">
                {n.blockIds.length}{" "}
                {n.blockIds.length === 1 ? L("linje", "line") : L("linjer", "lines")}
              </span>
              {editable ? (
                <button
                  type="button"
                  aria-label={L(`Fjern betegnelsen ${n.name}`, `Remove the term ${n.name}`)}
                  className="rounded-sm p-0.5 text-text-tertiary hover:text-text-primary"
                  onClick={() =>
                    save(
                      list.filter((x) => x !== n),
                      L(`Fjern betegnelsen «${n.name}»`, `Remove the term “${n.name}”`),
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
          {L(
            `F.eks. «onkel» når det er ${asset.name} som menes – bare i linjene du velger.`,
            `E.g. “uncle” when ${asset.name} is meant – only in the lines you choose.`,
          )}
        </p>
      )}
      {editable ? (
        <>
          <input
            type="text"
            aria-label={L("Betegnelse", "Term")}
            placeholder={L("Betegnelse, f.eks. onkel", "Term, e.g. uncle")}
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
                {L("Ordet står ikke i manuset.", "The word is not in the script.")}
              </p>
            ) : (
              <>
                <ul
                  aria-label={L("Linjer med betegnelsen", "Lines with the term")}
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
                      ? L(
                          `«${word.trim()}» er ${asset.name} i ${chosen.size} ${chosen.size === 1 ? "linje" : "linjer"}`,
                          `“${word.trim()}” is ${asset.name} in ${chosen.size} ${chosen.size === 1 ? "line" : "lines"}`,
                        )
                      : existing
                        ? L("Fjern betegnelsen", "Remove the term")
                        : L("Kryss av linjene det gjelder", "Tick the lines it applies to")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPicked(new Set(lines.map((l) => l.blockId)))}
                  >
                    {L("Velg alle", "Select all")}
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
