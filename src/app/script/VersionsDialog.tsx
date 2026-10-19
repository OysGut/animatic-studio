/**
 * Manusversjoner (mandat 2.2, 5.1; REQ-0032, REQ-0069, REQ-0076–REQ-0078):
 * lagre en uforanderlig versjon, se tidligere versjoner, sammenligne og eksportere en versjon slik den var,
 * og gjøre en tidligere versjon gjeldende (KI-27) etter en forhåndsvisning av hva som endres.
 */
import {
  ArrowLeft,
  Download,
  Eye,
  GitCompare,
  History,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CHANGE_LABEL,
  diffSnapshots,
  L,
  locale,
  newId,
  paginate,
  snapshotFromState,
  snapshotPaginationInput,
  tm,
  wordDiff,
  type ChangeType,
  type Command,
  type LineChange,
  type SceneChange,
  type ProjectState,
  type ScriptSnapshot,
} from "@/core";
import { previewRestore } from "@/core/screenplay/restore-version";
import { screenplayPdf } from "@/engine/export/screenplay-pdf";
import { prepareDownload, type ReadyFile } from "@/app/download";
import { useProfiles } from "@/app/project/use-project";
import { HISTORY_SCHEMA } from "@/app/projects/use-history-records";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
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
  /**
   * Utfør en endring i manuset (useCommands().runQueued): endringer med samme `group` angres som ett steg.
   * Gir feilen fra den lokale kjøringen med en gang og `done`, som avgjøres når serveren har lagret endringen.
   * Uten den kan en versjon ikke gjøres gjeldende herfra.
   */
  readonly onRun?: RunQueued;
  /**
   * Venter til alle endringer er lagret (useCommands().whenIdle), så versjonen og estimatet viser det som er
   * lagret, ikke endringer som ennå står i køen.
   */
  readonly whenIdle?: () => Promise<void>;
  /** Tilstanden etter at køen er tom (useCommands().current). */
  readonly current?: () => ProjectState | null;
}

/** Som useCommands().runQueued. */
export type RunQueued = (
  command: Command,
  label: string,
  group?: string,
  options?: { keepText?: boolean },
) => { error: string | null; done: Promise<string | null> };

/** Melding når serveren avviste en del av gjenopprettingen (resten ble ikke sendt). Norsk: brukes i testene. */
export const PARTIAL_RESTORE = "Gjenopprettingen ble bare delvis utført – angre med ⌘/Ctrl + Z"; // i18n-ignore

const NOW = "now";
type View =
  | { kind: "list" }
  | { kind: "compare"; a: string; b: string }
  | { kind: "show"; id: string }
  | { kind: "restore"; id: string };

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
  "objects",
  "renumbered",
  "variant",
  "take",
];

function dateText(iso: string) {
  return new Date(iso).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" });
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
  // Varighetsestimatet lagres med hver versjon når databasen har migrasjon 0028 (REQ-0120)
  const schema28 = useSchemaAtLeast(HISTORY_SCHEMA);
  const create = useCreateVersion(projectId, productionId, schema28, {
    ...(props.whenIdle ? { whenIdle: props.whenIdle } : {}),
    ...(props.current ? { current: props.current } : {}),
  });
  const [notice, setNotice] = useState<string | null>(null);
  const production = state.productions[productionId];

  useEffect(() => {
    if (!open) {
      setView({ kind: "list" });
      setReady(null);
      setNotice(null);
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
            {L("Manusversjoner", "Script versions")} – {production?.name}
          </DialogTitle>
          <DialogDescription>
            {L(
              "En versjon er et fast bilde av manuset slik det er lagret nå: rekkefølge, aktive scener, numre og tekst. Den kan aldri endres i ettertid.",
              "A version is a fixed picture of the script as it is saved now: order, active scenes, numbers and text. It can never be changed afterwards.",
            )}
          </DialogDescription>
        </DialogHeader>

        {missingTable ? (
          <p role="alert" className="text-[13px] text-status-uncertain">
            {L(
              "Databasen mangler manusversjoner. Kontakt administratoren for å oppdatere Animatic Studio.",
              "The database is missing script versions. Contact the administrator to update Animatic Studio.",
            )}
          </p>
        ) : view.kind === "list" ? (
          <>
            {editable ? (
              <form
                className="flex flex-col gap-2 border border-border bg-surface-1 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  setNotice(null);
                  create.mutate(
                    {
                      name: name.trim() || L(`Versjon ${nextNumber}`, `Version ${nextNumber}`),
                      note: note.trim(),
                      state,
                    },
                    {
                      onSuccess: (r) => {
                        setName("");
                        setNote("");
                        // Versjonen er lagret; bare estimatet mangler (vises stille, blokkerer ingenting)
                        if (r.estimateError)
                          setNotice(
                            L(
                              "Versjonen er lagret, men varighetsestimatet for den ble ikke lagret.",
                              "The version is saved, but its duration estimate was not saved.",
                            ),
                          );
                      },
                    },
                  );
                }}
              >
                <div className="flex gap-2">
                  <Input
                    aria-label={L("Navn på versjonen", "Version name")}
                    placeholder={L(
                      `Versjon ${nextNumber} (f.eks. «Draft 9.4» eller «Etter møte med produsenten»)`,
                      `Version ${nextNumber} (e.g. “Draft 9.4” or “After meeting with the producer”)`,
                    )}
                    value={name}
                    maxLength={200}
                    onChange={(e) => setName(e.target.value)}
                    className="h-8 flex-1 bg-surface-3"
                  />
                  <Button type="submit" disabled={create.isPending || saving}>
                    {create.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                    {L("Lagre versjon", "Save version")}
                  </Button>
                </div>
                <Input
                  aria-label={L("Merknad (valgfri)", "Note (optional)")}
                  placeholder={L("Merknad (valgfri)", "Note (optional)")}
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-8 bg-surface-3"
                />
                {saving ? (
                  <p className="text-xs text-text-tertiary">
                    {L(
                      "Venter til endringene dine er lagret …",
                      "Waiting for your changes to be saved …",
                    )}
                  </p>
                ) : null}
                {notice ? <p className="text-xs text-text-tertiary">{notice}</p> : null}
                {create.isError ? (
                  <p role="alert" className="text-xs text-status-danger">
                    {L("Versjonen ble ikke lagret:", "The version was not saved:")}{" "}
                    {create.error.message}
                  </p>
                ) : null}
              </form>
            ) : null}

            {list.isLoading ? (
              <p className="text-[13px] text-text-tertiary">
                {L("Henter versjoner …", "Loading versions …")}
              </p>
            ) : versions.length === 0 ? (
              <p className="text-[13px] text-text-secondary">
                {L(
                  "Ingen versjoner ennå. Lagre en versjon før store endringer, så kan du alltid se og eksportere manuset slik det var.",
                  "No versions yet. Save a version before big changes, so you can always see and export the script as it was.",
                )}
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
                        {profiles.data?.[v.created_by]?.display_name ?? L("ukjent", "unknown")}
                        {v.note ? ` · ${v.note}` : ""}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setView({ kind: "show", id: v.id })}
                    >
                      <Eye />
                      {L("Vis", "View")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setView({ kind: "compare", a: v.id, b: NOW })}
                    >
                      <GitCompare />
                      {L("Mot nå", "vs now")}
                    </Button>
                    {versions[i + 1] ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setView({ kind: "compare", a: versions[i + 1]!.id, b: v.id })
                        }
                      >
                        {L(`Mot v${versions[i + 1]!.number}`, `vs v${versions[i + 1]!.number}`)}
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
        ) : view.kind === "restore" ? (
          <Restore
            version={versions.find((v) => v.id === view.id)!}
            state={state}
            productionId={productionId}
            saving={saving}
            onRun={props.onRun!}
            onBack={() => setView({ kind: "show", id: view.id })}
            onDone={(v) => {
              setName(
                L(
                  `Gjenopprettet fra v${v.number} – ${v.name}`,
                  `Restored from v${v.number} – ${v.name}`,
                ).slice(0, 200),
              );
              setNote("");
              setNotice(
                L(
                  `Manuset er nå som v${v.number}. Lagre det som en ny versjon hvis du vil ta vare på det.`,
                  `The script is now as v${v.number}. Save it as a new version if you want to keep it.`,
                ),
              );
              setView({ kind: "list" });
            }}
          />
        ) : (
          <Show
            version={versions.find((v) => v.id === view.id)!}
            onRestore={
              editable && props.onRun ? () => setView({ kind: "restore", id: view.id }) : null
            }
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
    // Med ressursbiblioteket: karakterer som nevnes i handlingen og objekter kjennes igjen (REQ-0078)
    () =>
      older.data && newer.data
        ? diffSnapshots(older.data, newer.data, Object.values(state.assets))
        : null,
    [older.data, newer.data, state.assets],
  );
  const select = (value: string, set: (v: string) => void, label: string) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => set(e.target.value)}
      className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
    >
      <option value={NOW}>{L("Nå (lagret manus)", "Now (saved script)")}</option>
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
          {L("Tilbake", "Back")}
        </Button>
        {L("Fra", "From")} {select(a, (v) => onChange(v, b), L("Eldre versjon", "Older version"))}{" "}
        {L("til", "to")} {select(b, (v) => onChange(a, v), L("Nyere versjon", "Newer version"))}
      </div>
      {older.isLoading || newer.isLoading ? (
        <p className="text-[13px] text-text-tertiary">
          {L("Henter versjoner …", "Loading versions …")}
        </p>
      ) : !changes ? (
        <p role="alert" className="text-[13px] text-status-danger">
          {L("Kunne ikke hente versjonene.", "Could not load the versions.")}
        </p>
      ) : changes.length === 0 ? (
        <p className="text-[13px] text-text-secondary">
          {L("Ingen forskjeller.", "No differences.")}
        </p>
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
                      {L("Gå til", "Go to")}
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
  // Karakterer og objekter (REQ-0078): som merkelapper for det som er kommet til og det som er borte
  if (change.names)
    return (
      <div className="flex flex-wrap items-center gap-1 text-xs text-text-secondary">
        <span className="text-text-tertiary">{CHANGE_LABEL[change.type]}:</span>
        {change.names.added.map((n) => (
          <span
            key={`+${n}`}
            className="rounded-sm bg-surface-3 px-1.5 py-0.5 text-status-success"
            aria-label={L(`${n} er kommet til`, `${n} added`)}
          >
            + {n}
          </span>
        ))}
        {change.names.removed.map((n) => (
          <span
            key={`-${n}`}
            className="rounded-sm bg-surface-3 px-1.5 py-0.5 text-status-danger line-through"
            aria-label={L(`${n} er borte`, `${n} removed`)}
          >
            − {n}
          </span>
        ))}
      </div>
    );
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
          {L("Vis alle", "Show all")} {lines.length} {L("linjer", "lines")}
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
            {line.op === "added"
              ? L(" (ny)", " (new)")
              : line.op === "removed"
                ? L(" (fjernet)", " (removed)")
                : L(" (endret)", " (changed)")}
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
  onRestore,
}: {
  version: VersionRow;
  onRestore: (() => void) | null;
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
          {L("Tilbake", "Back")}
        </Button>
        <span className="text-[13px] text-text-primary">
          v{version.number} – {version.name}
        </span>
        <span className="text-xs text-text-tertiary">
          {dateText(version.created_at)} · {L("bare lesing", "read only")}
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
          {L("Eksporter PDF", "Export PDF")}
        </Button>
        {onRestore ? (
          <Button size="sm" variant="secondary" disabled={!snap.data} onClick={onRestore}>
            <RotateCcw />
            {L("Gjør denne versjonen gjeldende", "Make this version current")}
          </Button>
        ) : null}
      </div>
      {ready ? (
        <p role="status" className="text-xs text-text-secondary">
          {L("Filen er laget:", "The file is ready:")}{" "}
          <a
            href={ready.url}
            download={ready.name}
            className="text-accent-brand underline underline-offset-2"
          >
            {L(`Last ned «${ready.name}»`, `Download “${ready.name}”`)}
          </a>
        </p>
      ) : null}
      {snap.isLoading ? (
        <p className="text-[13px] text-text-tertiary">
          {L("Henter versjonen …", "Loading the version …")}
        </p>
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

/**
 * Gjør en tidligere versjon gjeldende (REQ-0077, KI-27): viser først hva som endres i manuset nå (scener og
 * linjer) og det som ikke kan settes tilbake. Etter bekreftelse utføres alt som én endring som angres samlet.
 * Ingenting slettes: linjer og scener som er kommet til, fjernes fra manuset/deaktiveres og kan hentes tilbake.
 */
function Restore({
  version,
  state,
  productionId,
  saving,
  onRun,
  onBack,
  onDone,
}: {
  version: VersionRow;
  state: ProjectState;
  productionId: string;
  saving: boolean;
  onRun: RunQueued;
  onBack: () => void;
  onDone: (version: VersionRow) => void;
}) {
  const snap = useVersionSnapshot(version.id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(
    () => (snap.data ? previewRestore(state, productionId, snap.data) : null),
    [snap.data, state, productionId],
  );
  const label = L(`Gjør v${version.number} gjeldende`, `Make v${version.number} current`);

  async function confirm() {
    if (!preview || preview.error || preview.commands.length === 0 || busy) return;
    // Alt i én angregruppe: Ctrl+Z setter manuset tilbake slik det var før gjenopprettingen
    const group = newId();
    const pending: Promise<string | null>[] = [];
    setBusy(true);
    try {
      for (const c of preview.commands) {
        // Teksten kommer fra versjonen (ikke skrevet nå): den tas ikke vare på som «din tekst» ved en feil
        const r = onRun(c, label, group, { keepText: false });
        if (r.error) {
          await Promise.all(pending);
          setError(
            L(
              `Stoppet underveis: ${r.error} Det som ble gjort, kan angres samlet med «Angre» (Ctrl+Z).`,
              `Stopped partway: ${r.error} What was done can be undone together with “Undo” (Ctrl+Z).`,
            ),
          );
          return;
        }
        pending.push(r.done);
      }
      // Vent til serveren har lagret alt: avvises én endring, sendes ikke resten (manuset er da delvis gjenopprettet)
      const errors = await Promise.all(pending);
      if (errors.some((e) => e !== null)) {
        setError(
          L(PARTIAL_RESTORE, "The restore was only partly completed – undo with ⌘/Ctrl + Z"),
        );
        return;
      }
      onDone(version);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft />
          {L("Tilbake", "Back")}
        </Button>
        <span className="text-[13px] text-text-primary">
          {L(
            `Gjør v${version.number} – ${version.name} gjeldende`,
            `Make v${version.number} – ${version.name} current`,
          )}
        </span>
      </div>
      <p className="text-xs text-text-secondary">
        {L(
          "Manuset settes tilbake til teksten, rekkefølgen, synligheten og overskriftene i versjonen. Ingenting slettes: linjer og scener som er kommet til senere, tas ut av manuset og kan hentes tilbake, og alle versjoner beholdes. Materiale laget fra nyere tekst vil vises som avvik. Endringen kan angres samlet.",
          "The script is set back to the text, order, visibility and headings in the version. Nothing is deleted: lines and scenes added later are taken out of the script and can be brought back, and all versions are kept. Material made from newer text will show as discrepancies. The change can be undone together.",
        )}
      </p>
      {snap.isLoading || !preview ? (
        <p className="text-[13px] text-text-tertiary">
          {L("Henter versjonen …", "Loading the version …")}
        </p>
      ) : preview.error ? (
        <p role="alert" className="text-[13px] text-status-danger">
          {L(
            "Versjonen kan ikke gjøres gjeldende herfra:",
            "This version cannot be made current from here:",
          )}{" "}
          {tm(preview.error)}
        </p>
      ) : preview.commands.length === 0 ? (
        <p className="text-[13px] text-text-secondary">
          {L(
            "Manuset er allerede likt versjonen. Ingenting å endre.",
            "The script is already the same as the version. Nothing to change.",
          )}
        </p>
      ) : (
        <>
          <p className="text-xs text-text-tertiary">
            {ORDER.filter((t) => preview.changes.some((c) => c.type === t))
              .map(
                (t) => `${CHANGE_LABEL[t]}: ${preview.changes.filter((c) => c.type === t).length}`,
              )
              .join(" · ")}
          </p>
          <ul
            aria-label={L("Dette endres i manuset", "This changes in the script")}
            className="max-h-[45vh] overflow-y-auto border border-border bg-surface-1"
          >
            {groupByScene(preview.changes).map((g) => (
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
      {preview && preview.issues.length > 0 ? (
        <div className="border border-status-uncertain/40 bg-surface-1 p-2 text-xs">
          <p className="font-medium text-text-primary">
            {L("Dette settes ikke tilbake:", "This is not set back:")}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-text-secondary">
            {preview.issues.map((i, n) => (
              <li key={n}>
                <span className="font-mono text-text-tertiary">{i.number ?? "–"}</span> {i.heading}:{" "}
                {tm(i.reason)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onBack}>
          {L("Avbryt", "Cancel")}
        </Button>
        <Button
          onClick={() => void confirm()}
          disabled={
            !preview ||
            !!preview.error ||
            preview.commands.length === 0 ||
            saving ||
            busy ||
            !!error
          }
        >
          {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          {label}
        </Button>
      </div>
    </div>
  );
}
