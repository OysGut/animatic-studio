# B-104 – Nytt produktnavn «From Pen to Glass» (rapport)

Dato: 21.10.2026. Ingen migrasjon.

## Hva er endret
- **Alle tekster brukeren ser**: «Animatic Studio» er byttet til «From Pen to Glass». Sidetitler av typen
  «Manus – …» og navnet på API-nøkler bruker kortformen «Pen to Glass». Mobilsiden bruker kortformen i toppen.
  258 tekster i grunnlaget (nb/en, og dermed en-XA) og 86 i den gamle katalogen er endret. Det gjelder også alle
  feilmeldingene «Kontakt administratoren for å oppdatere …».
- **Metadata** i `src/routes/__root.tsx`: title, description, og:title, og:description, og:site_name og twitter:title.
  Story Lab-siden har ny tittel.
- **Eksport**: Producer i manus-PDF og plakat-PDF, Creator i Word-manus, creator i kostnadsrapporten (Excel/CSV), og
  `app` og LES-MEG.txt i sikkerhetskopier.
- **Innlogging, toppfelt og personvernsiden** viser det nye navnet.
- **Regler**: produktnavnregelen er oppdatert i `CLAUDE.md` og `AGENTS.md` (regel 40). Overskriften i TODO er oppdatert.

## Hva er ikke endret
- Repo-, pakke- og databasenavn, i18n-nøkler (noen inneholder `animatic-studio`), lagrede nøkler, mappenavn og
  krypteringssalt.
- Sikkerhetskopiformatet `animatic-studio-backup` og filnavnet `animatic-backup.json`. Lesingen sjekker bare
  formatet, så kopier med `app: "Animatic Studio"` leses som før. Begge navnene står i `BACKUP_APP_NAMES`, og en test
  dekker det.
- Feltet `context` i `scripts/i18n/mapping.v1.json` er historisk kildekontekst og vises aldri.

## Funnet underveis
- **Favicon-tekst, manifest og e-postmaler** finnes ikke i repoet. Det er bare `favicon.ico`.
- **B-102 / PTG**: det finnes verken kode eller dokumentasjon for B-102 i repoet. Det var derfor ingenting å omdøpe.
  Navnet «Til produksjonen» / «To production» er skrevet inn i produktnavnregelen i `CLAUDE.md`, så det brukes når B-102
  bygges.
- **Lenker**: ingen domenenavn er skrevet inn i koden. Delingslenker bruker `window.location.origin`. En test vokter dette.

## Vakt
`tests/unit/b104-product-name.test.ts` (5 tester):
- «Animatic Studio» skal ikke stå i `src/` eller `public/`. Eneste unntak er `src/core/backup/index.ts`, som trenger det
  gamle navnet for å lese eldre kopier.
- Ingen katalogtekst på nb, en eller en-XA bruker det gamle navnet.
- Metadataene og navnet i sikkerhetskopier er sjekket.
- Ingen domenenavn står i koden.

REQ-0479-testen er oppdatert til det nye navnet.

## Tester
- `tsgo --noEmit`: rent. i18n-sjekk: 0 tekster uten engelsk (inventaret regenerert).
- Full Vitest: 2 151 bestått, 10 hoppet over, 0 feilet.
- Ingen nettlesersuite sjekker produktnavnet; `rg "Animatic Studio" tests` fant bare enhetstester. Disse suitene ble
  kjørt for kontroll, én om gangen:
  - u5-screens: 63/63 på nb og en. Den første kjøringen på nb feilet fordi forhåndsvisningen startet på nytt
    samtidig; ny kjøring besto.
  - account-admin-ui: 58/58 på nb og en.
  - account-locale: 28/28 på nb.

## Avvik
- **ML1-grunnlaget** (`scripts/i18n/baseline.v1.json`) låser kildetekstene. Hashene er oppdatert bare for de 258
  tekstene med det nye navnet. Skriptet kontrollerte at hver endret tekst inneholder «Pen to Glass». Begrunnelsen
  står i filen.
- Kommentarer i koden (stilark, knapp, typefil, Fountain) er også oppdatert, fordi vakten skanner hele `src/`.

## TODO
Lagt til: «`apply_changes` skal skrive `scene_ids` i samme transaksjon» (B-097), til neste gang funksjonen endres.
