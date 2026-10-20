# Plan: AI-stilharmonisering (REQ-0137–0145, REQ-0400–0402) – P8

Bestilt 20.10.2026. Kostnaden er godkjent av Mars; hver generering krever likevel kostnadsporten med
eksplisitt bekreftelse (DEC-0077). Ingen ekte AI-kall i tester.

## Prinsipper
- Ikke destruktivt: originalen endres aldri; alle resultater er nye versjoner/varianter, alt via
  `runCommand` → `apply_changes` og angrbart. Godkjente ressurser i andre produksjoner påvirkes ikke.
- Publisering til det globale biblioteket er alltid et eget, eksplisitt klikk (REQ-0145, P0).
- Norsk hovedmanus røres ikke; prompter er engelske (som resten av bilde-AI-en).
- All brukervendt tekst `L("norsk", "english")`.

## Kjerne (`src/core/generation/style-harmonize.ts`, ren TypeScript)
- `buildHarmonizePrompt(state, input)`: bilde-til-bilde-bestilling som dekker alle seks dimensjonene
  (REQ-0138): tegnestil, fargepalett, lyssetting, tekstur, detaljgrad og atmosfære – hentet fra valgt
  stilprofil (`styleText`/`composeStyleText`) eller fra et referansebilde brukeren velger. Inneholder en
  tydelig identitetsbevarende instruks (REQ-0139: «keep the character's identity …») og `avoid` fra
  profilen. Gjenbruker `buildContextImageBrief`/`renderBrief`-mønsteret og `describeAttached` slik at
  identitetsbildet og stilforbildene er tydelig merket.
- Metadata-typen `HarmonizationMeta` (kildeversjon, modell, kvalitetsprofil-øyeblikksbilde, stilprofil,
  referansebilde, bruksvalg) med validering (`harmonizationMetaError`).
- Hjelpere for bruksvalgene og «Laget med profil X»-notatet.

## Prosjektdata (migrasjon 0065, fra 0064-versjonene av apply_changes/delete_project/purge_project_assets)
To nye prosjekttabeller, skrevet via kommandoer (klient kan ikke skrive direkte; RLS som 0064):
- `style_harmonizations`: én rad per harmonisert versjon (version_id, source_version_id, model,
  quality_profile-snapshot jsonb, style_profile_id, reference_version_id, use: local/variant/reference/
  published). Metadata og proveniens (krav 7).
- `style_preferred_references`: foretrukket referanse per (asset_id, style_profile_id) (REQ-0144);
  kommandoen bytter pekeren atomisk, delvis unik indeks der `not removed` som sikkerhetsnett.
Begge tas inn i `apply_changes` (v_tables + delete-rekkefølge), `delete_project`, `purge_project_assets`,
`project-rows.ts`, `model.ts`/`patch.ts` og backupen (`BACKUP_STATE_TABLES` + `restoredState`), med
`schema_version = 65`.

Nye kommandoer i `src/core/commands/`: `AddStyleHarmonization` (med invers), `RemoveStyleHarmonization`,
`SetPreferredStyleReference` (med invers). Rundtur-test mot databaseradene som i 0064-testene.

## Enkeltgenerering (gjenbruk av eksisterende bilde-rør)
- `HarmonizePanel` i `src/app/library/ImageAiPanels.tsx`-familien, tilgjengelig i `ImageLightbox`
  (ny `initialPanel="harmonize"`). Gjenbruker `useImageModel`/`useImageChoices` (modeller med
  `acceptsImage`), kostnadsanslag og bekreftelsesdialogen (samme mønster som vinkler/variasjoner).
- Standardvalg fra aktiv kvalitetsprofil (REQ-0401): `spec.models.image`, `spec.resolution`, `spec.effort`;
  brukeren kan overstyre modell og størrelse. Øyeblikksbildet sendes med til `generateImage` (feltet
  finnes allerede) og lagres i metadataen.
- Fast advarsel i panelet: identiteten kan endre seg (REQ-0139).
- Kallet: `generateImage` med `referencePaths` (identitetsbildet først, deretter stilforbildene fra
  profilen eller det valgte referansebildet), `identityFirst: true`, harmoniseringsprompten og
  `approved: true` først etter «Ja».

## Sammenligning og bruksvalg (REQ-0140–0144, REQ-0402)
- Ny `HarmonizeCompare`-komponent: original og harmonisert side om side med skyver (clip-path) og
  vekslingsknapp, før godkjenning.
- Bruksvalg etter godkjenning (alle angrbare kommandoer, aldri automatikk):
  1. **Bare her** (REQ-0141): bildet lagres som ny versjon på en egen variant («Harmonisert», style
     `other`) og settes som `versionId` på det aktuelle plakatelementet eller scenelaget – en lokal
     overstyring som ikke endrer ressursens godkjente bilde og ikke publiserer noe.
  2. **Ny variant** (REQ-0142): ny variant under karakteren, uten å erstatte eksisterende.
  3. **Foretrukket referanse** (REQ-0144): `SetPreferredStyleReference` for (karakter, stilprofil).
  4. **Publiser** (REQ-0143/0402): egen, eksplisitt knapp som gjenbruker
     `saveAssetToGlobal`/`uploadGlobalVersion`-flyten; aldri automatisk.

## Inngangspunkter
- **Plakat** (REQ-0400): «Harmoniser stil …» i bildeseksjonen i `PosterInspector`; resultatet settes på
  elementet via `withElement`/`savePoster`.
- **Sceneeditor**: «Harmoniser stil …» ved «Oppskaler bildet …» i `LayerInspector` (åpner
  `LayerImageDialog`/`ImageLightbox` med `initialPanel="harmonize"`); «Bare her» setter lagets
  `versionId`.
- **Asset Studio**: samme delte dialog via «Bilder og verktøy …»; versjonsvalg i utkastet følger
  Studio-skillet (bilder lagres straks, sceneendringer via «Oppdater scenen og lukk»).

## Massemodus (lease og idempotens som DV5)
Nye service-role-tabeller `harmonize_batches` og `harmonize_batch_items` (0065) etter mønsteret fra
`dialogue_batches` (0061/0063): `create_harmonize_batch` (atomisk, `unique(project_id, request_id)`,
forhåndstildelte jobb-/kommando-ID-er, server-side kostnad og budsjettreservasjon under prosjektlås),
`claim_harmonize_batch` (én lease om gangen, kvitteringsbasert gjenoppretting – et mulig fakturert
resultat kjøres aldri på nytt), `transition_`/`complete_harmonize_batch_item`, `resume_` og
`reconfirm_harmonize_batch`. Server: `src/adapters/ai/harmonize-batch.functions.ts` +
`harmonize-batch.server.ts` som bruker samme bildeadaptere som `generateImage`. UI: fra HarmonizePanel –
«Legg til flere karakterer …» med samlet kostnadsanslag og én godkjenning (`HarmonizeBatchPanel` etter
mønsteret fra `DialogueBatchPanel`). Ingen automatisk gjentakelse av uklare resultater.

## Tester
- vitest: promptbygger (alle seks dimensjoner, identitetsinstruks, ingen hemmeligheter/nøkler),
  kommandoene med inverser og rundtur, bruksvalg-regler, metadatabasegrenser.
- DB-tester lokalt (egen Postgres): RLS, apply_changes, sletting/purge, batch-idempotens og lease.
- Ny visuell suite `tests/visual/p8-style-harmonize.mjs` (mockede serverfunksjoner, skjermbilder NO/EN).
- Regresjon: posters, ca2-variants, ca7-global, u5-screens, p6-quality-profiles, dv5-batch.

## Dokumentasjon
requirements.yaml REQ-0137–0145 og 0400–0402 (status, implementation, verification), deretter
build_docs.py og check_kb.py.

## Gjennomført (20.10.2026)
- «Bare her» lagrer bildet i en arkivert variant («Harmonisert – … (lokal)»), så laget/plakatelementet kan peke på det uten at bibliotekets synlige varianter endres.
- Massejobben ligger i `src/adapters/storage/harmonize-batch.*` (AI-mappen skriver aldri prosjektdata) og bruker felles `src/adapters/ai/image-run.server.ts`.
- Publisering bruker «Lagre i globalt bibliotek» (hele ressursen) og bare for ressurser som ikke alt er koblet til en global ressurs.
