/**
 * TODO-boksen på prosjektsiden (DEC-0088, Mars 15.10.2026): «Der vil Teddybjørn jobben ligge, og andre ting
 * som må kikkes på og merknader og kommentarer fra andre, mao her får en oversikt over hva som skal gjøres».
 * Samler oppgaver (elementer som skal inn i flere scener), notater fra andre, arbeidslisten, scener med
 * manusendringer og AI-genereringer som feilet.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ListTodo, MessageSquare, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { AI_JOBS_READ_KEY, discrepancies, filmClips, formatStamp, isAiJobsReadPrefs, isJobRead, markAllJobsRead, projectTodo, stepTask, type AiJobsReadPrefs, type ProjectState } from "@/core";
import { useActiveProduction } from "@/app/project/use-production";
import { useAiJobs } from "@/app/ai/use-ai-jobs";
import { useUiPref } from "@/app/account/ui-prefs";
import { useWorklistCount } from "@/app/library/AssetWorklistDialog";
import { WorklistNotice } from "./WorklistNotice";
import { t as tk } from "@/core/i18n/keyed";

const WEEK_MS = 7 * 24 * 3600 * 1000;
const NOTES_SHOWN = 5;

export function ProjectTodoBox({
  state,
  projectId,
  userId,
  myName,
  editable,
}: {
  state: ProjectState;
  projectId: string;
  userId: string;
  myName: string;
  editable: boolean;
}) {
  const [productionId] = useActiveProduction(projectId, state);
  const todo = useMemo(
    () => projectTodo(state, productionId, { myName }),
    [state, productionId, myName],
  );
  const discrepancyScenes = useMemo(
    () =>
      new Set(
        discrepancies(state, filmClips(state, productionId), { spans: false }).map(
          (d) => d.occurrenceId,
        ),
      ).size,
    [state, productionId],
  );
  const worklist = useWorklistCount(state, projectId, productionId);
  const jobs = useAiJobs(projectId);
  const [readPrefs, setReadPrefs] = useUiPref<AiJobsReadPrefs>(AI_JOBS_READ_KEY, {}, isAiJobsReadPrefs);
  const failedJobs = useMemo(() => {
    const now = Date.now();
    return (jobs.data?.jobs ?? []).filter(
      (j) =>
        (j.status === "failed" || j.status === "lost") &&
        now - Date.parse(j.finishedAt ?? j.createdAt) < WEEK_MS &&
        !isJobRead(j, readPrefs),
    ).length;
  }, [jobs.data, readPrefs]);
  const [allNotes, setAllNotes] = useState(false);
  const empty =
    !todo.tasks.length &&
    !todo.notesFromOthers.length &&
    !discrepancyScenes &&
    !worklist &&
    !failedJobs;
  const notes = allNotes ? todo.notesFromOthers : todo.notesFromOthers.slice(0, NOTES_SHOWN);

  return (
    <section
      aria-labelledby="todo-title"
      className="mt-8 rounded-md border border-border bg-surface-1 p-4"
      data-testid="project-todo"
    >
      <h2
        id="todo-title"
        className="mb-2 flex items-center gap-2 text-base font-semibold text-text-primary"
      >
        <ListTodo className="size-4 text-accent-warm" aria-hidden />
        {tk("app-projects-project-todo-box.project-todo-box.h2.c773fde750b7")}
      </h2>
      {empty ? (
        <p className="text-xs text-text-tertiary">
          {tk("app-projects-project-todo-box.project-todo-box.p.61e67abdc149")}
        </p>
      ) : null}

      {todo.tasks.length ? (
        <ul className="space-y-1.5" data-testid="todo-tasks">
          {todo.tasks.map((t) => {
            const next = stepTask(t, null, 1);
            return (
              <li key={t.taskId} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="size-2 shrink-0 rounded-full bg-accent-warm" aria-hidden />
                <span className="text-text-primary">
                  {tk("app-projects-project-todo-box.project-todo-box.span.b976cf4d9c0d", { assetName: String(t.assetName), length: String(t.scenes.length), remaining: String(t.remaining) })}
                </span>
                {next ? (
                  <Link
                    to="/prosjekt/$projectId/scene"
                    params={{ projectId }}
                    search={{ scene: next }}
                    className="text-accent-brand hover:underline"
                  >
                    {tk("app-projects-project-todo-box.project-todo-box.link.2c4d42ee9d02")}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {todo.notesFromOthers.length ? (
        <div className="mt-3" data-testid="todo-notes">
          <p className="flex items-center gap-2 text-xs text-text-secondary">
            <MessageSquare className="size-3.5 text-text-tertiary" aria-hidden />
            {todo.notesFromOthers.length === 1
              ? tk("app-projects-project-todo-box.project-todo-box.p.4f991887329d")
              : tk("app-projects-project-todo-box.project-todo-box.p.82edc7d1f313", { length: String(todo.notesFromOthers.length) })}
          </p>
          <ul className="mt-1 space-y-1 pl-5">
            {notes.map((n) => (
              <li key={n.annotation.id} className="flex items-baseline gap-2 text-xs">
                {n.occurrenceId ? (
                  <Link
                    to="/prosjekt/$projectId/manus"
                    params={{ projectId }}
                    search={{ scene: n.occurrenceId }}
                    className="shrink-0 text-accent-brand hover:underline"
                  >
                    {tk("app-projects-project-todo-box.project-todo-box.link.99bb3b1415f1", { value1: String(n.number ?? "–") })}
                  </Link>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-text-primary">
                  {n.annotation.text}
                </span>
                <span className="shrink-0 text-text-tertiary">{formatStamp(n.annotation)}</span>
              </li>
            ))}
          </ul>
          {todo.notesFromOthers.length > NOTES_SHOWN ? (
            <button
              type="button"
              className="mt-1 pl-5 text-xs text-accent-brand hover:underline"
              onClick={() => setAllNotes((v) => !v)}
            >
              {allNotes ? tk("app-projects-project-todo-box.project-todo-box.button.86a35ad92db8") : tk("app-projects-project-todo-box.project-todo-box.button.42d6bd7f3fa7")}
            </button>
          ) : null}
        </div>
      ) : null}

      {discrepancyScenes > 0 ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
          <AlertTriangle className="size-3.5 text-status-danger" aria-hidden />
          {discrepancyScenes === 1
            ? tk("app-projects-project-todo-box.project-todo-box.p.3822f3cbeeef")
            : tk("app-projects-project-todo-box.project-todo-box.p.2e1ba2b88d4d", { discrepancyScenes: String(discrepancyScenes) })}{" "}
          {tk("app-projects-project-todo-box.project-todo-box.p.ec4f4f6d847e")}
          <Link
            to="/prosjekt/$projectId/montering"
            params={{ projectId }}
            className="text-accent-brand hover:underline"
          >
            {tk("app-projects-project-todo-box.project-todo-box.link.c3d2e45ca772")}
          </Link>
        </p>
      ) : null}

      <WorklistNotice
        state={state}
        projectId={projectId}
        productionId={productionId}
        userId={userId}
        editable={editable}
      />

      {failedJobs > 0 ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
          <TriangleAlert className="size-3.5 text-status-danger" aria-hidden />
          {failedJobs === 1
            ? tk("app-projects-project-todo-box.project-todo-box.p.8ebd7504c0a4")
            : tk("app-projects-project-todo-box.project-todo-box.p.3470acb79010", { failedJobs: String(failedJobs) })}
          <button
            type="button"
            data-testid="todo-jobs-mark-all-read"
            className="text-accent-brand hover:underline"
            onClick={() => setReadPrefs(markAllJobsRead(new Date().toISOString()))}
          >
            {tk("app-projects-project-todo-box.mark-all-read")}
          </button>
        </p>
      ) : null}
    </section>
  );
}
