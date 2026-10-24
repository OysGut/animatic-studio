# SB-8 – Tegning i appen

## Status

Tegnelag, verktøy og mobilside er implementert. Lokal migrasjon **0106_sb8_sketch.sql** er skrevet, men ikke kjørt i Cloud. Ingen publisering og ingen betalte KI-kall. Fasen er ikke endelig produksjonsverifisert: ekte iPad/Pencil og QR-lagring i Cloud gjenstår.

## Implementert

- Bare storyboardkomposisjoner kan ha `sketch`. Strøk lagres som delta-kodede koordinater, trykk, tilt og tid; hastighet kan utledes. Tak: 524 288 byte, 8 192 punkter per strøk, 1 024 strøk per lag.
- Blyant/pensel, tykkelse/opasitet/utjevning/trykkurve, område- og strøkviskelær, sammenhengende fyll, rettlinje/Shift og rektangel/ellipse. Rettlinjeverktøyet er linjalhjelpen; det er ikke en separat roterbar linjal.
- Grov- og rentegningslag, prosjektpalett, lysbord og forrige/neste panel med justerbar opasitet. Ressursbilder lastes som signerte bilder. Vend, zoom, panorering og rotasjon påvirker bare visningen.
- Koalesserte Pointer Events og rAF; bare én skrivekommando per penneløft. Avbryt avbryter strøket. Pennens viskelærknapp støttes, og penn-dobbeltklikk bytter verktøy dersom nettleseren sender en pennhendelse. Apple Pencils systemgest er ikke dokumentert som tilgjengelig i alle nettlesere.
- PNG med alfa og felles compositor i eksisterende storyboardeksporter. Eksplisitt skisseeksport oppretter vanlig bildeversjon til SB-7; ikke automatisk KI-kall.
- QR åpner `/m/$token` med samme verktøy. 256-bit token lagres bare som SHA-256; 30 minutter, 1 000 endringer og maksimalt fem aktive sesjoner per oppretter. Ingen direkte klientrettigheter til sesjonstabellen. Vindus-ID er eksisterende **V-008** for mobilruten; tegneflaten er del av **V-167**.
- Tokenet sjekker prosjekt, panel, tegnelag, rolle, låsing, godkjenning, utløp og tilbakekalling. Kun tegnelagets sketch-felt skrives via vanlig kommando/apply_changes. Revisjonskontroll stopper utdaterte samtidige lagringer. Mobilangring bevarer lokale strøk før/etter og sender differansen; historikken i mobilvinduet varer til siden lukkes/lastes på nytt.
- Sikkerhetskopiering/gjenoppretting inkluderer strøk med remappede lag-ID-er.

## Verifikasjon

- Full Vitest kjøres på nytt etter siste endring; resultat oppdateres nedenfor.
- Lokal DB-suite: **230 bestått, 0 feilet**, inkludert ekte capability-lagring og avvisning av utdaterte revisjoner, utløp, revokering, feil panel og direkte authenticated-lesing.
- Visuell suite: **20 bestått, 0 feilet**, nb/en, desktop 1280 × 1800 og mobil 390 × 844. Ett penneløft lagrer ett strøk, raster har synlige piksler, visningstransformer skriver ikke, ingen vannrett side-overflyt. Mobilside med falske serverfunksjoner tester lagring, angre, gjør om og fyll. Skjermbilder inspisert; mobilbredden bruker nå hele tegneleren, ikke ressurslisten.
- Språk: authored nb/en og alle registrerte oversettelser. fr/es/ru/ja/pt-BR/de/it/ko er maskinoversatt og merket for gjennomlesing. Inventaret regenerert.
- Automatisk typekontroll kontrolleres i preview-loggen; ikke separat manuelt bygget.

## Gjenstående verifikasjon / begrensninger

1. Claude må kjøre 0106 i Cloud før ekte QR-flyt kan kontrolleres mot prosjektdata. Lokal DB og mock-nettleser er ikke Cloud-E2E.
2. Fysisk iPad/Apple Pencil mangler i testmiljøet; trykk/tilt, håndflate, system-dobbelttrykk og ytelse må kontrolleres der.
3. Mobilhistorikken kan ikke gjenopptas etter sideoppfriskning; ordinær prosjektlogg inneholder likevel de lagrede kommandoene.
4. Store fyll rasteriseres synkront og bør ytelsesmåles på iPad. Skriving blokkeres mens mobillagring pågår.

## Endrede filer

- `roadmap.md`, `docs/development/SB8_REPORT.md`: status og rapport.
- `src/core/storyboard/sketch.ts`, `src/core/storyboard/index.ts`, `src/core/storyboard/ai.ts`: strøk, avgrensning og skissevalg.
- `src/core/model.ts`, `src/core/commands/types.ts`, `src/core/commands/apply.ts`: tegnelag og reversible oppdateringer.
- `src/core/composition/fields.ts`, `src/core/composition/index.ts`, `src/core/composition/render.ts`, `src/core/invariants.ts`, `src/core/patch.ts`: validering, rendering og lagring.
- `src/engine/compositor/sketch.ts`, `src/engine/compositor/canvas.ts`: felles rasterisering med isolert viskelær.
- `src/app/storyboard/SketchCanvas.tsx`, `src/app/storyboard/PanelDrawing.tsx`, `src/app/storyboard/PanelEditor.tsx`, `src/app/storyboard/PanelAi.tsx`, `src/app/storyboard/AGENTS.md`: brukerflate, integrasjon og arkitekturregel.
- `src/adapters/mobile/sketch.functions.ts`, `src/app/mobile/MobileSketch.tsx`, `src/routes/m.$token.tsx`: QR- og mobilflyt.
- `db/migrations/0106_sb8_sketch.sql`, `src/adapters/storage/project-rows.ts`, `src/adapters/storage/commands.functions.ts`: skjema, capabilities og versjonsport.
- `src/core/i18n/authored.json`, `src/core/i18n/runtime.gen.json`, `src/core/i18n/locales/nb.json`, `en.json`, `en-XA.json`, `fr.json`, `es.json`, `ru.json`, `ja.json`, `pt-BR.json`, `de.json`, `it.json`, `ko.json`: alle språk.
- `scripts/i18n/candidates.v1.json`, `scripts/i18n/references.v1.json`, `scripts/i18n/inventory-report.json`: regenerert inventar.
- `tests/unit/sb8-sketch.test.ts`, `tests/db/run-db-tests.ts`, `tests/visual/sb8-drawing.mjs`: kjerne/backup, database og visuelle tester.

## Sluttkontroll

Avventer siste fullkjøring nedenfor; ingen migrasjon er kjørt i Cloud av Lovable.