# Testscenarier (Gitt / Når / Så)

Konkrete scenarier som skal bli automatiserte tester. Hver har ID (TS-xx), berørte krav/invarianter og foreslått testfil. Scenariene beskriver *atferd*; de innfører ingen nye produktkrav.

## Testdata
- **Referansemanus** (DEC-0002): «JULA PÅ DOVRE» – norsk PDF fra Final Draft 11, 106 sider, **96 nummererte scener med hull i nummereringen opp til 109, og minst én unummerert scene**; engelsk DOCX med samme scenenumre.
- Hele manuset skal aldri inn i repoet (DEC-0004). For struktur- og nummereringstester brukes en **syntetisk fixture** i `tests/fixtures/screenplay/` som gjengir *nummermønsteret* (hvilke numre som finnes, hvor hull og unummererte scener er) med oppdiktet nøytral tekst. Den nøyaktige nummerlista hentes fra PDF-en ved første import og lagres i fixturen – den skal ikke gjettes. Korte utdrag kan brukes der formatgjenkjenning testes.
- Byggere i testene: `givenProduction()`, `givenScenes(n)`, `givenSpinoffOf(main)`, `givenTake(occurrence, {status})` – lages i `tests/helpers/` (navn er forslag).

---

## TS-01 Import av referansemanusets nummerering
- **Krav/INV:** REQ-0048, REQ-0055, REQ-0056, REQ-0060, REQ-0034, REQ-0035 · INV-02, INV-03 · `tests/import/reference-numbering.test.ts`
- **Gitt** den syntetiske fixturen med samme nummermønster som referansemanuset (96 nummererte scener, hull opp til 109, minst én unummerert scene, eventuell tekst før første sceneoverskrift)
- **Når** manuset importeres i en ny hovedproduksjon
- **Så** opprettes nøyaktig én `Scene` + `SceneOccurrence` per sceneoverskrift (96 + antall unummererte) – ingen scener «diktes opp» for hullene
- **Og** hver forekomst får `productionNumbering` lik originalnummeret; den unummererte får ikke et oppfunnet nummer
- **Og** alle scener har unike, permanente ID-er uavhengige av nummeret
- **Og** tekst før første sceneoverskrift er bevart og kan kobles til en scene (REQ-0060)
- **Og** forhåndsvisning av eksport med «bevar produksjonsnummerering» gir de samme numrene, mens «fortløpende» gir 1…N uten at noen ID endres (REQ-0081, REQ-0082, REQ-0085).

## TS-02 Ferdig scene omnummereres
- **Krav/INV:** REQ-0079, REQ-0085, REQ-0080–REQ-0084, REQ-0034 · INV-02, INV-03, INV-07 · `tests/invariants/inv02-numbering-not-identity.test.ts`
- **Gitt** scene med `productionNumbering` «42», en godkjent take som er aktiv, og `TimeLink`-er fra replikkene til taken
- **Når** brukeren eksporterer med fortløpende nummerering slik at scenen blir nr. 45, og senere lager en ny manusversjon
- **Så** er `sceneId`, `occurrenceId`, `activeTakeId`, takes og `TimeLink`-er uendret
- **Og** `ExportVersion.numberingTable` har `occurrenceId → 45`, mens `productionNumbering` fortsatt er «42»
- **Og** versjonssammenligning viser scenen som *omnummerert*, ikke ny + fjernet
- **Og** en ny scene satt inn mellom 42 og 43 får «42A» ved «bevar produksjonsnummerering»
- **Og** omnummereringen oppretter **ingen** `Discrepancy` og starter **ingen** `GenerationJob` – nummer er bare visningsdata.

## TS-03 Scene flyttes (manus og tidslinje)
- **Krav/INV:** REQ-0017, REQ-0018, REQ-0062, REQ-0107, REQ-0228 · INV-01, INV-03 · `tests/commands/move-occurrence.test.ts`
- **Gitt** scenene A, B, C, D aktive i hovedfilmen; B har aktiv take med dialoglyd og `TimeLink`-er
- **Når** B flyttes etter D i manusvisningen
- **Så** er rekkefølgen A, C, D, B både i aktivt manus og i monteringen (samme datakilde)
- **Og** B beholder ID, take, lyd, `TimeLink` (lokal tid) og nummer; absolutte tidskoder for C, D, B er beregnet på nytt
- **Og** klikk på en replikk i B flytter avspillingshodet til riktig sted på B's nye plass (REQ-0097)
- **Når** B deretter flyttes tilbake mellom A og C fra tidslinjen
- **Så** viser manuset A, B, C, D, og tilstanden er lik starttilstanden
- **Og** (DEC-0020 pkt. 6) B med `storyTime.kind = linear` får fortellingstid avledet av ny plass i hovedfilmen mens den står etter D; en flashback-scene som flyttes, beholder sitt manuelle anker.

## TS-04 Scene deaktiveres
- **Krav/INV:** REQ-0019, REQ-0020, REQ-0021, REQ-0064, REQ-0084 · INV-14, INV-01 · `tests/invariants/inv14-deactivate-not-delete.test.ts`
- **Gitt** scenene A, B, C; B har to takes og en kontinuitetshendelse
- **Når** B deaktiveres
- **Så** er B utelatt fra aktivt manus, avspilling, beregnet spilletid og eksport (med mindre eksportvalget inkluderer deaktiverte)
- **Og** ingen rader er slettet; takes, hendelse og `orderKey` finnes
- **Når** B gjenaktiveres
- **Så** står B igjen mellom A og C med identisk tilstand
- **Kontrast:** B skjult med et visningsfilter (f.eks. «bare scener med Maja») endrer *ikke* spilletid eller eksport.

## TS-05 Spinoff redigerer delt scene
- **Krav/INV:** REQ-0365, REQ-0366, REQ-0356, REQ-0031, REQ-0040, REQ-0374 · INV-04 · `tests/invariants/inv04-spinoff-isolation.test.ts`
- **Gitt** hovedfilmen bruker scene S med delt variant V0 og godkjent aktiv take; spinoff P bruker samme S med V0
- **Når** en replikk i S forkortes i spinoff P, S flyttes og en annen scene deaktiveres i P
- **Så** får P en ny variant V1 (`basedOnVariantId = V0`, `ownerProductionId = P`) med endringen; P's forekomst peker til V1
- **Og** hovedfilmens tekst, rekkefølge, aktive scener, take og avvik er uendret
- **Og** en ny redigering i P endrer V1 (ingen ny variant hver gang)
- **Og** ingen tilbakeføring skjer før brukeren velger `PromoteVariant` med eksplisitte deler; «behold alt uendret» gir null endring
- **Gitt i tillegg** (DEC-0020 pkt. 7) at P's forekomst av S peker på hovedfilmens ferdige take T (referanse, ingen kopi) med eget trim på P's forekomst
- **Så** beholder P pekeren til T etter redigeringen, og `Discrepancy` for T opprettes i P's kontekst – hovedfilmen får ingen avvik, og T og hovedfilmens trim er uendret.

## TS-06 Karakterens utseendeendring midt i en scene + flashback (testdata: «Maja»)
- **Krav/INV:** REQ-0150–REQ-0152, REQ-0161–REQ-0165, REQ-0167 · INV-09, INV-10, INV-03 · `tests/invariants/inv09-story-time-continuity.test.ts`, `tests/commands/create-segments.test.ts`
- **Gitt** karakteren Maja med tilstandene «langt hår» og «kort hår», og scenene X (hårklipp), Y (senere), F (flashback)
- **Og** en godkjent `ContinuityEvent` «klipper håret: langt → kort» forankret i en bestemt blokk *midt i* X
- **Og** F står etter Y i manus/visningsrekkefølge, men har `storyTime` (kind: flashback) tidligere enn X
- **Når** gjeldende utseende beregnes
- **Så** har Maja langt hår i F og i X før blokken, og kort hår i X etter blokken og i Y
- **Når** systemet foreslår segmentering av X ved hendelsen (`CreateSegments(reason: continuity_change)`) og brukeren godtar
- **Så** finnes to `ProductionSegment` i X med riktig karakterreferanse hver
- **Og** X har samme `sceneId`, samme nummer, uendret manus – ingen ny scene (INV-10)
- **Og** flytting av F til et annet sted i filmen endrer ikke Majas utseende i F
- **Og** i en alternativ spinoff der hendelsen er slått av lokalt med `continuity_overrides(action: disable)` (DEC-0020 pkt. 8), har Maja langt hår i X og Y der – uten endring i hovedfilmen (REQ-0167).

## TS-07 Narrativ splitting vs. produksjonsteknisk oppdeling
- **Krav/INV:** REQ-0067, REQ-0071, REQ-0072, REQ-0267 · INV-03, INV-10 · `tests/commands/split-scene.test.ts`
- **Gitt** scene S med aktiv take
- **Når** S splittes narrativt etter blokk b5
- **Så** beholder første del `sceneId` og take; andre del får ny ID med `derivedFrom = S`; blokk-ID-er bevart; avvik opprettet for taken
- **Når** i stedet S deles i to segmenter fordi modellen har lengdegrense (`reason: model_limit`)
- **Så** er antall scener, ID-er og nummerering uendret.

## TS-08 Trimming sletter ikke manus
- **Krav/INV:** REQ-0229, REQ-0230, REQ-0231 · INV-14 · `tests/commands/trim-clip.test.ts`
- **Gitt** scene S med aktiv take som dekker blokkene b1–b8
- **Når** klippet trimmes slik at b7–b8 ikke lenger dekkes
- **Så** er manusblokkene uendret og scenen fortsatt aktiv
- **Og** et avvik `coverage_gap` vises for b7–b8.

## TS-09 Replikkendring flagger bare berørt område
- **Krav/INV:** REQ-0024, REQ-0025, REQ-0305, REQ-0310, REQ-0312, REQ-0313 · INV-07, INV-08, INV-06 · `tests/invariants/inv07-no-overwrite.test.ts`
- **Gitt** scene S med tre segmenter og takes; replikk r ligger i segment 3; r har engelsk oversettelse og norsk lydtake
- **Når** teksten i r endres på norsk
- **Så** får bare segment 3 (og lydtaken for r) et avvik; segment 1–2 er urørt
- **Og** ingen take er endret, aktiv peker uendret, ingen generering startet
- **Og** oversettelsen er `needs_review`
- **Og** de tre valgene finnes: godkjenn (registreres med versjoner), oppdater (ny take ved siden av, kostnad vist først), angre (selektiv invers av akkurat denne endringen).

## TS-10 Annet språk endrer ikke norsk
- **Krav/INV:** REQ-0328–REQ-0331, REQ-0344 · INV-05, INV-06 · `tests/invariants/inv06-translation-oneway.test.ts`
- **Gitt** norsk replikk r og engelsk oversettelse
- **Når** den engelske teksten eller engelsk replikkvarighet endres
- **Så** er norsk blokk, norsk lyd og hovedfilmens timing uendret.

## TS-11 Samtidig redigering
- **Krav/INV:** REQ-0526, REQ-0524 · INV-C1, INV-C2 · `tests/invariants/invC1-revision-conflict.test.ts`
- **Gitt** to redaktører som har lest forekomsten av scene S med `revision = 7`
- **Når** begge sender `MoveOccurrence` for S via `runCommand` med `baseRevisions = { S: 7 }`
- **Så** lykkes den første, og den andre avvises med `revision_conflict` (fra kjernen, eller `P0409` fra `apply_changes` hvis de kom samtidig); ingen endring går tapt i stillhet
- **Gitt** (a) to redaktører A og B som har lest samme replikkblokk r med samme `revision`
- **Når** begge sender `EditBlockText` for r
- **Så** lykkes A (ny `script_block_revisions`-rad), og B avvises med `revision_conflict` (`P0409` i databasen); B får konfliktvisning med valgene behold / bruk min på nytt / flett manuelt – B's tekst forkastes ikke stille
- **Gitt** (b) at A redigerer replikk r1 og B samtidig redigerer replikk r2 i samme scene
- **Så** lykkes begge (revisjonskontrollen ligger på blokken, ikke på varianten)
- **Gitt** (c) at A har endret r og B deretter endrer r igjen
- **Når** A angrer sin endring
- **Så** gir angringen konflikt (ikke en stille invers som overskriver B)
- **Og** et medlem med rollen `viewer` får avslag fra `runCommand` (`forbidden`), direkte `insert/update/delete` og kall til `apply_changes` fra klienten feiler for alle roller (også owner), og et ikke-medlem ser ingen rader.

## TS-12 Tilfeldige kommandosekvenser (egenskapsbasert)
- **Krav/INV:** REQ-0041–REQ-0043 · INV-01, INV-03, INV-04, INV-10, INV-14 · `tests/invariants/inv01-structure-sync.test.ts`
- **Gitt** en hovedfilm og en spinoff med 10–30 scener
- **Når** en tilfeldig sekvens (f.eks. 200 steg) av MoveOccurrence, SetOccurrenceActive, SplitScene, MergeScenes, SetActiveTake, CreateSegments, EditBlockText (begge produksjoner) utføres
- **Så** holder alle invariantkontroller etter hvert steg
- **Og** inversene i omvendt rekkefølge gir starttilstanden
- **Og** en scene med `merged_into` blir aldri aktiv igjen uten `UnmergeScene` (DEC-0020 pkt. 9); samme scene kan ha flere forekomster i én produksjon (DEC-0020 pkt. 10).

## TS-13 Engelsk filmeksport (delvis dekning inntil `multilingual-localization` finnes, M7)
- **Krav/INV:** mandat 23.3–23.8, 29.6 · INV-05, INV-06 · `tests/export/language-version.test.ts`
- **Gitt** hovedfilmen med norsk dialog, `LanguageVersion` `en` og noen engelske oversettelser med status `needs_review`
- **Når** brukeren eksporterer den engelske filmversjonen
- **Så** brukes samme sceneidentiteter, samme forekomster og samme visuelle takes (`Assembly` for `en` innen samme produksjon – ikke ny produksjon eller kopi av prosjektet)
- **Og** eksportkontrollen (29.6) varsler om manglende/uavklarte oversettelser, `timing_conflict`, uavklarte avvik og manglende medier
- **Og** engelske timingendringer endrer ikke hovedfilmens timing (23.6), og norsk tekst er uendret (INV-06).
