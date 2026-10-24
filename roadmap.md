# Veikart

## SB-6 – Utskrift, pitch og skuddliste (pågår)
- [ ] Nye kort i eksisterende ExportAnimaticDialog, felles bildekildevalg
- [ ] PDF 3/6/9, pitch, fem papirformater, feltvalg, topp/bunntekst, Noto/RTL
- [ ] CSV med BOM og XLSX med typede kolonner, én rad per panel
- [ ] Tegnelag og valg av note/arrow/camera_mark
- [ ] Bitvis eksport med fremdrift/avbryt, 500-paneltest, visuelt nb/en desktop/mobil
- [ ] Full Vitest/DB/i18n og rapport SB6_REPORT.md; ikke publiser

## SB-8 – Tegning i appen (pågår)
- [x] Storyboard-only sketch-lag, delta-komprimerte vektorstrøk, trykk/tilt/tid og størrelsesvalidering
- [x] Blyant/pensel, område-/strøkviskelær, sammenhengende fyll, linje/Shift/figurer, prosjektpalett og strøkvis angre
- [x] Grov/rentegningslag, lysbord/løk med opasitet, vend/zoom/pan/rotasjon kun i visningen
- [x] Pointer Events, koalesserte hendelser, rAF og avvisning av berøring under aktiv penn
- [x] Kortlivet panelavgrenset mobiltegning via QR, lokal migrasjon 0106; DB-utløp/revokering/scope/revisjonsvern testet
- [x] Felles rasterisering/PNG-alfa og eksplisitt PNG-versjon som skisse til SB-7
- [x] Kjerne/backup/DB/visuelt nb/en desktop/mobil, full Vitest 0 feil og rapport SB8_REPORT.md
- [ ] Ekte iPad/Apple Pencil: håndflate, dobbelttrykk og ytelse må verifiseres på fysisk enhet; nettlesertesten har ikke slik maskinvare
- [ ] Ekte QR-flyt med lagring som leses tilbake i et prosjekt: venter på at Claude kjører 0106 i Cloud; ikke erstattet av mock-test

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

## SB-7 – AI fra storyboardpanelet (bygget og lokalt testet)
- [x] Restleveranse 24.10: faktisk maskeformat/native kontroller, rasterisert layout og direkte sketch/QR, falsk bilde-E2E, DV5/gjenoppretting, forslagsspor/kamerageometri, feilfri nb/en-oppstart og check_kb; full Vitest 2950/0/10, DB 230/0, i18n/check_kb grønne; ingen ekte leverandør eller autentisert Cloud-E2E hevdes
- [x] SB-5-retting: bare ressurslag og deres grupper overføres; test former/tekst
- [x] Utgangspunkt komposisjon/skisse/manus, instruksjoner som tekst, faktaark og valgte stilforbilder (kjerne og brukerflate; ikke ekte leverandørverifisert)
- [x] Varianter 1–4, stil, maskens format og modellkapabiliteter
- [x] Kostnadsport og egne nøkler; anslag bindes til innhold/pris. Kandidater lagres som skjulte lag, med resultatkvittering og spor uten promptlogg
- [x] Dekning, mellompaneler, ren strek og beskrivelse/alt-tekst med bekreftelse
- [x] Falsk leverandør for beskrivelse/kostnadsport og visuelt nb/en; full Vitest 2928/0/10 og DB 228/0
- [x] Rapport docs/development/SB7_REPORT.md; ingen publisering
- [x] Faktisk maskeforhold via native dimensjoner eller merket ikke-destruktiv PNG-tilpasning; native maske der støttet, skisse via bilde-til-bilde (falskt nettverk testet)
- [x] Mobil-QR/C-1 direkte til skissevalget; rasterisert komposisjonsgrunnlag med grupper og kamerautsnitt
- [x] Leverandøruavhengig bilde-E2E med falsk bildekjører, gjenoppretting fra kvitteringer og samlet angring av serverlagrede kandidater
- [x] Tilleggsforslag med varig jobbtilknytning, bekreftet kamerageometri og fullt scenemanus for dekning
