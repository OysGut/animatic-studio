# Veikart

## B-049 ML3 – N manusspråk per prosjekt (20.10.2026)
- [x] Kartlegging av lagrede språkmerker og constraints i ML3_REPORT.md (ingen kollisjoner i Cloud).
- [x] Migrasjon 0066 (additiv): BCP-47 i 0016/0017-begrensningene, language_versions, nullable language_version_id; DB 142/142.
- [x] Register, kommandoer med invers, innlasting, backup, regler (samme versjon, norsk kilde, «må gjennomgås»), B-048/B-050 eksplisitt språk.
- [x] Brukerflate: språkversjoner, valg i manus/utforsker/linjekoblinger/eksport, eksplisitt norsk reserve eller stopp.
- [x] Feilsiden følger valgt språk fra første tegning (test).
- [x] Tester: vitest, ml3-script-languages.mjs, regresjon nb og UI_LANG=en.
- [ ] Kjøring av 0066 i Cloud: venter på Claude (hasher må kontrolleres, se ML3_REPORT.md).

## B-049 ML1 (20.10.2026)
- [x] Fullt AST-inventar, stabile nøkler, tapsfrie nb/en-filer og konfliktliste.
- [x] Språkmanifest, validerte reserver, t/parametere/plural og automatisk en-XA; eksisterende bro uendret.
- [x] Utvidet sjekk, 13 ML1-tester, null-tap, full vitest 1926/0 og DB 140/0; U5/T2/DV3/paneler grønne.
- [ ] Verifisering4 helt grønn: venter på kontroll i Claudes miljø (Courier Prime 6,439 em her; 57/58 med portabel falsk mikrofon).
- [x] Kravregister 0875–0878, build_docs/check_kb og ML1_REPORT; ingen migrasjon.

## Kontekstkoblinger og B-049-plan (20.10.2026)
- [x] Synlig mål med miniatyr og målbytte; AI aldri forhåndsvalgt; prosent og grupperte gjentakelser.
- [x] Tester: 1913 bestått, 10 eksisterende hoppet over; m6-rest 72/72 på norsk/engelsk; språksjekk 0 feil.
- [x] Kun plan for B-049 i docs/development/PLAN_B049_MULTILANG.md; ingen språkimplementering eller migrasjon.

## M6 – resten av produksjonskontrollen (20.10.2026)
- [x] P8-avvik: vist modell = brukt modell; samlet kostnadsanslag i massemodus med kvalitetsprofil.
- [x] Plan i docs/development/PLAN_M6_REST.md.
- [x] A: AI-oppdatering ved avvik (bilde → ny versjon, shot → notat, røde replikker → DV7), kostnadsport.
- [x] B: varighetsprognose fra historikk i scenenavigator og prosjektoversikt.
- [x] C: kontekstuelle koblingsforslag, regler først, AI for usikre, godkjenning med angring.
- [x] Tester (vitest, DB, m6-rest.mjs, regresjon), requirements.yaml, ROADMAP, build_docs/check_kb.

## P8 – AI-stilharmonisering (REQ-0137–0145, REQ-0400–0402) (20.10.2026)
- [x] Kort plan i docs/development/PLAN_STYLE_HARMONIZATION.md før kode.
- [x] «Harmoniser stil …» fra plakat, sceneeditor og Asset Studio; stil fra stilprofil eller referansebilde (6 dimensjoner).
- [x] Identitetsbevarelse: bilde-til-bilde med referanse, tydelig instruks, advarsel; modell/kvalitet valgbar med M8-profil som standard.
- [x] Sammenligning original/harmonisert (skyver/veksling) før godkjenning.
- [x] Bruksvalg: lokal overstyring, alternativ variant, foretrukket referanse per stilprofil, eksplisitt publisering til globalt bibliotek.
- [x] Ikke destruktivt; alt via apply_changes og angrbart.
- [x] Massemodus med samlet kostnadsanslag, lease og idempotens som DV5.
- [x] Metadata: kilde, modell, profil, stilprofil («Laget med profil X»).
- [x] Migrasjon 0065 (fra 0064) hvis nødvendig; DB-tester lokalt alle grønne. Backup tar med harmoniserte varianter/koblinger.
- [x] Vitest (regler, angring, idempotens), visuell suite p8-style-harmonize.mjs NO/EN; regresjon: posters, ca2, ca7, u5, p6, dv5.
- [x] requirements.yaml REQ-0137–0145/0400–0402 + build_docs + check_kb; rapport med testtall, migrasjon, kreditter, avvik.

## P7-rest (20.10.2026)
- [x] Test der MOV-filmen har lyd: kontroller med ffprobe at pcm_s16le 48 kHz stereo finnes og har riktig lengde.

## Tidligere fullført (se git-loggen)
- P4/P5/P6 (linjekobling 0064, kvalitetsprofiler 0063, alfaeksport), DV1–DV8, CA1–CA8, MTS, P7 ProRes/MOV (egen koder, ADR-0011).

## B-049 ML2 (20.10.2026)
- [x] ML2a: språkvelger fra manifestet, en-XA i utvikling, språkbytte uten remontering, ingen lekkasje ved første tegning, stabile serverfeilkoder, ml2-languages-suite
- [x] ML2b: skall og konto (1 193 av 1 199 par flyttet; 6 flertallstekster på broen)
- [x] ML2c: manus (1 444 av 1 457 par flyttet; 13 på broen), seks flertallstekster fra skallet, språkkoder i en-XA
- [ ] ML2d: sceneeditor (inkl. en-XA-overløp på 64 px, som ligger i sceneeditoren, ikke i skallet)
- [ ] ML2e: montering og lyd, bibliotek og Asset Studio
- [x] ML2f: bibliotek, M6, AI/admin, kjerne og server – broen tom (9 964/9 964), L()-kall stoppes, rapport i ML2_REPORT.md

## B-049 ML2d – sceneeditor (20.10.2026)
- [x] 1 761 av 1 785 tekstpar flyttet med migrate.mjs; 24 på broen (19 ulik plassholderkontrakt, 5 dynamiske) til ML2f.
- [x] 64 px overløp med en-XA og åpen opptaksdialog rettet i verktøyraden; ingen norske tekster igjen.
- [x] Regresjon grønn: paneler, dv2, ca1–ca8, u5, mts ×3, dv7, ml2-languages 199/199, vitest 1939/0.

## B-049 ML2e – montering, lyd og eksport (20.10.2026)
- [x] Tekstene flyttet med migrate.mjs; resten med ulik plassholderkontrakt venter på ML2f.
- [x] SuggestionsDialog viser begrunnelser på valgt språk.
- [x] UI_LANG=nb|en i regresjonssuitene; dec0093, dec0094 og p4 grønne på begge språk.
- [x] Regresjon grønn: dv4, dv5, p7, ca8, ml2-languages 256/256, vitest 1939/0.
