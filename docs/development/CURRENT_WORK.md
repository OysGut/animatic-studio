# Pågående arbeid

Oppdatert: 2026-10-09 (økt 4)

## Nå: Mars' ønsker + notater + M3 del 1 (ressursbibliotek) – ferdig, venter på Mars
- [x] M2 del 2 testet av Mars; migrasjon 0003 kjørt i Lovable
- [x] REQ-0532–0534 (DEC-0029): «Endre rekkefølge og synlighet»-bryter, flyttede scener markert, sammenligning linje for linje
- [x] REQ-0535–0543 (DEC-0031): notater (ord/setning/nål, stempel, sletting med advarsel, vis/skjul, søk, eksport og ny import), søketreff markert, scenelisten følger manuset, valgt scene øverst
- [x] M3 del 1 (DEC-0030): ressursbibliotek med alternative navn, varianter, bildeversjoner, godkjenning, bruk i manus, forslag fra manuset; karakterfilter med alle navn (KI-29)
- [x] Migrasjon 0004 (`0004_library_notes.sql`), DB-tester, kodegjennomgang (9 funn rettet)
- [ ] **Mars:** Commit + Push, deretter synkmeldingen for `0004_library_notes.sql` (LOVABLE_SYNC.md B)
- [ ] **Mars:** Prøv: Ressursbibliotek → «Forslag fra manuset», legg til bilde og godkjenn; Manus → merk ord → «Legg til notat»; søk; eksporter med notater og importer filen igjen i et testprosjekt

## Neste (forslag – M3 del 2: 2D-sceneeditor)
1. Lagbasert 2D-komposisjon per scene med ressurser fra biblioteket (bakgrunn, mellomgrunn, forgrunn, karakterer, objekter).
2. Transformasjoner, keyframes/easing, kamera med blå/rød ramme og Bézier-bane, avspilling i nettleseren.
3. Avklaring Q-03 (hvor mye karakteranimasjon) før animasjonsdelen.
