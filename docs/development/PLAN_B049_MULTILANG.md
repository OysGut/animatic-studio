# B-049 – N språk i brukerflaten og manuskoblingene

Status: godkjent av Øystein 20.10.2026 i rekkefølgen ML1 → ML2 → ML3 → ML4. ML1 bygges uten migrasjon; ML2–ML4 er fortsatt planlagt.

## Rammer og akseptanse

- Norsk bokmål er reservespråk og norsk hovedmanus forblir kilden. Verken UI-språk, oversettelsesimport, AI eller talespråk endrer kilden automatisk.
- `uiLocale`, `scriptLanguage` og `speechLanguage` er uavhengige. UI-katalogen og prosjektets språkversjoner er forskjellige registre.
- Eksisterende tekster, oversettelser, permanent identitet, linjekoblinger, lydversjoner og redigeringer bevares. Prosjektendringer følger `runCommand → apply_changes`, revisjonskontroll og angre/gjør om.
- Nye UI-språk skal kunne leveres som oversettelsesfiler med språkmetadata uten å endre TypeScript-kode. Publisering av nye filer er fortsatt nødvendig; dette er ikke et nytt oversettelsesadministrasjonssystem.
- Høyre-til-venstre er et vurderingspunkt, ikke en leveranse nå. Ingen påstand om full støtte for RTL eller alle PDF-skriftsystemer før egne tester.
- ML1–ML2 bruker automatisk `en-XA` med utvidet og aksentuert engelsk som testdata. Mars velger senere tredjespråk og kvalitetssikrere; ingen oppdiktede ferdige oversettelser.
- ML2-akseptanse: språkbytte mister aldri åpne utkast eller avbryter arbeid. Norsk og engelsk forblir like komplette som før etter hver runde, og eksisterende visuelle suiter skal være grønne.

## 1. Dagens løsning

### Brukerflaten

`src/core/i18n/index.ts` har `Lang = "nb" | "en"`, `L(nb,en)`, `localized()` og globalt språkvalg. `locale()`/`collation()` velger norsk eller engelsk. `tm()` oversetter norske server-/kjernemeldinger ved katalogoppslag med nummererte plassholdere og tekstmatching; ukjente meldinger vises uendret.

`scripts/i18n/build-catalog.mjs` trekker ut tekstpar fra `src/core` og `src/adapters` til `catalog.gen.ts`. Dette er ikke en full katalog over React-tekstene. `scripts/i18n/check.mjs` leter etter norsk tekst uten engelsk gjennom AST og ordheuristikk; den kontrollerer ikke N-språk-dekning, nøkkeltyper eller komplette plassholderkontrakter. `tests/unit/i18n.test.ts` tester språkbytte, oppslag, servermeldinger og sjekken.

`src/app/i18n/language.tsx` bruker `animatic:lang` i nettleseren, norsk ved SSR og første tegning, og bytter etter oppstart. `LanguageRoot` remonterer innhold ved språkbytte. Velgeren har to språk. Språkbytte må i B-049 ikke miste åpne utkast eller avbryte arbeid.

### Manus, tale og koblinger

DV6 (`src/core/dialogue/languages.ts`, `DialogueLanguageControls.tsx`) har arv for manusspråk prosjekt → scenevariant → blokk og separate talespråkvalg/stemmevalg. BCP-47 valideres med `Intl.getCanonicalLocales`; historisk `no` normaliseres til `nb` ved bruk. Normalisering alene validerer ikke ugyldig input. `languageLabel()` har fortsatt tospråklig visningslogikk. Leverandørens språkstøtte er en separat begrensning: gyldig språkmerke betyr ikke at modellen kan lage tale på språket.

`translations` lagrer språk og permanent blokk-/variant-ID, tekst, status og kilderevisjon. `translation_lines` lagrer importerte linjer per scenevariant og språk. `translation_line_links` binder kildeblokker og mål-linje-ID-er innen én scene og ett språk; B-050 støtter 1:1, 1:n og n:1 med regler først, AI-vurdering av usikre, kostnadsport og eksplisitt godkjenning.

Modellen er allerede i stor grad N-språklig: det finnes ikke en egen engelsk kolonne eller fast maksantall mål­språk. `translationOf()` indekserer mål-ID + språk. Hindrene er faste språkvalg/etiketter og inkonsekvente språkvalideringer, ikke behov for å erstatte alle oversettelsesrader.

Migrasjon 0016 begrenser `translations.language` til to bokstaver med valgfri region (`xx`/`xx-YY`) og avviser hovedspråket. 0017 har tilsvarende eldre begrensninger for lyd, språkavhengige bilder og importert film. 0064 tillater lengde 2–100 for linjer/koblinger, men er ikke full BCP-47-validering. Faktisk migrasjonsstatus og constraint-navn kontrolleres før implementering; eldre dokumentasjonsstatus skal ikke overstyre brukerens bekreftelse om at P5 er publisert.

`translatedState()` i `src/core/translation/index.ts` er en beregnet visnings-/eksportprojeksjon. Manglende linjer beholder norsk; originaltilstanden endres aldri. `src/app/script/ExportDialog.tsx` gjenbruker projeksjonen til PDF/DOCX/Fountain. Backup inkluderer oversettelser, linjer og koblinger med ID-remapping. N språk krever regresjon i import, eksport, tale og backup, ikke bare en ny språkvelger.

## 2. Målmodell for UI

### Språkkatalog og reserver

Én filbasert manifestkatalog med BCP-47-tag, egennavn, visningsnavn, format-locale, deklarerte reserver, katalogversjon og fremtidig skriveretning. En tag følger en dokumentert, testet delmengde støttet av `Intl`; ikke hjemmelaget tobokstavsregex. Tillat eksempelvis `fr`, `pt-BR`, `zh-Hant` og `sr-Latn-RS`. Registrering gir ikke automatisk TTS-/eksportstøtte.

Oppslag: valgt språk → eksplisitt godkjente reserver → `nb`. Regionen eller skriptet skal ikke fjernes blindt; eksempelvis kinesiske skript kan ha ulike reserver. Valider manglende reserve, løkker og maksimum dybde. Norske og engelske kataloger er komplette releasekrav; nye kataloger annonseres som delvise til de er gjennomgått. Ingen automatisk AI-oversettelse av brukerinnhold.

### Fra `L(nb,en)` til stabile nøkler

1. Utvid AST-inventaret til hele appen: `L`, `localized`, tekster/aria/tooltips/toasts, kjerner og servere. Eksporter begge eksisterende tekster ordrett, med kildeplassering og plassholderkontrakt. Unngå nøkkel basert bare på norsk tekst; samme tekst kan ha ulike betydninger.
2. Tildel stabile semantiske nøkler per funksjon og behold et versjonert mappingmanifest. Opprett komplette `nb`/`en`-filer før én kallplass endres. Konflikter og forskjellige engelske tekster krever gjennomgang, aldri siste tekst vinner.
3. Innfør `t(key, params)` med navngitte plassholdere og pluralregler fra `Intl.PluralRules`. Hele setninger, ikke fragmenter. Skann maluttrykk, entall/flertall og `localized()` særskilt; ingen blind søk/erstatt av dynamiske uttrykk.
4. Behold `L`/`localized` og `tm` som overgangsbro. Migrer i avgrensede områder med nb/en-regresjon. Broens dekning registreres; ikke påstå at tredje språk er komplett før hele appen er migrert.
5. La nye serverfeil sendes som stabil kode/nøkkel + parametere og oversettes på klienten. Behold gamle tekstmeldinger og `tm` for bakoverkompatibilitet. Formater tall/dato/valuta når de vises, ikke ferdig norsk i meldingen.
6. Sjekken stopper nye ukatalogiserte tekster og ukjente nøkler. Fjern broen først når inventaret er tomt og gamle meldinger fortsatt kan leses.

JSON-filer og manifest leses av en generell kataloglaster, ikke en hardkodet import per språk. Leveransen av en ny fil kan kreve en vanlig publisering, men aldri en kodeendring. Filene er data: ingen HTML/script-eksekvering, begrens størrelse og valider struktur. Domenekjernen får katalogdata som parametere uten nettleser-/React-/serveravhengigheter.

### Manglende oversettelser

Brukeren ser lesbar reservetekst, ikke en tom knapp eller rå nøkkel. Språkvelgeren markerer delvise språk og at reservespråk kan forekomme. Utvikling/test rapporterer nøkkel og manglende språk, aldri manus, hemmeligheter eller persondata. Manglende norsk grunntekst, ukjent nøkkel, ulike parametere og feil pluralformer stopper release. Manglende tredje-språk-tekst testes eksplisitt og telles i dekningsrapport.

SSR og første klienttegning bruker samme språk/katalog. Første runde kan beholde norsk SSR og lagret språk etter oppstart, men skal unngå remontering som mister arbeid. Senere cookie/request-locale er et eget valg; aldri global request-mutasjon som kan blande språk mellom samtidige brukere.

## 3. N manusspråk per prosjekt

Behold permanent norsk blokk som kilde. Én logisk språkversjon per prosjekt + kanonisk målspråk i første leveranse; flere navngitte utgaver av samme språk er ikke bestilt. Et lite prosjektregister for språkversjoner kan angi ID, prosjekt, målspråk, navn/status og kilde `nb`, med prosjektstandard for valgt visning. Det er ikke UI-katalogen: prosjektet kan ha et manusspråk uten en oversatt brukerflate.

Behold eksisterende oversettelsesrader og koblings-ID-er. Legg til valgfri språkversjon-ID ved behov og avled eldre rader fra prosjekt + språk. Linje og lenke må ha samme prosjekt, scenevariant og språkversjon; kildeblokker er alltid norsk kilde. Norsk kilderevisjon driver status «må gjennomgås» for alle berørte språk; ingen automatisk overskriving. Vis manglende/usikre linjer per valgt språk, og krev eksplisitt eksportvalg om ufullstendig oversettelse bruker norsk reserve eller stoppes.

B-048/B-050 får valgt målspråk og scene som eksplisitt parameter. AI vurderer kandidater, ikke nye identiteter. Eksisterende unntak for tjenestebetalte B-047/B-048 og kostnadsport for B-050 beholdes. Ingen N-språk-endring skal automatisk kjøre eller fakturere nye AI-jobber. Tale og genereringsvalg følger DV6 og bevarer alle lydversjoner.

## 4. Migrasjon og bakoverkompatibilitet

Kun fremtidig plan, ingen SQL i denne leveransen. Neste nummer velges fra faktisk høyeste migrasjon ved oppstart av ML3, ikke reserveres nå.

- Først kartlegg lagrede tagger, casing/aliaser, fjernede rader, aktive unike indeksregler og eksisterende constraints. Rapportér kollisjoner som `en-us`/`en-US`; ingen automatisk sammenslåing eller sletting av innhold.
- Additiv migrasjon utvider de gamle språkbegrensningene uten å avvise historisk gyldige verdier. Eventuell kanonisk språkverdi legges i ny nullable kolonne og gamle `language` beholdes for gamle klienter. Nye writes valideres; gamle data leses fortsatt. `*`, `none`, `null` i lyd beholder sin særbetydning.
- Dersom prosjektregister er nødvendig: ny tabell med prosjekt, permanente ID-er, `removed`, `revision`, skaper/tid, begrensninger, eksplisitte GRANT og lesepolicy; klientskriving bare via `apply_changes`. Utvid innlasting, kommandoer/inverser, slett/purge og backup samtidig. Ingen rolle i profiler, ingen ny tilgang via et språkvalg.
- Ikke bruk direkte klient-SQL til å endre eksisterende prosjektdata. Opprettelse av versjoner og tilknytning skjer som eksplisitt, idempotent kommandoplan med revisjonssjekk; eventuell engangsbackfill må spesifiseres og DB-testes som en særskilt migrasjon av Claude.
- Ingen endring av kolonnetype, dropping eller ny påkrevd kolonne uten kompatibel standard. Rull ut utvidelse før nye skriveruter; behold lesestøtte for gammel backup og gamle klienter. Kollisjonsrader forblir intakte og avventer eksplisitt avgjørelse.
- Bump skjema og forventet versjon først ved reell DB-endring. Test gammel app mot utvidet skjema, gammel backup → ny app og ny backup → ny app. Tilbakerulling av appkode skal ikke kreve destruktiv nedmigrasjon.

## 5. Foreslåtte runder, tester og estimater

Estimater er utviklings-/verifiseringsdager for én utvikler, ikke pris eller bindende tidsløfte. Manuell språkoversettelse og separat RTL-/fontarbeid er ikke inkludert.

| Runde | Leveranse | Testplan og akseptanse | Risiko | Estimat |
|---|---|---|---|---|
| ML1 | Fullt tekstinventar, stabile nøkler, nb/en-filer, språkkatalog, reserve- og parameterkontrakt, kompatibel bro. | Ren kjerne: BCP-47, reservekjeder/løkker, manglende nøkkel, plural/tall/dato og parametere; inventaret viser null tap av gamle nb/en-tekster. AST-verktøy testes på maler, `localized` og like ord med ulik betydning. | Feil nøkkelsammenfall og maluttrekk. | 4–6 dager |
| ML2 | Migrer hele brukerflaten/kjerne-/servertekster i mindre delrunder; generell filbasert språkvelger og lasting; bevar arbeid ved språkbytte. Legg til et test-/pseudospråk, ikke oppdiktede ferdige oversettelser. | Alle eksisterende visuelle suiter fortsatt på nb og en. Test tredje språk, lang tekst, delvis katalog, lastefeil, reserve, tastatur, remontering/utkast, SSR-hydrering og samtidige serverkall uten språklekkasje. Kontroller alle aria/tooltip/feil/toast. | Stor tekstmengde og skjulte todelte antakelser; remontering kan miste arbeid. | 7–12 dager |
| ML3 | Generaliser prosjektets språkvalg/koblinger med BCP-47; eventuell additiv registrering/migrasjon som over. Behold dagens N-språklige oversettelseskjerne. | DB: grants/RLS, apply_changes/revisjoner, idempotens, angre/gjør om, delete/purge, kollisjoner, historiske data. Minst tre målspråk inkl. region og skript; sceneisolasjon og 1:n/n:1. Norsk kilde og andre språk er uendret etter import/godkjenning/angring. Alle nb/en-suiter beholdes. | Kanoniske aliaser, eldre constraints og koblinger til feil språkversjon. | 4–7 dager |
| ML4 | Ende-til-ende: DV6, B-048/B-050, eksport, sikkerhetskopi/gjenoppretting og releasekontroll. | Mock AI/TTS (ingen betalte testkall); uavhengige UI/manus/talespråk, tapfri lyd, kostnadsport. PDF/DOCX/Fountain med 3+ språk, ufullstendig eksport og fontkontroll. Backup før/etter migrasjon med alle ID-er/lydvalg. Kjør eksisterende visuelle nb/en-suiter og nye ML-suiter. | Modellkapabiliteter og fonter er ikke universelle; ny backup må bevare gamle identiteter. | 4–7 dager |

Samlet: **19–32 utviklingsdager**, pluss oversettelsesarbeid. ML2 bør deles videre per arbeidsflate etter inventaret; reestimer da i stedet for å love samme tid uansett tekstmengde.

## 6. Senere vurderinger og beslutningspunkter

- RTL: retning per UI og innhold, blandet norsk/arabisk tekst, ikoner, tidslinjer, caret, tastatur, PDF/bidi og font-shaping. Ikke bygges eller annonseres som støttet nå.
- Språkenes navn og rekkefølge, hvilke tredjespråk som skal leveres først, hvem som kvalitetssikrer filene, og når delvis språk skal være valgbart.
- Behovet for flere utgaver av samme målspråk avklares separat; ikke bygges under antakelsen «N språk».
- Før kode i ML-rundene: Claude bekrefter planen og migrasjonsbehovet. Ingen eksisterende produktkrav erstattes i stillhet.