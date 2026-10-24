# Veikart

## SB-4 (bygget, verifisert)
- [x] Felles posisjon, timing, midlertidig panellyd, galleriscrubbing/avspilling, eksportkilde

## SB-5 – Kobling til sceneeditoren (pågår)
- [x] Referansepanel for storyboard i sceneeditoren: dokk, skjul, forstørr, popup med huska geometri
- [x] Panelet viser bilder, figurer, piler, lapper, reginotater, kamerainstruksjoner, dialog, timing, kommentarer, status
- [x] Valgt panel fremhevet; følger avspillingshodet etter storyboardtiming
- [x] Låst for redigering; «Rediger storyboard» (ny revisjon ved godkjent panel) og «Tilbake til scenen» via felles posisjon
- [x] Vindu-ID i registeret
- [x] «Opprett sceneoppsett fra storyboard»: kopierer ressurslag (ID/versjon, plassering, skala, rotasjon, rekkefølge, bakgrunn, kameramerke som kamerautgangspunkt); piler/lapper/tekst/figurer følger ikke med; aldri overskriving av scene med innhold – «nytt utkast» bevarer eksisterende; forhåndsvisning; én angrebar kommando; valg av panel ved flere
- [x] Storyboardstatus i sceneeditorens topp med de andre fagområdene
- [x] Ingen DB-endring nødvendig (0106 utgår) ved behov (0105 låst); tester kjerne/angre/ikke-overskriving/avspillingsfølging/navigasjon; visuelt nb/en
- [x] Rapport docs/development/SB5_REPORT.md
- [x] SB-5 språkoppfølging 24.10: inventar regenerert/kontrollert, alle registrerte språk 0 feil; full Vitest 2928 bestått, 0 feilet, 10 hoppet over. Rapportens tidligere manglende fullkjøring er dokumentert historisk.

## SB-7 – AI fra storyboardpanelet (pågår)
- [x] SB-5-retting: bare ressurslag og deres grupper overføres; test former/tekst
- [x] Utgangspunkt komposisjon/skisse/manus, instruksjoner som tekst, faktaark og valgte stilforbilder (kjerne og brukerflate; ikke ekte leverandørverifisert)
- [ ] Varianter 1–4, stil, maskens format og modellkapabiliteter
- [x] Kostnadsport og egne nøkler; anslag bindes til innhold/pris. Kandidater lagres som skjulte lag, med resultatkvittering og spor uten promptlogg
- [ ] Dekning, mellompaneler, ren strek og beskrivelse/alt-tekst med bekreftelse
- [x] Falsk leverandør for beskrivelse/kostnadsport og visuelt nb/en; full Vitest 2928/0/10 og DB 228/0
- [x] Rapport docs/development/SB7_REPORT.md; ingen publisering
- [ ] Nøyaktig maskeforhold i bildefilen og modellspesifikk skisse-/maskestyring (dagens bildekjører tilbyr fire standardforhold)
- [ ] Mobil-QR/C-1 direkte til skissevalget; rasterisert komposisjonsgrunnlag med grupper og kamerautsnitt
- [ ] Leverandøruavhengig bilde-E2E med falsk bildekjører, gjenoppretting fra kvitteringer og samlet angring av serverlagrede kandidater
- [ ] Tilleggsforslag med varig jobbtilknytning, bekreftet kamerageometri og fullt scenemanus for dekning
