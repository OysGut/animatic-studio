# SB-1 — Storyboard Studio: datamodell og grunnmur

Dato: 23.10.2026. Migrasjon: `db/migrations/0102_sb1_storyboard.sql` (ikke kjørt i Cloud — venter på Claudes gjennomgang). Ingenting publisert, ingen betalte kall.

## Hva ble bygget

Storyboardpaneler bygges på den eksisterende komposisjonsmodellen (beslutning fra Øystein): et panel er en rad i `compositions` med `kind = 'storyboard'`, knyttet til sceneforekomst (`occurrence_id`, `on delete restrict`) og variant (`variant_id`), med panelrekkefølge `order_key` innen scenen, samt `active` og `hidden`. Unikhetsregelen «én aktiv komposisjon per variant» fra 2D-scener gjelder fortsatt bare `kind = 'scene'` (delvis unik indeks oppdatert).

### Begrunnede valg

1. **Forankring i manuset: egen koblingstabell `storyboard_panel_blocks`** (panel ↔ blokk, `order_key`, flere blokker per panel og flere paneler per blokk) i stedet for et jsonb-felt på panelet. Begrunnelse: fremmednøkler og RLS håndheves av databasen, sletting/deaktivering av blokker kan spores, og koblingen får egen revisjon slik at den kan angres uavhengig av panelet. Fremmednøkler med `on delete restrict`, som i `asset_relations`.
2. **Revisjoner av panelet: jsonb-øyeblikksbilde i `storyboard_panel_snapshots`** i stedet for komposisjonsversjonskjeder. Begrunnelse: komposisjoner har i dag ingen versjonstabell — å innføre en full versjonskjede for SB-1 ville kopiert hele lagstrukturen per versjon og krevd pekere fra alle lag. Et uforanderlig øyeblikksbilde (panel + lag + blokkforankringer) tas av kommandoen `SnapshotStoryboardPanel`, som krever at storyboardstatusen er `done` — altså nettopp situasjonen «rediger etter godkjenning». Øyeblikksbildet er et dokument, ikke en levende struktur, og kan ikke endres i etterkant. Tak: 4 000 000 tegn.
3. **Statusspor: `production_statuses` + `production_status_events`**, ikke nye kolonner på scenen. Én aktiv statusrad per fagområde (script, storyboard, animation, sound, film) og mål (forekomst ELLER panel — sjekkregel krever nøyaktig én), og en hendelsesrad per endring, slik at tidligere godkjenninger bevares. Statusverdier: `not_started`, `in_progress`, `review`, `changes_requested`, `done` (sjekkregel; flere kan legges til senere). Dagens `work_status` fra B-118 forblir den samlede statusen og røres ikke.
4. **Nye lagtyper `note`, `arrow`, `camera_mark`** som nye jsonb-kolonner på `composition_layers` med sjekkregler (feltet krever riktig `kind`, og `kind` krever feltet). Valideringsfunksjoner (`private.validate_storyboard_panels`, `private.validate_storyboard_layer_kinds`, `private.validate_storyboard_panel_blocks`, `private.validate_production_statuses`) er registrert i `private.apply_change_validators` fra G-7 — kjernen i `apply_changes` er ikke endret. Sjekkregler og fremmednøkler slår inn før validatorene; begge lag avviser ugyldige rader.
5. **Kommentarer:** gjenbruk av eksisterende `script_annotations`/notater med kobling til panel — ingen ny kommentarmodell ( ingen ny tabell for dette i 0102).
6. **Ingen paneler i migrasjonen.** Første åpning foreslår ett tomt panel per scene (`SeedStoryboardPanels`, maks 1 000, med bekreftelse og invers `UndoSeedStoryboardPanels`) — selve forslagsflyten er brukerflate og kommer i SB-2.

## Kjernekommandoer (alle med invers, via apply_changes)

`AddStoryboardPanel`, `UpdateStoryboardPanel`, `RemoveStoryboardPanel` (soft), `MoveStoryboardPanel` (rekkefølge), `ReorderStoryboardPanels`, `SetStoryboardPanelActive` (deaktiver/gjeninnfør), `SetStoryboardPanelHidden`, `MoveStoryboardPanelToScene` (ny forekomst + ny blokkforankring), `SetProductionStatus` (med hendelseshistorikk), `SnapshotStoryboardPanel`, `SeedStoryboardPanels`. Flytting mellom scener avviser forankring til blokker i feil variant og fjernede blokker. Skjemaport: kommandoene og lagtypene krever schema-versjon 102 (også inni `UpdateSceneDraft`).

## Lasting, synk og sikkerhetskopi

`project_snapshot` (G-2) returnerer de fire nye tabellene (52 → 56), den inkrementelle synkroniseringen bruker samme `change_log`-vei som resten, og sikkerhetskopi/gjenoppretting tar med paneler, blokkforankringer, statuser og øyeblikksbilder.

## Sikkerhet

RLS med `private.my_project_ids()` som resten av prosjektdataene; klienten kan ikke skrive direkte (bare `apply_changes`). Tak på alle nye jsonb-felt (G-5-mønster). Alle nye SECURITY DEFINER-funksjoner har `set search_path = ''` med fullt kvalifiserte navn. Ingen hastighetsgrenser (per oppdrag).

## Testresultat

- `tsgo --noEmit`: 0 feil.
- Full Vitest: **2868 bestått, 0 feilet, 10 hoppet over** (362 filer).
- DB-suite mot lokal Postgres med alle migrasjoner 0001–0102: **224 bestått, 0 feilet**, inkludert SB-1.1–SB-1.5 (panelmodell, lagtyper bare i storyboard, blokkforankring i samme prosjekt/variant + RLS, statusspor med bevart historikk, øyeblikksbilde/sletting) og `search_path=''`-kontrollen.
- i18n-sjekk: grønn (ingen nye brukervendte tekster i SB-1; feilmeldinger i kjernen bruker eksisterende nøkler).
- Enhetstester `tests/unit/sb1-storyboard.test.ts`: 12/12 (kommandoer med invers, angre/gjør om, flytting mellom scener, statushistorikk, sikkerhetskopi-rundtur).

### Feil funnet og rettet underveis

1. Sjekkregel-kollisjon: `ADD COLUMN ... CHECK` autogenererte navn som kolliderte med eksplisitte `ADD CONSTRAINT` (42710) — omdøpt til `*_kind_check`.
2. Rundturavvik i `patch.ts`: `optStr(null)` ga `occurrenceId: null`/`orderKey: null` på vanlige 2D-scener og brøt test 0007 (og kaskadert 0011/0012) — feltene settes nå bare når de har verdi.
3. Kontrakttesten `storage-contract.test.ts` leser bare enlinjes `ALTER TABLE ... ADD COLUMN` — 0102 skrevet om til én setning per kolonne.
4. Testforventninger justert til faktiske feilkoder: sjekkregler (23514) og fremmednøkler (23503) slår inn før validatorene (22023) — begge lag avviser, og testene dokumenterer hvilket lag som stopper hvert tilfelle.

## Gjenstår / begrensninger

- 0102 er ikke kjørt i Cloud; Claude gjennomgår og kjører den.
- Brukerflate kommer i SB-2 (galleri) og SB-5 (referansepanelet); forslagsflyten for første åpning krever SB-2 for å vises.
- Øyeblikksbilder gjenopprettes ikke automatisk — gjenoppretting fra et øyeblikksbilde er et bevisst valg som kan bygges i en senere fase.
