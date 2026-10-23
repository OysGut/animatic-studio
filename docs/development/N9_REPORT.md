# N9 – teknisk gjeld (23.10.2026)

Ingen migrasjon (versjon fortsatt 88), ingen betalte AI- eller ElevenLabs-kall, ikke publisert. Ingen nye tekster i grensesnittet.

## 1. en-XA-overløp
- Sceneeditorens verktøyrad hadde 0 px overløp på en-XA, nb og en (allerede rettet i ML2d). Ny kontroll i `tests/visual/ml2-languages.mjs` sjekker at ingen knapp i verktøyrader/topp stikker ut eller klippes, og at ingen `nav` har skjult overløp.
- Kontrollen fant at **fanelinjen øverst** (arbeidsflatene) var 364 px for bred på en-XA: de siste fanene og «slå sammen»-knappen lå utenfor og måtte rulles fram.
- Retting (`src/app/shell/ProjectNav.tsx`): får ikke etikettene plass, viser fanelinjen bare ikoner med verktøytips og skjermlesertekst (samme visning som brukerens eget sammenslåtte valg). Den går tilbake til etiketter når det blir plass eller språket byttes. Brukerens lagrede valg endres ikke.
- nb og en er uendret ved 1280 px (kontrollert: «fanelinjen viser etiketter»). ml2-languages: 323 bestått, 0 feilet. Skjermbilde en-XA kontrollert.

## 2. DV5 (KI-22)
- Før: massegenereringspanelet hentet ferdige resultater bare mens det var åpent. Ble et resultat ferdig etter at panelet var lukket, kom det aldri på angrelisten.
- Nå: panelet noterer jobbene brukeren har sett i arbeid eller startet. Neste gang en arbeidsflate med angreliste åpnes i samme fane og økt, hentes ferdige resultater for disse jobbene (bare oppslag, ingen nye betalte kall) og legges på angrelisten. Samme resultat legges aldri inn to ganger.
- Dokumentert: angrelisten ligger i minnet. Ved omlasting forsvinner den, som for alle andre angresteg (KI-22, angring fra historikken hører til KI-27).
- Test: `tests/unit/n9-background-catchup.test.tsx` (2 tester).

## 3. ZIP64 (KI-66, KI-80)
- Skriving og lesing støttet allerede ZIP64 (PTG1), men nedlastingen av ressurser og sikkerhetskopi stoppet ved 3,8 GB. Grensen er hevet til 256 GB som sikkerhetsmargin. Uten lagringsvindu gjelder fortsatt minnegrensen på 1,5 GB.
- Test `tests/unit/n9-zip64-large.test.ts`: en fil på 4 GB + 64 MB strømmes som nullbytes (én delt buffer), leses tilbake gjennom en virtuell fil uten 4 GB i minne eller på disk; størrelse og offset over 4 GB stemmer. 70 000 filer skrives og leses; vanlig sluttpost har 0xffff og antallet ligger i ZIP64-posten.

## 4. KI-243 (MP3-koder)
- Produksjonsbygget kontrollert: `registerMp3Encoder` og koderens WASM ligger bare i `dist/client` (`mediabunny-mp3-encoder-*.js`). Serverdelen nevner bare filnavnet i listen over statiske klientfiler.
- Test `tests/architecture/n9-mp3-client-only.test.ts`: bare `src/engine/audio/composition.ts` laster pakken, dynamisk inne i `createClientOnlyFn`; finnes et bygg, feiler testen hvis koden eller WASM-modulen ligger i `dist/server`. KI-243 lukket.

## 5. Øvrige KI-er
- **KI-250** (screens.mjs stopper ved skudd 33): skriptet ble avviklet i R5 og dekkes av andre suiter. Lukket.
- **KI-12** (runCommand laster hele prosjektet): delvis lasting er en større endring i skrivebanen. Ikke gjort; står som teknisk gjeld.
- **KI-30** (ubrukte opplastinger slettes aldri): oppryddingen finnes for AI-filer. Å slette alle ubrukte opplastinger automatisk er sletting av brukerens filer, og krever Øystein. Alternativer: (a) som i dag, (b) samme bekreftede opprydding som for AI-filer også for opplastinger, (c) automatisk sletting etter en frist.
- **KI-92** (frilegging i hovedtråden): flytting til Web Worker ikke gjort i N9; lav prioritet.

## Tester
tsc 0 · Vitest 2477 bestått / 10 hoppet over / 0 feilet · DB 180/0 · ml2-languages 323/0 · check_kb OK · språkinventar regenerert.

## Endrede filer
- src/app/shell/ProjectNav.tsx
- src/app/project/use-commands.ts
- src/app/library/background-history.ts
- src/app/library/DialogueBatchPanel.tsx
- src/app/library/AssetZip.tsx
- tests/visual/ml2-languages.mjs
- tests/unit/n9-background-catchup.test.tsx (ny)
- tests/unit/n9-zip64-large.test.ts (ny)
- tests/architecture/n9-mp3-client-only.test.ts (ny)
- scripts/i18n/ (inventar regenerert)
- TODO.md, roadmap.md, docs/development/KNOWN_ISSUES.md, docs/development/N9_REPORT.md (ny)
