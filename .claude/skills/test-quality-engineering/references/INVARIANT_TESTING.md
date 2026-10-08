# Egenskapsbaserte invarianttester

Grunnlag: `INVARIANTS.md` (kontroller som rene funksjoner i `src/core/invariants/`, kjøres i enhetstester, etter hver kommando i utviklingsmodus, og i egenskapsbaserte tester), ADR-0005 (invers gir identisk tilstand).

## 1. Byggesteiner
```ts
// src/core/invariants.ts
export function checkInvariants(s: ProjectState): Violation[];

// src/core/commands/apply.ts
export function applyCommand(state: ProjectState, env: CommandEnvelope): ApplyResult;
// ApplyResult = { ok: true; state; inverse; affected } | { ok: false; error: CommandError }
```
Testene bruker den samme rene `applyCommand` som klienten og serverfunksjonen `runCommand` (DEC-0022). Databasetester (`tests/db/run-db-tests.ts`) lagrer kjernens endringssett (`diffStates`) via `public.apply_changes`, leser tilbake (`stateFromRows`) og sjekker at tilstanden er identisk.

## 2. Generator for tilfeldige kommandosekvenser
Kommandoer må genereres **ut fra gjeldende tilstand** (gyldige ID-er), derfor brukes fast-checks modellbaserte testing (`fc.commands` + `fc.modelRun`) eller en egen generator som trekker et frø og bygger sekvensen steg for steg.

```ts
import fc from 'fast-check';

// En «kommandomal» velger mål blant eksisterende objekter når den kjøres.
const commandArb = fc.oneof(
  fc.record({ type: fc.constant('MoveOccurrence'), pick: fc.nat(), to: fc.nat() }),
  fc.record({ type: fc.constant('SetOccurrenceActive'), pick: fc.nat(), active: fc.boolean() }),
  fc.record({ type: fc.constant('SplitScene'), pick: fc.nat(), at: fc.nat() }),
  fc.record({ type: fc.constant('MergeScenes'), pick: fc.nat() }),
  fc.record({ type: fc.constant('EditBlockText'), pick: fc.nat(), text: fc.string() }),
  fc.record({ type: fc.constant('CreateSegments'), pick: fc.nat(), n: fc.integer({ min: 1, max: 4 }) }),
  fc.record({ type: fc.constant('SetActiveTake'), pick: fc.nat() }),
  fc.record({ type: fc.constant('EditInSpinoff'), pick: fc.nat(), text: fc.string() }),
  // … hver ny kommandotype legges til her (krav i SKILL.md)
);

function materialize(state: ProjectState, t: CommandTemplate): Command | null {
  // velger f.eks. occurrences[t.pick % occurrences.length]; null hvis ingen gyldige mål
}

test('invarianter holder for tilfeldige sekvenser', () => {
  fc.assert(
    fc.property(fixtureArb, fc.array(commandArb, { maxLength: 60 }), (initial, templates) => {
      let state = initial;
      for (const t of templates) {
        const cmd = materialize(state, t);
        if (!cmd) continue;
        const r = apply(state, cmd);
        if (!r.ok) { expect(r.error.kind).not.toBe('internal'); continue; } // avvisning er lov, krasj er ikke
        state = r.value.state;
        expect(checkAll(state)).toEqual([]);
      }
    }),
    { numRuns: Number(process.env.FC_RUNS ?? 200), seed: envSeed(), verbose: true },
  );
});
```

## 3. Egenskaper som alltid sjekkes
| Egenskap | Invariant |
|---|---|
| Aktive scener i manusvisning == scener i filmmontering, samme rekkefølge, etter hvert steg | INV-01 |
| Ingen relasjon endres når bare nummerering/rekkefølge endres; omnummerering gir samme ID-sett | INV-02, INV-03 |
| `sceneId` for en scene er uendret gjennom flytt/omdøp/deaktiver/ny versjon | INV-03 |
| Kommandoer i spinoff endrer ikke hovedfilmens forekomster/varianter/takes (dyp likhet) | INV-04 |
| Nøyaktig én `nb`-hovedversjon per produksjon | INV-05 |
| Kommandoer med språk ≠ `nb` endrer ingen norske blokker | INV-06 |
| Alle takes (fil, status, aktiv peker) uendret etter manuskommandoer; berørte har avvik | INV-07 |
| Hvert åpent avvik har tre gyldige løsninger som gir forventet tilstand | INV-08 |
| Kontinuitetstilstand avhenger bare av fortellingstid, ikke av visnings- eller spinoff-rekkefølge (permuter spinoffens rekkefølge og flytt ikke-lineære scener → samme svar; lineære scener følger hovedproduksjonens rekkefølge, DEC-0020 pkt. 6) | INV-09 |
| Segmentkommandoer endrer ingen scene-ID, blokk eller nummerering | INV-10 |
| Avspilling/eksport med stub-AI som feiler hvis kalt | INV-11 |
| Ingen jobb går til `generating` uten godkjenning og innenfor budsjett | INV-12 |
| Ressursversjoner uendret; scener peker fortsatt på samme versjon etter ny publisering | INV-13 |
| `SetOccurrenceActive(false)` → `true` gir identisk tilstand; ingen kommando reduserer antall takes/versjoner | INV-14 |
| Utdatert revisjon avvises; begge brukeres endringer finnes | INV-C1 |

## 4. Invers-egenskap (ADR-0005)
```ts
fc.property(stateWithHistoryArb, commandArb, (s, t) => {
  const cmd = materialize(s, t); if (!cmd) return true;
  const r = apply(s, cmd); if (!r.ok) return true;
  const back = apply(r.value.state, r.value.inverse);
  return back.ok && deepEqualIgnoringRevisions(back.value.state, s);
});
```
Revisjoner øker ved angre (angre er en ny endring); sammenlign derfor uten `revision` og uten loggrader.

## 5. Determinisme og feilsøking
- Fast klokke og ID-generator injiseres (ingen `Date.now()`/`crypto.randomUUID()` direkte i core).
- Logg `seed` og `path` ved feil; reproduser med `FC_SEED=… FC_PATH=…`. Legg den krympede sekvensen inn som eksempeltest (regresjon) i samme fil.
- `FC_RUNS`: 200 i CI, 5 000+ ved manuell/nattlig kjøring før milepæl.

## 6. Fixtures for generatorene
- Liten: 1 produksjon, 5 scener, ingen takes (rask krymping).
- Realistisk: hovedfilm + spinoff, 30 scener med hull i nummerrekken og én unummerert, takes på halvparten, kontinuitetshendelser med flashback (karakterens utseendeendring midt i scene, TS-06 / INV-09).
- Begge lages av fabrikker i `tests/fixtures/` – ingen tekst fra referansemanuset trengs.
