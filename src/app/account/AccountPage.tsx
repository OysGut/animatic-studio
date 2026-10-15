/**
 * Min konto (DEC-0086, Mars 15.10.2026: «når jeg klikker på brukernavnet … en side med mine innstillinger,
 * bla annet foretrukket språk og forbrukte kreditter, endre passord, osv»). Profil, språk, passord,
 * AI-forbruk med kostnadsrapport, personvern og «Slett kontoen min».
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { L, locale, tm } from "@/core";
import { changePassword, saveDisplayName } from "@/adapters/browser/account";
import { signOut } from "@/adapters/browser/auth";
import { requestMyDeletion } from "@/adapters/account/account.functions";
import { LanguageSwitch } from "@/app/i18n/language";
import { useCloseToPrevious } from "@/app/shell/back-navigation";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { Button } from "@/components/ui/button";
import { CostReportView } from "./CostReportView";
import { MY_ACCOUNT_KEY, PrivacyLink, useMyAccount } from "./use-account";

function Card({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section
      id={id}
      className="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4"
    >
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

const input =
  "h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

export function AccountPage({ email }: { email: string }) {
  const qc = useQueryClient();
  const ready = useSchemaAtLeast(33);
  const account = useMyAccount();
  const a = account.data;
  const [name, setName] = useState<string | null>(null);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [delMsg, setDelMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const close = useCloseToPrevious();

  async function saveName() {
    if (name === null) return;
    const e = await saveDisplayName(name);
    setNameMsg(e ? tm(e.message) : L("Lagret.", "Saved."));
    if (!e) {
      setName(null);
      void qc.invalidateQueries({ queryKey: MY_ACCOUNT_KEY });
    }
  }
  async function savePassword() {
    if (pw.length < 8)
      return setPwMsg({
        ok: false,
        text: L("Passordet må ha minst 8 tegn.", "The password must have at least 8 characters."),
      });
    if (pw !== pw2)
      return setPwMsg({
        ok: false,
        text: L("Passordene er ikke like.", "The passwords are not the same."),
      });
    setBusy(true);
    const e = await changePassword(pw);
    setBusy(false);
    setPwMsg(
      e
        ? { ok: false, text: tm(e.message) }
        : { ok: true, text: L("Passordet er endret.", "The password is changed.") },
    );
    if (!e) {
      setPw("");
      setPw2("");
    }
  }
  async function deleteMe() {
    setBusy(true);
    try {
      const r = await requestMyDeletion({ data: { confirmEmail: confirm } });
      setDelMsg({ ok: r.ok, text: tm(r.message) });
      if (r.ok) setTimeout(() => void signOut(), 4000);
    } catch (e) {
      setDelMsg({ ok: false, text: tm((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-6 py-6"
      data-testid="account-page"
    >
      <h1 className="text-lg font-semibold text-text-primary">{L("Min konto", "My account")}</h1>
      {!ready ? (
        <p className="rounded-sm border border-status-uncertain/50 bg-surface-2 p-3 text-xs text-text-secondary">
          {L(
            "Databasen må oppdateres (migrasjon 0033) før språkvalg på kontoen, forbruk, personvern og sletting virker.",
            "The database must be updated (migration 0033) before account language, usage, privacy and deletion work.",
          )}
        </p>
      ) : null}

      <Card title={L("Profil", "Profile")}>
        <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
          <dt className="text-text-tertiary">{L("E-post", "Email")}</dt>
          <dd className="text-text-primary">{email}</dd>
          <dt className="text-text-tertiary">{L("Konto laget", "Account created")}</dt>
          <dd className="text-text-primary">
            {a?.createdAt
              ? new Date(a.createdAt).toLocaleDateString(locale(), { dateStyle: "long" })
              : "–"}
          </dd>
          <dt className="text-text-tertiary">{L("Rolle", "Role")}</dt>
          <dd className="text-text-primary">
            {a?.isAdmin
              ? a.permanentAdmin
                ? L("Fast administrator", "Permanent administrator")
                : L("Administrator", "Administrator")
              : L("Bruker", "User")}
            {a?.isAdmin ? (
              <Link
                to="/admin"
                className="ml-2 text-accent-brand underline-offset-2 hover:underline"
              >
                {L("Til adminsiden", "To the admin page")}
              </Link>
            ) : null}
          </dd>
          <dt className="self-center text-text-tertiary">{L("Visningsnavn", "Display name")}</dt>
          <dd className="flex items-center gap-2">
            <input
              className={input}
              value={name ?? a?.displayName ?? ""}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              aria-label={L("Visningsnavn", "Display name")}
            />
            <Button size="sm" disabled={name === null} onClick={() => void saveName()}>
              {L("Lagre", "Save")}
            </Button>
          </dd>
        </dl>
        {nameMsg ? <p className="text-xs text-text-secondary">{nameMsg}</p> : null}
        <p className="text-[11px] text-text-tertiary">
          {L(
            "Visningsnavnet ser de du deler prosjekter med. E-postadressen din vises ikke for dem.",
            "The display name is seen by those you share projects with. Your email address is not shown to them.",
          )}
        </p>
      </Card>

      <Card title={L("Språk", "Language")}>
        <div className="flex items-center gap-3">
          <LanguageSwitch />
          <span className="text-xs text-text-tertiary">
            {L(
              "Valget lagres på kontoen og gjelder neste gang du logger inn, også på andre maskiner.",
              "The choice is saved on the account and applies the next time you sign in, also on other computers.",
            )}
          </span>
        </div>
      </Card>

      <Card title={L("Passord", "Password")}>
        <div className="grid max-w-[420px] gap-2">
          <input
            className={input}
            type="password"
            autoComplete="new-password"
            placeholder={L("Nytt passord (minst 8 tegn)", "New password (at least 8 characters)")}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            aria-label={L("Nytt passord", "New password")}
          />
          <input
            className={input}
            type="password"
            autoComplete="new-password"
            placeholder={L("Gjenta passordet", "Repeat the password")}
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            aria-label={L("Gjenta passordet", "Repeat the password")}
          />
          <Button
            size="sm"
            className="justify-self-start"
            disabled={busy || !pw}
            onClick={() => void savePassword()}
          >
            {L("Endre passord", "Change password")}
          </Button>
          {pwMsg ? (
            <p className={"text-xs " + (pwMsg.ok ? "text-status-success" : "text-status-danger")}>
              {pwMsg.text}
            </p>
          ) : null}
        </div>
      </Card>

      <Card title={L("AI-forbruk", "AI usage")} id="forbruk">
        <p className="text-xs text-text-tertiary">
          {L(
            "Det du selv har bestilt i alle prosjektene. Eieren av et prosjekt ser hva hele prosjektet har kostet på prosjektets oversikt.",
            "What you have ordered yourself in all projects. The owner of a project sees what the whole project has cost on the project overview.",
          )}
        </p>
        {ready ? (
          <CostReportView
            scope="account"
            projectName={L("Alle prosjekter", "All projects")}
            generatedBy={a?.displayName ? `${a.displayName} (${email})` : email}
          />
        ) : null}
      </Card>

      <Card title={L("Personvern", "Privacy")}>
        <p className="text-[13px] text-text-secondary">
          {a?.acceptedVersion
            ? L(
                `Du har lest versjon ${a.acceptedVersion} av personvernerklæringen.`,
                `You have read version ${a.acceptedVersion} of the privacy statement.`,
              )
            : L(
                "Les hvordan vi behandler opplysningene dine.",
                "Read how we process your information.",
              )}{" "}
          <PrivacyLink className="text-accent-brand underline-offset-2 hover:underline" />
        </p>
      </Card>

      <Card title={L("Slett kontoen min", "Delete my account")}>
        <p className="text-[13px] text-text-secondary">
          {L(
            "Kontoen låses med en gang og slettes for godt etter 30 dager. I mellomtiden kan bare administrator låse den opp. Prosjekter du eier, slettes ikke: de låses, og administrator kan gi dem en ny eier. Det du har gjort i andres prosjekter, står igjen som «Slettet bruker».",
            "The account is locked at once and deleted for good after 30 days. Until then, only the administrator can unlock it. Projects you own are not deleted: they are locked, and the administrator can give them a new owner. What you have done in others' projects remains as “Deleted user”.",
          )}
        </p>
        {a?.permanentAdmin ? (
          <p className="text-xs text-text-tertiary">
            {L(
              "Den faste administratorkontoen kan ikke slettes.",
              "The permanent administrator account cannot be deleted.",
            )}
          </p>
        ) : (
          <div className="flex max-w-[520px] flex-wrap items-center gap-2">
            <input
              className={input + " flex-1"}
              placeholder={L(
                "Skriv e-postadressen din for å bekrefte",
                "Type your email address to confirm",
              )}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-label={L("E-postadressen din", "Your email address")}
              data-testid="delete-confirm"
            />
            <Button
              size="sm"
              variant="destructive"
              disabled={!ready || busy || confirm.trim().toLowerCase() !== email.toLowerCase()}
              onClick={() => void deleteMe()}
              data-testid="delete-me"
            >
              {L("Slett kontoen min", "Delete my account")}
            </Button>
          </div>
        )}
        {delMsg ? (
          <p className={"text-xs " + (delMsg.ok ? "text-text-primary" : "text-status-danger")}>
            {delMsg.text}
          </p>
        ) : null}
      </Card>
      <div className="flex justify-end pb-4">
        <Button variant="secondary" onClick={close} data-testid="account-close">
          {L("Lukk", "Close")}
        </Button>
      </div>
    </main>
  );
}
