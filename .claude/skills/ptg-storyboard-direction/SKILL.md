---
name: ptg-storyboard-direction
description: "Faglig storyboardregi i From Pen to Glass: utsnitt, vinkel, brennvidde, bevegelse, 180-gradersregelen, blikk-/bevegelsesretning, dekning og overganger (SB-3/SB-9) og hvordan de skal overføres uendret til eksterne programmer via Manifest v1. Bruk ved storyboard-, kamera- eller kontinuitetsoppgaver og når instruksjoner skal eksporteres til connectors."
metadata:
  version: "0.1.0"
  owner: "animatic-studio"
  last-reviewed: "2026-10-24"
---

# ptg-storyboard-direction

## Kilder
- Prosjektets egne regler: `docs/architecture/INVARIANTS.md` (kontinuitet følger fortellingstid), SB3/SB9-rapportene.
- ASC / American Cinematographer Manual (utsnitt, brennvidde, synsvinkel); Steven D. Katz, *Film Directing Shot by Shot* (dekning, akse).
- OpenTimelineIO-dokumentasjon (https://opentimeline.io) for overganger i klippefiler.

## Regler
1. Instruksjoner (piler, lapper, kameramerker) er tekst/metadata, aldri innbrent i bilder som sendes ut.
2. Kameraets synsvinkel beregnes fra brennvidde og bildeformat i `src/core`; connectors får tallene, ikke en tolkning.
3. Aksebrudd flagges, aldri rettes automatisk; godkjent kryssing har begrunnelse.
4. Bildefrekvens er alltid en brøk (`frameRate: {num, den}`) i manifestet.
