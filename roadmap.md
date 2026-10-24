# Veikart

## C-4 – Boords-kobling (API) (bygget, ikke prøvd mot ekte Boords)
- [x] 0112 (skrevet, ikke kjørt): tilkoblinger per bruker/arbeidsgruppe, kryptert nøkkel + webhook-hemmelighet, kolonnetilgang uten chiffer
- [x] Innstillinger på kontosiden: egen nøkkel, betalt plan, kan/kan ikke, webhook-adresse, fjerning
- [x] Send til Boords fra storyboardet: action/sound/dialogue, panelets rasterisering, manifest-ID + connector_links
- [x] Hent med updated_since (cron + «Hent endringer») og webhook med HMAC, tidsvindu og idempotens
- [x] Endringer blir kandidater; fire C-0-valg; «Bruk innkommende» = angrebar kommando; konflikt når begge sider er endret
- [x] Kommentarer begge veier; SB-10-tilbakemeldinger sendes én gang
- [x] Kø 120/min, 429 + Retry-After, tilbakeoff
- [x] Kapabilitetsmodell + begrensninger
- [x] Tester: 19 enhet, 1 DB, visuell nb/en 16/0; full Vitest 3116/0/10, DB 236/0, test:ssr 8/8
- [ ] Endepunkter, feltnavn og signaturformat bekreftet mot ekte Boords-beta (krever betalt plan)
- [ ] Bilde fra Boords plasseres i panelet (i dag: blir bibliotekbilde ved «Bruk innkommende»)
- [ ] Kommentarer fra Boords vist i SB-10-teamoversikten (i dag: i Boords-vinduet)
- [ ] 0112 kjøres i Cloud (Claude)

## C-2 – Photoshop-plugin (UXP) (bygget, ikke verifisert i Photoshop)
- [x] 0107–0109 låst med MD5; 0109 satt tilbake til Cloud-versjonen, rettingene flyttet til 0111 (ikke kjørt)
- [x] plugins/photoshop: manifest v5, Photoshop 27+, nettverk bare til pentoglass.com, tokens i secureStorage
- [x] Innlogging med PKCE i systemnettleseren (eget skjema ptg-photoshop:// + innliming), enhetsflyt som reserve
- [x] Panel med prosjekt, ressurs, versjon, scener, storyboardpaneler, notater og dokumentstatus
- [x] «Åpne fra Pen to Glass» med SHA-256-kontroll og executeAsModal; kobling til revisjonsgrunnlaget huskes
- [x] «Send tilbake»: PSD med lag/alfa/fargeprofil; kandidatversjon med revisjonsgrunnlag; konflikt med tre valg
- [x] API: nedlasting av versjonsfil og konfliktvalg for plugins (0111), beskrevet i OpenAPI
- [x] Pakking til .ccx, README nb/en, Marketplace-utkast (ikke sendt)
- [x] Tester med falsk Photoshop/UXP (19), DB 235/0, full Vitest grønn, test:ssr 8/8
- [ ] Prøving i ekte Photoshop etter sjekklisten i C2_REPORT.md (Øystein/tester)
- [ ] PSD som egen versjon i prosjektet (krever Øysteins valg; i dag sendes flat PNG når PSD avvises)
- [ ] 0111 i Cloud (Claude)

## C-1 – Universell filvei «Send til …» og returside (bygget i kode; DB, Cloud og nettlesertest gjenstår)
- [x] «Send til …» på ressurs, storyboardpanel, lydklipp og scene, med ærlig beskrivelse av hva mottakeren får
- [x] PSD med lag (navn, synlighet, opasitet, alfa), PNG, SVG (bare ut), WAV/BWF med tidskode/scene/ressurs-ID, OTIO; manifest v1 og ZIP
- [x] QR-kode og lenke for retur; kortlivet token per utsendelse, lagret bare som hash (0110)
- [x] Returside /r/$token (uten konto) og /retur (innlogget, bare ved merket i filen, aldri filnavn)
- [x] Mottak via C-0: kontrollsum, hviteliste/innhold, ny kandidatversjon, konflikt mot revisjonsgrunnlaget; ingenting tas i bruk automatisk
- [x] PSD-retur lagrer originalen uendret og en PNG-forhåndsvisning; panelretur blir skisse for SB-7 (skjult kandidatlag)
- [x] Statusflate i biblioteket, sceneeditoren, lydklippet og storyboardpanelet
- [x] Enhetstester (13) og full Vitest 3074/0/10, tsc 0, i18n alle språk, test:ssr 8/8
- [ ] DB-tester for 0110 (lokal Postgres kunne ikke startes her) og kjøring i Cloud – Claude
- [ ] Nettlesertest tests/visual/c1-handoff.mjs er skrevet, ikke kjørt her (Playwright for Node mangler)

## C-0 – Kjernen for Creative Connectors (bygget i kode; DB og Cloud gjenstår)
- [x] Manifest v1 med validator, rundtur med ukjente felt og hemmelighetssperre
- [x] 0109: connector_sessions/links/transfers/conflicts med RLS, indekser og service-RPC-er (skrevet, ikke kjørt)
- [x] Mottak: reservasjon, biter, SHA-256, hviteliste + innholdssjekk, alltid kandidatversjon
- [x] Konflikter med fire valg uten tap; valg på Konto-siden
- [x] PKCE + enhetsflyt, kortlivede tokens per prosjekt/scope, rotasjon, tilbaketrekking, fartsgrenser og kvote
- [x] API v1 og OpenAPI 3.1; Connector SDK; kapabilitetsmodell; ni skills
- [x] Tester: kjerne, API/SDK mot falsk server, OpenAPI, visuelt Konto nb/en desktop/mobil; full Vitest 3059/0/10
- [ ] DB-test og 0109 i Cloud (Claude)
- [ ] Ende-til-ende mot Cloud med ekte innlogging og lagring
- [ ] Filer over 64 MB (direkte opplasting med signert URL)
- [ ] API for connector_links og notes:write (med første plugin)

## SB-10 – Gjennomgang med kunde og team (bygget i kode; DB og enkelte ende-til-ende-kontroller gjenstår)
- [x] Hashbasert deling med sceneutvalg, revisjonsvalg, utløp, passord og tilbakekalling
- [x] Gjestespiller, nålkommentarer og uavhengig godkjenning; nb/en desktop/mobil 12/0 med falske tjenester
- [x] Teamliste, svar, løsning, oppgavekobling og eksplisitt, angrebar statusadopsjon
- [x] To revisjoner av ett panel: side om side, overlegg/glidebryter og differanse; ren sammenligning merker nye/fjernede paneler
- [x] To delte storyboardutvalg kan velges og sammenlignes i samlet liste med endrede/nye/fjernede paneler
- [x] 0108 og DB-tester skrevet, ikke kjørt; full Vitest 3036/0/10; i18n og check_kb grønt
- [ ] Claude: DB-suite og 0108 i Cloud; faktisk opprettelse/opplasting/finalisering og teamets svar/oppgaveflyt ende-til-ende
- [x] Restriktive insert/update/delete-policyer for ferdige review-filer skrevet i 0108
- [ ] Claude: verifiser filenes uforanderlighet med 0108/DB; ingen storage-policy kjørt her
- [x] Ingen publisering; rapport SB10_REPORT.md med begrensninger

## SB-9 – Kontinuitet og blokking (delvis bygget; se SB9_REPORT.md)
- [x] Lås 0090–0106 med Claudes MD5-er; ingen låst migrasjon endret
- [x] Panel-lokal plantegning, karakterer/kameraer og angrebar blokking
- [x] Kontinuitet i fortellingstid, galleriflagg og begrunnet godkjenning
- [x] Paneloverganger i storyboardfilm/felles kompositor og eksportserialisering
- [ ] Overgangsblanding i gallerikort; felles scenegrunnriss med egen paneltidslinje
- [x] Kjerne/angre/grenser; visuelt nb/en desktop/mobil 10/0; lokal DB 231/0
- [x] Endelig full Vitest 3020/0/10; i18n grønne
- [ ] Separat tsc bekreftes av Claude
- [ ] Cloud 0107 venter på Claude; ekte import i klippeprogrammer ikke verifisert
- [x] Ingen publisering; rapport med begrensninger og endrede filer

## SB-6 – Utskrift, pitch og skuddliste (bygget; separate kontroller gjenstår)
- [x] Nye kort i eksisterende ExportAnimaticDialog, felles bildekildevalg
- [x] PDF 3/6/9, pitch, fem papirformater, feltvalg, topp/bunntekst, Noto/RTL
- [x] CSV med BOM og XLSX med typede kolonner, én rad per panel
- [x] Tegnelag og valg av note/arrow/camera_mark (fire rasterprøver)
- [x] Bitvis eksport med fremdrift/avbryt, faktisk 500-panel-PDF-avbryt, visuelt nb/en desktop/mobil 40/0
- [x] Full Vitest 2987/0/10, i18n/kunnskapskontroll og rapport SB6_REPORT.md; ikke publisert
- [ ] Separat tsc og DB-suite: Claude kjører; Lovable-miljøet forbyr manuelle typekontroller og migrasjoner, og lokal DB mangler skjema

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
