# SB-7 – AI fra storyboardpanelet

## Status

Delvis implementert. SB-5-rettingen er testet. SB-7 skal **ikke** regnes som ferdig: punktene under «Gjenstår» er åpne i roadmap.md. Ingen publisering, Cloud-endring eller betalte leverandørkall er utført. Ingen migrasjon er skrevet; 0106 er fortsatt ledig.

## Bygget

- `planSceneSetup` overfører bare ressurslag og relevante foreldregrupper. Form, tekst, pil, lapp og kameramerke blir ikke synlige sceneobjekter. Kameramerket gir fortsatt kamerautgangspunkt. Eksisterende scene bevares.
- Panelets KI-flate har automatisk utgangspunkt med overstyring, stil, 1–4 varianter, godkjente stilforbilder med modellgrense og valg av visuelle lapper.
- Kamerainstruksjoner, piler, tekst og notater inngår som tekstlige instrukser, ikke tegninger som skal inn i resultatet.
- Serveren leser autorisert prosjekt, kontrollerer panelrevisjon og modellinnstillinger og bygger forespørselen selv. Egne tilkoblede leverandørnøkler brukes via de eksisterende kjørerne.
- Manglende karakterfaktaark studeres og lagres før bildekallet; estimatet viser studiekostnaden. Faktaarkets revisjon og SHA-256 følger bildesporet.
- Kostnadsanslaget bindes til beregnet innhold, referanser, karakterrevisjoner, modeller, antall og pris. Endringer krever nytt anslag før betaling.
- Bildekandidater bruker ordinære ressursversjoner og skjulte bildelag. Dette ble valgt fremfor ny panelrevisjon fordi originalens lag og instruksjoner da bevares. Synlighet krever en eksplisitt vanlig lagkommando.
- Hvert vellykket bilde får jobbkvittering og serverlagring før neste betalte bildekall. Kandidatlisten leser også lagrede lag etter remontering. Samlet gjenoppretting fra kvitteringen er ennå ikke bygget.
- Jobbsporet inneholder panel/revisjon, ressursversjoner, faktaark/revisjon/digest, modell og handling. SB-7-jobber bruker `[storyboard]`, ikke prompttekst, og lagrer ikke rå leverandørfeil som kan gjenta prompten.
- Dekning/mellompaneler/beskrivelse og ren strek har forespørsler gjennom samme kostnadsport. Tekst krever separat aksept; beskrivelsen lagres i panelfeltene og brukes av galleriets skjermleseretikett.
- Nye kandidater bruker felles resultatfremheving og Thumbnail.

## Gjenstår – ikke verifisert/ferdig

1. Bildeformat: maskens forhold er med i tekst og spor, men bildekjøreren sender nærmeste av fire standardforhold. 9:16 og kinoformater blir ikke nøyaktige bildefiler. Modellspesifikk native maske-/skissestyring er ikke implementert; skisse støttes kun som ordinær bildereferanse.
2. Komposisjon: plassering/størrelse/rekkefølge og ressursbilder følger forespørselen, men komposisjonen rasteriseres ikke med gruppe-transformasjoner og kamerautsnitt. Dette oppfyller ikke hele komposisjonskravet.
3. Skissevalg kan bruke eksisterende bildeversjoner; direkte C-1/mobil-QR-inntak er ikke koblet inn.
4. Betalt bilde-E2E er ikke verifisert med falsk bildekjører. Bare kjerne- og kostnads-/tekstflyten har falsk-leverandørtester. Ingen ekte leverandør er kalt.
5. Serverlagrede kandidatkommandoer må knyttes til eksisterende serverhistorikkadopsjon for samlet lokal angring. Jobbkvittering finnes, men gjenopprettingshandling ved mislykket kandidattilknytning mangler.
6. Tilleggsforslag må bevare jobbtilknytning ved aksept, bruke fullt scenemanus for dekning og produsere konkret kamerageometri i stedet for dagens standardkameramerke.
7. Nettlesertesten brukte syntetisk innlogging/prosjekt og falske svar. Kostnadsbekreftelse og separat aksept ble observert på nb/en. Oppstart ga én kontekstfeil på nb og en hydreringsfeil på en under testens tidlige historienavigasjon; dette er ikke en feilfri autentisert Cloud-E2E-verifisering.

## Kontroller

- Full Vitest: **2928 bestått, 0 feilet, 10 hoppet over**; 367 beståtte testfiler, 2 hoppet over. Siste komplette kjøring: 24.10.2026 03:14 UTC.
- Lokale DB-tester: **228 bestått, 0 feilet**, inklusive alle SECURITY DEFINER `search_path=''`. Ingen migrasjoner kjørt i Cloud.
- Målrettet SB-5/SB-7/SB-3: **18 bestått**. Nye tester dekker automatisk utgangspunkt, visuelle lapper, instruksjoner, skjult kandidat/angre, referansegrense, ønsket maskeforhold, falsk tekstleverandør og eksplisitt kostnads-/resultatbekreftelse på nb/en.
- Automatisk forhåndsvisningskontroll: **build OK** etter siste kodeendringer. Ingen manuell bygging/typekontroll kjørt.
- `scripts/i18n/check.mjs`: **0 tekster uten engelsk i 0 filer**. Alle nye SB-7-nøkler lagt inn på nb/en/fr/es/de/it/pt-BR/ru/ja/ko; de åtte oversettelsene utenom nb/en er maskinmerket for gjennomlesing. en-XA regenereres av inventaret.
- `check_kb.py` kunne ikke kjøres fordi testmiljøet mangler Python-modulen `yaml`; ingen dokumentkontroll hevdes grønn.

## Endrede filer

- `src/core/storyboard/scene-setup.ts`, `src/core/storyboard/ai.ts`, `src/core/generation/providers.ts`
- `src/adapters/ai/storyboard.functions.ts`, `src/adapters/ai/image-run.server.ts`, `src/adapters/ai/text-run.server.ts`, `src/adapters/storage/storyboard-result.server.ts`
- `src/app/storyboard/PanelAi.tsx`, `src/app/storyboard/PanelEditor.tsx`, `src/app/storyboard/StoryboardWorkspace.tsx`, `src/app/storyboard/AGENTS.md`
- `tests/unit/sb5-scene-setup.test.ts`, `tests/unit/sb7-storyboard-ai.test.ts`, `tests/unit/sb7-panel-ai-ui.test.tsx`, `tests/unit/sb3-panel-editor-ui.test.tsx`
- `src/core/i18n/authored.json`, `src/core/i18n/locales/{nb,en,en-XA,fr,es,de,it,pt-BR,ru,ja,ko}.json`, `src/core/i18n/runtime.gen.json` og genererte i18n-inventarfiler
- `roadmap.md`, `docs/development/SB7_REPORT.md`