# G-9 Eksempelprosjekt på flere språk – rapport

## Hva er laget
- **Originalt eksempelmanus** «The Paper Kite» / «紙のたこ» / «La cometa de papel» / «Papirdragen»
  (`src/core/demo/story.ts`). Skrevet fra bunnen for dette formålet, rettighetsfritt. Fem scener, to karakterer
  (Mira, ti år, og naboen Otto, pensjonert sykkelmekaniker), ca. 2 min 35 s. En enkel, varm historie om å
  reparere en papirdrage sammen, uten kulturelle stereotyper. Det private manuset brukes ikke og finnes ikke i repoet.
- **Fire språkversjoner**: engelsk (kilde), japansk, spansk og norsk bokmål. Det valgte språket blir prosjektets
  kildespråk; de tre andre blir språkversjoner (`AddLanguageVersion`) med godkjente oversettelser av hver
  linje og hver sceneoverskrift.
- **Ressurser**: to karakterer og tre steder med beskrivelser og navn på de andre språkene.
- **Bilder laget i koden**: hver scene får en enkel montering med bakgrunnsfarge, en vektorflate for bakken og
  stedet og karakterene som plassholderlag. Scene 1 har ett animert lag, dragen, med en bevegelsesbane over
  hele scenen. Ingen KI-kall og ingen betalte kall.
- **«Åpne eksempelprosjektet»** vises på prosjektsiden når brukeren ikke har noen prosjekter ennå, altså første
  gang. Prosjektet lages på grensesnittspråket når eksempelet finnes på det (en, ja, es, nb; «no» → nb), ellers på
  engelsk. Det er et vanlig prosjekt som brukeren eier og kan slette fritt.

## Begrunnede valg
- **Kommandoliste, ikke migrasjonsrader**: `planDemoProject` (ren kjernefunksjon) lager de vanlige kommandoene
  (`ImportScreenplay`, `CreateAssets`, `AddLanguageVersion`, `AddTranslations`, `CreateComposition`, `AddLayers`).
  Nettleseren lager prosjektet med `create_project` og sender kommandoene én etter én via `runCommand → apply_changes`.
  Alt går dermed gjennom samme validering, kvoter, hastighetsgrenser og endringslogg som vanlig arbeid, og alt
  kan angres. Ingen databaseendring trengs.
- **Plassholdere i stedet for bildefiler**: kjernen tillater former bare på fargeflater, så sted og karakterer er
  ressurslag uten bilde (vises som plassholder), mens bakke og drage er vektorformer. Brukeren kan senere legge
  inn egne bilder på ressursene.
- **Manusinnholdet er brukerinnhold**, ikke grensesnittekst, og er derfor merket `i18n-ignore-file`.
  De tre nye knappe-/feiltekstene (`g9-demo.*`) finnes på alle registrerte språk.

## Tester
- Full Vitest: 2849 bestått, 0 feilet etter rettingen, 10 hoppet over. Typekontroll 0 feil, i18n-sjekk grønn.
- `tests/architecture/g1b-no-hardcoded-norwegian.test.ts`: to begrunnede unntak for eksempelprosjektets språkliste.
- `tests/unit/g9-demo-project.test.ts`: språkvalg (grensesnittspråk/reserve engelsk) og oppretting for ny
  bruker på alle fire språk: alle kommandoene godtas av kjernen, kildespråket blir riktig, manusvisningen
  bygges, og vi får 5 scener, 2 karakterer, 3 steder, 3 språkversjoner, alle oversettelser, 5 monteringer og
  ett lag med bevegelsesbane.

## Ikke verifisert
- Flyten er ikke kjørt ende til ende mot Cloud, fordi forhåndsvisningen ikke var innlogget og testen ville laget et
  prosjekt i en ekte brukers konto. Serverveien er den samme som for vanlige kommandoer.

## Maskinoversatte tekster (til gjennomlesing)
`g9-demo.open`, `g9-demo.opening`, `g9-demo.failed` på fr, es, ru, ja, pt-BR, de, it og ko.
Eksempelmanusets japanske og spanske versjon bør også leses av en morsmålsbruker.
