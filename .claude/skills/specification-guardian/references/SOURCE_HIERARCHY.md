# Kildehierarki og konfliktløsning

Kilde: `CLAUDE.md` («Autoritative kilder») som gjengir Mars' instruks (del B1). Denne fila forklarer hvordan hierarkiet brukes i praksis. Ved avvik mellom denne fila og `CLAUDE.md` gjelder `CLAUDE.md`.

## Rekkefølge (høyest først)

| # | Kilde | Hva den avgjør | Kan endres av |
|---|---|---|---|
| 1 | `docs/product/MASTER_SPECIFICATION.md` (mandat v14, SHA-256 i `SPEC_MANIFEST.yaml`) | Hva produktet skal være og gjøre | Ingen. Endres aldri. Ny versjon = ny fil + nytt manifest (Mars' beslutning). |
| 2 | `docs/decisions/DECISION_LOG.md` – **Bekreftet av bruker** | Senere produktbeslutninger som utvider, tolker eller endrer mandatet | Ny DEC fra Mars som «Erstatter DEC-xxxx» |
| 2b | `DECISION_LOG.md` – **Teknisk anbefaling** | *Hvordan* krav oppfylles | Ny DEC (Claude, DEC-0006). Endrer aldri *hva*. |
| 2c | `DECISION_LOG.md` – **Midlertidig antakelse** | Arbeidshypotese inntil avklart | Bekreftes eller erstattes; står i `OPEN_QUESTIONS.md` |
| 3 | `docs/product/requirements.yaml` (→ `REQUIREMENTS.md`, `TRACEABILITY_MATRIX.md`, genererte) | Krav-ID-er, akseptanse, status | Via `requirements-traceability`; tekstendring krever DEC |
| 4 | `docs/architecture/*` (spesielt `INVARIANTS.md`) + ADR-er | Hvordan kravene oppfylles; testbare regler | ADR/DEC (Teknisk anbefaling); INV-01–14 bare av Bekreftet av bruker |
| 5 | `docs/development/SESSION_HANDOVER.md`, `CURRENT_WORK.md` | Hvor arbeidet står | Fritt, men skal være sanne |
| 6 | `.claude/skills/` | Arbeidsmetode | Fritt; skaper aldri produktkrav |
| – | Koden | Hva som *er* implementert – ikke hva som *skal* | – |

## Regler for konfliktløsning

1. **Høyere vinner over lavere** – med ett unntak: en *Bekreftet av bruker*-beslutning som eksplisitt endrer et mandatpunkt gjelder foran mandatpunktet (mandatfila endres likevel ikke). Eksempel: DEC-0002 erstatter «DEL 2.docx» som referanse i 4.1, men kravene i 4.1 består.
2. **Nyere bekreftet DEC vinner over eldre** bare når den sier «Erstatter DEC-xxxx» eller åpenbart dekker samme punkt. Er det tvil: spør Mars.
3. **Teknisk anbefaling kan aldri begrunne at et krav svekkes.** Står en teknisk løsning i veien for et krav, er det løsningen som må endres – eller Mars må ta en beslutning.
4. **Midlertidig antakelse** kan brukes til å komme videre, men skal merkes i plan, kode-kommentar ved behov og handover, og aldri presenteres som vedtatt.
5. **Krav ↔ krav i mandatet:** Mandatet har kjente redigeringsartefakter (dupliserte linjer – ikke to krav; tom kodeblokk). Reell motstrid vises for Mars; DEC-0015 er eksempel på en teknisk tolkning som ikke endrer krav (skjule vs. deaktivere, segmentbegrepene).
6. **Kode ↔ krav:** Kravet gjelder. Avviket registreres i `KNOWN_ISSUES.md`, og kravstatus settes riktig (f.eks. «Endret – må reverifiseres»).
7. **Skill ↔ dokument:** Dokumentet gjelder. Rett skillen.
8. **Ekstern skill/plugin ↔ prosjektskill:** Prosjektskillen gjelder (DEC-0016, `SKILLS_ASSESSMENT.md`).

## Når Claude avgjør selv, og når Mars må spørres (DEC-0006)

| Situasjon | Hvem |
|---|---|
| Valg av bibliotek, mønster, tabellstruktur, testverktøy innenfor kravene | Claude – logg som Teknisk anbefaling (DEC/ADR ved store valg) |
| Tolkning av uklart produktkrav som påvirker hva brukeren får | Mars |
| Forenkle, utsette, slå sammen eller fjerne et krav | Mars (33.5) |
| Noe koster penger (API-kall, tjenester, abonnement) | Mars |
| Sletting eller overskriving av Mars' filer | Mars |
| Sikkerhetsspørsmål (tilgang, hemmeligheter, deling) | Mars |

## Mal for konfliktmelding til Mars

> **Motstrid i [tema]**
> Mandatet (kap. X, REQ-xxxx) sier: … (kort, med egne ord)
> [Kilde] (DEC-xxxx / ADR / kode) sier: …
> De kan ikke begge gjelde fordi …
> Jeg anbefaler … fordi … Konsekvens: …
> **Jeg trenger at du avgjør:** … (ett tydelig spørsmål, åpent formulert)

Skriv på norsk uten sjargong. Ikke still flervalgsspørsmål når det er et nytt konsept som skal utforskes; beskriv alternativene i tekst.
