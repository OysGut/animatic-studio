# B-099 – QR-kode for opptak med mobil i sceneeditorens lydopptak

Dato: 21.10.2026. Ingen migrasjon og ingen nye pakker. `apply_changes` er ikke endret.

## Hva er bygget
1. **QR-kode i opptaksvinduet** (`RecordAudioDialog`): QR-koden står ved siden av PC-opptaket. Den bruker samme `MobileQr` og `useMobileSession` som `AudioTakesDialog`.
   - Statusen viser «Mobilen er tilkoblet» (ellers «Venter på mobilen»), antall opptak som venter og antall som er mottatt.
   - Bytter brukeren replikk eller lydtype, lages en ny økt og en ny kode for det nye målet.
2. **Hvor opptaket havner:**
   - **Replikk:** økten har konteksten `line` (scene, replikk og klipp). Mobilen viser replikken med karakter og scene (`MobileAudio`), med opptak og romtone som før. `MobileImportWatcher` gjør opptaket om via `saveTake`: ny `AddAssetVersion` og `AddDialogueVersion` med `activate: false`. Ingenting overskrives, og brukeren velger selv «Bruk i filmen».
   - **Annen lyd:** økten har den nye konteksten `scene_sound` (`occurrenceId`, `atMs`, `kind`), der `atMs` er avspillingshodet da vinduet og QR-koden ble åpnet. Opptaket blir en ny lydressurs med én versjon og et lydklipp på det tidspunktet (`saveSceneSound`). Det er ett angresteg, som ved PC-opptak.
   - Serveren godtar `scene_sound` bare når scenen hører til prosjektet. Mobilen tar bare imot lyd i denne konteksten.
3. **Når PC-mikrofonen ikke virker** (ingen tilgang, ingen enhet, ikke støttet eller annen feil): en tydelig melding sier at mobilen kan brukes i stedet, og QR-koden fremheves med oransje ramme.
4. **Lydkvalitet:**
   - Formatet velges med `pickRecordingFormat`: Opus i WebM eller AAC i MP4, begge med 256 kbit/s.
   - «Rå lyd (uten støydemping og automatisk nivå)» skrur av `echoCancellation`, `noiseSuppression` og `autoGainControl`. Valget er på som standard.
   - På PC-en huskes valget på kontoen (`ui_prefs`: `audio.rawRecording`). På mobilsiden, som ikke har innlogging, huskes det i telefonens nettleser.
5. **Sceneverktøylinjen:**
   - Mobilsiden for scenen (QR-koden bak kameraknappen) har nå «Ta opp lyd» ved siden av bilde og video. Knappen åpner det samme opptaket som for replikker.
   - En lyd som er mottatt i scenens mobilvindu, har knappen «Legg i scenen». Den legger lyden inn som ny lyd ved avspillingshodet.
6. Alle nye tekster ligger i katalogen på nb og en (`b099.*`).

## Tester
| Kontroll | Resultat |
|---|---|
| `npx tsgo --noEmit` | rent |
| i18n-sjekk | 0 tekster uten engelsk |
| Ny `tests/unit/b099-mobile-audio.test.ts` | 7/7: konteksten, formatvalg, rå lyd og at ny lyd i scenen havner ved avspillingshodet i én angregruppe |
| Full vitest | 2 124 bestått, 10 hoppet over (de samme som før), 0 feilet |
| Ny `scene-mobile-audio.mjs` nb/en | 23/23 og 23/23 |
| dec0090-mobile-ui nb/en | 35/35 |
| dec0093-audio-ui nb/en | 28/28 |
| dv2 nb/en; dv3 nb/en | 7/7; 48/48 |
| scene-panels-ui nb/en; u5-screens nb/en | 39/39; 63/63 |
| CA1, CA2, CA5, CA8 nb (etter slettingen) | 18, 17, 13, 22 – alle bestått |
| DB-tester | ikke kjørt her (ingen DB-endring); Claude kjører dem |

`scene-mobile-audio.mjs` kontrollerer dette:
- QR-koden og PC-opptaket står i vinduet;
- økten gjelder valgt replikk;
- «Mobilen er tilkoblet» vises;
- rå lyd er på som standard;
- et simulert mobilopptak blir `AddDialogueVersion` på riktig klipp med `activate: false`, uten at noe overskrives;
- antall opptak som venter, vises;
- `scene_sound` får scenen og avspillingshodet;
- PC-feil viser meldingen og fremhever QR-koden;
- mobilsiden for scenen har «Ta opp lyd» og rå lyd.

`mts-harness.mjs` fikk valgfrie `hooks.rest` og `hooks.serverFn`. De er av som standard, så andre suiter påvirkes ikke.

Suitene ble kjørt én om gangen.

## Avvik
1. **Ikke ukomprimert lyd:** WebM-PCM kan bare tas opp i Chrome og spilles ikke av i Safari eller Firefox. Derfor brukes Opus eller AAC med 256 kbit/s, som er det beste formatet alle i teamet kan spille av.
2. **Ny kontekst `scene_sound`:** lyd som ikke er en replikk, hadde ingen kontekst. Den nye konteksten ligger i den eksisterende jsonb-kolonnen, så ingen migrasjon trengs.
3. **Lydtype for «Legg i scenen»:** lyd som legges inn fra scenens mobilvindu, blir lydeffekt (`sfx`). Typen kan endres på klippet etterpå.
4. **Tekstkatalogen:** `build-catalog.mjs` tømte `catalog.gen.ts` da jeg kjørte det. Filen ble straks hentet tilbake fra forrige versjon, og det er bare `inventory.mjs` som har generert katalogen.

---

## Rester fra B-100

### 1. Drag forbi scenens slutt
- `BeyondEndNotice` har fått `onExtend`. I sceneeditoren viser den «Forleng scenen …», som åpner `RetimeDialog` (B-041) med foreslått lengde lik det animasjonen trenger. Brukeren velger metode og bekrefter selv.
- Ingenting forlenges automatisk. Den gamle direkte forlengelsen brukes bare der `onExtend` ikke er gitt.
- Under draget står det «Animasjonen går N f forbi scenens slutt. Ingenting er forlenget.»
- `b100-spacing.mjs` er utvidet. Den sjekker at meldingen vises, at varselet kommer, at ingen `UpdateComposition` eller `RetimeScene` sendes, at dialogen åpnes med en lengde som dekker animasjonen, og at ingenting skrives før bekreftelse. Resultat: 25/25 på nb og en.

### 2. Rydding og ML1-grunnlaget
- `AnimationWorkspace.tsx` og `AnimPreview.tsx` er slettet. Ingen andre filer var bare i bruk av dem, så resten av mappen er i bruk.
- i18n-inventaret er generert på nytt. Baselinen (`scripts/i18n/baseline.v1.json`) er oppdatert bevisst, fra 9 963 til 9 956 oppføringer. Inventaret gikk fra 9 964 til 9 957 tekstpar.
- Tallene i `i18n-ml1.test.ts` og `i18n-ml2f.test.ts` er endret tilsvarende, med en kommentar.
- Disse sju nøklene forsvant. Alle var tekster bare i den gamle forhåndsvisningen:
  - `…anim-preview.title.92e5e6e4947c`: «Forhåndsvisning»
  - `…anim-preview.aria-label.84dd1e0b5314`: «Zoom i forhåndsvisningen»
  - `…anim-preview.option.4dbd8598c83c`: «Tilpass»
  - `…anim-preview.label.3358c1aba7ad`: «Tilbakestill visningen»
  - `…anim-preview.aria-label.a483be00c0b2`: «Forhåndsvisning av scenen»
  - `…anim-preview.title.3b951a0b177a`: «Lag»
  - `…animation-workspace.label.5d50a665cb4e`: «Bredde på forhåndsvisningen»
- Den ubrukte teksten `b100.spacing.beyond` er erstattet av `b100.beyond.text`.

### 3. Hover på lag uten `MotionPath`
- Lerretet viser nå posisjonene fra nøkkelbildene som punkter.
- Punktene som berøres av draget, er oransje og forbundet med en stiplet linje. Det gjelder fra pekerens tid og ut, eller alle med Shift. Resten er dempet, og punktet ved pekerens tid har ring.
- Lerretet har `data-spacing-overlay` (`path`/`points`). Testen sjekker `points` for Maja, som ikke har bane.

## Åpne spørsmål
- Skal «Legg i scenen» i scenens mobilvindu spørre om lydtype (effekt, atmosfære, musikk), i stedet for å bruke lydeffekt som standard?
