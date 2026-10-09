/**
 * Manusversjoner (mandat 2.2, 5.1; REQ-0032, REQ-0069, REQ-0076–REQ-0078):
 * lagre en uforanderlig versjon, se tidligere versjoner, sammenligne og eksportere en versjon slik den var.
 */
import { ArrowLeft, Download, Eye, GitCompare, History, Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CHANGE_LABEL,
  diffSnapshots,
  paginate,
  snapshotFromState,
  snapshotPaginationInput,
  wordDiff,
  type ChangeType,
  type LineChange,
  type SceneChange,
  type ProjectState,
  type ScriptSnapshot,
} from "@/core";
import { screenplayPdf } from "@/engine/export/screenplay-pdf";
import { prepareDownload, type ReadyFile } from "@/app/download";
import { useProfiles } from "@/app/project/use-project";
import {
  useCreateVersion,
  useVersionList,
  useVersionSnapshot,
  type VersionRow,
} from "@/app/project/use-versions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScriptPageView } from "./ScriptPageView";
import { KIND_LABEL } from "./script-helpers";

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly projectId: string;
  readonly productionId: string;
  readonly state: ProjectState;
  readonly editable: boolean;
  /** Lagres det fortsatt endringer? Da venter vi med å lage versjon (den skal vise det som er lagret). */
  readonly saving: boolean;
  readonly onGoToScene: (occurrenceId: string) => void;
}

const NOW = "now";
type View =
  { kind: "list" } | { kind: "compare"; a: string; b: string } | { kind: "show"; id: string };

const ORDER: ChangeType[] = [
  "added",
  "removed",
  "deactivated",
  "activated",
  "moved",
  "heading",
  "dialogue",
  "action",
  "characters",
  "renumbered",
  "variant",
  "take",
];

function dateText(iso: string) {
  return new Date(iso).toLocaleString("nb-NO", { dateStyle: "medium", timeStyle: "short" });
}

export function VersionsDialog(props: Props) {
  const { open, onOpenChange, projectId, productionId, state, editable, saving } = props;
  const list = useVersionList(productionId, open);
  const versions = list.data ?? [];
  const profiles = useProfiles([...new Set(versions.map((v) => v.created_by))]);
  const [view, setView] = useState<View>({ kind: "list" });
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [ready, setReady] = useState<ReadyFile | null>(null);
  // Frigjør forrige fil når en ny lages eller dialogen lukkes
  useEffect(
    () => () => {
      if (ready) URL.revokeObjectURL(ready.url);
    },
    [ready],
  );
  const create = useCreateVersion(projectId, productionId);
  const production = state.productions[productionId];

  useEffect(() => {
    if (!open) {
      setView({ kind: "list" });
      setReady(null);
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const nextNumber = (versions[0]?.number ?? 0) + 1;
  const missingTable =
    list.isError && /script_versions|does not exist|schema cache/i.test(String(list.error));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[860px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" aria-hidden />
            Manusversjoner – {production?.name}
          </DialogTitle>
          <DialogDescription>
            En versjon er et fast bilde av manuset slik det er lagret nå: rekkefølge, aktive scener,
            numre og tekst. Den kan aldri endres i ettertid.
          </DialogDescription>
        </DialogHeader>

        {missingTable ? (
          <p role="alert" className="text-[13px] text-status-uncertain">
            Databasen mangler manusversjoner. Kjør migrasjon 0003 i Lovable (se LOVABLE_SYNC.md).
          </p>
        ) : view.kind === "list" ? (
          <>
            {editable ? (
              <form
                className="flex flex-col gap-2 border border-border bg-surface-1 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate(
                    { name: name.trim() || `Versjon ${nextNumber}`, note: note.trim() },
                    {
                      onSuccess: () => {
                        setName("");
                        setNote("");
                      },
                    },
                  );
                }}
              >
                <div className="flex gap-2">
                  <Input
                    aria-label="Navn på versjonen"
                    placeholder={`Versjon ${nextNumber} (f.eks. «Draft 9.4» eller «Etter møte med Trollfilm»)`}
                    value={name}
                    maxLength={200}
                    onChange={(e) => setName(e.target.value)}
                    className="h-8 flex-1 bg-surface-3"
                  />
                  <Button type="submit" disabled={create.isPending || saving}>
                    {create.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                    Lagre versjon
                  </Button>
                </div>
                <Input
                  aria-label="Merknad (valgfri)"
                  placeholder="Merknad (valgfri)"
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-8 bg-surface-3"
                />
                {saving ? (
                  <p className="text-xs text-text-tertiary">
                    Venter til endringene dine er lagret …
                  </p>
                ) : null}
                {create.isError ? (
                  <p role="alert" className="text-xs text-status-danger">
                    Versjonen ble ikke lagret: {create.error.message}
                  </p>
                ) : null}
              </form>
            ) : null}

            {list.isLoading ? (
              <p className="text-[13px] text-text-tertiary">Henter versjoner …</p>
            ) : versions.length === 0 ? (
              <p className="text-[13px] text-text-secondary">
                Ingen versjoner ennå. Lagre en versjon før store endringer, så kan du alltid se og
                eksportere manuset slik det var.
              </p>
            ) : (
              <ul className="border border-border bg-surface-1">
                {versions.map((v, i) => (
                  <li
                    key={v.id}
                    className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <span className="tabular w-8 font-mono text-xs text-text-tertiary">
                      v{v.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-text-primary">
                        {v.name}
                      </span>
                      <span className="block truncate text-xs text-text-tertiary">
                        {dateText(v.created_at)} ·{" "}
                        {profiles.data?.[v.created_by]?.display_name ?? "ukjent"}
                        {v.note ? ` · ${v.note}` : ""}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setView({ kind: "show", id: v.id })}
                    >
                      <Eye />
                      Vis
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setView({ kind: "compare", a: v.id, b: NOW })}
                    >
                      <GitCompare />
                      Mot nå
                    </Button>
                    {versions[i + 1] ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setView({ kind: "compare", a: versions[i + 1]!.id, b: v.id })
                        }
                      >
                        Mot v{versions[i + 1]!.number}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : view.kind === "compare" ? (
          <Compare
            {...props}
            versions={versions}
            a={view.a}
            b={view.b}
            onChange={(a, b) => setView({ kind: "compare", a, b })}
            onBack={() => setView({ kind: "list" })}
          />
        ) : (
          <Show
            version={versions.find((v) => v.id === view.id)!}
            projectName={state.project.name}
            productionName={production?.name ?? ""}
            ready={ready}
            setReady={setReady}
            onBack={() => {
              setReady(null);
              setView({ kind: "list" });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function useSnapshot(id: string, state: ProjectState, productionId: string) {
  const q = useVersionSnapshot(id === NOW ? null : id);
  const now = useMemo(
    () => (id === NOW ? snapshotFromState(state, productionId) : null),
    [id, state, productionId],
  );
  return { data: now ?? q.data, isLoading: id !== NOW && q.isLoading, error: q.error };
}

function Compare({
  versions,
  a,
  b,
  state,
  productionId,
  onChange,
  onBack,
  onGoToScene,
  onOpenChange,
}: Props & {
  versions: readonly VersionRow[];
  a: string;
  b: string;
  onChange: (a: string, b: string) => void;
  onBack: () => void;
}) {
  const older = useSnapshot(a, state, productionId);
  const newer = useSnapshot(b, state, productionId);
  const changes = useMemo(
    () => (older.data && newer.data ? diffSnapshots(older.data, newer.data) : null),
    [older.data, newer.data],
  );
  const select = (value: string, set: (v: string) => void, label: string) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => set(e.target.value)}
      className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
    >
      <option value={NOW}>Nå (lagret manus)</option>
      {versions.map((v) => (
        <option key={v.id} value={v.id}>
          v{v.number} – {v.name}
        </option>
      ))}
    </select>
  );
  const current = new Set<string>(
    Object.values(state.occurrences)
      .filter((o) => o.productionId === productionId && o.active)
      .map((o) => o.id as string),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft />
          Tilbake
        </Button>
        Fra {select(a, (v) => onChange(v, b), "Eldre versjon")} til{" "}
        {select(b, (v) => onChange(a, v), "Nyere versjon")}
      </div>
      {older.isLoading || newer.isLoading ? (
        <p className="text-[13px] text-text-tertiary">Henter versjoner …</p>
      ) : !changes ? (
        <p role="alert" className="text-[13px] text-status-danger">
          Kunne ikke hente versjonene.
        </p>
      ) : changes.length === 0 ? (
        <p className="text-[13px] text-text-secondary">Ingen forskjeller.</p>
      ) : (
        <>
          <p className="text-xs text-text-tertiary">
            {ORDER.filter((t) => changes.some((c) => c.type === t))
              .map((t) => `${CHANGE_LABEL[t]}: ${changes.filter((c) => c.type === t).length}`)
              .join(" · ")}
          </p>
          <ul className="max-h-[60vh] overflow-y-auto border border-border bg-surface-1">
            {groupByScene(changes).map((g) => (
              <li
                key={g.occurrenceId}
                className="border-b border-border px-3 py-2 text-[13px] last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <span className="tabular w-10 shrink-0 font-mono text-xs text-text-tertiary">
                    {g.number ?? "–"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                    {g.heading}
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {g.changes.map((c) => (
                      <span
                        key={c.type}
                        className="rounded-sm bg-surface-3 px-1.5 py-0.5 text-[11px] text-text-secondary"
                      >
                        {CHANGE_LABEL[c.type]}
                      </span>
                    ))}
                  </span>
                  {current.has(g.occurrenceId) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onGoToScene(g.occurrenceId);
                        onOpenChange(false);
                      }}
                    >
                      Gå til
                    </Button>
                  ) : null}
                </div>
                <div className="ml-[52px] mt-1 flex flex-col gap-1">
                  {g.changes.map((c) => (
                    <ChangeDetail key={c.type} change={c} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

interface SceneGroup {
  readonly occurrenceId: string;
  readonly number: string | null;
  readonly heading: string;
  readonly changes: SceneChange[];
}

/** Samler endringene per scene (i rekkefølgen de står i den nyeste versjonen). */
function groupByScene(changes: readonly SceneChange[]): SceneGroup[] {
  const out: SceneGroup[] = [];
  const at = new Map<string, SceneGroup>();
  for (const c of changes) {
    let g = at.get(c.occurrenceId);
    if (!g) {
      g = { occurrenceId: c.occurrenceId, number: c.number, heading: c.heading, changes: [] };
      at.set(c.occurrenceId, g);
      out.push(g);
    }
    g.changes.push(c);
  }
  return out;
}

const MAX_LINES = 12;

function ChangeDetail({ change }: { change: SceneChange }) {
  const [all, setAll] = useState(false);
  const lines = change.lines ?? [];
  // Hele innholdet i nye/fjernede scener kan være langt: vis de første linjene
  const shown = all ? lines : lines.slice(0, MAX_LINES);
  if (!change.detail && lines.length === 0) return null;
  return (
    <div className="text-xs text-text-secondary">
      {change.detail ? (
        <p>
          <span className="text-text-tertiary">{CHANGE_LABEL[change.type]}: </span>
          {change.detail}
        </p>
      ) : null}
      {shown.length ? (
        <ul className="mt-1 flex flex-col gap-1 border-l-2 border-border pl-2">
          {shown.map((l, i) => (
            <LineRow key={i} line={l} />
          ))}
        </ul>
      ) : null}
      {lines.length > MAX_LINES && !all ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mt-1 text-accent-brand underline-offset-2 hover:underline"
        >
          Vis alle {lines.length} linjer
        </button>
      ) : null}
    </div>
  );
}

function LineRow({ line }: { line: LineChange }) {
  const who = line.speaker ? ` – ${line.speaker}` : "";
  const label = `${KIND_LABEL[line.kind]}${who}`;
  return (
    <li className="grid grid-cols-[14px_1fr] gap-1">
      <span
        aria-hidden
        className={
          "font-mono " +
          (line.op === "added"
            ? "text-status-success"
            : line.op === "removed"
              ? "text-status-danger"
              : "text-status-uncertain")
        }
      >
        {line.op === "added" ? "+" : line.op === "removed" ? "−" : "~"}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-text-tertiary">
          {label}
          <span className="sr-only">
            {line.op === "added" ? " (ny)" : line.op === "removed" ? " (fjernet)" : " (endret)"}
          </span>
        </span>
        <span className="block whitespace-pre-wrap font-script text-[12px] text-text-primary">
          {line.op === "changed" ? (
            wordDiff(line.before ?? "", line.after ?? "").map((p, i) =>
              p.op === "same" ? (
                <span key={i}>{p.text}</span>
              ) : p.op === "removed" ? (
                <del key={i} className="bg-status-danger-bg text-status-danger">
                  {p.text}
                </del>
              ) : (
                <ins key={i} className="bg-status-success-bg text-status-success no-underline">
                  {p.text}
                </ins>
              ),
            )
          ) : line.op === "added" ? (
            line.after
          ) : (
            <del className="text-text-tertiary">{line.before}</del>
          )}
        </span>
      </span>
    </li>
  );
}

function Show({
  version,
  projectName,
  productionName,
  ready,
  setReady,
  onBack,
}: {
  version: VersionRow;
  projectName: string;
  productionName: string;
  ready: ReadyFile | null;
  setReady: (r: ReadyFile | null) => void;
  onBack: () => void;
}) {
  const snap = useVersionSnapshot(version.id);
  const pages = useMemo(
    () => (snap.data ? paginate(snapshotPaginationInput(snap.data as ScriptSnapshot)).pages : []),
    [snap.data],
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft />
          Tilbake
        </Button>
        <span className="text-[13px] text-text-primary">
          v{version.number} – {version.name}
        </span>
        <span className="text-xs text-text-tertiary">
          {dateText(version.created_at)} · bare lesing
        </span>
        <Button
          size="sm"
          variant="secondary"
          className="ml-auto"
          disabled={!snap.data}
          onClick={() => {
            const bytes = screenplayPdf(pages, { title: `${projectName} – ${version.name}` });
            const safe =
              `${projectName} – ${productionName} – v${version.number} ${version.name}`.replace(
                /[\\/:*?"<>|]+/g,
                "-",
              );
            setReady(prepareDownload(bytes, `${safe}.pdf`, "application/pdf"));
          }}
        >
          <Download />
          Eksporter PDF
        </Button>
      </div>
      {ready ? (
        <p role="status" className="text-xs text-text-secondary">
          Filen er laget:{" "}
          <a
            href={ready.url}
            download={ready.name}
            className="text-accent-brand underline underline-offset-2"
          >
            Last ned «{ready.name}»
          </a>
        </p>
      ) : null}
      {snap.isLoading ? (
        <p className="text-[13px] text-text-tertiary">Henter versjonen …</p>
      ) : (
        <div className="max-h-[65vh] overflow-auto bg-bg-app">
          <ScriptPageView
            pages={pages}
            selection={{ occurrenceId: null, blockId: null }}
            zoom={0.7}
            onSelect={() => undefined}
            onActivate={() => undefined}
          />
        </div>
      )}
    </div>
  );
}
