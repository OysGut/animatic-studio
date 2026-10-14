/**
 * Prosjektlisten (hovedsiden). Én boks per prosjekt (DEC-0082): hvem som eier det, din rolle, og filmene i
 * prosjektet – hovedfilmen med spinoffer og andre varianter under – med dato og notat om hva hver er.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArchiveRestore,
  CornerDownRight,
  Crown,
  DatabaseBackup,
  Download,
  LogOut,
  MoreHorizontal,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { useMemo, useState, type FormEvent } from "react";
import {
  createProject,
  listProductionsFor,
  listProjects,
  type ProductionSummary,
} from "@/adapters/browser/projects";
import {
  L,
  PRODUCTION_KIND_LABEL,
  collation,
  locale,
  localized,
  tm,
  type ProductionKind,
} from "@/core";
import { useProfiles } from "@/app/project/use-project";
import { rememberProduction } from "@/app/project/use-production";
import { LanguageSwitch } from "@/app/i18n/language";
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
import { BackupDialog, RestoreBackupDialog } from "./BackupDialogs";
import { ProvidersDialog } from "@/app/ai/ProvidersDialog";

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  /** Satt når prosjektet er slettet (migrasjon 0011); ressursene ligger igjen hos eieren. */
  deleted_at?: string | null;
  project_members: { role: string; user_id: string; removed_at?: string | null }[];
}

const ROLE_LABEL: Record<string, string> = localized({
  owner: ["Eier", "Owner"],
  editor: ["Redaktør", "Editor"],
  commenter: ["Kommentator", "Commenter"],
  viewer: ["Leser", "Viewer"],
});

/** «Du er redaktør» – rollen din i et prosjekt du ikke eier. */
const YOUR_ROLE: Record<string, string> = localized({
  owner: ["Du eier prosjektet", "You own this project"],
  editor: ["Du er redaktør", "You are an editor"],
  commenter: ["Du kommenterer", "You are a commenter"],
  viewer: ["Du kan lese", "You can view"],
});

export function useProjects(userId: string) {
  return useQuery({
    queryKey: ["projects", userId],
    queryFn: async (): Promise<ProjectRow[]> => (await listProjects()) as ProjectRow[],
  });
}

/** Produksjonene i rekkefølge: hovedfilmen først, så hver produksjon med sine avledede rett under. */
function productionTree(
  list: readonly ProductionSummary[],
): { p: ProductionSummary; depth: number }[] {
  const ids = new Set(list.map((p) => p.id));
  const children = new Map<string | null, ProductionSummary[]>();
  for (const p of list) {
    const parent =
      p.parent_production_id && ids.has(p.parent_production_id) ? p.parent_production_id : null;
    children.set(parent, [...(children.get(parent) ?? []), p]);
  }
  const byKind = (a: ProductionSummary, b: ProductionSummary) =>
    Number(b.kind === "main") - Number(a.kind === "main") ||
    a.created_at.localeCompare(b.created_at);
  const out: { p: ProductionSummary; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const p of [...(children.get(parent) ?? [])].sort(byKind)) {
      out.push({ p, depth });
      if (depth < 6) walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

const date = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString(locale(), {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

/** Prosjektoversikt: én boks per prosjekt, stablet i en liste (DEC-0082). */
export function ProjectsScreen({ userId }: { userId: string }) {
  const projects = useProjects(userId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState<{
    kind: "delete" | "leave" | "purge" | "zip" | "backup";
    target: ProjectTarget;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
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
    setNotice(tm(message));
    await qc.invalidateQueries({ queryKey: ["projects"] });
  };

  // Navnene til eierne (profiler, migrasjon 0002) og produksjonene i hvert prosjekt (DEC-0082)
  const liveIds = useMemo(() => live.map((p) => p.id), [live]);
  const memberIds = useMemo(
    () => [...new Set(live.flatMap((p) => active(p).map((m) => m.user_id)))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects.data],
  );
  const profiles = useProfiles(memberIds);
  const productions = useQuery({
    queryKey: ["project-list-productions", [...liveIds].sort().join(",")],
    enabled: liveIds.length > 0,
    queryFn: () => listProductionsFor(liveIds),
  });
  const productionsOf = useMemo(() => {
    const m = new Map<string, ProductionSummary[]>();
    for (const p of productions.data ?? [])
      m.set(p.project_id, [...(m.get(p.project_id) ?? []), p]);
    return m;
  }, [productions.data]);
  const personName = (id: string) =>
    id === userId
      ? L("deg", "you")
      : profiles.data?.[id]?.display_name?.trim() || L("ukjent bruker", "unknown user");
  // Egne prosjekter først, så de du er invitert inn i; alfabetisk innenfor
  const sorted = [...live].sort(
    (a, b) =>
      Number(roleOf(b) === "owner") - Number(roleOf(a) === "owner") ||
      a.name.localeCompare(b.name, collation()),
  );

  const create = useMutation({
    mutationFn: (projectName: string) => createProject(projectName),
    onSuccess: async (id) => {
      setName("");
      setCreating(false);
      await qc.invalidateQueries({ queryKey: ["projects"] });
      void navigate({ to: "/prosjekt/$projectId", params: { projectId: id } });
    },
  });

  const [providers, setProviders] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) create.mutate(name.trim());
  }

  const openProduction = (projectId: string, productionId: string) => {
    rememberProduction(projectId, productionId);
    void navigate({ to: "/prosjekt/$projectId", params: { projectId } });
  };

  return (
    <div className="mx-auto w-full max-w-[960px] px-6 py-8">
      <ProvidersDialog open={providers} onOpenChange={setProviders} userId={userId} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            {L("Prosjekter", "Projects")}
          </h1>
          <p className="mt-1 text-[13px] text-text-secondary">
            {L(
              "Filmer du eier eller er invitert inn i, med spinoffer og andre versjoner.",
              "Films you own or have been invited to, with spin-offs and other versions.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageSwitch />
          {!creating ? (
            <>
              <Button variant="secondary" onClick={() => setProviders(true)}>
                <AiGlyph />
                {L("AI-leverandører …", "AI providers …")}
              </Button>
              <Button variant="secondary" onClick={() => setRestoring(true)}>
                <ArchiveRestore />
                {L("Gjenopprett fra sikkerhetskopi …", "Restore from backup …")}
              </Button>
              <Button onClick={() => setCreating(true)}>
                <Plus />
                {L("Nytt prosjekt", "New project")}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {creating ? (
        <form
          onSubmit={submit}
          className="mb-6 flex items-center gap-2 border border-border bg-surface-1 p-3"
        >
          <label htmlFor="new-project" className="sr-only">
            {L("Prosjektnavn", "Project name")}
          </label>
          <Input
            id="new-project"
            autoFocus
            placeholder={L(
              "Prosjektnavn, f.eks. filmens tittel",
              "Project name, e.g. the film's title",
            )}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setCreating(false)}
            className="h-8 flex-1 bg-surface-3"
            maxLength={200}
          />
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            {L("Opprett", "Create")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
            {L("Avbryt", "Cancel")}
          </Button>
        </form>
      ) : null}
      {create.isError ? (
        <p role="alert" className="mb-4 text-xs text-status-danger">
          {L("Prosjektet kunne ikke opprettes.", "The project could not be created.")}{" "}
          {create.error.message.includes("schema") || create.error.message.includes("function")
            ? L("Databasen er kanskje ikke satt opp ennå.", "The database may not be set up yet.")
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

      {projects.isLoading ? (
        <p className="border border-border bg-surface-1 px-4 py-6 text-[13px] text-text-tertiary">
          {L("Henter prosjekter …", "Loading projects …")}
        </p>
      ) : projects.isError ? (
        <p className="border border-border bg-surface-1 px-4 py-6 text-[13px] text-status-danger">
          {L("Prosjektene kunne ikke hentes.", "The projects could not be loaded.")}
        </p>
      ) : live.length === 0 ? (
        <div className="border border-border bg-surface-1 px-4 py-10 text-center">
          <p className="text-[13px] text-text-secondary">
            {L("Du har ingen prosjekter ennå.", "You have no projects yet.")}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {L(
              "Opprett et prosjekt, eller be en prosjekteier om en invitasjon.",
              "Create a project, or ask a project owner for an invitation.",
            )}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={L("Prosjekter", "Projects")}>
          {sorted.map((p) => {
            const role = roleOf(p);
            const members = active(p);
            const ownerIds = members.filter((m) => m.role === "owner").map((m) => m.user_id);
            const canLeave = role !== "" && (role !== "owner" || ownerIds.length > 1);
            const owners = ownerIds.length
              ? ownerIds.map(personName).join(", ")
              : L("ukjent", "unknown");
            const tree = productionTree(productionsOf.get(p.id) ?? []);
            return (
              <li
                key={p.id}
                data-testid="project-box"
                className="border border-border bg-surface-1"
              >
                <div className="flex items-start gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/prosjekt/$projectId"
                      params={{ projectId: p.id }}
                      className="block truncate text-[15px] font-semibold text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {p.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                      <span className="flex items-center gap-1" data-testid="project-owner">
                        <Crown className="size-3 text-text-tertiary" aria-hidden />
                        {ownerIds.length > 1
                          ? L(`Eiere: ${owners}`, `Owners: ${owners}`)
                          : L(`Eier: ${owners}`, `Owner: ${owners}`)}
                      </span>
                      {role ? (
                        <span
                          className={
                            "rounded-sm px-1.5 py-px " +
                            (role === "owner"
                              ? "bg-surface-3 text-text-secondary"
                              : "bg-accent-selection text-text-primary")
                          }
                          title={ROLE_LABEL[role]}
                        >
                          {YOUR_ROLE[role] ?? ROLE_LABEL[role]}
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1 text-text-tertiary">
                        <Users className="size-3" aria-hidden />
                        {members.length === 1
                          ? L("1 medlem", "1 member")
                          : L(`${members.length} medlemmer`, `${members.length} members`)}
                      </span>
                      <span className="tabular text-text-tertiary">
                        {L(`Opprettet ${date(p.created_at)}`, `Created ${date(p.created_at)}`)}
                      </span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={L(`Handlinger for ${p.name}`, `Actions for ${p.name}`)}
                        className="rounded-sm p-1 text-text-tertiary hover:bg-surface-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[200px]">
                      <DropdownMenuItem
                        onSelect={() => setDialog({ kind: "zip", target: target(p) })}
                      >
                        <Download /> {L("Last ned ressurser …", "Download assets …")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setDialog({ kind: "backup", target: target(p) })}
                      >
                        <DatabaseBackup /> {L("Sikkerhetskopi …", "Backup …")}
                      </DropdownMenuItem>
                      {canLeave || role === "owner" ? <DropdownMenuSeparator /> : null}
                      {canLeave ? (
                        <DropdownMenuItem
                          onSelect={() => setDialog({ kind: "leave", target: target(p) })}
                          className="text-status-danger focus:text-status-danger"
                        >
                          <LogOut /> {L("Forlat prosjekt …", "Leave project …")}
                        </DropdownMenuItem>
                      ) : null}
                      {role === "owner" ? (
                        <DropdownMenuItem
                          onSelect={() => setDialog({ kind: "delete", target: target(p) })}
                          className="text-status-danger focus:text-status-danger"
                        >
                          <Trash2 /> {L("Slett prosjekt …", "Delete project …")}
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {productions.isLoading ? (
                  <p className="px-4 py-2 text-xs text-text-tertiary">
                    {L("Henter filmene …", "Loading the films …")}
                  </p>
                ) : tree.length ? (
                  <ul aria-label={L(`Filmer i ${p.name}`, `Films in ${p.name}`)}>
                    {tree.map(({ p: f, depth }) => (
                      <li key={f.id} className="border-b border-border/60 last:border-b-0">
                        <button
                          type="button"
                          data-testid="project-production"
                          onClick={() => openProduction(p.id, f.id)}
                          className="grid w-full grid-cols-[1fr_auto] items-start gap-3 px-4 py-2 text-left hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none"
                          style={{ paddingLeft: 16 + depth * 20 }}
                        >
                          <span className="min-w-0">
                            <span className="flex items-baseline gap-2">
                              {depth > 0 ? (
                                <CornerDownRight
                                  className="size-3 shrink-0 self-center text-text-tertiary"
                                  aria-hidden
                                />
                              ) : null}
                              <span className="truncate text-[13px] font-medium text-text-primary">
                                {f.name}
                              </span>
                              <span className="shrink-0 rounded-sm bg-surface-3 px-1.5 py-px text-[11px] text-text-secondary">
                                {PRODUCTION_KIND_LABEL[f.kind as ProductionKind] ?? f.kind}
                              </span>
                            </span>
                            {f.description?.trim() ? (
                              <span className="mt-0.5 line-clamp-2 block whitespace-pre-line text-xs text-text-secondary">
                                {f.description}
                              </span>
                            ) : null}
                          </span>
                          <span className="tabular shrink-0 pt-px text-xs text-text-tertiary">
                            {date(f.created_at)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {deleted.length > 0 ? (
        <section
          aria-label={L("Ressurser fra slettede prosjekter", "Assets from deleted projects")}
          className="mt-8"
        >
          <h2 className="text-[13px] font-medium text-text-primary">
            {L("Ressurser fra slettede prosjekter", "Assets from deleted projects")}
          </h2>
          <p className="mt-1 text-xs text-text-tertiary">
            {L(
              "Prosjektene er slettet, men bildene og lyden er tatt vare på. Last dem ned, eller slett dem for godt. Senere skal ressurser kunne gjøres globale og brukes i andre prosjekter.",
              "The projects are deleted, but the images and sound have been kept. Download them, or delete them for good. Later, assets will be able to be made global and used in other projects.",
            )}
          </p>
          <ul className="mt-3 border border-border bg-surface-1">
            {deleted.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-[13px] last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-text-secondary">{p.name}</span>
                <span className="tabular text-xs text-text-tertiary">
                  {L(`slettet ${date(p.deleted_at)}`, `deleted ${date(p.deleted_at)}`)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDialog({ kind: "zip", target: target(p) })}
                >
                  <Download /> {L("Last ned …", "Download …")}
                </Button>
                {roleOf(p) === "owner" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-status-danger hover:text-status-danger"
                    onClick={() => setDialog({ kind: "purge", target: target(p) })}
                  >
                    <Trash2 /> {L("Slett for godt …", "Delete for good …")}
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
      {dialog?.kind === "backup" ? (
        <BackupDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          projectId={dialog.target.id}
          projectName={dialog.target.name}
        />
      ) : null}
      <RestoreBackupDialog
        open={restoring}
        onOpenChange={setRestoring}
        onRestored={() => void qc.invalidateQueries({ queryKey: ["projects"] })}
        onOpenProject={(id) => {
          setRestoring(false);
          void navigate({ to: "/prosjekt/$projectId", params: { projectId: id } });
        }}
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
