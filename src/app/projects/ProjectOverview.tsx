import { useMutation, useQuery } from "@tanstack/react-query";
import { Clapperboard, FileText, Film, Layers, Send, Users } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { activeStructure, mainProduction, orderedOccurrences } from "@/core";
import { loadProjectState } from "@/adapters/storage/project-rows";
import { db } from "@/app/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ROLE_LABEL: Record<string, string> = {
  owner: "Eier",
  editor: "Redaktør",
  commenter: "Kommentator",
  viewer: "Leser",
};
const KIND_LABEL: Record<string, string> = {
  main: "Hovedfilm",
  spinoff: "Spinoff",
  trailer: "Trailer",
  teaser: "Teaser",
  short: "Kortfilm",
  pitch: "Pitchfilm",
  pilot: "Pilotsekvens",
  alternative: "Alternativ fortelling",
  other: "Annen versjon",
};

interface MemberRow {
  user_id: string;
  role: string;
  joined_at: string;
}

/** Arbeidsflatene (INFORMATION_ARCHITECTURE.md). Bare prosjektoversikten finnes i M1. */
const WORKSPACES: { label: string; icon: ReactNode; milestone: string }[] = [
  { label: "Manus", icon: <FileText />, milestone: "M2" },
  { label: "Sceneeditor", icon: <Layers />, milestone: "M3" },
  { label: "Montering", icon: <Film />, milestone: "M4" },
  { label: "Utgivelse", icon: <Clapperboard />, milestone: "M8" },
];

export function ProjectOverview({ projectId, userId }: { projectId: string; userId: string }) {
  const state = useQuery({
    queryKey: ["project-state", projectId],
    queryFn: () => loadProjectState(db, projectId),
  });
  const members = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async (): Promise<MemberRow[]> => {
      const { data, error } = await db
        .from("project_members")
        .select("user_id, role, joined_at")
        .eq("project_id", projectId)
        .is("removed_at", null);
      if (error) throw new Error(error.message);
      return (data ?? []) as MemberRow[];
    },
  });
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
  const productions = Object.values(s.productions).sort((a, b) =>
    a.kind === "main" ? -1 : b.kind === "main" ? 1 : a.name.localeCompare(b.name, "nb"),
  );

  return (
    <div className="flex min-h-0 flex-1">
      <nav
        aria-label="Arbeidsflater"
        className="flex w-[200px] shrink-0 flex-col gap-0.5 border-r border-border bg-surface-1 p-2"
      >
        <span className="flex h-8 items-center gap-2 rounded-sm bg-accent-selection px-2 text-[13px] font-medium text-text-primary">
          <Users className="size-4" aria-hidden />
          Prosjektoversikt
        </span>
        {WORKSPACES.map((w) => (
          <span
            key={w.label}
            aria-disabled
            title={`Kommer i ${w.milestone}`}
            className="flex h-8 cursor-not-allowed items-center gap-2 px-2 text-[13px] text-text-disabled [&_svg]:size-4"
          >
            {w.icon}
            {w.label}
            <span className="ml-auto font-mono text-[11px] text-text-disabled">{w.milestone}</span>
          </span>
        ))}
      </nav>

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

          <section aria-labelledby="prod-title" className="mt-8">
            <h2 id="prod-title" className="mb-2 text-base font-semibold text-text-primary">
              Produksjoner
            </h2>
            <div className="border border-border bg-surface-1">
              <div className="grid grid-cols-[1fr_160px_100px_100px] border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
                <span>Navn</span>
                <span>Type</span>
                <span className="text-right">Scener</span>
                <span className="text-right">Aktive</span>
              </div>
              {productions.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-[1fr_160px_100px_100px] border-b border-border px-4 py-2 text-[13px] last:border-b-0"
                >
                  <span className="font-medium text-text-primary">{p.name}</span>
                  <span className="text-text-secondary">{KIND_LABEL[p.kind] ?? p.kind}</span>
                  <span className="tabular text-right text-text-secondary">
                    {orderedOccurrences(s, p.id).length}
                  </span>
                  <span className="tabular text-right text-text-secondary">
                    {activeStructure(s, p.id).length}
                  </span>
                </div>
              ))}
            </div>
            {main && orderedOccurrences(s, main.id).length === 0 ? (
              <p className="mt-3 text-xs text-text-tertiary">
                Hovedfilmen har ingen scener ennå. Manusimport kommer i neste milepæl (M2).
              </p>
            ) : null}
          </section>

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
                  <span className="font-mono text-xs text-text-secondary">
                    {m.user_id === userId ? "Deg" : m.user_id.slice(0, 8)}
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
