/**
 * Personvernerklæringen (DEC-0086, Mars 15.10.2026): «en disclaimer for tjenesten etter eu regler, som forteller
 * at vi ikke kommer til å selge data om brukerne og at vi følger normal gdpr». Kan leses fra forsiden før
 * innlogging og fra kontosiden etter. Behandlingsansvarlig, kontakt og lagringssted fylles ut av administrator;
 * hver lagring er en ny versjon. Teksten er et utkast etter vanlig praksis og bør leses av en jurist.
 */
import { locale } from "@/core";
import type { PrivacyFields } from "@/adapters/browser/account";
import { t } from "@/core/i18n/keyed";

const missing = () => t("app-account-privacy-statement.missing.message.a2e081fb37e4");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
      <div className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-text-secondary">
        {children}
      </div>
    </section>
  );
}

export function PrivacyStatement({ policy }: { policy: PrivacyFields | null }) {
  const p = policy;
  const date = p?.publishedAt
    ? new Date(p.publishedAt).toLocaleDateString(locale(), {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  return (
    <article className="flex flex-col gap-5" data-testid="privacy-statement">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-text-primary">
          {t("app-account-privacy-statement.privacy-statement.h1.a6b063609bf0")}
        </h1>
        <p className="text-xs text-text-tertiary">
          {p
            ? t("app-account-privacy-statement.privacy-statement.p.021c15bc5aae", { version: String(p.version), value2: String(date ? `, ${date}` : "") })
            : t("app-account-privacy-statement.privacy-statement.p.c1f0a53d37c6")}
        </p>
      </header>

      <p className="rounded-sm border border-accent-brand/40 bg-surface-2 p-3 text-[13px] text-text-primary">
        {t("app-account-privacy-statement.privacy-statement.p.3aa9958e499c")}
      </p>

      <Section title={t("app-account-privacy-statement.privacy-statement.title.384c9e9e3a93")}>
        <p>
          {t("app-account-privacy-statement.privacy-statement.p.7f99cf886105")}
          <strong className="text-text-primary">{p?.controllerName || missing()}</strong>
          {p?.orgNumber ? t("app-account-privacy-statement.privacy-statement.p.cc753e8bca5e", { orgNumber: String(p.orgNumber) }) : ""}
        </p>
        <p>
          {t("app-account-privacy-statement.privacy-statement.p.bd944bafa6ac")}
          {p?.address || missing()}
        </p>
        <p>
          {t("app-account-privacy-statement.privacy-statement.p.dff2f1c35777")}
          {p?.contactEmail ? (
            <a
              className="text-accent-brand underline-offset-2 hover:underline"
              href={`mailto:${p.contactEmail}`}
            >
              {p.contactEmail}
            </a>
          ) : (
            missing()
          )}
        </p>
      </Section>

      <Section title={t("app-account-privacy-statement.privacy-statement.title.bcd0918fbc59")}>
        <ul className="list-disc pl-5">
          <li>
            {t("app-account-privacy-statement.privacy-statement.li.d927ab5cb1ca")}
          </li>
          <li data-testid="privacy-country">
            {t("b097.privacy.country")}
          </li>
          <li>
            {t("app-account-privacy-statement.privacy-statement.li.adc27bbe251b")}
          </li>
          <li>
            {t("app-account-privacy-statement.privacy-statement.li.37f063f56774")}
          </li>
          <li>
            {t("app-account-privacy-statement.privacy-statement.li.1c17eeebd1c9")}
          </li>
          <li>
            {t("app-account-privacy-statement.privacy-statement.li.c9ee2addaecf")}
          </li>
        </ul>
      </Section>

      <Section title={t("app-account-privacy-statement.privacy-statement.title.bb8134f59ff7")}>
        <p>
          {t("app-account-privacy-statement.privacy-statement.p.cba960e48ca5")}
        </p>
        <p data-testid="privacy-turnstile">{t("b110.privacy.turnstile")}</p>
      </Section>

      <Section title={t("app-account-privacy-statement.privacy-statement.title.5dc63510b970")}>
        <p>
          {t("app-account-privacy-statement.privacy-statement.p.7f8c8d4d3739")}
        </p>
      </Section>

      <Section title={t("app-account-privacy-statement.privacy-statement.title.6a7082391160")}>
        <p>
          {t("app-account-privacy-statement.privacy-statement.p.4867f43d007c")}
          <strong className="text-text-primary">{p?.storageRegion || missing()}</strong>.
        </p>
      </Section>

      <Section title={t("app-account-privacy-statement.privacy-statement.title.723f2a7e6fa3")}>
        <p>
          {t("app-account-privacy-statement.privacy-statement.p.e05cd3a83ae4")}
        </p>
        <p>
          {t("app-account-privacy-statement.privacy-statement.p.d4051b2cd87a")}
        </p>
        <p>
          {t("app-account-privacy-statement.privacy-statement.p.0e88e53dce35")}
        </p>
      </Section>

      <Section title={t("app-account-privacy-statement.privacy-statement.title.6147dc559ba7")}>
        <p>
          {t("app-account-privacy-statement.privacy-statement.p.dbc1d18f53cb")}
        </p>
      </Section>

      <Section title={t("app-account-privacy-statement.privacy-statement.title.bc26684b55b8")}>
        <p>
          {t("app-account-privacy-statement.privacy-statement.p.43f087b1a7d6")}
        </p>
      </Section>

      <h2 className="mt-2 text-lg font-semibold text-text-primary" data-testid="privacy-terms-heading">
        {t("b115.privacy.terms.heading")}
      </h2>

      <Section title={t("b115.privacy.ownership.title")}>
        <p>{t("b115.privacy.ownership.text")}</p>
      </Section>

      <Section title={t("b115.privacy.ai.title")}>
        <p>{t("b115.privacy.ai.text")}</p>
      </Section>

      <Section title={t("b115.privacy.liability.title")}>
        <p>{t("b115.privacy.liability.text")}</p>
      </Section>

      <Section title={t("b115.privacy.fonts.title")}>
        <p>{t("b115.privacy.fonts.text")}</p>
      </Section>

      <Section title={t("b115.privacy.links.title")}>
        <p>{t("b115.privacy.links.text")}</p>
      </Section>

      <Section title={t("b115.privacy.law.title")}>
        <p>{t("b115.privacy.law.text")}</p>
      </Section>

      {p?.note ? (
        <Section title={t("app-account-privacy-statement.privacy-statement.title.f124235c6ca5")}>
          <p className="whitespace-pre-wrap">{p.note}</p>
        </Section>
      ) : null}

      <p className="text-xs text-text-tertiary">
        {t("app-account-privacy-statement.privacy-statement.p.71d277fd1a52")}
      </p>
    </article>
  );
}
