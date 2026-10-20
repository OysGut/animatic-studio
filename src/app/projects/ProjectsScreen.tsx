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
import { rememberIdea } from "@/app/storylab/new-project-idea";
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
import { EmptyState, ErrorState, LoadingState } from "@/app/shell/screen-states";
import { Film } from "lucide-react";
import { t, tLocalized } from "@/core/i18n/keyed";

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  /** Satt når prosjektet er slettet (migrasjon 0011); ressursene ligger igjen hos eieren. */
  deleted_at?: string | null;
  project_members: { role: string; user_id: string; removed_at?: string | null }[];
}

const ROLE_LABEL: Record<string, string> = tLocalized({ owner: "app-projects-projects-screen.role-label.owner.3c69c8270508", editor: "app-projects-projects-screen.role-label.editor.f41247266ec1", commenter: "app-projects-projects-screen.role-label.commenter.be89d56414e9", viewer: "app-projects-projects-screen.role-label.viewer.1a2775cd37f9" });

/** «Du er redaktør» – rollen din i et prosjekt du ikke eier. */
const YOUR_ROLE: Record<string, string> = tLocalized({ owner: "app-projects-projects-screen.your-role.owner.54ba81a79c8f", editor: "app-projects-projects-screen.your-role.editor.7692a90b3fe7", commenter: "app-projects-projects-screen.your-role.commenter.98aabc5298fa", viewer: "app-projects-projects-screen.your-role.viewer.e40a6aa951dd" });

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
      ? t("app-projects-projects-screen.person-name.message.5a45255f5d1b")
      : profiles.data?.[id]?.display_name?.trim() || t("app-projects-projects-screen.person-name.message.ddcd5f5ef017");
  // Egne prosjekter først, så de du er invitert inn i; alfabetisk innenfor
  const sorted = [...live].sort(
    (a, b) =>
      Number(roleOf(b) === "owner") - Number(roleOf(a) === "owner") ||
      a.name.localeCompare(b.name, collation()),
  );

  /** GP4: kort idé til skriveassistenten (valgfri). */
  const [idea, setIdea] = useState("");
  const create = useMutation({
    mutationFn: async (v: { name: string; assistant: boolean }) => ({ id: await createProject(v.name), assistant: v.assistant }),
    onSuccess: async ({ id, assistant }) => {
      setName("");
      setCreating(false);
      await qc.invalidateQueries({ queryKey: ["projects"] });
      if (assistant) {
        // Story Lab-intervjuet (SL7) startes med idéen i tekstfeltet; ingen AI-kall før brukeren sender
        rememberIdea(id, idea);
        setIdea("");
        void navigate({ to: "/prosjekt/$projectId/storylab", params: { projectId: id }, search: { intervju: "ny" } });
      } else void navigate({ to: "/prosjekt/$projectId", params: { projectId: id } });
    },
  });

  const [providers, setProviders] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) create.mutate({ name: name.trim(), assistant: false });
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
            {t("app-projects-projects-screen.projects-screen.h1.a2ba9a0063a8")}
          </h1>
          <p className="mt-1 text-[13px] text-text-secondary">
            {t("app-projects-projects-screen.projects-screen.p.4dc1f46d3b02")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageSwitch />
          {!creating ? (
            <>
              <Button variant="secondary" onClick={() => setProviders(true)}>
                <AiGlyph />
                {t("app-projects-projects-screen.projects-screen.button.f906b0863ecc")}
              </Button>
              <Button variant="secondary" onClick={() => setRestoring(true)}>
                <ArchiveRestore />
                {t("app-projects-projects-screen.projects-screen.button.c36722de4cc3")}
              </Button>
              <Button onClick={() => setCreating(true)}>
                <Plus />
                {t("app-projects-projects-screen.projects-screen.button.db5895b4c0f7")}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {creating ? (
        <form
          onSubmit={submit}
          className="mb-6 flex flex-wrap items-center gap-2 border border-border bg-surface-1 p-3"
        >
          <label htmlFor="new-project" className="sr-only">
            {t("app-projects-projects-screen.projects-screen.label.4ac8886a5cb6")}
          </label>
          <Input
            id="new-project"
            autoFocus
            placeholder={t("app-projects-projects-screen.projects-screen.placeholder.0cc91ba3adf2")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setCreating(false)}
            className="h-8 flex-1 bg-surface-3"
            maxLength={200}
          />
          <Button type="submit" disabled={!name.trim() || create.isPending} data-testid="new-project-create">
            {t("app-projects-projects-screen.projects-screen.button.d47cbc393746")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!name.trim() || create.isPending}
            data-testid="new-project-assistant"
            title={t("app-projects-projects-screen.projects-screen.title.622d83c45445")}
            onClick={() => name.trim() && create.mutate({ name: name.trim(), assistant: true })}
          >
            <AiGlyph />
            {t("app-projects-projects-screen.projects-screen.button.52e0ec6bee64")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
            {t("app-projects-projects-screen.projects-screen.button.fd432d48ff10")}
          </Button>
          <label htmlFor="new-project-idea" className="sr-only">
            {t("app-projects-projects-screen.projects-screen.label.64a883d59754")}
          </label>
          <Input
            id="new-project-idea"
            data-testid="new-project-idea"
            placeholder={t("app-projects-projects-screen.projects-screen.placeholder.f03a2886b6d0")}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            className="h-8 basis-full bg-surface-3"
            maxLength={4000}
          />
        </form>
      ) : null}
      {create.isError ? (
        <p role="alert" className="mb-4 text-xs text-status-danger">
          {t("app-projects-projects-screen.projects-screen.p.07de4a3517ea")}{" "}
          {create.error.message.includes("schema") || create.error.message.includes("function")
            ? t("app-projects-projects-screen.projects-screen.p.443cb9ea8879")
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
        <LoadingState label={t("app-projects-projects-screen.projects-screen.label.9fe8335868e8")} rows={3} />
      ) : projects.isError ? (
        <ErrorState
          message={t("app-projects-projects-screen.projects-screen.message.8e11c986d83b")}
          onRetry={() => void projects.refetch()}
        />
      ) : live.length === 0 ? (
        <EmptyState
          title={t("app-projects-projects-screen.projects-screen.title.e72a69906d76")}
          hint={t("app-projects-projects-screen.projects-screen.hint.0f7f0eb700b0")}
          action={
            !creating ? (
              <Button onClick={() => setCreating(true)} data-testid="projects-empty-create">
                <Plus />
                {t("app-projects-projects-screen.projects-screen.button.81fb7f5ba35d")}
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="flex flex-col gap-3" aria-label={t("app-projects-projects-screen.projects-screen.aria-label.a2ba9a0063a8")}>
          {sorted.map((p) => {
            const role = roleOf(p);
            const members = active(p);
            const ownerIds = members.filter((m) => m.role === "owner").map((m) => m.user_id);
            const canLeave = role !== "" && (role !== "owner" || ownerIds.length > 1);
            const owners = ownerIds.length
              ? ownerIds.map(personName).join(", ")
              : t("app-projects-projects-screen.owners.sorted-map.691f4e2d0597");
            const tree = productionTree(productionsOf.get(p.id) ?? []);
            return (
              <li
                key={p.id}
                data-testid="project-box"
                className="overflow-hidden rounded-sm border border-border bg-surface-1 transition-colors focus-within:border-border-strong hover:border-border-strong"
              >
                <div className="flex items-start gap-3 border-b border-border px-4 py-3">
                  {/* U5: miniatyr (filmrute med prosjektets forbokstav) og nøkkeltall */}
                  <Link
                    to="/prosjekt/$projectId"
                    params={{ projectId: p.id }}
                    tabIndex={-1}
                    aria-hidden
                    data-testid="project-thumb"
                    className="relative flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border-control bg-surface-2"
                  >
                    <Film className="absolute left-1.5 top-1.5 size-3 text-text-tertiary" aria-hidden />
                    <span className="text-xl font-semibold text-text-secondary">
                      {p.name.trim().charAt(0).toUpperCase() || "·"}
                    </span>
                  </Link>
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
                          ? t("app-projects-projects-screen.projects-screen.span.a41f483c3d2d", { owners: String(owners) })
                          : t("app-projects-projects-screen.projects-screen.span.b5e505e15968", { owners: String(owners) })}
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
                          ? t("app-projects-projects-screen.projects-screen.span.dcd013ecb85b")
                          : t("app-projects-projects-screen.projects-screen.span.69ddbf4e4534", { length: String(members.length) })}
                      </span>
                      {tree.length ? (
                        <span className="flex items-center gap-1 text-text-tertiary" data-testid="project-film-count">
                          <Film className="size-3" aria-hidden />
                          {tree.length === 1 ? t("app-projects-projects-screen.projects-screen.span.3607cfacb937") : t("app-projects-projects-screen.projects-screen.span.1be386492308", { length: String(tree.length) })}
                        </span>
                      ) : null}
                      <span className="tabular text-text-tertiary">
                        {t("app-projects-projects-screen.projects-screen.span.80a8cc750f16", { value1: String(date(p.created_at)) })}
                      </span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={t("app-projects-projects-screen.projects-screen.aria-label.20089e6afbf6", { name: String(p.name) })}
                        className="rounded-sm p-1 text-text-tertiary hover:bg-surface-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[200px]">
                      <DropdownMenuItem
                        onSelect={() => setDialog({ kind: "zip", target: target(p) })}
                      >
                        <Download /> {t("app-projects-projects-screen.projects-screen.dropdown-menu-item.728534d50242")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setDialog({ kind: "backup", target: target(p) })}
                      >
                        <DatabaseBackup /> {t("app-projects-projects-screen.projects-screen.dropdown-menu-item.c8a1abd0cec2")}
                      </DropdownMenuItem>
                      {canLeave || role === "owner" ? <DropdownMenuSeparator /> : null}
                      {canLeave ? (
                        <DropdownMenuItem
                          onSelect={() => setDialog({ kind: "leave", target: target(p) })}
                          className="text-status-danger focus:text-status-danger"
                        >
                          <LogOut /> {t("app-projects-projects-screen.projects-screen.dropdown-menu-item.ac48481c6e9a")}
                        </DropdownMenuItem>
                      ) : null}
                      {role === "owner" ? (
                        <DropdownMenuItem
                          onSelect={() => setDialog({ kind: "delete", target: target(p) })}
                          className="text-status-danger focus:text-status-danger"
                        >
                          <Trash2 /> {t("app-projects-projects-screen.projects-screen.dropdown-menu-item.c18c43ad8b8a")}
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {productions.isLoading ? (
                  <p className="px-4 py-2 text-xs text-text-tertiary">
                    {t("app-projects-projects-screen.projects-screen.p.aac736a063bc")}
                  </p>
                ) : tree.length ? (
                  <ul aria-label={t("app-projects-projects-screen.projects-screen.aria-label.80782a130cdb", { name: String(p.name) })}>
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
          aria-label={t("app-projects-projects-screen.projects-screen.aria-label.4e70b05e2758")}
          className="mt-8"
        >
          <h2 className="text-[13px] font-medium text-text-primary">
            {t("app-projects-projects-screen.projects-screen.h2.4e70b05e2758")}
          </h2>
          <p className="mt-1 text-xs text-text-tertiary">
            {t("app-projects-projects-screen.projects-screen.p.526f9a47fbd8")}
          </p>
          <ul className="mt-3 border border-border bg-surface-1">
            {deleted.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-[13px] last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-text-secondary">{p.name}</span>
                <span className="tabular text-xs text-text-tertiary">
                  {t("app-projects-projects-screen.projects-screen.span.ff77d21acbe6", { value1: String(date(p.deleted_at)) })}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDialog({ kind: "zip", target: target(p) })}
                >
                  <Download /> {t("app-projects-projects-screen.projects-screen.button.3c8b0a9d15f3")}
                </Button>
                {roleOf(p) === "owner" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-status-danger hover:text-status-danger"
                    onClick={() => setDialog({ kind: "purge", target: target(p) })}
                  >
                    <Trash2 /> {t("app-projects-projects-screen.projects-screen.button.d6a9b1452650")}
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
