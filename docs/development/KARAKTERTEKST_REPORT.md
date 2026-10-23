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

## C. «Skriv med AI» bygger alltid på faktaarket (Øystein 23.10, tillegg)

**Funn som stemte:**
- `writeImagePrompt(task: "prompt")` sendte bare teksten i feltet og bildene.
- Den automatiske teksten brukte faktaarket bare når teksten ikke var redigert.
- Studien (faktaarket) ble bare laget når brukeren trykket selv.

**Ny oppførsel:**
1. **Studien lages først når faktaarket mangler.** Serveren sjekker selv om ressursen har et faktaark når «Skriv med AI» / «Skriv på nytt med AI» kjøres (figur, rekvisitt, sted og så videre).
   - Den samme studien som i VisualBriefEditor lages da på serveren. Grunnlaget er manusutdrag fra hovedproduksjonen (opptil 10, med replikker), beskrivelsen, gjeldende versjon og omslagsbildet.
   - Felles kjernefunksjon: `factSheetStudy`, som editoren nå også bruker.
2. **Studien lagres med en gang** som faktaark, via `SetAssetVisualBrief` med `autoAt` og apply_changes.
   - Lagringen er en vanlig kommando som kan angres, og den vises for alle med sanntidsoppdateringen.
   - Klienten legger steget på angrelisten med `adoptServerHistory`.
   - Karakterkortet i biblioteket viser «Laget automatisk fra manuset» med dato.
   - Retter brukeren arket, forsvinner merket. Angring setter tilbake både tekst og merke.
3. **Faktaarket er alltid med.** Serveren legger det inn som egen seksjon «VISUAL FACT SHEET (authoritative for appearance …)» i kallet til prompt-skriveren, uansett hva som står i feltet. Brukerens tekst kommer etter.
   - Bildegenereringen gjør det samme: står fakta ikke allerede i teksten, legges arket til på serveren.
   - Blir det for langt, kortes brukerens tekst, aldri faktaarket.
   - Oppskalering er unntatt, fordi den ikke bruker tekst.
4. **Kostnad.** Under knappen står nå at studien kjøres først når faktaarket mangler: ett ekstra tekstkall, også langt rimeligere enn et bilde. Ett trykk godkjenner begge kallene.
   - Finnes arket, står det at faktaarket alltid brukes.
   - Ingen andre automatiske kall.
   - Tekstkall har ingen egen kronepris i appen i dag (de står som «litt kreditter»). Derfor viser linjen ikke et tall.
5. **Feil.** Feiler studien eller lagringen, skrives ingen tekst. Brukeren får en tydelig melding med knappen «Prøv igjen».
6. **Sporbarhet.** Studien får egen rad i `generation_jobs` (systemInstruction «visual-brief»).
   - Prompt-jobben har `params.factSheet = { assetRevision, digest (SHA-256), studyJobId }`.
   - Serverloggene viser bare feilkoder, aldri prompter.
7. **Tekstversjoner.** Teksten «Skriv med AI» lager, blir en ny tekstversjon, som før (`saveBrief` etter skrivingen).

**Arkitektur:**
- Lagringen ligger i `src/adapters/storage/fact-sheet.server.ts`, ikke i `ai/`. Testen for REQ-0326 forbyr AI-koden å skrive prosjektdata direkte. Lagringen følger samme mønster som dialogbatchen.
- AGENTS.md har fått regel 61.

**Migrasjon 0089 er utvidet** (den er ennå ikke kjørt i Cloud, så den kunne utvides uten ny fil). Endringen legger til én kolonne, ingen funksjoner er nye eller erstattet, og EXPECTED_SCHEMA_VERSION er fortsatt 89:
- `assets.visual_brief_auto_at timestamptz`, null betyr skrevet eller rettet av brukeren.

**Tester (falsk tekstmodell, ingen betalte kall):** `tests/unit/faktaark-alltid.test.ts` (9).
- Faktaarket mangler: studien kjøres først og lagres på ressursen. Deretter kjøres prompten med faktaarket. Egen studiejobb og referanse til arkets versjon er sjekket.
- Faktaarket finnes: ingen ny studie, og arket er med også når feltet er redigert.
- Studien feiler, eller lagringen feiler: ingen prompt, og brukeren får «Prøv igjen».
- Kostnadslinjen viser begge kallene.
- Arket legges til, men aldri to ganger, og det kortes aldri.
- Merket og angring av det.

**Andre endringer i testene:**
- `verifisering4-ai-server.test.ts` gir figuren et faktaark og forventer at serveren legger arket til i bildeteksten, slik den nye regelen sier.
- DB-testen for 0089 sjekker også merket og at det forsvinner ved redigering: 181/0.

**Ikke kjørt:** Den visuelle sjekken på nb og en (at faktaarket vises på karakterkortet etterpå) krever at 0089 er kjørt i Cloud. Den står i TODO.md.

**Nye tekster:** `factSheet.auto.label`, `.cost.study`, `.cost.ready`, `.error.study`, `.error.save`, `.retry`, `.history`. Jeg skrev nb og en selv. de, es, fr, it, ja, ko, pt-BR og ru er maskinoversatt og merket for gjennomlesing.
