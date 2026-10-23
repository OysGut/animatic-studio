# Veikart

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
