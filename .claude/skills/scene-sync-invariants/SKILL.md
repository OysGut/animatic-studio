---
name: scene-sync-invariants
description: Spesialist på synkronisering mellom manus, lyd, animatic og film i Animatic Studio - scenerekkefølge, aktivering/deaktivering, permanente identiteter (sceneId, occurrenceId, blockId), TimeLink, aktiv take, spinoff-isolasjon (SceneVariant), segmentering (ProductionSegment), kontinuitet etter fortellingstid (storyTime) og samtidig redigering uten tap (INV-C1). Bruk ved kode, design eller atferdsspørsmål som berører MoveOccurrence, SetOccurrenceActive, SplitScene, MergeScenes, TransferOccurrence, SetActiveTake, CreateSegments, EditBlockText, PromoteVariant, redigering i spinoff, tidslinje, nummerering, avvik (Discrepancy) og angre. Krever regresjonstester mot INV-01–INV-14 og INV-C1. Triggere - flytte scene, deaktivere, splitte, slå sammen, omnummerere, montering, synk, spinoff, segment, endret replikk eller dialog, oversettelse eller språkversjon som må gjennomgås, samtidig redigering, revisjonskonflikt, flashback, karakterens utseendeendring midt i scene, regression test.
metadata:
  version: "0.2.1"
  owner: "animatic-studio"
  last-reviewed: "2026-10-08"
---

# scene-sync-invariants

Mandatets høyeste prinsipp (kap. 2): manus og film er to visninger av samme produksjon. Denne skillen sørger for at hver operasjon som endrer struktur eller innhold holder alle visninger konsistente – og beviser det med tester.

## 1. Ansvar
**Eier:** atferden til strukturkommandoene og innholdskommandoene som påvirker synk; hva hver kommando skal endre og *ikke* endre; regresjonstester per operasjon; invarianttester i `tests/invariants/`.
**Eier ikke:**
- Hvor koden ligger, tabeller, RLS, kommandoinfrastruktur → `architecture-guardian`.
- Om et krav skal endres/tolkes → `specification-guardian`.
- Registrering av status/verifikasjon → `requirements-traceability`.

## 2. Når den brukes
- Ny eller endret kommando i `src/core/commands` som berører Scene, SceneOccurrence, SceneVariant, ScriptBlock, DialogueLine, ProductionSegment, Take, TimeLink, ContinuityEvent eller Assembly.
- UI for manus, tidslinje/montering, avspilling, lyd, scenenummerering, eksportnummerering, spinoff, avvik og angre.
- Feilsøking der manus og film viser forskjellig rekkefølge, feil scene spilles, eller materiale «forsvinner».

## 3. Les først
- `docs/architecture/INVARIANTS.md` (INV-01–INV-14, INV-C1/C2 og risikoområder). DEC-0020 pkt. 5–10 (blokkrevisjoner, fortellingstid, take-gjenbruk i spinoff, lokal kontinuitet, sammenslåing, samme scene flere ganger).
- `docs/architecture/DOMAIN_MODEL.md` §0 (begreper, DEC-0015) og §3 (livssyklus for operasjonene).
- ADR-0005 (kommandoer, `inverse`, transaksjon), ADR-0006 (tid), ADR-0004 (revisjon).
- Mandat kap. 2, 3, 4.4, 5.1–5.2, 6, 10.6–10.8, 15.2–15.3, 18.4, 21, 24, 25, 34.
- Kjernekrav: REQ-0016–REQ-0043, REQ-0061–REQ-0072, REQ-0079–REQ-0085, REQ-0105–REQ-0107, REQ-0163, REQ-0165, REQ-0228–REQ-0234, REQ-0267, REQ-0356–REQ-0368, REQ-0373–REQ-0383.
- [OPERATIONS_MATRIX](references/OPERATIONS_MATRIX.md) – per kommando: invarianter, skal endres, skal IKKE endres, test.
- [TEST_SCENARIOS](references/TEST_SCENARIOS.md) – Gitt/Når/Så-scenarier, inkl. referansemanusets nummerering og scenariet med karakterens utseendeendring midt i scene + flashback (TS-06).

## 4. Arbeidsprosedyre
1. **Identifiser kommandoen(e)** og slå dem opp i [OPERATIONS_MATRIX](references/OPERATIONS_MATRIX.md). Ny kommando som ikke står der: legg den til i matrisen først (Teknisk anbefaling), før kode.
2. **Skriv testene før eller sammen med koden** (`tests/commands/<kommando>.test.ts`): én test for «skal endres», én for hver rad i «skal IKKE endres», én for `inverse` (utfør → angre → identisk tilstand). Bruk relevante scenarier fra [TEST_SCENARIOS](references/TEST_SCENARIOS.md).
3. **Implementer i `src/core/commands`** som ren funksjon (tilstand + kommando → ny tilstand | feil). Kjør invariantkontrollene i `src/core/invariants/` etter kommandoen i test og utviklingsmodus.
4. **Én kilde til rekkefølge:** manusvisning, tidslinje, avspilling, varighet og eksport leser alle aktive `SceneOccurrence` sortert på `orderKey` for produksjonen. Ingen kopi.
5. **Innhold vs. struktur (2.1):** strukturendring synkes automatisk og transaksjonelt; innholdsendring (tekst, ressurs, kontinuitet) lager `Discrepancy` på berørte takes/segmenter – endrer dem aldri.
6. **Tid:** lagre lokal tid i eierens rom (scene/segment/kildeklipp); absolutt filmtid beregnes. Flytting endrer aldri `TimeLink`.
7. **Spinoff-kontekst:** alle kommandoer har `productionId`. Redigering av delt innhold i spinoff går til spinoff-eid `SceneVariant`; ingenting i andre produksjoner endres (INV-04). Tilbakeføring bare via `PromoteVariant` etter eksplisitt valg.
8. **Egenskapsbasert test** (`tests/invariants/inv01-structure-sync.test.ts` m.fl.): tilfeldige sekvenser av kommandoene over flere produksjoner; etter hvert steg holder alle invarianter, og `inverse` av hele sekvensen gir starttilstanden.
9. **Backend og samtidighet:** valideringen finnes bare i kjernen; serverfunksjonen `runCommand` kjører samme `applyCommand` autoritativt og lagrer endringssettet via `public.apply_changes` med revisjonskontroll per rad (INV-C1, `P0409`) (DEC-0022, erstatter DEC-0020 pkt. 1 og 3). Test minst én konflikt per kommando. For tekst ligger samtidighetskontrollen på blokken/replikken (`script_blocks.revision`), ikke på varianten – samtidig redigering av ulike replikker i samme scene gir ingen konflikt (TS-11). `revision` er bare samtidighetskontroll; innholdshistorikk er `script_block_revisions.rev` (DEC-0020 pkt. 5).
10. **Kostnadsport:** eies ikke av denne skillen (INV-12/INV-C3 → `ai-cost-quality-governance` fra M5, inntil da `API_INTEGRATIONS.md` §2 + `secure-development`). Denne skillen sikrer bare at ingen synkkommando starter betalt jobb som bivirkning, og at segmentering ved modellgrense er `CreateSegments(reason: model_limit)` uten manusendring: når ønsket varighet overstiger adapterens `capabilities()` (mandat 18.1), *foreslår* systemet segmentering automatisk; brukeren godtar, og N segmenter gir N jobber med samlet estimat og én godkjenning (håndheves etter `secure-development` §4 punkt 4).

## 5. Leveranse
- Kommando + tester + oppdatert rad i OPERATIONS_MATRIX (hvis atferd endres) i samme commit, med krav-ID-er og INV-ID-er i commit-meldingen.
- For Mars: forklar med filmspråk («scene 42 flyttet etter scene 50 – den beholder bilder, lyd og koblinger; nummeret i manus endres først når du eksporterer»), ikke kodebegreper.

## 6. Kontrollpunkter
- [ ] Kommandoen står i OPERATIONS_MATRIX, og alle «skal IKKE endres»-rader har test.
- [ ] `inverse` gir identisk tilstand (inkl. `revision`-uavhengig sammenligning av data).
- [ ] Ingen scenenummer brukt som nøkkel eller oppslag (INV-02).
- [ ] Ingen take, manusversjon eller ressursversjon slettes eller overskrives (INV-07, INV-13, INV-14).
- [ ] Ingen effekt på andre produksjoner (INV-04).
- [ ] Ingen betalt jobb startes som bivirkning (INV-12).
- [ ] Manus og montering har lik aktiv rekkefølge etter kommandoen (INV-01).

## 7. Typiske feil som må unngås
- Gi andre del av en narrativ splitting samme ID, eller la første del få ny ID (DEC-0015: første del beholder `sceneId`).
- Lage ny scene eller nytt nummer når en scene segmenteres (INV-10).
- Behandle en omnummerert scene som ny scene ved versjonssammenligning (REQ-0079).
- La trimming av et klipp slette manus eller deaktivere scene (REQ-0230); manglende dekning er et avvik (REQ-0231).
- Skjule scene i UI-filter og tro at den er deaktivert – eller omvendt (REQ-0021).
- Beregne kontinuitet fra manus-/visningsrekkefølge i stedet for `storyTime` (INV-09). Merk DEC-0020 pkt. 6: for `linear` *er* fortellingstiden avledet av hovedproduksjonens rekkefølge, mens `flashback/flashforward/dream/jump` har et manuelt anker som ikke endres ved flytting.
- Anta at samme scene bare kan forekomme én gang per produksjon (`UNIQUE(production_id, scene_id)` finnes ikke, DEC-0020 pkt. 10) – bruk alltid `occurrenceId`.
- Bytte aktiv take automatisk når en ny take blir ferdig (REQ-0030).
- Skrive tester som bare sjekker «det som skal skje», ikke det som *ikke* skal skje.

## 8. Akseptansekriterier / tester
- Hver kommando: `tests/commands/<kommando>.test.ts` dekker matrisen.
- Hver P0-invariant: test i `tests/invariants/` (navn som i `INVARIANTS.md`), inkludert egenskapsbasert sekvenstest.
- Scenariene i TEST_SCENARIOS er implementert som tester før kommandoene de bruker meldes «Verifisert».
- `npm test` grønt; `python3 scripts/kb/check_kb.py` OK.

## 9. Dokumentasjon og sporbarhet
`requirements.yaml`: `implementation` (`src/core/commands/<fil>.ts#<symbol>`) og `verification` (`tests/...::<testnavn>`) for berørte krav → `build_docs.py`; statuskolonnen i `INVARIANTS.md`; `IMPLEMENTATION_STATUS.md`, `KNOWN_ISSUES.md`, `SESSION_HANDOVER.md`; ny kommando eller endret semantikk → DEC/ADR (Teknisk anbefaling) via `architecture-guardian`.

## Eksterne kilder
Ingen ekstern skill dekker dette (`SKILLS_ASSESSMENT.md`, status SELV). Generelle testverktøy-skills/plugins (f.eks. `pr-review-toolkit`s testanalyse) kan brukes som støtte; denne skillens matrise og scenarier har forrang.
