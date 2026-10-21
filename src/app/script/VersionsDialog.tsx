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
import { CHANGE_LABEL, diffSnapshots, newId, paginate, snapshotFromState, snapshotPaginationInput, tm, wordDiff, type ChangeType, type Command, type LineChange, type SceneChange, type ProjectState, type ScriptSnapshot } from "@/core";
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
import { t as tk } from "@/core/i18n/keyed";
import { useTimeFormat } from "@/app/i18n/time-format";

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


export function VersionsDialog(props: Props) {
  const dateText = useTimeFormat().exact;
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
            {tk("app-script-versions-dialog.versions-dialog.dialog-title.69bba483a0a7")} – {production?.name}
          </DialogTitle>
          <DialogDescription>
            {tk("app-script-versions-dialog.versions-dialog.dialog-description.27b08457ac4a")}
          </DialogDescription>
        </DialogHeader>

        {missingTable ? (
          <p role="alert" className="text-[13px] text-status-uncertain">
            {tk("app-script-versions-dialog.versions-dialog.p.a04beb457477")}
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
                      name: name.trim() || tk("app-script-versions-dialog.name.name.cdc6bc05bab6", { nextNumber: String(nextNumber) }),
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
                            tk("app-script-versions-dialog.on-success.set-notice.60c831e46d69"),
                          );
                      },
                    },
                  );
                }}
              >
                <div className="flex gap-2">
                  <Input
                    aria-label={tk("app-script-versions-dialog.versions-dialog.aria-label.00b989f437d0")}
                    placeholder={tk("app-script-versions-dialog.versions-dialog.placeholder.a0370e7926be", { nextNumber: String(nextNumber) })}
                    value={name}
                    maxLength={200}
                    onChange={(e) => setName(e.target.value)}
                    className="h-8 flex-1 bg-surface-3"
                  />
                  <Button type="submit" disabled={create.isPending || saving}>
                    {create.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                    {tk("app-script-versions-dialog.versions-dialog.button.9387faa510ff")}
                  </Button>
                </div>
                <Input
                  aria-label={tk("app-script-versions-dialog.versions-dialog.aria-label.d8a80beb1675")}
                  placeholder={tk("app-script-versions-dialog.versions-dialog.placeholder.d8a80beb1675")}
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-8 bg-surface-3"
                />
                {saving ? (
                  <p className="text-xs text-text-tertiary">
                    {tk("app-script-versions-dialog.versions-dialog.p.f0e236b18ee4")}
                  </p>
                ) : null}
                {notice ? <p className="text-xs text-text-tertiary">{notice}</p> : null}
                {create.isError ? (
                  <p role="alert" className="text-xs text-status-danger">
                    {tk("app-script-versions-dialog.versions-dialog.p.6f7927ecccce")}{" "}
                    {create.error.message}
                  </p>
                ) : null}
              </form>
            ) : null}

            {list.isLoading ? (
              <p className="text-[13px] text-text-tertiary">
                {tk("app-script-versions-dialog.versions-dialog.p.ec6f907a214f")}
              </p>
            ) : versions.length === 0 ? (
              <p className="text-[13px] text-text-secondary">
                {tk("app-script-versions-dialog.versions-dialog.p.91a2313dd622")}
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
                        {profiles.data?.[v.created_by]?.display_name ?? tk("app-script-versions-dialog.versions-dialog.span.1c6db041588a")}
                        {v.note ? ` · ${v.note}` : ""}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setView({ kind: "show", id: v.id })}
                    >
                      <Eye />
                      {tk("app-script-versions-dialog.versions-dialog.button.b294bd06a0d2")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setView({ kind: "compare", a: v.id, b: NOW })}
                    >
                      <GitCompare />
                      {tk("app-script-versions-dialog.versions-dialog.button.e635e8d9147e")}
                    </Button>
                    {versions[i + 1] ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setView({ kind: "compare", a: versions[i + 1]!.id, b: v.id })
                        }
                      >
                        {tk("app-script-versions-dialog.versions-dialog.button.32ac29172e29", { number: String(versions[i + 1]!.number) })}
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
                tk("app-script-versions-dialog.versions-dialog.l-gjenopprettet-fra-v-v-number-v-name-restored-from-v-v-number-v-name-slice.d02d4cafbedd", { number: String(v.number), name: String(v.name) }).slice(0, 200),
              );
              setNote("");
              setNotice(
                tk("app-script-versions-dialog.versions-dialog.set-notice.ea1bb525ff46", { number: String(v.number) }),
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
      <option value={NOW}>{tk("app-script-versions-dialog.select.option.deacb04cdb8c")}</option>
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
          {tk("app-script-versions-dialog.compare.button.3b72c0bea3b0")}
        </Button>
        {tk("app-script-versions-dialog.compare.div.9b05046bb9d9")} {select(a, (v) => onChange(v, b), tk("app-script-versions-dialog.compare.select.5f11ea758846"))}{" "}
        {tk("app-script-versions-dialog.compare.div.9aa2fc5177e5")} {select(b, (v) => onChange(a, v), tk("app-script-versions-dialog.compare.select.0770bffc7207"))}
      </div>
      {older.isLoading || newer.isLoading ? (
        <p className="text-[13px] text-text-tertiary">
          {tk("app-script-versions-dialog.compare.p.5568b12d3fc6")}
        </p>
      ) : !changes ? (
        <p role="alert" className="text-[13px] text-status-danger">
          {tk("app-script-versions-dialog.compare.p.fdaa3bf07b0e")}
        </p>
      ) : changes.length === 0 ? (
        <p className="text-[13px] text-text-secondary">
          {tk("app-script-versions-dialog.compare.p.cfa2159fa8de")}
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
                      {tk("app-script-versions-dialog.compare.button.a6b55382c6e1")}
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
            aria-label={tk("app-script-versions-dialog.change-detail.aria-label.631e8c5a9ad7", { n: String(n) })}
          >
            + {n}
          </span>
        ))}
        {change.names.removed.map((n) => (
          <span
            key={`-${n}`}
            className="rounded-sm bg-surface-3 px-1.5 py-0.5 text-status-danger line-through"
            aria-label={tk("app-script-versions-dialog.change-detail.aria-label.b9307241a002", { n: String(n) })}
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
          {tk("app-script-versions-dialog.change-detail.button.3a1bf836e6fd")} {lines.length} {tk("app-script-versions-dialog.change-detail.button.551c139a1a46")}
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
              ? tk("app-script-versions-dialog.line-row.span.7b8313c835a9")
              : line.op === "removed"
                ? tk("app-script-versions-dialog.line-row.span.50f1a48ac127")
                : tk("app-script-versions-dialog.line-row.span.e6c3fc46eda4")}
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
  const dateText = useTimeFormat().exact;
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
          {tk("app-script-versions-dialog.show.button.1719fd006ff4")}
        </Button>
        <span className="text-[13px] text-text-primary">
          v{version.number} – {version.name}
        </span>
        <span className="text-xs text-text-tertiary">
          {dateText(version.created_at)} · {tk("app-script-versions-dialog.show.span.bdd8b8a46fcd")}
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
          {tk("app-script-versions-dialog.show.button.f190ce1c0305")}
        </Button>
        {onRestore ? (
          <Button size="sm" variant="secondary" disabled={!snap.data} onClick={onRestore}>
            <RotateCcw />
            {tk("app-script-versions-dialog.show.button.74204ac6d936")}
          </Button>
        ) : null}
      </div>
      {ready ? (
        <p role="status" className="text-xs text-text-secondary">
          {tk("app-script-versions-dialog.show.p.31cf29d85e49")}{" "}
          <a
            href={ready.url}
            download={ready.name}
            className="text-accent-brand underline underline-offset-2"
          >
            {tk("app-script-versions-dialog.show.a.0673a15f1e03", { name: String(ready.name) })}
          </a>
        </p>
      ) : null}
      {snap.isLoading ? (
        <p className="text-[13px] text-text-tertiary">
          {tk("app-script-versions-dialog.show.p.dc810f10ae03")}
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
  const label = tk("app-script-versions-dialog.label.message.93ce529c6f7f", { number: String(version.number) });

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
            tk("app-script-versions-dialog.confirm.set-error.83694ff11e64", { error: String(r.error) }),
          );
          return;
        }
        pending.push(r.done);
      }
      // Vent til serveren har lagret alt: avvises én endring, sendes ikke resten (manuset er da delvis gjenopprettet)
      const errors = await Promise.all(pending);
      if (errors.some((e) => e !== null)) {
        setError(
          tk("app-script-versions-dialog.partial-restore"),
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
          {tk("app-script-versions-dialog.restore.button.5b0bdea5f10e")}
        </Button>
        <span className="text-[13px] text-text-primary">
          {tk("app-script-versions-dialog.restore.span.5dbe5eb3207e", { number: String(version.number), name: String(version.name) })}
        </span>
      </div>
      <p className="text-xs text-text-secondary">
        {tk("app-script-versions-dialog.restore.p.aafc0c81078c")}
      </p>
      {snap.isLoading || !preview ? (
        <p className="text-[13px] text-text-tertiary">
          {tk("app-script-versions-dialog.restore.p.2ddfbddaff73")}
        </p>
      ) : preview.error ? (
        <p role="alert" className="text-[13px] text-status-danger">
          {tk("app-script-versions-dialog.restore.p.54b102ce3f27")}{" "}
          {tm(preview.error)}
        </p>
      ) : preview.commands.length === 0 ? (
        <p className="text-[13px] text-text-secondary">
          {tk("app-script-versions-dialog.restore.p.94d964d80e5e")}
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
            aria-label={tk("app-script-versions-dialog.restore.aria-label.1ac8fcfa598e")}
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
            {tk("app-script-versions-dialog.restore.p.30480d2a56af")}
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
          {tk("app-script-versions-dialog.restore.button.0beacee11e9c")}
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
