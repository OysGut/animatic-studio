# Operasjonsmatrise – strukturkommandoer og synk

For hver kommando: hvilke invarianter som berøres, hva som **skal** endres, hva som **ikke skal** endres, og hvilke tester som kreves. Grunnlag: `DOMAIN_MODEL.md` §3, ADR-0005, ADR-0006, `INVARIANTS.md`, mandat kap. 2, 3, 4.4, 15, 18, 21, 24, 25.

Kommandonavnene følger `DOMAIN_MODEL.md` §3 (kanonisk: `MoveOccurrence` – ikke «MoveSceneOccurrence»). DEC-0020 pkt. 5–10 presiserer blokkrevisjoner, fortellingstid, take-gjenbruk i spinoff, lokal kontinuitet, sammenslåing og at samme scene kan forekomme flere ganger i én produksjon. `TransferOccurrence` og resten av `MergeScenes` (utover `merged_into`) er ikke fastsatt – atferden under er **Teknisk anbefaling** og må bekreftes i en ADR før implementering (se merknader).

## Felles for alle kommandoer
- Har `projectId`, `productionId` (kontekst), `author`, `base_revisions`, `inverse`.
- Logikken finnes bare i `src/core` (`applyCommand`, DEC-0022). Klienten kaller serverfunksjonen `runCommand`, som kjører kommandoen i kjernen og lagrer endringssettet (`diffStates`) atomisk i én transaksjon via `public.apply_changes`, som skriver `change_log` (ADR-0005). Ingen SQL-funksjon eller RPC per kommando.
- Avvises ved utdatert `revision` (INV-C1: `baseRevisions` i kjernen gir `revision_conflict`; avvik per rad i `apply_changes` gir SQLSTATE `P0409`) og manglende rolle (INV-C2: `runCommand` og `apply_changes` krever rolle ≥ editor). `revision` er bare samtidighetskontroll; innholdsversjoner av tekst er `script_block_revisions.rev` (DEC-0020 pkt. 5).
- Refererer alltid til `occurrenceId`, aldri til `(productionId, sceneId)`: samme scene kan forekomme flere ganger i én produksjon (DEC-0020 pkt. 10).
- Endrer aldri: andre prosjekter; uforanderlige tabeller (`screenplay_versions`, `resource_versions`, `takes`-filpekere, `change_log`, `imported_documents`, `export_versions`); starter aldri betalt jobb (INV-12).
- Felles tester: `inverse` → identisk tilstand; revisjonskonflikt avvises; invariantkontrollene i `src/core/invariants/` passerer etterpå.

Testfiler: `tests/commands/<kommando>.test.ts` (regresjon per operasjon) + invarianttestene i `tests/invariants/` (navn fra `INVARIANTS.md`).

---

## MoveOccurrence (flytt scene)
- **Krav:** REQ-0017, REQ-0018, REQ-0062, REQ-0107, REQ-0228, REQ-0356. **Invarianter:** INV-01, INV-02, INV-03, INV-04.
- **Skal endres:** `SceneOccurrence.orderKey` for den flyttede forekomsten (fraksjonell nøkkel, ingen omskriving av naboer nødvendig). Beregnet absolutt filmtid for alle etterfølgende scener. Visningsnummer i *forhåndsvisning* av eksport kan endres (5.2) – ikke lagret nummer. **Fortellingstid (DEC-0020 pkt. 6):** for scener med `storyTime.kind = linear` er fortellingstiden avledet av plassen i *hovedproduksjonens* rekkefølge – flytting i hovedproduksjonen oppdaterer den (og dermed kontinuitetstilstanden der det er riktig).
- **Skal IKKE endres:** `sceneId`, `occurrenceId`, `variantId`, `productionNumbering`, `active`, `activeTakeId`, takes, segmenter, `TimeLink` (lokal tid), det manuelle ankeret for `flashback/flashforward/dream/jump`, andre produksjoners forekomster, `assembly_items` (trim/overgang/spor). Flytt i en spinoff endrer ikke hovedfilmens fortellingstid.
- **Tester:** `move-occurrence.test.ts`: manusrekkefølge == monteringsrekkefølge etter flytt i manus og etter flytt i tidslinje (samme kommando); `TimeLink` uendret; flytt i spinoff endrer ikke hovedfilm; lineær scene flyttet i hovedfilmen får ny avledet fortellingstid, flashback-scene beholder ankeret; flytt + angre = identisk. Invariant: `inv01-structure-sync`, `inv03-identity-stable`, `inv04-spinoff-isolation`.

## SetOccurrenceActive (deaktiver / gjenaktiver)
- **Krav:** REQ-0019, REQ-0020, REQ-0021, REQ-0063, REQ-0064, REQ-0229, REQ-0356. **Invarianter:** INV-01, INV-14, INV-04.
- **Skal endres:** `SceneOccurrence.active`. Avledet: aktivt manus, avspilling, spilletid, eksport (som standard) utelater scenen.
- **Skal IKKE endres:** noen rad slettes; `orderKey` (scenen kommer tilbake på samme plass), takes, `activeTakeId`, variant, blokker, `TimeLink`, segmenter, nummerering, kontinuitetshendelser, andre produksjoner. UI-filter (`ViewFilter`) er en annen mekanisme og påvirkes ikke.
- **Tester:** `set-occurrence-active.test.ts`: deaktiver → utelatt i manus, montering, varighet, eksport; gjenaktiver → identisk tilstand; skjuling i `ViewFilter` endrer ikke varighet/eksport. Invariant: `inv14-deactivate-not-delete`, `inv01-structure-sync`.

## SplitScene (narrativ splitting)
- **Krav:** REQ-0067, REQ-0071, REQ-0041, REQ-0042. **Invarianter:** INV-03, INV-01, INV-07.
- **Skal endres:** ny `Scene` for andre del med ny `sceneId` og `derivedFrom = opprinnelig`; ny `SceneVariant` og `SceneOccurrence` rett etter den opprinnelige i *denne* produksjonen; blokkene etter splittpunktet flyttes til ny variant (blokk-ID-er beholdes); `Discrepancy` på takes/segmenter som dekker begge deler.
- **Skal IKKE endres:** første del beholder `sceneId`, `occurrenceId`, takes og `activeTakeId` (DEC-0015); takes slettes eller deles ikke automatisk; andre produksjoner som bruker scenen (de beholder hele scenen inntil brukeren velger noe annet – INV-04); historiske manusversjoner; `storyTime` for første del (ny del arver verdien, kan overstyres).
- **Tester:** `split-scene.test.ts`: ID-regel; blokk-ID-er bevart; avvik opprettet, takes urørt; spinoff med samme scene uendret; split + angre = identisk. Skill fra `CreateSegments` (egen test som bekrefter at segmentering *ikke* gir ny scene).

## MergeScenes (slå sammen) – delvis fastsatt (DEC-0020 pkt. 9)
- **Krav:** REQ-0068, REQ-0041, REQ-0042. **Invarianter:** INV-03, INV-14, INV-07, INV-01.
- **Fastsatt (DEC-0020 pkt. 9):** `MergeScenes` setter `scenes.merged_into` på den sammenslåtte (andre) scenen. Den kan ikke gjenaktiveres som egen scene – `SetOccurrenceActive(true)` på en forekomst av en scene med `merged_into` avvises; bare den inverse kommandoen `UnmergeScene` gjenoppretter den.
- **Anbefalt (må bekreftes i ADR):** den første scenen (i aktiv rekkefølge) beholder `sceneId`; blokkene fra den andre legges til i den førstes variant (blokk-ID-er beholdes); den andre scenens forekomst settes `active=false` – *ikke* slettet; takes fra begge bevares; `Discrepancy` på takes som ikke dekker hele den sammenslåtte scenen.
- **Skal IKKE endres:** ingen take, variant eller scene slettes; andre produksjoner påvirkes ikke; historiske manusversjoner; `TimeLink` peker fortsatt på samme blokker.
- **Tester:** `merge-scenes.test.ts`: overlevende ID; `merged_into` satt; `SetOccurrenceActive(true)` på den sammenslåtte scenen avvises (ingen duplisert innhold); `UnmergeScene` (angre) gjenoppretter; takes bevart; spinoff uendret.
- **Åpent:** fortellingstid og aktiv versjon etter sammenslåing – se `OPEN_QUESTIONS.md` Q-07 (midlertidig: første scenes verdier; brukeren bekrefter i dialog).

## TransferOccurrence (overføring mellom produksjoner) – atferd ikke fastsatt
- **Krav:** mandat 3.4 («overføring mellom produksjoner»), REQ-0041, REQ-0363, REQ-0381. **Invarianter:** INV-04, INV-03, INV-02.
- **Anbefalt (må bekreftes i ADR):** lager en ny `SceneOccurrence` i målproduksjonen for samme `sceneId` (ingen kopi av scenen), med valgt variant og plassering – også om målproduksjonen allerede har en forekomst av scenen (DEC-0020 pkt. 10); kildeproduksjonen er uendret. Overføring av en spinoff-scene til hovedfilmen skjer bare etter eksplisitt brukervalg (REQ-0363, REQ-0381) og går via `PromoteVariant`-flyten når varianter er involvert.
- **Skal IKKE endres:** `sceneId`; kildeproduksjonens forekomster, varianter og takes; målproduksjonens øvrige rekkefølge (bortsett fra innsettingspunktet); godkjent materiale i målproduksjonen.
- **Tester:** `transfer-occurrence.test.ts`: ny forekomst, samme `sceneId`; kilde uendret; overføring til en produksjon som allerede har scenen gir en ekstra forekomst (ingen unik nøkkel på `(production_id, scene_id)`); angre fjerner bare den nye forekomsten.

## SetActiveTake (velg aktiv versjon – «Bruk denne»)
- **Krav:** REQ-0232, REQ-0233, REQ-0234, REQ-0030, REQ-0316, REQ-0317. **Invarianter:** INV-07, INV-14, INV-04.
- **Skal endres:** `SceneOccurrence.activeTakeId` (eller segmentets aktive take) i *denne* produksjonen. I en spinoff kan pekeren gå til en take som eies av hovedfilmens forekomst (referanse, ingen kopi; DEC-0020 pkt. 7); trim/utdrag lagres på spinoffens forekomst. Avledet: montering, avspilling, bekreftet varighet.
- **Skal IKKE endres:** andre takes (beholdes, kan gjenaktiveres); take-filer; manus; andre produksjoner som bruker samme scene; rekkefølge.
- **Tester:** `set-active-take.test.ts`: bare pekeren endres; forrige take finnes og kan velges igjen; ny ferdig take blir *ikke* aktiv automatisk (REQ-0030); spinoff-valg påvirker ikke hovedfilm.

## CreateSegments (produksjonsteknisk segmentering)
- **Krav:** REQ-0071, REQ-0072, REQ-0161, REQ-0162, REQ-0163, REQ-0260, REQ-0267, REQ-0268. **Invarianter:** INV-10, INV-02, INV-03, INV-09.
- **Skal endres:** nye `ProductionSegment` for forekomsten med `reason ∈ {narrative_subsequence, continuity_change, model_limit, manual}`, grenser (`startBlockId/endBlockId` eller bilder) og rekkefølge innen forekomsten (`production_segments.order_key` i `DATA_RELATIONSHIPS.md`). Ved `continuity_change`: hvert segment får riktig karaktertilstand fra `ContinuityEvent` (etter `storyTime`).
- **Skal IKKE endres:** `sceneId`, antall scener, blokker, manustekst, scenenummer/`productionNumbering`, eksportnummerering, manusversjoner, eksisterende takes for hele scenen, andre produksjoner.
- **Tester:** `create-segments.test.ts`: alle årsaker gir null endring i manus og nummerering; segmenter dekker scenen uten overlapp/hull (når det er meningen); sletting av segmenter gir identisk manus. Invariant: `inv10-segmentation`.

## EditBlockText (rediger replikk/handling i hovedproduksjonen)
- **Krav:** REQ-0065, REQ-0066, REQ-0024, REQ-0025, REQ-0305, REQ-0310, REQ-0311, REQ-0312. **Invarianter:** INV-07, INV-08, INV-06, INV-05.
- **Skal endres:** ny rad i `script_block_revisions(block_id, rev, text, author, created_at)` og `script_blocks.current_rev` = ny `rev` (samme `blockId`; DEC-0020 pkt. 5); `script_blocks.revision` økes (samtidighet); `Discrepancy` på takes/segmenter/lydtakes hvis `producedFrom.blockRevisions` inneholder blokken med en eldre `rev` – bare de berørte (21.3, via `TimeLink`); oversettelser av blokken → `needs_review`.
- **Skal IKKE endres:** tidligere rader i `script_block_revisions` (bare insert); takes (fil, status, aktiv peker); andre blokker og deres `revision`; struktur/rekkefølge; historiske manusversjoner; oversettelse endrer aldri norsk (INV-06); ingen ny generering startes.
- **Samtidighet:** revisjonskontrollen ligger på blokken (`script_blocks.revision`), ikke på varianten. To brukere på samme blokk → den andre får `P0409`; ulike blokker i samme scene → begge lykkes (TS-11).
- **Tester:** `edit-block-text.test.ts`: avvik bare på berørte segmenter; takes uendret; ny `rev` og uendret historikk; oversettelse `needs_review`; selektiv angring av akkurat denne endringen (REQ-0311); samtidig redigering av samme blokk gir konflikt, av ulike blokker ikke. Invariant: `inv07-no-overwrite`, `inv08-discrepancy-resolution`, `inv06-translation-oneway`.

## EditInSpinoff (EditBlockText i spinoff-kontekst)
- **Krav:** REQ-0365, REQ-0366, REQ-0040, REQ-0031, REQ-0356. **Invarianter:** INV-04, INV-13.
- **Skal endres:** hvis forekomstens variant er delt (`ownerProductionId = null`) eller eid av en annen produksjon: opprett ny `SceneVariant` med `basedOnVariantId` og `ownerProductionId = spinoff`, pek spinoffens forekomst til den, og bruk endringen der. Hvis varianten allerede er spinoff-eid: ny `script_block_revisions`-rad i den. **Gjenbrukt hovedfilm-take (DEC-0020 pkt. 7):** peker spinoffens forekomst på en take eid av hovedfilmens forekomst, beholdes pekeren, og takens `Discrepancy` opprettes *i spinoffens kontekst* (mål = spinoffens forekomst) – hovedfilmen får ingen.
- **Skal IKKE endres:** delt variant, hovedfilmens forekomst/takes/avvik, den gjenbrukte take-raden selv, andre spinoffer; `sceneId` (samme narrative scene); blokk-ID-er i originalvarianten.
- **Tester:** `edit-in-spinoff.test.ts`: hovedfilmens tekst uendret; ny variant eid av spinoff; ny redigering gjenbruker spinoff-varianten (ikke ny hver gang); avvik bare i spinoff, også for gjenbrukt hovedfilm-take; spinoffens trim/utdrag påvirker ikke hovedfilmen. Invariant: `inv04-spinoff-isolation`.

## PromoteVariant (tilbakefør fra spinoff til hovedfilm)
- **Krav:** REQ-0373–REQ-0383, REQ-0026. **Invarianter:** INV-04, INV-07, INV-08, INV-13.
- **Skal endres (bare etter eksplisitt brukervalg, med valgte deler):** ny hovedvariant basert på spinoff-varianten, *eller* bare valgte deler (manus / visuelt / lyd / timing); ev. ny take i hovedfilmen ved siden av eksisterende; ved overføring av ny spinoff-scene: ny forekomst i hovedfilmen.
- **Skal IKKE endres:** godkjent materiale i hovedfilmen overskrives ikke (REQ-0382); aktiv take byttes ikke uten eget valg; spinoffens variant og historikk; relasjoner og historiske versjoner bevares (REQ-0383).
- **Tester:** `promote-variant.test.ts`: «behold alt uendret» gir null endring; delvis tilbakeføring rører bare valgte deler; godkjent take i hovedfilm uendret; angre gjenoppretter hovedfilmen. Ingen automatisk utløsning (test at ingen annen kommando kaller den).

## SetContinuityOverride (lokal kontinuitet i spinoff, DEC-0020 pkt. 8)
- Kommandonavnet er Teknisk anbefaling (ikke i `DOMAIN_MODEL.md` §3 ennå). **Krav:** mandat 10.8, REQ-0356. **Invarianter:** INV-04, INV-09.
- **Skal endres:** ny rad i `continuity_overrides(production_id, event_id, action: disable|replace, replacement_event_id?)` for *denne* produksjonen. Avledet: kontinuitetstilstanden i produksjonen (delt hendelse ignoreres eller erstattes) og eventuelle `Discrepancy` på produksjonens berørte takes.
- **Skal IKKE endres:** den delte `ContinuityEvent`; hovedfilmens og andre produksjoners kontinuitet; takes.
- **Tester:** `set-continuity-override.test.ts`: spinoff med `disable` får uendret utseende etter hendelsen, hovedfilmen får endringen; angre fjerner bare overstyringen.

---

## Avledede visninger som må følge alle kommandoene
| Visning | Kilde | Test |
|---|---|---|
| Aktivt manus | aktive forekomster sortert på `orderKey` → variant → blokker | `inv01-structure-sync` |
| Montering/tidslinje | samme liste → `activeTakeId` → `assembly_items` (trim, overgang, spor) | `inv01-structure-sync` |
| Absolutte tidskoder | beregnet fra rekkefølge + varigheter (ADR-0006) | `move-occurrence` (tid etter flytt) |
| Toveis navigasjon manus ↔ avspilling | `TimeLink` i lokal tid | REQ-0097/0098, `move-occurrence` |
| Varighet (estimert/bekreftet) | aktive forekomster, beste ikke-estimerte varighet for aktiv take | `set-occurrence-active`, `set-active-take` |
| Eksportnummerering | valgt metode ved eksport, tabell `{occurrenceId → nummer}` | REQ-0080–0085 |
| Kontinuitetstilstand | `ContinuityEvent` (delte + produksjonens egne, minus/erstattet av `continuity_overrides`) sortert på fortellingstid (`linear` avledet av hovedproduksjonens rekkefølge, ellers manuelt anker; DEC-0020 pkt. 6, 8) | `inv09-story-time-continuity` |
