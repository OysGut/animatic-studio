/**
 * C-0 «Tilkoblede programmer» på kontosiden: aktive sesjoner med prosjekt, tilganger og tilbaketrekking,
 * og åpne konflikter fra mottatte filer med de fire valgene. Ingenting godkjennes automatisk; «Bruk
 * innkommende» kjører den vanlige, angrebare ApproveAssetVersion-kommandoen først.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { locale } from "@/core";
import { resolveConflict, type ConflictChoice } from "@/core/connectors";
import { myConnectorSessions, myOpenConnectorConflicts, resolveConnectorConflict, revokeConnectorSession } from "@/adapters/connectors/connectors.functions";
import { runCommand } from "@/adapters/storage/commands.functions";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";

const KEY = ["connector-sessions"] as const;
const CONFLICTS = ["connector-conflicts"] as const;
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale()) : "–");

export function ConnectorsCard() {
  const ready = useSchemaAtLeast(109);
  const qc = useQueryClient();
  const list = useServerFn(myConnectorSessions), revoke = useServerFn(revokeConnectorSession);
  const conflictsFn = useServerFn(myOpenConnectorConflicts), resolve = useServerFn(resolveConnectorConflict), run = useServerFn(runCommand);
  const sessions = useQuery({ queryKey: KEY, queryFn: () => list(), enabled: ready });
  const conflicts = useQuery({ queryKey: CONFLICTS, queryFn: () => conflictsFn(), enabled: ready });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!ready) return null;
  const active = (sessions.data ?? []).filter(s => !s.revokedAt && Date.parse(s.expiresAt) > Date.now());

  async function doRevoke(id: string) {
    setBusy(id); setMsg(null);
    try { await revoke({ data: { id } }); setMsg(t("c0.account.revoked")); await qc.invalidateQueries({ queryKey: KEY }); }
    catch { setMsg(t("c0.error")); } finally { setBusy(null); }
  }
  async function choose(c: { id: string; projectId: string; variantId: string; incomingVersionId: string; revision: number }, choice: ConflictChoice) {
    setBusy(c.id); setMsg(null);
    try {
      const plan = resolveConflict(choice, c);
      if (plan.command) await run({ data: { projectId: c.projectId, command: plan.command } });
      await resolve({ data: { id: c.id, choice, revision: c.revision } });
      setMsg(t("c0.conflict.done"));
      await qc.invalidateQueries({ queryKey: CONFLICTS });
    } catch { setMsg(t("c0.error")); } finally { setBusy(null); }
  }

  return (
    <section data-testid="c0-connectors" className="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4">
      <h2 className="text-sm font-semibold text-text-primary">{t("c0.account.title")}</h2>
      <p className="text-[13px] text-text-secondary">{t("c0.account.intro")}</p>
      {sessions.isError ? <p role="alert" className="text-[13px] text-text-secondary">{t("c0.error")}</p> : null}
      {active.length === 0 && !sessions.isLoading ? <p className="text-[13px] text-text-secondary">{t("c0.account.none")}</p> : null}
      <ul className="flex flex-col gap-2">
        {active.map(s => (
          <li key={s.id} data-testid="c0-session" className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border p-2">
            <div className="flex min-w-0 flex-col text-[13px]">
              <span className="font-medium text-text-primary" dir="auto">{s.clientId}</span>
              <span className="text-text-secondary" dir="auto">{t("c0.account.project", { name: s.projectName })}</span>
              <span className="text-text-secondary">{t("c0.account.scopes", { scopes: s.scopes.join(", ") })}</span>
              <span className="text-text-secondary">{t("c0.account.used", { date: date(s.lastUsedAt) })} · {t("c0.account.expires", { date: date(s.expiresAt) })}</span>
            </div>
            <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => void doRevoke(s.id)} aria-label={t("c0.account.revoke-aria", { name: s.clientId })}>{t("c0.account.revoke")}</Button>
          </li>
        ))}
      </ul>
      {(conflicts.data ?? []).length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold text-text-primary">{t("c0.conflict.title")}</h3>
          <p className="text-[13px] text-text-secondary">{t("c0.conflict.intro")}</p>
          {(conflicts.data ?? []).map(c => (
            <div key={c.id} data-testid="c0-conflict" className="flex flex-col gap-2 rounded-sm border border-border p-2 text-[13px]">
              <span className="text-text-primary" dir="auto">{c.assetName} · {c.projectName}</span>
              <span className="text-text-secondary">{t("c0.conflict.versions", { current: String(c.currentNumber ?? "–"), incoming: String(c.incomingNumber ?? "–"), base: String(c.baseNumber ?? "–") })}</span>
              <Link to="/prosjekt/$projectId/bibliotek" params={{ projectId: c.projectId }} className="text-accent-brand underline">{t("c0.conflict.compare")}</Link>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy === c.id} onClick={() => void choose(c, "keep_both")}>{t("c0.conflict.keep-both")}</Button>
                <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => void choose(c, "choose_current")}>{t("c0.conflict.current")}</Button>
                <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => void choose(c, "choose_incoming")}>{t("c0.conflict.incoming")}</Button>
                <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => void choose(c, "reject")}>{t("c0.conflict.reject")}</Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {msg ? <p role="status" className="text-[13px] text-text-secondary">{msg}</p> : null}
    </section>
  );
}
