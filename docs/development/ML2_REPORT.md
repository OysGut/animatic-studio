# ML2-rapport (B-049) – omgang ML2a, 20.10.2026

ML2 leveres i omganger, slik Mars bestemte 20.10: **ML2a** (grunnlaget) først, deretter ML2b–ML2f, én eller to arbeidsflater per omgang (skall og konto → manus → sceneeditor → montering og lyd → bibliotek og Asset Studio → kjerne og server).

## Gjort i ML2a
- **Språkvelger fra manifestet.** `LanguageSwitch` viser språkene i `src/core/i18n/manifest.json`. `en-XA` er valgbart bare i utviklings- og testmodus. Hvis `en-XA` er lagret i produksjon, vises engelsk, og `en-XA` lagres aldri på kontoen.
- **Testspråket `en-XA` i hele appen.** `L`, `localized` og `tm` gir pseudotekst bygd fra engelsk, lik inventarets `pseudoText`. `getLanguage()` svarer fortsatt `nb`/`en` (en-XA regnes som engelsk), så eksisterende kode er uendret. `getUiLanguage()` gir det valgte språket.
- **Språkbytte uten remontering.** `LanguageRoot` har ikke lenger `key={lang}`. Sidene og de 12 hurtigbufrede panelene abonnerer med `useLanguage()` og tegnes på nytt med tilstanden urørt. Åpne dialoger, felt med utkast og pågående arbeid beholdes.
- **Ingen språklekkasje ved første tegning.** Serveren tegner fortsatt på norsk (lik tegning). Har brukeren valgt et annet språk, setter et lite skript i `<head>` `lang` og skjuler siden til språket er satt. Det er en sikring på maks 3 s.
- **Stabile feilkoder fra serveren.** `src/core/i18n/server-errors.ts` har koderegisteret, nøklene `server.error.<kode>` med navngitte parametere, `serverError`/`withCode` for ny kode og `serverErrorText` på klienten. Gamle rene norske meldinger kjennes igjen mot malene og får kode, og ellers brukes `tm` som før. Eksisterende `throw new Error(L(...))` er ikke skrevet om, fordi det ville endret ML1-nøklene. Steder med kode tas i ML2f.
- **Broen er uendret.** Ingen tekst er flyttet fra `L`/`localized` i ML2a.

## Dekning og gjenstående bro
| Mål | Verdi |
|---|---|
| Tekstpar i inventaret | 9 964 (ML1-grunnlinjen 9 963 + 1 ny verktøytipstekst) |
| Migrert til `t(key)` | 0 (0 %) – ML2a er grunnlag; flytting skjer i ML2b–ML2f |
| Gjenstående bro (`L`/`localized`/`tm`) | 9 964 par, 100 % |
| Serverfeil med stabil kode | 12 koder i registeret; gamle meldinger gjenkjennes |
| Tapstest mot ML1-grunnlinjen | 9 963/9 963 nøkler og tekster bevart |

## De 266 konfliktene (løsning A, bekreftet av Mars 20.10)
Hvert sted har sin egen nøkkel etter sammenheng, og begge dagens tekster står ordrett. **Ingen tekst er endret og ingen nøkler er slått sammen.** Der en sammenslåing kan være ønsket, fordi bare tegnsetting eller store bokstaver skiller, er gruppen merket «venter på Mars» (27 grupper).

- Samme norske kilde med ulik engelsk: 127 grupper (27 merket «venter på Mars»)
- Plassholderkontrakt: 121
- Dynamiske uttrykk: 18

### Samme norske kilde, ulik engelsk (127)

| # | Norsk kilde | Engelske varianter (antall steder) | Løsning |
|---|---|---|---|
| 1 |  · deaktivert | « · inactive» (1); « · deactivated» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 2 |  (deaktivert) | « (inactive)» (1); « (deactivated)» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 3 | , anslått {value1} | «, estimated {value1}» (3) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 4 | «{name}» | «“{name}”» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 5 | «{text}» | «“{text}”» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 6 | «{value1}» | «“{value1}”» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 7 | {label} · anslått {value2} | «{label} · estimated {value2}» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 8 | 2D-scenen | «the 2D scene» (2); «The 2D scene» (11) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 9 | 2D-scenen (animatic) | «The 2D scene (animatic)» (1); «2D scene (animatic)» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 10 | Alle | «All» (7); «Everyone» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 11 | Ankerpunkt | «Anchor point» (1); «Anchor» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 12 | Anslått: {value1} · {label} | «Estimated: {value1} · {label}» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 13 | Antall | «Number» (1); «Count» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 14 | Avvis | «Dismiss» (2); «Reject» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 15 | Beskrivelse for segment {value1} | «Description for segment {value1}» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 16 | Bilde | «Image» (8); «Picture» (1); «Shot» (4) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 17 | bilder | «frames» (1); «images» (4) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 18 | Bildet kunne ikke lages. | «The image could not be made.» (1); «The image could not be created.» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 19 | Bruk | «Use» (3); «Apply» (4) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 20 | Bruk i scenen | «Use in the scene» (1); «Use in scene» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 21 | Bruk mal «{name}» | «Use template “{name}”» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 22 | Bruk v{number} | «Use v{number}» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 23 | Brukt i økten: {value1} | «Spent this session: {value1}» (1); «Spent in the session: {value1}» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 24 | Databasen er ikke oppdatert for egne AI-leverandører. Kontakt administratoren for å oppdatere Animatic Studio. | «The database is not updated for own AI providers. Contact the administrator to update Animatic Studio.» (1); «The database is not updated for your own AI providers yet. Contact the administrator to update Animatic Studio.» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 25 | Du har ikke tilgang. | «Access denied.» (1); «You do not have access.» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 26 | Dyr | «Animals» (3); «Animal» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 27 | Egen versjon av scenen | «Own version of the scene» (1); «Own copy of the scene» (3) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 28 | Endre hastighetskurve | «Change speed curve» (1); «Change easing curve» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 29 | Endre størrelse | «Resize» (1); «Change size» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 30 | Endre tekst | «Change text» (1); «Edit text» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 31 | endret | «changed» (1); «edited» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 32 | Felles for alle språk | «Shared for all languages» (1); «Shared across all languages» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 33 | Ferdig | «Done» (13); «Finished» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 34 | Filen er laget: | «The file has been created:» (1); «The file is ready:» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 35 | Filmrealistisk | «Film-realistic» (1); «Realistic» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 36 | Fjern betegnelsen «{name}» | «Remove the term “{name}”» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 37 | Forsidebildet | «The cover image» (1); «Cover image» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 38 | Forslag | «Suggestion» (4); «Suggestions» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 39 | Gjelder | «Concerns» (2); «Applies to» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 40 | Godkjenn v{number} av «{name}» | «Approve v{number} of “{name}”» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 41 | Harmonisert | «Harmonized» (4); «Harmonised» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 42 | Hele filmen | «The whole film» (1); «Whole film» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 43 | Henter bildet … | «Fetching the image …» (1); «Loading the image …» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 44 | Henter leverandører … | «Loading providers …» (3); «Fetching providers …» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 45 | Henter prosjektet … | «Fetching the project …» (1); «Loading the project …» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 46 | Henter ressursene … | «Fetching the assets …» (1); «Loading the assets …» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 47 | Henter versjonen … | «Fetching the version …» (1); «Loading the version …» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 48 | Henter økten … | «Loading the session …» (1); «Loading session …» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 49 | I kø | «Queued» (4); «In queue» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 50 | Ingen av prosjektets eiere har koblet til denne leverandøren (AI-leverandører på prosjektlisten). | «None of the project's owners has connected this provider (AI providers on the project list).» (1); «None of the project's owners have connected this provider (AI providers on the project list).» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 51 | Ingen treff. | «No matches.» (1); «No results.» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 52 | Innhold | «Contents» (1); «Content» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 53 | Jevn | «Even» (1); «Linear» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 54 | Jobben startet, men kunne ikke registreres: {message} | «The job started, but could not be registered: {message}» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 55 | kamerautsnitt | «camera shot» (1); «camera shots» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 56 | Koble til | «Link to» (2); «Link» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 57 | Kobling | «Link» (1); «Connection» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 58 | Koblinger | «Links» (3); «Connections» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 59 | Kutt starten av lyden | «Trim the start of the audio» (1); «Cut the start of the audio» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 60 | Lag | «Layers» (5); «Layer» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 61 | Lag filmens visuelle stil | «Create the film's visual style» (1); «Make the film's visual style» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 62 | Laget | «Created» (4); «The layer» (6) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 63 | Laget med profil {name} | «Made with profile {name}» (3) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 64 | Laget med profil {value1} | «Made with profile {value1}» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 65 | Lagre som ny versjon | «Save as new version» (2); «Save as a new version» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 66 | Legg «{name}» i «{name2}» | «Put “{name}” in “{name2}”» (3) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 67 | Legg til {size} noder | «Add {size} nodes» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 68 | Legg til {value1} | «Add {value1}» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 69 | Lyd | «Sound» (13); «Audio» (13) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 70 | lydklipp | «audio clip» (1); «audio clips» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 71 | Lys | «Light» (2); «Lighting» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 72 | Løper videre over flere scener | «Runs on across several scenes» (1); «Continues over several scenes» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 73 | med | «with» (6); «attached» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 74 | Mengde | «Qty» (1); «Quantity» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 75 | Midten | «Centre» (1); «Middle» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 76 | Modell for {value1} | «Model for {value1}» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 77 | Myk kant | «Soft edge» (1); «Feather» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 78 | Ny kvalitetsprofil «{name}» | «New quality profile "{name}"» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 79 | Nytt bilde i «{name}» | «New image in “{name}”» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 80 | Nytt lag «{name}» | «New layer “{name}”» (4) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 81 | Opptak | «Recording» (4); «Recordings» (3) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 82 | Overlegg | «Overlays» (1); «Overlay» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 83 | Passordet må ha minst 8 tegn. | «The password must have at least 8 characters.» (1); «The password must be at least 8 characters.» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 84 | Pause | «Pause» (6); «Paused» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 85 | Profilen er fjernet | «The profile has been removed» (1); «The profile is removed» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 86 | Relasjoner | «Relations» (2); «Relationships» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 87 | replikk | «line» (1); «dialogue» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 88 | Replikk | «Line» (7); «Dialogue» (4); «Dialogue line» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 89 | Replikken finnes ikke | «The line was not found» (1); «The line does not exist» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 90 | Replikker | «Lines» (1); «Dialogue» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 91 | Ressursen finnes ikke | «The asset does not exist» (2); «The asset was not found» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 92 | Samtale med {name} | «Conversation with {name}» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 93 | Scene {value1} | «Scene {value1}» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 94 | Scenenummer | «Scene numbering» (1); «Scene number» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 95 | Slett for godt | «Delete permanently» (1); «Delete for good» (3) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 96 | Slett v{number} | «Delete v{number}» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 97 | Spinoff | «Spinoff» (1); «Spin-off» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 98 | Spor | «Trace» (1); «Track» (4); «Tracks» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 99 | standard | «standard» (1); «default» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 100 | Standard | «Default» (6); «Standard» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 101 | sted | «location» (1); «setting» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 102 | Sted | «Location» (4); «Place» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 103 | Steder | «Locations» (2); «Places» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 104 | Svaret fra AI kunne ikke leses. Prøv igjen. | «The reply from the AI could not be read. Try again.» (1); «The AI reply could not be read. Try again.» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 105 | Ta «{name}» ut av gruppen | «Take “{name}” out of the group» (3) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 106 | Tegn | «Characters» (1); «Draw» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 107 | Tilbakefør | «Bring back» (1); «Carry back» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 108 | Treff | «Hit» (1); «Results» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 109 | Trekk tilbake | «Withdraw» (1); «Revoke» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 110 | Type | «Type» (16); «Kind» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 111 | Type kobling | «Link type» (1); «Connection type» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 112 | Ugyldig kobling | «Invalid link» (3); «Invalid connection» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 113 | ukjent pris | «unknown price» (5); «price unknown» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 114 | Uten navn | «No name» (2); «Without name» (4); «Untitled» (10) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 115 | uten nummer | «unnumbered» (3); «no number» (2) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 116 | Uten overskrift | «Untitled» (1); «No heading» (1); «Without heading» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 117 | Utsnitt | «Crop» (1); «Shot» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 118 | Valgt | «Chosen» (1); «Selected» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 119 | Velg en scene | «Choose a scene» (1); «Select a scene» (4) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 120 | Velg scene … | «Choose scene …» (1); «Choose a scene …» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 121 | Vis | «View» (2); «Show» (7) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 122 | Vis {value1} | «Show {value1}» (2) | Egne nøkler. Bare tegnsetting/store bokstaver skiller – sammenslåing **venter på Mars** |
| 123 | Vis i manuset | «Show in script» (1); «Show in the script» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 124 | Vis og velg … | «Show and choose …» (1); «View and choose …» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 125 | Zoom i forhåndsvisningen | «Zoom in the preview» (1); «Preview zoom» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 126 | Åpne i monteringen | «Open in the assembly» (1); «Open in assembly» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |
| 127 | Åpne i sceneeditoren | «Open in scene editor» (2); «Open in the scene editor» (1) | Egne nøkler etter sammenheng; tekstene beholdt ordrett |

### Plassholderkontrakt (121)

Norsk og engelsk bruker ulike uttrykk eller ulikt antall innsatte verdier. Hvert sted har egen nøkkel med kildeuttrykket ordrett (`executable: false`) og konverteres for hånd i sin arbeidsflate (ML2b–ML2f).

| Fil | Steder |
|---|---|
| `src/app/assembly/ExportAnimaticDialog.tsx` | 14 |
| `src/app/assembly/LanguageVersionDialog.tsx` | 7 |
| `src/app/script/TranslationImportDialog.tsx` | 4 |
| `src/app/library/ContextLinkSuggestions.tsx` | 3 |
| `src/app/library/GenerateImagePanel.tsx` | 3 |
| `src/app/library/ImageAiPanels.tsx` | 3 |
| `src/app/scene-editor/LayerInspector.tsx` | 3 |
| `src/app/scene-editor/SceneAssetsPanel.tsx` | 3 |
| `src/core/generation/brief.ts` | 3 |
| `src/core/screenplay/restore-version.ts` | 3 |
| `src/app/ai/ProvidersDialog.tsx` | 2 |
| `src/app/assembly/AiDialogueDialog.tsx` | 2 |
| `src/app/assembly/FilmTimeline.tsx` | 2 |
| `src/app/assembly/SceneVideoSection.tsx` | 2 |
| `src/app/library/AssetZip.tsx` | 2 |
| `src/app/library/DialogueBatchPanel.tsx` | 2 |
| `src/app/library/TrashDialog.tsx` | 2 |
| `src/app/scene-editor/LayerImageDialog.tsx` | 2 |
| `src/app/scene-editor/SceneToVideoDialog.tsx` | 2 |
| `src/app/scene-editor/animation/CharacterPanel.tsx` | 2 |
| `src/app/script/SceneNavigator.tsx` | 2 |
| `src/adapters/account/lock.server.ts` | 1 |
| `src/adapters/ai/video.functions.ts` | 1 |
| `src/app/ai/AiPanel.tsx` | 1 |
| `src/app/ai/TraceDetails.tsx` | 1 |
| `src/app/assembly/AiUpdateSection.tsx` | 1 |
| `src/app/assembly/AudioTracks.tsx` | 1 |
| `src/app/assembly/BatchVideoDialog.tsx` | 1 |
| `src/app/assembly/GenerateSceneDialog.tsx` | 1 |
| `src/app/assembly/LongFilmImportDialog.tsx` | 1 |
| `src/app/assembly/MaterialUpdateSection.tsx` | 1 |
| `src/app/assembly/ScriptChanges.tsx` | 1 |
| `src/app/audio/AudioCompositionEditor.tsx` | 1 |
| `src/app/audio/LineWordsPanel.tsx` | 1 |
| `src/app/global/SaveToGlobalButton.tsx` | 1 |
| `src/app/library/AssetDetail.tsx` | 1 |
| `src/app/library/AssetWorklistDialog.tsx` | 1 |
| `src/app/library/ContextNamesSection.tsx` | 1 |
| `src/app/library/CutoutDialog.tsx` | 1 |
| `src/app/library/GenerateSoundPanel.tsx` | 1 |
| `src/app/library/HarmonizeBatchPanel.tsx` | 1 |
| `src/app/library/ImageLightbox.tsx` | 1 |
| `src/app/library/ImagePartsPanel.tsx` | 1 |
| `src/app/library/ReuploadDialog.tsx` | 1 |
| `src/app/library/StyleProfilesPanel.tsx` | 1 |
| `src/app/library/asset-audio.ts` | 1 |
| `src/app/library/asset-images.ts` | 1 |
| `src/app/projects/BackupDialogs.tsx` | 1 |
| `src/app/projects/DurationOverview.tsx` | 1 |
| `src/app/projects/PromotionDialog.tsx` | 1 |
| `src/app/projects/QualityProfilesSection.tsx` | 1 |
| `src/app/release/PosterInspector.tsx` | 1 |
| `src/app/scene-editor/AddElementDialog.tsx` | 1 |
| `src/app/scene-editor/CarryOverDialog.tsx` | 1 |
| `src/app/scene-editor/GenerateDialogue.tsx` | 1 |
| `src/app/scene-editor/LayerSwaps.tsx` | 1 |
| `src/app/scene-editor/NearbyAudioPanel.tsx` | 1 |
| `src/app/scene-editor/Stage.tsx` | 1 |
| `src/app/scene-editor/TextInspector.tsx` | 1 |
| `src/app/script/LineLinkReview.tsx` | 1 |
| `src/app/script/ScriptPageView.tsx` | 1 |
| `src/app/share/FilmShareDialog.tsx` | 1 |
| `src/core/assembly/compare.ts` | 1 |
| `src/core/assembly/discrepancy.ts` | 1 |
| `src/core/assembly/edit.ts` | 1 |
| `src/core/continuity/analysis.ts` | 1 |
| `src/core/export-records.ts` | 1 |
| `src/core/generation/providers.ts` | 1 |
| `src/core/generation/quality.ts` | 1 |
| `src/core/generation/video.ts` | 1 |
| `src/core/language/index.ts` | 1 |
| `src/core/screenplay/versions.ts` | 1 |
| `src/core/translation/line-link-labels.ts` | 1 |
| `src/routes/prosjekt.$projectId.tsx` | 1 |

### Dynamiske uttrykk (18)

Teksten bygges av en variabel i stedet for en fast tekst. Beholdes i broen (`L`) til arbeidsflaten migreres; ingen tekst er endret.

| Fil | Linje |
|---|---|
| `src/adapters/storage/commands.functions.ts` | 55 |
| `src/adapters/storage/commands.functions.ts` | 60 |
| `src/app/assembly/ExportAnimaticDialog.tsx` | 520 |
| `src/app/assembly/mts-occurrences.ts` | 49 |
| `src/app/assembly/mts-occurrences.ts` | 61 |
| `src/app/assembly/use-film-language.tsx` | 12 |
| `src/app/library/image-prep.ts` | 168 |
| `src/app/scene-editor/CreditsPanel.tsx` | 87 |
| `src/app/scene-editor/PagesPanel.tsx` | 186 |
| `src/app/scene-editor/SceneEditorWorkspace.tsx` | 421 |
| `src/app/scene-editor/animation/MouthShapeEditor.tsx` | 93 |
| `src/app/scene-editor/animation/MouthShapeEditor.tsx` | 93 |
| `src/app/script/RemoveTranslationsDialog.tsx` | 43 |
| `src/app/script/SceneNavigator.tsx` | 490 |
| `src/app/script/VersionsDialog.tsx` | 799 |
| `src/core/generation/providers.ts` | 1257 |
| `src/core/library/content-sync.ts` | 37 |
| `src/core/presentation/poster.ts` | 78 |
## Tester (ML2a)
- Full vitest: 1 935 bestått, 0 feilet, 10 eksisterende hoppet over. Ny `tests/unit/i18n-ml2a.test.ts` har 9 tester.
- i18n-sjekken: 0 feil. ML1-tapstesten er grønn.
- DB: 140/140, kjørt mot en midlertidig lokal Postgres.
- Ny `tests/visual/ml2-languages.mjs`: 35/35. Den dekker nb → en → en-XA → nb med åpent utkast i samme felt (ikke montert på nytt, ikke lagret i stillhet), aria og verktøytips på hvert språk, knapper i åpen dialog, delvis katalog med reserve og første tegning uten norsk lekkasje.
- Regresjon: u5 65/65, t2 69/69, dv3 48/48, scene-panels 39/39.
- verifisering4: 50/54 i dette miljøet. De fire feilene gjelder takt mellom bilde og lyd, mikrofonopptak (to kontroller) og skriftmål for Courier. De samme miljøfeilene som i tidligere runder (ingen ekte mikrofon, annen font). Mars målte 58/58.

## Avvik og funn
- **en-XA avdekker 64 px vannrett overløp i sceneeditoren** med åpen opptaksdialog. Overløpet kommer fra ikoner og tekst i toppstripen. Det er nettopp dette pseudospråket skal finne. Suiten logger det som «MERK», og det rettes i sceneeditor-omgangen (ML2d). nb og en har 0 px.
- Pseudotekst fra `L` med innsatte verdier aksentuerer også innsatt brukerinnhold, for eksempel navn. Det gjelder bare testspråket og forsvinner når stedet flyttes til `t(key, params)`.
- Felt som regner ut tekst i `useMemo` uten språk i avhengighetene, kan vise forrige språk til de oppdateres. De tas i omgangen for sin arbeidsflate.

## ML2b – skall og konto (20.10.2026)

**Omfang:** toppmeny og navigasjon (`src/app/shell`), innlogging (`src/app/auth`), konto, profil og personvern (`src/app/account`), prosjektliste og prosjektside (`src/app/projects`, `src/app/project/RejectedTextNotice.tsx`), arbeidsgrupper og invitasjoner (`src/app/workspaces`), delte filmer (`src/app/share`), administrasjon og innstillinger (`src/app/admin`), språkvelgeren (`src/app/i18n`), felles dialoger (`src/components`) og alle sidefiler i `src/routes`.

**Verktøy:** `scripts/i18n/migrate.mjs` erstatter `L(...)` med `t("nøkkel", { navn: String(uttrykk) })` og hele `localized({...})` med `tLocalized({...})`. Nøklene hentes fra ML1-inventaret. Like tekster på samme sted, for eksempel `title` og `aria-label`, beholder hver sin nøkkel (løsning A). Bare kjørbare par flyttes. Dynamiske uttrykk og par med ulik plassholderkontrakt blir stående på broen. Inventaret beholder flyttede par med frosne nb/en-tekster så lenge en nøkkel brukes. Appen laster bare de flyttede nøklene (`src/core/i18n/runtime.gen.json`, 0,3 MB) og ikke de fulle katalogene på 8 MB. en-XA lages fra engelsk ved oppstart.

| Mål | Verdi |
|---|---|
| Tekstpar i inventaret | 9 964, ingen tapt (grunnlinjetesten 9 963/9 963) |
| Flyttet totalt | 1 193 av 9 964 (12,0 %) |
| Flyttet i skall og konto | 1 193 av 1 199 (99,5 %) |
| Gjenstående bro | 8 771 par (88,0 %), av dem 6 i skall og konto |
| Konflikter | 266, uendret og ikke slått sammen; de 27 gruppene som venter på Mars, står fortsatt åpne |

**Igjen på broen i skall og konto:** seks tekster der norsk og engelsk har ulik plassholderkontrakt, fordi flertallsformen er bygd inn i teksten:
- BackupDialogs.tsx:161 (manglende filer)
- DurationOverview.tsx:360 (antall scener i prognosen)
- PromotionDialog.tsx:173 (antall endringer)
- QualityProfilesSection.tsx:118 (antall varianter)
- FilmShareDialog.tsx:180 (dato, fast `nb-NO`)
- prosjekt.$projectId.tsx:72 (eieren er blokkert)

De trenger flertallsmeldinger, det vil si nye katalogoppføringer. Derfor tas de i kjerne- og serveromgangen sammen med de andre flertallstekstene, ikke gjennom automatisk omskriving.

**Første tegning (retting):** på `/personvern` med lagret engelsk kom det et hydreringsavvik, og det fantes allerede før ML2b. Rutene ligger i egne kodebiter og hydreres etter roten. Lagret språk settes nå først når siden selv er hydrert og det har vært stille i 150 ms. Et vakthold på 2,8 s sørger for at siden aldri blir stående skjult. Teksten er fortsatt skjult til språket er satt, så norsk vises aldri først.

**Overløpet på 64 px i en-XA:** det ligger i sceneeditorens verktøyrad (ikoner og etiketter), ikke i skallet. Skallsidene har 0 px på en-XA. Rettingen er lagt til ML2d.

### Tester (ML2b)
- Vitest: 1 937 bestått, 0 feilet, 10 eksisterende hoppet over. Nytt: test av flytteverktøyet og en test som viser at alle 1 193 flyttede par gir nøyaktig sin nb- og en-tekst.
- Språksjekken: 0 feil. Inventaret er ferskt.
- ml2-languages: 106/106, kjørt tre ganger på rad. Ny del: prosjektliste, konto, prosjektside, personvern og invitasjon på nb, en og en-XA, uten vannrett rulling, uten nøkkelfeil og uten hydreringsavvik.
- u5-screens: 65/65.
- verifisering4: 51/54. De tre feilene er de samme miljøfeilene som før: mikrofon (to kontroller) og fontmålet 6,439 em.
- DB-tester er ikke kjørt i ML2b fordi ingen databasekode er endret.

## ML2c – manus (20.10.2026)

**Omfang:** manuseditoren og skrivevisningen, import og eksport (`src/app/script`), manusutforskeren (`src/app/script-explorer`), Story Lab (`src/app/storylab`), linjekoblinger og oversettelse (P5, i `src/app/script`) og dialog. Dialogfilene er `src/app/dialogue`, sceneeditorens manus- og dialogfiler (`SceneScriptPanel`, `SceneScriptDialog`, `DialogueCharacters`, `DialogueLanguageControls`, `DialogueVersions`, `GenerateDialogue`, `RecordAudioDialog`) og dialoglyden i `src/app/audio` (`AudioTakesDialog`, `LineWordsPanel`, `VoiceControls`, `takes.ts`, `use-recorder.ts`).

| Mål | Verdi |
|---|---|
| Tekstpar i inventaret | 9 964, ingen tapt |
| Flyttet totalt | 2 643 av 9 964 (26,5 %); 6 av dem er avløst av håndskrevne meldinger |
| Flyttet i manus | 1 444 av 1 457 (99,1 %) |
| Gjenstående bro | 7 321 par (73,5 %); 13 av dem i manus, 0 i skall og konto |
| Konflikter | 266, uendret; de 27 gruppene som venter på Mars, er ikke slått sammen |

**Flertallsformer for de seks skall- og kontotekstene:** de nye meldingene ligger i `src/core/i18n/authored.json` (flertall, valg og dato). Hver melding viser hvilken ML1-nøkkel den avløser, og den gamle teksten bevares frosset i inventaret. Tekstene er ordrett de gamle, og en test sjekker dem for både 1 og flere:
- sikkerhetskopi med manglende filer;
- prognosegrunnlag (scener og replikker);
- endringer ført over til hovedfilmen;
- antall varianter;
- utløpsdato for delt film, som nå formateres etter visningsspråket;
- blokkert eier, med og uten eiernavn.

**Avvik fra ML2a-verifiseringen, rettet:**
- *Pseudo-oversatt språkkode («norsk bokmål (nnbb)»).* Det var to feil. Språknavnet ble vist på norsk også på engelsk, fordi visningsspråket «en-GB» ikke ble gjenkjent som engelsk (`languageLabel`). I tillegg pseudo-oversatte broen innsatte verdier. Manusflatene bruker nå `t()`, der innsatte verdier som koder, tall, ID-er og navn aldri pseudo-oversettes. Begge deler er dekket av tester.
- *Norske begrunnelser i sceneeditoren på en-XA («Har replikk i manuset», «Står i sceneoverskriften»).* Begrunnelsen lagres på norsk av gjenkjenningen på serveren. Ressurspanelet i sceneeditoren viser den nå gjennom `tm()`. Samme felt i bibliotekets forslagsdialog (`SuggestionsDialog`) hører til ML2e.

**Igjen på broen i manus (13):** disse trenger håndskrevne flertalls- eller valgmeldinger:
- LineLinkReview:51 (antall uparede linjer)
- SceneNavigator:458 (antall notater)
- SceneNavigator:500/504 (scene uten nummer)
- ScriptPageView:283
- TranslationImportDialog:216/249/331/337 (språknavn og sikkerhetsord)
- GenerateDialogue:54 og LineWordsPanel:265 (kostnadsanslag)
- RemoveTranslationsDialog:44 og VersionsDialog:773 (dynamiske uttrykk)

De tas sammen med flertallstekstene i ML2f, eller tidligere hvis Mars ønsker det.

### Tester (ML2c)
- Vitest: 1 939 bestått, 0 feilet, 10 eksisterende hoppet over. Nytt: de seks håndskrevne meldingene ordrett på nb og en, en-XA uten pseudo-oversatte verdier, og engelske språknavn ved «en-GB».
- Språksjekken: 0 feil. Inventaret er ferskt.
- ml2-languages: 181/181. Ny del: manus, Story Lab, manusutforskeren og sceneeditorens manus på nb, en og en-XA, uten vannrett rulling, uten pseudo-oversatte språkkoder og uten norske begrunnelser. I dialogen sjekkes at språknavnet er på engelsk med urørt kode.
- t2-writing-ui 69/69, dv1-script-nav 15/15, dv3-dialogue-editor 48/48, dv6-languages 16/16, dv7-drift 28/28 (med mts-fixture), p5-line-linking 24/24, storylab-ui 32/32.
- Funn: overløpet på 64 px i sceneeditoren vises fortsatt i ML2a-scenarioet med åpen opptaksdialog, og hører til ML2d. Sceneeditorens manusvisning uten dialog har 0 px.


## ML2f – bibliotek, M6, AI/admin, kjerne og server – broen tom (20.10.2026)

### Dekning
| Mål | Verdi |
|---|---|
| Tekstpar i inventaret | 9 964 |
| Flyttet til `t()`/`tLocalized()` | **9 964 (100 %)** |
| Gjenstående bro (`L`/`localized`) | **0** |
| Herav flyttet i ML2f | 4 067 (bibliotek og Asset Studio, M6, AI-innstillinger, personvern, admin, kjerne og server, pluss 86 rester fra ML2c–ML2e) |
| Herav skrevet om til håndskrevne meldinger (`authored.json`) | 141 tekstpar → 272 meldinger, 71 med flertallsformer |
| nb og en | 100 % (i18n-sjekken: 0 tekster uten engelsk) |
| en-XA | generert automatisk fra en for alle nøkler |
| Tapstest mot ML1-grunnlinjen | 9 963/9 963 nøkler og råtekster bevart |

Fordeling av alle 9 964 par: bibliotek og Asset Studio 1 469, AI/konto/admin 372, kjerne, adaptere og server 2 668, øvrige flater (skall, manus, sceneeditor, montering) 5 455.

### Hvordan restene ble løst
- **Plassholderkonflikter og dynamiske uttrykk** (133 par: 115 + 18) er skrevet om til hele setninger med navngitte parametere, og flertall med `Intl.PluralRules` (`{count}`). Ingen tekst er limt sammen av biter på bare ett språk.
- **Faste tabeller** (overgangstyper, rulleteksttyper, plakatvalg, tallord i linjekoblingene, språknavn) bruker `tLocalized` med egne nøkler.
- **Konstanter som tester og server sjekker** (`PARTIAL_RESTORE`, `CONTENT_SYNC_FLAG`, `ORIGINAL_NOTE_MARK`, `UNDO_PRODUCTION_*`) står uendret; nøklene gir nøyaktig samme tekst (test i `tests/unit/i18n-ml2f.test.ts`).
- **Gamle nøkler blir ikke borte:** hver håndskrevet melding har `replaces` med ML1-nøklene den avløser, og inventaret merker dem `supersededBy`.

### L, localized og tm
- `L()` og `localized()` er ikke lenger en skrivevei. `scripts/i18n/check.mjs` stopper hvert nytt kall (også med alias) med beskjed om å legge teksten i katalogen og bruke `t()`. Funksjonene står igjen, merket `@deprecated`, bare fordi eldre tester leser tekstpar med dem.
- `tm()` brukes bare for gamle, lagrede servermeldinger som ble laget på norsk (f.eks. lagrede begrunnelser og eldre feilmeldinger). Nye servermeldinger bruker stabile feilkoder (`server-errors.ts`) eller `t()`. Regelen står i `src/core/i18n/index.ts` og i AGENTS.md.

### Konfliktene
Alle 266 konflikter er beholdt etter løsning A. Ingen nøkler er slått sammen. Disse 27 sammenslåingene **venter på Mars**:

| # | Norsk kilde | Engelske varianter (antall steder) |
|---|---|---|
| 1 | , anslått {value1} | «, estimated {value1}» (3) |
| 2 | «{name}» | «“{name}”» (2) |
| 3 | «{text}» | «“{text}”» (2) |
| 4 | «{value1}» | «“{value1}”» (2) |
| 5 | {label} · anslått {value2} | «{label} · estimated {value2}» (2) |
| 6 | 2D-scenen | «the 2D scene» (2); «The 2D scene» (11) |
| 7 | Anslått: {value1} · {label} | «Estimated: {value1} · {label}» (2) |
| 8 | Beskrivelse for segment {value1} | «Description for segment {value1}» (2) |
| 9 | Bruk mal «{name}» | «Use template “{name}”» (2) |
| 10 | Bruk v{number} | «Use v{number}» (2) |
| 11 | Fjern betegnelsen «{name}» | «Remove the term “{name}”» (2) |
| 12 | Godkjenn v{number} av «{name}» | «Approve v{number} of “{name}”» (2) |
| 13 | Jobben startet, men kunne ikke registreres: {message} | «The job started, but could not be registered: {message}» (2) |
| 14 | Laget med profil {name} | «Made with profile {name}» (3) |
| 15 | Laget med profil {value1} | «Made with profile {value1}» (2) |
| 16 | Legg «{name}» i «{name2}» | «Put “{name}” in “{name2}”» (3) |
| 17 | Legg til {size} noder | «Add {size} nodes» (2) |
| 18 | Legg til {value1} | «Add {value1}» (2) |
| 19 | Modell for {value1} | «Model for {value1}» (2) |
| 20 | Ny kvalitetsprofil «{name}» | «New quality profile "{name}"» (2) |
| 21 | Nytt bilde i «{name}» | «New image in “{name}”» (2) |
| 22 | Nytt lag «{name}» | «New layer “{name}”» (4) |
| 23 | Samtale med {name} | «Conversation with {name}» (2) |
| 24 | Scene {value1} | «Scene {value1}» (2) |
| 25 | Slett v{number} | «Delete v{number}» (2) |
| 26 | Ta «{name}» ut av gruppen | «Take “{name}” out of the group» (3) |
| 27 | Vis {value1} | «Show {value1}» (2) |

### Tester (ML2f)
- Full vitest: 1 949 bestått, 0 feilet, 10 hoppet over (inkludert ny `i18n-ml2f.test.ts`, 10 tester).
- DB: 140/140.
- ml2-languages: 318/318 – alle hovedflater (skall, konto, personvern, invitasjon, manus, Story Lab, manusutforsker, sceneeditor, montering, utgivelse, bibliotek, Asset Studio, admin) på nb, en og en-XA uten vannrett rulling, uten nøkkelfeil og uten vanlige norske grensesnittord på en/en-XA; eksportdialogene på en-XA.
- nb: p6 18/18, p8 110/110, m6-rest 74/74, ca2 17/17, ca7 26/26, u5 65/65, verifisering4 51/54.
- `UI_LANG=en`: u5 65/65, t2 69/69, dv5 20/20, p7 45/45.

### Avvik
- verifisering4: de samme tre kontrollene som før feiler av miljøgrunner (mikrofon i testnettleseren og fontmål for 10 tegn per tomme).
- Feilsiden («Siden kunne ikke vises») vises på norsk hvis en side krasjer før språket er satt ved første tegning. Teksten er flyttet til nøkler; det er tidspunktet som gjør at norsk vises.
- p6 og m6-rest/ca2/ca7 trenger `mts-fixture.json`, p8 trenger `visual-fixture.json` (plakatene).
- t2 har fått valgfritt `UI_LANG` (som harness-suitene fikk i ML2e). Språktesten gir adminsiden en egen oversikt, fordi fellesoppsettet ikke svarer på den.
- Plattformtesten for kjernen hopper nå over katalognøkler i anførselstegn (f.eks. `"core-presentation-document.…"`), som ellers ble lest som `document.`.
