# SB-7 – AI fra storyboardpanelet

## Status

Restleveransen er implementert og kontrollert med grønn full Vitest, lokale DB-tester, språkkontroll og dokumentkontroll. Ingen publisering, Cloud-endring eller betalte leverandørkall er utført. Denne leveransen krever ingen ny migrasjon; 0106 tilhører SB-8 og er ikke endret.

## Bygget

- `planSceneSetup` overfører bare ressurslag og relevante foreldregrupper. Form, tekst, pil, lapp og kameramerke blir ikke synlige sceneobjekter. Kameramerket gir fortsatt kamerautgangspunkt. Eksisterende scene bevares.
- Panelets KI-flate har automatisk utgangspunkt med overstyring, stil, 1–4 varianter, godkjente stilforbilder med modellgrense og valg av visuelle lapper.
- Kamerainstruksjoner, piler, tekst og notater inngår som tekstlige instrukser, ikke tegninger som skal inn i resultatet.
- Serveren leser autorisert prosjekt, kontrollerer panelrevisjon og modellinnstillinger og bygger forespørselen selv. Egne tilkoblede leverandørnøkler brukes via de eksisterende kjørerne.
- Manglende karakterfaktaark studeres og lagres før bildekallet; estimatet viser studiekostnaden. Faktaarkets revisjon og SHA-256 følger bildesporet.
- Kostnadsanslaget bindes til beregnet innhold, referanser, karakterrevisjoner, modeller, antall og pris. Endringer krever nytt anslag før betaling.
- Bildekandidater bruker ordinære ressursversjoner og skjulte bildelag. Dette ble valgt fremfor ny panelrevisjon fordi originalens lag og instruksjoner da bevares. Synlighet krever en eksplisitt vanlig lagkommando.
- Hvert vellykket bilde får jobbkvittering og serverlagring før neste betalte bildekall. Kandidatlisten leser også lagrede lag etter remontering. Gjenoppretting leser den lagrede jobbkvitteringen uten leverandørkall og adopterer også inverser fra en delvis fullført tilknytning.
- Jobbsporet inneholder panel/revisjon, ressursversjoner, faktaark/revisjon/digest, modell og handling. SB-7-jobber bruker `[storyboard]`, ikke prompttekst, og lagrer ikke rå leverandørfeil som kan gjenta prompten.
- Dekning/mellompaneler/beskrivelse og ren strek har forespørsler gjennom samme kostnadsport. Tekst krever separat aksept; beskrivelsen lagres i panelfeltene og brukes av galleriets skjermleseretikett.
- Nye kandidater bruker felles resultatfremheving og Thumbnail.

## Restleveranse 24.10.2026

1. Maskens faktiske forhold planlegges i kjernen. OpenAI-modeller med native egendefinert størrelse får konkrete dimensjoner; andre får nærmeste støttede forhold. Ved avvik viser flaten merking og eksplisitt aksept lager en separat PNG med transparente kanter. Originalen, jobbkvitteringen og kandidatkilden bevares. Native PNG-maske sendes bare når modellen støtter den og masken har samme dimensjoner som første referanse. Skisse bruker bilde-til-bilde; ingen modell annonserer en separat skisseparameter som adapteren ikke støtter.
2. Strukturreferansen rasteriseres gjennom den felles kompositoren med ressurslag, gruppetransformasjoner og kamerautsnitt. Piler, tekst, lapper, figurer og grupperammer fjernes fra tegnelisten. Skjulte eller tidsinaktive kameragrupper påvirker ikke utsnittet.
3. SB-8-tegnelag kan velges direkte og rasteriseres før kostnadsanslaget. C-1-bildeversjoner kan velges, og mobil-QR bruker eksisterende autorisert prosjektimport og claim/link-livssyklus som skissekilde; kildefilen endres ikke.
4. Falsk bildekjører tester bestilling → anslag → eksplisitt kostnadsbekreftelse → kvittering → skjult kandidat → eksplisitt aksept på nb/en. Native størrelse/maske testes med falskt nettverk. Ingen ekte leverandørkall.
5. Storyboard- og sceneeditorens angrelister er påmeldt DV5. Kandidatens versjon og lag har én historiegruppe. Testen bruker ekte useCommands/adoptServerHistory og kjører begge inverse kommandoer ved ett angresteg. Gjenoppretting fra kvitteringen testes ved delvis lagring og repetisjon uten duplikater.
6. Dekning bruker hele scenemanuset. Aksepterte forslag bevarer jobb-ID/kildepanel og validerer konkret utsnitt, vinkel, brennvidde, tilt og normalisert kameraramme; ugyldig geometri avvises. Beskrivelse/alt-tekst bevarer jobbkobling.
7. Lagret produksjon og storyboardposisjon leses etter montering i stedet for under første rendering. Den gjentatte nb/en-oppstarten og historienavigasjonen gir fire beståtte kontroller uten kjørefeil eller hydreringsfeil. Testen er lagret som tests/visual/sb7-startup.mjs.
8. PyYAML er installert midlertidig uten prosjektavhengighet. check_kb.py er grønn: 925 krav, 12 skills, ingen mandatlinjer uten kravreferanse.

## Verifikasjonsgrenser

- Nettleserkontrollen bruker syntetisk prosjekt/innlogging og falske svar; den er ikke en autentisert Cloud-E2E. Oppstartsbildene viser at modeller ikke er tilkoblet i denne fixture. Modellvalg og hele bildeflyten prøves separat i brukerflatetesten med falsk bildekjører.
- Ekte leverandørers native output, masker og fysisk mobil-QR er ikke prøvd med betalte kall. Ingen slik verifikasjon hevdes.
- Nettlesertestens JS-avhengighet ligger i den midlertidige testharnessen; ingen pakke ble installert i prosjektet. Den lagrede testen kan kjøres i et miljø som allerede har Playwright.

## Kontroller

- Full Vitest etter siste kodeendringer: **2950 bestått, 0 feilet, 10 hoppet over**; **372 beståtte testfiler, 2 hoppet over**, 127,51 sekunder. Kjøring 24.10.2026 kl. 04:44:55 UTC, logg /tmp/sb7-final-green.log. En tidligere fullkjøring hadde én Google-innloggingstest som tidsavbrøt; separat kjøring og siste fullkjøring består uten testendring.
- Lokale DB-tester: **230 bestått, 0 feilet**, inklusive alle SECURITY DEFINER search_path=''; logg /tmp/sb7-release-db.log. Ingen Cloud-migrasjon kjørt.
- Nye målrettede resttester: **15 bestått** i fem testfiler, inklusive virkelig lokal historieadopsjon/angring, delvis kandidatrecovery, native maskepayload, gruppetransformasjoner og falsk bilde-E2E nb/en.
- Automatisk typekontroll/forhåndsvisningskontroll: **build OK** etter siste kodeendringer, sist 04:46:07 UTC; ingen manuell bygging/typekontroll kjørt.
- Språk: **0 tekster uten engelsk i 0 filer**, localeFreshnessErrors() er tom. nb/en er skrevet; fr/es/de/it/pt-BR/ru/ja/ko er maskinmerket for gjennomlesing; en-XA og inventaret er regenerert.
- Nettleseroppstart/navigation: **4 bestått, 0 feilet** på nb/en uten kjørefeil; syntetisk test, ingen autentisert Cloud-E2E påstås.
- check_kb.py: **OK**, 925 krav, 12 skills, 0 mandatlinjer uten kravreferanse. PyYAML ligger bare i /tmp/sb7-python.

## Endrede filer

- `src/core/storyboard/scene-setup.ts`, `src/core/storyboard/ai.ts`, `src/core/generation/providers.ts`
- `src/adapters/ai/storyboard.functions.ts`, `src/adapters/ai/image-run.server.ts`, `src/adapters/ai/text-run.server.ts`, `src/adapters/storage/storyboard-result.server.ts`
- `src/app/storyboard/PanelAi.tsx`, `src/app/storyboard/PanelEditor.tsx`, `src/app/storyboard/StoryboardWorkspace.tsx`, `src/app/storyboard/AGENTS.md`
- `tests/unit/sb5-scene-setup.test.ts`, `tests/unit/sb7-storyboard-ai.test.ts`, `tests/unit/sb7-panel-ai-ui.test.tsx`, `tests/unit/sb3-panel-editor-ui.test.tsx`
- `src/core/i18n/authored.json`, `src/core/i18n/locales/{nb,en,en-XA,fr,es,de,it,pt-BR,ru,ja,ko}.json`, `src/core/i18n/runtime.gen.json` og genererte i18n-inventarfiler
- `roadmap.md`, `docs/development/SB7_REPORT.md`

### Filer endret i restleveransen

- src/core/storyboard/ai.ts, ai-output.ts og ai-proposals.ts; src/core/generation/providers.ts
- src/adapters/ai/storyboard.functions.ts, image-run.server.ts og providers.server.ts; src/adapters/storage/storyboard-result.server.ts
- src/app/storyboard/PanelAi.tsx, ai-images.ts, StoryboardWorkspace.tsx og AGENTS.md
- src/app/project/use-commands.ts og use-production.tsx; src/app/scene-editor/SceneEditorWorkspace.tsx
- tests/unit/sb7-panel-ai-ui.test.tsx, sb7-output-proposals.test.ts, sb7-candidate-recovery.test.ts, sb7-grouped-history.test.tsx og sb7-native-provider.test.ts; tests/visual/sb7-startup.mjs
- src/core/i18n/authored.json, runtime.gen.json, locales/nb.json, en.json, en-XA.json, fr.json, es.json, de.json, it.json, pt-BR.json, ru.json, ja.json og ko.json
- scripts/i18n/candidates.v1.json, references.v1.json og inventory-report.json
- roadmap.md og denne rapporten
