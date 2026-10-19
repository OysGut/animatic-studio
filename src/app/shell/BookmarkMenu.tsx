/** DV8 (B1–B4): «Sett bokmerke» og «Fortsett ved bokmerke» i toppmenyen. Personlig; andre påvirkes ikke. */
import { useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { L, bookmarkHref, bookmarkViewOf } from "@/core";
import { getMyBookmark, setMyBookmark, consumeMyBookmark } from "@/adapters/browser/bookmarks";
import { Button } from "@/components/ui/button";
import { sceneBookmarkContext } from "./bookmark-context";

export function BookmarkMenu({ projectId }: { projectId: string }) {
  const router = useRouter();
  const location = useRouterState({ select: s => s.location });
  const qc = useQueryClient();
  const key = ["my-bookmark", projectId];
  const mark = useQuery({ queryKey: key, queryFn: () => getMyBookmark(projectId), staleTime: 30_000, retry: false });
  const [message, setMessage] = useState<string | null>(null);
  const view = bookmarkViewOf(location.pathname, projectId);
  async function save() {
    if (!view) return;
    const search = location.search as Record<string, unknown>;
    const scene = view === "scene" ? sceneBookmarkContext(projectId) : null;
    const occurrenceId = scene?.occurrenceId ?? (typeof search["scene"] === "string" ? search["scene"] : null);
    try {
      await setMyBookmark(projectId, { view, occurrenceId, ...(scene ? { frame: scene.frame, tab: scene.tab } : {}) });
      setMessage(L("Bokmerket er satt.", "The bookmark is set."));
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) { setMessage((e as Error).message); }
  }
  async function resume() {
    const b = mark.data;
    if (!b) return;
    const href = bookmarkHref(projectId, b.target);
    if (!href) { setMessage(L("Bokmerket peker til et sted som ikke finnes lenger. Det er beholdt.", "The bookmark points to a place that no longer exists. It has been kept.")); return; }
    try {
      await router.navigate({ href });
      // B3: fjernes først etter vellykket navigasjon
      await consumeMyBookmark(projectId, b.updatedAt);
      setMessage(null);
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) { setMessage(L(`Kunne ikke åpne bokmerket. Det er beholdt. ${(e as Error).message}`, `Could not open the bookmark. It has been kept. ${(e as Error).message}`)); }
  }
  return <div className="flex items-center gap-1">
    <Button variant="ghost" size="sm" data-testid="bookmark-set" disabled={!view} title={L("Sett et personlig bokmerke her (scene, tid og visning)", "Set a personal bookmark here (scene, time and view)")} aria-label={L("Sett bokmerke", "Set bookmark")} onClick={() => void save()}><Bookmark /><span className="hidden lg:inline">{L("Sett bokmerke", "Set bookmark")}</span></Button>
    {mark.data ? <Button variant="ghost" size="sm" data-testid="bookmark-resume" title={L("Fortsett der du satte bokmerket", "Continue where you set the bookmark")} aria-label={L("Fortsett ved bokmerke", "Continue at bookmark")} onClick={() => void resume()}><BookmarkCheck /><span className="hidden lg:inline">{L("Fortsett ved bokmerke", "Continue at bookmark")}</span></Button> : null}
    {message ? <span role="status" data-testid="bookmark-status" className="max-w-48 truncate text-xs text-text-secondary" title={message}>{message}</span> : null}
  </div>;
}
