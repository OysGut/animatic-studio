# Test av arbeidsdeling: Opus + Sonnet-underagenter (økt 5, 2026-10-09)

Mars ba om en test av å dele ut enklere oppgaver til Sonnet og om å måle tokenbruken, så vi kan vurdere
om det lønner seg eller gir merarbeid. Leveransen: forslag fra manuset (DEC-0034) og sceneeditor del 1 (DEC-0035).

## Hvem gjorde hva
| Del | Hvem | Tokens (underagent) | Tid |
|---|---|---|---|
| Gjenkjenningsreglene (kjerne), målt mot «Jula på Dovre» | Opus | – | – |
| Datamodell, kommandoer, invarianter, rendring, migrasjon 0007, databasetest | Opus | – | – |
| A. Forslagsdialogen (brukerflate) | Sonnet | 110 223 | 1 min |
| B. 36 enhetstester for gjenkjenningen | Sonnet | 108 117 | 1 min |
| C. Lerretet i sceneeditoren (velg, dra, skaler, roter, zoom) | Sonnet | 107 278 | 2 min |
| D. Lagliste, egenskapspanel, «Legg til lag» | Sonnet | 137 489 | 3 min |
| F. 30 enhetstester for sceneeditor-kjernen | Sonnet | 125 996 | 2,5 min |
| E. Visuell kontroll (skjermbilder 28–32) og småfeil | Sonnet | 133 456 | 3,5 min |
| G. Kravregisteret (REQ-0544–0548 og statuser) | Sonnet | 97 333 | 1 min |
| H. Første runde kodegjennomgang | Sonnet | 213 444 | 5,5 min |
| **Sum Sonnet** | | **1 033 336** | |

Opus' egen samtale vokste med ca. 245 000 tokens i samme periode (planlegging, kjernekode, beskrivelser
til Sonnet, kontroll og rettinger). Tallene er ikke helt sammenlignbare: underagentenes tall er alt de leste
og skrev, mens Opus-tallet er hvor mye samtalen vokste (Opus leser hele samtalen på nytt hver runde, men det
meste er hurtigbufret og billigere).

## Merarbeid
- **Sonnets kode som måtte rettes:** 4 småfeil i brukerflaten funnet av gjennomgangen (Esc lagret i stedet for
  å forkaste, «Dupliser» kolliderte med et slettet lag, piltaster virket når en knapp hadde fokus, formatvelger
  etter angre) + duplisert hjelpefunksjon. Ingen feil i datalagring, fordi Sonnet ikke skrev den delen.
- **Sonnets test bommet én gang** (forventet at kamerarull ikke skulle gjelde bakgrunnen – det var et bevisst valg).
- **Opus' kode som måtte rettes (funnet av Sonnet-gjennomgangen):** 5 funn – to 2D-scener på samme scene ved
  samtidige klikk, skrivefeil-sammenslåing kunne slå sammen KARI og KARL, «LAURITS OG ROLF» ble alternativt navn,
  tilfeldig valg av «mulig treff», for høy grense for nøkkelbilder.
- Opus brukte tid på å skrive presise oppgavebeskrivelser (ca. 1 side hver) og på å lese gjennom resultatene.

## Foreløpig vurdering (til gjennomgang med Mars)
- **Fungerte godt:** brukerflate etter tydelig beskrivelse, tester etter liste, skjermbildekontroll og
  kravregister. Raskt (1–3 min hver) og parallelt. Gjennomgangen med Sonnet fant reelle feil – også i Opus' kode.
- **Fungerte mindre godt:** Sonnet leser mye for å forstå sammenhengen (100–200 k tokens per oppgave),
  så små oppgaver blir relativt dyre. Den gjør ikke helhetsvurderinger på egen hånd (f.eks. at Esc skulle forkaste).
- **Anbefaling:** fortsett med Sonnet for brukerflate, tester, skjermbilder, dokumentasjon og første gjennomgang;
  behold kjerne, datamodell, migrasjoner og synkregler hos Opus. Slå sammen små oppgaver til færre, større
  bestillinger for å spare innlesing.
