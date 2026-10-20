/** SL6: shared suggestion query and saved-source navigation. */
import { createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listStorySuggestions } from "@/adapters/storylab/sessions.functions";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { t } from "@/core/i18n/keyed";

export const suggestionKey = (projectId: string) => ["story-suggestions", projectId] as const;
export function useStorySuggestions(projectId: string) {
  const list = useServerFn(listStorySuggestions);
  return useQuery({ queryKey: suggestionKey(projectId), queryFn: async () => {
    const r = await list({ data: { projectId } });
    if (!r.ok) throw new Error(r.message);
    return r.suggestions;
  } });
}
export const SuggestionsNavigation = createContext<(id: string) => void>(() => {});
export function SavedSuggestion({ id }: { id: string }) {
  const open = useContext(SuggestionsNavigation);
  return <ToolbarButton className="text-xs" onClick={() => open(id)} data-testid="storylab-suggestion-saved">{t("app-storylab-suggestions-data.saved-suggestion.toolbar-button.b84b802541c7")}</ToolbarButton>;
}
export function useSuggestionSaved(projectId: string) {
  const qc = useQueryClient();
  return (id: string) => { void qc.invalidateQueries({ queryKey: suggestionKey(projectId) }); return id; };
}