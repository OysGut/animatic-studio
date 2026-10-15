import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { L, mainProduction, orderedOccurrences } from "@/core";
import { createInvitation } from "@/adapters/browser/members";
import { DurationOverview } from "./DurationOverview";
import { canEdit, useMembers, useProfiles, useProjectState } from "@/app/project/use-project";
import { ProjectFormat } from "./ProjectFormat";
import { AiPanel } from "@/app/ai/AiPanel";
import { ProductionList } from "./ProductionList";
import { MembersSection } from "./MembersSection";
import { StyleGuideSection } from "./StyleGuideSection";
import { ProjectTodoBox } from "./ProjectTodoBox";
import { StorageSection } from "./StorageSection";
import { ProjectCostSection } from "@/app/account/ProjectCostSection";
import { ContinuityAnalysisPanel } from "@/app/continuity/ContinuityAnalysisPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProjectOverview({ projectId, userId }: { projectId: string; userId: string }) {
  const state = useProjectState(projectId);
  const members = useMembers(projectId);
  const profiles = useProfiles((members.data ?? []).map((m) => m.user_id));
  const myRole = members.data?.find((m) => m.user_id === userId)?.role;

  if (state.isLoading)
    return (
      <p className="p-6 text-[13px] text-text-tertiary">
        {L("Henter prosjektet …", "Loading the project …")}
      </p>
    );
  if (state.isError || !state.data)
    return (
      <div role="alert" className="p-6">
        <p className="text-[13px] text-status-danger">
          {L(
            "Prosjektet kunne ikke hentes. Det finnes ikke, du har ikke tilgang, eller noe gikk galt.",
            "The project could not be loaded. It does not exist, you do not have access, or something went wrong.",
          )}
        </p>
        {state.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            {L(
              "Teknisk detalj (send gjerne til Claude):",
              "Technical detail (feel free to send to Claude):",
            )}{" "}
            {state.error.message}
          </p>
        ) : null}
      </div>
    );
  const s = state.data;
  const main = mainProduction(s);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[960px] px-6 py-8">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            {s.project.name}
          </h1>
          <p className="mt-1 text-[13px] text-text-secondary">
            {L("Hovedspråk norsk ·", "Main language: Norwegian ·")}{" "}
            <span className="tabular">
              {(s.project.fps.num / s.project.fps.den).toFixed(s.project.fps.den === 1 ? 0 : 3)}
            </span>{" "}
            {L("bilder/s", "frames/s")}
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

          <section aria-labelledby="prod-title" className="mt-8">
            <h2 id="prod-title" className="mb-2 text-base font-semibold text-text-primary">
              {L("Produksjoner", "Productions")}
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
                  {L("Hovedfilmen har ingen scener ennå.", "The main film has no scenes yet.")}
                </span>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/prosjekt/$projectId/manus" params={{ projectId }}>
                    <FileText />
                    {L("Importer manus", "Import script")}
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
              {L("Medlemmer", "Members")}
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
          {L("E-post", "Email")}
        </label>
        <Input
          id="invite-email"
          type="email"
          placeholder={L(
            "E-post til den du vil invitere",
            "Email of the person you want to invite",
          )}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-8 w-[280px] bg-surface-3"
        />
        <label htmlFor="invite-role" className="sr-only">
          {L("Rolle", "Role")}
        </label>
        <select
          id="invite-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-8 rounded-sm border border-input bg-surface-3 px-2 text-[13px] text-text-primary"
        >
          <option value="editor">{L("Redaktør", "Editor")}</option>
          <option value="commenter">{L("Kommentator", "Commenter")}</option>
          <option value="viewer">{L("Leser", "Viewer")}</option>
        </select>
        <Button type="submit" variant="secondary" disabled={!email.trim() || invite.isPending}>
          <Send />
          {L("Lag invitasjon", "Create invitation")}
        </Button>
      </form>
      {invite.isError ? (
        <p role="alert" className="mt-2 text-xs text-status-danger">
          {L("Invitasjonen kunne ikke lages.", "The invitation could not be created.")}
        </p>
      ) : null}
      {link ? (
        <div className="mt-3 border border-border bg-surface-2 p-3 text-xs">
          <p className="text-text-secondary">
            {L(
              "Send denne lenken til mottakeren. Den vises bare nå og gjelder i 14 dager.",
              "Send this link to the recipient. It is only shown now and is valid for 14 days.",
            )}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-text-primary">{link}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void navigator.clipboard.writeText(link)}
            >
              {L("Kopier", "Copy")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
