/**
 * Sikkerhetskopi av prosjekt (DEC-0049, REQ-0411/0412): last ned hele prosjektet som én zip-fil, og
 * gjenopprett en sikkerhetskopi som et nytt prosjekt. Ingenting eksisterende overskrives.
 */
import { useQuery } from "@tanstack/react-query";
import { ArchiveRestore, DatabaseBackup, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BACKUP_CATEGORY_LABEL,
  L,
  backupFiles,
  backupSummary,
  locale,
  zipSafeName,
  type BackupFileCategory,
} from "@/core";
import { openZipSink, type ZipProgress } from "@/engine/export/zip";
import { asciiFileName, formatBytes, ZIP_MAX_BYTES } from "@/app/library/AssetZip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  backupProblem,
  buildBackup,
  loadBackupSource,
  openBackupFile,
  restoreFromBackup,
  writeBackupZip,
  type OpenedBackup,
  type RestoreProgress,
  type RestoreState,
} from "./backup";

const CATEGORIES: readonly BackupFileCategory[] = ["bilde", "lyd", "film", "manusfil"]; // i18n-ignore
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const label = "text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary";

function Bar({ value, total }: { value: number; total: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
      <div
        className="h-full bg-accent-brand transition-[width]"
        style={{ width: `${Math.round((total > 0 ? value / total : 0) * 100)}%` }}
      />
    </div>
  );
}

function Message({ m }: { m: { kind: "ok" | "error"; text: string } | null }) {
  if (!m) return null;
  return (
    <p
      role={m.kind === "error" ? "alert" : "status"}
      className={"text-xs " + (m.kind === "error" ? "text-status-danger" : "text-status-success")}
    >
      {m.text}
    </p>
  );
}

/** Last ned sikkerhetskopi av ett prosjekt. */
export function BackupDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}) {
  const source = useQuery({
    queryKey: ["backup-source", projectId],
    enabled: open,
    staleTime: 15_000,
    queryFn: () => loadBackupSource(projectId),
  });
  const [off, setOff] = useState<ReadonlySet<BackupFileCategory>>(new Set());
  const [progress, setProgress] = useState<ZipProgress | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [link, setLink] = useState<{ url: string; name: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      if (link) URL.revokeObjectURL(link.url);
    },
    [link],
  );
  const all = useMemo(
    () =>
      source.data
        ? backupFiles(source.data.rows, source.data.importedDocuments, new Set(CATEGORIES))
        : [],
    [source.data],
  );
  const cats = CATEGORIES.map((c) => {
    const list = all.filter((f) => f.category === c);
    return { c, files: list.length, bytes: list.reduce((n, f) => n + f.byteSize, 0) };
  }).filter((x) => x.files > 0);
  const bytes = cats.filter((x) => !off.has(x.c)).reduce((n, x) => n + x.bytes, 0);
  // Uten lagringsvindu (Safari, Firefox) samles zip-filen i minnet: lavere grense
  const hasPicker =
    typeof window !== "undefined" &&
    typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker ===
      "function";
  const limit = hasPicker ? ZIP_MAX_BYTES : 1.5 * 1024 * 1024 * 1024;
  const tooBig = bytes > limit;
  const busy = progress !== null;
  const d = source.data;

  async function download() {
    if (!d || tooBig) return;
    const date = new Date().toISOString().slice(0, 10);
    const name = asciiFileName(
      `${zipSafeName(projectName, "prosjekt")} - sikkerhetskopi - ${date}.zip`,
    );
    setMessage(null);
    setLink(null);
    // Lagringsvinduet må åpnes rett fra klikket
    const sink = await openZipSink(name);
    if (!sink) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setProgress({ files: 0, totalFiles: 0, bytes: 0, totalBytes: 0 });
    try {
      const include = new Set(CATEGORIES.filter((c) => !off.has(c)));
      let backup = buildBackup(d, include);
      // Lest mens andre redigerte? Les på nytt én gang før den lagres.
      let problem = await backupProblem(backup);
      if (problem) {
        const again = await source.refetch();
        if (again.data) {
          backup = buildBackup(again.data, include);
          problem = await backupProblem(backup);
        }
      }
      const { missing } = await writeBackupZip(sink, backup, {
        signal: ctrl.signal,
        onProgress: (p) => {
          if (abort.current === ctrl) setProgress(p);
        },
      });
      setLink(sink.link?.() ?? null);
      setMessage(
        problem
          ? {
              kind: "error",
              text: L(
                `Sikkerhetskopien er laget, men den kan ikke gjenopprettes slik den er (${problem}) Lag en ny når ingen andre redigerer, og si ifra hvis det skjer igjen.`,
                `The backup was made, but it cannot be restored as it is (${problem}). Make a new one when nobody else is editing, and let us know if it happens again.`,
              ),
            }
          : {
              kind: missing.length ? "error" : "ok",
              text: missing.length
                ? L(
                    `Sikkerhetskopien er laget, men ${missing.length} ${missing.length === 1 ? "fil" : "filer"} kunne ikke hentes (se MANGLER.txt i zip-filen).`,
                    `The backup was made, but ${missing.length} ${missing.length === 1 ? "file" : "files"} could not be fetched (see MANGLER.txt in the zip file).`,
                  )
                : L(`Sikkerhetskopien «${name}» er laget.`, `The backup “${name}” was made.`),
            },
      );
    } catch (e) {
      setMessage({
        kind: "error",
        text:
          (e as DOMException).name === "AbortError"
            ? L("Nedlastingen ble avbrutt.", "The download was cancelled.")
            : L(
                `Sikkerhetskopien kunne ikke lages: ${(e as Error).message}`,
                `The backup could not be made: ${(e as Error).message}`,
              ),
      });
    } finally {
      if (abort.current === ctrl) abort.current = null;
      setProgress(null);
    }
  }

  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-[540px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>
            {L("Sikkerhetskopi av «", "Backup of “")}
            {projectName}
            {L("»", "”")}
          </DialogTitle>
          <DialogDescription>
            {L(
              "Hele prosjektet i én zip-fil som kan gjenopprettes senere, også i en annen konto. Formatet er dokumentert i filen LES-MEG.txt.",
              "The whole project in one zip file that can be restored later, including in another account. The format is documented in the file LES-MEG.txt.",
            )}
          </DialogDescription>
        </DialogHeader>
        {!d ? (
          source.isError ? (
            <p role="alert" className="text-xs text-status-danger">
              {L("Prosjektet kunne ikke hentes:", "The project could not be fetched:")}{" "}
              {(source.error as Error).message}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-xs text-text-tertiary">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
              {L("Henter prosjektet …", "Fetching the project …")}
            </p>
          )
        ) : (
          <div className="flex flex-col gap-3">
            <section
              aria-label={L("Alltid med", "Always included")}
              className="flex flex-col gap-1"
            >
              <h3 className={label}>{L("Alltid med", "Always included")}</h3>
              <p className="text-xs text-text-secondary">
                {L("Manus med teksthistorikk", "Script with text history")} (
                {count(d.rows.scenes.length, L("scene", "scene"), L("scener", "scenes"))}),{" "}
                {count(
                  d.scriptVersions.length,
                  L("manusversjon", "script version"),
                  L("manusversjoner", "script versions"),
                )}
                {", "}
                {L(
                  "spinoffer, ressursbiblioteket, notater, 2D-scener med lag og kamera, lydklipp, monteringen (versjoner, deler og tidskoblinger) og historikken.",
                  "spin-offs, the asset library, notes, 2D scenes with layers and camera, audio clips, the assembly (versions, parts and time links) and the history.",
                )}
              </p>
            </section>
            <section aria-label={L("Mediefiler", "Media files")} className="flex flex-col gap-1">
              <h3 className={label}>{L("Mediefiler", "Media files")}</h3>
              {cats.length === 0 ? (
                <p className="text-xs text-text-tertiary">
                  {L("Prosjektet har ingen mediefiler.", "The project has no media files.")}
                </p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {cats.map((x) => (
                    <li key={x.c}>
                      <label className="flex items-center gap-2 rounded-sm px-1 py-0.5 text-xs text-text-primary hover:bg-surface-3">
                        <input
                          type="checkbox"
                          checked={!off.has(x.c)}
                          disabled={busy}
                          onChange={(e) =>
                            setOff((o) => {
                              const n = new Set(o);
                              if (e.target.checked) n.delete(x.c);
                              else n.add(x.c);
                              return n;
                            })
                          }
                          className="size-3.5 accent-[var(--accent-brand)]"
                        />
                        <span className="flex-1">{BACKUP_CATEGORY_LABEL[x.c]}</span>
                        <span className="tabular text-text-tertiary">
                          {count(x.files, L("fil", "file"), L("filer", "files"))} ·{" "}
                          {formatBytes(x.bytes)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {off.size > 0 ? (
                <p className="text-[11px] text-text-tertiary">
                  {L(
                    "Filer du ikke tar med, står i en liste i sikkerhetskopien. De vises som manglende hvis sikkerhetskopien gjenopprettes.",
                    "Files you leave out are listed in the backup. They appear as missing if the backup is restored.",
                  )}
                </p>
              ) : null}
            </section>
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={busy || tooBig} onClick={() => void download()}>
                {busy ? <Loader2 className="animate-spin" /> : <DatabaseBackup />}
                {L("Last ned sikkerhetskopi", "Download backup")} ({formatBytes(bytes)})
              </Button>
              {tooBig ? (
                <span className="text-[11px] text-status-danger">
                  Over {formatBytes(limit)} –{" "}
                  {L("ta med færre mediefiler", "include fewer media files")}
                  {hasPicker
                    ? ""
                    : L(
                        " (eller bruk Chrome eller Edge, som lagrer rett til disk)",
                        " (or use Chrome or Edge, which save straight to disk)",
                      )}
                </span>
              ) : null}
              {busy ? (
                <Button variant="ghost" onClick={() => abort.current?.abort()}>
                  {L("Avbryt", "Cancel")}
                </Button>
              ) : null}
            </div>
            {progress && progress.totalFiles > 0 ? (
              <div className="flex flex-col gap-1" aria-live="polite">
                <Bar value={progress.bytes} total={progress.totalBytes} />
                <span className="text-[11px] text-text-tertiary">
                  {progress.files} {L("av", "of")} {progress.totalFiles} {L("filer", "files")} ·{" "}
                  {formatBytes(progress.bytes)} {L("av", "of")} {formatBytes(progress.totalBytes)}
                </span>
              </div>
            ) : null}
            <Message m={message} />
            {link ? (
              <p className="text-xs text-text-secondary">
                <a href={link.url} download={link.name} className="underline underline-offset-2">
                  {L("Lagre sikkerhetskopien", "Save the backup")}
                </a>{" "}
                {L("(hvis nedlastingen ikke startet).", "(if the download did not start).")}
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Gjenopprett en sikkerhetskopi som et nytt prosjekt. */
export function RestoreBackupDialog({
  open,
  onOpenChange,
  onOpenProject,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenProject: (projectId: string) => void;
  onRestored: () => void;
}) {
  const [opened, setOpened] = useState<OpenedBackup | null>(null);
  const [reading, setReading] = useState(false);
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const state = useRef<RestoreState>({ projectId: null, uploaded: new Set() });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) return;
    setOpened(null);
    setName("");
    setProgress(null);
    setMessage(null);
    setDoneId(null);
    state.current = { projectId: null, uploaded: new Set() };
  }, [open]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    setOpened(null);
    setDoneId(null);
    state.current = { projectId: null, uploaded: new Set() };
    setReading(true);
    try {
      const o = await openBackupFile(file);
      setOpened(o);
      setName(
        `${String(o.backup.project["name"] ?? L("Prosjekt", "Project"))} ${L("(gjenopprettet)", "(restored)")}`,
      );
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setReading(false);
    }
  }

  async function run() {
    if (!opened || !name.trim()) return;
    setMessage(null);
    setRunning(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const id = await restoreFromBackup(
        opened,
        name.trim().slice(0, 200),
        state.current,
        setProgress,
        ctrl.signal,
      );
      setDoneId(id);
      setMessage({
        kind: "ok",
        text: L(
          `«${name.trim()}» er gjenopprettet som nytt prosjekt.`,
          `“${name.trim()}” has been restored as a new project.`,
        ),
      });
      onRestored();
    } catch (e) {
      setMessage({
        kind: "error",
        text:
          (e as DOMException).name === "AbortError"
            ? L(
                `Gjenopprettingen ble stoppet. Prosjektet «${name.trim()}» er laget, men ikke ferdig. Trykk «Prøv igjen» for å fortsette der den stoppet, eller slett det fra prosjektlisten.`,
                `The restore was stopped. The project “${name.trim()}” has been created but is not finished. Press “Try again” to continue where it stopped, or delete it from the project list.`,
              )
            : `${(e as Error).message}${state.current.projectId ? L(` Prosjektet «${name.trim()}» er laget, men ikke ferdig: trykk «Prøv igjen» for å fortsette der den stoppet, eller slett det fra prosjektlisten.`, ` The project “${name.trim()}” has been created but is not finished: press “Try again” to continue where it stopped, or delete it from the project list.`) : ""}`,
      });
      if (state.current.projectId) onRestored();
    } finally {
      abort.current = null;
      setRunning(false);
    }
  }

  const sum = opened ? backupSummary(opened.backup) : null;
  const notIncluded = opened ? opened.backup.files.filter((f) => !f.included).length : 0;
  const started = state.current.projectId !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent className="max-w-[540px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{L("Gjenopprett fra sikkerhetskopi", "Restore from backup")}</DialogTitle>
          <DialogDescription>
            {L(
              "Sikkerhetskopien blir et nytt prosjekt der du er eier. Ingen eksisterende prosjekter endres. Medlemmer og invitasjoner tas ikke med.",
              "The backup becomes a new project that you own. No existing projects are changed. Members and invitations are not included.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {!doneId ? (
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              <span className={label}>{L("Sikkerhetskopi (zip)", "Backup (zip)")}</span>
              <input
                type="file"
                accept=".zip,application/zip"
                aria-label={L("Velg sikkerhetskopi", "Choose backup")}
                disabled={running}
                onChange={(e) => void pick(e.target.files?.[0])}
                className="text-xs file:mr-2 file:rounded-sm file:border file:border-border-control file:bg-surface-3 file:px-2 file:py-1 file:text-text-primary"
              />
            </label>
          ) : null}
          {reading ? (
            <p className="flex items-center gap-2 text-xs text-text-tertiary">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
              {L("Leser sikkerhetskopien …", "Reading the backup …")}
            </p>
          ) : null}
          {sum && opened ? (
            <section
              aria-label={L("Innhold", "Contents")}
              className="flex flex-col gap-1 rounded-sm border border-border bg-surface-1 p-2 text-xs"
            >
              <p className="font-medium text-text-primary">{sum.name}</p>
              <p className="text-text-tertiary">
                {L("Laget", "Created")} {new Date(sum.createdAt).toLocaleString(locale())}
              </p>
              <p className="text-text-secondary">
                {[
                  plural(sum.scenes, L("scene", "scene"), L("scener", "scenes")),
                  plural(
                    sum.blocks,
                    L("manusblokk", "script block"),
                    L("manusblokker", "script blocks"),
                  ),
                  plural(
                    sum.versions,
                    L("manusversjon", "script version"),
                    L("manusversjoner", "script versions"),
                  ),
                  plural(sum.assets, L("ressurs", "asset"), L("ressurser", "assets")),
                  plural(sum.compositions, L("2D-scene", "2D scene"), L("2D-scener", "2D scenes")),
                  plural(sum.audioClips, L("lydklipp", "audio clip"), L("lydklipp", "audio clips")),
                  plural(
                    sum.films,
                    L("importert film", "imported film"),
                    L("importerte filmer", "imported films"),
                  ),
                ].join(" · ")}
              </p>
              <p className="text-text-secondary">
                {sum.files} {L("mediefiler", "media files")} ({formatBytes(sum.bytes)})
              </p>
              {notIncluded > 0 ? (
                <p className="text-status-uncertain">
                  {notIncluded}{" "}
                  {notIncluded === 1 ? L("fil er", "file is") : L("filer er", "files are")}{" "}
                  {L(
                    "ikke med i sikkerhetskopien og vil mangle i det nye prosjektet.",
                    "not in the backup and will be missing from the new project.",
                  )}
                </p>
              ) : null}
              {opened.missing > 0 ? (
                <p className="text-status-uncertain">
                  {opened.missing} {opened.missing === 1 ? L("fil", "file") : L("filer", "files")}{" "}
                  {L("mangler i zip-filen.", "missing from the zip file.")}
                </p>
              ) : null}
            </section>
          ) : null}
          {opened && !doneId ? (
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              <span className={label}>
                {L("Navn på det nye prosjektet", "Name of the new project")}
              </span>
              <Input
                value={name}
                disabled={running || started}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                className="h-8 bg-surface-3"
              />
            </label>
          ) : null}
          {progress && running ? (
            <div className="flex flex-col gap-1" aria-live="polite">
              <Bar
                value={
                  progress.phase === "files" ? progress.bytes : progress.phase === "data" ? 1 : 0
                }
                total={progress.phase === "files" ? progress.totalBytes : 1}
              />
              <span className="text-[11px] text-text-tertiary">
                {progress.phase === "project"
                  ? L("Lager det nye prosjektet …", "Creating the new project …")
                  : progress.phase === "files"
                    ? L(
                        `Laster opp filer: ${progress.files} av ${progress.totalFiles} · ${formatBytes(progress.bytes)} av ${formatBytes(progress.totalBytes)}`,
                        `Uploading files: ${progress.files} of ${progress.totalFiles} · ${formatBytes(progress.bytes)} of ${formatBytes(progress.totalBytes)}`,
                      )
                    : L(
                        "Lagrer manus, scener og montering …",
                        "Saving the script, scenes and assembly …",
                      )}
              </span>
            </div>
          ) : null}
          <Message m={message} />
          <div className="flex flex-wrap items-center gap-2">
            {doneId ? (
              <Button onClick={() => onOpenProject(doneId)}>
                {L("Åpne prosjektet", "Open the project")}
              </Button>
            ) : (
              <Button disabled={!opened || !name.trim() || running} onClick={() => void run()}>
                {running ? <Loader2 className="animate-spin" /> : <ArchiveRestore />}
                {started
                  ? L("Prøv igjen", "Try again")
                  : L("Gjenopprett som nytt prosjekt", "Restore as new project")}
              </Button>
            )}
            {running && progress?.phase !== "data" ? (
              <Button
                variant="ghost"
                onClick={() => abort.current?.abort()}
                title={L(
                  "Stopper etter filen som lastes opp nå",
                  "Stops after the file being uploaded now",
                )}
              >
                {L("Stopp", "Stop")}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
