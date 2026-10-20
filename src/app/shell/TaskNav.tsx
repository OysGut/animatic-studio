/**
 * Oppgavene i den øverste menylinjen (DEC-0088, Mars 15.10.2026): «listes i den aller øverste menylinjen slik
 * at det er enkelt å gå til neste eller forrige … uten at systemet skal glemme at disse scenene skal
 * oppdateres». Viser åpne oppgaver (et element som skal inn i flere scener) med ‹ Forrige · Neste ›.
 */
import { skipToken, useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, ListTodo, StickyNote } from "lucide-react";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { assetTasks, stepTask, type AssetTask, type ProjectState } from "@/core";
import { projectStateKey } from "@/app/project/use-project";
import { useActiveProduction } from "@/app/project/use-production";
import { gotoScene, lastScene } from "./current-scene";
import { t as tk } from "@/core/i18n/keyed";

export function TaskNav({ projectId }: { projectId: string }) {
  // Prosjektet fra hurtigbufferen (sidene henter det; her bare lyttes det)
  const { data } = useQuery<ProjectState>({
    queryKey: projectStateKey(projectId),
    queryFn: skipToken,
  });
  if (!data) return null;
  return <TaskNavInner projectId={projectId} state={data} />;
}

function TaskNavInner({ projectId, state }: { projectId: string; state: ProjectState }) {
  const [productionId] = useActiveProduction(projectId, state);
  const tasks = useMemo(() => assetTasks(state, productionId), [state, productionId]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  if (!tasks.length) return null;
  const task = tasks.find((t) => t.taskId === chosen) ?? tasks[0]!;

  function go(occurrenceId: string) {
    // Manus og sceneeditor bytter scene der de står; ellers åpnes sceneeditoren (der elementet dras inn)
    if (/\/(manus|scene)$/.test(pathname)) gotoScene(projectId, occurrenceId);
    else
      void navigate({
        to: "/prosjekt/$projectId/scene",
        params: { projectId },
        search: { scene: occurrenceId },
      });
  }
  function step(t: AssetTask, dir: 1 | -1) {
    const next = stepTask(t, lastScene(projectId), dir);
    if (next) go(next);
  }
  const total = task.scenes.length;
  return (
    <div
      className="flex h-7 items-center rounded-sm border border-accent-warm/60 bg-surface-2 text-xs"
      data-testid="task-nav"
    >
      <button
        type="button"
        className="flex h-full items-center px-1 text-text-secondary hover:bg-surface-3 hover:text-text-primary"
        onClick={() => step(task, -1)}
        title={tk("app-shell-task-nav.task-nav-inner.title.d5c2c2e5285c")}
        aria-label={tk("app-shell-task-nav.task-nav-inner.aria-label.ebb67d9d62af")}
        data-testid="task-prev"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-full max-w-[220px] items-center gap-1.5 border-x border-border px-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title={tk("app-shell-task-nav.task-nav-inner.title.00e38ae456bf")}
            data-testid="task-nav-open"
          >
            <ListTodo className="size-3.5 shrink-0 text-accent-warm" aria-hidden />
            <span className="truncate">
              {task.assetName}:{" "}
              {tk("app-shell-task-nav.task-nav-inner.span.7d649e825e33", { remaining: String(task.remaining), total: String(total) })}
            </span>
            {tasks.length > 1 ? (
              <span className="rounded-sm bg-surface-3 px-1 text-[11px] text-text-tertiary">
                +{tasks.length - 1}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[360px] p-0">
          <div className="border-b border-border px-3 py-2 text-xs font-medium text-text-primary">
            {tk("app-shell-task-nav.task-nav-inner.div.23deaaaf519f")}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto" data-testid="task-nav-list">
            {tasks.map((t) => (
              <li key={t.taskId} className="border-b border-border/60 px-3 py-2 last:border-b-0">
                <button
                  type="button"
                  className={
                    "w-full text-left text-xs " +
                    (t.taskId === task.taskId
                      ? "font-semibold text-text-primary"
                      : "text-text-secondary")
                  }
                  onClick={() => setChosen(t.taskId)}
                >
                  {tk("app-shell-task-nav.task-nav-inner.button.37958c487e84", { assetName: String(t.assetName), length: String(t.scenes.length), remaining: String(t.remaining) })}
                </button>
                <div className="mt-1 flex flex-wrap gap-1">
                  {t.scenes.map((sc) => (
                    <button
                      key={sc.occurrenceId}
                      type="button"
                      onClick={() => {
                        setChosen(t.taskId);
                        setOpen(false);
                        go(sc.occurrenceId);
                      }}
                      className={
                        "flex items-center gap-0.5 rounded-sm border px-1.5 py-0.5 text-[11px] " +
                        (sc.done
                          ? "border-border text-text-tertiary"
                          : "border-accent-warm text-text-primary hover:bg-surface-3")
                      }
                      title={
                        sc.done
                          ? tk("app-shell-task-nav.task-nav-inner.title.c176e9fc35c5")
                          : [
                              sc.placed ? "" : tk("app-shell-task-nav.task-nav-inner.sc-placed-l-ikke-dratt-inn-enn-not-dragged-in-yet-sc-note-id-l-merknad-i-manuset-note-in-the-script-filter.643bd71b4799"),
                              sc.noteId ? tk("app-shell-task-nav.task-nav-inner.sc-placed-l-ikke-dratt-inn-enn-not-dragged-in-yet-sc-note-id-l-merknad-i-manuset-note-in-the-script-filter.457b5371844a") : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")
                      }
                    >
                      {sc.done ? <Check className="size-3" aria-hidden /> : null}
                      {sc.noteId ? <StickyNote className="size-3" aria-hidden /> : null}
                      {sc.number ?? "–"}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        className="flex h-full items-center px-1 text-text-secondary hover:bg-surface-3 hover:text-text-primary"
        onClick={() => step(task, 1)}
        title={tk("app-shell-task-nav.task-nav-inner.title.4ab2a1c98bc8")}
        aria-label={tk("app-shell-task-nav.task-nav-inner.aria-label.2b4b6b3d7366")}
        data-testid="task-next"
      >
        <ChevronRight className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
