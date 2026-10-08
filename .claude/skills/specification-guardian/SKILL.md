---
name: specification-guardian
description: Beskytter mandatet (docs/product/MASTER_SPECIFICATION.md v14) og vedtatte produktkrav i Animatic Studio. Bruk ALLTID før en ny funksjon, endring av eksisterende funksjon, refaktorering, arkitekturvalg, forenkling, utsettelse eller fjerning av noe – og når Mars tar en ny beslutning som skal innarbeides. Finner krav-ID-er (REQ-xxxx) og invarianter (INV-xx), leser mandatkapitler, sjekker DECISION_LOG (Bekreftet av bruker / Teknisk anbefaling / Midlertidig antakelse), avdekker konflikter (spec conflict, scope creep, requirement drift) og viser dem i stedet for å velge i stillhet. Triggere - «ny funksjon», «endre», «forenkle», «utsette», «droppe», «refactor», «mandat», «krav», «spesifikasjon», «beslutning», «Mars har bestemt».
metadata:
  version: "0.2.0"
  owner: "animatic-studio"
  last-reviewed: "2026-10-08"
---

# specification-guardian

Vokter av produktkravene. Skillen lærer en arbeidsmetode; den lager aldri nye produktkrav eller egen produktvisjon.

## 1. Ansvar
**Eier:** at alt arbeid kan føres tilbake til mandatet, en beslutning eller et krav-ID; at konflikter blir synlige; at ingen krav forsvinner i stillhet (mandat 33.5, REQ-0474/REQ-0475); at nye beslutninger fra Mars innarbeides uten tap.
**Eier ikke:**
- Vedlikehold av kravregisteret, statuser og sporbarhet → `requirements-traceability`.
- Lagdeling, domenemodell, ADR-konsistens → `architecture-guardian`.
- Synk manus/lyd/animatic/film og testkrav per strukturkommando → `scene-sync-invariants`.

## 2. Når den brukes
- Før design eller kode for en ny funksjon eller endring (CLAUDE.md «Før du endrer kode», punkt 3).
- Ved refaktorering som kan endre atferd, og ved arkitekturvalg.
- Når noen (også Claude selv) vil forenkle, utsette, slå sammen eller droppe noe.
- Når Mars sier noe som ligner en produktbeslutning («jeg vil at …», «vi dropper …»).
- Når kode, dokumenter og krav ser ut til å si forskjellige ting.

## 3. Les først
- `CLAUDE.md` (kildehierarki og stopp-regler) – detaljert i [SOURCE_HIERARCHY](references/SOURCE_HIERARCHY.md).
- `docs/product/requirements.yaml` – grep etter modul (`CORE`, `SCRIPT`, `TIMELINE` …), kapittel (`section: '24.5'`) eller ord.
- `docs/product/MASTER_SPECIFICATION.md` – kapitlene kravene viser til (`source.section`, `source.lines`). Les linjene, ikke bare kravteksten.
- `docs/decisions/DECISION_LOG.md` – alle DEC-er som nevner kapitlet, modulen eller kravene.
- `docs/architecture/INVARIANTS.md` – INV-01–INV-14, INV-C1/C2.
- `docs/product/OPEN_QUESTIONS.md` (Midlertidige antakelser og åpne spørsmål).
- Alltid relevante prinsippkrav: REQ-0464 (ingen lokale løsninger som bryter prinsippene), REQ-0469–REQ-0473 (ærlighet om tekniske begrensninger, 33.4), REQ-0474/REQ-0475 (33.5).

## 4. Arbeidsprosedyre
1. **Formuler oppgaven** i én setning og list domenebegrepene den berører (Scene, SceneOccurrence, SceneVariant, ProductionSegment, Take, ScriptBlock, ContinuityEvent, storyTime …).
2. **Finn krav-ID-er.** `grep -n` i `requirements.yaml` på modul, kapittel og nøkkelord. Noter ID, prioritet, fase, invarianter. Ta med P0-krav fra kap. 2, 3, 34 som alltid gjelder.
3. **Les mandatkapitlene** som kravene peker på. Kravteksten er et utdrag; mandatet er fasiten.
4. **Sjekk beslutningsloggen.** For hver relevant DEC: noter type.
   - *Bekreftet av bruker* – kan endre/utvide produktkrav.
   - *Teknisk anbefaling* – bestemmer *hvordan*, aldri *hva*. Kan revideres med ny DEC (DEC-0006).
   - *Midlertidig antakelse* – skal presenteres som antakelse, aldri som vedtatt.
5. **Sjekk invarianter.** Hvilke INV-er berøres? Kan løsningen bryte noen av dem (se risikoområdene i `INVARIANTS.md`)?
6. **Identifiser konflikter** mellom: mandat ↔ DEC, krav ↔ krav, krav ↔ ADR/arkitektur, krav ↔ eksisterende kode, oppgave ↔ krav. Løs etter [SOURCE_HIERARCHY](references/SOURCE_HIERARCHY.md). Kode vinner aldri over krav.
7. **Ved konflikt som ikke løses av en bekreftet beslutning:** stopp den delen av arbeidet og vis motsetningen (se «Leveranse»). Velg aldri i stillhet. Teknisk tvil innenfor fullmakten (DEC-0006) løses selv og logges som Teknisk anbefaling.
8. **Ved ønske om å forenkle/utsette/fjerne:** skriv hva, hvorfor, hvilke krav-ID-er, konsekvens, og alternativ som bevarer kravet. Krav endres bare etter beslutning fra Mars (33.5). «Utsatt» er en status med begrunnelse, ikke en stille utelatelse.
9. **Ny beslutning fra Mars:** følg [CHANGE_INTAKE](references/CHANGE_INTAKE.md) trinn for trinn. Ingen tidligere krav fjernes uten at det står i beslutningen.
10. **Skriv akseptansekriterier** i `docs/development/CURRENT_WORK.md` med krav-ID-ene før koding (CLAUDE.md).

## 5. Leveranse
- Kort kravsjekk øverst i planen i `CURRENT_WORK.md`: krav-ID-er, invarianter, DEC-er, konflikter (eller «ingen funnet»).
- **Konfliktmelding til Mars** (norsk, uten sjargong), én per konflikt:
  «Hva sier mandatet / hva sier [kilde] / hvorfor de ikke kan begge gjelde / hva jeg anbefaler og hvorfor / hva du må avgjøre.»
  Vis til kapittel og krav-ID, ikke lim inn lange utdrag.
- Ny beslutning: DEC-post + endrede krav (se CHANGE_INTAKE), notat i `SESSION_HANDOVER.md`.

## 6. Kontrollpunkter
- [ ] Alle berørte krav-ID-er er funnet og lest i mandatet.
- [ ] Beslutningstypene er riktig oppgitt; ingen antakelse framstilt som vedtatt.
- [ ] Ingen invariant brytes av planen.
- [ ] Ingen krav er forenklet, slått sammen, utsatt eller fjernet uten at Mars er informert.
- [ ] `MASTER_SPECIFICATION.md` er urørt (`check_kb.py` kontrollerer SHA-256).
- [ ] Usikre plattformegenskaper (Lovable, Supabase, AI-modeller) er merket som usikre (33.4).

## 7. Typiske feil som må unngås
- Redigere `MASTER_SPECIFICATION.md` eller `SPEC_MANIFEST.yaml`. Ny mandatversjon = ny fil (se manifestet).
- Behandle kode eller en tidligere økts antakelse som fasit for hva produktet skal gjøre.
- La en *Teknisk anbefaling* endre et produktkrav (f.eks. «vi dropper spinoff-varianter fordi skjemaet blir enklere»).
- Løse motstrid ved å velge den enkleste tolkningen uten å si fra.
- Tolke «skjule» som «deaktivere» eller «segment» som «ny scene» (se DEC-0015).
- Spørre Mars om rene tekniske valg (bryter DEC-0006) – eller la være å spørre ved kostnad, sletting av hans filer, endring av produktkrav eller sikkerhet.
- Lage nye krav ut fra egen produktvisjon. Nye krav krever DEC (`origin` ≠ `mandat`).

## 8. Akseptansekriterier / tester
- `python3 scripts/kb/check_kb.py` gir OK (kontrollsum, ID-rekkefølge, dekning, beslutningskrav for ikke-mandatkrav).
- Hver plan i `CURRENT_WORK.md` lister krav-ID-er og invarianter.
- Hver konflikt er enten løst med henvisning til en DEC, eller står åpen i `OPEN_QUESTIONS.md`/handover med spørsmål til Mars.
- Etter innarbeidet beslutning: kravene som DEC-en nevner har en `history`-post med DEC-ID-en.

## 9. Dokumentasjon og sporbarhet
- `docs/decisions/DECISION_LOG.md` (+ ADR i `docs/decisions/adr/` ved store tekniske valg).
- `docs/product/requirements.yaml` (`history`, ev. nye krav med `origin` + `source.decision`) → `python3 scripts/kb/build_docs.py` → `check_kb.py`.
- `docs/product/OPEN_QUESTIONS.md` for Midlertidige antakelser.
- `docs/development/SESSION_HANDOVER.md`, `CURRENT_WORK.md`, `KNOWN_ISSUES.md`; status/implementering/verifikasjon via `requirements-traceability`.

## Eksterne kilder
Ingen ekstern skill dekker mandatet (`docs/references/technical/SKILLS_ASSESSMENT.md`). Prosessidé fra Anthropics `doc-coauthoring` er bare inspirasjon. Ved konflikt med en plugin-arbeidsflyt (f.eks. `feature-dev`) har denne skillen forrang for hva som er krav.
