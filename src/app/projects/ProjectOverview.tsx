import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, FileText, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { discrepancies, filmClips, mainProduction, orderedOccurrences } from "@/core";
import { db } from "@/app/db";
import { DurationOverview } from "./DurationOverview";
import { canEdit, useMembers, useProfiles, useProjectState } from "@/app/project/use-project";
import { ProjectFormat } from "./ProjectFormat";
import { AiPanel } from "@/app/ai/AiPanel";
import { ProductionList } from "./ProductionList";
import { ContinuityAnalysisPanel } from "@/app/continuity/ContinuityAnalysisPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ROLE_LABEL: Record<string, string> = {
  owner: "Eier",
  editor: "Redaktør",
  commenter: "Kommentator",
  viewer: "Leser",
};

export function ProjectOverview({ projectId, userId }: { projectId: string; userId: string }) {
  const state = useProjectState(projectId);
  const members = useMembers(projectId);
  const profiles = useProfiles((members.data ?? []).map((m) => m.user_id));
  const myRole = members.data?.find((m) => m.user_id === userId)?.role;

  if (state.isLoading)
    return <p className="p-6 text-[13px] text-text-tertiary">Henter prosjektet …</p>;
  if (state.isError || !state.data)
    return (
      <div role="alert" className="p-6">
        <p className="text-[13px] text-status-danger">
          Prosjektet kunne ikke hentes. Det finnes ikke, du har ikke tilgang, eller noe gikk galt.
        </p>
        {state.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            Teknisk detalj (send gjerne til Claude): {state.error.message}
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
            Hovedspråk norsk ·{" "}
            <span className="tabular">
              {(s.project.fps.num / s.project.fps.den).toFixed(s.project.fps.den === 1 ? 0 : 3)}
            </span>{" "}
            bilder/s
          </p>

          <ProjectFormat
            state={s}
            projectId={projectId}
            userId={userId}
            editable={canEdit(myRole)}
          />

          <section aria-labelledby="prod-title" className="mt-8">
            <h2 id="prod-title" className="mb-2 text-base font-semibold text-text-primary">
              Produksjoner
            </h2>
            <ProductionList
              state={s}
              projectId={projectId}
              userId={userId}
              editable={canEdit(myRole)}
            />
            {main
              ? (() => {
                  // Avvik ved manusendring (DEC-0054, REQ-0315)
                  const n = new Set(
                    discrepancies(s, filmClips(s, main.id), { spans: false }).map(
                      (d) => d.occurrenceId,
                    ),
                  ).size;
                  return n > 0 ? (
                    <p className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
                      <AlertTriangle className="size-3.5 text-status-danger" aria-hidden />
                      {n === 1 ? "Én scene har" : `${n} scener har`} manusendringer etter at
                      2D-scene eller film ble laget.
                      <Link
                        to="/prosjekt/$projectId/montering"
                        params={{ projectId }}
                        className="text-accent-brand hover:underline"
                      >
                        Se i monteringen
                      </Link>
                    </p>
                  ) : null;
                })()
              : null}
            {main && orderedOccurrences(s, main.id).length === 0 ? (
              <div className="mt-3 flex items-center gap-3 text-xs text-text-tertiary">
                <span>Hovedfilmen har ingen scener ennå.</span>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/prosjekt/$projectId/manus" params={{ projectId }}>
                    <FileText />
                    Importer manus
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

          <DurationOverview state={s} />

          <AiPanel
            state={s}
            projectId={projectId}
            userId={userId}
            isOwner={myRole === "owner"}
            editable={canEdit(myRole)}
          />

          <section aria-labelledby="members-title" className="mt-10">
            <h2 id="members-title" className="mb-2 text-base font-semibold text-text-primary">
              Medlemmer
            </h2>
            <ul className="border border-border bg-surface-1">
              {(members.data ?? []).map((m) => (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between border-b border-border px-4 py-2 text-[13px] last:border-b-0"
                >
                  <span className="text-text-secondary">
                    {profiles.data?.[m.user_id]?.display_name || (
                      <span className="font-mono text-xs">{m.user_id.slice(0, 8)}</span>
                    )}
                    {m.user_id === userId ? (
                      <span className="ml-2 text-text-tertiary">(deg)</span>
                    ) : null}
                  </span>
                  <span className="text-text-secondary">{ROLE_LABEL[m.role] ?? m.role}</span>
                </li>
              ))}
            </ul>
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
  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("create_invitation", {
        p_project: projectId,
        p_email: email,
        p_role: role,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: (token) => {
      setLink(`${window.location.origin}/invitasjon?token=${encodeURIComponent(token)}`);
      setEmail("");
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (email.trim()) invite.mutate();
  }
  return (
    <div className="mt-4">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <label htmlFor="invite-email" className="sr-only">
          E-post
        </label>
        <Input
          id="invite-email"
          type="email"
          placeholder="E-post til den du vil invitere"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-8 w-[280px] bg-surface-3"
        />
        <label htmlFor="invite-role" className="sr-only">
          Rolle
        </label>
        <select
          id="invite-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-8 rounded-sm border border-input bg-surface-3 px-2 text-[13px] text-text-primary"
        >
          <option value="editor">Redaktør</option>
          <option value="commenter">Kommentator</option>
          <option value="viewer">Leser</option>
        </select>
        <Button type="submit" variant="secondary" disabled={!email.trim() || invite.isPending}>
          <Send />
          Lag invitasjon
        </Button>
      </form>
      {invite.isError ? (
        <p role="alert" className="mt-2 text-xs text-status-danger">
          Invitasjonen kunne ikke lages.
        </p>
      ) : null}
      {link ? (
        <div className="mt-3 border border-border bg-surface-2 p-3 text-xs">
          <p className="text-text-secondary">
            Send denne lenken til mottakeren. Den vises bare nå og gjelder i 14 dager.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-text-primary">{link}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void navigator.clipboard.writeText(link)}
            >
              Kopier
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
