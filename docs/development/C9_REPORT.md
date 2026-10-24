# C-9 Klassifisering av øvrige programmer – rapport

Ingen plugins er bygget og ingenting er publisert. Det er ingen ny migrasjon og ingen ny tekst i grensesnittet.

## Levert
- `docs/connectors/CAPABILITY_MATRIX.md` (nb, med kort engelsk del): Toon Boom Harmony, DaVinci Resolve, Fusion, Clip Studio Paint, Procreate Dreams, Dragonframe og REAPER. For hvert program står det hva den offisielle dokumentasjonen tilbyr, hvilken koblingstype som er mulig (A, B eller C), hva vi dekker i dag og hva som mangler, med lenker til kildene. «Ukjent» står der dokumentasjonen ikke sier noe. «Ikke sjekket i dok.» merker det vi vet uten kildelenke.
- `src/core/connectors/capabilities.ts`:
  - Nytt påkrevd felt `connection` med verdiene `plugin`, `api`, `handoff` eller `export`. Eksisterende adaptere er merket.
  - Valgfritt felt `exportFormats` og listen `EXISTING_EXPORT_FORMATS` over formatene vi faktisk lager i dag.
  - De sju programmene er lagt inn med `connection: "export"`, uten kapabiliteter. `offerFor` gir dem alltid «Eksporter for …».
  - `validDescriptor` avviser adaptere av typen `export` som har kapabiliteter eller mangler formater.
- `tests/unit/c9-capabilities.test.ts`: 6 tester for modellen og matrisen.

## Klassifisering (kort)
| Program | Mulig | I dag |
|---|---|---|
| Toon Boom Harmony | A (JS/Python), C | C: PSD, PNG, WAV |
| DaVinci Resolve | A (Python/Lua, Workflow Integration), C | C: OTIO, FCP7, EDL, WAV |
| Fusion | A (Lua/Python, Fuses), C | C: Fusion-komposisjon, PNG |
| Clip Studio Paint | C (bare filter-SDK) | C: PSD, PNG |
| Procreate Dreams | C (ingen API) | C: PNG, MP4, WAV |
| Dragonframe | C (+ hendelsesskript) | C: Dragonframe-pakke, WAV |
| REAPER | A (ReaScript, C++-SDK), C | C: WAV/BWF |

## Ærlig roadmap
- [x] Matrise med offisielle kilder.
- [x] Kapabilitetsmodell og tester.
- [ ] Ingen skjerm viser ennå `offerFor` eller adapterlisten. Modellen er klar, men det er ikke bestilt å koble den til en skjerm.
- [ ] Noen detaljer er merket «ikke sjekket i dok.»: OTIO i Resolve, PSD-import i Harmony og markører i REAPER. De må kontrolleres mot leverandørens dokumentasjon før en eventuell A-kobling bygges.
- [ ] Mangler som kan bli egne faser: XDTS-timeark (Clip Studio), retur av klipperytme fra Resolve, Harmony-skriptpakke og ReaScript-pakke.

## Verifikasjon
- Full vitest: 3203 bestått, 0 feilet, 10 hoppet over.
- `npm run test:ssr`: 8/8. `tsc --noEmit`: 0 feil. i18n-kontrollen er grønn, og tekstoversikten er laget på nytt.
