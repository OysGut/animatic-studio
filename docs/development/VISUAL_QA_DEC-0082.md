# Visuell kontroll – DEC-0081 og DEC-0082 (norsk/engelsk og prosjektlisten)

Dato: 2026-10-14. Skript: `tests/visual/i18n-en-pass.mjs` (mocker Supabase og serverfunksjonene; ingenting betales).
Kjøres som de andre: kopier til Playwright-mappen og kjør
`ENV_FILE=…/.env node i18n-en-pass.mjs http://127.0.0.1:8080 /tmp/claude-0/visual-fixture.json utmappe` (fixture fra `bun tests/visual/make-fixture.ts`).

## Hva skriptet gjør
- Åpner prosjektlisten på norsk og engelsk med to prosjekter: ett Mars eier (hovedfilm, trailer, teaser under traileren, spinoff) og ett Anita Killi eier der Mars er redaktør.
- Åpner prosjektoversikten, manus, sceneeditor, montering, ressursbibliotek og utgivelse på engelsk.
- Leser all synlig tekst, verktøytips (title), skjermlesertekster (aria-label) og plassholdere, og lister det som ser norsk ut.

## Resultat
- Prosjektlisten: boks per prosjekt med «Owner: you» / «Owner: Anita Killi», «You own this project» / «You are an editor», medlemmer og dato; varianter rykket inn under den de er laget fra, med type, dato og notat. Språkvalget står ved knappene øverst.
- Engelsk gjennomgang: alt som ble funnet på norsk, er brukerinnhold (prosjektnavn, manus, scenenavn, notater, lydnavn) – ingen tekst fra tjenesten.
- De eksisterende nettlesersuitene er fortsatt grønne på norsk: `verifisering3-ui.mjs` 73/73, `verifisering4-ui.mjs` 58/58, `interactions-e2e.mjs` 44/44, `funn-0079-ui.mjs` og `funn-0080-ui.mjs` uten feil.

## Andre kontroller
- `tests/unit/i18n.test.ts`: språkvalg, tekstpar, faste oppslag, meldinger fra serveren, og at `scripts/i18n/check.mjs` finner 0 tekster uten engelsk i `src/`.
- Ordbokssjekk mot en engelsk ordliste over alle strenger i `src/` etter agentenes oversettelse (fant ca. 190 kandidater som kontrollen ikke så; rettet, og ordene lagt inn i kontrollens ordliste).
- `tests/db/run-db-tests.ts`: 0031 notat på produksjonen (lagres, leses tilbake, tømmes; over 2000 tegn avvises av databasen). 59/59.
