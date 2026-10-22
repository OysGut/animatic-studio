import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/app/auth/use-session";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { LanguageSwitch, useLanguage } from "@/app/i18n/language";
import { canEdit, useMembers, useProjectState } from "@/app/project/use-project";
import { useCommands } from "@/app/project/use-commands";
import { FILM_ACCEPT, uploadFilm } from "@/app/assembly/film-import";
import { prepareAeFilm } from "@/app/assembly/ptg-import";
import { parsePtgImport, type PtgImportRef } from "@/core/interchange/titlecard";
import { t } from "@/core/i18n/keyed";

/**
 * PTG3b (B-115): QR-koden på tittelkortet i After Effects-pakken. Krever innlogging og tilgang til prosjektet;
 * ukjent lenke eller manglende tilgang gir samme nøytrale melding som riggens QR-koder. Filmen blir en ny
 * versjon (take) av sceneforekomsten og tas ikke i bruk automatisk.
 */
export const Route = createFileRoute("/ptg/i")({
  head: () => ({ meta: [
    { title: t("ptg3b.route-title") },
    { name: "description", content: t("ptg3b.route-description") },
    { property: "og:title", content: t("ptg3b.route-title") }, // i18n-ignore: metakode
    { property: "og:description", content: t("ptg3b.route-description") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
    { name: "robots", content: "noindex, nofollow" }, // i18n-ignore: metakode
    { name: "referrer", content: "no-referrer" }, // i18n-ignore: metakode
  ] }),
  validateSearch: (s: Record<string, unknown>): { p?: string; o?: string; n?: string; f?: number } => {
    const r = parsePtgImport(s);
    return r ? { p: r.projectId, o: r.occurrenceId, n: r.name, f: r.lengthFrames } : {};
  },
  component: PtgImportRoute,
});

function Neutral() {
  return <p role="alert" data-testid="ptg-import-failed" className="text-[13px] text-text-secondary">{t("print-job.code-unknown")}</p>;
}

function PtgImportRoute() {
  useLanguage(); // ML2a
  const s = Route.useSearch();
  const session = useSession();
  const ref = s.p && s.o && s.n && s.f !== undefined ? { projectId: s.p, occurrenceId: s.o, name: s.n, lengthFrames: s.f } : null;
  if (session.status === "loading") return <div className="min-h-screen bg-bg-app" aria-busy />;
  if (session.status === "signed-out") return <AuthScreen />;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-app px-4">
      <LanguageSwitch compact />
      {ref ? <ImportPanel r={ref} userId={session.session.user.id} /> : <Neutral />}
    </main>
  );
}

function ImportPanel({ r, userId }: { r: PtgImportRef; userId: string }) {
  const state = useProjectState(r.projectId);
  const members = useMembers(r.projectId);
  const editable = canEdit(members.data?.find((m) => m.user_id === userId)?.role);
  const cmds = useCommands(r.projectId, userId, editable, undefined, false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ trimmed: boolean; mismatch: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (state.isLoading || members.isLoading) return <p role="status" className="text-[13px] text-text-secondary">{t("print-job.code-opening")}</p>;
  const data = state.data;
  if (!data || state.isError || !data.occurrences[r.occurrenceId] || !editable) return <Neutral />;
  const fps = data.project.fps;

  async function onFile(file: File) {
    setBusy(true); setError(null); setResult(null);
    try {
      const prepared = await prepareAeFilm(file, r.lengthFrames, fps);
      const f = await uploadFilm(r.projectId, prepared.file, fps);
      const res = await cmds.runAndWait({
        type: "AddTake", takeId: f.takeId as never, occurrenceId: r.occurrenceId as never, segmentId: null,
        kind: "imported_film", status: "reference", durationFrames: f.durationFrames, mediaRef: f.mediaRef, media: f.media,
      }, `${t("ptg3b.import-heading")} «${r.name}»`);
      if (res.error) throw new Error(res.error);
      setResult({ trimmed: prepared.decision.trimSeconds > 0, mismatch: prepared.decision.lengthMismatch ? prepared.decision.frames : null });
    } catch (e) {
      setError(t("ptg3b.import-failed", { value1: (e as Error).message || "?" }));
    } finally { setBusy(false); }
  }

  return (
    <section data-testid="ptg-import" className="w-full max-w-md rounded-md border border-border bg-surface-2 p-5">
      <h1 className="mb-1 text-base font-semibold text-text-primary">{t("ptg3b.import-heading")}</h1>
      <p data-testid="ptg-import-shot" className="mb-1 font-mono text-xs text-text-primary">{t("ptg3b.import-shot", { value1: r.name, value2: String(r.lengthFrames) })}</p>
      <p className="mb-4 text-xs text-text-secondary">{t("ptg3b.import-hint")}</p>
      <label className="inline-flex">
        <input data-testid="ptg-import-file" type="file" accept={FILM_ACCEPT} className="sr-only" disabled={busy}
          onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void onFile(file); }} />
        <Button asChild size="sm" variant="outline" disabled={busy}><span><Upload />{busy ? t("ptg3b.import-working") : t("ptg3b.import-choose")}</span></Button>
      </label>
      {result ? <div data-testid="ptg-import-done" role="status" className="mt-3 space-y-1 text-xs text-text-primary">
        <p>{t("ptg3b.import-done")}</p>
        {result.trimmed ? <p data-testid="ptg-import-trimmed">{t("ptg3b.import-trimmed")}</p> : null}
        {result.mismatch !== null ? <p data-testid="ptg-import-mismatch" className="text-status-discrepancy">{t("ptg3b.import-mismatch", { value1: String(result.mismatch), value2: String(r.lengthFrames) })}</p> : null}
        <Link to="/prosjekt/$projectId/montering" params={{ projectId: r.projectId }} search={{ scene: r.occurrenceId }} className="underline">{t("ptg3b.import-open-assembly")}</Link>
      </div> : null}
      {error ? <p role="alert" className="mt-3 text-xs text-status-danger">{error}</p> : null}
    </section>
  );
}
