# Kodekonvensjoner

Gjelder `src/core`, `src/engine`, `src/adapters` og egen UI-kode. Lovable-generert kode (ruter-oppsett, `src/components/ui/` fra shadcn hvis det finnes) følger Lovables stil; ikke omformater den uten grunn.

## 1. TypeScript
- `strict: true`. Hvis Lovables `tsconfig` ikke er strict og en global endring vil gi mange feil i generert kode: lag `tsconfig.strict.json` som dekker `src/core`, `src/engine`, `src/adapters` og kjør `tsc -p tsconfig.strict.json --noEmit` i testene. Registrer valget i KNOWN_ISSUES.
- Anbefalte tillegg i strict-konfigen: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (vurder), `noImplicitOverride`.
- Ingen `any` i core. Grenser (RPC-svar, filimport, `jsonb`) parses til typer med validering (eksisterende bibliotek i `package.json`, f.eks. zod hvis det finnes; ellers små håndskrevne guards).
- Uttømmende `switch` over unioner med `assertNever`.
- `readonly` på domenetyper; kommandoer lager nye objekter.

## 2. ID-er og domenetyper
```ts
// src/core/model/ids.ts
declare const brand: unique symbol;
export type Id<T extends string> = string & { readonly [brand]: T };
export type SceneId = Id<'Scene'>;
export type SceneOccurrenceId = Id<'SceneOccurrence'>;
export type SceneVariantId = Id<'SceneVariant'>;
export type ScriptBlockId = Id<'ScriptBlock'>;
export type ProductionSegmentId = Id<'ProductionSegment'>;
export type TakeId = Id<'Take'>;
export type ContinuityEventId = Id<'ContinuityEvent'>;
export function newId<T extends string>(): Id<T> { /* UUID v7 */ }
```
- Brandede ID-er hindrer at en `SceneId` sendes der en `SceneOccurrenceId` forventes.
- Scenenummer er `string` i et eget felt (`productionNumbering`), aldri en ID-type.
- Tid: `Frames` (heltall) og `FrameRate { num, den }` (ADR-0006). Ingen sekunder som flyttall i domenet.

## 3. Moduler og importgrenser
| Fra \ Til | core | engine | adapters | app/UI |
|---|---|---|---|---|
| core | ✓ | ✗ | ✗ | ✗ |
| engine | ✓ | ✓ | ✗ | ✗ |
| adapters | ✓ | ✗ | ✓ | ✗ |
| app/UI | ✓ | ✓ (dynamisk for tunge) | ✓ | ✓ |
- Håndhev med `tests/architecture/core-purity.test.ts` (ADR-0003) og gjerne `no-restricted-imports` i lint.
- Core definerer grensesnitt (`ScreenplayRepository`, `ProviderAdapter`, `Clock`, `IdGenerator`); adaptere implementerer dem.
- Unngå barrel-filer (`index.ts` som re-eksporterer alt) for engine; importer konkrete filer.

## 4. Komponenter
- Én arbeidsflate per mappe i `src/app/<flate>/` (f.eks. `screenplay`, `timeline`, `scene-editor`), med tynne rutekomponenter i Lovables `src/routes/`.
- Presentasjonskomponenter får data + callbacks via props; container/hook kobler til store/adapter.
- Komposisjon framfor boolske props-eksplosjoner (`<Timeline.Track>` i stedet for `showX`, `showY`, `compactZ`).
- Tilgjengelighet: ekte knapper/lenker, `aria-*` på egendefinerte kontroller, tastaturstøtte (detaljer i `ux-interaction-design`).
- All brukertekst via oversettelsesstrukturen (DEC-0017), norsk som standard.

## 5. Feil
```ts
export type Result<T, E = DomainError> = { ok: true; value: T } | { ok: false; error: E };
export type DomainError =
  | { kind: 'invariant_violation'; invariant: 'INV-01' | 'INV-02' /* … */; detail: string }
  | { kind: 'revision_conflict'; ids: string[] }
  | { kind: 'forbidden' } | { kind: 'not_found'; id: string }
  | { kind: 'validation'; field: string; message: string };
```
- Core kaster ikke for forventede feil; returnerer `Result`.
- Adaptere mapper Postgres-/nettverksfeil til `DomainError` (kontrakt med RPC-feilkodene, se `database-domain-modeling`).
- UI: norsk melding, hva som skjedde, hva brukeren kan gjøre. Logg uten hemmeligheter (REQ-0414).

## 6. Navn og filer
- Engelske navn i kode, norske i UI-tekst. Domenebegreper som i `DOMAIN_MODEL.md` (`SceneOccurrence`, ikke `SceneInstance`).
- Filer: `camelCase.ts` for moduler, `PascalCase.tsx` for komponenter, `*.test.ts` ved siden av eller i `tests/`.
- Kommandoer: verb + objekt (`MoveOccurrence`, `SetOccurrenceActive`, `EditBlockText`, `SplitScene`).
