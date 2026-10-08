---
name: screenplay-engineering
description: Arbeidsmetode for profesjonelle filmmanus (screenplay) i Animatic Studio – import av DOCX og PDF (Final Draft-eksport), scenedeteksjon, sceneoverskrifter (INT./EXT., lokasjon, tid, scenenummer i begge marger), handling, karakterbetegnelser, extensions (CONT'D, O.S., V.O.), parentetiske instruksjoner, dialog, overganger, paginering (US Letter/Courier 12 og A4), sideskiftregler (MORE/CONT'D), eksportnummerering (fortløpende, bevar produksjonsnummer 42A/42B, historisk, OMITTED), eksport til DOCX/PDF (Fountain senere) og bevaring av originalen. Bruk når du skriver eller endrer kode i src/core/screenplay, src/engine/import eller src/core/export/screenplay, lager gyldne tester mot referansemanuset, eller feilsøker manusvisning, ombrytning eller sideskift. Triggere er manusimport, manusformat, PDF-manus, DOCX-manus, sceneoverskrift, scenenummerering, eksportnummerering, paginering, sideskift, manuseksport, Final Draft, Fountain, screenplay parser. Ikke bare fordi oppgaven nevner manus.
metadata:
  version: "0.2.1"
  owner: "animatic-studio"
  last-reviewed: "2026-10-08"
---

# screenplay-engineering

Fagkunnskap og arbeidsmetode for Screenplay Engine (modul `SCRIPT`, mandat kap. 4–5, 23.2, 29.3). Skillen lager aldri produktkrav; den viser hvordan kravene oppfylles.

## 1. Ansvar
**Eier:** manusformatet som fag – elementtyper og innrykk, importrørledningen (uttrekk → klassifisering → sikkerhet → strukturert kopi), scenedeteksjon og lesing av scenenumre, paginering og sideskiftregler, nummerering ved eksport, DOCX/PDF-eksport, gyldne tester mot referansemanuset, bevaring av originalfilen.
**Eier ikke:**
- At manus og film deler én struktur, og testkrav per strukturkommando (flytt, deaktiver, splitt) → `scene-sync-invariants`.
- Tabeller, RLS, migrasjoner for `imported_documents`, `screenplay_versions`, `script_blocks` → `database-domain-modeling`.
- Manusvisningens React-komponenter, virtualisering og SSR-sikker lasting av pdf.js → `react-typescript-engineering`.
- Testinfrastruktur (Vitest, Playwright, gyldne filer generelt) → `test-quality-engineering`.
- Utseende av manusflaten utover manusstandarden → `design-system-director` / `ux-interaction-design`.
- Hva produktet skal gjøre ved tvil → `specification-guardian`.

## 2. Når den brukes
- Kode i `src/core/screenplay/` (parser, struktur, paginering, nummerering, diff), `src/engine/import/` (PDF/DOCX-uttrekk), `src/core/export/screenplay/`.
- Import av nytt manus, engelsk manus (23.2), eller feil i tolkning/scenedeteksjon.
- Avvik i ombrytning, sideskift, sidetall eller scenenumre i visning eller eksport.
- Nye eksportformater (Fountain, FDX) eller endret nummereringslogikk.

## 3. Les først
- `docs/decisions/adr/ADR-0007-manusimport.md`, DEC-0002 (referansemanus), DEC-0004 (rettigheter/lagring), DEC-0013 (PDF/DOCX først, Fountain senere), DEC-0015 (skjul ≠ deaktiver).
- `docs/product/MASTER_SPECIFICATION.md` kap. 4.1–4.5, 5.1–5.3, 6.3, 23.2, 29.3.
- Krav: REQ-0044–REQ-0060 (import, visning, deteksjon), REQ-0069/REQ-0076–REQ-0079 (versjoner), REQ-0080–REQ-0091 (nummerering og eksport), REQ-0104 (ingen teknisk metadata i eksport), REQ-0332–REQ-0335 (engelsk manus), REQ-0419.
- Invarianter: INV-02, INV-03, INV-05, INV-06, INV-10, INV-11, INV-14 (`docs/architecture/INVARIANTS.md`).
- `docs/architecture/DOMAIN_MODEL.md` (ScriptBlock, ScreenplayVersion, ImportedDocument, ExportVersion, SceneOccurrence.productionNumbering).
- Referanser i denne skillen:
  - [SCREENPLAY_FORMAT](references/SCREENPLAY_FORMAT.md) – elementer, innrykk, extensions.
  - [IMPORT_PIPELINE](references/IMPORT_PIPELINE.md) – trinnene og feilkildene.
  - [PAGINATION_RULES](references/PAGINATION_RULES.md) – sideoppsett og sideskift.
  - [NUMBERING_RULES](references/NUMBERING_RULES.md) – eksportnummerering.
  - [REFERENCE_SCREENPLAY](references/REFERENCE_SCREENPLAY.md) – kjente egenskaper og gyldne testverdier.

## 4. Arbeidsprosedyre
1. **Finn krav og invarianter** for oppgaven (grep `SCRIPT`/`EXPORT` i `requirements.yaml`). Skriv dem i `CURRENT_WORK.md`.
2. **Hold logikken i core.** Parser, klassifisering, paginering og nummerering er rene funksjoner i `src/core/screenplay/` (ingen DOM, ingen pdf.js). Bare råuttrekket (pdf.js-tekstlag, DOCX-XML) bor i `src/engine/import/` og leverer det nøytrale linjeformatet fra [IMPORT_PIPELINE](references/IMPORT_PIPELINE.md).
3. **Import i to trinn** (ADR-0007): uttrekk til `RawLine[]` med side, y, x (tommer), stil og tekst → klassifisering til `ScriptBlock`-kandidater med `confidence` og `reasons`. Kalibrer innrykksbånd fra dokumentet selv; hardkod ikke Final Draft-tall.
4. **Scenedeteksjon:** en scene starter ved en sceneoverskrift, aldri ved et nummer alene. Les nummer fra venstre og høyre marg; ulike numre eller manglende nummer gir usikkerhetsflagg, ikke ny scene (REQ-0048). Tekst før første overskrift blir en fortsettelsesblokk som kan kobles til en tidligere scene (REQ-0047, REQ-0060).
5. **Opprett struktur via kommandoer**, ikke direkte skriving: én importkommando lager `ImportedDocument` (uendret original, SHA-256), ny `ScreenplayVersion`, `Scene` + `SceneVariant` + `ScriptBlock`/`DialogueLine` med permanente ID-er og `sourceRef {page, line}`, og `SceneOccurrence` med `productionNumbering` lik lest nummer (visningsdata – INV-02).
6. **Paginering** er en ren funksjon `paginate(blocks, pageSpec)` med reglene i [PAGINATION_RULES](references/PAGINATION_RULES.md). Kjør inkrementelt fra første endrede side og stopp når sideskiftene stabiliserer seg. Kan kjøres i Web Worker.
7. **Nummerering ved eksport** er en ren funksjon `numberScenes(occurrences, method, options)` → tabell `{occurrenceId → label}` ([NUMBERING_RULES](references/NUMBERING_RULES.md)). Vis forhåndsvisning før eksport (REQ-0086). Endrer aldri ID-er (REQ-0085).
8. **Eksport** (DOCX/PDF) bruker samme sidemodell som visningen, utelater teknisk metadata (REQ-0104), kaller aldri AI (REQ-0091, INV-11) og lagrer `ExportVersion` med nummereringstabell.
9. **Test mot referansen**: gyldne tester med anonymiserte utdrag i `tests/fixtures/screenplay/` + lokale referansetester mot `../Manus/` (hoppes over når mappen mangler). Oppdater forventede verdier i [REFERENCE_SCREENPLAY](references/REFERENCE_SCREENPLAY.md) bare etter manuell kontroll mot PDF-en.
10. **Registrer avvik** fra Final Draft (sideskift, toleranser) i `KNOWN_ISSUES.md` – aldri stille.

## 5. Leveranse
- Kode i `src/core/screenplay/`, `src/engine/import/`, `src/core/export/screenplay/` med enhetstester ved siden av og gyldne tester i `tests/unit/screenplay/` og `tests/fixtures/screenplay/`.
- Importrapport til brukeren (UI): antall scener, nummererte/unummererte, hull i nummerrekken, usikre blokker med side/linje – på norsk.
- Til Mars: kort norsk oppsummering av hva som ble lest riktig, hva som er usikkert, og avvik fra Final Draft-layout.

## 6. Kontrollpunkter
- [ ] Originalfilen er lagret uendret med SHA-256, og strukturert kopi er en ny `ScreenplayVersion` (REQ-0053, REQ-0057).
- [ ] Ingen nøkkel, relasjon, URL eller cache bruker scenenummer (INV-02); React-nøkler og testoppslag bruker ID.
- [ ] Manglende/uregelmessige numre har ikke skapt eller slått sammen scener (REQ-0048).
- [ ] Hver blokk har `confidence`; usikre blokker vises og kan korrigeres (REQ-0058, REQ-0059).
- [ ] CONT'D skilles: talerfortsettelse (del av teksten) vs. sideskiftfortsettelse (genereres ved paginering).
- [ ] Sideskiftreglene holder: ingen enke-overskrift, ingen karakternavn alene nederst, MORE/CONT'D ved delt dialog.
- [ ] Eksport har valgt nummereringsmetode, valg om deaktiverte scener, forhåndsvisning og `ExportVersion`.
- [ ] Ingen manusfil fra `../Manus/` i repoet; fixtures uten kontaktinfo fra tittelsiden (DEC-0004).
- [ ] pdf.js/DOCX-uttrekk lastes bare på klient eller i worker (SSR).

## 7. Typiske feil som må unngås
- Bruke scenenummer som scene-ID eller «lage» en scene fordi et nummer mangler eller hopper.
- Lese marg-scenenumre, sidetall, «(MORE)», «(CONTINUED)»/«CONTINUED:» eller revisjonsstjerner (*) som handlingstekst.
- Hardkode innrykk i tommer uten toleranse; PDF-x-posisjoner varierer med font og eksportinnstillinger.
- Lagre sideskift-CONT'D/MORE som manustekst (de skal regenereres ved ny paginering).
- Normalisere bort originalens skrivemåte (store bokstaver, «-» i overskrift, norske tegn) i den strukturerte kopien.
- Endre historiske `ScreenplayVersion`-er eller `ImportedDocument` ved ny import (REQ-0032).
- Bruke vanlig tekstredigering/tabell/kort som manusvisning (REQ-0051).
- Skrive tekniske ID-er eller tidskoder inn i eksportert manus (REQ-0104).
- Påstå at layouten er «identisk med Final Draft» uten måling mot referanse-PDF-en (mandat 33.4).
- Committe hele manusfiler eller tittelsiden med kontaktinformasjon.

## 8. Akseptansekriterier / tester
- Referansemanus (lokal test, se [REFERENCE_SCREENPLAY](references/REFERENCE_SCREENPLAY.md)): 106 sider, 96 nummererte scener, høyeste nummer 109, minst én unummerert scene (s. 2), ingen oppdiktede scener.
- Fixture «delmanus starter midt i scene» gir fortsettelsesblokk før første overskrift (REQ-0047).
- Rundtur: import → paginering gir samme sideantall som originalen innenfor dokumentert toleranse.
- Egenskapsbaserte tester (fast-check): `numberScenes` gir unike etiketter, endrer ingen ID, og «bevar»-metoden beholder alle etablerte numre; `paginate` mister eller dupliserer aldri tekst.
- Eksport: DOCX/PDF inneholder alle aktive scener i rekkefølge med valgt nummerering; deaktiverte bare når valgt – som OMITTED ved bevart/historisk nummerering, utelatt ved fortløpende (Q-08).
- INV-02/INV-03-tester bestås etter import og omnummerering (eies av `scene-sync-invariants`).

## 9. Dokumentasjon og sporbarhet
- `docs/product/requirements.yaml`: `status`, `implementation` (filstier), `verification` (testfil + dato) for REQ-0044–REQ-0091, REQ-0332–REQ-0335, REQ-0419 → `python3 scripts/kb/build_docs.py` → `python3 scripts/kb/check_kb.py`.
- `docs/development/IMPLEMENTATION_STATUS.md`, `SESSION_HANDOVER.md`, `KNOWN_ISSUES.md` (toleranser, «Draft 9.2 vs 9.3», uavklarte nummereringsregler).
- Nye formatvalg (f.eks. PDF-bibliotek; endring av den midlertidige OMITTED-regelen i Q-08): DEC i `DECISION_LOG.md` (Teknisk anbefaling) og ev. tillegg til ADR-0007. Produkttolkninger → `OPEN_QUESTIONS.md` og Mars.
- Oppdater [REFERENCE_SCREENPLAY](references/REFERENCE_SCREENPLAY.md) når gyldne verdier er bekreftet.

## Eksterne kilder
Ingen ekstern skill dekker manusformat (`docs/references/technical/SKILLS_ASSESSMENT.md`). Fountain-syntaksen er beskrevet på https://fountain.io/syntax – les kilden direkte ved implementering; [SCREENPLAY_FORMAT](references/SCREENPLAY_FORMAT.md) har bare en omformulert oversikt.
