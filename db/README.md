# db/ – databaseskjema for Animatic Studio (DEC-0022, ADR-0009)

- `migrations/NNNN_navn.sql` – Animatic Studios egne migrasjoner. Kjøres **én gang** i Lovable Cloud ved at Mars ber Lovable kjøre filen uendret (`docs/development/LOVABLE_SYNC.md` B). En kjørt fil endres aldri; endringer kommer som ny fil.
- `drizzle/` i rotmappen eies av Lovable (Lovable registrerer kjørte endringer der). Ikke rør den.
- Hver migrasjon legger inn en rad i `public.schema_version`. Appen sammenligner med `EXPECTED_SCHEMA_VERSION` i `src/adapters/storage/project-rows.ts` og viser et varsel hvis databasen er bak.
- Lokal test: `DATABASE_URL=postgres://… bun tests/db/run-db-tests.ts` (emulerer Supabase-roller og `auth.uid()` med `tests/db/supabase-emulation.sql`). Nye migrasjoner må legges til i testskriptet.

| Versjon | Fil | Innhold |
|---|---|---|
| 1 | `0001_core.sql` | Prosjekt, medlemskap, invitasjoner, produksjoner, scener, varianter, blokker + historikk, forekomster, segmenter, takes, kommandologg, RLS, `create_project`, `apply_changes`, invitasjons-RPC-er |
