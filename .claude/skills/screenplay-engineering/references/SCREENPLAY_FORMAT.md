# Manusformat – elementer, innrykk og extensions

**Status for tallene i denne fila:** bransjekonvensjon for amerikansk manusstandard slik Final Draft og vanlige manusguider beskriver den. **Ikke verifisert mot referansemanuset ennå.** Første import av «Jula på Dovre» (PDF, Final Draft 11) skal måle faktiske x-posisjoner og linjeavstander; resultatet føres inn i `REFERENCE_SCREENPLAY.md` og erstatter tallene her som standard for prosjektet.

## 1. Side og font (US-standard)
| Egenskap | Konvensjon | Merknad |
|---|---|---|
| Papir | US Letter 8,5 × 11 in (612 × 792 pt) | A4 (210 × 297 mm ≈ 8,27 × 11,69 in) som valg (ADR-0007) |
| Font | Courier/Courier Final Draft/Courier Prime, 12 pt | 10 tegn per tomme, 6 linjer per tomme |
| Venstre marg | ca. 1,5 in | Plass til hulling/innbinding og venstre scenenummer |
| Høyre marg | ca. 1,0 in | |
| Topp/bunn | ca. 1,0 in | Sidetall øverst til høyre, ca. 0,5 in fra toppen, format «12.» |
| Linjer per side | ca. 54–56 tekstlinjer | Avhenger av topp-/bunnmarg; måles i referansen |
| Første side | normalt uten sidetall | Tittelside teller ikke |

## 2. Elementer og typiske innrykk (fra venstre papirkant, i tommer)
| Element (`ScriptBlock.kind`) | Venstre | Høyre / bredde | Kjennetegn |
|---|---|---|---|
| Sceneoverskrift (`heading`) | 1,5 | til 7,5 (≈ 60 tegn) | STORE BOKSTAVER, starter med INT./EXT./INT./EXT./I/E; « - » før tid. Scenenummer i begge marger |
| Handling (`action`) | 1,5 | til 7,5 (≈ 60 tegn) | Vanlig tekst, blanklinje mellom avsnitt |
| Karakter (`character`) | ca. 3,5–3,7 | – | STORE BOKSTAVER, kan ha extension i parentes |
| Parentes (`parenthetical`) | ca. 3,0–3,1 | til ca. 5,5 (≈ 25 tegn) | I parentes, under karakter eller mellom dialoglinjer |
| Dialog (`dialogue`) | ca. 2,5 | til ca. 6,0–6,25 (≈ 35 tegn) | Under karakter/parentes |
| Overgang (`transition`) | ca. 5,5–6,0 eller høyrejustert til 7,5 | – | STORE BOKSTAVER, slutter ofte på «TO:» (CUT TO:, DISSOLVE TO:) |
| Skudd (`shot`) | 1,5 | – | STORE BOKSTAVER uten INT./EXT. (CLOSE ON …, ANGLE ON …) |
| Scenenummer venstre | ca. 0,75–1,0 | – | Samme linje som overskriften |
| Scenenummer høyre | ca. 7,4–7,8 | – | Samme linje som overskriften |

Bruk tallene som **startverdier for klassifisering med toleranse**, aldri som eksakte grenser. Importrørledningen kalibrerer båndene fra dokumentets egne x-posisjoner (se `IMPORT_PIPELINE.md`).

## 3. Sceneoverskrift – anatomi
```
42   INT. LILLEHAMMER, ROLFS HUS, SOVEROM - DAG   42
^nr  ^int/ext ^lokasjon (kan ha komma-ledd)  ^tid ^nr
```
- `intExt`: `INT.`, `EXT.`, `INT./EXT.`, `EXT./INT.`, `I/E` (bevar originalens skrivemåte; normaliser bare i et eget felt).
- `location`: alt mellom int/ext og siste « - ». Kan inneholde komma og flere ledd (sted, bygning, rom).
- `time`: ledd etter siste « - » (f.eks. DAG, KVELD, NATT). Samle faktiske verdier fra referansen i stedet for å anta en fast liste; ukjent tid er lov og flagges ikke som feil.
- Nummer: tall med valgfri bokstavsuffiks (`42`, `42A`, `A1`). Venstre og høyre skal være like; ulikt = usikkerhet.
- Unummerert overskrift er en gyldig scene (referansen har minst én).

## 4. Karakter-extensions og fortsettelser
| Extension | Betydning | Hvordan modellere |
|---|---|---|
| `(V.O.)` | voice-over | Del av `DialogueLine` (felt `extension`) |
| `(O.S.)` / `(O.C.)` | off screen / off camera | Som over |
| `(CONT'D)` – talerfortsettelse | Samme karakter fortsetter etter avbrudd av handling i samme scene | Kan være skrevet av forfatteren eller lagt til automatisk av Final Draft. Bevar som lest ved import; marker kilde (`source: 'text' | 'auto'`) når det kan avgjøres |
| `(CONT'D)` – sideskift | Dialog fortsetter etter sideskift | **Lagres ikke.** Genereres av pagineringen sammen med `(MORE)` |
| `(MORE)` | Nederst på side når dialog brytes | **Lagres ikke.** Genereres av pagineringen |
| `(CONTINUED)` / `CONTINUED:` | Valgfri scenefortsettelse over sideskift (Final Draft-innstilling) | **Lagres ikke.** Fjernes ved import; om den brukes ved eksport er en innstilling |

Norske varianter (f.eks. «(FORTS.)») kan forekomme. Ikke anta; registrer det som faktisk finnes i referansemanusene.

## 5. Andre forhold
- **Dobbel dialog** (to replikker side om side): to tekstkolonner på samme y. Støttes ved import som usikker tolkning til den er modellert.
- **Revisjonsmerker**: Final Draft kan sette `*` i høyre marg ved endrede linjer. Ikke les som scenenummer eller tekst.
- **Tittelside**: egen side før manus; inneholder kontaktinfo som aldri skal i fixtures (DEC-0004).
- **Teknisk metadata** (ID-er, tidskoder, segmenter) skal ikke inn i manuslayouten eller eksporten (REQ-0102, REQ-0104).

## 6. Fountain (senere format, DEC-0013)
Kilde: https://fountain.io/syntax (les originalen ved implementering; dette er en omformulert oversikt, ikke en kopi).
- Ren tekst der elementtypen avledes av mønstre: overskrifter starter med INT/EXT/EST/I/E (eller tvinges med punktum først), karakter er en linje i store bokstaver etterfulgt av dialog, parentes står i parentes, overganger er store bokstaver som slutter på «TO:» (eller tvinges med `>`).
- Scenenummer kan stå mellom to `#` på slutten av overskriften – passer til `productionNumbering`.
- Har egne markører for sideskift, notater, utkommentert tekst («boneyard»), seksjoner/synopsis, sentrert tekst, dobbel dialog og tittelside med nøkkel–verdi-par.
- Før Fountain tilbys: rundtur-test (import → eksport → import gir samme struktur), jf. kravet om rundtur-test per ekstra format i `requirements.yaml`.
