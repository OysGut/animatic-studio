# Fast ID-merke i alle vinduer (Øystein 23.10.2026)

Ingen migrasjon, ingen betalte kall, ikke publisert.

## Merket
- Nederst i hvert vindu: «V-nnn · abcdef1» (vinduets faste nummer · byggets commit, 7 tegn; «dev» uten commit).
- Liten monospace-skrift, `text-text-tertiary`, 50 % opasitet, `pointer-events: none`, `user-select: none`, `aria-hidden`. Påvirker ikke layout (absolutt plassert i vinduer, fast nede til venstre på sider).
- Alt + klikk på merket kopierer koden. Klikket fanges i rotsiden, slik at merket ellers slipper alle klikk gjennom til knappene under.
- **Avvik fra oppdraget:** 10 px strider mot REQ-0425 (DEC-0074, «ingen tekst under 11 px», testen `design-text-size`). Merket bruker derfor 11 px. Si fra hvis 10 px skal gjelde. Da må REQ-0425 få et unntak.

## Hvor
- Innebygd i felles `DialogContent` (og dermed `ResizableDialogContent`), `AlertDialogContent`, `SheetContent` og `PopoverContent` via `uiId`-egenskapen.
- Sider: rotsiden viser nummeret for den dypeste ruten som står i registeret (`RouteUiId`). Det gjelder alle 22 sider, også innloggingen, mobil- og QR-sidene, utstillingsvinduet, konto og admin.
- Egne vinduer med `<UiId id=…/>`: Manusutforskeren og brikkemenyen, Asset Studio, bildeviseren, forhåndsvisningsvinduet, eksportkøen, AI-menyen i manus, notatboksen i manus, kvalitetsprofil-dialogen, 404-siden og feilsiden, og alle små innebygde bekreftelsesbokser (`role="alertdialog"`).
- Totalt 162 aktive ID-er.

## Register
- `src/app/ui-ids.ts`: id, type, komponent, fil, beskrivelse på norsk (side-/dialogtittel fra språkfilen) og status.
- `node scripts/ui-ids/ui-ids.mjs --assign` gir nye vinduer neste ledige nummer og skriver det inn i koden. Den markerer også vinduer som er borte som «fjernet» og skriver `docs/development/UI_IDS.md`. Numre gjenbrukes aldri.
- Beskrivelsene er generert automatisk og kan forbedres for hånd i registeret.

## Versjon
- `VITE_BUILD_SHA` og `VITE_BUILD_TIME` settes ved byggetid i `vite.config.ts`: miljøvariabel først, ellers `git rev-parse HEAD`, ellers «dev».
- Full versjon vises nederst på Konto og på adminsiden («Versjon … · bygget …», alle språk; de/es/fr/it/ja/ko/pt-BR/ru maskinoversatt).

## Tester
- `tests/architecture/ui-ids.test.ts` (7) feiler hvis:
  - en dialog, popup, sheet eller side mangler ID
  - to vinduer deler ID
  - en ID mangler i registeret eller har feil fil
  - en rute mangler
  - et eget `role="dialog"`-vindu mangler merke
  - oversikten er utdatert
- `tests/unit/ui-id.test.tsx` (4): tekst, aria-hidden, select-none, ukjent ID, Alt + klikk-kopiering og merket i felles DialogContent.
- Visuelt: innloggingssiden og 404 på nb og en, på skjerm og mobil (390 px). Merket ligger nede til venstre, og innloggingsboksen er uendret. Skjermbildene ligger i Filer under vindu-id/. Innloggede vinduer er ikke fotografert, fordi forhåndsvisningen ikke har en konto å logge inn med.
- tsc 0. Hele Vitest grønn. i18n grønn.
