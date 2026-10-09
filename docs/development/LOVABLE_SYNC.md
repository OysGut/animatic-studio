# Oppsett og synk med Lovable og GitHub

For Mars. Ingen kommandolinje trengs. Bakgrunn: DEC-0005, ADR-0002.

## A. Engangsoppsett (ca. 15 minutter)

1. **Lovable:** Logg inn på lovable.dev → nytt prosjekt med navnet **Animatic Studio**. Skriv bare: «Opprett et tomt prosjekt. Ikke bygg noe ennå.»
2. **Backend:** ✅ Gjort 2026-10-08 – Lovable Cloud er slått på (DEC-0008).
3. **GitHub:** I Lovable: prosjektinnstillinger → **GitHub** → koble til (lag GitHub-konto om du ikke har). Lovable lager repoet `animatic-studio` (privat).
4. **GitHub Desktop:** Installer fra desktop.github.com og logg inn med samme GitHub-konto.
5. **Hent repoet:** GitHub Desktop → *File → Clone repository* → velg `animatic-studio` → *Local path*: `Claude/Projects/Animatic Studio` (mappen som allerede er koblet til Claude). Resultatet blir `Claude/Projects/Animatic Studio/animatic-studio`.
6. Si fra til Claude. Claude flytter da grunnlaget (`docs/`, `.claude/`, `scripts/`, `CLAUDE.md`, `AGENTS.md`) inn i repoet og bygger videre der.

## B. Etter hver leveranse fra Claude

1. Åpne GitHub Desktop. Du ser endrede filer og en ferdig commit-melding som Claude har lagt i `docs/development/NEXT_COMMIT_MESSAGE.txt` – lim den inn i «Summary».
2. Trykk **Commit to main** og deretter **Push origin**.
3. Gå til Lovable-prosjektet. Kodeendringene kommer inn automatisk etter litt. **Databaseendringer kommer ikke automatisk** (Lovable kjører ikke databasefiler fra GitHub). Når Claude skriver at leveransen har en ny migrasjon (f.eks. `db/migrations/0002_import_profiles.sql`), lim inn denne meldingen i Lovable-chatten og bytt ut filnavnet:

> Kjør SQL-filen `db/migrations/0001_core.sql` mot databasen nøyaktig slik den står i repoet, som én databaseendring. Ikke endre, del opp, oversett eller omskriv SQL-en, og ikke lag egne tabeller i tillegg. Ikke endre filer i `docs/`, `.claude/`, `scripts/`, `db/`, `src/core/`, `src/adapters/` eller `tests/`. Når den er kjørt, kjør `select version, description from public.schema_version order by version` og svar med resultatet og eventuelle feilmeldinger ordrett.

   Appen viser et oransje varsel øverst så lenge databasen mangler en migrasjon. Når varselet er borte, er alt på plass.

   **Kjørte migrasjoner:** `0001_core.sql` (2026-10-08), `0002_import_profiles.sql` (2026-10-09; bøtta laget med Lovables lagringsverktøy fordi SQL mot `storage.buckets` ikke er tillatt), `0003_script_versions.sql` (2026-10-09), `0004_library_notes.sql` (2026-10-09; bøtta `assets` laget med lagringsverktøyet), `0005_note_edits_large_files.sql` (2026-10-09; Lovable la til kolonnen `byte_size_big` i stedet for å endre typen på `byte_size`, og bøtta `assets` ble satt til 2 GB). **Neste:** `0006_byte_size_big.sql`. Ferdig utfylt melding:

> Kjør SQL-filen `db/migrations/0006_byte_size_big.sql` mot databasen nøyaktig slik den står i repoet, som én databaseendring. Ikke endre, del opp, oversett eller omskriv SQL-en, og ikke legg til eller fjern kolonner. Filen `db/migrations/0005_note_edits_large_files.sql` er oppdatert så den viser nøyaktig det du kjørte i forrige runde; den skal ikke kjøres på nytt. Ikke endre filer i `docs/`, `.claude/`, `scripts/`, `db/`, `src/` eller `tests/`. Når alt er gjort, kjør `select version, description from public.schema_version order by version` og `select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'asset_versions' and column_name like 'byte_size%'`, og svar med resultatene og eventuelle feilmeldinger ordrett. Hvis noe ikke lar seg kjøre som det står: stopp og svar med feilmeldingen ordrett i stedet for å finne en annen løsning.

4. Lim Lovables svar inn til Claude hvis noe feilet.

## C. API-nøkler
Når AI-funksjoner kommer (fase 5), forteller Claude nøyaktig hvilket navn nøkkelen skal ha. Du legger den inn i Lovable: prosjekt → **Cloud → Secrets** (eller der Lovable ber om den). Nøkler skal aldri limes inn i chatten med Claude, i filer eller i e-post.

## D. Hvis noe går galt
- **Lovable viser «GitHub ahead»:** gjør en ny liten endring/commit og push igjen.
- **Konflikt (`lovable-sync`-gren dukker opp):** ikke gjør noe i Lovable; si fra til Claude.
- **Aldri** slett repoet eller koble GitHub fra og til igjen i Lovable – da lages et nytt repo.
