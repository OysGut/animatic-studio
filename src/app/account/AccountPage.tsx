/**
 * Min konto (DEC-0086, Mars 15.10.2026: «når jeg klikker på brukernavnet … en side med mine innstillinger,
 * bla annet foretrukket språk og forbrukte kreditter, endre passord, osv»). Profil, språk, passord,
 * AI-forbruk med kostnadsrapport, personvern og «Slett kontoen min».
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { locale, tm } from "@/core";
import { changePassword, saveDisplayName } from "@/adapters/browser/account";
import { signOut } from "@/adapters/browser/auth";
import { requestMyDeletion } from "@/adapters/account/account.functions";
import { LanguageSwitch } from "@/app/i18n/language";
import { useCloseToPrevious } from "@/app/shell/back-navigation";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { Button } from "@/components/ui/button";
import { CostReportView } from "./CostReportView";
import { RegionSettings } from "./RegionCard";
import { WorkspacesCard } from "@/app/workspaces/WorkspacesCard";
import { MY_ACCOUNT_KEY, PrivacyLink, useMyAccount } from "./use-account";
import { t } from "@/core/i18n/keyed";

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

export function AccountPage(props: { email: string; userId?: string }) {
  // A new identity owns a new form, including unsaved name/password fields.
  return <AccountPageForUser key={props.userId ?? props.email} {...props} />;
}

function AccountPageForUser({ email, userId }: { email: string; userId?: string }) {
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
    setNameMsg(e ? tm(e.message) : t("app-account-account-page.save-name.set-name-msg.a4261bf49b5e"));
    if (!e) {
      setName(null);
      void qc.invalidateQueries({ queryKey: MY_ACCOUNT_KEY });
    }
  }
  async function savePassword() {
    if (pw.length < 8)
      return setPwMsg({
        ok: false,
        text: t("app-account-account-page.text.text.329e2d824228"),
      });
    if (pw !== pw2)
      return setPwMsg({
        ok: false,
        text: t("app-account-account-page.text.text.03230ef58e96"),
      });
    setBusy(true);
    const e = await changePassword(pw);
    setBusy(false);
    setPwMsg(
      e
        ? { ok: false, text: tm(e.message) }
        : { ok: true, text: t("app-account-account-page.text.text.7badb3057a9e") },
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
      <h1 className="text-lg font-semibold text-text-primary">{t("app-account-account-page.account-page.h1.e6872b7b5c7f")}</h1>
      {!ready ? (
        <p className="rounded-sm border border-status-uncertain/50 bg-surface-2 p-3 text-xs text-text-secondary">
          {t("app-account-account-page.account-page.p.1add060cb67d")}
        </p>
      ) : null}

      <Card title={t("app-account-account-page.account-page.title.3a0de0ed891b")}>
        <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
          <dt className="text-text-tertiary">{t("app-account-account-page.account-page.dt.ade51be1b3f1")}</dt>
          <dd className="text-text-primary">{email}</dd>
          <dt className="text-text-tertiary">{t("app-account-account-page.account-page.dt.4ccb2731bfab")}</dt>
          <dd className="text-text-primary">
            {a?.createdAt
              ? new Date(a.createdAt).toLocaleDateString(locale(), { dateStyle: "long" })
              : "–"}
          </dd>
          <dt className="text-text-tertiary">{t("app-account-account-page.account-page.dt.56839a8af169")}</dt>
          <dd className="text-text-primary">
            {a?.isAdmin
              ? a.permanentAdmin
                ? t("app-account-account-page.account-page.dd.3ea157877add")
                : t("app-account-account-page.account-page.dd.476e5871100c")
              : t("app-account-account-page.account-page.dd.9818c358ed9c")}
            {a?.isAdmin ? (
              <Link
                to="/admin"
                className="ml-2 text-accent-brand underline-offset-2 hover:underline"
              >
                {t("app-account-account-page.account-page.link.9f9ca7316e88")}
              </Link>
            ) : null}
          </dd>
          <dt className="self-center text-text-tertiary">{t("app-account-account-page.account-page.dt.3a881a93c577")}</dt>
          <dd className="flex items-center gap-2">
            <input
              className={input}
              value={name ?? a?.displayName ?? ""}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              aria-label={t("app-account-account-page.account-page.aria-label.3a881a93c577")}
            />
            <Button size="sm" disabled={name === null} onClick={() => void saveName()}>
              {t("app-account-account-page.account-page.button.635df60f0182")}
            </Button>
          </dd>
        </dl>
        {nameMsg ? <p className="text-xs text-text-secondary">{nameMsg}</p> : null}
        <p className="text-[11px] text-text-tertiary">
          {t("app-account-account-page.account-page.p.64f5d36e0990")}
        </p>
      </Card>

      <Card title={t("app-account-account-page.account-page.title.f1e74b20ac0c")}>
        <div className="flex items-center gap-3">
          <LanguageSwitch />
          <span className="text-xs text-text-tertiary">
            {t("app-account-account-page.account-page.span.7542584b77d7")}
          </span>
        </div>
      </Card>

      <Card title={t("b097.region.title")} id="region">
        <RegionSettings />
      </Card>

      <Card title={t("app-account-account-page.account-page.title.0a9bee9f065d")}>
        <div className="grid max-w-[420px] gap-2">
          <input
            className={input}
            type="password"
            autoComplete="new-password"
            placeholder={t("app-account-account-page.account-page.placeholder.11360c11e886")}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            aria-label={t("app-account-account-page.account-page.aria-label.d5d00f5fe2cb")}
          />
          <input
            className={input}
            type="password"
            autoComplete="new-password"
            placeholder={t("app-account-account-page.account-page.placeholder.9bfdde07b1d3")}
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            aria-label={t("app-account-account-page.account-page.aria-label.9bfdde07b1d3")}
          />
          <Button
            size="sm"
            className="justify-self-start"
            disabled={busy || !pw}
            onClick={() => void savePassword()}
          >
            {t("app-account-account-page.account-page.button.ac2f177d767b")}
          </Button>
          {pwMsg ? (
            <p className={"text-xs " + (pwMsg.ok ? "text-status-success" : "text-status-danger")}>
              {pwMsg.text}
            </p>
          ) : null}
        </div>
      </Card>

      <Card title={t("app-account-account-page.account-page.title.0ad0dd61ee8f")} id="forbruk">
        <p className="text-xs text-text-tertiary">
          {t("app-account-account-page.account-page.p.04c6a66a7233")}
        </p>
        {ready ? (
          <CostReportView
            scope="account"
            projectName={t("app-account-account-page.account-page.project-name.43fec7dcd962")}
            generatedBy={a?.displayName ? `${a.displayName} (${email})` : email}
          />
        ) : null}
      </Card>

      {userId ? <WorkspacesCard userId={userId} /> : null}

      <Card title={t("app-account-account-page.account-page.title.2cb4e1640f71")}>
        <p className="text-[13px] text-text-secondary">
          {a?.acceptedVersion
            ? t("app-account-account-page.account-page.p.35d769cea95d", { acceptedVersion: String(a.acceptedVersion) })
            : t("app-account-account-page.account-page.p.8aa03e8c03e8")}{" "}
          <PrivacyLink className="text-accent-brand underline-offset-2 hover:underline" />
        </p>
      </Card>

      <Card title={t("app-account-account-page.account-page.title.f5964e6fad59")}>
        <p className="text-[13px] text-text-secondary">
          {t("app-account-account-page.account-page.p.fb52079cd767")}
        </p>
        {a?.permanentAdmin ? (
          <p className="text-xs text-text-tertiary">
            {t("app-account-account-page.account-page.p.3d5761b58054")}
          </p>
        ) : (
          <div className="flex max-w-[520px] flex-wrap items-center gap-2">
            <input
              className={input + " flex-1"}
              placeholder={t("app-account-account-page.account-page.placeholder.143050c7df6d")}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-label={t("app-account-account-page.account-page.aria-label.55d81f5ed2f6")}
              data-testid="delete-confirm"
            />
            <Button
              size="sm"
              variant="destructive"
              disabled={!ready || busy || confirm.trim().toLowerCase() !== email.toLowerCase()}
              onClick={() => void deleteMe()}
              data-testid="delete-me"
            >
              {t("app-account-account-page.account-page.button.f5964e6fad59")}
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
          {t("app-account-account-page.account-page.button.6900b1be5d0a")}
        </Button>
      </div>
    </main>
  );
}
