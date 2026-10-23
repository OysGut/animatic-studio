/**
 * B-116: «Mine delinger» – alt brukeren har delt, for alltid, med status (venter godkjenning, synlig,
 * utløpt, trukket tilbake, avvist). Redigering (tittel, tekst, utløp) og tilbaketrekking når som helst.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMyShowcaseItems, revokeShowcaseItem, updateShowcaseItem } from "@/adapters/browser/showcase";
import type { MyShowcaseItem, ShowcaseDisplayStatus } from "@/core/community";
import { ShowcaseCard } from "./ShowcaseCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/core/i18n/keyed";
import { useTimeFormat } from "@/app/i18n/time-format";

export const MY_SHOWCASE_KEY = ["showcase-mine"] as const;

export function MyShowcasePage() {
  const statusLabel = (s: ShowcaseDisplayStatus): string =>
  s === "pending"
    ? t("b116.status.pending")
    : s === "live"
      ? t("b116.status.live")
      : s === "expired"
        ? t("b116.status.expired")
        : s === "revoked"
          ? t("b116.status.revoked")
          : t("b116.status.rejected");

  const time = useTimeFormat();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: MY_SHOWCASE_KEY, queryFn: () => fetchMyShowcaseItems(Date.now()) });
  const [editing, setEditing] = useState<MyShowcaseItem | null>(null);
  const [revoking, setRevoking] = useState<MyShowcaseItem | null>(null);
  const [failed, setFailed] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: MY_SHOWCASE_KEY });

  async function revoke() {
    if (!revoking) return;
    setFailed(false);
    const err = await revokeShowcaseItem(revoking.id);
    if (err) setFailed(true);
    else { setRevoking(null); refresh(); }
  }

  const items = q.data ?? [];
  return (
    <main className="mx-auto flex w-full max-w-[960px] flex-col gap-4 px-6 py-8" data-testid="showcase-mine">
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{t("b116.mine.title")}</h1>
      {q.isLoading ? (
        <p className="text-xs text-text-tertiary">{t("b116.loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-secondary" data-testid="showcase-mine-empty">{t("b116.mine.empty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id} data-testid={`showcase-mine-item-${item.id}`} className="flex flex-col gap-2">
              <ShowcaseCard item={item} />
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span data-testid={`showcase-status-${item.id}`}
                  className={"rounded-sm px-1.5 py-px " + (item.status === "live" ? "bg-status-success/20 text-status-success" : item.status === "pending" ? "bg-status-discrepancy/20 text-status-discrepancy" : "bg-surface-3 text-text-secondary")}>
                  {statusLabel(item.status)}
                </span>
                {item.expiresAt && item.status !== "revoked" ? (
                  <span className="tabular text-text-tertiary">{t("b116.mine.expiresAt", { date: time.exact(item.expiresAt) })}</span>
                ) : null}
                <span className="text-text-tertiary">{item.projectName}</span>
              </div>
              {item.status !== "revoked" ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" data-testid={`showcase-edit-${item.id}`} onClick={() => setEditing(item)}>
                    {t("b116.mine.edit")}
                  </Button>
                  <Button size="sm" variant="ghost" data-testid={`showcase-revoke-${item.id}`} onClick={() => { setFailed(false); setRevoking(item); }}>
                    {t("b116.mine.revoke")}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <EditDialog item={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      <Dialog open={revoking !== null} onOpenChange={(o) => !o && setRevoking(null)}>
        <DialogContent uiId="V-056" className="max-w-[400px]" data-testid="showcase-revoke-dialog">
          <DialogHeader><DialogTitle>{t("b116.mine.revoke")}</DialogTitle></DialogHeader>
          <p className="text-xs text-text-secondary">{t("b116.mine.revokeConfirm")}</p>
          {failed ? <p role="alert" className="text-xs text-status-danger">{t("b116.create.failed")}</p> : null}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRevoking(null)}>{t("b116.cancel")}</Button>
            <Button size="sm" variant="destructive" data-testid="showcase-revoke-confirm" onClick={() => void revoke()}>{t("b116.mine.revoke")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function EditDialog({ item, onClose, onSaved }: { item: MyShowcaseItem | null; onClose: () => void; onSaved: () => void }) {
  const editExpiresLabel = (days: number): string =>
    days === 7 ? t("b116.expires.7") : days === 14 ? t("b116.expires.14") : days === 30 ? t("b116.expires.30") : t("b116.expires.90");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if (item && item.id !== lastId) {
    setLastId(item.id);
    setTitle(item.title);
    setText(item.text);
    setDays(7);
    setFailed(false);
  }

  async function save() {
    if (!item) return;
    setBusy(true);
    setFailed(false);
    const err = await updateShowcaseItem(item.id, {
      title: title.trim(),
      text,
      expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    });
    setBusy(false);
    if (err) setFailed(true);
    else { onClose(); onSaved(); }
  }

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent uiId="V-055" className="max-w-[440px]" data-testid="showcase-edit-dialog">
        <DialogHeader><DialogTitle>{t("b116.mine.edit")}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="showcase-edit-title" className="text-xs text-text-secondary">{t("b116.create.titleLabel")}</Label>
            <Input id="showcase-edit-title" data-testid="showcase-edit-title" maxLength={200} value={title}
              onChange={(e) => setTitle(e.target.value)} className="h-8 bg-surface-3 text-xs" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="showcase-edit-text" className="text-xs text-text-secondary">{t("b116.create.textLabel")}</Label>
            <textarea id="showcase-edit-text" data-testid="showcase-edit-text" rows={3} maxLength={280} value={text}
              onChange={(e) => setText(e.target.value)}
              className="rounded-sm border border-border-control bg-surface-3 px-2 py-1 text-xs text-text-primary" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="showcase-edit-expires" className="text-xs text-text-secondary">{t("b116.create.expires")}</Label>
            <select id="showcase-edit-expires" data-testid="showcase-edit-expires" value={days} onChange={(e) => setDays(Number(e.target.value))}
              className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary">
              {[7, 14, 30, 90].map((d) => <option key={d} value={d}>{editExpiresLabel(d)}</option>)}
            </select>
          </div>
          {failed ? <p role="alert" className="text-xs text-status-danger">{t("b116.create.failed")}</p> : null}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>{t("b116.cancel")}</Button>
            <Button size="sm" data-testid="showcase-edit-save" disabled={busy || !title.trim()} onClick={() => void save()}>{t("b116.mine.save")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
