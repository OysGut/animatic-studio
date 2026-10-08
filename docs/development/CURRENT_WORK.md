# Pågående arbeid

Oppdatert: 2026-10-08 (økt 2)

## Nå: M1 Skjelett og kjerne – kode ferdig, venter på Lovable
- [x] Lovable Cloud aktivert (Mars) og første synk OK; `docs/`/`.claude/` overlevde (KI-07 lukket)
- [x] Domenekjerne `src/core` med kommandoer, invers, invarianter, visninger, fortellingstid, endringssett
- [x] 35 Vitest-tester inkl. egenskapsbaserte invarianttester (INV-01/02/03/04/07/10/13/14, C1)
- [x] Migrasjon `db/migrations/0001_core.sql` + 15 databasetester mot lokal Postgres
- [x] Serverfunksjon `runCommand` (DEC-0022), idempotente nye forsøk
- [x] Innlogging, prosjektliste, prosjektoversikt, invitasjon – visuell QA med skjermbilder
- [ ] **Mars:** Commit + Push, deretter synkmeldingen for `0001_core.sql` i Lovable (LOVABLE_SYNC.md B)
- [ ] **Mars:** Logg inn i Lovable-forhåndsvisningen, opprett prosjektet «Jula på Dovre», si fra om noe ser rart ut
- [ ] Claude: når 0001 er kjørt – bytt til typet Supabase-klient (KI-14), verifiser auth-innstillinger (KI-15)

## Neste: M2 Manus og oversikt
1. Manusimport fra referansemanuset: PDF (pdf.js, posisjonsbasert) og DOCX – gyldne tester lokalt mot `../Manus/`, anonymiserte utdrag i `tests/fixtures/screenplay/`.
2. Kommando `ImportScreenplay` (mange scener i én transaksjon), `SplitScene`/`MergeScenes`.
3. Manusvisning med originaltro paginering (Courier Prime-metrikk verifiseres, KI-08), dra-og-slipp = `MoveOccurrence`.
4. Angre/gjør om per bruker i UI, sanntidsoppdatering mellom medlemmer, profilnavn (KI-13).
5. Manuseksport (DOCX/PDF) med valg av nummerering.
Akseptanse M2: referansemanuset importeres med 96 nummererte scener + unummererte, uten oppdiktede scener; fase 2-P0-krav har tester.
