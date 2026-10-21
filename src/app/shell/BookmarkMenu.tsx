/** DV8 (B1–B4): «Sett bokmerke» og «Fortsett ved bokmerke» i toppmenyen. Personlig; andre påvirkes ikke. */
import { useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { bookmarkHref, bookmarkViewOf } from "@/core";
import { getMyBookmark, setMyBookmark, consumeMyBookmark } from "@/adapters/browser/bookmarks";
import { Button } from "@/components/ui/button";
import { sceneBookmarkContext } from "./bookmark-context";
import { t } from "@/core/i18n/keyed";

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
      setMessage(t("app-shell-bookmark-menu.save.set-message.0d7d623c4fc2"));
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) { setMessage((e as Error).message); }
  }
  async function resume() {
    const b = mark.data;
    if (!b) return;
    const href = bookmarkHref(projectId, b.target);
    if (!href) { setMessage(t("app-shell-bookmark-menu.resume.set-message.e3c3cc444e28")); return; }
    try {
      await router.navigate({ href });
      // B3: fjernes først etter vellykket navigasjon
      await consumeMyBookmark(projectId, b.updatedAt);
      setMessage(null);
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) { setMessage(t("app-shell-bookmark-menu.resume.set-message.e0f9e74a6da2", { message: String((e as Error).message) })); }
  }
  return <div className="flex items-center gap-1">
    <Button variant="ghost" size="sm" data-testid="bookmark-set" disabled={!view} title={t("app-shell-bookmark-menu.bookmark-menu.title.e054fb3350cf")} aria-label={t("app-shell-bookmark-menu.bookmark-menu.aria-label.b99bcd654111")} onClick={() => void save()}><Bookmark /><span className="hidden lg:inline">{t("app-shell-bookmark-menu.bookmark-menu.span.b99bcd654111")}</span></Button>
    {mark.data ? <Button variant="ghost" size="sm" data-testid="bookmark-resume" title={t("app-shell-bookmark-menu.bookmark-menu.title.9738bf0127a2")} aria-label={t("app-shell-bookmark-menu.bookmark-menu.aria-label.95b8135ba329")} onClick={() => void resume()}><BookmarkCheck /><span className="hidden lg:inline">{t("app-shell-bookmark-menu.bookmark-menu.span.95b8135ba329")}</span></Button> : null}
    {message ? <span role="status" data-testid="bookmark-status" className="max-w-48 truncate text-xs text-text-secondary" title={message}>{message}</span> : null}
  </div>;
}
