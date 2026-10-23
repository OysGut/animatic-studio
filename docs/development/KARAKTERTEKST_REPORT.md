# Karaktertekst og synlige resultater (Øystein 23.10)

Ikke publisert. Ingen betalte kall. **Ny migrasjon 0089** (additiv), `EXPECTED_SCHEMA_VERSION` = 89. Claude må kjøre den i Cloud før appen kan brukes.

## A. Beskrivelsen i karakterdialogen forsvant

**Årsak:** Beskrivelsesfeltet i «Generer et nytt bilde med AI» (karakterdialogen i sceneeditoren) lå bare i minnet. Når dialogen ble lukket, forsvant teksten. Ved neste åpning ble feltet fylt med den automatiske teksten, eller med teksten fra siste generering hvis det fantes en jobb. Tekst som var skrevet eller laget med AI uten at noe bilde ble generert, gikk derfor tapt.

**Retting:**
- Ny kommando `SetAssetBriefVersions` (hele listen pluss aktiv versjon, inversen er forrige liste, ett angresteg). `SetAssetVisualBrief` passet ikke: den har bare én tekst (det engelske faktaarket), og den overskriver.
- Ren regel i `src/core/assets/brief-versions.ts`:
  - `planBriefSave`: uendret tekst gir ingenting; samme tekst som en eldre versjon gjør den aktiv; ellers lages en ny versjon bakerst. En eldre versjon overskrives aldri.
  - `shownBriefVersion`: dialogen åpner med den sist brukte eller sist redigerte versjonen.
  - `briefHighlight`: avgjør hvilke bilder som lyser opp.
  - Grenser: 50 versjoner, 8000 tegn hver.
- Teksten lagres når feltet mister fokus, når AI har skrevet teksten, rett før generering, og når dialogen lukkes med endret tekst.
- Over tekstfeltet til høyre: ‹ 3/5 › for å bla mellom versjonene. Knappene er vanlige knapper (tastatur og berøring), og telleren har skjermlesertekst.
- Hver generert bildeversjon får `briefVersionId`, en referanse til tekstversjonen. Bare brukerens beskrivelse lagres, aldri serverprompten. Ingenting logges.
- Fremheving: når en tekstversjon står i feltet, får bildene laget fra den en ramme med glød i aksentfargen. De andre dempes (opasitet 60 %). Er ingen bilder laget fra teksten, eller er teksten endret, vises ingenting spesielt. Eldre bilder uten referanse lyser aldri opp.

**Migrasjon 0089** (`db/migrations/0089_brief_versions.sql`), bare nye kolonner:
- `assets.brief_versions` jsonb, standard `[]`. Sjekker: liste, høyst 50, høyst 2 MB.
- `assets.active_brief_id` text.
- `asset_versions.brief_version_id` text. Settes bare ved innsetting, så `protect_asset_version` holder bildet uforanderlig.

Ingen funksjoner erstattes. `apply_changes` tar med nye kolonner automatisk. Serveren avviser de nye kommandoene før databasen er på versjon 89 (`needsSchema89`). Sikkerhetskopien behandler de to nye ID-feltene som lokale ID-er (`NON_REFERENCE`).

## B. Resultater havnet utenfor skjermen

**Reprodusert fra lenkens flyt** (ved å lese koden; preview krever 0089):
1. Varselet «Frilegg bildet – Ferdig» i AI-panelet lenker til `/prosjekt/<id>/bibliotek?asset=<id>`, uten noen versjon.
2. Biblioteket åpner ressursen. Versjonene vises i en vannrett stripe (`overflow-x-auto`) med 148 px brede kort, nyeste bakerst.
3. Frilagt bilde blir en ny versjon bakerst i stripen. Med noen få versjoner ligger den utenfor kanten til høyre, uten pil, teller eller tone som viser at det finnes mer. Brukeren ser den ikke.

**Retting:**
- Versjonsstripen i biblioteket bryter nå linjen (`flex-wrap`), så alle versjoner synes og kan nås med mus, tastatur og berøring.
- Lenken tar med versjonen: `?asset=<id>&version=<id>`, hentet fra jobbens resultat. Biblioteket ruller versjonen inn i synet og markerer den med en ring i aksentfargen i 2 sekunder. Ligger den i en arkivert variant, vises arkiverte varianter.
- Felles `useRevealNew` (`src/app/shared/reveal.ts`): nye versjoner som dukker opp i en variant (frilegging, generering, oppskalering, vinkler, opplasting), rulles også inn i synet og markeres.
- **Sceneeditoren:** versjonene i karakterdialogen ligger allerede i et rutenett som bryter linjen. **Asset Studio:** ingen vannrette versjonsstriper ble funnet. **Lerretet:** nye lag legges i bildets midtpunkt. Er visningen zoomet eller flyttet bort fra midten, kan laget havne utenfor det synlige området. Visningen ligger inne i lerretet og er ikke tilgjengelig for dialogen. Dette står som åpent punkt i TODO.md.

## Tester
- `tests/unit/karaktertekst.test.ts` (11):
  - lagring og visning ved åpning
  - ny versjon ved redigering av eldre
  - aktivering uten duplikat
  - angring
  - ugyldige lister
  - bildets referanse gjennom angre/gjør om og lagring/lesing
  - fremheving: treff, demping, ingen treff, eldre bilder
  - plan for synlige resultater
- `tests/unit/reveal-new.test.tsx` (3, jsdom): en ny versjon rulles inn i synet og markeres; versjonen fra lenken rulles inn ved åpning; stripen bryter linjen.
- DB: ny test «0089 …», 181/0 med 0089.
- Vitest grønn, tsc 0, språkkontrollen grønn.
- **Visuell sjekk på nb og en er ikke kjørt.** Preview krever 0089 i Cloud (appen forventer versjon 89).

## Nye tekster
`brief.versions.previous`, `.next`, `.counter`, `.save`, `.fromText`. Jeg skrev nb og en selv. de, es, fr, it, ja, ko, pt-BR og ru er maskinoversatt og merket for gjennomlesing. en-XA er generert.
