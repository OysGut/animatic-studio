# D-2 – Restfunn før demoen

Dato: 22.10.2026. Ingen publisering eller databaseendringer.

## Resultat

Språk/hydrering, offentlige RPC-lister, Story Lab-kontrakten, U2, REQ-0050 og g07 er rettet og kontrollert. Demoflyten på nb/en består 28/28 uten konsollfeil. D-2 er **ikke helt grønn**: én REQ-0210-kontroll feiler fortsatt i den lange `verifisering4-ui`-suiten. Forventningen er ikke svekket.

## Rettelser

- `LanguageSwitch` bruker identiske ordinære språkvalg på serveren og under første klienttegning. Nettleserens test-/ufullstendige språkvalg legges til etter hydrering. To nye SSR/hydreringstester består. Mobilside, personvern og språkverktøytips kontrolleres av ML2; 318/318 består på nb/en/en-XA. Verktøytipstesten forventer nå eksisterende «Bytt språk» / «Change language», ikke tidligere tekst.
- Offentlige RPC-lister tillater eksplisitt `globe_points` og `my_features` der de forventes. Filmdeling tillater fortsatt ikke prosjektdata-RPC-er.
- Story Lab-mockene bruker `generateStoryText` og `estimateStoryPrompt`. Nettlesertestene kontrollerer strukturerte forespørsler, karaktervalg, regi, analyse og profiløyeblikksbilder; serverprompter testes fortsatt på enhetsnivå. Engelske faktavelgere bruker roller/språkuavhengige verdier.
- U2 måler synlige verktøygrupper og kontrollerer overflytmeny, minste høyde, plass innenfor vinduet og Escape; skjulte parkerte grupper skal ikke måles.
- REQ-0050 venter på Courier Prime før måling. Alle fire forventningene består uendret: papirforhold, tegnbredde/linjehøyde, innrykk og hele linjer.
- g07 mocker serverens `previewImagePrompt` og venter på faktisk synlig prompttekst før kontroll av valgte vinkler. Hele `funn-0080-ui` består.
- AI-innstillingsspørringen normaliserer manglende svar/settings til `[]`. Fem nye tester dekker undefined, null, tomt objekt, tom liste og gyldig svar. Felles demomock returnerer også `{ ready: true, settings: [] }`.
- Testoppsettene skriver både generelt og brukeravgrenset språkvalg, slik den gjenopprettede språkprioriteringen krever. Ingen nye brukertekster eller oversettelsesnøkler.

## Visuelle resultater

Suitene er kjørt én om gangen med faste mocker, uten betalte AI-kall.

| Suite | nb | en / andre språk |
| --- | --- | --- |
| registration-closed | 31/31 | 31/31 |
| global-film-share | 12/12 | 12/12 |
| ca4-mouth-mask | 25/25 | 25/25 |
| scene-mobile-audio | 23/23 | 23/23 |
| ml2-languages | 318/318 samlet nb, en og en-XA | inkludert |
| storylab-canvas-ui | 33/33 | 33/33 |
| storylab-group-ui | 28/28 | 28/28 ved siste kjøring |
| storylab-suggestions-ui | 22/22 | 22/22 |
| u2-chrome-ui | 28/28 | 28/28 |
| funn-0080-ui | 20/20 | norsk suite |
| verifisering4-ui | 57/58 | norsk suite; REQ-0050 4/4 |
| Isolert verifisering4-ui, ONLY=avspilling | 6/6 | maks avvik 89 ms |
| Demoflyt | 14/14 | 14/14 |

Demoflyten: prosjektliste → prosjekt → manus → scene → montering → bibliotek → rigg → knappene for skuddliste, Dragonframe, AE, klippefiler og Nuke/Fusion. Kontrollerer tilgjengelige eksportvalg, ikke ekte import i eksterne programmer. Skjermbilder av manus, scene, montering, bibliotek og rigg er tatt; norsk scene og engelsk manus er inspisert. Testprosjektets innhold er en fast fixture, ikke en kontroll av produksjonsprosjektets egne filer.

## Sluttkontroller

- Full Vitest: **2412 bestått, 0 feilet, 10 eksisterende hoppet over**, 300 beståtte testfiler, 2 hoppet over. Kjørt med `--maxWorkers=2` for å begrense belastningen. Første standardkjøring tidsavbrøt språkkontrollen ved 60 sekunder; forventning/timeout er ikke endret.
- Etter siste testjusteringer: i18n- og nye regresjonstester **30/30**. Ingen appkode endret etter full Vitest.
- Lokal DB: **164/164**. Ingen Cloud-migrasjon eller Cloud-skriving.
- Språkinventar regenerert; `check.mjs`: 0 tekster uten engelsk. Releasekontroll bestått, nb/en/en-XA 100 %. Ingen nye tekster; eksisterende øvrige oversettelser beholdt.
- Automatisk bygg: OK. Manuell `tsc --noEmit` er ikke kjørt; miljøets automatiske kontroll brukes.
- Alle innholdsruter er inspisert for eget `head()`, inkludert index; ingen metadataendring.

## Åpent funn og avvik

**REQ-0210:** Full `verifisering4-ui` gir gjentatte avvik mellom vist tidskode og lydklokke: 252–301 ms mot uendret grense <200 ms. Siste fulle kjøring: 300 ms over ti målinger. Isolert avspilling består med 89 ms og alle seks kontroller. Lydkilder er korrekt plassert med 0 ms spredning/filavvik i begge tilfeller. Diagnostikken skriver nå tidskode og lydtid per måling.

Dette er ikke dokumentert som «appen er riktig»: årsaken er fortsatt uavklart. At isolert kjøring består beviser ikke at den lange kjøringen er ugyldig. Ingen endring i lydmotor, driftgrense eller testtoleranse er gjort før demoen. Videre undersøkelse må følge samtidige lerrets-/tidskodetegninger og lydøkter gjennom den lange kjøringen. Derfor kan ikke alle visuelle suiter rapporteres grønne.

## Endrede filer

- `src/app/i18n/language.tsx` – stabile første språkvalg under SSR/hydrering.
- `src/app/ai/use-ai-model-settings.ts` – aldri undefined som spørringsresultat.
- `tests/unit/d2-language-hydration.test.tsx` (ny) – to hydreringstilfeller.
- `tests/unit/d2-ai-model-query.test.tsx` (ny) – fem svarnormaliseringstilfeller.
- `tests/visual/mts-harness.mjs`, `global-harness.mjs` – AI-svar og brukeravgrensede språkvalg.
- `tests/visual/registration-closed.mjs`, `global-film-share.mjs` – eksplisitte offentlige RPC-lister.
- `tests/visual/ml2-languages.mjs` – gjeldende tooltip, første visning og språkvalg.
- `tests/visual/storylab-canvas-ui.mjs`, `storylab-group-ui.mjs`, `storylab-suggestions-ui.mjs` – gjeldende serverkontrakt og språkvalg.
- `tests/visual/u2-chrome-ui.mjs` – synlige grupper og overflytkontroller.
- `tests/visual/verifisering4-ui.mjs` – vent på manusfont; konkret lydmålediagnostikk.
- `tests/visual/funn-0080-ui.mjs` – promptmock og g07-synkronisering.
- Regenerert: `src/core/i18n/runtime.gen.json`, `src/core/i18n/locales/{nb,en,en-XA,fr,es,ru,ja,pt-BR,de,it,ko}.json` og `scripts/i18n/{mapping.v1,references.v1,candidates.v1,inventory-report}.json`.
- `roadmap.md` og `docs/development/D2_REPORT.md` – oppgaver og denne rapporten.

Arbeidsregler og testing følger animatic-oppdrag og animatic-testing; gjeldende produktregel bruker `t()`, ikke nye `L()`-tekster.