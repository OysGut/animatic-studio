/**
 * C-0 godkjenning av et eksternt program. To innganger på samme side:
 * - Authorization Code + PKCE: ?client_id&redirect_uri&code_challenge&code_challenge_method=S256&scope&state
 * - Enhetsflyt: ?user_code=XXXX-XXXX (eller koden skrives inn)
 * Brukeren velger ett prosjekt; tilgangen gjelder bare det og de viste tilgangene.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { parseScopes } from "@/core/connectors";
import { approveConnectorCode, decideDeviceCode, lookupDeviceCode } from "@/adapters/connectors/connectors.functions";
import { listProjects } from "@/adapters/browser/projects";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";

export interface ConsentSearch { client_id?: string; redirect_uri?: string; code_challenge?: string; code_challenge_method?: string; scope?: string; state?: string; user_code?: string }

function scopeLabel(scope: string): string {
  switch (scope) {
    case "project:read": return t("c0.scope.project-read");
    case "manifest:read": return t("c0.scope.manifest-read");
    case "assets:read": return t("c0.scope.assets-read");
    case "panels:read": return t("c0.scope.panels-read");
    case "transfers:write": return t("c0.scope.transfers-write");
    case "conflicts:read": return t("c0.scope.conflicts-read");
    case "notes:write": return t("c0.scope.notes-write");
    default: return t("c0.scope.other", { scope });
  }
}
const input = "h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

export function ConnectorConsent({ search, email }: { search: ConsentSearch; email: string }) {
  const projects = useQuery({ queryKey: ["c0-projects"], queryFn: listProjects });
  const approve = useServerFn(approveConnectorCode), lookup = useServerFn(lookupDeviceCode), decide = useServerFn(decideDeviceCode);
  const [projectId, setProjectId] = useState("");
  const [code, setCode] = useState(search.user_code ?? "");
  const [device, setDevice] = useState<{ clientId: string; scopes: string[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // C-2: programmer med eget skjema (ptg-…://) kan ikke alltid ta imot svaret (UXP lytter ikke på skjemaer),
  // så adressen vises også for innliming i programmet. Den inneholder en engangskode som utløper raskt.
  const [pasteBack, setPasteBack] = useState<string | null>(null);
  const pkce = !!search.client_id && !!search.redirect_uri;
  const clientId = pkce ? search.client_id! : device?.clientId ?? "";
  const scopes = pkce ? parseScopes(search.scope ?? "") ?? [] : device?.scopes ?? [];
  const list = ((projects.data ?? []) as { id: string; name: string }[]);

  async function find() {
    setBusy(true); setMsg(null);
    try { setDevice(await lookup({ data: { userCode: code } })); } catch { setMsg(t("c0.consent.bad-code")); } finally { setBusy(false); }
  }
  async function submit(ok: boolean) {
    if (!projectId && ok) return setMsg(t("c0.consent.pick-project"));
    setBusy(true); setMsg(null);
    try {
      if (pkce) {
        if (!ok) { const u = new URL(search.redirect_uri!); u.searchParams.set("error", "access_denied"); if (search.state) u.searchParams.set("state", search.state); window.location.assign(u.toString()); return; }
        const r = await approve({ data: { projectId, clientId: search.client_id!, redirectUri: search.redirect_uri!, challenge: search.code_challenge ?? "", method: search.code_challenge_method ?? "", scope: search.scope ?? "", state: search.state ?? "" } });
        if (/^ptg-[a-z0-9-]+:/i.test(r.redirect)) setPasteBack(r.redirect);
        window.location.assign(r.redirect);
        return;
      }
      await decide({ data: { userCode: code, projectId: projectId || "00000000-0000-4000-8000-000000000000", approve: ok } });
      setMsg(ok ? t("c0.consent.device-done") : t("c0.consent.denied"));
      setDevice(null);
    } catch { setMsg(t("c0.error")); } finally { setBusy(false); }
  }

  const showDecision = pkce || device;
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6" data-testid="c0-consent">
      <h1 className="text-lg font-semibold text-text-primary">{clientId ? t("c0.consent.title", { client: clientId }) : t("c0.consent.title-device")}</h1>
      <p className="text-[13px] text-text-secondary">{t("c0.consent.signed-in", { email })}</p>
      {!pkce && !device ? (
        <div className="flex flex-col gap-2">
          <label className="text-[13px] text-text-primary" htmlFor="c0-code">{t("c0.consent.code-label")}</label>
          <input id="c0-code" className={input} value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" />
          <Button disabled={busy || !code} onClick={() => void find()}>{t("c0.consent.continue")}</Button>
        </div>
      ) : null}
      {showDecision ? (
        <>
          <p className="text-[13px] text-text-primary">{t("c0.consent.explain", { client: clientId })}</p>
          {pkce ? <p className="text-[13px] text-text-secondary" dir="ltr">{t("c0.consent.redirect", { uri: redirectLabel(search.redirect_uri!) })}</p> : null}
          <ul className="list-disc ps-5 text-[13px] text-text-primary">
            {scopes.map(s => <li key={s}>{scopeLabel(s)}</li>)}
          </ul>
          <label className="text-[13px] text-text-primary" htmlFor="c0-project">{t("c0.consent.project")}</label>
          <select id="c0-project" className={input} value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">{t("c0.consent.pick-project")}</option>
            {list.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <p className="text-[13px] text-text-secondary">{t("c0.consent.boundary")}</p>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void submit(true)}>{t("c0.consent.approve")}</Button>
            <Button variant="outline" disabled={busy} onClick={() => void submit(false)}>{t("c0.consent.deny")}</Button>
          </div>
        </>
      ) : null}
      {pasteBack ? (
        <div className="flex flex-col gap-2" data-testid="c0-paste-back">
          <label className="text-[13px] text-text-primary" htmlFor="c0-paste-back">{t("c0.consent.paste-back", { client: clientId })}</label>
          <input id="c0-paste-back" className={input} dir="ltr" readOnly value={pasteBack} onFocus={e => e.currentTarget.select()} />
          <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(pasteBack).then(() => setMsg(t("c0.consent.paste-back-copied")), () => undefined)}>{t("c0.consent.paste-back-copy")}</Button>
        </div>
      ) : null}
      {msg ? <p role="status" className="text-[13px] text-text-secondary">{msg}</p> : null}
    </main>
  );
}

/** http(s) viser opprinnelsen; egne skjemaer (ptg-…://) har ingen opprinnelse og vises som skjema + vert. */
function redirectLabel(uri: string): string {
  const u = new URL(uri);
  return u.origin !== "null" ? u.origin : `${u.protocol}//${u.host}`;
}
