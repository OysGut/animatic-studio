/**
 * Importer manus (mandat 4.1–4.3): velg PDF/DOCX/Fountain → forhåndsvisning med usikkerheter → lagre original + scener.
 * Ingen scener opprettes før brukeren har sett forhåndsvisningen. Originalen lagres uendret (mandat 4.2).
 */
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import {
  L,
  locale,
  newId,
  orderedOccurrences,
  planImport,
  planImportNotes,
  tm,
  type Command,
  type ProductionId,
  type ProjectState,
} from "@/core";
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
        progress: L("Lagrer originalfilen …", "Saving the original file …"),
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
            L(
              `Originalfilen kunne ikke lagres: lagringen godtar ennå ikke Fountain-filer (ren tekst). Importen er stoppet – ingenting er endret. Databasen må oppdateres så «sources» tillater text/plain (${up.error.message}).`,
              `The original file could not be saved: the storage does not yet accept Fountain files (plain text). The import has stopped – nothing has changed. The database must be updated so “sources” allows text/plain (${up.error.message}).`,
            ),
          );
        throw new Error(
          L(
            `Originalfilen kunne ikke lagres (${up.error.message}). Importen er stoppet – ingenting er endret. Er databasemigrasjon 0002 kjørt?`,
            `The original file could not be saved (${up.error.message}). The import has stopped – nothing has changed. Has database migration 0002 been run?`,
          ),
        );
      }
      setStep({
        kind: "importing",
        progress: L(
          `Oppretter ${read.parsed.scenes.length} scener …`,
          `Creating ${read.parsed.scenes.length} scenes …`,
        ),
      });
      const command = planImport(state, read.parsed, {
        productionId: productionId as ProductionId,
        skipContinuation: !includeContinuation,
      });
      // Importen og tittelsiden angres som ett steg (KI-20)
      const group = newId<"command">();
      const hadScenes = existing > 0;
      const res = await runAndWait(command, L("Import av manus", "Import script"), group);
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
            L("Tittelside fra importen", "Title page from the import"),
            group,
          );
          if (r.error) titlePageError = r.error;
          else titlePage = tp.truncated ? "truncated" : "saved";
        }
      }
      setStep({
        kind: "importing",
        progress: L("Registrerer originalen …", "Registering the original …"),
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
          progress: L(`Legger inn ${planned.length} notater …`, `Adding ${planned.length} notes …`),
        });
        // I biter, så ett stort dokument ikke overskrider grensen per endring
        for (let i = 0; i < planned.length && !notesError; i += 1000) {
          const part = planned.slice(i, i + 1000);
          const r = await runAndWait(
            { type: "AddAnnotations", annotations: part, imported: true },
            L(`${part.length} notater fra importen`, `${part.length} notes from the import`),
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

  const productionName = production?.name ?? L("produksjonen", "the production");

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="max-w-[640px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{L("Importer manus", "Import script")}</DialogTitle>
          <DialogDescription>
            {L(
              "PDF (f.eks. fra Final Draft), Word (.docx) eller Fountain (.fountain). Scenene legges i",
              "PDF (e.g. from Final Draft), Word (.docx) or Fountain (.fountain). The scenes are added to",
            )}{" "}
            «{productionName}»
            {existing > 0
              ? L(
                  ` etter de ${existing} scenene som finnes`,
                  ` after the ${existing} existing scenes`,
                )
              : ""}
            {L(". Originalfilen lagres uendret.", ". The original file is saved unchanged.")}
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
              {L("Slipp filen her, eller", "Drop the file here, or")}
            </p>
            <Button onClick={() => inputRef.current?.click()}>
              {L("Velg fil …", "Choose file …")}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={SCREENPLAY_ACCEPT}
              className="sr-only"
              aria-label={L("Velg manusfil", "Choose script file")}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </div>
        ) : null}

        {step.kind === "reading" ? (
          <p className="flex items-center gap-2 py-6 text-[13px] text-text-secondary" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {L(`Leser «${step.fileName}» …`, `Reading “${step.fileName}” …`)}
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
            {step.scenes} {L("scener", "scenes")}
            {step.notes ? L(` og ${step.notes} notater`, ` and ${step.notes} notes`) : ""}
            {L(
              " er importert. Hele importen kan angres med ⌘/Ctrl + Z.",
              " have been imported. The whole import can be undone with ⌘/Ctrl + Z.",
            )}
          </p>
        ) : null}
        {step.kind === "done" && step.registerError ? (
          <p role="alert" className="text-xs text-status-uncertain">
            {L(
              `Manuset er importert, men originalfilen ble ikke registrert med kontrollsum (${tm(step.registerError)}). Manuset er i orden og kan brukes. Originalen ligger lagret, men kan ikke kontrolleres eller lastes ned fra versjonene. Ikke importer på nytt (da blir scenene dobbelt) – prøv registreringen igjen, eller gi beskjed, så kan den gjøres for hånd.`,
              `The script is imported, but the original file was not registered with a checksum (${tm(step.registerError)}). The script is fine and can be used. The original is stored, but it cannot be verified or downloaded from the versions. Do not import again (then the scenes would be doubled) – try the registration again, or let us know so it can be done by hand.`,
            )}
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
                {L("Prøv registreringen igjen", "Try the registration again")}
              </Button>
            ) : null}
          </p>
        ) : null}
        {step.kind === "done" && step.retried && step.registerError === null ? (
          <p role="status" className="text-xs text-text-secondary">
            {L(
              "Originalen er registrert med kontrollsum.",
              "The original is registered with a checksum.",
            )}
          </p>
        ) : null}
        {step.kind === "done" && step.titlePage === "saved" ? (
          <p role="status" className="text-xs text-text-secondary">
            {L(
              "Tittelsiden fra filen er lagret og foreslås når manuset eksporteres.",
              "The title page from the file is saved and suggested when the script is exported.",
            )}
          </p>
        ) : null}
        {step.kind === "done" && step.titlePage === "truncated" ? (
          <p role="alert" className="text-xs text-status-uncertain">
            {L(
              "Tittelsiden fra filen er lagret, men den var for lang og er kortet ned. Se over den når du eksporterer manuset.",
              "The title page from the file is saved, but it was too long and has been shortened. Check it when you export the script.",
            )}
          </p>
        ) : null}
        {step.kind === "done" && step.titlePageError ? (
          <p role="alert" className="text-xs text-status-uncertain">
            {L(
              `Tittelsiden fra filen ble ikke lagret (${tm(step.titlePageError)}). Manuset er importert; skriv tittelsiden i eksportdialogen.`,
              `The title page from the file was not saved (${tm(step.titlePageError)}). The script is imported; write the title page in the export dialog.`,
            )}
          </p>
        ) : null}
        {step.kind === "done" && step.notesError ? (
          <p role="alert" className="text-xs text-status-danger">
            {L(
              `Notatene i filen ble ikke lagret: ${tm(step.notesError)}`,
              `The notes in the file were not saved: ${tm(step.notesError)}`,
            )}
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
                {L("Velg en annen fil", "Choose another file")}
              </Button>
              <Button onClick={() => void doImport(step.file, step.read)}>
                {L("Importer", "Import")}{" "}
                {
                  step.read.parsed.scenes.filter((s) => includeContinuation || !s.isContinuation)
                    .length
                }{" "}
                {L("scener", "scenes")}
              </Button>
            </>
          ) : step.kind === "error" ? (
            <Button variant="secondary" onClick={() => setStep({ kind: "choose" })}>
              {L("Prøv igjen", "Try again")}
            </Button>
          ) : step.kind === "done" ? (
            <Button onClick={() => reset(false)}>{L("Ferdig", "Done")}</Button>
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
        <dt className="text-text-secondary">{L("Fil", "File")}</dt>
        <dd className="truncate text-right text-text-primary">{step.file.name}</dd>
        <dt className="text-text-secondary">{L("Sider", "Pages")}</dt>
        <dd className="tabular text-right text-text-primary">
          {p.format === "fountain"
            ? L(
                `ca. ${p.pageCount} (beregnet – Fountain har ikke faste sider)`,
                `about ${p.pageCount} (estimated – Fountain has no fixed pages)`,
              )
            : p.pageCount}
        </dd>
        <dt className="text-text-secondary">{L("Scener", "Scenes")}</dt>
        <dd className="tabular text-right text-text-primary">
          {p.scenes.length} ({p.stats.numbered} {L("med nummer", "numbered")}, {p.stats.unnumbered}{" "}
          {L("uten", "unnumbered")})
        </dd>
        {step.read.notes.length ? (
          <>
            <dt className="text-text-secondary">{L("Notater i filen", "Notes in the file")}</dt>
            <dd className="tabular text-right text-text-primary">
              {step.read.notes.length}{" "}
              {L(
                "(legges inn på samme sted, med navn og tidspunkt)",
                "(added in the same place, with name and time)",
              )}
            </dd>
          </>
        ) : null}
        <dt className="text-text-secondary">
          {L("Usikre tolkninger", "Uncertain interpretations")}
        </dt>
        <dd className="tabular text-right text-text-primary">
          {p.stats.uncertain} {L("elementer", "items")} · {uncertainScenes}{" "}
          {L("overskrifter", "headings")}
        </dd>
        {p.titlePage.length ? (
          <>
            <dt className="text-text-secondary">{L("Tittelside", "Title page")}</dt>
            <dd className="truncate text-right text-text-primary">
              {p.titlePage.slice(0, 2).join(" · ")}
            </dd>
          </>
        ) : null}
      </dl>
      {step.previous ? (
        <p className="flex items-start gap-2 text-xs text-status-uncertain">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          {L(
            `Denne filen ble importert ${step.previous}. Importerer du igjen, får du scenene to ganger.`,
            `This file was imported ${step.previous}. If you import it again, you get the scenes twice.`,
          )}
        </p>
      ) : null}
      {p.stats.duplicateNumbers.length ? (
        <p className="flex items-start gap-2 text-xs text-status-uncertain">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          {L(
            `Scenenumre som står flere ganger: ${p.stats.duplicateNumbers.join(", ")}. Scenene importeres hver for seg.`,
            `Scene numbers that appear more than once: ${p.stats.duplicateNumbers.join(", ")}. The scenes are imported one by one.`,
          )}
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
          {L(
            "Manuset starter midt i en scene. Ta med teksten før første sceneoverskrift som egen scene (uten nummer).",
            "The script starts in the middle of a scene. Include the text before the first scene heading as a scene of its own (without a number).",
          )}
        </label>
      ) : null}
      {p.warnings.length ? (
        <details className="text-xs text-text-secondary">
          <summary className="cursor-pointer">
            {L("Merknader", "Notes")} ({p.warnings.length})
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
              <th className="w-12 px-2 py-1 font-medium">{L("Nr.", "No.")}</th>
              <th className="px-2 py-1 font-medium">{L("Overskrift", "Heading")}</th>
              <th className="w-12 px-2 py-1 text-right font-medium">{L("Side", "Page")}</th>
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
                      {L("Fortsettelse fra forrige del", "Continuation from the previous part")}
                    </em>
                  ) : (
                    s.rawHeading
                  )}
                  {s.warnings.length ? (
                    <AlertTriangle
                      className="ml-1 inline size-3 text-status-uncertain"
                      aria-label={L("Usikker", "Uncertain")}
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
