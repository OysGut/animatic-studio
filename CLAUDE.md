# CLAUDE.md – Animatic Studio

**Produktnavn:** Animatic Studio (aldri «AI Animatic Studio»).
**Formål:** En profesjonell filmproduksjonsapplikasjon fra manus til ferdig film: manus, scener, ressurser, lagbasert 2D-animatic, kamera, lyd, filmtidslinje, valgfri AI-generering, versjonering, kontinuitet, språkversjoner, spinoffer, plakater og eksport. Første brukere er Trollfilm / Anita Killi (filmen «Jula på Dovre»).
**Eier av produktbeslutningene:** Mars (mars@gutu.no). Mars er ikke utvikler. Claude bygger løsningen og tar tekniske valg selvstendig (DEC-0006), men endrer aldri vedtatte produktkrav uten Mars.

## Autoritative kilder (les i denne rekkefølgen ved behov)
1. `docs/product/MASTER_SPECIFICATION.md` – mandatet v14. **Den opprinnelige, autoritative produktspesifikasjonen. Endres aldri** (kontrollsum i `SPEC_MANIFEST.yaml`).
2. `docs/decisions/DECISION_LOG.md` – senere beslutninger. Bare «Bekreftet av bruker» endrer produktkrav.
3. `docs/product/requirements.yaml` → `REQUIREMENTS.md` / `TRACEABILITY_MATRIX.md` – 530+ krav med permanente ID-er.
4. `docs/architecture/` – hvordan kravene oppfylles. `INVARIANTS.md` er kritisk.
5. `docs/development/SESSION_HANDOVER.md` og `CURRENT_WORK.md` – hvor arbeidet står nå.
6. `.claude/skills/` – arbeidsmetoder (ikke produktkrav). Kode viser hva som er implementert, ikke hva produktet skal gjøre.
Ved motstrid: pek på motsetningen og hvilken beslutning som løser den. Velg aldri i stillhet når det gjelder vedtatte produktkrav.

## Ufravikelige arkitekturprinsipper (se INVARIANTS.md for testbare regler)
- Manus og film er to visninger av **samme** aktive produksjonsstruktur. Strukturell synk er alltid automatisk og transaksjonell.
- Scenenummer er aldri identitet. Alt refererer til permanente ID-er (scene, sceneforekomst, scenevariant, blokk, replikk …).
- Skill **scene** (narrativ enhet) / **sceneforekomst** (bruk i én produksjon) / **scenevariant** (produksjonsspesifikk utgave).
- Deaktivering er ikke sletting. Skjuling i UI er ikke deaktivering.
- Ingen destruktive automatiske endringer: ferdig film, godkjente ressurser, aktiv versjon, andre produksjoner og historiske manusversjoner endres aldri automatisk. Avvik flagges; brukeren velger godkjenn / oppdater / angre.
- Norsk er hovedmanus; andre språk endrer det aldri automatisk.
- Kontinuitet følger fortellingstid, ikke visnings- eller produksjonsrekkefølge.
- Produksjonsteknisk segmentering endrer aldri manusstruktur eller scenenumre.
- 2D-animatic kan spilles av og eksporteres uten generativ AI. Betalte API-kall krever eksplisitt kostnadsgodkjenning innen budsjett.
- Flere brukere per prosjekt (DEC-0003, REQ-0520–0522): ingen av andres endringer skal gå tapt. Teknisk løsning (DEC-0010/0022): tilgang håndheves i backend; all skriving går via serverfunksjonen `runCommand` → `public.apply_changes` med revisjonskontroll. Migrasjoner i `db/migrations/` (aldri i `drizzle/`, som Lovable eier).
- Domenekjernen (`src/core/`) er plattformnøytral TypeScript uten React/Lovable/Supabase-avhengigheter (portabilitet til macOS/Windows).

## Før du endrer kode
1. Les `SESSION_HANDOVER.md` og `CURRENT_WORK.md`.
2. Finn relevante krav-ID-er (`grep` i `requirements.yaml`) og les tilhørende kapitler i mandatet.
3. Les relevante ADR-er og `INVARIANTS.md`. Aktiver relevante skills (`specification-guardian` alltid ved nye funksjoner).
4. Skriv plan og akseptansekriterier i `CURRENT_WORK.md`. Identifiser funksjoner som kan påvirkes.

## Etter endringer
1. Gå gjennom diffen selv. Kjør tester (`npm test`, ev. `npx playwright test`) og `python3 scripts/kb/check_kb.py`.
2. Oppdater `requirements.yaml` (status, `implementation`, `verification`) og kjør `python3 scripts/kb/build_docs.py`.
3. Oppdater `IMPLEMENTATION_STATUS.md`, `KNOWN_ISSUES.md` og `SESSION_HANDOVER.md`.
4. «Verifisert» krever en test eller dokumentert kontroll. Skrevet kode alene er aldri «ferdig».

## Dokumentasjon, testing og versjonering
- Hver P0-invariant skal ha automatiserte tester (`tests/invariants/`).
- Nye krav: neste ledige REQ-ID, `origin` + `source.decision`. ID-er omnummereres eller gjenbrukes aldri.
- Nye beslutninger: DEC-ID i `DECISION_LOG.md`, merket **Bekreftet av bruker**, **Teknisk anbefaling** eller **Midlertidig antakelse**. Presenter aldri en antakelse som godkjent.
- Store tekniske valg: ADR i `docs/decisions/adr/`.
- Git: små commits med krav-ID i meldingen. Aldri force-push, rebase eller squash på `main` (Lovable synker den grenen).
- Mediefiler, manus og hemmeligheter skal aldri inn i repoet (`.gitignore`). Manus ligger i `../Manus/` utenfor repoet.

## Når Mars tar en ny beslutning
Registrer den i `DECISION_LOG.md` (Bekreftet av bruker) → legg til eller endre krav i `requirements.yaml` med `history`-post som viser til beslutningen → oppdater berørte arkitekturdokumenter og skills → kjør `build_docs.py` + `check_kb.py` → noter i handover. Mandatfilen røres ikke.

## Stopp og spør Mars bare når
noe koster penger, noe vil slette/overskrive filene hans, et vedtatt produktkrav må endres eller tolkes, eller ved sikkerhetsspørsmål. Svar Mars på norsk, uten unødvendig teknisk sjargong.

## Skills
Ligger i `.claude/skills/`. Oversikt og når de brukes: `.claude/skills/README.md`. Skills lærer arbeidsmetode og viser til dokumentene over; de skaper ikke egne produktkrav.
