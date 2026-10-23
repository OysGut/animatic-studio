# G-6 Gjenbruk på tvers av prosjekter — rapport (del 1)

## Status: DELVIS LEVERT — ikke publiser, ikke kjør 0098 ennå

### Ferdig og testet

**Migrasjon `db/migrations/0098_g6_cross_project_reuse.sql` (IKKE kjørt i Cloud)**
- `global_character_bundles`: versjonerte, uforanderlige karakterknipper per global karakter (stemmeprofil, faktaark med tekstversjoner, munnsett, riggoppsett, godkjente globale bildeversjoner). Nummerering er per karakter og låst (`unique(global_asset_id, number)`); update/delete er blokkert av trigger — endringer publiseres bare som et nytt nummer.
- RPC-er (alle SECURITY DEFINER med `set search_path = ''`, fullt kvalifiserte navn): `global_publish_character_bundle` (eier/redaktør; godkjente versjons-ID-er må tilhøre karakteren), `global_character_bundle` (lesing, alle medlemmer), `workspace_save_profile` / `workspace_archive_profile` (eier/redaktør, revisjonssjekk).
- `workspace_profiles`: stil-, kvalitets-, font- og malprofiler på arbeidsgruppen med én standard per type (delvis unik indeks) og arkivering.
- `assets.global_bundle_number`: hvilket knippe prosjektet sist hentet (ren metadata, flyter gjennom `apply_changes`).
- Tilgang: bare medlemmer av arbeidsgruppen leser begge tabellene (RLS); skriving skjer bare via RPC-ene. Anon har ingen tilgang. Alle jsonb-felt har `pg_column_size`-tak (G-5-regelen).

**Kjerne (plattformnøytral, `src/core/global/`)**
- `character-bundle.ts`: validering/tolking av knipper; `planCharacterPull` — felt-for-felt-plan der lokale overstyringer bevares og ingenting fjernes; `characterBundleFromAsset` — bygger knippet fra prosjektdata med variantnavn (aldri lokale ID-er) slik at det er flyttbart; `planCharacterPullCommands` — én kommando per felt (`SetAssetVoice`, `SetAssetBriefVersions` som bare legger til nye tekstversjoner, `SaveMouthSet`, `UpdateAsset` med knippenummer), alt i én angregruppe.
- `workspace-profiles.ts`: profiltyper, validering og oppløsning — prosjektets egne profiler vinner over gruppens; arkiverte profiler brukes ikke.
- `UpdateAsset` (kommando) kan nå bære `globalBundleNumber`, med korrekt invers, slik at innhenting angrer i ett steg.

**Adaptere**: RPC-/listefunksjoner for knipper og profiler i `src/adapters/browser/global-library.ts`.

### Tester
- DB-tester: 201 bestått, 0 feil (tre nye G-6-tester: versjonering/uforanderlighet/roller/RLS for knipper; standardprofil, revisjonssjekk, arkivering, RLS for profiler; `global_bundle_number` gjennom `apply_changes`). Search_path-testen for alle SECURITY DEFINER er grønn.
- Enhetstester: 18 bestått (validering, innhentingsplan, kommandoer med invers, rad-rundtur for backup).
- Typekontroll: 0 feil.

### Begrunnelser
- **Uforanderlige knipper + eksplisitt innhenting**: ingenting i et prosjekt endres automatisk; innhenting krever bekreftelse og angrer i ett steg (samme mønster som GP2).
- **Variantnavn i stedet for ID-er i munnsett**: lokale ID-er er meningsløse i et annet prosjekt; navn er den stabile identiteten. Former uten navnetreff utelates heller enn å lage døde referanser.
- **Godkjente versjoner kun fra global kopi**: en lokal versjon har ingen global ID; den må publiseres globalt først, ellers ville knippet pekt på filer andre prosjekter ikke kan lese.
- **`pg_column_size` på alle nye jsonb-felt**: G-5-testen krever dette for alle jsonb-kolonner.

### Gjenstår (neste leveranse)
1. **UI-kobling**: «Publiser knippe» og «Hent oppdatering» i det globale biblioteket, og profilbehandling på arbeidsgruppesiden. Adaptere og kjerne er klare; grensesnittet er ikke koblet på.
2. **Rigg i knippet**: riggoppsett er scenebundet og har ingen kobling til karakter — dette trenger et produktvalg før rigg kan publiseres i knippet (trekkes inn støttes allerede).
3. Full Vitest-kjøring og i18n-sjekk etter UI-arbeidet.
4. 0098 skal gjennomgås og kjøres i Cloud av Claude før UI-et kan brukes mot sanne data.

### Sikkerhetskopi (pkt 4)
Innhenting materialiserer alt til vanlige prosjektrader (ressurs, versjoner, munnsett, tekstversjoner, knippenummer), og disse tabellene er allerede i `BACKUP_STATE_TABLES` — et prosjekt kan gjenopprettes alene. Dekket av rundtur-testen ovenfor.
