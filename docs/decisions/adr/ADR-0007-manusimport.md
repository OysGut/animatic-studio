# ADR-0007 – Manusimport og referansemanus
- **Status:** Gjeldende · **Dato:** 2026-10-08 · **Beslutning:** DEC-0002, DEC-0013 · **Type:** Bekreftet av bruker (referanse) + Teknisk anbefaling (formater)
- **Berørte krav:** kap. 4, 5, 23.2 · **Moduler:** SCRIPT, L10N

## Kontekst
Referansemanus: norsk PDF fra Final Draft 11 (106 s., US Letter, 96 nummererte scener, hull opp til 109, unummerert scene på s. 2) og engelsk DOCX (fast bredde med mellomrom, stiler «SCENE OVERSKRIFT»/«Ny side stil»).
## Beslutning
- Import gjøres i to trinn: (1) uttrekk til et nøytralt mellomformat av linjer med posisjon/innrykk/stil, (2) klassifisering til manuselementer (sceneoverskrift, handling, karakter, parentes, dialog, overgang, sideskift) med sikkerhetsgrad.
- PDF: tekstlag med x-posisjon (pdf.js i klient eller server). Innrykk avgjør elementtype (Final Draft-standard). DOCX: stiler + innrykk + mellomromsmønstre.
- Scenenummer leses fra begge marger; manglende/uregelmessige numre gir aldri nye scener. Tekst før første overskrift bevares som «fortsettelse» og kan kobles til en scene.
- Originalfilen lagres uendret (Storage) med kontrollsum. Strukturert kopi er en ny manusversjon.
- Engelsk manus kobles til norske scener ved analyse av struktur, karakterer, handling og numre – forslag med sikkerhetsgrad, manuell godkjenning.
- Fountain-import/-eksport senere (åpent, dokumentert format). Paginering følger amerikansk manusstandard (US Letter, Courier 12 pt) som standard, A4 som valg.
## Verifisering
Gyldne tester mot referansemanuset (lokalt, filene ligger utenfor repoet) og små anonymiserte utdrag i `tests/fixtures/screenplay/`: forventet antall scener (96 nummererte + unummererte), numre med hull, CONT'D, O.S., delmanus som starter midt i scene.
