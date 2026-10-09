# db/ – databaseskjema for Animatic Studio (DEC-0022, ADR-0009)

- `migrations/NNNN_navn.sql` – Animatic Studios egne migrasjoner. Kjøres **én gang** i Lovable Cloud ved at Mars ber Lovable kjøre filen uendret (`docs/development/LOVABLE_SYNC.md`). En kjørt fil endres aldri; endringer kommer som ny fil.
- `drizzle/` i rotmappen eies av Lovable (Lovable registrerer kjørte endringer der). Ikke rør den.
- Hver migrasjon legger inn en rad i `public.schema_version`. Appen sammenligner med `EXPECTED_SCHEMA_VERSION` i `src/adapters/storage/project-rows.ts` og viser et varsel hvis databasen er bak.
- Lokal test: `DATABASE_URL=postgres://… bun tests/db/run-db-tests.ts` (emulerer Supabase-roller og `auth.uid()` med `tests/db/supabase-emulation.sql`). Nye migrasjoner må legges til i testskriptet.

| Versjon | Fil                        | Innhold                                                                                                                                                                                                                            |
| ------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | `0001_core.sql`            | Prosjekt, medlemskap, invitasjoner, produksjoner, scener, varianter, blokker + historikk, forekomster, segmenter, takes, kommandologg, RLS, `create_project`, `apply_changes`, invitasjons-RPC-er                                  |
| 2       | `0002_import_profiles.sql` | Kildereferanse, usikkerhet og «fjernet» på manusblokker; usikkerhet på scenevarianter; `imported_documents` + `register_imported_document`; privat bøtte `sources` med lese-/opplastingspolicyer; `profiles` + `upsert_my_profile` |
| 3 | `0003_script_versions.sql` | Manusversjoner (`script_versions`, `private.script_snapshot`, `create_script_version`), fortløpende `change_log.seq`, tilstedeværelse bare for medlemmer (policyer på `realtime.messages`) |
| 4 | `0004_library_notes.sql` | Ressursbibliotek (`assets`, `asset_variants`, `asset_versions`, privat bøtte `assets` for bilder), notater i manus (`script_annotations`), `apply_changes` med de nye tabellene og avvisning av ukjente tabeller |
| 5 | `0005_note_edits_large_files.sql` | «Endret av» på notater (`edited_by_name`, `edited_at`), bildefiler opptil 5 GB i databasen. Lovable la til ny kolonne `byte_size_big` (bigint) i stedet for å endre `byte_size`; filen er oppdatert til det som faktisk ble kjørt |
| 6 | `0006_byte_size_big.sql` | Den utgåtte `byte_size` blir valgfri og mister 50 MB-grensen; `byte_size_big` fylles automatisk hvis bare `byte_size` sendes. Appen skriver og leser `byte_size_big` |
