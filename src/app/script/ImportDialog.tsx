/**
 * Importer manus (mandat 4.1–4.3): velg PDF/DOCX/Fountain → forhåndsvisning med usikkerheter → lagre original + scener.
 * Ingen scener opprettes før brukeren har sett forhåndsvisningen. Originalen lagres uendret (mandat 4.2).
 */
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { locale, newId, orderedOccurrences, planImport, planImportNotes, tm, type Command, type ProductionId, type ProjectState } from "@/core";
import { savedTitlePage, titlePageCommand } from "@/core/commands/export-settings";
import {
  SCREENPLAY_ACCEPT,
  contentTypeOf,
  readScreenplayFile,
  sourceStorageKey,
  type ReadScreenplay,
} from "@/engine/import/browser";
import {
  findPreviousImport,
  isImportRegistered,
  registerImportedDocument,
} from "@/adapters/browser/imported-documents";
import { SOURCE_BUCKET, uploadFile } from "@/adapters/browser/storage-files";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/core/i18n/keyed";

type Step =
  | { kind: "choose" }
  | { kind: "reading"; fileName: string }
  | { kind: "preview"; file: File; read: ReadScreenplay; previous: string | null }
  | { kind: "importing"; progress: string }
  | {
      kind: "done";
      scenes: number;
      notes: number;
      notesError: string | null;
      /** Tittelsiden ble lagret for eksporten (KI-20); «truncated» = kortet til lagringsgrensen. */
      titlePage?: "saved" | "truncated" | null;
      /** Tittelsiden kunne ikke lagres (importen er likevel i orden). */
      titlePageError?: string | null;
      /** Originalen ble lagret, men kontrollsummen kunne ikke registreres (REQ-0053). */
      registerError?: string | null;
      /** Prøver registreringen på nytt (samme fil og kontrollsum); gir feilmelding eller null. */
      retryRegister?: () => Promise<string | null>;
      retried?: boolean;
    }
  | { kind: "error"; message: string };

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly projectId: string;
  readonly productionId: string;
  readonly state: ProjectState;
  readonly runAndWait: (
    command: Command,
    label: string,
    group?: string,
  ) => Promise<{ error: string | null; commandId: string | null }>;
  /** Navn som brukes på notater i filen som mangler forfatter. */
  readonly authorName: string;
}

export function ImportDialog({
  open,
  onOpenChange,
  projectId,
  productionId,
  state,
  runAndWait,
  authorName,
}: Props) {
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [retrying, setRetrying] = useState(false);
  const [includeContinuation, setIncludeContinuation] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const existing = orderedOccurrences(state, productionId).length;
  const production = state.productions[productionId];

  // Øker når dialogen lukkes: svar som kommer etterpå, ignoreres
  const session = useRef(0);
  function reset(o: boolean) {
    if (!o && step.kind === "importing") return; // ikke avbryt midt i lagringen
    if (!o) session.current++;
    onOpenChange(o);
    if (!o) setTimeout(() => setStep({ kind: "choose" }), 200);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setStep({ kind: "reading", fileName: file.name });
    try {
      const read = await readScreenplayFile(file);
      let previous: string | null = null;
      const createdAt = await findPreviousImport(projectId, read.sha256);
      if (createdAt) previous = new Date(createdAt).toLocaleDateString(locale());
      setStep({ kind: "preview", file, read, previous });
    } catch (e) {
      setStep({ kind: "error", message: (e as Error).message });
    }
  }

  async function doImport(file: File, read: ReadScreenplay) {
    try {
      setStep({
        kind: "importing",
        progress: t("app-script-import-dialog.progress.progress.5960c4259ef9"),
      });
      const key = sourceStorageKey(projectId, read.sha256, file.name);
      const up = {
        error: await uploadFile(
          SOURCE_BUCKET,
          key,
          new Blob([read.bytes as unknown as ArrayBuffer]),
          { contentType: contentTypeOf(read.format), upsert: false },
        ),
      };
      if (up.error && !/exists|duplicate/i.test(up.error.message)) {
        if (read.format === "fountain" && /mime|type|415/i.test(up.error.message))
          throw new Error(
            t("app-script-import-dialog.do-import.message.7b0cfdb04220", { message: String(up.error.message) }),
          );
        throw new Error(
          t("app-script-import-dialog.do-import.message.7efee5915d7d", { message: String(up.error.message) }),
        );
      }
      setStep({
        kind: "importing",
        progress: t("app-script-import-dialog.progress.progress.0d612b67aac3", { length: String(read.parsed.scenes.length) }),
      });
      const command = planImport(state, read.parsed, {
        productionId: productionId as ProductionId,
        skipContinuation: !includeContinuation,
      });
      // Importen og tittelsiden angres som ett steg (KI-20)
      const group = newId<"command">();
      const hadScenes = existing > 0;
      const res = await runAndWait(command, t("app-script-import-dialog.res.run-and-wait.e7e1b0498f93"), group);
      if (res.error) throw new Error(res.error);
      // Tittelsiden fra filen lagres i eksportinnstillingene (KI-20), så manuseksporten kan bruke den.
      // En tittelside som allerede er satt for produksjonen, overskrives bare når produksjonen var tom.
      let titlePage: "saved" | "truncated" | null = null;
      let titlePageError: string | null = null;
      if (
        read.parsed.titlePage.length > 0 &&
        (!hadScenes || savedTitlePage(state, productionId) === null)
      ) {
        const tp = titlePageCommand(state, productionId, read.parsed.titlePage);
        if (tp) {
          const r = await runAndWait(
            tp.command,
            t("app-script-import-dialog.r.run-and-wait.fc95bbb03fc0"),
            group,
          );
          if (r.error) titlePageError = r.error;
          else titlePage = tp.truncated ? "truncated" : "saved";
        }
      }
      setStep({
        kind: "importing",
        progress: t("app-script-import-dialog.progress.progress.780c1774fe18"),
      });
      const register = async () => ({
        error: await registerImportedDocument({
          projectId,
          productionId,
          storageKey: key,
          fileName: file.name,
          sha256: read.sha256,
          format: read.format,
          pageCount: read.parsed.pageCount,
          byteSize: read.bytes.byteLength,
          language: "nb",
          changeId: res.commandId,
        }),
      });
      const reg = await register();
      const retryRegister = async () => {
        // Kan første forsøk ha lykkes uten at svaret kom fram? Registreringer kan ikke slettes, så sjekk først
        if (await isImportRegistered(projectId, read.sha256, res.commandId)) return null;
        const r = await register();
        return r.error ? r.error.message : null;
      };
      // Brukeren skal vite det hvis originalen ikke ble registrert (REQ-0053, DEC-0074)
      const registerError = reg.error ? reg.error.message : null;
      // Notater i filen (Word-kommentarer / PDF-merknader) gjenopprettes på samme sted (REQ-0540)
      let notes = 0;
      let notesError: string | null = null;
      const planned = planImportNotes(read.parsed, command, read.notes, {
        skipContinuation: !includeContinuation,
        fallbackAuthor: authorName,
      });
      if (planned.length) {
        setStep({
          kind: "importing",
          progress: t("app-script-import-dialog.progress.progress.6074fa6e50fc", { length: String(planned.length) }),
        });
        // I biter, så ett stort dokument ikke overskrider grensen per endring
        for (let i = 0; i < planned.length && !notesError; i += 1000) {
          const part = planned.slice(i, i + 1000);
          const r = await runAndWait(
            { type: "AddAnnotations", annotations: part, imported: true },
            t("app-script-import-dialog.r.run-and-wait.0827fde3f1a7", { length: String(part.length) }),
          );
          if (r.error) notesError = r.error;
          else notes += part.length;
        }
      }
      setStep({
        kind: "done",
        scenes: command.scenes.length,
        notes,
        notesError,
        registerError,
        retryRegister,
        titlePage,
        titlePageError,
      });
    } catch (e) {
      setStep({ kind: "error", message: (e as Error).message });
    }
  }

  const productionName = production?.name ?? t("app-script-import-dialog.production-name.message.db14a5dcf3fb");

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="max-w-[640px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{t("app-script-import-dialog.import-dialog.dialog-title.93cd6d89e3a4")}</DialogTitle>
          <DialogDescription>
            {t("app-script-import-dialog.import-dialog.dialog-description.c95508206c3a")}{" "}
            «{productionName}»
            {existing > 0
              ? t("app-script-import-dialog.import-dialog.dialog-description.337b3b78113c", { existing: String(existing) })
              : ""}
            {t("app-script-import-dialog.import-dialog.dialog-description.ef2ed7648511")}
          </DialogDescription>
        </DialogHeader>

        {step.kind === "choose" ? (
          <div
            className="flex flex-col items-center gap-3 border border-dashed border-border-strong p-8 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0]);
            }}
          >
            <FileUp className="size-6 text-text-tertiary" aria-hidden />
            <p className="text-[13px] text-text-secondary">
              {t("app-script-import-dialog.import-dialog.p.e24ea975c4e3")}
            </p>
            <Button onClick={() => inputRef.current?.click()}>
              {t("app-script-import-dialog.import-dialog.button.7dc8880ce838")}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={SCREENPLAY_ACCEPT}
              className="sr-only"
              aria-label={t("app-script-import-dialog.import-dialog.aria-label.863961f76e60")}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </div>
        ) : null}

        {step.kind === "reading" ? (
          <p className="flex items-center gap-2 py-6 text-[13px] text-text-secondary" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("app-script-import-dialog.import-dialog.p.1317e7c11eb1", { fileName: String(step.fileName) })}
          </p>
        ) : null}

        {step.kind === "preview" ? (
          <Preview
            step={step}
            includeContinuation={includeContinuation}
            setIncludeContinuation={setIncludeContinuation}
          />
        ) : null}

        {step.kind === "importing" ? (
          <p className="flex items-center gap-2 py-6 text-[13px] text-text-secondary" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {step.progress}
          </p>
        ) : null}

        {step.kind === "done" ? (
          <p className="flex items-center gap-2 py-6 text-[13px] text-text-primary" role="status">
            <CheckCircle2 className="size-4 text-status-success" aria-hidden />
            {step.scenes} {t("app-script-import-dialog.import-dialog.p.ec871e78dfae")}
            {step.notes ? t("app-script-import-dialog.import-dialog.p.2f2c8d7d6c45", { notes: String(step.notes) }) : ""}
            {t("app-script-import-dialog.import-dialog.p.81dc994ccac3")}
          </p>
        ) : null}
        {step.kind === "done" && step.registerError ? (
          <p role="alert" className="text-xs text-status-uncertain">
            {t("app-script-import-dialog.import-dialog.p.55bb6af99877", { value1: String(tm(step.registerError)) })}
            {step.retryRegister ? (
              <Button
                size="sm"
                variant="secondary"
                className="ml-2 mt-1"
                disabled={retrying}
                onClick={async () => {
                  const mine = session.current;
                  setRetrying(true);
                  const err = await step.retryRegister!().catch((e: Error) => e.message);
                  setRetrying(false);
                  if (session.current !== mine) return;
                  setStep({ ...step, registerError: err, retried: true });
                }}
              >
                {retrying ? <Loader2 className="animate-spin" /> : null}{" "}
                {t("app-script-import-dialog.import-dialog.button.9df095e2b803")}
              </Button>
            ) : null}
          </p>
        ) : null}
        {step.kind === "done" && step.retried && step.registerError === null ? (
          <p role="status" className="text-xs text-text-secondary">
            {t("app-script-import-dialog.import-dialog.p.167095065673")}
          </p>
        ) : null}
        {step.kind === "done" && step.titlePage === "saved" ? (
          <p role="status" className="text-xs text-text-secondary">
            {t("app-script-import-dialog.import-dialog.p.6adda150e215")}
          </p>
        ) : null}
        {step.kind === "done" && step.titlePage === "truncated" ? (
          <p role="alert" className="text-xs text-status-uncertain">
            {t("app-script-import-dialog.import-dialog.p.a1b4bf968f16")}
          </p>
        ) : null}
        {step.kind === "done" && step.titlePageError ? (
          <p role="alert" className="text-xs text-status-uncertain">
            {t("app-script-import-dialog.import-dialog.p.47295aafdb5f", { value1: String(tm(step.titlePageError)) })}
          </p>
        ) : null}
        {step.kind === "done" && step.notesError ? (
          <p role="alert" className="text-xs text-status-danger">
            {t("app-script-import-dialog.import-dialog.p.08e20e3a9a6e", { value1: String(tm(step.notesError)) })}
          </p>
        ) : null}

        {step.kind === "error" ? (
          <p role="alert" className="flex items-start gap-2 py-4 text-[13px] text-status-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {tm(step.message)}
          </p>
        ) : null}

        <DialogFooter>
          {step.kind === "preview" ? (
            <>
              <Button variant="ghost" onClick={() => setStep({ kind: "choose" })}>
                {t("app-script-import-dialog.import-dialog.button.9697f3b03d0e")}
              </Button>
              <Button onClick={() => void doImport(step.file, step.read)}>
                {t("app-script-import-dialog.import-dialog.button.ab8bf2ee3d96")}{" "}
                {
                  step.read.parsed.scenes.filter((s) => includeContinuation || !s.isContinuation)
                    .length
                }{" "}
                {t("app-script-import-dialog.import-dialog.button.ec871e78dfae")}
              </Button>
            </>
          ) : step.kind === "error" ? (
            <Button variant="secondary" onClick={() => setStep({ kind: "choose" })}>
              {t("app-script-import-dialog.import-dialog.button.eb2ecf1aa4cb")}
            </Button>
          ) : step.kind === "done" ? (
            <Button onClick={() => reset(false)}>{t("app-script-import-dialog.import-dialog.button.e00e46e21cdd")}</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Preview({
  step,
  includeContinuation,
  setIncludeContinuation,
}: {
  step: Extract<Step, { kind: "preview" }>;
  includeContinuation: boolean;
  setIncludeContinuation: (v: boolean) => void;
}) {
  const p = step.read.parsed;
  const hasContinuation = p.scenes.some((s) => s.isContinuation);
  const uncertainScenes = p.scenes.filter((s) => s.warnings.length > 0 || s.number === null).length;
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <dl className="grid grid-cols-[1fr_auto] gap-y-1 border border-border bg-surface-1 p-3">
        <dt className="text-text-secondary">{t("app-script-import-dialog.preview.dt.be567fb43bfb")}</dt>
        <dd className="truncate text-right text-text-primary">{step.file.name}</dd>
        <dt className="text-text-secondary">{t("app-script-import-dialog.preview.dt.15766f518d67")}</dt>
        <dd className="tabular text-right text-text-primary">
          {p.format === "fountain"
            ? t("app-script-import-dialog.preview.dd.a856071b7964", { pageCount: String(p.pageCount) })
            : p.pageCount}
        </dd>
        <dt className="text-text-secondary">{t("app-script-import-dialog.preview.dt.b589862613ec")}</dt>
        <dd className="tabular text-right text-text-primary">
          {p.scenes.length} ({p.stats.numbered} {t("app-script-import-dialog.preview.dd.23aabba27c51")}, {p.stats.unnumbered}{" "}
          {t("app-script-import-dialog.preview.dd.a086c349debf")})
        </dd>
        {step.read.notes.length ? (
          <>
            <dt className="text-text-secondary">{t("app-script-import-dialog.preview.dt.ba5e2a3a70eb")}</dt>
            <dd className="tabular text-right text-text-primary">
              {step.read.notes.length}{" "}
              {t("app-script-import-dialog.preview.dd.5803635c5ff5")}
            </dd>
          </>
        ) : null}
        <dt className="text-text-secondary">
          {t("app-script-import-dialog.preview.dt.ac937fe41f6a")}
        </dt>
        <dd className="tabular text-right text-text-primary">
          {p.stats.uncertain} {t("app-script-import-dialog.preview.dd.7d9b7e84a91c")} · {uncertainScenes}{" "}
          {t("app-script-import-dialog.preview.dd.3a9c1e80e215")}
        </dd>
        {p.titlePage.length ? (
          <>
            <dt className="text-text-secondary">{t("app-script-import-dialog.preview.dt.0cf85e2f6dc3")}</dt>
            <dd className="truncate text-right text-text-primary">
              {p.titlePage.slice(0, 2).join(" · ")}
            </dd>
          </>
        ) : null}
      </dl>
      {step.previous ? (
        <p className="flex items-start gap-2 text-xs text-status-uncertain">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          {t("app-script-import-dialog.preview.p.6133ac56207c", { previous: String(step.previous) })}
        </p>
      ) : null}
      {p.stats.duplicateNumbers.length ? (
        <p className="flex items-start gap-2 text-xs text-status-uncertain">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          {t("app-script-import-dialog.preview.p.32489fdb4259", { value1: String(p.stats.duplicateNumbers.join(", ")) })}
        </p>
      ) : null}
      {hasContinuation ? (
        <label className="flex items-start gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={includeContinuation}
            onChange={(e) => setIncludeContinuation(e.target.checked)}
            className="mt-0.5"
          />
          {t("app-script-import-dialog.preview.label.dcb383de81cf")}
        </label>
      ) : null}
      {p.warnings.length ? (
        <details className="text-xs text-text-secondary">
          <summary className="cursor-pointer">
            {t("app-script-import-dialog.preview.summary.bd90e385254d")} ({p.warnings.length})
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {p.warnings.slice(0, 20).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="max-h-48 overflow-y-auto border border-border bg-surface-1">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-2 text-left text-text-tertiary">
            <tr>
              <th className="w-12 px-2 py-1 font-medium">{t("app-script-import-dialog.preview.th.c8a03fb8d166")}</th>
              <th className="px-2 py-1 font-medium">{t("app-script-import-dialog.preview.th.488fdc54e745")}</th>
              <th className="w-12 px-2 py-1 text-right font-medium">{t("app-script-import-dialog.preview.th.76710db68cd7")}</th>
            </tr>
          </thead>
          <tbody>
            {p.scenes.map((s, i) => (
              <tr key={i} className="border-t border-border">
                <td className="tabular px-2 py-0.5 font-mono text-text-secondary">
                  {s.number ?? "–"}
                </td>
                <td className="truncate px-2 py-0.5 text-text-primary">
                  {s.isContinuation ? (
                    <em className="text-text-tertiary">
                      {t("app-script-import-dialog.preview.em.782df97d66a6")}
                    </em>
                  ) : (
                    s.rawHeading
                  )}
                  {s.warnings.length ? (
                    <AlertTriangle
                      className="ml-1 inline size-3 text-status-uncertain"
                      aria-label={t("app-script-import-dialog.preview.aria-label.7d31b64b3fcd")}
                    />
                  ) : null}
                </td>
                <td className="tabular px-2 py-0.5 text-right text-text-secondary">
                  {s.source.page}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
