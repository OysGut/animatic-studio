# Stilforbilder brukeren styrer selv (Øystein 23.10)

## Hva er endret
- **Listen «Sendes med til bildemodellen»** i bildepanelet har nå en avkrysningsboks på hver linje. Dagens bilde (identiteten) står øverst. Velges det bort, vises en merknad om at utseendet da kan endre seg.
- **Bortvalgte forslag** sendes ikke. Neste forslag i løsningens standardutvalg tar plassen. Standardutvalget er som før: høyst 6 bilder, identiteten medregnet. Forslag utenfor standardutvalget står i listen uten hake og kan krysses på.
- **«Legg til bilde …»** åpner en velger med søk og typefilter. Den viser prosjektets godkjente bildeversjoner i aktive varianter, med miniatyrer fra den felles Thumbnail-komponenten (contain). Rollen velges som «Bare stilen» eller «Samme figur/gjenstand». Bilder du har lagt til, kan fjernes igjen.
- **Hint:** «Anbefalt: 1–3 stilforbilder. Flere bilder gir ofte mer ujevne resultater og koster mer.» Har du flere enn 3, blir teksten gul. Ingenting blokkeres.
- **Grense per modell:** Hver modell i katalogen har fått feltet `maxInputImages`. Når grensen er nådd, vises «Grensen for denne modellen er nådd: N bilder», og det går ikke å krysse på eller legge til flere. Bilder over grensen merkes «(over grensen, sendes ikke)».
- **Valget huskes per ressurs i økten**, i nettleserens øktlager. Det lagres aldri i databasen. Kostnadslinjen viser «Bilder som sendes med: N av høyst M (flere bilder kan endre prisen)».
- **Tekst og bilder stemmer alltid overens:** Serveren lager listen over bilder på nytt fra det samme valget, med `attachedImageRows` i kjernen. Avsnittet ATTACHED IMAGES bygges fra den listen (`withAttachedLegend`), og et gammelt avsnitt i teksten byttes alltid ut. Serveren bruker den laveste grensen av den klienten sendte og den som gjelder modellen som faktisk brukes (`attachedLimit`). Bildeversjoner som ikke er bilder i dette prosjektet, avvises. `referenceImages` sjekker i tillegg fortsatt `project_id` for hver fil.

## Grenser i katalogen
| Modell | Grense | Kilde |
| --- | --- | --- |
| Gemini Nano Banana 2.1 / Nano Banana Pro | 14 | Google (Claudes undersøkelse) |
| OpenAI gpt-image-2.5 (flare/sunburst, egen nøkkel) | 16 | OpenAI, bilderedigering |
| Seedream 4.5 (fal) | 10 | fal-dokumentasjonen for edit. Seedream 4 oppgir 14; **bør bekreftes** |
| Qwen-Image-Edit Plus (fal) | 3 | fal |
| FLUX Kontext Pro (fal) | 1 | fal |
| Innebygde modeller (GPT Image 2 / 2.5 Sunburst) | ukjent → 6 | ingen dokumentert grense i gatewayen |

Egne modeller fra administratoren arver grensen fra malen sin (`model-settings.ts`). Den ytre grensen i serverens validering er 16 (`MAX_ATTACHED_IMAGES_ANY`).

## Tester
`tests/unit/stilforbilder-valg.test.ts` har 6 tester og bruker ingen AI-kall. De dekker bortvalg og erstatning, tillegg med rollen «samme figur/gjenstand», grensen per modell (14, 1, og 6 som reserve) med «over grensen», at teksten og bildene stemmer overens (gammelt avsnitt byttes ut, riktig antall), og at serveren avviser fremmede bildeversjoner.

Resultat: tsc 0, full Vitest grønn (324 filer bestått, 2 hoppet over), i18n-sjekken grønn. Ingen migrasjon.

## Ikke gjort
- **Visuell sjekk på nb og en** er ikke kjørt. Cloud mangler fortsatt kolonnen `assets.visual_brief_auto_at` fra 0089, og appen krever databaseversjon 89. Sjekken står i TODO.md.

## Språk
20 nye nøkler under `attach.*`. nb og en er skrevet selv. de, es, fr, it, ja, ko, pt-BR og ru er maskinoversatt og merket `review: machine` for gjennomlesing.

## Endrede filer
src/core/generation/image-prompt.ts; src/core/generation/providers.ts; src/core/generation/model-settings.ts; src/adapters/ai/image-prompts.server.ts; src/adapters/ai/generate-image.functions.ts; src/adapters/ai/write-prompt.functions.ts; src/app/library/GenerateImagePanel.tsx; src/app/library/AttachImagePicker.tsx (ny); src/app/library/attached-choice.ts (ny); src/core/i18n/authored.json, alle locale-filene, runtime.gen.json, scripts/i18n/ (genererte filer); tests/unit/stilforbilder-valg.test.ts (ny); AGENTS.md (regel 62); TODO.md; roadmap.md; docs/development/STILFORBILDER_REPORT.md (ny).
