# Nye språk i From Pen to Glass

Denne mappen brukes til å oversette grensesnittet til nye språk.

## Slik gjør du det

1. Åpne en fil i `1_til_oversetting/`, for eksempel `del_01_av_18.json`.
2. Lim inn teksten under «Instruks til språkmodellen» i en språkmodell, sammen med filen. Bytt ut `<SPRÅK>` med språket, for eksempel «fransk (fr)».
3. Lagre svaret som en ny fil i `2_oversatt/`, med språkkoden først i navnet, for eksempel `fr_del_01_av_18.json`.
4. Gjenta for alle 18 delene. Delene kan godt gjøres i flere omganger.
5. Si fra til Claude («fransk ligger i mappen»). Claude kontrollerer filene og legger språket inn i appen.

Det er 18 filer med rundt 600 tekster hver, til sammen 10 536 tekster og rundt 55 000 ord.

## Hva hver tekst inneholder

```json
"nøkkel": { "nb": "norsk tekst", "en": "engelsk tekst", "oversatt": "" }
```

- `nb` og `en` er bare kontekst. De skal ikke endres.
- `oversatt` fylles ut.
- Hvis `en` er et objekt med `one` og `other` (flertall), skal `oversatt` også være et objekt. Det skal ha flertallsformene målspråket bruker, etter Unicode CLDR. Fransk bruker for eksempel `one`, `many` og `other`.

## Instruks til språkmodellen

> Du oversetter brukergrensesnittet i et profesjonelt verktøy for animasjon og film, fra manus til animatic og videre til produksjon (stop motion, utklipp på glass, Dragonframe, After Effects).
>
> Oversett feltet `en` til <SPRÅK>, og bruk `nb` som støtte for betydningen. Skriv svaret i feltet `oversatt`.
>
> Regler:
> 1. Returner nøyaktig samme JSON med de samme nøklene i samme rekkefølge. Ikke legg til, fjern eller endre nøkler, `nb` eller `en`.
> 2. Alt i krøllparenteser, som `{count}`, `{value1}` og `{name}`, kopieres uendret og skal stå i oversettelsen.
> 3. Ikke oversett filnavn, filendelser, kode, tastatursnarveier (Cmd, Ctrl, Shift, Esc), formatnavn (ProRes, MP4, PDF, FBX, EDL, OTIO, QR), produktnavn (Dragonframe, After Effects, Premiere, Resolve, ElevenLabs) eller navnet «From Pen to Glass».
> 4. Flertall: når `en` er et objekt med flertallsformer, lag et objekt med de formene målspråket bruker (CLDR), og ta med `{count}` der det passer.
> 5. Bruk korte, naturlige formuleringer slik de står i profesjonelle programmer på målspråket. Knapper og menyvalg skal være korte. Bruk samme ord for samme begrep hele veien (se ordlisten).
> 6. Bruk høflig og nøytral tiltaleform, slik profesjonelle programmer gjør på målspråket.
> 7. Returner bare JSON, uten forklaring.

## Ordliste

Fyll gjerne ut kolonnen for målspråket før du starter, og legg ordlisten ved instruksen, så blir fagordene like i alle delene.

| Norsk | Engelsk | Målspråk |
|---|---|---|
| manus | script | |
| replikk | line (dialogue) | |
| scene | scene | |
| sceneforekomst | scene occurrence | |
| skudd | shot | |
| montering | assembly | |
| animatic | animatic | |
| lag | layer | |
| nøkkelbilde | keyframe | |
| bevegelsesbane | motion path | |
| tidslinje | timeline | |
| spor | track | |
| avspillingshode | playhead | |
| ressurs / ressursbibliotek | asset / asset library | |
| bildevariant | image variant | |
| munnform | mouth shape | |
| leppesynk | lip sync | |
| blink | blink | |
| rytmeverktøy | rhythm tool | |
| rigg | rig | |
| platenivå | plate level | |
| kontur / klippelinje | contour / cut line | |
| maske | mask | |
| lydversjon / opptak | audio version / take | |
| romtone | room tone | |
| X-sheet | X-sheet (exposure sheet) | |
| eksport | export | |
| utgivelse | release | |
| gul lapp / merknad | sticky note / note | |
| prosjekt / produksjon | project / production | |

## Når språket legges inn

Claude kontrollerer at:
- alle nøklene er med;
- alle `{plassholdere}` er bevart;
- flertallsformene er gyldige for språket.

Feil rapporteres tilbake per fil og nøkkel. Deretter legges språket inn i appen.

Filene i `1_til_oversetting/` er laget fra språkkatalogen 21.10.2026. Når appen får nye tekster, lager Claude en liten tilleggsfil med bare de nye tekstene, så du slipper å gjøre alt på nytt.
