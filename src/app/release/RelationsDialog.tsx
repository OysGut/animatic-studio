/**
 * Relasjoner mellom karakterene (M8 del 1, DEC-0061, REQ-0393–0395): godkjente relasjoner kan endres og
 * fjernes, forslag fra manuset godkjennes, endres eller avvises, og egne relasjoner legges til.
 * Relasjonene brukes i karakterkartet. Alt kan angres.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import {
  RELATION_COLOR,
  RELATION_KINDS,
  RELATION_NAME,
  L,
  approvedRelations,
  newId,
  relationSuggestions,
  sortedAssets,
  type AssetRelation,
  type ProjectState,
  type RelationKind,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const control =
  "h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";

/**
 * Tekstfelt som lagres når brukeren forlater det. Følger med når andre endrer verdien, men ikke mens
 * brukeren selv skriver i det.
 */
function BlurText({
  label,
  value,
  onCommit,
  multiline,
  ...rest
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  placeholder: string;
  disabled: boolean;
  className: string;
}) {
  const [v, setV] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setV(value);
  }, [value, editing]);
  const props = {
    ...rest,
    "aria-label": label,
    value: v,
    onFocus: () => setEditing(true),
    onBlur: () => {
      setEditing(false);
      if (v.trim() !== value) onCommit(v);
      else setV(value);
    },
  };
  return multiline ? (
    <textarea {...props} rows={1} onChange={(e) => setV(e.target.value)} />
  ) : (
    <input {...props} onChange={(e) => setV(e.target.value)} />
  );
}

export function RelationsDialog({
  state,
  cmds,
  productionId,
  editable,
  open,
  onOpenChange,
}: {
  state: ProjectState;
  cmds: Commands;
  productionId: string;
  editable: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const approved = useMemo(() => approvedRelations(state), [state]);
  const suggestions = useMemo(
    () => (open ? relationSuggestions(state, productionId) : []),
    [state, productionId, open],
  );
  const people = useMemo(
    () =>
      sortedAssets(state).filter(
        (a) => !a.archived && (a.kind === "character" || a.kind === "animal"),
      ),
    [state],
  );
  const others = useMemo(
    () => sortedAssets(state).filter((a) => !a.archived && a.kind !== "sound"),
    [state],
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<RelationKind>("friendship");
  const name = (id: string) => state.assets[id]?.name ?? L("(ukjent)", "(unknown)");

  const add = (
    items: {
      fromAssetId: string;
      toAssetId: string;
      kind: RelationKind;
      label?: string;
      description?: string;
      status: "approved" | "dismissed";
    }[],
    label: string,
  ) => {
    setError(
      cmds.run(
        {
          type: "AddRelations",
          items: items.map((x) => ({
            relationId: newId<"asset_relation">(),
            fields: {
              fromAssetId: x.fromAssetId as never,
              toAssetId: x.toAssetId as never,
              kind: x.kind,
              label: x.label ?? "",
              description: x.description ?? "",
              status: x.status,
            },
          })),
        },
        label,
      ),
    );
  };

  const update = (
    r: AssetRelation,
    patch: Partial<Pick<AssetRelation, "kind" | "label" | "description">>,
  ) =>
    setError(
      cmds.run(
        {
          type: "UpdateRelations",
          items: [
            {
              relationId: r.id,
              fields: {
                fromAssetId: r.fromAssetId,
                toAssetId: r.toAssetId,
                kind: patch.kind ?? r.kind,
                label: patch.label ?? r.label,
                description: patch.description ?? r.description,
                status: r.status,
              },
            },
          ],
        },
        L("Endre relasjon", "Change relation"),
        `relation:${r.id}`,
      ),
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{L("Relasjoner", "Relations")}</DialogTitle>
          <DialogDescription>
            {L(
              "Hvordan karakterene henger sammen. Godkjente relasjoner vises som linjer i karakterkartet. Forslagene kommer fra manuset og lagres bare når du godkjenner dem.",
              "How the characters are connected. Approved relations are shown as lines in the character map. Suggestions come from the script and are only saved when you approve them.",
            )}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}

        <section aria-labelledby="rel-approved" className="flex flex-col gap-2">
          <h3 id="rel-approved" className="text-[13px] font-medium text-text-primary">
            {L("Godkjente relasjoner", "Approved relations")} ({approved.length})
          </h3>
          {approved.length === 0 ? (
            <p className="text-xs text-text-tertiary">{L("Ingen ennå.", "None yet.")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {approved.map((r) => (
                <li
                  key={r.id}
                  className="grid grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)_28px] items-center gap-2 rounded-sm border border-border bg-surface-2 px-2 py-1.5"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-text-primary">
                    <span
                      aria-hidden
                      className="inline-block h-0.5 w-4 shrink-0"
                      style={{ background: RELATION_COLOR[r.kind] }}
                    />
                    <span className="truncate">
                      {name(r.fromAssetId)} – {name(r.toAssetId)}
                    </span>
                  </span>
                  <select
                    aria-label={L(
                      `Type relasjon mellom ${name(r.fromAssetId)} og ${name(r.toAssetId)}`,
                      `Type of relation between ${name(r.fromAssetId)} and ${name(r.toAssetId)}`,
                    )}
                    value={r.kind}
                    disabled={!editable}
                    onChange={(e) => update(r, { kind: e.target.value as RelationKind })}
                    className={control}
                  >
                    {RELATION_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {RELATION_NAME[k]}
                      </option>
                    ))}
                  </select>
                  <BlurText
                    label={L(
                      `Navn på relasjonen mellom ${name(r.fromAssetId)} og ${name(r.toAssetId)}`,
                      `Name of the relation between ${name(r.fromAssetId)} and ${name(r.toAssetId)}`,
                    )}
                    placeholder={L(
                      "Navn (f.eks. «mor og datter»)",
                      "Name (e.g. “mother and daughter”)",
                    )}
                    value={r.label}
                    disabled={!editable}
                    onCommit={(label) => update(r, { label })}
                    className={control}
                  />
                  {editable ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={L(
                        `Fjern relasjonen mellom ${name(r.fromAssetId)} og ${name(r.toAssetId)}`,
                        `Remove the relation between ${name(r.fromAssetId)} and ${name(r.toAssetId)}`,
                      )}
                      onClick={() =>
                        setError(
                          cmds.run(
                            { type: "SetRelationsRemoved", relationIds: [r.id], removed: true },
                            L("Fjern relasjon", "Remove relation"),
                          ),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  ) : (
                    <span />
                  )}
                  <BlurText
                    multiline
                    label={L(
                      `Beskrivelse av relasjonen mellom ${name(r.fromAssetId)} og ${name(r.toAssetId)}`,
                      `Description of the relation between ${name(r.fromAssetId)} and ${name(r.toAssetId)}`,
                    )}
                    placeholder={L(
                      "Kort beskrivelse (vises når «tekst om relasjonene» er slått på)",
                      "Short description (shown when “text about the relations” is turned on)",
                    )}
                    value={r.description}
                    disabled={!editable}
                    onCommit={(description) => update(r, { description })}
                    className="col-span-4 min-h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 py-1 text-xs text-text-primary"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {editable ? (
          <section aria-labelledby="rel-suggest" className="flex flex-col gap-2">
            <h3 id="rel-suggest" className="text-[13px] font-medium text-text-primary">
              {L("Forslag fra manuset", "Suggestions from the script")} ({suggestions.length})
            </h3>
            {suggestions.length === 0 ? (
              <p className="text-xs text-text-tertiary">
                {L(
                  "Ingen nye forslag. Forslag kommer fra karakterer som er sammen i flere scener.",
                  "No new suggestions. Suggestions come from characters who are together in several scenes.",
                )}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {suggestions.map((sg) => (
                  <li
                    key={sg.key}
                    className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-surface-2 px-2 py-1.5 text-[13px]"
                  >
                    <span className="font-medium text-text-primary">
                      {name(sg.fromAssetId)} – {name(sg.toAssetId)}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {RELATION_NAME[sg.kind]} · {L("sammen i", "together in")} {sg.together}{" "}
                      {L("scener", "scenes")}
                    </span>
                    {sg.evidence ? (
                      <span className="w-full truncate text-xs italic text-text-tertiary">
                        {L(`«${sg.evidence.text}»`, `“${sg.evidence.text}”`)}
                      </span>
                    ) : null}
                    <span className="ml-auto flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          add(
                            [{ ...sg, status: "approved" }],
                            L(
                              `Godkjenn relasjon ${name(sg.fromAssetId)} – ${name(sg.toAssetId)}`,
                              `Approve relation ${name(sg.fromAssetId)} – ${name(sg.toAssetId)}`,
                            ),
                          )
                        }
                      >
                        <Check />
                        {L("Godkjenn", "Approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          add(
                            [{ ...sg, status: "dismissed" }],
                            L(
                              `Avvis forslag ${name(sg.fromAssetId)} – ${name(sg.toAssetId)}`,
                              `Dismiss suggestion ${name(sg.fromAssetId)} – ${name(sg.toAssetId)}`,
                            ),
                          )
                        }
                      >
                        <X />
                        {L("Avvis", "Dismiss")}
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {editable ? (
          <section aria-labelledby="rel-new" className="flex flex-col gap-2">
            <h3 id="rel-new" className="text-[13px] font-medium text-text-primary">
              {L("Ny relasjon", "New relation")}
            </h3>
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!from || !to) return;
                add(
                  [{ fromAssetId: from, toAssetId: to, kind, status: "approved" }],
                  L("Ny relasjon", "New relation"),
                );
                setTo("");
              }}
            >
              <select
                aria-label={L("Fra", "From")}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={control}
              >
                <option value="">{L("Velg karakter …", "Choose a character …")}</option>
                {people.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select
                aria-label={L("Type", "Type")}
                value={kind}
                onChange={(e) => setKind(e.target.value as RelationKind)}
                className={control}
              >
                {RELATION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {RELATION_NAME[k]}
                  </option>
                ))}
              </select>
              <select
                aria-label={L("Til", "To")}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={control}
              >
                <option value="">
                  {L(
                    "Velg karakter, sted eller objekt …",
                    "Choose a character, location or object …",
                  )}
                </option>
                {others
                  .filter((a) => a.id !== from)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
              <Button size="sm" type="submit" disabled={!from || !to}>
                <Plus />
                {L("Legg til", "Add")}
              </Button>
            </form>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
