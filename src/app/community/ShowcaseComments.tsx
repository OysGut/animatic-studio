/**
 * B-116: kommentarer på et bidrag i utstillingsvinduet. Alle ser kommentarene til et synlig bidrag;
 * bare innloggede kan skrive, fjerne egne og rapportere (håndheves i databasen, 0087).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Trash2 } from "lucide-react";
import { addShowcaseComment, fetchShowcaseComments, removeShowcaseComment, reportContent } from "@/adapters/browser/showcase";
import { showcaseCommentError } from "@/core/community";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";
import { useTimeFormat } from "@/app/i18n/time-format";

export const SHOWCASE_COMMENTS_KEY = "showcase-comments";

export function ShowcaseComments({ itemId, signedIn }: { itemId: string; signedIn: boolean }) {
  const qc = useQueryClient();
  const time = useTimeFormat();
  const q = useQuery({ queryKey: [SHOWCASE_COMMENTS_KEY, itemId], queryFn: () => fetchShowcaseComments(itemId) });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: [SHOWCASE_COMMENTS_KEY, itemId] });

  async function submit() {
    if (showcaseCommentError(text)) return;
    setBusy(true);
    const err = await addShowcaseComment(itemId, text.trim());
    setBusy(false);
    if (err) setNotice(t("b116.comments.failed"));
    else { setText(""); setNotice(null); refresh(); }
  }
  async function remove(id: string) {
    setBusy(true);
    await removeShowcaseComment(id);
    setBusy(false);
    refresh();
  }
  async function report(kind: "showcase" | "comment", id: string) {
    setBusy(true);
    const err = await reportContent(kind, id, "other", "");
    setBusy(false);
    setNotice(err ? t("b116.comments.failed") : t("b116.report.sent"));
  }

  const comments = q.data ?? [];
  return (
    <section data-testid="showcase-comments" aria-label={t("b116.comments.title")} className="flex flex-col gap-2 border-t border-border px-4 py-3">
      <h4 className="text-xs font-semibold text-text-primary">{t("b116.comments.title")}</h4>
      {comments.length === 0 ? (
        <p className="text-[11px] text-text-tertiary">{t("b116.comments.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <li key={c.id} data-testid="showcase-comment" className="flex items-start gap-2 text-xs">
              <div className="min-w-0 flex-1">
                <span className="font-medium text-text-primary">{c.authorName || "–"}</span>{" "}
                <span className="tabular text-text-tertiary">{c.createdAt ? time.relative(c.createdAt) : ""}</span>
                <p className="whitespace-pre-line text-text-secondary">{c.text}</p>
              </div>
              {signedIn ? (
                <span className="flex shrink-0 gap-1">
                  {c.mine ? (
                    <button type="button" aria-label={t("b116.comments.remove")} title={t("b116.comments.remove")} disabled={busy}
                      onClick={() => void remove(c.id)}
                      className="rounded-sm p-1 text-text-tertiary hover:bg-surface-2 hover:text-status-danger">
                      <Trash2 className="size-3" />
                    </button>
                  ) : null}
                  <button type="button" aria-label={t("b116.report")} title={t("b116.report")} disabled={busy}
                    data-testid={`report-comment-${c.id}`}
                    onClick={() => void report("comment", c.id)}
                    className="rounded-sm p-1 text-text-tertiary hover:bg-surface-2 hover:text-text-primary">
                    <Flag className="size-3" />
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {signedIn ? (
        <div className="flex items-start gap-2">
          <label htmlFor={`comment-${itemId}`} className="sr-only">{t("b116.comments.title")}</label>
          <textarea id={`comment-${itemId}`} data-testid="showcase-comment-input" rows={2} maxLength={2000}
            value={text} onChange={(e) => setText(e.target.value)} placeholder={t("b116.comments.placeholder")}
            className="min-h-8 flex-1 rounded-sm border border-border-control bg-surface-3 px-2 py-1 text-xs text-text-primary" />
          <Button size="sm" data-testid="showcase-comment-submit" disabled={busy || showcaseCommentError(text) !== null} onClick={() => void submit()}>
            {t("b116.comments.submit")}
          </Button>
        </div>
      ) : (
        <p className="text-[11px] text-text-tertiary">{t("b116.comments.login")}</p>
      )}
      <div className="flex items-center justify-between">
        {notice ? <p role="status" className="text-[11px] text-text-secondary">{notice}</p> : <span />}
        {signedIn ? (
          <button type="button" data-testid={`report-item-${itemId}`} disabled={busy} onClick={() => void report("showcase", itemId)}
            className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-primary">
            <Flag className="size-3" aria-hidden /> {t("b116.report")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
