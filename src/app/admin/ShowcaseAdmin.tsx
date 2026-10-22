/**
 * B-116: administratorkøen for utstillingsvinduet – bidrag som venter på godkjenning, og bryteren
 * som kan slå av godkjenningskravet. Databasen håndhever (0087); dette er bare styringen.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminShowcaseQueue, reviewShowcaseItem, setShowcaseApproval } from "@/adapters/browser/showcase";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";

export const ADMIN_SHOWCASE_KEY = ["admin-showcase"] as const;

const KIND_LABEL = {
  character: t("b116.kind.character"),
  asset: t("b116.kind.asset"),
  scene: t("b116.kind.scene"),
  script: t("b116.kind.script"),
  audio: t("b116.kind.audio"),
} as const;

export function ShowcaseAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ADMIN_SHOWCASE_KEY, queryFn: fetchAdminShowcaseQueue });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ADMIN_SHOWCASE_KEY });

  async function review(id: string, approve: boolean) {
    setBusy(true); setFailed(false);
    const err = await reviewShowcaseItem(id, approve);
    setBusy(false);
    if (err) setFailed(true);
    refresh();
  }
  async function toggleApproval(required: boolean) {
    setBusy(true); setFailed(false);
    const err = await setShowcaseApproval(required);
    setBusy(false);
    if (err) setFailed(true);
    refresh();
  }

  if (!q.data) return null;
  const { requireApproval, items } = q.data;
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4" data-testid="admin-showcase">
      <h2 className="text-sm font-semibold text-text-primary">{t("b116.admin.title")}</h2>
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <input type="checkbox" data-testid="admin-showcase-approval" checked={requireApproval} disabled={busy}
          onChange={(e) => void toggleApproval(e.target.checked)}
          className="size-3.5 accent-[var(--accent-brand)]" />
        {t("b116.admin.approval")}
      </label>
      {items.length === 0 ? (
        <p className="text-xs text-text-tertiary" data-testid="admin-showcase-empty">{t("b116.admin.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} data-testid={`admin-showcase-item-${item.id}`} className="flex flex-col gap-2 rounded-sm border border-border p-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                <span className="font-semibold text-text-primary">{item.title}</span>
                <span className="text-text-tertiary">{KIND_LABEL[item.kind]}</span>
                <span className="text-text-secondary">{item.authorName || "–"}</span>
                <span className="text-text-tertiary">{item.projectName}</span>
              </div>
              {item.text ? <p className="whitespace-pre-line text-xs text-text-secondary">{item.text}</p> : null}
              {item.excerpt ? <p className="whitespace-pre-line text-xs italic text-text-secondary">{item.excerpt}</p> : null}
              <div className="flex gap-2">
                <Button size="sm" data-testid={`admin-showcase-approve-${item.id}`} disabled={busy} onClick={() => void review(item.id, true)}>
                  {t("b116.admin.approve")}
                </Button>
                <Button size="sm" variant="secondary" data-testid={`admin-showcase-reject-${item.id}`} disabled={busy} onClick={() => void review(item.id, false)}>
                  {t("b116.admin.reject")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {failed ? <p role="alert" className="text-xs text-status-danger">{t("b116.admin.failed")}</p> : null}
    </section>
  );
}
