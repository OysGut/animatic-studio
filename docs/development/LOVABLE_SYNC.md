# Oppsett og synk med Lovable og GitHub

For Mars. Ingen kommandolinje trengs. Bakgrunn: DEC-0005, ADR-0002.

## A. Engangsoppsett (ca. 15 minutter)

1. **Lovable:** Logg inn på lovable.dev → nytt prosjekt med navnet **Animatic Studio**. Skriv bare: «Opprett et tomt prosjekt. Ikke bygg noe ennå.»
2. **Backend:** Hvis Lovable spør om backend, velg **Lovable Cloud** (DEC-0008). Velg EU-region hvis du får spørsmål om region – den kan ikke endres senere.
3. **GitHub:** I Lovable: prosjektinnstillinger → **GitHub** → koble til (lag GitHub-konto om du ikke har). Lovable lager repoet `animatic-studio` (privat).
4. **GitHub Desktop:** Installer fra desktop.github.com og logg inn med samme GitHub-konto.
5. **Hent repoet:** GitHub Desktop → *File → Clone repository* → velg `animatic-studio` → *Local path*: `Claude/Projects/Animatic Studio` (mappen som allerede er koblet til Claude). Resultatet blir `Claude/Projects/Animatic Studio/animatic-studio`.
6. Si fra til Claude. Claude flytter da grunnlaget (`docs/`, `.claude/`, `scripts/`, `CLAUDE.md`, `AGENTS.md`) inn i repoet og bygger videre der.

## B. Etter hver leveranse fra Claude

1. Åpne GitHub Desktop. Du ser endrede filer og en ferdig commit-melding som Claude har lagt i `docs/development/NEXT_COMMIT_MESSAGE.txt` – lim den inn i «Summary».
2. Trykk **Commit to main** og deretter **Push origin**.
3. Gå til Lovable-prosjektet. Endringene kommer inn automatisk etter litt. Hvis leveransen inneholder databaseendringer eller backend-funksjoner, lim inn denne meldingen i Lovable-chatten (Build-modus):

> Kjør alle migrasjoner i `supabase/migrations/` som ikke er kjørt ennå, i filnavnrekkefølge, uten å endre innholdet i dem. Deploy deretter alle backend-funksjoner i repoet uten å endre koden. Ikke endre filer i `docs/`, `.claude/`, `scripts/`, `src/core/` eller `tests/`. Svar med en liste over hvilke migrasjoner og funksjoner som ble kjørt/deployet, og eventuelle feilmeldinger ordrett.

4. Lim Lovables svar inn til Claude hvis noe feilet.

## C. API-nøkler
Når AI-funksjoner kommer (fase 5), forteller Claude nøyaktig hvilket navn nøkkelen skal ha. Du legger den inn i Lovable: prosjekt → **Cloud → Secrets** (eller der Lovable ber om den). Nøkler skal aldri limes inn i chatten med Claude, i filer eller i e-post.

## D. Hvis noe går galt
- **Lovable viser «GitHub ahead»:** gjør en ny liten endring/commit og push igjen.
- **Konflikt (`lovable-sync`-gren dukker opp):** ikke gjør noe i Lovable; si fra til Claude.
- **Aldri** slett repoet eller koble GitHub fra og til igjen i Lovable – da lages et nytt repo.
