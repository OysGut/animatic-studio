# G-7 robust lagring – rapport

**Dato:** 23.10.2026
**Migrasjon:** `db/migrations/0099_g7_apply_changes_core.sql` (ikke kjørt i Cloud – Claude gjennomgår og kjører den)

## Hva som er gjort

`public.apply_changes` var én funksjon på over 21 000 tegn som vokste for hver ny tabell. Den er nå delt i:

1. **En liten kjerne** som bare gjør autorisasjon, prosjektlås, revisjonskontroll, innsetting/oppdatering/sletting via `table_columns` og skriving til `change_log`.
2. **Valideringsfunksjoner per domene** i `private`-skjemaet, registrert i tabellen `private.apply_change_validators` med `table_name`, `validator` (regproc), valgfri `preparer` og `sort_order`. Kjernen slår opp registeret og kaller funksjonene – den endres aldri når nye tabeller kommer.

| Validering | Tabell(er) | Opprinnelse |
|---|---|---|
| `validate_translation_line_links` | translation_line_links | 0064 |
| `validate_style_harmonizations` | style_harmonizations | 0065 |
| `validate_style_preferred_references` | style_preferred_references | 0065 |
| `validate_language_scope` | translations, translation_lines, translation_line_links | 0066/0067 |
| `validate_preferred_reference_unique` | alle (REQ-0144, prosjektvid) | 0053/0065 |
| `validate_mouth_sets` | mouth_sets | 0084 (PTG4) |
| `validate_mouth_tracks` | mouth_tracks | 0084 (PTG4) |
| `validate_active_quality_profile` | alle (prosjektvid) | M8 |

## Begrunnede valg

- **`prepare_*` før skriving:** De tre referansevalideringene (linjekoblinger, harmoniseringer, foretrukne referanser) sammenlignet opprinnelig radene i kallet mot tilstanden *før* endringen, slik at rader med uendrede referanser (avvis, angre) aldri blokkeres. For å bevare dette kjøres `prepare_*`-funksjonene før skriving og finner akkurat de id-ene i kallet som endrer referanser; `validate_*` kjøres etter skriving med bare disse id-ene. Rekkefølgen er identisk med den gamle.
- **`table_name null` = kjøres ved hver endring:** REQ-0144 (én foretrukken referanse per ressurs/profil) og aktiv kvalitetsprofil er prosjektvide kontroller som også før kjørte ved hvert kall; de er registrert uten tabell for å bevare det.
- **Register som tabell, ikke hardkodet liste:** En tabell med `regproc`-referanser gir databasetvang på at registrerte funksjoner finnes, og lar serverrollen registrere nye valideringer uten å røre kjernen (utvidelsespunktet er bevist i test G-7.9: en probe-validering registrert i en transaksjon avviser endringer gjennom den uendrede kjernen).
- **Samme feilkoder, meldinger og rekkefølge:** `sort_order` tilsvarer den gamle rekkefølgen i funksjonskroppen; alle `raise exception`-tekster er kopiert ordrett.
- **Rettigheter:** Signaturen `(uuid,uuid,uuid,jsonb,jsonb,jsonb)` og grants er uendret (revokert fra public/anon/authenticated, grant til service_role) – verifisert i test G-7.1. Serverrollen fikk `usage` på `private`-skjemaet og `select, insert` på registeret, slik at nye valideringer kan registreres uten eierrettigheter.

## Verifisering

- **DB-suite før:** 201 bestått, 0 feilet. **Etter:** 211 bestått, 0 feilet (10 nye G-7-tester).
- **Nye tester per validering (G-7.1–G-7.10):** registerets innhold, signaturer og `search_path=''` på alle valideringsfunksjoner; uendret signatur og rettigheter på `apply_changes`; at kjernen ikke lenger inneholder valideringsreglene; direkte positive og negative kall av hver `validate_*`; `prepare_translation_line_links` (nye, uendrede og endrede rader); utvidelsespunktet ende-til-ende; duplikat foretrukken referanse avvist gjennom registeret (REQ-0144).
- **Ytelse, 10 000 manusblokker via `apply_changes` (50 kall à 200 rader, `tests/db/g7-apply-changes-bench.ts`):**

| Kjøring | Før (0098) | Etter (0099) |
|---|---|---|
| 1 | 902 ms | 946 ms |
| 2 | 860 ms | 942 ms |

Refaktoreringen koster ca. 5–9 % (innenfor målestøy mellom kjøringer). Godtatt fordi kallet fortsatt er under 1 ms per blokk og gevinsten er at kjernen aldri vokser.

- **`search_path=''`:** alle nye funksjoner har `security definer set search_path = ''` med fullt kvalifiserte navn; den globale kontrollen i DB-suiten er grønn.

## Grenser

- Benchmarken måler innsetting av blokker; andre domener har samme kjernevei.
- `EXPECTED_SCHEMA_VERSION` er 99; 0099 må kjøres i Cloud før klienten godtar basen.
