# Pågående arbeid

Oppdatert: 2026-10-09 (økt 5, DEC-0045)

## Nå: DEC-0045 – lyd over flere scener, lydprofil, varmgult kamerautsnitt, AI-bilder – ferdig, venter på Mars
- [x] Lyd i scenene rundt med «Bruk i scenen» (REQ-0560)
- [x] «Løper videre» over flere scener, varmgult (REQ-0561)
- [x] Lydprofil med volumpunkter som i After Effects (REQ-0562); bølgeformer i sceneeditoren (REQ-0563)
- [x] Aktivt kamerautsnitt varmgult (REQ-0564)
- [x] AI-bilder med Lovable-kreditter: synlig prompt, bekreftelse, grenser, logg (REQ-0565)
- [x] Migrasjon 0010, 264 Vitest, 27 DB-tester, skjermbilder 52–55
- [ ] **Mars:** Commit + Push, lim inn `LOVABLE_SYNC.md` (kjør 0010, slå på Lovable AI)
- [ ] **Mars:** Prøv én AI-generering (dobbeltklikk på et lag → «Generer …»), musikk som løper videre og volumpunkter

## Tidligere (økt 4)

## Nå: Mars' ønsker + notater + M3 del 1 (ressursbibliotek) – ferdig, venter på Mars
- [x] M2 del 2 testet av Mars; migrasjon 0003 kjørt i Lovable
- [x] REQ-0532–0534 (DEC-0029): «Endre rekkefølge og synlighet»-bryter, flyttede scener markert, sammenligning linje for linje
- [x] REQ-0535–0543 (DEC-0031): notater (ord/setning/nål, stempel, sletting med advarsel, vis/skjul, søk, eksport og ny import), søketreff markert, scenelisten følger manuset, valgt scene øverst
- [x] M3 del 1 (DEC-0030): ressursbibliotek med alternative navn, varianter, bildeversjoner, godkjenning, bruk i manus, forslag fra manuset; karakterfilter med alle navn (KI-29)
- [x] Migrasjon 0004 (`0004_library_notes.sql`), DB-tester, kodegjennomgang (9 funn rettet)
- [ ] **Mars:** Commit + Push, deretter synkmeldingen for `0004_library_notes.sql` (`docs/development/LOVABLE_SYNC.md`)
- [ ] **Mars:** Prøv: Ressursbibliotek → «Forslag fra manuset», legg til bilde og godkjenn; Manus → merk ord → «Legg til notat»; søk; eksporter med notater og importer filen igjen i et testprosjekt

## Neste (forslag – M3 del 2: 2D-sceneeditor)
1. Lagbasert 2D-komposisjon per scene med ressurser fra biblioteket (bakgrunn, mellomgrunn, forgrunn, karakterer, objekter).
2. Transformasjoner, keyframes/easing, kamera med blå/rød ramme og Bézier-bane, avspilling i nettleseren.
3. Avklaring Q-03 (hvor mye karakteranimasjon) før animasjonsdelen.
