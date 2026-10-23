# Veikart

## G-5 vekst og misbruk (23.10.2026)
- [ ] 1. change_log-oppbevaring: 90 dager / 20 000 endringer, komprimering til øyeblikksbilder, project_seq/synk bevart, cron eller admin-knapp
- [ ] 2. Kvoter per arbeidsgruppe/bruker: lagring, prosjekter, change_log-rader, opplastinger/time; admin-styrt, servertvang, oversatte meldinger
- [ ] 3. film_shares.token: bare hash/digest, kryptering for QR-gjenvisning med nøkkelversjon
- [ ] 4. Tak på jsonb-kolonner (95 stk): liste per kolonne + test for nye kolonner
- [ ] Rapport docs/development/G5_VEKST_REPORT.md; migrasjon 0097; tsc/vitest/DB grønne

## G-4 skriftsystemer (23.10.2026)
- [ ] 1. RTL: dir=auto på brukertekst, logisk CSS, manusvisning/PDF speilet + shaping, tekstlag, tester ar/he
- [x] 2. Søk: 0096 unaccent+pg_trgm, indekser, CJK, admin_find_users, kjerne-fold NFKC, måling 50k blokker
- [x] 3. NFC-normalisering i apply_changes-klientveien og import, med test
- [x] Rapport docs/development/G4_SKRIFT_REPORT.md (delvis; full vitest/i18n gjenstår)

## G-3 global bruk (23.10.2026)
- [x] 1. Intl.Segmenter for ord/grafemer (film, forecast, varighet, plakat, globalt søk) + talehastighet per språk
- [x] 2. Sceneoverskrifter per språk, prosjektord, tvungen overskrift alltid
- [x] 3/4/7. Kjerne: resolver bruker → arbeidsgruppe → prosjekt med kilde; papir/manusformat fra land
- [x] 6. 0094: tidssone på profil/arbeidsgruppe, private.budget_period_start (DB-test Auckland/LA)
- [x] 8. workspaces.region (0094)
- [x] 5. fx_rates-tabell (0094)
- [ ] Leveranse 2: koble kvotefunksjonene til budget_period_start (ny migrasjon med siste definisjoner ordrett)
- [ ] Leveranse 2: valutaomregning (serverhenting fra gratis kilde + visning/eksport)
- [ ] Leveranse 2: innstillingsflater (konto, arbeidsgruppe, prosjekt via apply_changes) og papirvalg i rigg/plakat/X-sheet/PDF
- [ ] 9. E-post på mottakerens språk (avhenger av Lovable Clouds e-postmaler)
- [ ] Claude: kjør 0094 i Cloud

## G-2 skala (23.10.2026)
- [x] A3 indekser, A4 RLS, A1 innlasting/øyeblikksbilde, A2 synk via project_seq, g1-triggere (0093)
- [ ] Claude: kjør 0093 i Cloud og mål åpning av et stort prosjekt der

## G-1b (pågår)
- [x] 1. Kildevelger ved oppretting + advarsel ved bytte (LanguageVersionsDialog)
- [x] 2. Import (Fountain/FDX/Word/PDF): språkforslag + bekreftelse
- [x] 3. Bred kontroll av norske standarder + arkitekturtest nb/no + fjern PRIMARY_LANGUAGE-symbol
- [x] 4. Samordne BCP-47-validering (Intl vs kjerne-regex; ev. 0091 for DB)
- [x] 5. Manus-PDF: Noto per skriftsystem, OFL dokumentert, lazy-lasting
- [x] 6. Rundtur ja/en/nb: backup, gjenoppretting, avvik, faktisk eksportfil
- [x] 7. Brukerflyt-test: oppretting, bekreftet import, ja-manus med nb/en-mål
- [x] 8. Kravoversikter: check_kb grønn (PyYAML eller JS-variant)
- [x] Rapport: oppdater docs/development/G1_SPRAKNOYTRAL_REPORT.md
- [ ] Full vitest + i18n + DB-tester grønne

## G-8 sikkerhetsrunde 2 (23.10.2026)
- [x] 1. Lagring: bøtter, policyer, signerte URL-er og opplasting gjennomgått (valg om filtyper ført i TODO «Krever Øystein»)
- [x] 2. Felles hastighetsgrenser i databasen (0100, PTG15) + innlogging/pass med IP på serveren
- [x] 3. Hemmeligheter maskeres i feilrapportering; no-store på serverfunksjoner, API og tokensider
- [x] 4. RLS-/anon-test og matrise i rapporten
- [x] 5. Sårbarhetssjekk: 19 av 23 rettet innenfor tillatte versjoner
- [x] tsc 0, full vitest grønn, DB 216/0; Claude: kjør 0100 i Cloud

## G-7 robust lagring (23.10.2026)
- [x] Migrasjon 0099: del apply_changes i liten kjerne + private.validate_<domene> registrert i register-tabell
- [x] Oppførsel nøyaktig lik: DB-suite før (201/0) og etter (211/0), nye tester per validering (G-7.1–G-7.10)
- [x] Ytelsesmål: 10 000 blokker før (902/860 ms) og etter (946/942 ms), ~5–9 % innenfor støy
- [x] AGENTS-regel i docs/agents/APPLY_CHANGES.md (AGENTS.md-peker droppet pga. 12 288-bytebudsjettet)
- [x] Rapport docs/development/G7_APPLY_CHANGES_REPORT.md; DB-tester og search_path='' grønne
- [x] tsc 0, full vitest 2838/0, DB-tester 211/0, i18n grønn (i vitest-suiten); Claude: kjør 0099 i Cloud

## G-6 gjenbruk på tvers av prosjekter (23.10.2026)
- [~] 1. Globale karakterknipper: migrasjon 0098, kjerne (plan/publisering/innhentingskommandoer) og adaptere ferdig og testet — UI-kobling (publiser/hent-knapper) gjenstår; rigg i knippe venter på produktvalg (rigg er scenebundet)
- [~] 2. Arbeidsgruppeprofiler: tabell, RPC-er og kjerneoppløsning ferdig og testet — profil-UI og kobling til resolveSettings gjenstår
- [x] 3. Tilgang: RLS bare for arbeidsgruppemedlemmer; roller eier/redaktør/leser; RLS-tester grønne
- [x] 4. Backup: innhentede knipper materialiseres som prosjektrader i BACKUP_STATE_TABLES; rundtur-testet
- [~] Rapport docs/development/G6_GJENBRUK_REPORT.md skrevet; tsc 0, DB 201/0, fokuserte vitest 18/0 — full vitest og i18n gjenstår; 0098 ikke kjørt i Cloud
