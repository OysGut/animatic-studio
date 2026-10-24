/**
 * C-4 Boords-innstillinger på kontosiden: egen API-nøkkel (bruker eller arbeidsgruppe), valgfri
 * webhook-hemmelighet, hva koblingen kan og ikke kan, og at Boords krever betalt plan. Nøkkelen sendes
 * én gang til serveren og vises aldri igjen; her ses bare de fire siste tegnene og status.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ADAPTERS, BOORDS_LIMITS } from "@/core/connectors";
import { myBoordsConnections, removeBoordsKey, saveBoordsKey } from "@/adapters/connectors/boords.functions";
import { listMyWorkspaces } from "@/adapters/browser/workspaces";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";

const KEY = ["boords-connections"] as const;
const input = "h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

export function BoordsCard({ userId }: { userId: string }) {
  const ready = useSchemaAtLeast(112);
  const qc = useQueryClient();
  const listFn = useServerFn(myBoordsConnections), save = useServerFn(saveBoordsKey), remove = useServerFn(removeBoordsKey);
  const conns = useQuery({ queryKey: KEY, queryFn: () => listFn(), enabled: ready });
  const ws = useQuery({ queryKey: ["my-workspaces", userId], queryFn: () => listMyWorkspaces(userId), enabled: ready });
  const [owner, setOwner] = useState<string>("user");
  const [key, setKey] = useState(""), [hook, setHook] = useState(""), [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null);
  if (!ready) return null;
  const caps = ADAPTERS.find(a => a.id === "boords-api")?.capabilities ?? [];
  const owned = (ws.data ?? []).filter(w => w.role === "owner");
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const r = await save({ data: { owner: owner === "user" ? "user" : "workspace", workspaceId: owner === "user" ? null : owner, key, label, webhookSecret: hook } });
      setMsg(r.message);
      if (r.ok) { setKey(""); setHook(""); await qc.invalidateQueries({ queryKey: KEY }); }
    } catch { setMsg(t("c4.error")); } finally { setBusy(false); }
  }
  async function doRemove(id: string) {
    setBusy(true); setMsg(null);
    try { await remove({ data: { id } }); setMsg(t("c4.removed")); await qc.invalidateQueries({ queryKey: KEY }); }
    catch { setMsg(t("c4.error")); } finally { setBusy(false); }
  }

  return (
    <section data-testid="c4-boords" className="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4">
      <h2 className="text-sm font-semibold text-text-primary">{t("c4.title")}</h2>
      <p className="text-[13px] text-text-secondary">{t("c4.intro")}</p>
      <p className="text-[13px] font-medium text-text-primary" data-testid="c4-paid">{t("c4.paid-plan")}</p>
      <div className="text-[13px] text-text-secondary">
        <p>{t("c4.can", { list: caps.map(c => t(`c4.cap.${c}`)).join(", ") })}</p>
        <ul className="list-disc ps-5" data-testid="c4-limits">{BOORDS_LIMITS.map(l => <li key={l}>{t(`c4.limit.${l}`)}</li>)}</ul>
      </div>
      <ul className="flex flex-col gap-2">
        {(conns.data ?? []).map(c => (
          <li key={c.id} data-testid="c4-connection-row" className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border p-2 text-[13px]">
            <div className="flex min-w-0 flex-col">
              <span className="font-medium text-text-primary" dir="auto">{c.ownerKind === "workspace" ? t("c4.owner.workspace") : t("c4.owner.user")} · {c.keyHint}{c.label ? ` · ${c.label}` : ""}</span>
              <span className="text-text-secondary">{t(`c4.status.${c.status}`)}{c.lastSyncAt ? ` · ${t("c4.last-sync", { date: new Date(c.lastSyncAt).toLocaleString() })}` : ""}</span>
              {c.webhook ? <span className="break-all text-text-secondary">{t("c4.webhook-url")} <code>{`${origin}/api/public/boords/webhook/${c.id}`}</code></span> : <span className="text-text-secondary">{t("c4.webhook-none")}</span>}
            </div>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void doRemove(c.id)}>{t("c4.remove")}</Button>
          </li>
        ))}
      </ul>
      <form onSubmit={e => void submit(e)} className="flex flex-col gap-2" data-testid="c4-form">
        <label className="flex flex-col gap-1 text-[13px]">{t("c4.owner")}
          <select className={input} value={owner} onChange={e => setOwner(e.target.value)} data-testid="c4-owner">
            <option value="user">{t("c4.owner.user")}</option>
            {owned.map(w => <option key={w.id} value={w.id}>{t("c4.owner.workspace-named", { name: w.name })}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px]">{t("c4.key")}
          <input className={input} type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} data-testid="c4-key" />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">{t("c4.webhook-secret")}
          <input className={input} type="password" autoComplete="off" value={hook} onChange={e => setHook(e.target.value)} data-testid="c4-webhook" />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">{t("c4.label")}
          <input className={input} value={label} maxLength={80} onChange={e => setLabel(e.target.value)} />
        </label>
        <p className="text-[12px] text-text-secondary">{t("c4.key-safety")}</p>
        <Button type="submit" size="sm" disabled={busy || key.trim().length < 8} data-testid="c4-save">{t("c4.save")}</Button>
      </form>
      {msg ? <p role="status" className="text-[13px] text-text-secondary">{msg}</p> : null}
    </section>
  );
}
