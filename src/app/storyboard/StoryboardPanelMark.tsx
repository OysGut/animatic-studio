/**
 * SB-2: markering i sceneeditoren når den er åpnet fra et storyboardpanel (?panel=). Viser hvilket panel
 * og lar brukeren gå tilbake til galleriet med panelet valgt. Referansepanelet kommer i SB-5.
 */
import { Link } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { storyboardPanelsOf, type ProjectState } from "@/core";
import { t as tk } from "@/core/i18n/keyed";

export function StoryboardPanelMark({ state, panelId, projectId }: { state: ProjectState; panelId: string | null; projectId: string }) {
  const panel = panelId ? state.compositions[panelId] : undefined;
  if (!panel || panel.kind !== "storyboard" || panel.removed || !panel.occurrenceId) return null;
  const index = storyboardPanelsOf(state, panel.occurrenceId).findIndex((p) => p.id === panel.id);
  return (
    <div role="status" data-testid="sb-panel-mark" data-panel-id={panel.id}
      className="flex items-center gap-2 border-b border-accent-brand bg-accent-selection px-4 py-1 text-[13px] text-text-primary">
      <LayoutGrid className="size-4" aria-hidden />
      <span>{tk("sb2.mark", { number: String(index + 1), name: panel.name || "" })}</span>
      <Link to="/prosjekt/$projectId/storyboard" params={{ projectId }} search={{ panel: panel.id }} className="ms-auto underline">
        {tk("sb2.mark-back")}
      </Link>
    </div>
  );
}
