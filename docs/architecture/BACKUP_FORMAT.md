# Sikkerhetskopi av prosjekt – format (DEC-0049, REQ-0411/0412)

En sikkerhetskopi er én zip-fil (`<prosjekt> - sikkerhetskopi - <dato>.zip`). Filene lagres uten komprimering
(mediefilene er allerede komprimert), og zip-filen er høyst ~3,8 GB (ingen ZIP64).

| Sti i zip-filen | Innhold |
|---|---|
| `animatic-backup.json` | Alle prosjektdata (se under) |
| `LES-MEG.txt` | Forklaring for mennesker, oppsummering og liste over filer som ikke er med |
| `filer/<bøtte>/<sti>` | Mediefilene, uendret. Bøtte `assets` (bilder, lyd, importert film) eller `sources` (importerte manusfiler) |
| `MANGLER.txt` | Bare hvis noen filer ikke kunne hentes da sikkerhetskopien ble laget |

## animatic-backup.json

```json
{
  "format": "animatic-studio-backup",
  "formatVersion": 1,
  "schemaVersion": 12,
  "createdAt": "2026-10-10T20:00:00.000Z",
  "app": "Animatic Studio",
  "project": { "id": "…", "name": "…", "fps_num": 25, "fps_den": 1, "frame_width": 1920, "frame_height": 1080, … },
  "tables": { "<tabell>": [ { rad med databasens kolonnenavn } ] },
  "history": { "change_log": [ … ], "generation_jobs": [ … ] },
  "files": [ { "bucket": "assets", "path": "…", "zipPath": "filer/assets/…", "byteSize": 0, "mimeType": "…", "category": "bilde|lyd|film|manusfil", "included": true } ]
}
```

- **tables** har samme tabeller og kolonnenavn som databasen (`db/migrations/`): `productions`, `scenes`,
  `scene_variants`, `script_blocks`, `script_block_revisions` (teksthistorikk), `scene_occurrences`,
  `production_segments`, `takes`, `assets`, `asset_variants`, `asset_versions`, `script_annotations`,
  `compositions`, `composition_layers`, `audio_clips`, `clip_parts`, `time_links`, `generation_prompts` (fra databaseversjon 14), `script_versions`
  (manusversjoner med øyeblikksbilde) og `imported_documents`.
- **history** er bare til orientering (kommandologgen og loggen over AI-generering med prompter). Den
  gjenopprettes ikke.
- **files** lister alle mediefiler prosjektet viser til. `included: false` betyr at filen ikke er tatt med
  (brukeren valgte bort kategorien); da er oversikten «en tydelig oversikt over eksterne avhengigheter»
  (REQ-0412).
- Ikke med: medlemmer, invitasjoner og profiler (personopplysninger og tilgang hører til kontoen, ikke
  prosjektet).

## Gjenoppretting

1. Filen leses i nettleseren (innholdsfortegnelsen fra slutten av zip-filen; mediefilene hentes som deler av
   filen, så selv store filmer lastes ikke inn i minnet). Dataene kontrolleres helt før noe skjer
   (`validateBackup`: samme gjenoppretting mot et tenkt, tomt prosjekt).
2. Et **nytt** prosjekt opprettes (`create_project`). Et eksisterende prosjekt overskrives aldri.
3. Alle ID-er byttes deterministisk (`backupIdMap`): de første 48 bitene (tiden i UUID v7) beholdes, resten er
   SHA-256 av nytt prosjekt + gammel ID. ID-er byttes overalt, også i filstier og øyeblikksbilder. Samme
   sikkerhetskopi og samme nye prosjekt gir alltid samme ID-er, så et nytt forsøk etter feil fortsetter uten
   dobbeltlagring.
4. Mediefilene lastes opp til det nye prosjektets mappe.
5. Serverfunksjonen `restoreBackup` skriver dataene i én transaksjon via `apply_changes` (som alle andre
   endringer), med kommandoen `RestoreBackup` (med fingeravtrykk av sikkerhetskopien) i kommandologgen.
   Deretter lagres manusversjonene og listen over importerte manusfiler.

Sikkerhet: bare eieren av et tomt, nytt prosjekt kan gjenopprette til det. Alle referanser (`*_id`) må peke på
noe i sikkerhetskopien, og alle filstier må ligge i prosjektets mappe; ellers avvises filen. Et nytt forsøk må
gjelde nøyaktig samme sikkerhetskopi.

Det gjenopprettede prosjektet står med den som gjenoppretter som forfatter av rader og teksthistorikk
(tidspunktene beholdes; navnene på notater beholdes).
