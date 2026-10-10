import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Download, LogOut, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { db } from "@/app/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssetZipDialog } from "@/app/library/AssetZip";
import {
  DeleteProjectDialog,
  LeaveProjectDialog,
  PurgeAssetsDialog,
  type ProjectTarget,
} from "./ProjectDangerDialogs";

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  /** Satt når prosjektet er slettet (migrasjon 0011); ressursene ligger igjen hos eieren. */
  deleted_at?: string | null;
  project_members: { role: string; user_id: string; removed_at?: string | null }[];
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Eier",
  editor: "Redaktør",
  commenter: "Kommentator",
  viewer: "Leser",
};

export function useProjects(userId: string) {
  return useQuery({
    queryKey: ["projects", userId],
    queryFn: async (): Promise<ProjectRow[]> => {
      const { data, error } = await db
        .from("projects")
        .select("*, project_members(role, user_id, removed_at)")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProjectRow[];
    },
  });
}

/** Prosjektoversikt: en liste, ikke et kortgalleri (ANTI_PATTERNS). */
export function ProjectsScreen({ userId }: { userId: string }) {
  const projects = useProjects(userId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState<{
    kind: "delete" | "leave" | "purge" | "zip";
    target: ProjectTarget;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const all = projects.data ?? [];
  const live = all.filter((p) => !p.deleted_at);
  const deleted = all.filter((p) => p.deleted_at);
  const active = (p: ProjectRow) => p.project_members.filter((m) => !m.removed_at);
  const roleOf = (p: ProjectRow) => active(p).find((m) => m.user_id === userId)?.role ?? "";
  const target = (p: ProjectRow): ProjectTarget => ({
    id: p.id,
    name: p.name,
    // Medeiere beholder tilgangen til ressursene; bare de andre mister den ved sletting
    others: active(p).filter((m) => m.user_id !== userId && m.role !== "owner").length,
  });
  const closeWith = async (message: string) => {
    setDialog(null);
    setNotice(message);
    await qc.invalidateQueries({ queryKey: ["projects"] });
  };

  const create = useMutation({
    mutationFn: async (projectName: string) => {
      const { data, error } = await db.rpc("create_project", { p_name: projectName });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: async (id) => {
      setName("");
      setCreating(false);
      await qc.invalidateQueries({ queryKey: ["projects"] });
      void navigate({ to: "/prosjekt/$projectId", params: { projectId: id } });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) create.mutate(name.trim());
  }

  return (
    <div className="mx-auto w-full max-w-[960px] px-6 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Prosjekter</h1>
          <p className="mt-1 text-[13px] text-text-secondary">
            Filmer du eier eller er invitert inn i.
          </p>
        </div>
        {!creating ? (
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Nytt prosjekt
          </Button>
        ) : null}
      </div>

      {creating ? (
        <form
          onSubmit={submit}
          className="mb-6 flex items-center gap-2 border border-border bg-surface-1 p-3"
        >
          <label htmlFor="new-project" className="sr-only">
            Prosjektnavn
          </label>
          <Input
            id="new-project"
            autoFocus
            placeholder="Prosjektnavn, f.eks. filmens tittel"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setCreating(false)}
            className="h-8 flex-1 bg-surface-3"
            maxLength={200}
          />
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            Opprett
          </Button>
          <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
            Avbryt
          </Button>
        </form>
      ) : null}
      {create.isError ? (
        <p role="alert" className="mb-4 text-xs text-status-danger">
          Prosjektet kunne ikke opprettes.{" "}
          {create.error.message.includes("schema") || create.error.message.includes("function")
            ? "Databasen er kanskje ikke satt opp ennå."
            : ""}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="mb-4 border border-border bg-surface-1 px-3 py-2 text-xs text-text-secondary"
        >
          {notice}
        </p>
      ) : null}
      <div className="border border-border bg-surface-1">
        <div className="grid grid-cols-[1fr_140px_140px_40px] border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
          <span>Navn</span>
          <span>Din rolle</span>
          <span>Opprettet</span>
          <span className="sr-only">Handlinger</span>
        </div>
        {projects.isLoading ? (
          <p className="px-4 py-6 text-[13px] text-text-tertiary">Henter prosjekter …</p>
        ) : projects.isError ? (
          <p className="px-4 py-6 text-[13px] text-status-danger">Prosjektene kunne ikke hentes.</p>
        ) : live.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] text-text-secondary">Du har ingen prosjekter ennå.</p>
            <p className="mt-1 text-xs text-text-tertiary">
              Opprett et prosjekt, eller be en prosjekteier om en invitasjon.
            </p>
          </div>
        ) : (
          <ul>
            {live.map((p) => {
              const role = roleOf(p);
              const owners = active(p).filter((m) => m.role === "owner").length;
              const canLeave = role !== "" && (role !== "owner" || owners > 1);
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-[1fr_40px] items-center border-b border-border last:border-b-0 hover:bg-surface-3"
                >
                  <Link
                    to="/prosjekt/$projectId"
                    params={{ projectId: p.id }}
                    className="grid grid-cols-[1fr_140px_140px] items-center px-4 py-2 text-[13px] focus-visible:bg-surface-3"
                  >
                    <span className="truncate font-medium text-text-primary">{p.name}</span>
                    <span className="text-text-secondary">{ROLE_LABEL[role] ?? "–"}</span>
                    <span className="tabular text-text-tertiary">
                      {new Date(p.created_at).toLocaleDateString("nb-NO")}
                    </span>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Handlinger for ${p.name}`}
                        className="mx-auto rounded-sm p-1 text-text-tertiary hover:bg-surface-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[200px]">
                      <DropdownMenuItem
                        onSelect={() => setDialog({ kind: "zip", target: target(p) })}
                      >
                        <Download /> Last ned ressurser …
                      </DropdownMenuItem>
                      {canLeave || role === "owner" ? <DropdownMenuSeparator /> : null}
                      {canLeave ? (
                        <DropdownMenuItem
                          onSelect={() => setDialog({ kind: "leave", target: target(p) })}
                          className="text-status-danger focus:text-status-danger"
                        >
                          <LogOut /> Forlat prosjekt …
                        </DropdownMenuItem>
                      ) : null}
                      {role === "owner" ? (
                        <DropdownMenuItem
                          onSelect={() => setDialog({ kind: "delete", target: target(p) })}
                          className="text-status-danger focus:text-status-danger"
                        >
                          <Trash2 /> Slett prosjekt …
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {deleted.length > 0 ? (
        <section aria-label="Ressurser fra slettede prosjekter" className="mt-8">
          <h2 className="text-[13px] font-medium text-text-primary">
            Ressurser fra slettede prosjekter
          </h2>
          <p className="mt-1 text-xs text-text-tertiary">
            Prosjektene er slettet, men bildene og lyden er tatt vare på. Last dem ned, eller slett
            dem for godt. Senere skal ressurser kunne gjøres globale og brukes i andre prosjekter.
          </p>
          <ul className="mt-3 border border-border bg-surface-1">
            {deleted.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-[13px] last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-text-secondary">{p.name}</span>
                <span className="tabular text-xs text-text-tertiary">
                  slettet {new Date(p.deleted_at!).toLocaleDateString("nb-NO")}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDialog({ kind: "zip", target: target(p) })}
                >
                  <Download /> Last ned …
                </Button>
                {roleOf(p) === "owner" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-status-danger hover:text-status-danger"
                    onClick={() => setDialog({ kind: "purge", target: target(p) })}
                  >
                    <Trash2 /> Slett for godt …
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <DeleteProjectDialog
        target={dialog?.kind === "delete" ? dialog.target : null}
        onClose={() => setDialog(null)}
        onDone={(m) => void closeWith(m)}
      />
      <LeaveProjectDialog
        target={dialog?.kind === "leave" ? dialog.target : null}
        onClose={() => setDialog(null)}
        onDone={(m) => void closeWith(m)}
      />
      <PurgeAssetsDialog
        target={dialog?.kind === "purge" ? dialog.target : null}
        onClose={() => setDialog(null)}
        onDone={(m) => void closeWith(m)}
      />
      {dialog?.kind === "zip" ? (
        <AssetZipDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          projectId={dialog.target.id}
          projectName={dialog.target.name}
        />
      ) : null}
    </div>
  );
}
