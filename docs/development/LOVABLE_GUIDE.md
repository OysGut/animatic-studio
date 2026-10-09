# Oppsett og synk med Lovable og GitHub – veiledning

For Mars. Ingen kommandolinje trengs. Bakgrunn: DEC-0005, ADR-0002, DEC-0033.

**Selve meldingen til Lovable ligger alltid ferdig i `docs/development/LOVABLE_SYNC.md`.** Den filen inneholder bare meldingen: kopier alt i den og lim det inn i Lovable-chatten. Claude fornyer den ved hver leveranse.

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
3. Gå til Lovable-prosjektet. Kodeendringene kommer inn automatisk etter litt. **Databaseendringer kommer ikke automatisk** (Lovable kjører ikke databasefiler fra GitHub). Åpne `docs/development/LOVABLE_SYNC.md`, kopier **alt** som står der og lim det inn i Lovable-chatten. Filen er alltid oppdatert for siste leveranse (også når det ikke er noen databaseendring – da ber den bare Lovable bekrefte at alt er i orden).

   Appen viser et oransje varsel øverst så lenge databasen mangler en migrasjon. Når varselet er borte, er alt på plass.

   **Kjørte migrasjoner:** `0001_core.sql` (2026-10-08), `0002_import_profiles.sql` (2026-10-09; bøtta laget med Lovables lagringsverktøy fordi SQL mot `storage.buckets` ikke er tillatt), `0003_script_versions.sql` (2026-10-09), `0004_library_notes.sql` (2026-10-09; bøtta `assets` laget med lagringsverktøyet), `0005_note_edits_large_files.sql` (2026-10-09; Lovable la til kolonnen `byte_size_big` i stedet for å endre typen på `byte_size`, og bøtta `assets` ble satt til 2 GB), `0006_byte_size_big.sql` (2026-10-09, uten avvik).

4. Lim Lovables svar inn til Claude hvis noe feilet.

## C. API-nøkler
Når AI-funksjoner kommer (fase 5), forteller Claude nøyaktig hvilket navn nøkkelen skal ha. Du legger den inn i Lovable: prosjekt → **Cloud → Secrets** (eller der Lovable ber om den). Nøkler skal aldri limes inn i chatten med Claude, i filer eller i e-post.

## D. Hvis noe går galt
- **Lovable viser «GitHub ahead»:** gjør en ny liten endring/commit og push igjen.
- **Konflikt (`lovable-sync`-gren dukker opp):** ikke gjør noe i Lovable; si fra til Claude.
- **Aldri** slett repoet eller koble GitHub fra og til igjen i Lovable – da lages et nytt repo.
