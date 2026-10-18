# Plan – T2: AI-skrivehjelp i manuset

Skillene animatic-ai-tekst, animatic-story-lab, animatic-arkitektur-og-data, animatic-testing, animatic-i18n og animatic-ui-designsystem gjelder. T2 bygger på T1 (`generateText`, oppgavegruppen «Manus», kostnadsbekreftelse og reserve). Det kommer ingen ny AI-vei og ingen ny manusmotor.

## Arbeidspakker
- **T2.1 Grunnmur:** kjernens promptbyggere, diffen, forslagsmodellen, serverfunksjonen og skrivepanelet med diff.
- **T2.2 Omskriving** av markert tekst.
- **T2.3 Neste replikk / fortsett scenen** (Story Lab-kunnskap).
- **T2.4 Scene fra beskrivelse eller fra en canvasnode.**
- **T2.5 Språkvask og formatsjekk** (formatsjekken er regelbasert og gratis).
- **T2.6 Oversettelsesutkast** (engelsk, merkes som usikkert).
- **T2.7 Tester** (unit, snapshot og `tests/visual/t2-writing-ui.mjs`).

## 1. Plassering i manuseditoren (ScriptWorkspace)
- **Kontekstmeny** på en markert blokk eller flere blokker (ScriptPageView): «Skriv om …» med en undermeny (Kortere, Tydeligere, Mer muntlig, Annen tone …, Fritt ønske …), «Språkvask», «Oversettelsesutkast».
- **Inspektøren** (Inspector) får knappen «Skrivehjelp» for den valgte blokken.
- **Sidepanelet «Skrivehjelp»** er en ny fane ved siden av Notater og Oversettelse. Der finner du:
  - Neste replikk: velg karakter og eventuelt et ønske;
  - Fortsett scenen;
  - Ny scene fra beskrivelse;
  - Ny scene fra Story Lab-node: velg node;
  - Formatsjekk: kjør gratis;
  - Språkvask: scene eller valgte blokker;
  - Oversettelsesutkast: blokkene som mangler engelsk.
- Forslaget med diff vises i panelet.
- **Hurtigtaster:**
  - ⌘/Ctrl+Shift+R: Skriv om;
  - ⌘/Ctrl+Shift+J: Neste replikk;
  - ⌘/Ctrl+Shift+K: Formatsjekk.
  - Hurtigtastene virker ikke mens et tekstfelt har fokus, og de vises i verktøytipsene.
- Alt er skjult eller deaktivert for leseroller (`editable`). Samme panel kan senere gjenbrukes i SceneScriptDialog. Det er ikke med i denne runden.

## 2. Promptbyggere i kjernen (`src/core/script-assist/`, rene)
- `rewritePrompt({ blocks, neighbours, mode, instruction, language })`
- `nextLinePrompt({ state, occurrenceId, afterBlockId, characterAssetId, instruction })`. Den bruker `knowledgeAt(state, assetId, sceneId)` og `profileAt()` i fortellingstid. Andre karakterers hemmeligheter og senere hendelser kommer aldri med.
- `sceneDraftPrompt({ description | canvasNode, characters, location, storyTimeNeighbours })`. Kunnskapen gjelder per karakter på tidspunktet scenen settes inn.
- `polishPrompt({ blocks })`. Den gjelder bare språket, og formatet tas regelbasert.
- `translateDraftPrompt({ blocks, glossary: karakternavn/steder })`
- Felles regler:
  - Instruksen er på engelsk.
  - «Reply in Norwegian Bokmål» for hovedmanuset, eller på målspråket for oversettelse.
  - Svaret er strengt JSON, i formatet `{ blocks: [{ id?, type, text, character? }] }`.
  - Lengden kortes mot `maxPromptChars`.
  - Det sendes bare et utdrag: de valgte blokkene, ± N blokker rundt dem og sceneoverskriften.
- Parsere: `parseJsonLoose` og validering av svaret (blokktyper, lengder og bare kjente ID-er), som returnerer `null` ved uleselige svar.
- `formatCheck(state, occurrenceId)` er ren regelbasert sjekk og gratis. Den ser på:
  - karakternavn med store bokstaver;
  - parenteser alene og i riktig posisjon;
  - sceneoverskrift (INT/EXT, sted, tid);
  - tomme blokker, doble mellomrom og typografiske anførselstegn.
  - Resultatet blir forslag i samme diff-format.
- `wordDiff(a, b)` er en ren diff på ordnivå (LCS), med segmentene lik, fjernet og lagt til.

## 3. Serverfunksjon og kostnad
- Ny fil: `src/adapters/ai/script-assist.functions.ts` (`createServerFn`, innlogging og rollen redaktør eller eier).
  - Klienten sender **bare ID-er og valg**:
    - `projectId`, `kind`, `occurrenceId`, `blockIds`, `characterAssetId`, `canvasNodeId`, `mode`;
    - ønsket som fritekst (inntil 500 tegn);
    - provider/model fra T1-valget.
  - Serveren laster prosjekttilstanden, sjekker skjemaet, bygger prompten med kjernebyggerne og kaller den samme interne T1-kjøringen som `generateText` (leverandørvalg, nøkkeleier, reserve, 120 kall i timen og logging i `generation_jobs` uten promptinnhold).
  - Oppgaven er `script`, og gruppen «Manus» brukes.
  - Svaret har `{ ok, proposal, costUsd, provider, model, usedFallback, reason, keyOwner, baseRevisions }`.
- `estimateScriptAssist` er en ren funksjon i kjernen. Den regner tokener ut fra utdragets lengde og forventet svar, med prisen for den valgte modellen. Den vises i den vanlige bekreftelsen fra T1 (første kall i økten), og etter det vises en løpende sum (CostLines).
- Prompter, svar og nøkler logges aldri.

## 4. Forslagsmodellen
- **Forslagene finnes bare i minnet** (React-tilstand i skrivepanelet), så det trengs ingen ny tabell. Begrunnelsen er at forslagene er flyktige. Det som skal tas vare på, lagres som `trial_edit`-notat, og kostnaden logges allerede i `generation_jobs`.
- Et forslag består av `{ kind, occurrenceId, items: [{ blockId | null (ny), oldText, newText, type, baseRevision }], costUsd }`.
- **Bruk** og **Bruk delvis** (avkrysning per blokk) gir en plan i kjernen, `planApplyProposal(state, proposal, selected)`. Den gir en liste med vanlige kommandoer (`EditBlockText`, `InsertBlocks`, `CreateScene`, `AddTranslations`/`UpdateTranslations`), som kjøres som **én angregruppe** gjennom den vanlige kommandokjeden med revisjonssjekk.
- **Konflikt:** er blokkens revisjon eller tekst endret siden forslaget ble laget, merkes blokken «Endret av noen andre». Den kan ikke brukes før brukeren lager forslaget på nytt eller forkaster det. Ingenting skrives stille. Avviser serveren på grunn av revisjonen, vises den samme konflikten.
- **Lagre som forsøksvis redigering** lager ett `trial_edit`-notat per blokk, med original og forslag (den eksisterende notatkommandoen fra AS3).
- **Forkast** fjerner forslaget fra minnet.
- **Oversettelse:**
  - Utkastet lagres som `status: "uncertain"` i den eksisterende oversettelsesmodellen.
  - Det overskriver aldri en godkjent oversettelse.
  - Norsk endres aldri (REQ-0331).
  - Det vises bare for blokker som mangler oversettelse.

## 5. Diff-visningen
- Komponenten `ProposalDiff` viser gammel og ny tekst side om side per blokk, med markering på ordnivå. Fjernet tekst er gjennomstreket med en dempet farge, og tillagt tekst er markert med accent-token.
- Nye blokker vises med «Ny». Blokktypen og karakteren vises.
- Avkrysning per blokk og knappene «Bruk», «Bruk valgte», «Lagre som forsøksvis redigering» og «Forkast».
- Merknaden fra T1 vises ved bruk av reserven.
- Alle tekster bruker L(nb, en), og bare designtokens brukes.

## 6. Migrasjon
- **Det trengs ingen migrasjon 0053**, forutsatt at forslagene bare er i minnet og task `script` (som finnes fra før) brukes. Det bekreftes i åpent spørsmål 1.

## 7. Tester
- **Unit:**
  - snapshot av hver promptbygger;
  - parserne og validering av svarene;
  - `wordDiff`;
  - `formatCheck` (hver regel);
  - `estimateScriptAssist`;
  - `planApplyProposal`: Bruk, Bruk delvis, én angregruppe med angre og gjør om, konflikt ved endret revisjon, og at oversettelse blir uncertain og ikke overskriver en godkjent oversettelse.
- **Kunnskapsgrense (obligatorisk):** `nextLinePrompt` og `sceneDraftPrompt` for karakter A tar aldri med B sine hemmeligheter, fakta uten `knownBy` eller hendelser etter tidspunktet. Egne hemmeligheter merkes «hint only».
- **Arkitektur:** promptbyggerne ligger i `src/core`. Klienten sender aldri `system`/`messages` til script-assist.
- **Nettleser:** `tests/visual/t2-writing-ui.mjs` mocker `generateText`/script-assist med faste svar. Den sjekker:
  - Skriv om → diff → Bruk (en `EditBlockText` i én gruppe);
  - Bruk delvis;
  - Lagre som forsøksvis redigering (trial_edit);
  - Forkast (ingen kommando);
  - konflikt (blokken endres før Bruk);
  - neste replikk;
  - scene fra node;
  - formatsjekk uten AI-kall;
  - oversettelse som uncertain;
  - kostnadsbekreftelse;
  - engelsk visning.
  - Den bruker `eventually`, `data-testid` og `VISUAL_SCHEMA_VERSION` 52.
- **DB-tester:** ingen, siden det ikke er noen migrasjon.

## Risikoer
- AI-en kan svare med feil blokk-ID-er eller format. Det løses med streng validering, og ukjente ID-er gir nye blokker eller avvisning.
- Lange scener kan sprenge prompten. Det løses med et begrenset utdrag og en tydelig melding.
- Hemmeligheter kan lekke via scenetekst som allerede står i manuset. Bare manusteksten før tidspunktet sendes, og testen dekker det.
- Diff-visningen på ordnivå kan bli treg på store blokker. Grensen er 2000 tegn per blokk.

## Åpne spørsmål
1. **Oppgave:** bruke den eksisterende `script`-oppgaven for alle fem funksjonene (anbefalt, uten migrasjon), eller egne oppgaver (`script_rewrite` …)? Egne oppgaver kan kreve en check i `generation_jobs` og dermed 0053.
2. **Forslag i minnet:** er det greit at forslag som ikke er lagret, forsvinner når man lukker manuset, så lenge «Lagre som forsøksvis redigering» finnes?
3. **Ny scene:** settes den inn etter den valgte scenen? Skal en node som allerede er knyttet til en scene, gi en ny variant eller bli avvist?
4. **Hurtigtastene over:** godkjent, eller ønsker du andre?
5. **Oversettelsesutkast:** bare engelsk i denne runden, eller alle språkversjoner i prosjektet?

## Tekniske detaljer
- **Nye filer:**
  - `src/core/script-assist/{prompts,parse,diff,format-check,apply,estimate,index}.ts`
  - `src/adapters/ai/script-assist.functions.ts`
  - `src/app/script/assist/{WritingPanel,ProposalDiff,RewriteMenu}.tsx`
  - `tests/unit/t2-*.test.ts`
  - `tests/visual/t2-writing-ui.mjs`
- **Endres:**
  - `ScriptWorkspace.tsx` (fanen og hurtigtastene);
  - `ScriptPageView.tsx` (kontekstmenyen);
  - `Inspector.tsx` (knappen);
  - `src/core/index.ts` (eksport);
  - T1-kjøringen i `text.functions.ts` trekkes ut til en intern serverhjelper, slik at script-assist bruker samme leverandørvalg, kvote og logging uten at klienten sender prompten. Oppførselen ellers er uendret.
- Ingen nye npm-pakker.
