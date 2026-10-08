import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { db } from "@/app/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  project_members: { role: string; user_id: string }[];
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
        .select("id, name, created_at, project_members(role, user_id)")
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

      <div className="border border-border bg-surface-1">
        <div className="grid grid-cols-[1fr_140px_140px] border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
          <span>Navn</span>
          <span>Din rolle</span>
          <span>Opprettet</span>
        </div>
        {projects.isLoading ? (
          <p className="px-4 py-6 text-[13px] text-text-tertiary">Henter prosjekter …</p>
        ) : projects.isError ? (
          <p className="px-4 py-6 text-[13px] text-status-danger">Prosjektene kunne ikke hentes.</p>
        ) : (projects.data ?? []).length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] text-text-secondary">Du har ingen prosjekter ennå.</p>
            <p className="mt-1 text-xs text-text-tertiary">
              Opprett et prosjekt, eller be en prosjekteier om en invitasjon.
            </p>
          </div>
        ) : (
          <ul>
            {projects.data!.map((p) => {
              const role = p.project_members.find((m) => m.user_id === userId)?.role ?? "";
              return (
                <li key={p.id} className="border-b border-border last:border-b-0">
                  <Link
                    to="/prosjekt/$projectId"
                    params={{ projectId: p.id }}
                    className="grid grid-cols-[1fr_140px_140px] items-center px-4 py-2 text-[13px] hover:bg-surface-3 focus-visible:bg-surface-3"
                  >
                    <span className="truncate font-medium text-text-primary">{p.name}</span>
                    <span className="text-text-secondary">{ROLE_LABEL[role] ?? "–"}</span>
                    <span className="tabular text-text-tertiary">
                      {new Date(p.created_at).toLocaleDateString("nb-NO")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
