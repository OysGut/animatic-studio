import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Camera, FileText, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
const PROJECT_CONTEXT = { type: "project" } as const;
import { mainProduction, orderedOccurrences } from "@/core";
import { createInvitation } from "@/adapters/browser/members";
import { DurationOverview } from "./DurationOverview";
import { canEdit, useMembers, useProfiles, useProjectState } from "@/app/project/use-project";
import { ProjectFormat } from "./ProjectFormat";
import { AiPanel } from "@/app/ai/AiPanel";
import { ProductionList } from "./ProductionList";
import { MembersSection } from "./MembersSection";
import { StyleGuideSection } from "./StyleGuideSection";
import { ProjectTodoBox } from "./ProjectTodoBox";
import { NoteFlagsOverview } from "./NoteFlagsOverview";
import { QualityProfilesSection } from "./QualityProfilesSection";
import { MobileImportDialog } from "@/app/mobile/MobileImportDialog";
import { StorageSection } from "./StorageSection";
import { ProjectCostSection } from "@/app/account/ProjectCostSection";
import { ContinuityAnalysisPanel } from "@/app/continuity/ContinuityAnalysisPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState, LoadingState } from "@/app/shell/screen-states";
import { t } from "@/core/i18n/keyed";

export function ProjectOverview({ projectId, userId }: { projectId: string; userId: string }) {
  const state = useProjectState(projectId);
  const members = useMembers(projectId);
  const profiles = useProfiles((members.data ?? []).map((m) => m.user_id));
  const myRole = members.data?.find((m) => m.user_id === userId)?.role;

  if (state.isLoading)
    return (
      <div className="mx-auto w-full max-w-[960px] px-6 py-8">
        <LoadingState label={t("app-projects-project-overview.project-overview.label.1892d5b35b15")} rows={4} />
      </div>
    );
  if (state.isError || !state.data)
    return (
      <div className="mx-auto w-full max-w-[960px] px-6 py-8">
        <ErrorState
          message={t("app-projects-project-overview.project-overview.message.e8d82c6ba27d")}
          detail={
            state.error ? (
              <span className="font-mono">
                {t("app-projects-project-overview.project-overview.span.0b610697a8a4")}{" "}
                {state.error.message}
              </span>
            ) : null
          }
          onRetry={() => void state.refetch()}
        />
      </div>
    );
  const s = state.data;
  const main = mainProduction(s);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[960px] px-6 py-8">
          <div className="flex items-start gap-3">
            <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight text-text-primary">
              {s.project.name}
            </h1>
            {canEdit(myRole) ? <ProjectMobileImport projectId={projectId} /> : null}
          </div>
          <p className="mt-1 text-[13px] text-text-secondary">
            {t("app-projects-project-overview.project-overview.p.43a72081e427")}{" "}
            <span className="tabular">
              {(s.project.fps.num / s.project.fps.den).toFixed(s.project.fps.den === 1 ? 0 : 3)}
            </span>{" "}
            {t("app-projects-project-overview.project-overview.p.304d29fc3cab")}
          </p>

          <ProjectFormat
            state={s}
            projectId={projectId}
            userId={userId}
            editable={canEdit(myRole)}
          />

          <ProjectTodoBox
            state={s}
            projectId={projectId}
            userId={userId}
            myName={profiles.data?.[userId]?.display_name ?? ""}
            editable={canEdit(myRole)}
          />

          <NoteFlagsOverview state={s} projectId={projectId} names={Object.fromEntries(Object.entries(profiles.data ?? {}).map(([id, p]) => [id, p?.display_name ?? ""]))} />

          {/* Kvalitetsprofiler (M8, REQ-0854–0862) */}
          <QualityProfilesSection state={s} projectId={projectId} userId={userId} editable={canEdit(myRole)} />

          <section aria-labelledby="prod-title" className="mt-8">
            <h2 id="prod-title" className="mb-2 text-base font-semibold text-text-primary">
              {t("app-projects-project-overview.project-overview.h2.c605146a3256")}
            </h2>
            <ProductionList
              state={s}
              projectId={projectId}
              userId={userId}
              editable={canEdit(myRole)}
            />
            {main && orderedOccurrences(s, main.id).length === 0 ? (
              <div className="mt-3 flex items-center gap-3 text-xs text-text-tertiary">
                <span>
                  {t("app-projects-project-overview.project-overview.span.a041cc091ba2")}
                </span>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/prosjekt/$projectId/manus" params={{ projectId }}>
                    <FileText />
                    {t("app-projects-project-overview.project-overview.link.d84287021552")}
                  </Link>
                </Button>
              </div>
            ) : null}
          </section>

          {main && orderedOccurrences(s, main.id).length > 0 ? (
            <ContinuityAnalysisPanel
              state={s}
              projectId={projectId}
              productionId={main.id}
              userId={userId}
              editable={canEdit(myRole)}
            />
          ) : null}

          <DurationOverview
            state={s}
            projectId={projectId}
            userId={userId}
            editable={canEdit(myRole)}
          />

          <StyleGuideSection
            state={s}
            projectId={projectId}
            userId={userId}
            editable={canEdit(myRole)}
          />

          <StorageSection state={s} projectId={projectId} />

          <AiPanel
            state={s}
            projectId={projectId}
            userId={userId}
            isOwner={myRole === "owner"}
            editable={canEdit(myRole)}
          />

          {canEdit(myRole) ? (
            <ProjectCostSection
              state={s}
              projectId={projectId}
              isOwner={myRole === "owner"}
              generatedBy={profiles.data?.[userId]?.display_name ?? ""}
            />
          ) : null}

          <section aria-labelledby="members-title" className="mt-10">
            <h2 id="members-title" className="mb-2 text-base font-semibold text-text-primary">
              {t("app-projects-project-overview.project-overview.h2.935722885715")}
            </h2>
            <MembersSection
              projectId={projectId}
              userId={userId}
              members={members.data ?? []}
              profiles={profiles.data}
              isOwner={myRole === "owner"}
            />
            {myRole === "owner" ? <InviteForm projectId={projectId} /> : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function InviteForm({ projectId }: { projectId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [link, setLink] = useState<string | null>(null);
  const qc = useQueryClient();
  const invite = useMutation({
    mutationFn: () => createInvitation(projectId, email, role),
    onSuccess: (token) => {
      setLink(`${window.location.origin}/invitasjon?token=${encodeURIComponent(token)}`);
      setEmail("");
      // Den nye invitasjonen vises i listen over ventende invitasjoner
      void qc.invalidateQueries({ queryKey: ["project-invitations", projectId] });
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (email.trim()) invite.mutate();
  }
  return (
    <div className="mt-4">
      <form onSubmit={submit} className="relative flex flex-wrap items-center gap-2">
        <label htmlFor="invite-email" className="sr-only">
          {t("app-projects-project-overview.invite-form.label.eae13d71688e")}
        </label>
        <Input
          id="invite-email"
          type="email"
          placeholder={t("app-projects-project-overview.invite-form.placeholder.0051983f3d79")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-8 w-[280px] bg-surface-3"
        />
        <label htmlFor="invite-role" className="sr-only">
          {t("app-projects-project-overview.invite-form.label.efe938ec20e7")}
        </label>
        <select
          id="invite-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-8 rounded-sm border border-input bg-surface-3 px-2 text-[13px] text-text-primary"
        >
          <option value="editor">{t("app-projects-project-overview.invite-form.option.f83206c7c9d6")}</option>
          <option value="commenter">{t("app-projects-project-overview.invite-form.option.17787f224706")}</option>
          <option value="viewer">{t("app-projects-project-overview.invite-form.option.d07ee75c7b75")}</option>
        </select>
        <Button type="submit" variant="secondary" disabled={!email.trim() || invite.isPending}>
          <Send />
          {t("app-projects-project-overview.invite-form.button.ba71c19a1d36")}
        </Button>
      </form>
      {invite.isError ? (
        <p role="alert" className="mt-2 text-xs text-status-danger">
          {t("app-projects-project-overview.invite-form.p.b503b20a4399")}
        </p>
      ) : null}
      {link ? (
        <div className="mt-3 border border-border bg-surface-2 p-3 text-xs">
          <p className="text-text-secondary">
            {t("app-projects-project-overview.invite-form.p.3dffbff2098a")}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-text-primary">{link}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void navigator.clipboard.writeText(link)}
            >
              {t("app-projects-project-overview.invite-form.button.d82ccdd2935d")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** «Importer fra mobil» på prosjektsiden (DEC-0090, REQ-0668): QR-koden vises med en gang. */
function ProjectMobileImport({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setOpen(true)}
        data-testid="project-mobile-import"
        title={t("app-projects-project-overview.project-mobile-import.title.fd433bb23824")}
      >
        <Camera />
        {t("app-projects-project-overview.project-mobile-import.button.7c77e8de0962")}
      </Button>
      <MobileImportDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        context={PROJECT_CONTEXT}
        label={t("app-projects-project-overview.project-mobile-import.label.93d00272760b")}
      />
    </>
  );
}
