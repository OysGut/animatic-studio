# B-049 ML1 – leveranserapport 20.10.2026

## Omfang

Kun språkgrunnlaget er bygget. Ingen brukerflate er migrert, ingen ny språkvelger, ingen migrasjon eller endring av publisert database. `L`, `localized`, `tm`, `Lang` og den eksisterende `catalog.gen.ts` er uendret. `t` importeres eksplisitt fra `src/core/i18n/keyed.ts`; dermed lastes ikke de nye store JSON-katalogene inn i alle eksisterende arbeidsflater gjennom hovedbarrelen. Kjernen bruker injiserte kataloger og eksplisitt locale; ingen request-global ny språktilstand.

## Inventar og konflikter

- 9 963 tekstpar fra 448 filer: 8 673 literalpar, 1 272 par med maler, 18 par med dynamiske uttrykk.
- 102 referanser (`tm` og ikke-statisk localized), 28 814 øvrige literal-/JSX-kandidater med kildeplassering og kontekst. Kandidatene inkluderer tekniske strenger og er ikke 28 814 manglende oversettelser.
- 266 gjennomgangspunkter: 127 like norske tekster med ulike engelske tekster, 121 avvik i parameteruttrykk og 18 dynamiske uttrykk. Ingen automatisk sammenslåing eller konfliktløsning.
- Alle par har egne semantiske, versjonerte nøkler. Identiske tekster i forskjellige betydninger holdes adskilt. Rå uttrykk, literal-/malsegmenter, kildespenn, scope, navn og conditional-grener bevares. Ombyttede parametere matches via uttrykk, ikke posisjon.
- nb/en/en-XA inneholder alle par. Ikke-statisk tekst og kontraktavvik er bevart som `executable: false`, og må konverteres eksplisitt i ML2. De er ikke kjørt som kode eller påstått ferdig migrert til `t`.
- `baseline.v1.json` fryser begge rå tekstuttrykk med SHA-256 for alle 9 963 par. Null-tap-testen sammenligner mot denne uavhengige baselinen, ikke bare to nyskrevne filer.
- Mapping, referanser og kandidater ligger i separate filer, alle under 10 MB per fil. Ingenting er eksternt lastet eller avhengig av en fjern URL.

## Språkgrunnlag

BCP-47 via Intl, eksplisitt manifest nb/en/en-XA, reservesløyfe-/dybdekontroll, nb sist, ingen blind fjerning av skript/region. en-XA er automatisk utvidet/aksentuert engelsk med beskyttede plassholdere, kun testdata. `t` krever nøyaktige navngitte parametere, validerer nøkkel og tilbyr plural gjennom Intl.PluralRules og deklarerte tall-/datoformater. Manglende delvis språk bruker lesbar reserve. Diagnostikk sender bare nøkkel og språkkode, ikke innsatt brukerinnhold.

`scripts/i18n/check.mjs` verifiserer oppdatert inventar og alle katalogkontrakter, nb/en-dekning, statiske `t`-nøkler/parametere og pluralformer, før den eksisterende tospråklige kontrollen. Nye `t`-kall kan ikke aktivere uavklarte uttrykkspar ved et uhell.

## Verifikasjon

- Automatisk typekontroll/build: OK etter retting av indeksoppslag og eksplisitt string-locale. Ingen separat manuell tsc.
- Full Vitest, siste kjøring med to samtidige workers: 1 926 bestått, 0 feilet, 10 eksisterende hoppet over. En tidligere fullkjøring under samtidig nettleserarbeid hadde ett 5 s import-tidsavbrudd i verifisering4-ai-server; forventninger og testkode uendret.
- Nye ML1-tester: 13; sammen med eksisterende i18n: 19/19. Null-tap, key copy-change, alias/shadowing, ombyttede uttrykk, conditional maler, reserver, ukjent nøkkel, manglende parametere, plural, tall/dato og en-XA.
- Isolert lokal Postgres: 140/140. Testløperen anvendte eksisterende migrasjonsfiler bare i en ny lokal database; ingen Cloud-migrasjon eller SQL mot publiserte data.
- U5: 65/65; T2: 69/69; DV3: 48/48; scene panels: 39/39. U5 ble gjentatt etter én sporadisk ERR_ABORTED ved oppstart.
- Verifisering4 original suite: 51/54; to mikrofonkontroller og Courier Prime-breddemåling feilet som tidligere i dette miljøet.
- Midlertidig kopi under /tmp med tilgjengelig Chromium/falsk mikrofon og font-ready: 57/58. Opptak 6/6; font måler fortsatt 6,439 em mot forventet 6 em. Ingen forventning, produksjonsfont eller original testsuite er endret.
- i18n: 0 feil. build_docs/check_kb: OK, 878 krav, 0 udekkede mandatlinjer.

## Åpent akseptansepunkt

ML1 kan ikke rapporteres som fullt akseptert før verifisering4 er grønn i Claudes/Øysteins miljø. Den gjenværende fontmålingen er et dokumentert miljøavvik, ikke skjult eller løst ved å endre testen. ML2 er ikke startet. Mars avgjør senere tredjespråk og kvalitetssikrere; tapsfritt språkbytte er et ML2-akseptansekrav.

## Kreditter

Målt periodeforbruk ved start/slutt: 1 179 → 1 188, differanse 9 kreditter. Oversikten er periodetall og kan oppdateres forsinket; det er ikke et endelig, isolert fakturabeløp for oppdraget. Ingen ekte/betalte AI-genereringskall i app-testene.
