/**
 * Sikkerhetskopi av prosjekt (DEC-0049, REQ-0411/0412): last ned hele prosjektet som én zip-fil, og
 * gjenopprett en sikkerhetskopi som et nytt prosjekt. Ingenting eksisterende overskrives.
 */
import { useQuery } from "@tanstack/react-query";
import { ArchiveRestore, DatabaseBackup, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BACKUP_CATEGORY_LABEL, backupFiles, backupSummary, locale, zipSafeName, type BackupFileCategory } from "@/core";
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
import { t } from "@/core/i18n/keyed";

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
              text: t("app-projects-backup-dialogs.text.text.e3db24475fe8", { problem: String(problem) }),
            }
          : {
              kind: missing.length ? "error" : "ok",
              text: missing.length
                ? t("app-projects-backup-dialogs.missing-files", { count: missing.length })
                : t("app-projects-backup-dialogs.text.text.2db3611d8b9f", { name: String(name) }),
            },
      );
    } catch (e) {
      setMessage({
        kind: "error",
        text:
          (e as DOMException).name === "AbortError"
            ? t("app-projects-backup-dialogs.text.text.0f5fe9783d54")
            : t("app-projects-backup-dialogs.text.text.a5550b2f64cd", { message: String((e as Error).message) }),
      });
    } finally {
      if (abort.current === ctrl) abort.current = null;
      setProgress(null);
    }
  }

  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent uiId="V-076" className="max-w-[540px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>
            {t("app-projects-backup-dialogs.backup-dialog.dialog-title.09f8b9ff432c")}
            {projectName}
            {t("app-projects-backup-dialogs.backup-dialog.dialog-title.0ed362fb8349")}
          </DialogTitle>
          <DialogDescription>
            {t("app-projects-backup-dialogs.backup-dialog.dialog-description.4b823ee2aa8b")}
          </DialogDescription>
        </DialogHeader>
        {!d ? (
          source.isError ? (
            <p role="alert" className="text-xs text-status-danger">
              {t("app-projects-backup-dialogs.backup-dialog.p.6bb7daa3ea14")}{" "}
              {(source.error as Error).message}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-xs text-text-tertiary">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
              {t("app-projects-backup-dialogs.backup-dialog.p.9dac001f4c5a")}
            </p>
          )
        ) : (
          <div className="flex flex-col gap-3">
            <section
              aria-label={t("app-projects-backup-dialogs.backup-dialog.aria-label.a1b45009f8c3")}
              className="flex flex-col gap-1"
            >
              <h3 className={label}>{t("app-projects-backup-dialogs.backup-dialog.h3.a1b45009f8c3")}</h3>
              <p className="text-xs text-text-secondary">
                {t("app-projects-backup-dialogs.backup-dialog.p.c120d86cfe80")} (
                {count(d.rows.scenes.length, t("app-projects-backup-dialogs.backup-dialog.count.7c863dd5b5d9"), t("app-projects-backup-dialogs.backup-dialog.count.788d1e24d6e9"))}),{" "}
                {count(
                  d.scriptVersions.length,
                  t("app-projects-backup-dialogs.backup-dialog.count.ca3dddfa003f"),
                  t("app-projects-backup-dialogs.backup-dialog.count.367c0533759e"),
                )}
                {", "}
                {t("app-projects-backup-dialogs.backup-dialog.p.df41a8ddd9f1")}
              </p>
            </section>
            <section aria-label={t("app-projects-backup-dialogs.backup-dialog.aria-label.7cbee02d0e97")} className="flex flex-col gap-1">
              <h3 className={label}>{t("app-projects-backup-dialogs.backup-dialog.h3.7cbee02d0e97")}</h3>
              {cats.length === 0 ? (
                <p className="text-xs text-text-tertiary">
                  {t("app-projects-backup-dialogs.backup-dialog.p.9c0eb089b058")}
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
                          {count(x.files, t("app-projects-backup-dialogs.backup-dialog.count.a595af30cbeb"), t("app-projects-backup-dialogs.backup-dialog.count.642b56fb7a1c"))} ·{" "}
                          {formatBytes(x.bytes)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {off.size > 0 ? (
                <p className="text-[11px] text-text-tertiary">
                  {t("app-projects-backup-dialogs.backup-dialog.p.e140409fb7be")}
                </p>
              ) : null}
            </section>
            <div className="flex flex-wrap items-center gap-2">
              <Button data-testid="backup-download" disabled={busy || tooBig} onClick={() => void download()}>
                {busy ? <Loader2 className="animate-spin" /> : <DatabaseBackup />}
                {t("app-projects-backup-dialogs.backup-dialog.button.9066761217e2")} ({formatBytes(bytes)})
              </Button>
              {tooBig ? (
                <span className="text-[11px] text-status-danger">
                  Over {formatBytes(limit)} –{" "}
                  {t("app-projects-backup-dialogs.backup-dialog.span.be644c34942a")}
                  {hasPicker
                    ? ""
                    : t("app-projects-backup-dialogs.backup-dialog.span.ae754690ed9e")}
                </span>
              ) : null}
              {busy ? (
                <Button variant="ghost" onClick={() => abort.current?.abort()}>
                  {t("app-projects-backup-dialogs.backup-dialog.button.673b03e714f2")}
                </Button>
              ) : null}
            </div>
            {progress && progress.totalFiles > 0 ? (
              <div className="flex flex-col gap-1" aria-live="polite">
                <Bar value={progress.bytes} total={progress.totalBytes} />
                <span className="text-[11px] text-text-tertiary">
                  {progress.files} {t("app-projects-backup-dialogs.backup-dialog.span.ecb35a1e7664")} {progress.totalFiles} {t("app-projects-backup-dialogs.backup-dialog.span.642b56fb7a1c")} ·{" "}
                  {formatBytes(progress.bytes)} {t("app-projects-backup-dialogs.backup-dialog.span.ecb35a1e7664.2")} {formatBytes(progress.totalBytes)}
                </span>
              </div>
            ) : null}
            <Message m={message} />
            {link ? (
              <p className="text-xs text-text-secondary">
                <a data-testid="backup-link" href={link.url} download={link.name} className="underline underline-offset-2">
                  {t("app-projects-backup-dialogs.backup-dialog.a.bd3f903a223e")}
                </a>{" "}
                {t("app-projects-backup-dialogs.backup-dialog.p.cea5346bf3cb")}
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
        `${String(o.backup.project["name"] ?? t("app-projects-backup-dialogs.pick.string.f0de42118e78"))} ${t("app-projects-backup-dialogs.pick.set-name.3d29a8c95113")}`,
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
        text: t("app-projects-backup-dialogs.text.text.7294fa933471", { value1: String(name.trim()) }),
      });
      onRestored();
    } catch (e) {
      setMessage({
        kind: "error",
        text:
          (e as DOMException).name === "AbortError"
            ? t("app-projects-backup-dialogs.text.text.8fdb69f1fd36", { value1: String(name.trim()) })
            : `${(e as Error).message}${state.current.projectId ? t("app-projects-backup-dialogs.text.text.67da105d8104", { value1: String(name.trim()) }) : ""}`,
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
      <DialogContent uiId="V-075" className="max-w-[540px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{t("app-projects-backup-dialogs.restore-backup-dialog.dialog-title.ee27fd229e81")}</DialogTitle>
          <DialogDescription>
            {t("app-projects-backup-dialogs.restore-backup-dialog.dialog-description.fd56b9b2a3e3")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {!doneId ? (
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              <span className={label}>{t("app-projects-backup-dialogs.restore-backup-dialog.span.e034e3e59109")}</span>
              <input
                type="file"
                accept=".zip,application/zip"
                aria-label={t("app-projects-backup-dialogs.restore-backup-dialog.aria-label.c45eef12c9f1")}
                disabled={running}
                onChange={(e) => void pick(e.target.files?.[0])}
                className="text-xs file:mr-2 file:rounded-sm file:border file:border-border-control file:bg-surface-3 file:px-2 file:py-1 file:text-text-primary"
              />
            </label>
          ) : null}
          {reading ? (
            <p className="flex items-center gap-2 text-xs text-text-tertiary">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
              {t("app-projects-backup-dialogs.restore-backup-dialog.p.b0162457925d")}
            </p>
          ) : null}
          {sum && opened ? (
            <section
              aria-label={t("app-projects-backup-dialogs.restore-backup-dialog.aria-label.21223d9313a0")}
              className="flex flex-col gap-1 rounded-sm border border-border bg-surface-1 p-2 text-xs"
            >
              <p className="font-medium text-text-primary">{sum.name}</p>
              <p className="text-text-tertiary">
                {t("app-projects-backup-dialogs.restore-backup-dialog.p.6919ca2d10bf")} {new Date(sum.createdAt).toLocaleString(locale())}
              </p>
              <p className="text-text-secondary">
                {[
                  plural(sum.scenes, t("app-projects-backup-dialogs.restore-backup-dialog.plural.7bb657a3134c"), t("app-projects-backup-dialogs.restore-backup-dialog.plural.7259382d6098")),
                  plural(
                    sum.blocks,
                    t("app-projects-backup-dialogs.restore-backup-dialog.plural.bfcf43fee1f3"),
                    t("app-projects-backup-dialogs.restore-backup-dialog.plural.81672a85cab5"),
                  ),
                  plural(
                    sum.versions,
                    t("app-projects-backup-dialogs.restore-backup-dialog.plural.2642495fac41"),
                    t("app-projects-backup-dialogs.restore-backup-dialog.plural.7b07049be748"),
                  ),
                  plural(sum.assets, t("app-projects-backup-dialogs.restore-backup-dialog.plural.04f73a80efee"), t("app-projects-backup-dialogs.restore-backup-dialog.plural.db8fecfc7849")),
                  plural(sum.compositions, t("app-projects-backup-dialogs.restore-backup-dialog.plural.11f7ddf52c0c"), t("app-projects-backup-dialogs.restore-backup-dialog.plural.42e6beedbad5")),
                  plural(sum.audioClips, t("app-projects-backup-dialogs.restore-backup-dialog.plural.87954b56a395"), t("app-projects-backup-dialogs.restore-backup-dialog.plural.53c00155edd9")),
                  plural(
                    sum.films,
                    t("app-projects-backup-dialogs.restore-backup-dialog.plural.c810136f38ab"),
                    t("app-projects-backup-dialogs.restore-backup-dialog.plural.9d8051e71119"),
                  ),
                ].join(" · ")}
              </p>
              <p className="text-text-secondary">
                {sum.files} {t("app-projects-backup-dialogs.restore-backup-dialog.p.03b8cc5f3b82")} ({formatBytes(sum.bytes)})
              </p>
              {notIncluded > 0 ? (
                <p className="text-status-uncertain">
                  {notIncluded}{" "}
                  {notIncluded === 1 ? t("app-projects-backup-dialogs.restore-backup-dialog.p.658f66d6507b") : t("app-projects-backup-dialogs.restore-backup-dialog.p.b4e5cc1e8b68")}{" "}
                  {t("app-projects-backup-dialogs.restore-backup-dialog.p.8d1adb1df27b")}
                </p>
              ) : null}
              {opened.missing > 0 ? (
                <p className="text-status-uncertain">
                  {opened.missing} {opened.missing === 1 ? t("app-projects-backup-dialogs.restore-backup-dialog.p.a623110d33d5") : t("app-projects-backup-dialogs.restore-backup-dialog.p.2850a6686f26")}{" "}
                  {t("app-projects-backup-dialogs.restore-backup-dialog.p.61b5f8a874dc")}
                </p>
              ) : null}
            </section>
          ) : null}
          {opened && !doneId ? (
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              <span className={label}>
                {t("app-projects-backup-dialogs.restore-backup-dialog.span.6edbd9149566")}
              </span>
              <Input
                data-testid="restore-name"
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
                  ? t("app-projects-backup-dialogs.restore-backup-dialog.span.88ee4de992f7")
                  : progress.phase === "files"
                    ? t("app-projects-backup-dialogs.restore-backup-dialog.span.f257a1be973b", { files: String(progress.files), totalFiles: String(progress.totalFiles), value3: String(formatBytes(progress.bytes)), value4: String(formatBytes(progress.totalBytes)) })
                    : t("app-projects-backup-dialogs.restore-backup-dialog.span.6860264728c5")}
              </span>
            </div>
          ) : null}
          <Message m={message} />
          <div className="flex flex-wrap items-center gap-2">
            {doneId ? (
              <Button data-testid="restore-done" onClick={() => onOpenProject(doneId)}>
                {t("app-projects-backup-dialogs.restore-backup-dialog.button.e17e2c6431ea")}
              </Button>
            ) : (
              <Button data-testid="restore-run" disabled={!opened || !name.trim() || running} onClick={() => void run()}>
                {running ? <Loader2 className="animate-spin" /> : <ArchiveRestore />}
                {started
                  ? t("app-projects-backup-dialogs.restore-backup-dialog.button.e05ae208c3ef")
                  : t("app-projects-backup-dialogs.restore-backup-dialog.button.bf08d00abc99")}
              </Button>
            )}
            {running && progress?.phase !== "data" ? (
              <Button
                variant="ghost"
                onClick={() => abort.current?.abort()}
                title={t("app-projects-backup-dialogs.restore-backup-dialog.title.550fd57d46a5")}
              >
                {t("app-projects-backup-dialogs.restore-backup-dialog.button.1167cc6f5f1d")}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
