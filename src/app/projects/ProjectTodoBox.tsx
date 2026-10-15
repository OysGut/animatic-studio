/**
 * TODO-boksen på prosjektsiden (DEC-0088, Mars 15.10.2026): «Der vil Teddybjørn jobben ligge, og andre ting
 * som må kikkes på og merknader og kommentarer fra andre, mao her får en oversikt over hva som skal gjøres».
 * Samler oppgaver (elementer som skal inn i flere scener), notater fra andre, arbeidslisten, scener med
 * manusendringer og AI-genereringer som feilet.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ListTodo, MessageSquare, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import {
  L,
  discrepancies,
  filmClips,
  formatStamp,
  projectTodo,
  stepTask,
  type ProjectState,
} from "@/core";
import { useActiveProduction } from "@/app/project/use-production";
import { useAiJobs } from "@/app/ai/use-ai-jobs";
import { useWorklistCount } from "@/app/library/AssetWorklistDialog";
import { WorklistNotice } from "./WorklistNotice";

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
  const failedJobs = useMemo(() => {
    const now = Date.now();
    return (jobs.data?.jobs ?? []).filter(
      (j) =>
        (j.status === "failed" || j.status === "lost") &&
        now - Date.parse(j.finishedAt ?? j.createdAt) < WEEK_MS,
    ).length;
  }, [jobs.data]);
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
        {L("TODO", "TODO")}
      </h2>
      {empty ? (
        <p className="text-xs text-text-tertiary">
          {L("Ingenting som venter akkurat nå.", "Nothing waiting right now.")}
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
                  {L(
                    `«${t.assetName}» skal inn i ${t.scenes.length} scener – ${t.remaining} gjenstår`,
                    `“${t.assetName}” goes into ${t.scenes.length} scenes – ${t.remaining} left`,
                  )}
                </span>
                {next ? (
                  <Link
                    to="/prosjekt/$projectId/scene"
                    params={{ projectId }}
                    search={{ scene: next }}
                    className="text-accent-brand hover:underline"
                  >
                    {L("Gå til første scene", "Go to the first scene")}
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
              ? L("Ett notat fra andre i manuset", "One note from others in the script")
              : L(
                  `${todo.notesFromOthers.length} notater fra andre i manuset`,
                  `${todo.notesFromOthers.length} notes from others in the script`,
                )}
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
                    {L(`Scene ${n.number ?? "–"}`, `Scene ${n.number ?? "–"}`)}
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
              {allNotes ? L("Vis færre", "Show fewer") : L("Vis alle", "Show all")}
            </button>
          ) : null}
        </div>
      ) : null}

      {discrepancyScenes > 0 ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
          <AlertTriangle className="size-3.5 text-status-danger" aria-hidden />
          {discrepancyScenes === 1
            ? L("Én scene har", "One scene has")
            : L(`${discrepancyScenes} scener har`, `${discrepancyScenes} scenes have`)}{" "}
          {L(
            "manusendringer etter at 2D-scene eller film ble laget.",
            "script changes since its 2D scene or film was made.",
          )}
          <Link
            to="/prosjekt/$projectId/montering"
            params={{ projectId }}
            className="text-accent-brand hover:underline"
          >
            {L("Se i monteringen", "See in assembly")}
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
            ? L(
                "Én AI-generering feilet eller ble borte siste uke – se AI-statusen øverst.",
                "One AI generation failed or was lost in the last week – see the AI status at the top.",
              )
            : L(
                `${failedJobs} AI-genereringer feilet eller ble borte siste uke – se AI-statusen øverst.`,
                `${failedJobs} AI generations failed or were lost in the last week – see the AI status at the top.`,
              )}
        </p>
      ) : null}
    </section>
  );
}
