# Rigg & 2D-utskrift – runde 4

Rapport på bokmål, 21.10.2026. Oppdrag: skjemaversjon/i18n, B-095-synkronisering og PDF-brukerflate.

## A. Vitest og skjemaversjon

`EXPECTED_SCHEMA_VERSION` og `VISUAL_SCHEMA_VERSION` er 72. Claude har kjørt 0072 i Cloud, ifølge oppdraget. Denne runden har ikke kjørt noen Cloud-migrasjon.

Inventaret er regenerert med `node scripts/i18n/inventory.mjs` etter siste kildeendring. Norske valideringsfeil i målekjernen har fått nb/en-nøkler, og PDF-panelets tekster er lagt i den forfattede katalogen. Full Vitest består nå også i18n-testene. Inventaret må genereres etter siste tekst-/referanseendring, og ikke parallelt med tester som sammenligner filene; tidligere isolerte kjøringer og fullkjøringen brukte ikke samme oppdaterte inventar. Genererte filer er ikke rettet manuelt.

PDF-rendereren er flyttet fra `src/core/print/pdf/render.ts` til `src/engine/export/rig-pdf.ts`. Arkitekturtesten oppdaget jsPDF-avhengigheten i kjernen; ren layout i mm forblir i `src/core`, mens tegning til PDF ligger i eksportlaget.

## B. Lest-status

Listen og prosjektoversikten bruker samme `isJobRead`, med `finishedAt ?? createdAt` som sammenligningstid. «Merk alle som lest» nullstiller enkeltlisten. Den faktiske gjenværende feilen var synkronisering mellom monterte `useUiPref`-instanser: en lokal endring ble ikke formidlet til den andre forbrukeren mens begge var åpne. Optimistiske oppdateringer formidles nå til alle monterte instanser. Lagringen er fortsatt personlig i `profiles.ui_prefs`; ingen jobber slettes.

En ny hooktest dekker to samtidige forbrukere, enkeltmerking og deretter alle. Nettlesersuiten dekker også at en senere feil tenner varselet igjen.

## C. PDF-brukerflate

Inspeksjonsvinduet har arkramme, marger, oversiktsark og deling med 10 mm overlapp. Papirvalg: A4, A3, A5, Letter, Legal og egendefinert i mm, stående/liggende. Valgfri kalibreringsmålestokk følger enhetsvalget. Advarsel mot «tilpass til side» er synlig; PDF har `PrintScaling=None`.

Informasjonsfeltene forhåndsvises og kan velges enkeltvis. Feltvalget lagres per bruker i `rigPrintFields`. Kameraets opp-pil og reservert QR-felt vises i forhåndsvisningen og PDF-en. QR er bare plassreservasjon; ingen koder opprettes i runde 4. Klippelinjen er valgfri i relevant modus, med 0,1 mm som standard og område 0,05–0,3 mm. Hull kan utelates fra klippelinjen. Strekbredden endrer ikke fysisk boks.

Teknisk referanseutskrift er av som standard. Bare eksplisitt valgte målesett blir del av planen; referansemarkører og verdier tegnes i en egen farge. PDF-nedlasting endrer ikke prosjektet og starter ikke en skriver.

Motoren tar en liste med elementer og støtter hylleplassering. Denne brukerflaten eksporterer den inspiserte figuren; batch/utvalgshåndtering, kopier og QR kommer i runde 5.

Originale PNG/JPEG-bilder bygges inn uten nedsampling; andre nettleserformater dekodes til PNG med samme antall piksler. Lavoppløselige kilder oppskaleres ikke for å påstå 300 dpi. Det godkjente 150 dpi-varselet vises bare i bildemodusene.

## Tester

Alle nettleserkjøringer brukte faste fixturedata og mockede tjenester, ingen betalte AI-kall. Regresjonene ble kjørt sekvensielt.

| Kontroll | Resultat |
|---|---|
| Full Vitest, siste kjøring | 2102 bestått, 0 feilet, 10 eksisterende hoppet over; 259 filer bestått, 2 hoppet over |
| Lokale DB-tester til og med 0072 | 148/148 |
| job-read, nb / en | 8/8 / 8/8 |
| rigg-r1, nb / en | 12/12 / 12/12 |
| rigg-r2, nb / en | 17/17 / 17/17 |
| rigg-r3, nb / en | 15/15 / 15/15 |
| rigg-r4, nb / en, etter siste PDF-endring | 12/12 / 12/12 |
| scene-panels-ui, nb / en | 39/39 / 39/39 |
| p4-alpha-export, nb / en | 39/39 / 39/39 |
| r5-poster-export, nb / en | 10/10 / 10/10 |
| ca8-rhythm-export, naturlig tospråklig kjøring | 22/22 |
| export-e2e, film / scene | Videofil større enn 0 byte i begge kjøringer |
| Automatisk forhåndsvisningskontroll | build OK |

En tvungen `UI_LANG=nb`-kjøring av ca8 ga først 20/22, fordi suiten har to eksplisitte engelske steg. Den uendrede, naturlig tospråklige suiten besto 22/22; tvungen en besto også 22/22. Ingen eksisterende forventninger ble svekket.

Nye tester: `ui-prefs-sync.test.tsx` og `rigg-r4.mjs`. PDF-testen er utvidet med 0,05/0,3 mm og avvisning av 0,31 mm. Eksisterende PDF-tester kontrollerer eksakte mål, inches-konvertering, MediaBox, plassering av bilde, strekbredde, PrintScaling, overlapp, målestokk, bortvalgte felt, sceneavgrensning og fravær av målinger uten referansevalg.

Det er ikke kjørt manuell `tsc --noEmit`: prosjektets automatiske kontroll er brukt i samsvar med miljøets regler. Siste kontroll viser build OK.

## Avvik og ekstern verifisering

- Fysisk prøve med skriver og linjal er ikke gjennomført. Testplanen ligger i `RIGG_PRINT_TEST.md`; den krever fysisk utstyr.
- Lavoppløselige kilder beholdes, med 150 dpi-varselet; dette avviket er godkjent i oppdraget.
- Banemasker er fortsatt utenfor datamodellen, som tidligere godkjent i runde 2.
- Figurnotater hentes fra eksisterende ressursoppgaver/manusblokker i scenen. NoteFlag-koblingen dekker eksisterende lydklippkoblinger; full dekning av alle mulige fremtidige lag-/ressursmerknadstyper er ikke dokumentert av denne testen.
- Ingen databaseendring, ny pakke, publisering eller ekte utskrift i denne runden.

## Endrede filer i oppdraget

- `src/adapters/storage/project-rows.ts`: forventer 72.
- `tests/visual/schema-version.mjs`: fixtureversjon 72.
- `src/app/account/ui-prefs.ts`: synkronisert personlig lest-status.
- `src/app/ai/GenerationStatus.tsx`: stabil jobbidentifikator og inventarunntak for klassestreng.
- `src/core/print/measure/index.ts`: nb/en-valideringsfeil.
- `src/core/print/pdf/layout.ts`: ren layout og validering av klippelinje.
- `src/core/print/pdf/index.ts`: eksporterer bare den plattformnøytrale delen.
- `src/core/print/pdf/render.ts`: flyttet til eksportlaget.
- `src/engine/export/rig-pdf.ts`: PDF-tegning.
- `src/app/rig/PrintPanel.tsx`: PDF-valg, forhåndsvisning og nedlasting.
- `src/app/rig/PrintAnnotations.tsx`: opp-pil, QR-plass og referansemarkører i arkvisningen.
- `src/app/rig/InspectionWindow.tsx`: integrerer PDF-panelet.
- `tests/unit/ui-prefs-sync.test.tsx`: samtidige forbrukere.
- `tests/unit/print-pdf.test.ts`: PDF-kontroller.
- `tests/visual/job-read.mjs`: 8 lest-statuskontroller.
- `tests/visual/rigg-r4.mjs`: PDF-flyten.
- `src/core/i18n/authored.json`: nye nb/en-par.
- Regenererte inventar/katalogfiler: `scripts/i18n/{mapping.v1,references.v1,candidates.v1,inventory-report}.json`, `src/core/i18n/locales/{nb,en,en-XA}.json`, `src/core/i18n/runtime.gen.json`.
- `AGENTS.md`: layout/rendering-grense.
- `roadmap.md`: oppdragsstatus og fysisk blocker.
- `docs/development/RIGG_R4_REPORT.md`: denne rapporten.

Arbeidsregler brukt: Animatic-oppdrag, testing, arkitektur og data, i18n og UI/designsystem.