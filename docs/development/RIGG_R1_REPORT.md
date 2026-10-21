# Rigg & 2D-utskrift (B-087) – rapport runde 1

Dato: 2026-10-21. Omfang: kjerne, persistens, migrasjon 0071, rigg-fanen, lagpanelkobling, enhetsvalg og «Glemt passord?» (ekstra punkt 6).

## Datamodellen

- **`rig_templates`** – riggmaler i prosjektet (`id`, `project_id`, `name`, `spec` jsonb, `removed`, `revision`, `created_at`, `created_by`). Maler endres bare eksplisitt («Lagre som mal» / «Oppdater malen»).
- **`rig_setups`** – riggen i bruk: prosjektets standardrigg (`scene_id` null) eller riggen i én scene. Begge er kopier med individuelle justeringer (B-090 pkt 4); `template_id` viser bare opphavet. Delvis unike indekser gir én aktiv standardrigg og én aktiv rigg per scene.
- **`composition_layers.rig_plate_id` / `rig_plate_depth_mm`** – platekobling og dybde/tykkelse (standard 0) per lag. Bevisst ingen fremmednøkler: angre/gjør om og opprydding håndheves i kjernen.
- **`global_rig_templates`** + `global_publish_rig_template` – publisering til arbeidsgruppens globale bibliotek som låste, nummererte versjoner (rollen sjekkes i databasen).

`spec` inneholder `format: "1"`, `camera` (sensor mm, brennvidde mm, kamerahøyde mm, modus fast/bevegelig), `plates` (permanent ID, navn, høyde over bord i mm, glasstykkelse) og `calibration`.

### Hvorfor plater og kalibrering ligger som jsonb i `spec`

Platene er en ordnet, lukket del av riggoppsettet: de har ingen egen livssyklus, deles aldri mellom rigger og refereres bare via lagets `rig_plate_id`. Egne tabeller ville gitt flere rader i `apply_changes`, egen delete-rekkefølge og egen undo-håndtering uten gevinst. Kalibreringen gjelder nøyaktig én verdimengde av kameraet og lagres sammen med verdiene den gjelder (B-090 pkt 5) – den er derfor et felt i oppsettet, ikke en egen entitet. jsonb gjør også maler og globale versjoner til én uforanderlig blob, som passer den låste versjoneringen i `global_rig_templates`. Valideringen (`multiplaneRigSpecError`) kjøres i kjernen før lagring og i `global_publish_rig_template`.

## Matematikk (B-090)

- Avstand d = kamerahøyde − platehøyde; forstørrelse m = f / (d − f); synsfelt = sensor / m.
- Fysisk figurstørrelse = figurens andel av komposisjonen × synsfeltet. Transform og keyframes på valgt frame teller med; i «fast kamera» bakes den digitale zoomen inn (bare zoom endrer figurstørrelse – panorering/rotasjon gjør ikke). I «kamera i bevegelse» brukes hvileposisjonen.
- Gyldig kalibrering overstyrer teorien. Endres kameraverdiene, merkes kalibreringen ugyldig uten å slettes, og teoriberegningen brukes med varsel i fanen.
- Parallakse per plate = avstandsforholdet mot referanseplaten; lagets overstyrte parallakse merkes med «≠» i lagpanelet.

## Grensesnitt

- **Rigg-fanen** (`/prosjekt/:id/rigg`): sidesnitt i målestokk (SVG: kamerahus, objektiv, linsekjegle, plater med avstander), kamera/objektiv-felt, kameramodus, plateeditor (navn, høyde, glasstykkelse, legg til/fjern – fjerning av plate i bruk blokkeres), kalibrering med gyldighetsstatus og måling, maler («Lagre som mal», «Oppdater malen», «Bruk malen»), publisering til gruppens bibliotek, og 3D-print som deaktivert plassholder «Kommer senere».
- **Lagpanelet**: platevelger og dybde for valgt lag (kommando `SetLayerRigPlate`, kan angres), fysisk størrelse på gjeldende frame, og avviksmerke «≠» på rader der parallaksen er overstyrt bort fra platenivået.
- **Enheter**: mm er standard; brukeren kan velge tommer. Valget huskes per bruker (ui_prefs + nettleser). All lagring er i mm; tommer er bare visning.
- Alt brukervendt tekst via `t()` på nb og en (i18n-kontrollen er grønn).
- **Glemt passord?**: lenke på innloggingssiden sender tilbakestillings-e-post med omdirigering til `/tilbakestill-passord`. Svaret er likt uansett om e-posten finnes, og adressen logges ikke. Ny side setter nytt passord via recovery-økten.

## Tester og verifisering

- Full Vitest: **2056 bestått, 10 hoppet over, 0 feilet**.
- Lokale DB-tester: **147/147**, inkludert 0071 (RLS, apply_changes, én standardrigg, globale maler, sletting).
- `tests/unit/glemt-passord.test.ts`: 2/2 (likt svar uansett om e-posten finnes; redirect til /tilbakestill-passord).
- Røyktest i nettleser: innloggingssiden viser «Glemt passord?», og `/tilbakestill-passord` tegnes med riktig tittel.
- DEC-0100 er registrert; REQ-0895 er Verifisert via `tests/unit/todo-3d-print.test.ts`.

### Ikke fullført i denne omgangen

- Visual suite `tests/visual/rigg-r1.mjs` (nb og UI_LANG=en) er ikke skrevet.
- Regresjonssuitene scene-panels, ca1, ca8, u5, p4 og export-e2e er ikke kjørt.
- Rigg-fanen og lagpanelkoblingen er ikke røyktestet i nettleser med innlogget bruker (økt kunne ikke opprettes uten godkjenning; flere brukere i prosjektet krever valg av konto).
