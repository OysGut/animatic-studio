# PTG7 – Nuke og Fusion (B-102)

## Leveranse
- Knappen «Nuke og Fusion» ligger i «Til produksjonen». Eksporten reserverer versjoner gjennom eksisterende eksportlogg og fullfører reservasjonen etter ZIP-skriving.
- Én skuddmappe med PTG-navn og én `.nk` og `.comp` per skudd. Mediene strømmes gjennom eksisterende `zip.ts`/ZIP64. Mediestiene i skuddfilene er `../media/...`; hele pakken må pakkes ut. Ved behov settes programmenes arbeidsmappe til skuddmappen.
- Nuke: Read, klassisk Card2, Camera2, Scene, ScanlineRender. Fusion: Loader, ImagePlane3D, Camera3D, Merge3D, Renderer3D.
- Geometri har millimeter som verdensenhet, Y opp og kamera mot negativ Z. Plater sorteres etter høyde og deretter lagrekkefølge. Kamerapanorering, høyde, rull og synsfelt kommer fra CameraTrack; alle tidslinjebilder får kurveverdier. Toere holder foregående eksponering.
- Fokalverdi i Nuke avledes fra modellens synsfelt og avstanden til referanseplaten, slik at også kalibrert synsfelt og begge kameramoduser beholdes. Fusion skriver horisontal AoV direkte.
- Uten gyldig rigg skrives 2D Transform og Merge. Skuddene listes eksplisitt i LESMEG på nb og en. Ingen AI eller endringer av aktiv take/scenemateriale.

## Verifisering
- Ny `tests/unit/ptg7-compositing.test.ts`: **6 bestått, 0 feilet**. Konkret platehøyde/rekkefølge, relative stier, modell mot serialiserte kameraposisjoner og synsfelt per bilde i begge moduser (0,1 mm / 0,01°), toere, 2D-reserve og gyldne filer.
- `.nk` og `.comp` parses for balanserte blokker, med streng-/escape-/kommentarhåndtering; negativ prøve med ekstra sluttklamme avvises. Dette er syntakskontroll, ikke en Nuke- eller Fusion-tolk.
- Ny `tests/visual/ptg7-compositing.mjs`: **nb 17/17**, deretter **UI_LANG=en 17/17**. Eksportdialogen brukes med faste mockede kontodata; ZIP lastes ned og leses, PTG-versjoner økes, begge formater finnes, mediestier leses tilbake til filene i pakken, LESMEG er tospråklig. Skjermbilder på begge språk kontrollert. Ingen kjørefeil. Første nb-forsøk ble avbrutt under sidens oppstart; gjentak etter oppstart bestod.
- Full Vitest: **2382 bestått, 0 feilet, 10 eksisterende hoppet over**, 294 testfiler bestått.
- Automatisk type-/byggkontroll: **build OK**. Ingen manuell tsc/build kjørt.
- i18n: **0 tekster uten engelsk**, katalog- og releasekontroll grønn. Tre nye nøkler på alle registrerte språk; fr, es, ru, ja, pt-BR, de, it og ko merket `review: machine` med engelsk kildehash. nb/en skrevet direkte; en-XA generert.

## Avvik og begrensninger
- **Card2 i stedet for Card3D:** Card2 er Nukes klassiske 3D-geometri (Card), som kan mates til Scene/ScanlineRender. Card3D er en annen, 2D-projeksjonsorientert node og ikke en direkte erstatning i dette grafoppsettet. Dette er opplyst i LESMEG; ingen forsøk på å skjule avviket.
- **Ekte import er ikke verifisert.** Nuke/Fusion er ikke tilgjengelige her. Nøyaktig tolkning av knott-/inputnavn, perspektiv, rendererkamera og relative stier må kontrolleres i målprogrammene før produksjon. TODO.md angir kontrollen. Resolve kan kreve MediaIn/MediaOut fremfor Loader.
- Eksporten gjenskaper filbaserte, synlige lag og transformasjoner; tekst/fargeflater/grupper uten fil blir ikke opprettet som selvstendig plate. Masker, effekter og animasjonsstyrte bildeskifter er ikke gjenskapt av denne første nodeeksporten. Eventuelle skiftefiler følger med i pakken. Dette er ikke en full compositor-rundtur.
- Innlogget pakketest bruker fast mock, ikke en ekte Cloud-konto. Ingen databaseendringer eller migrasjoner. Ingen publisering, sammenslåing eller andre Git-operasjoner utført.
- Språk- og kontofiler som Øystein har sperret frem til sammenslåing er urørt. Det midlertidige unntaket i side-effect-imports-testen er beholdt.

## Endrede filer
- `src/core/interchange/compositing.ts` – ren node- og kurveserialisering.
- `src/engine/export/compositing.ts` – strømmet ZIP med medier og LESMEG.
- `src/app/assembly/ShotlistExport.tsx` – eksportknapp og eksisterende reservasjonsflyt.
- `tests/unit/ptg7-compositing.test.ts` – gyldne modell-/syntakstester.
- `tests/fixtures/ptg7/model.ts`, `TEST_SC001_SH001_v003.nk`, `TEST_SC001_SH001_v003.comp` – fast eksempelmodell og genererte eksempeloppsett.
- `tests/visual/ptg7-compositing.mjs` – nb/en-pakkeregresjon.
- `src/core/i18n/authored.json`, `runtime.gen.json`, `locales/{nb,en,en-XA,fr,es,ru,ja,pt-BR,de,it,ko}.json` – tre nøkler og genererte kataloger.
- `scripts/i18n/references.v1.json`, `candidates.v1.json`, `inventory-report.json` – mekanisk oppdatert inventar etter nye imports/kall.
- `AGENTS.md` – regel om plasseringen av serialisering og pakkestrømming.
- `TODO.md`, `roadmap.md`, `docs/development/PTG7_REPORT.md` – kontrollpunkt og rapport.

## Åpne spørsmål
Ingen nødvendige avklaringer for videre kodearbeid; ekte programimport står åpen og må utføres av Claude/Øystein med målprogrammene.