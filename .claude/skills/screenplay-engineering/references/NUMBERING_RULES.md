# Nummerering ved eksport

Grunnlag: mandat 3.1, 5.2, 29.3; REQ-0079–REQ-0086, REQ-0419; INV-02, INV-03, INV-14. Kode: `src/core/screenplay/numbering.ts` (ren funksjon).

## Grunnregel
Scenenummer er **visningsdata**. Nummerering lager en tabell `{occurrenceId → label}` for én eksport (lagres i `ExportVersion.numbering_table`). Den endrer aldri ID-er, relasjoner eller rekkefølge (REQ-0085). «Gjeldende eksportnummer» = siste eksports tabell (DOMAIN_MODEL).

```ts
type NumberingMethod =
  | { kind: 'sequential' }
  | { kind: 'preserve_production' }                      // bruker SceneOccurrence.productionNumbering
  | { kind: 'historical'; screenplayVersionId: string }; // eller exportVersionId
interface NumberingOptions { includeInactive: boolean; startAt?: number }
function numberScenes(occ: OccurrenceView[], method: NumberingMethod, opt: NumberingOptions): NumberingTable
```
Inndata er aktive sceneforekomster i `orderKey`-rekkefølge for én produksjon (+ inaktive hvis `includeInactive`).

## Metoder
**Fortløpende (REQ-0081):** aktive scener får 1, 2, 3 … i rekkefølge.

**Bevar produksjonsnummerering (REQ-0082):**
- Scener med etablert `productionNumbering` beholder det.
- Nye scener mellom to etablerte får mellomnumre etter forrige etablerte: 42 → 42A, 42B, 42C … Ny scene før første nummer: A1, B1 … (vanlig konvensjon).
- Innsetting mellom 42A og 42B: konvensjonene varierer (f.eks. 42AA). Velg én regel, dokumenter den som Teknisk anbefaling, og test den.
- Om bokstavene I og O hoppes over (forveksling med 1/0) er en innstilling; standard må dokumenteres.
- Etablerte numre gjenbrukes aldri for en annen scene i samme produksjon.
- Hvis etablerte numre ikke lenger står i stigende rekkefølge (scene flyttet): behold numrene, men vis advarsel i forhåndsvisningen.

**Historisk (REQ-0083):** bruk tabellen fra valgt manusversjon/eksport for scener som fantes der; nye scener nummereres med reglene for «bevar» relativt til naboene.

## Deaktiverte scener (REQ-0084, INV-14)
- `includeInactive = false`: utelates helt.
- `includeInactive = true` i «bevar»/«historisk»: scenen beholder sitt nummer og skrives som overskriftslinje med `OMITTED` (bransjepraksis), uten innhold.
- `includeInactive = true` i «fortløpende»: deaktiverte scener **utelates** (de får ikke nummer i rekken og ingen `OMITTED`-linje). Dette er den midlertidige løsningen i `docs/product/OPEN_QUESTIONS.md` Q-08 (bransjepraksis: «OMITTED» bare ved bevart nummerering). Endres bare hvis Q-08 avklares annerledes av Mars; forhåndsvisningen viser at scenene er utelatt.
- «Skjult i visning» (ViewFilter) påvirker aldri eksport (DEC-0015).

## Forhåndsvisning (REQ-0086)
Tabell før eksport: gjeldende nummer → nytt nummer per scene, markering av nye mellomnumre, OMITTED og advarsler. Eksport skjer først etter bekreftelse.

## Sikker endring av `productionNumbering`
Eksport skriver ikke tilbake til `SceneOccurrence.productionNumbering`. Hvis brukeren vil «låse» nye numre som etablerte, gjøres det med en egen kommando (forslag: `LockSceneNumbers`) med angre – registreres som Teknisk anbefaling før bruk.

## Testbare egenskaper (fast-check)
1. Etikettene er unike innen én eksport.
2. Ingen `occurrenceId`, `sceneId` eller relasjon endres (sammenlign før/etter).
3. «Bevar»: alle etablerte numre i inndata finnes uendret i utdata.
4. «Fortløpende»: etikettene er 1..n uten hull for aktive scener.
5. Mellomnumre sorterer mellom naboene etter den dokumenterte sorteringsregelen.
6. Deaktiverte scener finnes i utdata bare når `includeInactive` og metoden er «bevar» eller «historisk», og da med OMITTED-markering; ved «fortløpende» utelates de (Q-08).
7. Samme inndata gir samme tabell (deterministisk).
