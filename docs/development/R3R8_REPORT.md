# Rapport R3, R5, R6 og R8 (21.10.2026)

## Bygget
- **R3 – global publisering for ressurser som allerede er globale.** «Publiser globalt» i stilharmoniseringen lager en ny versjon på den globale varianten prosjektvarianten er kopiert fra (eller en ny global variant hvis den ikke er koblet), aldri en kopi av hele ressursen. Rettigheter (prosjektredaktør + redaktør/eier i gruppen, ressurskobling og at filen hører til prosjektet) sjekkes i serverfunksjonen `publishVersionToGlobal`. «Angre» kaller `setGlobalVersionWithdrawn(true)`: versjonen trekkes tilbake og vises ikke for ny bruk; raden og filen beholdes. «Gjør om» publiserer den igjen. Prosjekter som har kopiert versjonen, endres aldri; de ser bare et varsel i det globale biblioteket. Prosjektet som publiserte, får ikke varsel om sin egen fil.
- **Migrasjon 0068** (`db/migrations/0068_global_withdrawals.sql`): ny tabell `global_version_withdrawals` (SELECT for gruppemedlemmer via RLS, ingen direkte skriving fra klienten) og ny funksjon `global_set_version_withdrawn`. **Erstatter ingen funksjoner**: `apply_changes`, `create_project`, `delete_project`, `purge_project_assets` og `purge_removed_assets` er uendret, så Cloud-hashene skal være de samme etter kjøringen. Ingen nye filstier lagres, så referansesjekken for oppryddingen er uendret. Skjemaversjon 68. Ikke kjørt i Cloud.
- **R5:** `tests/visual/screens.mjs` er avviklet formelt (filen er nå en kort forklaring). Den tok 139 skjermbilder uten kontroller, fant knapper på norsk tekst og stoppet med tidsavbrudd etter B-049. Skjermene dekkes av `u5-screens.mjs`; plakateksporten (PDF/PNG) av den nye `r5-poster-export.mjs` (med `data-testid` på eksportknappene).
- **R6:** Ingen katalogtekst inneholdt «Lovable», men seks tekster hadde fått navnet byttet mekanisk til «Animatic Studio» der plattformen var ment (kreditter, bakgrunnsjobb, forhåndsvisning, servervariabel). De er skrevet nøytralt på nb og en (`r6-brand.*`). Releasekontrollen stopper nå bygget hvis «Lovable» står i en brukertekst. `ai-admin-ui` og `ai-admin.test.ts` er oppdatert til de nye tekstene. 500 MB-grensen for video gjelder bare nettversjonen (`videoMaxBytes`, `APP_TARGET`). REQ-0639 er satt til Verifisert, og REQ-0679 har fått ny historikk.
- **R8:** Knappen heter «Importer oversatt manus …» / «Import translated script …» (ny nøkkel), og dialogen viser «Målspråk: Engelsk (en)».

## Testtall
- tsc: rent. i18n-sjekk og releasekontroll: bestått (nb og en 100 %).
- vitest: 2 019 bestått, 10 hoppet over. Én tidsavhengig test (`realtime-channels`) fikk tidsavbrudd i én full kjøring, men besto alene.
- DB lokalt: 144/144 (ny 0068-test). `/etc/passwd` og `/etc/group` er uendret, og den midlertidige databasen er fjernet.
- Visuelt (nb / UI_LANG=en): r3r4-global-prores 58/58 og 58/58; r5-poster-export 10/10 og 10/10; global-library 28/28 og 28/28; r1r2-prores-cleanup 26/26 og 26/26; ai-admin-ui 46/46 og 46/46; ml3-script-languages 38/38 og 19/19; translation-ai-align-ui 16/16 og 16/16; p7-prores 45/45 og 45/45; p8 110/110 på nb; ca7-global 26/26 på nb.

## Avvik
1. p8 med UI_LANG=en: 4 feil, og ca7-global med UI_LANG=en: 1 feil. Begge er de samme kjente ML4-avvikene som før: suitene leter etter norske knappenavn.
2. `ai-admin-ui` følger ikke UI_LANG; suiten tester bare norsk. Den engelske teksten er dekket av enhetstesten.
3. DB-testen sjekker at et annet prosjekt er uendret, men lager ikke en egen prosjektkopi av den globale versjonen. At kopien beholdes og varsles, er dekket av enhetstesten (`withdrawnInUse`).
4. R3-angre i visuell test: «gjør om» rett etter «angre» må vente til angringen er lagret (testen venter 0,5 s).
5. `build-catalog.mjs` tømte `catalog.gen.ts` under kjøringen. Filen er gjenopprettet fra forrige versjon og ikke endret. Skriptet bør ses på.
6. Det finnes ingen desktopversjon ennå. Grensen er bare gjort avhengig av `APP_TARGET`.
