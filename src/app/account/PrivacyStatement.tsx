/**
 * Personvernerklæringen (DEC-0086, Mars 15.10.2026): «en disclaimer for tjenesten etter eu regler, som forteller
 * at vi ikke kommer til å selge data om brukerne og at vi følger normal gdpr». Kan leses fra forsiden før
 * innlogging og fra kontosiden etter. Behandlingsansvarlig, kontakt og lagringssted fylles ut av administrator;
 * hver lagring er en ny versjon. Teksten er et utkast etter vanlig praksis og bør leses av en jurist.
 */
import { L, locale } from "@/core";
import type { PrivacyFields } from "@/adapters/browser/account";

const missing = () => L("(ikke fylt ut ennå)", "(not filled in yet)");

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
          {L("Personvernerklæring for Animatic Studio", "Privacy statement for Animatic Studio")}
        </h1>
        <p className="text-xs text-text-tertiary">
          {p
            ? L(
                `Versjon ${p.version}${date ? `, ${date}` : ""}`,
                `Version ${p.version}${date ? `, ${date}` : ""}`,
              )
            : L("Utkast", "Draft")}
        </p>
      </header>

      <p className="rounded-sm border border-accent-brand/40 bg-surface-2 p-3 text-[13px] text-text-primary">
        {L(
          "Kort fortalt: Vi selger aldri opplysninger om deg, viser ikke reklame og deler ikke dataene dine med andre for markedsføring. Vi behandler personopplysninger etter personvernforordningen (GDPR) og norsk personopplysningslov.",
          "In short: We never sell information about you, show no advertising and do not share your data with others for marketing. We process personal data under the General Data Protection Regulation (GDPR) and the Norwegian Personal Data Act.",
        )}
      </p>

      <Section title={L("1. Hvem som er ansvarlig", "1. Who is responsible")}>
        <p>
          {L("Behandlingsansvarlig: ", "Controller: ")}
          <strong className="text-text-primary">{p?.controllerName || missing()}</strong>
          {p?.orgNumber ? L(`, org.nr. ${p.orgNumber}`, `, org. no. ${p.orgNumber}`) : ""}
        </p>
        <p>
          {L("Adresse: ", "Address: ")}
          {p?.address || missing()}
        </p>
        <p>
          {L("Kontakt om personvern: ", "Contact about privacy: ")}
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

      <Section title={L("2. Hva vi lagrer", "2. What we store")}>
        <ul className="list-disc pl-5">
          <li>
            {L(
              "Konto: e-postadresse, visningsnavn, språkvalg, når kontoen ble laget og når du sist var aktiv. Passordet lagres bare som en kryptografisk sjekksum hos innloggingstjenesten; vi kan ikke se det.",
              "Account: email address, display name, language choice, when the account was created and when you were last active. The password is stored only as a cryptographic hash by the sign-in service; we cannot see it.",
            )}
          </li>
          <li>
            {L(
              "Innholdet du og prosjektmedlemmene lager: manus, scener, bilder, lyd, video, kommentarer og historikken over endringer (hvem som endret hva og når).",
              "The content you and the project members create: scripts, scenes, images, audio, video, comments and the history of changes (who changed what and when).",
            )}
          </li>
          <li>
            {L(
              "AI-bruk: hvilke AI-jobber som er bestilt, beskrivelsene som ble sendt, leverandør, modell, tidspunkt og anslått kostnad.",
              "AI usage: which AI jobs were ordered, the descriptions that were sent, provider, model, time and estimated cost.",
            )}
          </li>
          <li>
            {L(
              "Dine API-nøkler til AI-leverandører, kryptert (AES-256-GCM). Nøklene kan ikke leses fra nettleseren, bare de fire siste tegnene vises.",
              "Your API keys for AI providers, encrypted (AES-256-GCM). The keys cannot be read from the browser; only the last four characters are shown.",
            )}
          </li>
          <li>
            {L(
              "I nettleseren lagres bare det som trengs for innloggingen og valgene dine (for eksempel språk). Vi bruker ingen sporings- eller reklamekapsler.",
              "In the browser we store only what is needed for sign-in and your choices (for example language). We use no tracking or advertising cookies.",
            )}
          </li>
        </ul>
      </Section>

      <Section title={L("3. Hvorfor, og med hvilket grunnlag", "3. Why, and on what basis")}>
        <p>
          {L(
            "For å levere tjenesten du har bedt om (avtale, GDPR art. 6 nr. 1 bokstav b); for sikkerhet, feilretting og for å hindre misbruk (berettiget interesse, bokstav f); og for å vise deg og prosjekteieren hva AI-bruken har kostet.",
            "To provide the service you have asked for (contract, GDPR Art. 6(1)(b)); for security, troubleshooting and to prevent misuse (legitimate interest, point (f)); and to show you and the project owner what the AI usage has cost.",
          )}
        </p>
      </Section>

      <Section title={L("4. Vi selger ikke data", "4. We do not sell data")}>
        <p>
          {L(
            "Vi selger, leier ut eller bytter aldri bort opplysninger om deg eller innholdet ditt, og vi bruker dem ikke til reklame eller profilering.",
            "We never sell, rent out or trade information about you or your content, and we do not use it for advertising or profiling.",
          )}
        </p>
      </Section>

      <Section title={L("5. Hvor dataene lagres", "5. Where the data is stored")}>
        <p>
          {L(
            "Tjenesten driftes på Lovable Cloud (database, filer og innlogging levert av Supabase), som er vår databehandler. Lagringssted: ",
            "The service runs on Lovable Cloud (database, files and sign-in provided by Supabase), which is our data processor. Storage location: ",
          )}
          <strong className="text-text-primary">{p?.storageRegion || missing()}</strong>.
        </p>
      </Section>

      <Section title={L("6. Når du bruker AI", "6. When you use AI")}>
        <p>
          {L(
            "AI er valgfritt. Når du selv bestiller en AI-jobb, sendes de delene av manus, beskrivelser, bilder, lyd eller video som jobben trenger, til leverandøren du har valgt (for eksempel OpenAI, Google, fal.ai, Runway eller ElevenLabs). Flere av dem ligger i USA, så opplysningene kan bli overført utenfor EØS.",
            "AI is optional. When you order an AI job yourself, the parts of the script, descriptions, images, audio or video the job needs are sent to the provider you have chosen (for example OpenAI, Google, fal.ai, Runway or ElevenLabs). Several of them are in the USA, so the information may be transferred outside the EEA.",
          )}
        </p>
        <p>
          {L(
            "Bruker du dine egne API-nøkler, er du selv kunde hos leverandøren, og det er dine vilkår med leverandøren som gjelder for det som sendes. Du er selv ansvarlig for at du har rett til å sende innholdet, og for å ikke sende personopplysninger om andre uten grunnlag. Vi lagrer nøklene kryptert og sender dem bare til leverandøren de hører til. Videresending til AI er en risiko i seg selv: les leverandørens vilkår før du bruker den.",
            "If you use your own API keys, you are the provider's customer, and your terms with the provider apply to what is sent. You are responsible for having the right to send the content, and for not sending personal data about others without a legal basis. We store the keys encrypted and send them only to the provider they belong to. Sending content to AI is a risk in itself: read the provider's terms before using it.",
          )}
        </p>
      </Section>

      <Section title={L("7. Hvor lenge", "7. How long")}>
        <p>
          {L(
            "Så lenge du har konto. Sletter du kontoen, låses den i 30 dager (så den kan gjenopprettes ved en feil), og deretter fjernes e-post, navn, API-nøkler og innlogging. Endringer du har gjort i prosjekter andre er med i, står igjen merket «Slettet bruker», fordi de er en del av andres arbeid. Prosjekter du eier, slettes ikke automatisk; administrator kan gi dem en ny eier.",
            "As long as you have an account. If you delete your account, it is locked for 30 days (so it can be restored after a mistake), and then the email, name, API keys and sign-in are removed. Changes you made in projects others are part of remain marked “Deleted user”, because they are part of others' work. Projects you own are not deleted automatically; the administrator can give them a new owner.",
          )}
        </p>
      </Section>

      <Section title={L("8. Dine rettigheter", "8. Your rights")}>
        <p>
          {L(
            "Du har rett til innsyn, retting, sletting, begrensning av behandlingen, dataportabilitet (du kan laste ned sikkerhetskopi av prosjektene dine) og til å protestere. Kontakt oss på adressen over. Du kan også klage til Datatilsynet (datatilsynet.no).",
            "You have the right of access, rectification, erasure, restriction of processing, data portability (you can download a backup of your projects) and to object. Contact us at the address above. You can also complain to the Norwegian Data Protection Authority (datatilsynet.no).",
          )}
        </p>
      </Section>

      {p?.note ? (
        <Section title={L("9. Mer informasjon", "9. More information")}>
          <p className="whitespace-pre-wrap">{p.note}</p>
        </Section>
      ) : null}

      <p className="text-xs text-text-tertiary">
        {L(
          "Endres erklæringen, får den et nytt versjonsnummer, og du blir bedt om å lese den ved neste innlogging.",
          "If the statement changes, it gets a new version number, and you are asked to read it at your next sign-in.",
        )}
      </p>
    </article>
  );
}
