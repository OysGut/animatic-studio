# Beslutningslogg – Animatic Studio

Alle beslutninger som utvider, endrer eller tolker mandatet (`docs/product/MASTER_SPECIFICATION.md`, v14), og alle viktige tekniske valg.

**Beslutningstyper** (skal alltid oppgis):
- **Bekreftet av bruker** – Mars har tatt beslutningen. Kan endre produktkrav.
- **Teknisk anbefaling** – Claude har valgt løsningen innenfor fullmakten i DEC-0006. Endrer aldri produktkrav; kan revideres med ny DEC.
- **Midlertidig antakelse** – forutsetning som ikke er avklart. Skal enten bekreftes eller erstattes. Står også i `docs/product/OPEN_QUESTIONS.md`.

Regler: DEC-ID-er er permanente. En beslutning endres aldri i ettertid; den erstattes av en ny som viser til den gamle («Erstatter DEC-xxxx»). Større tekniske beslutninger har en ADR i `adr/`.

## Oversikt

| ID | Dato | Tittel | Type | Status | ADR |
|---|---|---|---|---|---|
| DEC-0001 | 2026-10-08 | Mandat v14 er den autoritative produktspesifikasjonen | Bekreftet av bruker | Gjeldende | – |
| DEC-0002 | 2026-10-08 | Hele norsk og engelsk manus erstatter «DEL 2.docx» som referanse | Bekreftet av bruker | Gjeldende | ADR-0007 |
| DEC-0003 | 2026-10-08 | Flere brukere per prosjekt med invitasjon | Bekreftet av bruker | Gjeldende | ADR-0004 |
| DEC-0004 | 2026-10-08 | Rettigheter, første brukere og lagring av manus | Bekreftet av bruker | Gjeldende | – |
| DEC-0005 | 2026-10-08 | Claude bygger løsningen i GitHub; Lovable kjører den | Bekreftet av bruker | Gjeldende | ADR-0002 |
| DEC-0006 | 2026-10-08 | Claude har fullmakt til tekniske valg | Bekreftet av bruker | Gjeldende | – |
| DEC-0007 | 2026-10-08 | Kravregister som YAML med genererte dokumenter og automatisk kontroll | Teknisk anbefaling | Gjeldende | ADR-0001 |
| DEC-0008 | 2026-10-08 | Lovable Cloud som backend, SQL-migrasjoner i repoet | Teknisk anbefaling | Gjeldende (må testes) | ADR-0002 |
| DEC-0009 | 2026-10-08 | Lagdelt arkitektur med plattformnøytral domenekjerne | Teknisk anbefaling | Gjeldende | ADR-0003 |
| DEC-0010 | 2026-10-08 | Samarbeid: RLS per medlemskap, revisjonskontroll, tilstedeværelse | Teknisk anbefaling | Gjeldende | ADR-0004 |
| DEC-0011 | 2026-10-08 | Endringer som kommandologg (angre, selektiv tilbakeføring, historikk) | Teknisk anbefaling | Gjeldende | ADR-0005 |
| DEC-0012 | 2026-10-08 | Tidsmodell i heltall bilder med rasjonell bildefrekvens | Teknisk anbefaling | Gjeldende | ADR-0006 |
| DEC-0013 | 2026-10-08 | Manusimport: PDF og DOCX først, Fountain senere | Teknisk anbefaling | Gjeldende | ADR-0007 |
| DEC-0014 | 2026-10-08 | Avspilling og animatic-eksport i nettleseren; tung rendering i ekstern tjeneste | Teknisk anbefaling | Gjeldende | ADR-0008 |
| DEC-0015 | 2026-10-08 | Begrepsavklaringer i domenemodellen | Teknisk anbefaling | Gjeldende | – |
| DEC-0016 | 2026-10-08 | Skills: egne P0-skills, eksterne bare etter vurdering og pinning | Teknisk anbefaling | Gjeldende | – |
| DEC-0017 | 2026-10-08 | Mørkt tema som standard; norsk UI med oversettbar struktur | Midlertidig antakelse | Åpen | – |
| DEC-0018 | 2026-10-08 | Bare brukerens egne API-nøkler, eid av prosjekteier | Midlertidig antakelse | Delvis bekreftet av DEC-0021 | – |
| DEC-0019 | 2026-10-08 | Etableringsoppdraget (del A–K) og invariantlisten i del B3 | Bekreftet av bruker | Gjeldende | – |
| DEC-0020 | 2026-10-08 | Presiseringer etter revisjon: skrivevei, skjema, lagringssti, modellhull | Teknisk anbefaling | Gjeldende (pkt. 1 og 3 erstattet av DEC-0022) | ADR-0004, ADR-0005 |
| DEC-0021 | 2026-10-08 | Mars betaler API-kostnader i testfasen; kostnadsdeling i samarbeid avtales utenfor appen | Bekreftet av bruker | Gjeldende | – |
| DEC-0022 | 2026-10-08 | Domenekjernen kjøres på serveren; databasen lagrer endringssett atomisk; migrasjoner i db/migrations | Teknisk anbefaling | Gjeldende | ADR-0009 |
| DEC-0023 | 2026-10-09 | Manusimport i nettleseren; originalen i privat bøtte; import som én kommando | Teknisk anbefaling | Gjeldende | ADR-0007, ADR-0010 |
| DEC-0024 | 2026-10-09 | Sidebryting i kjernen (kalibrert mot Final Draft, låste sider) og manuseksport til PDF/DOCX | Teknisk anbefaling | Gjeldende | ADR-0010 |
| DEC-0025 | 2026-10-09 | Redigering i manus: fjerning er et flagg, splitting av delt scene krever egen variant, angre per bruker med revisjonskontroll | Teknisk anbefaling | Gjeldende | ADR-0005, ADR-0010 |
| DEC-0026 | 2026-10-09 | Deaktiverte og unummererte scener i manuseksport | Midlertidig antakelse | Åpen (Q-08) | ADR-0010 |
| DEC-0027 | 2026-10-09 | «Vis kun valgt scene» i manusvisningen | Bekreftet av bruker | Gjeldende | – |
| DEC-0028 | 2026-10-09 | M2 del 2: manusversjoner, sammenligning, søk/filter, varighetsestimat, tilstedeværelse | Teknisk anbefaling | Gjeldende | ADR-0010 |

---

## DEC-0001 – Mandat v14 er den autoritative produktspesifikasjonen
- **Dato:** 2026-10-08 · **Type:** Bekreftet av bruker
- **Problemstilling:** Produktbeslutningene fra en lang utviklingsdialog må bevares uten tap eller forvansking.
- **Valgt løsning:** «ANIMATIC STUDIO – Komplett prosjektmandat … samlet versjon 14» lagres uendret som `docs/product/MASTER_SPECIFICATION.md` (SHA-256 `9dc65608…328b52`, 1559 linjer, 35 kapitler). Alle krav (REQ-0001–REQ-0519, REQ-0530) er utledet fra den.
- **Alternativer:** Omskrevet/oppsummert spesifikasjon (forkastet – fare for tap).
- **Begrunnelse:** Mars' instruks (del A1).
- **Berørte krav:** alle mandatkrav. **Berørte moduler:** alle.
- **Konsekvenser:** Filen endres aldri. Kjente redigeringsartefakter (dupliserte linjer, tom kodeblokk) bevares og er dokumentert i `SPEC_MANIFEST.yaml`.
- **Endrer tidligere beslutninger:** Nei.

## DEC-0002 – Hele norsk og engelsk manus erstatter «DEL 2.docx» som referanse
- **Dato:** 2026-10-08 · **Type:** Bekreftet av bruker
- **Problemstilling:** Kap. 4.1 viser til «DEL 2.docx» som formatreferanse. Mars har levert hele manuset i stedet. En Final Draft-fil (.fdx) finnes ikke.
- **Valgt løsning:** Referansemanus er «JULA PÅ DOVRE / Christmas Survivors» (Anita Killi, medforfattere Ståle Stein Berg og Trond Morten Venaasen, Trollfilm): norsk PDF eksportert fra Final Draft 11 (Draft 9.3, 15.03.2024, 106 sider, US Letter, 96 nummererte scener med hull opp til 109 og minst én unummerert scene) og engelsk DOCX (samme scenenumre, layout laget med mellomrom og egne stiler).
- **Alternativer:** Vente på «DEL 2.docx» (ikke nødvendig).
- **Begrunnelse:** Hele manus gir bedre testgrunnlag. Kravene i 4.1 om delmanus (start/slutt midt i scene) beholdes og testes med utdrag laget fra hele manuset.
- **Berørte krav:** REQ-0044–REQ-0049 (kap. 4.1) og REQ-0050, REQ-0055, REQ-0332, REQ-0333 (akseptanse bruker referansemanuset). **Moduler:** SCRIPT, L10N.
- **Konsekvenser:** PDF-import blir nødvendig (se DEC-0013). Avvik i referansen: filnavn sier «Draft 9.2», tittelsiden «Draft 9.3» – registrert i KNOWN_ISSUES.
- **Endrer tidligere beslutninger:** Endrer referansen i mandat kap. 4.1 (ikke kravene).

## DEC-0003 – Flere brukere per prosjekt med invitasjon
- **Dato:** 2026-10-08 · **Type:** Bekreftet av bruker
- **Problemstilling:** Mandatet beskriver ikke samarbeid. Mars: «Jeg trenger også at det kan være flere brukere på samme manus, m.a.o. at første bruker kan invitere flere inn i et prosjekt … viktig konsept for god arbeidsdeling og arbeidsflyt.»
- **Valgt løsning:** Nye krav REQ-0520–REQ-0522 (bekreftet). Claudes tekniske utledninger REQ-0523–REQ-0529 er merket `teknisk-anbefaling`.
- **Berørte moduler:** ny modul COLLAB (Collaboration & Access), CORE, SECURITY, SCRIPT, VERSION, QUALITYCOST.
- **Konsekvenser:** Medlemskap og tilgangskontroll må inn i datamodellen fra fase 1. Hvem som eier API-nøkler og godkjenner kostnader i delte prosjekter er åpent (OPEN_QUESTIONS Q-01).
- **Endrer tidligere beslutninger:** Utvider mandatet.

## DEC-0004 – Rettigheter, første brukere og lagring av manus
- **Dato:** 2026-10-08 · **Type:** Bekreftet av bruker
- **Beslutning:** Trollfilm og Anita Killi eier manuset. Mars utfører arbeidet for dem og har tillatelse til å bruke manuset i utviklingsarbeidet. Trollfilm/Anita Killi er Animatic Studios første brukere. Manusfilene lagres i `Claude/Projects/Animatic Studio/Manus/` på Mars' Mac, utenfor Git-repoet.
- **Konsekvenser:** Korte utdrag kan brukes som testdata i det private repoet (`tests/fixtures/screenplay/`). Hele manusfiler skal aldri inn i repoet (`.gitignore`). Kontaktinformasjon fra tittelsiden tas ikke med i fixtures.

## DEC-0005 – Claude bygger løsningen i GitHub; Lovable kjører den
- **Dato:** 2026-10-08 · **Type:** Bekreftet av bruker
- **Problemstilling:** Mandat kap. 33.3 forutsetter instruksjoner til Lovable steg for steg. Mars: «jeg ønsker at vi ikke prompter til Lovable en etter en … lager prosjektet vårt ferdig her og så kobler det over på GitHub som vi så knytter inn i et Lovable-prosjekt som da laster inn løsningen. Og at jeg der da kan legge inn API-nøkler etc. for å teste grensesnittet.»
- **Valgt løsning:** Claude skriver all kode, alle migrasjoner og tester i GitHub-repoet. Lovable brukes til kjøring, forhåndsvisning, backend, hemmeligheter og publisering.
- **Teknisk begrensning (verifisert i Lovables dokumentasjon):** Lovable kan ikke koble seg til et eksisterende repo, bare opprette et nytt. Derfor oppretter Mars et tomt Lovable-prosjekt med GitHub-kobling først, og Claude bygger inne i det repoet. Lovable kjører ikke migrasjoner og deployer ikke funksjoner som kommer via Git – det krever én fast melding i Lovable etter hver leveranse (`docs/development/LOVABLE_SYNC.md`).
- **Berørte krav:** Prosesskravene fra kap. 33.3 (Lovable-instruksjoner) og 35 punkt 8 gjelder fortsatt, men bare for oppsett, synk og plattformspesifikke oppgaver. Kravene endres ikke; arbeidsformen gjør det.
- **Konsekvenser:** Skillen `lovable-development` handler om å holde koden kompatibel med Lovable og om synk, ikke om å skrive funksjonsprompter.

## DEC-0006 – Claude har fullmakt til tekniske valg
- **Dato:** 2026-10-08 · **Type:** Bekreftet av bruker
- **Beslutning:** Mars gir Claude «maksimal frihet til å gjennomføre dette prosjektet» uten løpende godkjenning. Claude stopper og spør bare når (1) noe koster penger, (2) noe vil slette eller overskrive Mars' filer, (3) et vedtatt produktkrav må endres eller tolkes, (4) ved sikkerhetsspørsmål.
- **Konsekvenser:** Claudes valg registreres som «Teknisk anbefaling» og kan revideres. Ingen av dem endrer produktkrav.

## DEC-0007 – Kravregister som YAML med genererte dokumenter og automatisk kontroll
- **Dato:** 2026-10-08 · **Type:** Teknisk anbefaling · **ADR:** ADR-0001
- **Valgt løsning:** `docs/product/requirements.yaml` er kilden. `REQUIREMENTS.md` og `TRACEABILITY_MATRIX.md` genereres (`scripts/kb/build_docs.py`). `scripts/kb/check_kb.py` kontrollerer kontrollsum, ID-er, felt, linjedekning av mandatet, statusregler og skill-format, og kjøres i GitHub Actions.
- **Alternativer:** Håndskrevet Markdown (forkastet: kan ikke kontrolleres maskinelt), database/verktøy (forkastet: unødvendig avhengighet).

## DEC-0008 – Lovable Cloud som backend, SQL-migrasjoner i repoet
- **Dato:** 2026-10-08 · **Type:** Teknisk anbefaling (må testes ved første leveranse) · **ADR:** ADR-0002
- **Valgt løsning:** Lovable Cloud (Supabase-basert: Postgres, Auth, Storage, Realtime, funksjoner). Hele databaseskjemaet skrives som SQL-migrasjoner i `supabase/migrations/` slik at det kan gjenoppbygges i et eget Supabase-prosjekt eller en desktop-backend senere.
- **Alternativer:** Eget Supabase-prosjekt (full kontroll og CLI, men egen konto, eget dashboard for Mars, og Supabase-API-et er uansett ikke nåbart fra Claudes miljø i dag – så migrasjoner må uansett kjøres manuelt eller via Lovable).
- **Begrunnelse:** Færrest steg for Mars; ett sted for nøkler og testing. Portabilitet sikres ved at skjema og domenelogikk ligger i repoet.
- **Konsekvenser:** Lovable må få beskjed om å kjøre migrasjoner/deploye funksjoner etter hver synk. Kan ikke byttes automatisk senere («decide early») – derfor holdes alt Supabase-spesifikt i ett adapterlag.

## DEC-0009 – Lagdelt arkitektur med plattformnøytral domenekjerne
- **Dato:** 2026-10-08 · **Type:** Teknisk anbefaling · **ADR:** ADR-0003
- **Valgt løsning:** `src/core/` (ren TypeScript: domenemodell, kommandoer, invarianter, tidsmodell, manusparser) uten avhengighet til React, Lovable eller Supabase. Adaptere for lagring, medier og AI. UI i rammeverket Lovable genererer.
- **Begrunnelse:** Mandat 1.2 og prinsipp 28 (portabilitet til macOS/Windows), testbarhet av invarianter.

## DEC-0010 – Samarbeid: RLS per medlemskap, revisjonskontroll, tilstedeværelse
- **Dato:** 2026-10-08 · **Type:** Teknisk anbefaling · **ADR:** ADR-0004
- **Valgt løsning:** Tabeller `project_members` og `project_invitations`; radnivåsikkerhet (RLS) på alle prosjekttabeller via funksjonene `is_project_member()`/`has_project_role()` (presisert i DEC-0020); optimistisk revisjonskontroll (revisjonsnummer per objekt) slik at ingen skriving basert på en gammel versjon overskriver i stillhet; Supabase Realtime for endringsvarsler og tilstedeværelse. Ikke sanntids-CRDT-redigering i MVP.
- **Berørte krav:** REQ-0523–REQ-0529 (tekniske utledninger av DEC-0003).
- **Alternativer:** CRDT (Yjs) for samtidig tekstredigering – vurderes senere hvis blokkvis låsing oppleves for grovt.

## DEC-0011 – Endringer som kommandologg
- **Dato:** 2026-10-08 · **Type:** Teknisk anbefaling · **ADR:** ADR-0005
- **Valgt løsning:** Alle strukturelle og innholdsmessige endringer uttrykkes som kommandoer (f.eks. `MoveOccurrence`, `EditBlockText`) som valideres mot invariantene i domenekjernen, utføres atomisk i én databasetransaksjon (RPC) og lagres i `change_log` med forfatter, tid, forrige og ny verdi. Gir angre/gjør om per bruker, selektiv tilbakeføring (mandat 21.2 C), historikk, konsekvensanalyse og revisjonsspor.

## DEC-0012 – Tidsmodell i heltall bilder
- **Dato:** 2026-10-08 · **Type:** Teknisk anbefaling · **ADR:** ADR-0006
- **Valgt løsning:** All tid lagres som heltall bilder (frames) med rasjonell bildefrekvens per produksjon (f.eks. 25/1, 24000/1001). Absolutte filmtidskoder beregnes, lagres aldri som sannhet. Lyd i samples med egen rate, konvertert ved behov.

## DEC-0013 – Manusimport: PDF og DOCX først
- **Dato:** 2026-10-08 · **Type:** Teknisk anbefaling · **ADR:** ADR-0007
- **Valgt løsning:** Fase 2 støtter tekstbasert PDF (Final Draft-eksport, posisjonsbasert tolkning av innrykk) og DOCX (stiler og innrykk). Fountain-import/-eksport senere; FDX hvis det dukker opp. Originalfilen bevares alltid uendret. Usikre tolkninger merkes og kan korrigeres.

## DEC-0014 – Avspilling og animatic-eksport i nettleseren
- **Dato:** 2026-10-08 · **Type:** Teknisk anbefaling · **ADR:** ADR-0008
- **Valgt løsning:** Forhåndsvisning med Canvas2D/WebGL og Web Audio i nettleseren. Eksport av animatics i nettleseren med WebCodecs + MP4-muxing. Lange filmer og tung omkoding (FFmpeg) i en ekstern medietjeneste som kobles på i fase 4–5. Ingen generativ AI eller betalte kall i denne kjeden (INV-11).

## DEC-0015 – Begrepsavklaringer i domenemodellen
- **Dato:** 2026-10-08 · **Type:** Teknisk anbefaling (tolker uklarheter i mandatet uten å endre kravene; se `docs/architecture/DOMAIN_MODEL.md` §0)
- **Hovedpunkter:** «Skjul» = bare visning; «deaktiver» = produksjonsmessig (påvirker aktiv film). «Skjulte scener» i 5.2/7.2 tolkes som deaktiverte. «Delsekvens», «produksjonsdelsekvens» og «produksjonssegment» modelleres som én entitet `ProductionSegment` med årsakstype. «Aktiv filmversjon» er en peker per sceneforekomst, ikke en status. Hver scene har et felt for fortellingstid (standard = manusrekkefølge, manuelt overstyrbart). Ved narrativ splitting beholder første del ID-en; ny del får ny ID med «avledet fra»-relasjon. Varighet: «bekreftet/faktisk spilletid» = varighet fra brukerplanlagt eller produsert materiale for aktiv versjon.

## DEC-0016 – Skills
- **Dato:** 2026-10-08 · **Type:** Teknisk anbefaling
- **Valgt løsning:** De 12 P0-skillene skrives som prosjektspesifikke skills (`.claude/skills/`). Eksterne skills/plugins installeres ikke før kilde, lisens og innhold er vurdert og versjonen er pinnet (`docs/development/EXTERNAL_SKILLS_POLICY.md`, vurdering i `docs/references/technical/SKILLS_ASSESSMENT.md`).

## DEC-0017 – Mørkt tema som standard; norsk UI med oversettbar struktur
- **Dato:** 2026-10-08 · **Type:** Midlertidig antakelse
- **Antakelse:** Mørkt, dempet filmatisk tema er standard og eneste tema i MVP. Grensesnittet er norsk, men all tekst går gjennom en oversettelsesstruktur slik at engelsk UI kan legges til (mandat 23.8: grensesnittspråk velges uavhengig).
- **Må avklares:** Trengs lyst tema? Trengs engelsk grensesnitt tidlig for samarbeidspartnere? (OPEN_QUESTIONS Q-02)

## DEC-0018 – Bare brukerens egne API-nøkler
- **Dato:** 2026-10-08 · **Type:** Midlertidig antakelse
- **Antakelse:** MVP bruker bare nøkler brukeren selv legger inn (mandat 19.1). I et delt prosjekt eies nøklene av prosjektet og administreres av eier; bare roller med kostnadsrett kan utløse betalte kall (REQ-0528).
- **Må avklares:** OPEN_QUESTIONS Q-01.

## DEC-0019 – Etableringsoppdraget og invariantlisten
- **Dato:** 2026-10-08 · **Type:** Bekreftet av bruker
- **Beslutning:** Mars' oppdrag «Animatic Studio – Etablering av ferdighetsbibliotek og varig prosjektkunnskap» (del A–K) gjelder som arbeidsinstruks for kunnskapsbase, kildehierarki (B1), arbeidsprosedyre før/etter implementering (B2), milepælsrevisjon (B4), skills (C–G), designkvalitet (H) og oppstart (J). Del B3 er Mars' liste over kritiske systeminvarianter, ordrett:
  1. Manus og film er to visninger av den samme aktive produksjonsstrukturen.
  2. Scenenumre er ikke permanente identifikatorer.
  3. En scene beholder sin identitet gjennom flytting og omnummerering.
  4. Spinoffer kan bruke samme kildescene med selvstendig rekkefølge og lokale endringer.
  5. Norsk er hovedmanus.
  6. Andre språkversjoner skal ikke automatisk endre norsk hovedmanus.
  7. Ferdige filmsekvenser skal ikke overskrives automatisk etter manusendringer.
  8. Brukeren skal kunne godkjenne avvik, oppdatere produksjonsmateriale eller angre relevant endring.
  9. Karakterkontinuitet følger fortellingstid, også ved flashbacks.
  10. Produksjonsteknisk segmentering skal ikke endre manusscenenes identiteter.
  11. Generativ AI skal være valgfritt for ordinær 2D-animatic-avspilling og eksport.
  12. Betalte API-kall skal følge eksplisitte kostnadsgodkjenninger.
  13. Delte ressurser skal være versjonerte og ikke-destruktive.
- **Konsekvenser:** INV-01–INV-13 i `INVARIANTS.md` er disse punktene. INV-14 er fra mandat kap. 2. INV-C1–C3 er tekniske utledninger. Oppdragsteksten er lagret som `docs/product/ESTABLISHMENT_BRIEF.md`.

## DEC-0020 – Presiseringer etter revisjon av skills og kravregister
- **Dato:** 2026-10-08 · **Type:** Teknisk anbefaling (presiserer DEC-0010/0011, ADR-0004/0005; endrer ingen produktkrav)
- **Bakgrunn:** Uavhengig skilltest (`SKILL_TEST_REPORT.md`) og kravrevisjon fant uklarheter og motstrid mellom dokumentene.
- **Beslutninger:**
  1. **Skrivevei:** Klienten har kun lesetilgang til prosjekttabeller (RLS `select`). All skriving går via én `security definer`-RPC `public.apply_command(project_id, command jsonb, base_revisions jsonb)` som sjekker medlemskap, rolle og revisjoner og kaller interne funksjoner `private.cmd_<kommando>`. `insert/update/delete` er tilbakekalt for `authenticated` på prosjekttabeller. Unntak: rene brukerinnstillinger.
  2. **Skjema for hjelpefunksjoner:** `private.is_project_member(uuid)`, `private.has_project_role(uuid, text)`, `private.can_approve_costs(uuid)` – `security definer`, `search_path = ''`. Skjemaet `private` eksponeres ikke via API-et.
  3. **Revisjonskonflikt:** RPC-en kaster SQLSTATE `P0409` («revision_conflict») med detaljer om hvilke objekter som er endret. Adapterlaget oversetter til konfliktvisning.
  4. **Lagringssti (kanonisk):** `<bøtte>/<project_id>/<entity_id>/<sha256>.<ext>`, bøtter `sources`, `resources`, `generated`, `renders-tmp`, `exports`, `backups` (alle private). Andre dokumenter viser hit (DATA_RELATIONSHIPS.md).
  5. **Blokkrevisjoner:** Tabell `script_block_revisions(block_id, rev, text, author, created_at)`; `script_blocks.current_rev`. `revision` på rader er bare samtidighetskontroll. `takes.produced_from.blockRevisions` viser til `rev`.
  6. **Fortellingstid:** For `storyTime.kind = linear` beregnes fortellingstid fra scenens plass i hovedproduksjonens rekkefølge (flytting oppdaterer den). For `flashback/flashforward/dream/jump` er den et manuelt anker (relativt til en annen scene) som ikke endres ved flytting. Scener som bare finnes i en spinoff får anker relativt til nærmeste foregående scene som også finnes i hovedfilmen, med mindre brukeren angir annet.
  7. **Gjenbruk av takes i spinoff:** En spinoffs sceneforekomst kan peke på en take som eies av hovedfilmens forekomst (referanse, ingen kopi, 24.3). Trim/utdrag lagres på spinoffens forekomst.
  8. **Lokal kontinuitet i spinoff:** `continuity_overrides(production_id, event_id, action: disable|replace, replacement_event_id?)` slår av eller erstatter en delt hendelse bare i én produksjon (10.8).
  9. **Sammenslåing:** `MergeScenes` setter `scenes.merged_into` på den sammenslåtte scenen; den kan ikke gjenaktiveres som egen scene uten `UnmergeScene` (invers kommando). Fortellingstid og aktiv versjon: se Q-07.
  10. **Samme scene flere ganger i én produksjon:** Tillatt (f.eks. trailer med to utdrag fra samme scene). Ingen unik nøkkel på `(production_id, scene_id)`.
  11. **Kostnadsporten (INV-12/INV-C3)** eies av skillen `ai-cost-quality-governance` når den opprettes i M5. Inntil da: `API_INTEGRATIONS.md` §2 og `secure-development`.

## DEC-0021 – API-kostnader i testfasen
- **Dato:** 2026-10-08 · **Type:** Bekreftet av bruker
- **Mars' ord:** «i begynnelsen betaler jeg alt sammen med mine API-kreditter … dette er i testfasen uansett – men når flere samarbeider om et prosjekt er API-kostnadene avklart allerede, så det er ikke et problem enda.»
- **Beslutning:** I testfasen legger Mars inn egne API-nøkler og betaler alle AI-kostnader. Fordeling av kostnader når flere samarbeider avtales mellom partene utenfor appen.
- **Konsekvenser:** Q-01 er avklart for testfasen. DEC-0018 (nøkler eies av prosjekteier) er i praksis bekreftet for testfasen. Kostnadsgodkjenning før betalte kall (INV-12) og budsjettgrenser gjelder fortsatt – de beskytter også Mars' egne kreditter. Rollestyrt kostnadsrett (REQ-0528, INV-C3) beholdes som teknisk anbefaling.

## DEC-0022 – Domenekjernen på serveren, atomiske endringssett, migrasjoner i db/migrations
- **Dato:** 2026-10-08 · **Type:** Teknisk anbefaling · **ADR:** ADR-0009 · **Erstatter:** DEC-0020 pkt. 1 og 3
- **Problemstilling:** DEC-0020 la opp til én SQL-funksjon per kommando (`private.cmd_*`). Det ville duplisert all domenelogikk i SQL og svekket portabiliteten (prinsipp 28). Samtidig viste Lovables dokumentasjon at Lovable Cloud styrer migrasjoner med Drizzle i `drizzle/` og ikke kjører migrasjonsfiler som kommer via Git.
- **Valgt løsning:**
  1. Klienten kaller serverfunksjonen `runCommand` (TanStack Start). Den krever innlogging, sjekker rolle ≥ redaktør, laster prosjektet, kjører `applyCommand` i `src/core` (validering + invarianter) og lager et endringssett (`diffStates`).
  2. `public.apply_changes(...)` (bare `service_role`) lagrer endringssettet atomisk: sjekker rolle, at alle rader tilhører prosjektet og revisjon per rad (SQLSTATE `P0409`), og skriver `change_log`. Takes kan ikke slettes/overskrives; historikk og logg er uforanderlige (triggere).
  3. Klienten har bare lesetilgang (RLS). Øvrige RPC-er: `create_project`, `create_invitation`, `accept_invitation`.
  4. Valgfri kommando-ID fra klienten gjør nye forsøk etter nettverksbrudd idempotente.
  5. Migrasjoner skrives som `db/migrations/NNNN_navn.sql` og kjøres i Lovable Cloud ved at Mars ber Lovable kjøre filen uendret (LOVABLE_SYNC.md B). Lovable registrerer dem selv i `drizzle/`, som vi ikke rører.
  6. Appen sjekker `schema_version` og viser et varsel hvis migrasjonen ikke er kjørt.
- **Alternativer:** Per-kommando SQL (forkastet: dobbel logikk), skriving direkte fra klienten med RLS-skrivepolicyer (forkastet: invarianter kan omgås).
- **Konsekvenser:** All domenelogikk testes én gang (kjernen) og gjelder både klient og server. Hver kommando laster hele prosjektet på serveren – akseptabelt for én film (~100 scener, ~5 000 blokker), men må optimaliseres senere (KI-12).
- **Verifisering:** `tests/db/run-db-tests.ts` (15 tester mot lokal Postgres med Supabase-emulering).

## DEC-0023 – Manusimport i nettleseren; originalen i privat bøtte; import som én kommando
- **Dato:** 2026-10-09 · **Type:** Teknisk anbefaling · **ADR:** ADR-0007, ADR-0010
- **Valgt løsning:**
  1. Filen leses i nettleseren: PDF med pdf.js (`pdfjs-dist` 4.10, Apache-2.0, arbeider lastes ved behov), DOCX med egen leser (fflate, MIT). Ingen manustekst sendes til tredjepart.
  2. Brukeren ser en forhåndsvisning (scener, numre, usikre tolkninger, merknader, mulig dobbeltimport) før noe lagres.
  3. Originalen lastes opp uendret til den private bøtten `sources` (`<prosjekt>/<sha256>/<filnavn>`, maks 100 MB) og registreres i `imported_documents` (uforanderlig, med kobling til endringen). Mislykket opplasting stopper importen.
  4. Hele manuset lagres som én atomisk kommando `ImportScreenplay` som kan angres samlet. Hver blokk får kildereferanse (side, høyde) og ev. usikkerhet; overskrifter uten nummer markeres.
  5. Manuelle linjeskift og ekstra tomme linjer fra originalen bevares i teksten (avgjøres ut fra linjebredden 61/35 tegn), slik at sidene blir som i originalen.
- **Alternativer:** Tolkning på serveren (forkastet: tyngre i Lovable/Cloudflare, manus må uansett leses i klienten for forhåndsvisning); én kommando per scene (forkastet: kan ikke angres samlet, halvferdig import ved feil).
- **Konsekvenser:** Tittelsiden lagres ikke ennå som egen metadata (KI-20). Skannede PDF-er uten tekst kan ikke importeres (gir tydelig melding).
- **Verifisering:** `tests/golden/reference-screenplay.test.ts` (97 scener, numre, rundtur), `tests/unit/import-split-merge.test.ts`, DB-test «0002: import …», skjermbilde 11 (forhåndsvisning med ekte fil i nettleser).

## DEC-0024 – Sidebryting i kjernen og manuseksport til PDF/DOCX
- **Dato:** 2026-10-09 · **Type:** Teknisk anbefaling · **ADR:** ADR-0010
- **Valgt løsning:** `src/core/screenplay/paginate.ts` bryter manus i sider etter målte verdier fra referansemanuset (US Letter, 54 linjer, handling 61 tegn, replikk 35, parentes 25; deling bare ved setningsslutt; (MORE)/(CONT'D) i toppmargen). For importert tekst følger visningen og PDF-eksporten originalens sideskift («låste sider», bransjepraksis når et manus er i produksjon); ny eller flyttet tekst flyter fritt, og et låst sideskift kan aldri hoppe over sider. Låste sider kan slås av i verktøylinjen.
- **Eksport (mandat 5.2–5.3):** Nummereringsmetode velges ved hver eksport med forhåndsvisning (`src/core/screenplay/numbering.ts`): fortløpende eller bevart produksjonsnummerering med mellomnumre (42A, 42B, uten kollisjoner); historisk kommer med manusversjoner. PDF skrives direkte fra sidene (Courier, standardfont, WinAnsi – norske tegn og typografiske anførselstegn), slik at PDF = skjerm. DOCX skrives som redigerbar flyt med faste innrykk, scenenumre i begge marger og sidetall fra side 2 (Word bryter sidene selv, KI-21). Eksport endrer aldri prosjektet.
- **Begrunnelse:** Final Draft sine regler er ikke dokumentert. Fri bryting treffer 63 av 97 scenestarter eksakt og alle innen én side; låste sider treffer 97 av 97.
- **Verifisering:** `tests/golden/reference-screenplay.test.ts` (låst: 97/97 og 105 sider; fri: alle innen ±1 side, ≥ 60 eksakt; eksportert PDF og DOCX leses inn igjen med samme scener, numre og tekst), `tests/unit/{paginate,numbering,export}.test.ts`.

## DEC-0025 – Redigering i manus: fjerning, splitting, angre
- **Dato:** 2026-10-09 · **Type:** Teknisk anbefaling · **ADR:** ADR-0005, ADR-0010
- **Valgt løsning:**
  1. «Fjern blokk» setter `script_blocks.removed` (kommandoene `RemoveBlock`/`RestoreBlock`). Tekst og historikk beholdes og kan hentes tilbake fra scenen. Ferdig film som bygget på blokken blir utdatert (avvik), ikke endret.
  2. `SplitScene` flytter blokkene (samme ID-er) til en ny, avledet scene rett etter. Brukes scenen også i en annen produksjon, må det lages en egen variant først (INV-04). `MergeScenes` krever at kildescenen bare brukes ett sted; den beholdes som «sammenslått» og kan ikke slås sammen to ganger.
  3. Angre/gjør om er per bruker og per økt. Hver kommando – også angring – sendes med revisjonene brukeren ser, så serveren avviser alt som bygger på en utdatert visning. Har en annen bruker endret noe angringen ville rørt (sanntidsvarsel med `affected_ids`), stoppes angringen med forklaring (ingen stille overskriving, INV-C1).
  4. Endringer vises straks (kjernen kjøres lokalt), lagres i rekkefølge, og andres endringer hentes via sanntid på `change_log`. Ny innlasting utsettes til egne endringer er lagret; feiler en lagring, sendes ikke kommandoer som var bygget oppå den.
  5. Kommandoer som bare finnes som invers (`Undo*`, `UnmergeScenes`) godtas av serveren bare når de er identiske med inversen til brukerens egen lagrede endring i `change_log`. Kjernen validerer dem i tillegg strukturelt (riktig scene/variant/forekomst, ingen tekst lagt til av andre, ingen kolliderende plass). Databasen har unik plass per blokk i en variant (`script_blocks_variant_order_unique`, utsatt kontroll).
  6. Kommandoer over 6 MB avvises.
- **Kodegjennomgang 2026-10-09:** en uavhengig gjennomgang fant 15 forhold (bl.a. at inverskommandoer kunne misbrukes, falske konflikter ved dobbel angring, tap av egne endringer ved ny innlasting, sletting av andres tekst ved angring av import). Alle er rettet og har regresjonstester (`tests/unit/review-regressions.test.ts`, DB-test for samtidige innsettinger).
- **Verifisering:** egenskapstester i `tests/invariants/random-sequences.test.ts` (nå med Split, Merge, Fjern/Gjenopprett, elementtype, overskrift og usikkerhet – hver kommando + invers gir samme innhold), `tests/unit/import-split-merge.test.ts`, DB-test for `removed`.

## DEC-0026 – Deaktiverte og unummererte scener i manuseksport
- **Dato:** 2026-10-09 · **Type:** Midlertidig antakelse (Q-08) · **ADR:** ADR-0010
- **Antakelse:**
  1. Med «Bevar produksjonsnummerering» og «Ta med deaktiverte scener» vises en deaktivert scene som «NN UTGÅR» uten innhold (norsk for bransjens «OMITTED»). Med «Fortløpende» tas den med i sin helhet, uten nummer og merket «[DEAKTIVERT SCENE – IKKE MED I FILMEN]».
  2. Scener som var unummerert i originalmanuset beholder ingen nummer som standard; nye scener laget i appen får mellomnummer (42A). Brukeren kan krysse av for å gi også de opprinnelig unummererte et mellomnummer.
  3. «Bevar valgt historisk nummerering» kommer når manusversjoner finnes (M2+).
- **Må avklares med Trollfilm:** ønsket ordlyd («UTGÅR»/«OMITTED»), og om den unummererte scenen i «Jula på Dovre» skal få nummer.

## DEC-0027 – «Vis kun valgt scene» i manusvisningen
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker
- **Mars' ord:** «Nytt krav til UI, du legger det inn i listen der det hører hjemme … I denne visningen av manus ønsker jeg en avkrysningsboks som sier vis kun valgte scene.» Haster ikke; tas med i neste leveranse.
- **Beslutning:** Nytt krav REQ-0531 (modul SCRIPT/UI), plassert sammen med søk og filtrering (REQ-0073–REQ-0075).
- **Teknisk tolkning (Teknisk anbefaling):** Boksen står i verktøylinjen i Manus. Avkrysset viser sidene bare linjene i valgt scene, men med samme sidetall og plassering som i hele manuset (sidene brytes ikke på nytt). Uten valgt scene vises hele manuset med en kort forklaring. Valget er bare visning (REQ-0075) og huskes ikke mellom økter.

## DEC-0028 – M2 del 2: manusversjoner, sammenligning, søk/filter, varighet, tilstedeværelse
- **Dato:** 2026-10-09 · **Type:** Teknisk anbefaling (tolker mandat 2.2, 4.5, 5.1–5.2, 6 og DEC-0010) · **ADR:** ADR-0010
- **Manusversjoner (migrasjon 0003):** `script_versions` med løpenummer per produksjon, navn, merknad, forelder og et uforanderlig øyeblikksbilde (JSON) som databasen lager selv fra lagrede data (`private.script_snapshot`), i samme setning som siste endring i loggen leses (`change_log.seq`). Kjernen har samme format (`snapshotFromState`), og en DB-test kontrollerer at de er like. En versjon kan vises, sammenlignes og eksporteres som PDF slik den var. Å gjøre en gammel versjon til gjeldende manus er ikke bygget ennå.
- **Sammenligning:** per sceneforekomst (permanent i produksjonen). Typer: ny, fjernet, deaktivert, aktivert, flyttet (lengste felles rekkefølge – bare scener som faktisk er flyttet), nytt nummer (ikke ny scene, mandat 5.1), endret overskrift, dialog, handling, karakterer, aktiv filmversjon og scenevariant. Objekter kommer med ressursbiblioteket.
- **Historisk nummerering (REQ-0083):** nummer per forekomst fra valgt versjon; nye scener får mellomnumre; samme nummer brukes aldri to ganger.
- **Søk og filter (REQ-0073–0075):** fritekst og karakter. En karakter «opptrer» når den har replikk eller nevnes i handling/overskrift med stor forbokstav eller store bokstaver (så FAR ikke treffer «far»). Filteret er bare visning; flytting er av mens filteret er på.
- **Varighet (REQ-0109, 0115–0117):** estimat = etablering per scene + replikkord / taletempo + linjer handling × sekunder per linje. Standardverdier (150 ord/min, 2 s per linje, 2 s per scene, minst 5 s) er kalibrert så «Jula på Dovre» blir omtrent ett minutt per side (1:44 for 105 sider). Antakelsene kan justeres på prosjektoversikten, men lagres ikke ennå. Vises bare på oversikten, aldri i manuset.
- **Tilstedeværelse:** private Realtime-kanaler per prosjekt med policy på `realtime.messages` (bare medlemmer). Viser initialer i verktøylinjen og hvem som står i hvilken scene. Ingenting lagres.
- **Ytelse:** blokker per variant indekseres én gang per tilstand (WeakMap), så filter, sidebryting og estimat tar millisekunder også for et helt manus.
- **Kodegjennomgang:** uavhengig gjennomgang fant 12 forhold (bl.a. tregt karakterfilter, offentlig tilstedeværelseskanal, feil versjon ved produksjonsbytte, sammenligning på scene i stedet for forekomst). Alle er rettet.

## DEC-0029 – Rekkefølge og synlighet bare i redigeringsmodus; flyttede scener markeres; fyldigere sammenligning
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker
- **Mars' ord:** «beskrivelsen om hva som er endret er litt kort, og det er litt for enkelt å endre rekkefølge på scener, dette er noe som gjøres skjeldent og er vel egentlig en funksjon som bør slåes på om en ønsker å gjøre det, og det kan godt være noe en slår på samtidig som en kan slå på og av synlighet, scener som er flyttet på bør også ha en litt annen bakgrunnsfarge inntill de er lagret i ny versjon. Disse endringen baker du inn i neste commit.»
- **Beslutning:** Tre nye krav:
  1. REQ-0532: Scenerekkefølge og synlighet (aktiv/deaktivert) kan bare endres når brukeren har slått på «Endre rekkefølge og synlighet». Av som standard.
  2. REQ-0533: Scener som er flyttet siden siste lagrede manusversjon, har en annen bakgrunnsfarge i scenelisten til en ny versjon er lagret.
  3. REQ-0534: Sammenligningen av versjoner viser hva som faktisk er endret, ikke bare hvilken type endring.
- **Teknisk tolkning (Teknisk anbefaling):**
  - Bryteren står øverst i scenelisten og gjelder bare for brukeren selv i denne økten (huskes ikke). Når den er av, kan scener ikke dras, Alt + pil flytter ikke, og bryterne for aktiv/deaktivert er skjult både i scenelisten og i inspektøren (status vises fortsatt som tekst). Andre redigeringer (tekst, overskrift, del/slå sammen) er uendret.
  - «Flyttet» beregnes som i sammenligningen (lengste felles rekkefølge mot siste lagrede versjon av produksjonen), så bare scener som faktisk har byttet plass markeres – ikke alle som får ny plassering fordi en annen er flyttet. Finnes ingen lagret versjon, markeres ingenting, og listen sier det.
  - «Beskrivelsen er kort» tolkes som teksten i versjonssammenligningen. Den viser nå for hver scene hvilke linjer som er endret (før og etter, med endrede ord uthevet), lagt til og fjernet, og for flyttede scener hvor scenen sto før og står nå. Commit-meldingene gjøres også fyldigere.

## DEC-0030 – M3 del 1: ressursbibliotek (ressurser, alternative navn, visuelle varianter, bildeversjoner)
- **Dato:** 2026-10-09 · **Type:** Teknisk anbefaling (tolker mandat kap. 8–9, REQ-0121–0136, REQ-0146, REQ-0149) · **ADR:** ADR-0010
- **Datamodell (migrasjon 0004):** `assets` (type, foretrukket navn, alternative navn med type – alternativt, kallenavn, tidligere, språk –, beskrivelse, kategori, stikkord, arkivert), `asset_variants` (visuell variant: navn, stil – originalt referansebilde, illustrert, filmrealistisk, animatic, plakat, annet –, utseendetilstand, godkjent versjon, arkivert) og `asset_versions` (uforanderlig bilde i privat bøtte `assets`, løpenummer per variant). Identitet (ressurs), utseendetilstand og stil holdes atskilt (REQ-0149). Arkivering er ikke sletting.
- **Godkjenning:** eksplisitt per variant (`ApproveAssetVersion`). Et nytt bilde endrer aldri godkjent versjon (REQ-0028, REQ-0146). Et bilde kan bare angres bort hvis det er det nyeste i varianten og aldri har vært godkjent (sjekkes også på serveren mot endringsloggen).
- **Bruk i manuset (REQ-0131):** beregnes fra navnene – karakterer: replikk eller nevnt (stor forbokstav), lokasjoner: stedet i sceneoverskriften, objekter/dyr/miljøer: ord som begynner med navnet («vase» → «vasen», vises som mulige treff). Karakterfilteret i Manus bruker alle navnene til en karakter fra biblioteket (KI-29 løst).
- **Forslag fra manuset (REQ-0128):** karakterer og steder som mangler; navn som ligner en ressurs (felles ord eller nesten lik stavemåte) foreslås som alternativt navn – ingenting legges til før brukeren velger.
- **Utsatt:** plassering i 2D-scener (M3 del 2), stilprofiler (REQ-0147, fase 5), tidsstyrte utseendeendringer (REQ-0150, M6).
- **Kodegjennomgang:** uavhengig gjennomgang fant 9 forhold (bl.a. filnavn med æøå ga feil ved opplasting, bibliotekskommandoer kunne gå tapt før migrasjonen var kjørt, utdaterte søkeresultater etter endret overskrift, ytelse). Alle er rettet.

## DEC-0031 – Notater i manus, søketreff, scenelisten følger manuset
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker (krav) + Teknisk anbefaling (tolkning)
- **Mars' ord:** «en notater funksjon, som gjør at brukeren kan legge inn kommentarer og notater til ord eller setninger, eller bare som en pin på scenen, dette være seg helt frie notater, men stemplet i hjørnet med liten tekst, hvem og når som la den inn, disse skal kunne enkelt slettes med en liten popup advarsel, og de skal også kunne velges å være med på eksporten (default av) og en skal også kunne søke i disse slik at de gir treff også i søkefunksjonen. (generelt ønsker jeg meg at systemet viser meg hva den gir treff på i søket på en tydelig, men subtil måte slik at brukeren forstår hva den traff på. Notatene skal bli med på en slik måte i eksporten, at en ny import av et manus dokument med notater, da skal disse gjenskapes på samme vis som de ble opprtettet med samme funksjonalitet. EN mulighet for å krysse av for vis/skjul notater i grensesnittet er viktig. Når en scroller nedover i manuset da bør også velgeren på venstre side oppdatere med hva vi nå ser i manuset.» Og: «når brukeren klikker en scene i venstre side … denne scenens overskrift vises midt på siden, det bør være i toppen».
- **Krav:** REQ-0535–REQ-0543.
- **Teknisk tolkning:**
  1. Notater er felles for prosjektets medlemmer (som resten av manuset) og lagres i `script_annotations` (migrasjon 0004). Et notat på tekst festes til blokken med tegnområde og den markerte teksten; endres teksten, finnes det markerte igjen nærmest der det sto, ellers vises notatet ved starten av elementet med beskjed om at teksten er endret. En nål festes til scenen (scenevarianten).
  2. Stempelet er visningsnavnet og tidspunktet da notatet ble laget, og settes av serveren (ingen kan skrive i andres navn). Ved import fra fil beholdes originalens navn og tidspunkt. Endres teksten i et notat, beholdes stempelet (KI-36). Et notat på hele elementet følger hele teksten også etter endringer.
  9. Kodegjennomgang: uavhengig gjennomgang fant 11 forhold (bl.a. kommentarer som falt ut av Word-eksporten, notater over linjeskift som ble nåler ved ny import, «__proto__» som ID ga serverfeil, notater som hindret angring uten forklaring, ytelse ved skriving). Alle er rettet med tester, unntatt stempel ved endring (KI-36).
  3. Notat på ord: merk teksten i manuset → «Legg til notat». Notat på hele elementet eller nål på scenen: fra inspektøren. Alle redigeringsrettigheter kan endre og slette; sletting krever bekreftelse og kan angres (⌘Z).
  4. «Vis notater» i verktøylinjen (på som standard) viser/skjuler markeringene og symbolene i margen.
  5. Eksport: «Ta med notater» (av som standard). Word: vanlige Word-kommentarer på riktig tekst (nåler på sceneoverskriften). PDF: gule markeringer med notatet som merknad (navn og tid). Import av PDF/Word lager notatene igjen – også kommentarer andre har skrevet i Word eller merknader fra en PDF-leser. Et notat som ikke kan plasseres, blir en nål på scenen med den markerte teksten først (ingenting går tapt).
  6. Søk treffer også notater. Treff markeres på sidene med diskret gulgrønn bakgrunn, og scenelisten viser «Treff: replikk, notat …».
  7. Når du blar, markeres scenen øverst i visningen i scenelisten (stripe til venstre), og listen ruller med – uten å endre valget eller inspektøren.
  8. Klikk på en scene i listen viser sceneoverskriften øverst i manusvisningen.

## DEC-0032 – «Endret av …» på notater; bilder opptil 2 GB
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker (endret av) + Teknisk anbefaling (filstørrelse)
- **Mars' ord:** «Vi går for: «endret av …»». Og: «50 MB er alt for lite til så mange assets og etter hvert til genererte filmer. Er vi nødt til å sette et tak? Eller er det 50MB per fil?»
- **Beslutning:**
  1. Alle med skrivetilgang kan endre et notat. Notatet beholder forfatter og tidspunkt, og viser i tillegg «endret av [navn] · [tid]» (bare «endret · [tid]» når forfatteren selv endrer). Navnet settes av serveren fra profilen. Angre fjerner endringsstempelet igjen. Løser KI-36.
  2. 50 MB var grensen per fil (ikke totalt) som Claude hadde valgt for bilder. Den heves til 2 GB per fil, som er Lovable Clouds standard (maks 5 GB per fil kan stilles inn i Lovable). Det finnes ingen fast grense for total lagring; lagring faktureres etter bruk i Lovable Cloud.
  3. Film (M4) får egen bøtte og opplasting i biter som kan gjenopptas (TUS), avklares når filmimport bygges.
- **Migrasjon:** `0005_note_edits_large_files.sql` (kolonner for endringsstempel, filstørrelse opptil 5 GB). Bøttens egen grense endres i Lovables lagringsverktøy.
- **Tillegg 2026-10-09 (Teknisk):** Lovable kjørte 0005 med et avvik: ny kolonne `byte_size_big` (bigint) i stedet for å endre typen på `byte_size`. Den gamle kolonnen ble stående påkrevd med 50 MB-grense, så ingen bilder kunne lastes opp. Repoets 0005 er oppdatert til det som faktisk ble kjørt (repoet skal speile databasen), og `0006_byte_size_big.sql` gjør `byte_size` valgfri uten grense og fyller `byte_size_big` automatisk for eldre klienter. Appen bruker nå `byte_size_big` (KI-38).

## DEC-0033 – LOVABLE_SYNC.md inneholder bare meldingen som skal limes inn
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker
- **Mars' ord:** «i Fremtiden kan du gjøre det slik at du fornyer "LOVABLE_SYNC.md" slik at jeg bare kopierer og limer inn alt som står i "LOVABLE_SYNC.md" - det er mye enklere for meg.»
- **Beslutning:** `docs/development/LOVABLE_SYNC.md` skrives helt på nytt ved hver leveranse og inneholder bare den ferdige meldingen til Lovable, uten overskrifter eller forklaring. Veiledningen (oppsett, steg etter leveranse, API-nøkler, feilsituasjoner) og listen over kjørte migrasjoner flyttes til `docs/development/LOVABLE_GUIDE.md`. Når en leveranse ikke har databaseendring, ber meldingen Lovable bare bekrefte skjemaversjonen.

## DEC-0034 – Gratis gjenkjenning av ressurser i manuset (forslag 1–5)
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker (omfang) + Teknisk anbefaling (reglene)
- **Mars' ord:** «OK kjør begge i samme økt!» (svar på forslag 1–5 om bedre gjenkjenning uten AI).
- **Beslutning:** Forslagene fra manuset (REQ-0128) utvides uten AI og uten kostnad:
  1. Replikknavn ryddes: tall («MARTIN 9»), grupper («LAURITS OG ROLF» → to karakterer), «MALIN TIL MAJA» → MALIN, beskrivelser («OLA SMILENDE» → OLA); sjeldne, nesten like skrivemåter slås sammen som mulig skrivefeil («LAURIT» → LAURITS).
  2. Navngitte ting uten replikk («Svarten»): stor forbokstav midt i en setning, minst to ganger i minst to scener. Typen (karakter, dyr, objekt) velges av brukeren.
  3. Lokasjoner: «PÅ TUNET», «KJØKKENET»/«KJØKKEN» og «GÅRD, TUNET» slås sammen med hovedformen når det er entydig.
  4. Objekter og rekvisitter: substantiv som går igjen i handlingen i minst tre scener (etter en/ei/et eller foran sin/hans), merket usikre.
  5. Hvert forslag viser scenenumre og andre skrivemåter; usikre forslag er ikke valgt på forhånd; skrivemåtene blir alternative navn; forslag kan skjules (lagres i nettleseren per bruker, KI-39).
- **Målt på «Jula på Dovre»:** karakterstøyen er borte (MARTIN 9, LAURIT, MALIN TIL MAJA, OLA SMILENDE, LAURITS OG ROLF slått sammen), «Svarten» foreslås, og 39 objekter foreslås (dør, hest, slede, stige, nattkjole, kurv …). Beregningen tar ca. 50 ms.
- **AI-analyse** (bedre presisjon, kontinuitetshendelser) krever kostnadsgodkjenning og kommer tidligst i M5.

## DEC-0035 – Sceneeditor del 1: 2D-scener og lag (M3 del 2a)
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker (omfang, «Kjør på gjør begge oppgavene du beskrev») + Teknisk anbefaling (datamodell)
- **Beslutning (omfang):** Første leveranse av sceneeditoren er grunnmuren: én 2D-scene per scene i manuset (format velges), lag med bilder fra ressursbiblioteket eller fargeflater, plassering/skalering/rotasjon/gjennomsiktighet direkte på lerretet og i egenskapspanelet, lagrekkefølge, synlighet, lås og parallakseverdi per lag. Kamera med blå/rød ramme og baner, tidslinje med nøkkelbilder og avspilling kommer i neste leveranse (M3 del 2b).
- **Datamodell (Teknisk anbefaling):** tabell `compositions` (én per scenevariant – følger spinoff-isolasjonen, INV-04) med format, varighet, bakgrunn og kamera (`shots` som jsonb) og tabell `composition_layers` med ett lag per rad. Lag som egne rader gjør at to personer kan endre hvert sitt lag samtidig uten konflikt (INV-C1). Nøkkelbilder lagres per lag (jsonb) og kamera per 2D-scene; datamodell, validering og interpolasjon (`valueAt`, `cameraAt`, `viewMatrix` med parallakse) er på plass og testet, slik at del 2b bare trenger brukerflaten.
- **Rendring:** én deterministisk funksjon `renderFrame` i kjernen (ADR-0008) brukes av editoren og senere avspilling og eksport. Kamerarull gjelder alle lag; parallakse gjelder forflytning og zoom.
- **Vern:** en scene med 2D-scene kan ikke fjernes ved angre av import/oppdeling, og en ressurs som brukes i et lag kan ikke fjernes – brukeren får en tydelig melding.
- **Migrasjon:** `0007_compositions.sql`.

## DEC-0036 – Sceneeditor del 2: kamera, tidslinje og avspilling (M3 del 2b)
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker (omfang: «ja takk, fortsett på den smarteste måten og bruk din egen vurdering») + Teknisk anbefaling (utforming)
- **Beslutning:**
  1. **Tidslinje** under lerretet: spill av / pause (mellomrom), bilde for bilde, løkke, tidskode, scenens varighet (standard fra manusets varighetsestimat, kan settes), kamerasporet og ett spor per lag med nøkkelbilder.
  2. **Nøkkelbilder:** settes med «Nøkkelbilde» (alle egenskaper), per egenskap i egenskapspanelet, eller automatisk når «Automatiske nøkkelbilder» er på. En egenskap som allerede er animert, får alltid nøkkelbilde når den endres på et bilde; ellers endres grunnverdien. Nøkkelbilder kan flyttes, slettes og få hastighetskurve (jevn, myk start, myk slutt, myk start og slutt, hold).
  3. **Kamera:** flere kamerautsnitt per scene (uten overlapp) på kamerasporet. Hvert utsnitt har blå startramme og rød sluttramme (1 piksel), rett eller kurvet (Bézier) bane med kontrollpunkter, og redigeres direkte på lerretet (flytt, hjørne = zoom, dobbeltklikk på banen = rett/kurvet) eller i kamerapanelet. Rammene er hjelpemidler og vises aldri i kameravisningen.
  4. **Kameravisning** («Kamera») viser det filmen viser, med parallakse; «Scene» er redigeringsvisningen.
  5. **«Tilt»** (mandat 12.4) er ikke definert i en 2D-editor (åpent spørsmål B); panorering, zoom, rotasjon og posisjon er med.
- **Ingen databaseendring:** kamera og nøkkelbilder lagres i feltene fra 0007.
- **Samtidig redigering:** kameraet lagres samlet per 2D-scene; to som endrer kameraet i samme scene samtidig får revisjonskonflikt (ingen endring går tapt i stillhet), mens lag fortsatt kan endres hver for seg.

## DEC-0037 – «I denne scenen»: ressursene fra scenen klare til bruk i sceneeditoren
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker
- **Mars' ord:** «når en bruker har åpnet en scene i sceneeditoren - så bør alle karakterene, objektene, stedene og alt som er trukket ut av scenen vises som assets som bare kan trekkes ned og inn i scenen og da vil de bare legge seg oppå hverandre i lagene og det må være mulig å klikke på et av disse og bli satt over i editoren der en kan genere eller legge inn nye bilder»
- **Beslutning:** Under scenelisten i sceneeditoren vises ressursene fra biblioteket som er brukt i den valgte scenen (karakterer, dyr, steder, miljøer, objekter), med bilde. En ressurs dras inn på lerretet og blir et nytt lag øverst der den slippes («+» legger den midt i bildet). Klikk på navnet åpner ressursen i Ressursbiblioteket, der bilder lastes opp (generering kommer med AI-fasen, M5).
- **Avgrensning:** Navn fra manuset som ikke er lagt inn i biblioteket ennå, vises ikke her; de legges til via «Forslag fra manuset».

## DEC-0038 – Justerbare paneler som huskes
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker
- **Mars' ord:** «alle steder i løsningen der du har ulike vinduer som kan scrolle uavengig av hverandre bør brukeren kunne justere vindusbreddene ved å trekke i rammen, disse endringene i vindusbredde bør huskes selv om brukeren beveger seg rundt i løsningen»
- **Beslutning:** Rammene mellom paneler kan dras: menyen, manusets sceneliste og inspektør, bibliotekets liste og «Brukt i scener», sceneeditorens to sidepaneler og tidslinjens høyde. Dobbeltklikk gir standard, piltaster virker også. Størrelsene huskes i nettleseren per panel (gjelder for den som justerer, på den maskinen) og deles mellom alle visninger. Et panel tar aldri så mye plass at midtfeltet forsvinner.

## DEC-0039 – Bildeformat og bildefrekvens gjelder hele prosjektet
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker (+ Teknisk anbefaling for omregningen)
- **Mars' ord:** «Bildeformatet og antall bilder per sekund bør legges inn i prosjektoversikten, slik at dette blir likt over det hele for alle scener»
- **Beslutning:** Bildeformat (piksler) og bildefrekvens settes på prosjektoversikten og gjelder alle scener og produksjoner. Sceneeditoren velger ikke lenger format. Endres formatet eller frekvensen, tilpasses alle 2D-scener i samme endring (kan angres): plassering og kamera skaleres slik at høyden i bildet beholdes og midten står fast, og nøkkelbilder, kamerautsnitt og varighet regnes om til ny frekvens. Erstatter formatvalget per 2D-scene i DEC-0035.
- **Migrasjon:** `0008_project_format.sql` (kolonner for format på prosjektet; `apply_changes` kan endre prosjektraden med revisjonskontroll).

## DEC-0040 – Mer plass i sceneeditoren: sammenleggbar meny, scenevelger og forhåndsvisning
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker
- **Mars' ord:** «Første kolonne bør vi kunne kolapse til et lite ikon i toppen. Scenevelgeren trenger vi ikke å ha fremme hele tiden, og det kan jo være en nedtreksliste som en kan få utvide om en ønsker å bla igjennom og søke opp noe spesielt […] vi trenger også et eget vindu som viser preview av resultatet av kamera bevegelser og bevegelser på objekter slik det vil fremkomme i ferdig utsnitt, dette previewbildet kan en krysse av eller på for "vis automatisk ved avspilling" (tooltip) og "Automatisk visning"»
- **Beslutning:**
  1. Menyen til venstre kan legges sammen til en smal stripe med ikoner med knappen øverst; valget huskes.
  2. Sceneeditoren velger scene med en nedtrekksliste i verktøylinjen (søk på nummer, sted eller tid, piltaster, ‹ › for forrige/neste). Den faste scenelisten er fjernet; venstre kolonne viser bare «I denne scenen».
  3. «Forhåndsvisning» åpner et eget vindu med det ferdige utsnittet (kamera, parallakse og animerte lag) på gjeldende bilde. Avkrysningen «Automatisk visning» (verktøytips «Vis automatisk ved avspilling») viser vinduet mens scenen spilles av. Begge valg og vinduets bredde huskes.

## DEC-0041 – Forhåndsvisningen: størrelse fra hjørnet, zoom (1:1) og eget vindu som husker plassen
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker
- **Mars' ord:** «brukeren kan endre størrelse på forhåndsvisningsvinduet ved å trekke i et hjørne og lett endre til 1:1.. og ulike zoom nivåer - og at den husker størrelsen og skjermplassering (om brukeren har flere skjermer, om en slår av og på preview eller jobber litt før neste avspilling»
- **Beslutning:**
  1. Det flytende forhåndsvisningsvinduet kan flyttes ved å dra i tittellinjen (dobbeltklikk = standardplass) og endres fra alle fire hjørner. Sideforholdet følger bildeformatet.
  2. Zoom: «Tilpass» (bildet følger vinduet; nåværende prosent vises) og 25 %, 50 %, 1:1 (100 %) og 200 %. 1:1 er ett bildepunkt per skjermpunkt. Et fast nivå gjør vinduet akkurat stort nok til bildet; er det ikke plass, kan man rulle. Å dra i et hjørne går tilbake til «Tilpass».
  3. «Åpne i eget vindu» legger forhåndsvisningen i et eget nettleservindu som kan flyttes til en annen skjerm. Mellomrom der starter/stopper avspillingen, og en knapp legger den tilbake i redigeringsvinduet.
  4. Størrelse, plassering og zoom huskes for begge former (i nettleseren), også når vinduet lukkes og åpnes igjen – manuelt eller automatisk ved avspilling – og mellom økter.
- **Teknisk:** Eget vindu = `window.open` med samme opprinnelse og React-portal; stilene kopieres. Plasseringen lagres jevnlig. Plassering på en annen skjerm bruker nettleserens skjermtillatelse der den finnes (Chrome: «Vindusbehandling»); ellers kan nettleseren legge vinduet på hovedskjermen (KI-50).

## DEC-0042 – Forhåndsvisningen kan flyttes fritt over hele programmet
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker
- **Mars' ord:** «forhåndsvisningsvinduet må kunne flyttes fritt over det hele»
- **Beslutning:** Det flytende forhåndsvisningsvinduet kan flyttes hvor som helst i programvinduet (over menyen, panelene og tidslinjen), ikke bare innenfor lerretet. Det holdes innenfor programvinduet. Standardplassen er fortsatt nede til høyre på lerretet; plasseringen huskes.
- **Teknisk:** Vinduet tegnes i en portal i `document.body` med `position: fixed`; plassering lagres som `scene-editor-preview-left/top` (nye nøkler, så gamle plasser innenfor lerretet ikke gir et hopp).

## DEC-0043 – M4 del 1: Montering (filmtidslinje, avspilling av hele filmen og eksport av animatic)
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker (Mars: «nå tar du neste store ting vi skal lage … ellers OK – neste!»); innhold og avgrensning er teknisk anbefaling innenfor mandat kap. 14–15 og 29
- **Beslutning:**
  1. Ny arbeidsflate **Montering** (menyen): visning av filmen, panel med valgt scene og manus, og filmtidslinje under.
  2. Filmen er de aktive scenene i manusets rekkefølge (INV-01). Klippets materiale er scenens 2D-scene; scener uten 2D-scene vises som **tittelkort** (nummer og sceneoverskrift) med lengde beregnet fra manuset, så hele filmen kan spilles og eksporteres også når produksjonen er ufullstendig (REQ-0240).
  3. **Flytte scene:** dra klippet (eller Alt+pil). Det er samme kommando som i manuset (MoveOccurrence), så manuset endres likt (REQ-0018/0228). **Lengde:** dra i høyre kant av en 2D-scene eller skriv sekunder i panelet; «Fra manus» går tilbake til beregnet lengde. Lengdeendring rører aldri manus (REQ-0230). **Deaktiver** er egen handling (scenen slettes ikke).
  4. **Avspilling** av hele filmen med tastene mellomrom/K, piler (bilde, Shift = sekund), pil opp/ned (forrige/neste scene), Home/End og Enter (åpne i sceneeditoren). Panelet viser manuset for scenen; «Følg avspillingen» lar valget og manuset følge avspillingshodet (scenenivå av mandat 6.2).
  5. **Eksporter animatic:** hele filmen, valgt scene eller fra–til scene; full eller halv størrelse. Kontroll før eksport (aktive scener og rekkefølge, deaktiverte scener, tittelkort, beregnede lengder, lag uten bilde) og «Eksporter likevel» (REQ-0422/0423). Videoen lages i nettleseren uten AI og uten kostnader (REQ-0213/0416).
  6. Avgrensning – kommer i M4 del 2: lyd (dialog, musikk, effekter) i avspilling og eksport, import av ferdig film og «Bruk denne» (aktivt materiale), overganger og splitting av klipp, tidskoblinger per replikk (klikk på replikk → avspillingshodet).
- **Teknisk:** `src/core/assembly/film.ts` (klipp, tidskoder, utvalg – lagres aldri, ADR-0006), `src/engine/compositor/film.ts` (samme tegning i avspilling og eksport), `src/engine/export/animatic.ts`. Ny avhengighet **mediabunny 1.59.1** (MPL-2.0, ingen egne avhengigheter, ingen nettverkskall) for WebCodecs-koding og MP4/WebM. MP4 (H.264) når nettleseren kan kode det (Chrome, Edge, Safari), ellers WebM (VP9/AV1). Ingen databaseendring.

## DEC-0044 – Lyd i filmen (M4 del 2) og bildevalg for lag
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker
- **Mars' ord:** «når du legger til lyd er det fint om lyden spilles selv om animasjon ikke er laget, og jeg trenger at om brukeren dobbeltklikker på et lag for en et popup der en kan velge et annet bilde for dette laget som er laget for dette objektet og eventuelt laste opp et nytt, eller sette igang en aigenerering av et nytt bidet for dette objektet eller karakteren eller bagrunnen eller hva det måtte være.»
- **Beslutning – lyd:**
  1. Lydfiler er ressurser i biblioteket av typen «Lyd» (MP3, WAV, OGG, WebM, M4A/AAC, FLAC), med versjoner og lengde.
  2. Monteringen har ett spor per lydtype: dialog, forteller, effekter, atmosfære og musikk (mandat 13.1). Overlappende klipp legges på egne linjer i sporet.
  3. Et lydklipp er festet til en scene, med start målt fra scenens begynnelse, så lyden følger scenen når den flyttes (mandat 6.4). Dialog kan kobles til en replikk.
  4. Lyden kan flyttes (festes til scenen den havner i), kuttes i start og slutt, og få volum, inn-/uttoning og demping. Spor kan dempes.
  5. **Lyden spilles og eksporteres også der animasjonen ikke er laget** (tittelkort). En scene uten satt lengde er minst så lang som lyden i den.
  6. Lyden spilles også av i sceneeditoren, for den valgte scenen.
  7. Eksporten mikser lyden med samme plassering som avspillingen (AAC i MP4, ellers Opus).
- **Beslutning – bilde for lag:** Dobbeltklikk på et lag (i lerretet eller lagslisten), eller «Velg eller last opp bilde …» i panelet, åpner et vindu der man kan:
  - velge et annet bilde av samme ressurs (alle varianter og versjoner), eller la laget følge forsidebildet eller variantens godkjente bilde;
  - laste opp et nytt bilde, som blir en ny versjon i biblioteket og brukes med én gang.

  Fargeflater kan kobles til en ressurs. «Generer med AI» vises, men er ikke aktiv: generering koster penger og kommer med M5 etter at Mars har valgt leverandør og godkjent kostnadene (mandat 17–19).
- **Teknisk:** Migrasjon `0009_audio.sql` (ressurstypen «sound», lydformater, `asset_versions.duration_ms`, tabellen `audio_clips`, `apply_changes`). Kjernen: `src/core/audio`. Motor: `src/engine/audio/mixer.ts` (Web Audio). Avspilling: `src/app/audio/use-audio-playback.ts`. Tider i millisekunder (uavhengig av bildefrekvensen).
- **Tillegg 2026-10-09:** Lovable avviste første utgave av 0009 fordi den skrev til `storage.buckets` (ikke tillatt i Lovable Cloud). Ingenting ble kjørt. Siden filen aldri er kjørt, er den rettet på stedet: lagringsdelen er fjernet. Bøtta `assets` har ingen begrensning på filtyper og tar allerede imot lyd. Regel videre: migrasjoner skriver aldri til `storage`; bøtter endres med Lovables lagringsverktøy.

## DEC-0045 – Lyd over flere scener, lydprofil og AI-bilder med Lovable-kreditter
- **Dato:** 2026-10-09 · **Type:** Bekreftet av bruker
- **Mars' ord:** «når en jobber med en scene så kan en enkelt se lydressurser som var i bruk i forrige scene og i scenen før der (kanskje en kan enkelt "bla bakover og fremover" i lydressurser som har vært i bruk og at en da enkelt kan marker for å "bruk i scene" og da importeres disse inn i scenen... Noe annet som er viktig er at lydspor, f.eks. et musikkstykke må kunne gå over flere scener, mao den forankres (starten) i en scene og så angis det at denne skal løpe videre, dette laget/navnet gies en egen farge (varmgul)... Lydklipp må alle kunne åpnes slik at en kan se lydprofilen og time når ting skal skje i forhold til lyden. det skal også være mulig å trekke lyden opp og ned slik som i after effects. Jeg ønsker også at aktivt bildeutsnitt endrer farge fra grå til varmgul. Jeg har så utrolig mange kreditter på Lovable så jeg tenker at vi åpner opp og tester med Lovable sine egne kreditter slik at vi får generering på plass og kan teste det, så kan vi senere gjøre det mulig for brukerene å koble tjenesten opp mot ulike tjeenste api vi legger til rette for.»
- **Beslutning – lyd:**
  1. **Lyd i scenene rundt** (sceneeditoren): et panel viser lyden i forrige scene (neste for første scene); pilene blar scene for scene. «Bruk i scenen» legger samme lyd (spor, volum, toninger, volumpunkter) inn fra starten av scenen.
  2. **Løper videre:** et lydklipp forankres i én scene og kan merkes «Løper videre over flere scener». Det spilles og eksporteres da videre inn i de neste scenene og vises **varmgult** (klipp, navn, prikk). Lyd uten merket stopper ved slutten av scenen sin, og en scene uten 2D-scene blir minst så lang som slik lyd. Musikk som legges til, merkes «løper videre» fra start. Lydtypene har fått farger som ikke ligner varmgult.
  3. **Lydprofil:** dobbeltklikk på et lydklipp (montering eller sceneeditor) eller «Lydprofil og volumpunkter …» åpner bølgeformen i stort format med tidslinjal og avspilling.
  4. **Volumpunkter som i After Effects:** klikk på kurven legger til punkt, dra flytter, dobbeltklikk/Delete fjerner, piltaster justerer. −60 til +12 dB, rett linje mellom punktene, ganges med klippets volum og toninger; gjelder avspilling og eksport.
  5. **Bølgeformer i sceneeditorens tidslinje** under lagene, også for lyd som løper inn fra tidligere scener.
- **Beslutning – kamera:** Utsnittet kameraet viser nå tegnes varmgult på lerretet (også når det er start- eller sluttrammen), og kamerautsnittet under avspillingshodet får varmgul ramme i kamerasporet.
- **Beslutning – AI-bilder (kostnad godkjent av Mars):** Testfasen bruker Lovable AI Gateway og Lovable-arbeidsområdets egne kreditter. «Generer et nytt bilde med AI» i bildevalget for et lag:
  - beskrivelsen (prompten, på engelsk) bygges fra ressurs, variant, stil og filmtittel, vises og kan endres før sending;
  - dagens bilde kan sendes med som forbilde;
  - hver generering bekreftes i to steg («bruker kreditter … Ja, generer»);
  - bare redaktører og eiere; maks 30 per bruker per time og 200 per prosjekt per døgn;
  - alt logges i `generation_jobs` (modell, prompt, forbilde, status, feil, resultat);
  - resultatet blir en ny versjon i biblioteket og tas i bruk på laget (kan angres).
  
  Senere skal brukerne kunne koble egne AI-tjenester og nøkler (REQ-0566). Pris per bilde vises ikke ennå.
- **Teknisk:** Migrasjon `0010_audio_flow_generation.sql` (`audio_clips.continues`, `audio_clips.volume_keys`, tabellen `generation_jobs` med lesetilgang for medlemmer og skriving bare fra serveren; ingen SQL mot `storage`). Serverfunksjonen `src/adapters/ai/generate-image.functions.ts` (modell `openai/gpt-image-2`, kan endres med `ANIMATIC_IMAGE_MODEL`; nøkkelen `LOVABLE_API_KEY` finnes bare på serveren). Beskrivelser: `src/core/generation/prompt.ts`. Krav: REQ-0560–0566.

## DEC-0046 – Slette og forlate prosjekt; ressurser som zip; ressurser slettes i egen operasjon
- **Dato:** 2026-10-10 · **Type:** Bekreftet av bruker
- **Mars' ord:** «på siden med listen over "Prosjekter" så må vi ha muligheten å "Slett prosjekt" - som bare eiere kan gjøre og "Forlat prosjekt" for de som er invitert inn. Dette med en seriøs popup som sier at dette ikke kan angres, assets skal allikevel kunne lastes ned som zip, per kategori eller samlet. disse må også kunne slettes, men det må gjøres i en egen operasjon, dette fordi det burde være mulig å gjøre assets "Gobale" slik at de kan brukes på tvers av prosjekter, dette gjelder alle ting.»
- **Beslutning:**
  1. **Slett prosjekt** (bare eiere): alvorlig vindu («Dette kan ikke angres»), liste over hva som slettes, antall andre som mister tilgangen, og prosjektnavnet må skrives inn. Manus, versjoner, scener, 2D-scener, lydklipp, notater, historikk, importerte manusfiler og importert film slettes; andre medlemmer mister tilgangen.
  2. **Ressursene (bilder og lyd) slettes ikke sammen med prosjektet.** De blir liggende hos eierne under «Ressurser fra slettede prosjekter» i prosjektlisten, med «Last ned …» og «Slett for godt …» (egen operasjon med egen bekreftelse).
  3. **Last ned som zip:** per kategori eller alt samlet – i vinduet før sletting, for slettede prosjekter og i ressursbiblioteket. Importert film er egen kategori.
  4. **Forlat prosjekt** for inviterte (alvorlig vindu). En eier kan bare forlate når det finnes en annen eier.
  5. **Globale ressurser** på tvers av prosjekter registreres som krav for senere (REQ-0571); det er grunnen til at ressursene slettes i egen operasjon.
- **Forhold til mandatet:** Mandatet sier at produsert materiale og historikk aldri slettes (INV-07, INV-13). Tolkning (meldt til Mars 2026-10-10): vernet gjelder i et prosjekt som er i bruk. Sletting av hele prosjektet er en bevisst handling fra eieren med sterk bekreftelse, og vernet slippes bare i den ene databasetransaksjonen som sletter prosjektet.
- **Teknisk:** Migrasjon `0011_project_delete_film.sql`:
  - `projects.deleted_at`
  - `public.delete_project` og `public.purge_project_assets`, kjørt med `service_role` fra serverfunksjonene i `project-admin.functions.ts` etter kontroll av eier og navn
  - `public.leave_project`
  - `member_role_rank` gir 0 for slettede prosjekter, så all skriving, opplasting og invitasjon avvises
  - filer i lagringen slettes bare innenfor prosjektets egen mappe
  
  Zip: `src/core/library/zip.ts`, `src/engine/export/zip.ts` (fflate), `src/app/library/AssetZip.tsx`. Krav: REQ-0567–0571.

## DEC-0047 – Montering del 3: importert ferdig film, «Bruk denne», overganger, replikk → avspillingshode
- **Dato:** 2026-10-10 · **Type:** Bekreftet av bruker (Mars: «legger du bare til i neste commit sammen med det andre du har planlagt», etter forslaget i DEC-0045-leveransen)
- **Beslutning:**
  1. **Importer ferdig film** til en scene i monteringen (MP4, MOV, WebM, opptil 2 GB). Filen lagres uendret; lengde, oppløsning, bildefrekvens, kodek og om den har lyd leses ved import og lagres uforanderlig (INV-07). Filmen tas i bruk med én gang.
  2. **«Bruk denne»:** panelet viser versjonene av scenen (animatic og importerte filmer) og hvilken som er i bruk. Ingen versjon kastes; tidligere versjoner kan tas i bruk igjen.
  3. Importert film vises i filmvisningen og eksporteres. Lyden i filmen spilles med (følger sporet «Dialog» når spor dempes; filer over 400 MB spilles foreløpig uten lyd).
  4. **Overganger inn i en scene:** kutt, overtoning eller via svart, med lengde i sekunder. Overgangen ligger midt på klippet, og filmens lengde endres ikke (bildene holdes). Første scene kan tones inn fra svart.
  5. **Replikk → avspillingshode:** klikk på en blokk i monteringens manus flytter avspillingshodet dit. Replikker med koblet lydklipp bruker lydens tid; ellers fordeles teksten over scenens lengde. Blokken under avspillingshodet markeres.
- **Teknisk:**
  - `takes.metadata` og `scene_occurrences.transition_kind`/`transition_frames` (0011)
  - kommandoene `AddTake` (med `media`) og `SetTransition`
  - `frameMix`, `blockSpans`, `filmTakeAudio` i kjernen
  - `drawFilmFrame` blander bilder
  - eksporten dekoder filmen med mediabunny (`film-video.ts`)
  - avspillingen bruker videoelementer
  
  Krav: REQ-0003 (delvis), REQ-0097/0098, REQ-0219, REQ-0223, REQ-0232–0236, REQ-0238, REQ-0242, REQ-0317.

## DEC-0048 – Montering del 4: klipping, presise tidskoblinger, lang film over flere scener
- **Dato:** 2026-10-10 · **Type:** Bekreftet av bruker (Mars: «ok, kjør i gang med neste store ting!», etter anbefalt alternativ 1 «fullføre monteringen»)
- **Beslutning:**
  1. **Klippe i monteringen** (REQ-0220–0222): et klipp kan bestå av flere **deler**. Hver del har kilde (importert film eller animatic), inn- og utpunkt bildepresist (±1 bilde-knapper), og kan fjernes. **Splitt ved avspillingshodet** (tasten S). Trim i tidslinjen virker også for film og klippede scener. Kildemediet endres aldri; alt kan angres. «Hele klippet» fjerner kutt og splitting.
  2. **Animatic-rest** (REQ-0239): en scene kan settes sammen av film og animatic, f.eks. ferdig film for første halvdel og animatic for resten.
  3. **Presise tidskoblinger per replikk** (REQ-0093–0095, REQ-0107, REQ-0231): «Synk replikker» (tasten T) setter tiden for neste replikk der avspillingshodet står. Koblingene er relative til scenen og følger scenen når den flyttes. En kobling som ligger utenfor klippet (scenen er kuttet), markeres med bølget understrek.
  4. **Importer lang film** (REQ-0003, REQ-0235–0237): én filmfil fordeles på flere scener etter starttider (forslag etter scenenes lengde; justeres ved å spole og trykke på nålen). Filen lastes opp én gang; hver scene får filmen som egen versjon med sin del. Et nytt forsøk etter feil fortsetter der det stoppet.
  5. **Status for importert film** (REQ-0241): Godkjent / Utkast / Referanse / Avvist, kan endres og angres.
- **Teknisk:**
  - Migrasjon `0012_clip_parts_time_links.sql`: tabellene `clip_parts` og `time_links` (RLS: medlemmer leser, skriving bare via `apply_changes`), `apply_changes` med de nye tabellene og lås `for key share` på prosjektet (slettet prosjekt avvises), `delete_project`/`purge_project_assets` sletter også de nye tabellene, `schema_version` 12.
  - Kommandoene `SetSceneEdit` (erstatter delene samlet, revisjonen økes alltid), `SetTakeStatus`, `AddTimeLinks`, `UpdateTimeLinks`, `SetTimeLinksRemoved`. Angre av opprettelse stoppes når deler eller koblinger viser til det som ville forsvunnet.
  - Kjernen: `src/core/assembly/edit.ts`, `partAt`/`sourceAt`/`filmMediaPaths` i `film.ts`; lyd og eksport følger delene (én dekoder per fil).
  - Opprydding: `.inputValidator` → `.validator` i serverfunksjonene.

## DEC-0049 – Sikkerhetskopi av prosjekt, manus ↔ film i begge retninger, samlet angring
- **Dato:** 2026-10-10 · **Type:** Bekreftet av bruker (Mars: «ok, kjør videre med en stor commit, jeg går nå og legger meg», etter anbefalt alternativ 1 «resten av M4: prosjektbackup, navigasjon fra film til manus i manusvisningen, én angring for hele importen»)
- **Beslutning:**
  1. **Sikkerhetskopi** (REQ-0411/0412): Prosjekter → ⋯ → «Sikkerhetskopi …» laster ned hele prosjektet som én zip-fil: alle prosjektdata (manus med teksthistorikk, manusversjoner, spinoffer, ressursbibliotek, notater, 2D-scener, lyd, montering), historikken (kommandologg og AI-logg med prompter) og mediefilene (valgfritt per kategori: bilder, lyd, importert film, importerte manusfiler). Formatet er dokumentert (`docs/architecture/BACKUP_FORMAT.md` og LES-MEG.txt i filen).
  2. **Gjenopprett fra sikkerhetskopi** lager alltid et **nytt** prosjekt der brukeren er eier; ingenting eksisterende overskrives. Medlemmer og invitasjoner tas ikke med. Historikken gjenopprettes ikke (den ligger i filen).
  3. **Manus → film:** «Vis i filmen» i manusets inspektør åpner monteringen med avspillingshodet på replikken eller scenen (REQ-0092). **Film → manus:** «Vis i manus» i monteringen åpner manuset med replikken under avspillingshodet valgt (REQ-0099/0100).
  4. **Samlet angring:** «Importer lang film» og «Importer ferdig film» angres og gjøres om som ett steg (KI-75).
- **Tolkninger (meldt til Mars i leveransen):** gjenoppretting til nytt prosjekt (aldri overskriving) og at medlemmer ikke følger med, er valgt for å verne eksisterende arbeid og tilganger. Den som gjenoppretter, står som forfatter av radene og teksthistorikken (tidspunktene og navnene på notater beholdes).
- **Teknisk:** Ingen ny migrasjon. `src/core/backup` (format, deterministiske nye ID-er, kontroll av at alle referanser er med i filen), `src/engine/import/zip-read.ts` (leser zip uten å laste hele filen), `src/app/projects/backup.ts` og `BackupDialogs.tsx`, serverfunksjonen `src/adapters/storage/backup.functions.ts` (bare eier av et tomt, nytt prosjekt; data skrives via `apply_changes`; nytt forsøk må gjelde samme sikkerhetskopi). Samlet angring: `group` i `run`/`runAndWait` (`use-commands.ts`).

## DEC-0050 – Mars' ønsker for animatic, sceneeditor og lyd (nattlige ideer)
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars' liste fra mobilen og svarene på oppfølgingsspørsmålene samme dag)
- **Beslutning:**
  1. **Forhåndsvisning av monteringen i eget vindu** (REQ-0572), som i sceneeditoren.
  2. **Svart-hvitt:** global kontroll for hele filmen, også som valg i eksporten (REQ-0573), og per scene (REQ-0574). Er en scene satt til svart-hvitt, gjelder det også i eksporten; ingen egen varsling.
  3. **Overganger:** kutt, overtoning, via svart, via hvitt, tørk, skyv og iris som start (REQ-0575); overlapp der scenene skyves inn i hverandre og filmen blir kortere (REQ-0576); standard for hele prosjektet og eget valg per overgang (REQ-0577).
  4. **Naboscener i sceneeditoren** (REQ-0578): hele forrige og neste scene som ferdige filmsnutter med lyd og overganger; avspillingshodet kan stå og spilles i dem. Lagene deres vises ikke.
  5. **Bildeskifte i et lag** (REQ-0579): hvilket som helst bilde (kaffekopp eller bakgrunn), hardt kutt til å begynne med, skiftepunktet kan dras i tidslinjen.
  6. **Frilegging** (REQ-0580): enkel, gratis tjeneste med grei kvalitet, pluss pensel for å legge til og fjerne manuelt (med angre). Ny versjon; originalen beholdes.
  7. **Bevegelsesbane for lag** (REQ-0581): tegne på frihånd med «Glatt ut», ellers rette linjer og Bézier som for kameraet. **Tempo** (REQ-0582): ease inn/ut med justerbar styrke som i After Effects, og en tempokurve der et punkt kan dras (som midtpunktet i nivåer i Photoshop), slik at bevegelsen går ulikt før og etter punktet.
  8. **Grupper av lag** med felles bevegelse, synlighet og skalering (REQ-0174, står allerede i mandatet).
  9. **Lydopptak i sceneeditoren** (REQ-0583); klipping av lyd er allerede ikke-destruktiv (REQ-0207).
- **Allerede på plass:** gjennomsiktighet for lag med nøkkelbilder (inspektøren), ikke-destruktiv klipping av lyd.
- **Rekkefølge:** Mars: «disse natlige seansene skal ikke påvirke rekkefølgen av dine leveranser». Ønskene legges inn i leveransene der de hører hjemme (se ROADMAP).

## DEC-0051 – Montering del 5: overganger, svart-hvitt, eget vindu, hendelser i 2D-scenen
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars: «Er det mulig for deg å kjøre videre på neste i natt før vi har kommitet den du nå venter på å legge inn?», etter forslaget om å fullføre monteringen med DEC-0050-ønskene som hører til der)
- **Beslutning:**
  1. **Overganger** (REQ-0575–0577): kutt, overtoning, via svart, via hvitt, tørk, skyv og iris, med lengde. **Overlapp**: scenen begynner før forrige er ferdig, og filmen blir kortere. **Standardovergang** for prosjektet (verktøylinjen); hver scene kan følge standarden eller ha sin egen.
  2. **Svart-hvitt** (REQ-0573/0574): global knapp i monteringen (visning, og foreslått i eksporten), og per scene i panelet (gjelder også eksporten).
  3. **Eget vindu** for monteringens forhåndsvisning (REQ-0572), samme vindu og plass som sceneeditorens.
  4. **Hendelser i 2D-scenen** (REQ-0095/0096): i sceneeditoren kan en handling eller replikk kobles til det et lag gjør på avspillingshodet («Hendelser i manuset» for laget). En blokk kan ha flere hendelser. Tiden er i 2D-scenens egen tid, så den følger 2D-scenen også når klippet kuttes; i monteringen vises hendelsene med lagets navn.
- **Tolkninger:** Et utsnitt som eksporteres (én scene eller et utvalg), begynner og slutter rent, uten overganger fra scener utenfor utvalget. Overlapp går aldri inn i forrige scenes egen overgang. Scener som hadde kutt før migrasjon 0013, følger standarden; scener med en annen overgang beholder den.
- **Teknisk:** Migrasjon `0013_transitions_monochrome.sql` (nye overgangstyper, `transition_custom`, `transition_overlap`, `monochrome`, `projects.default_transition_*`, `time_links.layer_id`, `apply_changes` med standardovergang, `schema_version` 13). Kommandoene `SetTransition` (null = standard), `SetDefaultTransition`, `SetOccurrenceMonochrome`; tidskoblinger med `layerId`. `frameMix` med overlapp og nye typer, `drawFilmFrame` med tørk/skyv/iris og svart-hvitt; avspilling og eksport leser samme fil to steder i en overgang.

## DEC-0052 – Sceneeditor del 3: bildeskifte, grupper, bevegelsesbane og tempo, naboscener, lydopptak
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars: «Må løpe i dåp, men kan du fortsette?», etter DEC-0050-svarene; rekkefølgen av leveransene er uendret)
- **Beslutning:**
  1. **Bildeskifte i lag** (REQ-0579): «Bytt bilde ved …» i lagets egenskaper legger et hardt kutt på avspillingshodet til hvilket som helst bilde i biblioteket. Skiftet vises som et lilla merke på lagets linje i tidslinjen og kan dras. Det nye bildet tegnes innenfor lagets egen ramme med sitt eget sideforhold; plassering, størrelse og bevegelse beholdes.
  2. **Grupper** (REQ-0174): «Ny gruppe» i lagpanelet (valgt lag legges i gruppen). En gruppe er et eget lag uten bilde, med ankerpunkt; lagene i den flyttes, roteres, skaleres, skjules og tones sammen. Lag flyttes inn i, ut av og mellom grupper uten å hoppe. Slettes en gruppe, blir lagene stående der de er (ett angresteg).
  3. **Bevegelsesbane** (REQ-0581): «Tegn bane» – tegn veien på frihånd i scenen; «Glatt ut», «Rett linje», punkter som dras, dobbeltklikk bytter kurve/hjørne, Alt-klikk fjerner et punkt. Banen starter på avspillingshodet og varer to sekunder; start og slutt kan endres. Laget går med jevn fart langs banen. Flyttes laget, flyttes hele banen.
  4. **Tempo** (REQ-0582): ease ut og inn med styrke 0–100 % (som «influence» i After Effects) for banen og for nøkkelbilder (tidslinjen), og en tempokurve for banen der punkter kan legges til og dras (som midtpunktet i nivåer).
  5. **Naboscener** (REQ-0578): knappen «Naboscener» viser en stripe under scenen med forrige, denne og neste scene. Den spiller de tre scenene som ferdig film med lyd og overganger; når du stopper i scenen du redigerer, viser editoren samme sted. Naboscenene er bare visning.
  6. **Lydopptak** (REQ-0583): «Opptak» i sceneeditoren tar opp fra avspillingshodet, med scenen spilt av samtidig (kan slås av). Opptaket lagres som ny lydressurs i biblioteket og legges i scenen der opptaket startet; lydklippets editor åpnes så det kan trimmes uten at opptaket endres.
- **Tolkninger:** Naboscenene ligger i en egen stripe i stedet for å forlenge lagtidslinjen (lagene deres vises jo ikke). Grupper regnes slik de står på avspillingshodet når et lag flyttes inn eller ut. En ressurs, variant eller versjon som brukes i et bildeskifte, kan ikke angres bort.
- **Teknisk:** Migrasjon 0013 utvidet: lagtypen `group`, kravet «laget viser noe» gjelder ikke grupper (`composition_layers_shows_something`), kolonnene `image_swaps`, `motion_path`, `anchor`. Kjernen: `layerImageAt`, `groupMatrixAt`, `regroupFields`, `pathSegments`/`pathPointAt`/`tempoAt`/`easeStrength`, `setKeyframeEase`, `neighbourRange`. En eldre klient som ikke kjenner de nye feltene, sletter dem ikke. Formatbytte flytter baner, ankerpunkter og bildeskifter; fargeflater skaleres ikke lenger to ganger (feil fra DEC-0039 rettet).

## DEC-0053 – M5 del 2: AI med kontroll (frilegging, budsjett, jobber, «Generer scene»)
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars: «Fortsatt i dåp, kan du ta neste?» – neste i rekkefølgen er M5; bare det som ikke koster penger er bygget)
- **Beslutning:**
  1. **Frilegging** (REQ-0580, DEC-0050 pkt. 6): gratis og i nettleseren. Et automatisk forslag fjerner bakgrunnen ut fra fargen langs kanten av bildet (det som henger sammen med kanten og ligner); penselen legger til og fjerner, med angre. Lagres som ny versjon; originalen beholdes. Fra bildevalget i sceneeditoren og fra hver versjon i biblioteket.
  2. **AI-budsjett** (REQ-0279–0284, REQ-0528): eieren setter høyeste antall AI-genereringer per måned og en anslått pris per bilde. Serveren stopper genereringer når rammen er nådd (også samtidige). Månedens forbruk og anslått kostnad vises på prosjektoversikten og før hver generering, alltid merket som anslag.
  3. **AI-jobber** (REQ-0292–0303): alle genereringer med status (pågår, ferdig, feilet, betalt men ikke lagret, stoppet underveis), feilmelding, beskrivelse og «Prøv igjen».
  4. **«Generer scene»** (REQ-0243–0267): scenen deles i segmenter (tidsrom i scenen, helst ved replikkgrenser, høyst 5–20 s). Hvert segment får en automatisk beskrivelse på engelsk fra manus, ressurser og kamera, med replikkene ordrett på norsk og krav om kontinuitet mellom segmentene. Beskrivelsen kan endres og lagres; egne beskrivelser overskrives aldri, og det vises når grunnlaget er endret. Alt kan kopieres.
- **Venter på Mars (kostnad):** valg av videoleverandør for selve genereringen av scener. Knappen står avslått til leverandør og pris er godkjent.
- **Tolkninger:** «Enkel, gratis tjeneste» er tolket som frilegging i nettleseren uten AI (AI-modeller kan ikke hentes inn i utviklingsmiljøet, og den ferdige gratispakken har en lisens (AGPL) som ikke passer). Budsjettet måles i antall genereringer fordi Lovable ikke oppgir pris per kall; prisen er eierens anslag. Segmenter til generering er tidsrom, ikke festet til manusblokker, så manuset kan redigeres fritt etterpå.
- **Teknisk:** Migrasjon `0014_ai_control.sql` (projects.ai_month_limit/ai_price_per_image, generation_jobs.estimated_cost/occurrence_id/segment_id og status «lost», production_segments.start_ms/end_ms, tabellen generation_prompts, apply_changes). Kommandoene `SetAiBudget` (bare eier), `SetGenerationPrompt`, `ReplaceSegments` (avviser en utdatert liste – samtidige endringer). Kjernen: `src/core/cutout`, `src/core/generation/cost.ts`, `src/core/generation/scene-prompt.ts`.

## DEC-0054 – M6 del 1: avvik ved manusendring (godkjenn, oppdater eller angre)
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars: «Du er så rask! Fortsatt i dåp! Fortsett» – resten av M5 venter på valg av leverandør, så neste uten kostnad er M6)
- **Beslutning (mandat kap. 21, REQ-0026/0305–0315/0485/0486):**
  1. Materiale (2D-scene, importert film, senere AI-video) husker manuset det ble laget fra. Endres manuset etterpå, flagges materialet som er i bruk: røde merker på berørt tidsrom i monteringens tidslinje, en rød strek ved linjen i manuset, et varsel i sceneeditoren og et tall på prosjektoversikten.
  2. Ved hvert avvik vises endringene (gammel tekst overstreket, ny tekst) og tre valg: **Godkjenn** (materialet passer fortsatt), **Oppdater** (sceneeditoren, eller importer ny film – den gamle beholdes) eller **Angre manusendringene** (hele scenen eller én linje). Ingenting skjer automatisk.
- **Tolkninger:** Endringer sammenlignes på tekst (en endring som er endret tilbake, er ikke et avvik). Scenehodet regnes ikke med. Bare materiale som vises i filmen flagges. 2D-scener som er laget før kontrollen fantes (før migrasjon 0014), har ukjent grunnlag og flagges ikke før de er godkjent første gang.
- **Teknisk:** `src/core/assembly/discrepancy.ts`; `Composition.producedFrom` (kolonnen `compositions.produced_from`) og `Take.acceptedFrom` (`takes.accepted_from`, fordi `produced_from` for versjoner er uforanderlig, INV-07); kommandoene `AcceptScriptChanges` og `SetProducedFrom`; `CreateComposition` setter grunnlaget. UI: `ScriptChanges.tsx` i monteringen, manusets inspektør og sceneeditoren.

## DEC-0055 – M6 del 2: kontinuitet for karakterene (utseende som endres i historien)
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars: «I kirken, fortsett» – etter at neste steg var varslet som «M6 del 2: kontinuitet for karakterene, for eksempel at Maja klipper håret i én scene»)
- **Beslutning (mandat kap. 19, REQ-0150–0165, REQ-0496):**
  1. En **kontinuitetshendelse** registreres per karakter (eller dyr/gjenstand): hva som skjer (11 typer: hårklipp/frisyre, hårfarge, kostyme, skade/bandasje, arr, skitt, snø/vann, skjegg, alder, gjenstand den bærer, annet), beskrivelse, scene og eventuelt manuslinje, utseendet før og etter (visuelle varianter) og hvor lenge det varer: **for godt**, **til en bestemt scene** eller **bare denne scenen**.
  2. Riktig utseende i hver scene regnes ut fra **fortellingstiden**, ikke rekkefølgen scenene vises eller produseres i: et tilbakeblikk til før hårklippet får langt hår.
  3. Biblioteket viser hendelsene, en **tidslinje** over scenene i fortellingsrekkefølge med utseendet i hver scene, og **forslag fra manuset** (handlingslinjer der karakteren nevnes og noe kan endre utseendet). Forslag brukes ikke før de er godkjent; avviste forslag foreslås ikke igjen.
  4. Sceneeditoren bruker riktig utseende når en karakter legges inn, viser det under «I denne scenen» og advarer (med knapp for å rette) når et lag viser et annet utseende.
  5. «Generer scene» beskriver karakterene med utseendet som gjelder, og foreslår egne segmenter før og etter en endring midt i scenen. Manuset og scenenumrene endres ikke.
- **Tolkninger (Claude, kan endres av Mars):**
  - «Til en bestemt scene» betyr at endringen er over når den scenen begynner.
  - En hendelse ved scenens første linje gjelder fra scenens begynnelse.
  - Før den første permanente endringen gjelder «utseendet før» den.
  - **En hendelse i en deaktivert scene gjelder ikke** (scenen er tatt ut av historien). Den vises fortsatt i listen, merket. *Midlertidig antakelse.*
  - Hendelsen følger manuslinjen sin hvis scenen deles eller slås sammen.
  - Kontinuitet gjelder ikke steder, miljøer og lyd.
- **Teknisk:**
  - Kjerne: `src/core/continuity/index.ts` (`appearanceAt`, `continuityTimeline`, `continuitySuggestions`, `layerContinuity`, `sceneContinuityVariant`).
  - Kommandoer: `AddContinuityEvents`, `UpdateContinuityEvents` og `SetContinuityEventsRemoved`.
  - Migrasjon 0015: tabellen `continuity_events`, med `apply_changes` utvidet.
  - UI: `ContinuityPanel.tsx` i biblioteket, `LayerInspector`, `SceneAssetsPanel` og `GenerateSceneDialog`.

## DEC-0056 – M6 del 3: konsekvenser ved ressursendring og rådgivende kontinuitetsanalyse
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars: «kan du fortsette? Veldig bra arbeid!!» etter at M6 del 3 var varslet med innhold)
- **Beslutning (mandat kap. 9 og 21, REQ-0130/0132/0134/0314, REQ-0319–0324, REQ-0129, REQ-0437):**
  1. **Godkjenning av et nytt bilde viser konsekvensene.** Dialogen viser scenene som får et annet bilde (også bildeskifter og andre produksjoner), og brukeren velger scene for scene om det nye bildet skal brukes. Scener som ikke skal ha det, beholder bildet de har (laget låses til dagens versjon). Bilder som er låst til en eldre versjon, oppdateres i valgte scener; bilder som er låst til en nyere versjon, endres ikke. Ferdig film der ressursen er med, vises som «kan være påvirket» (usikkert) og endres ikke.
  2. **Sceneeditoren flagger lag som viser en eldre versjon** enn den som er godkjent, med «Bruk vN».
  3. **Rådgivende kontinuitetsanalyse på prosjektoversikten.** Den finner:
     - mulige skrivefeil i navn
     - karakter med i handlingen før introduksjonen
     - gjenstand i bestemt form før den er etablert
     - replikk om noe som bare finnes i en deaktivert scene
     - utseende som avviker fra kontinuiteten eller byttes uten registrert hendelse
     - motsetninger i fortellingstiden og kontinuiteten
     - 2D-scener med eldre versjon

     Usikre funn er merket. Funn kan skjules (bare i visningen). Ingenting endres automatisk.
- **Tolkninger (Claude):**
  - «Introdusert» betyr første replikk eller navnet med store bokstaver i handlingen, i visningsrekkefølge.
  - «Etablert» betyr ubestemt form («en vase») før bestemt form («vasen»).
  - Skrivefeil er stavemåter med 1–2 tegns forskjell, men ikke navn som bare skiller seg i et tall («GUTT 1»).
- **Teknisk:**
  - Kjerne: `src/core/library/impact.ts` (`assetVersionImpact`, `approveWithImpactCommands`, `outdatedLayers`) og `src/core/continuity/analysis.ts` (`continuityAnalysis`).
  - `appearanceFrom` og `baseVariantId` i `src/core/continuity/index.ts`, med mellomlagring per tilstand.
  - UI: `ApproveImpactDialog.tsx`, `ContinuityAnalysisPanel.tsx` og `LayerInspector`.
  - Ingen migrasjon.

## DEC-0057 – M7 del 1: avledede produksjoner (spinoff, trailer, kortfilm)
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars: «På lunsj fortsatt, kjør videre med det gode arbeidet» etter at M7 var foreslått som neste steg; innholdet ble varslet før arbeidet startet)
- **Beslutning (mandat kap. 24, REQ-0353–0366, REQ-0498/0499):**
  1. **Ny produksjon fra prosjektoversikten.** Den får navn og type og et utvalg scener fra hovedfilmen. Scenene gjenbrukes som referanser. Senere kan du legge til flere scener eller skrive nye scener som bare finnes i produksjonen; de legges aldri inn i hovedfilmen.
  2. **Valgt produksjon er felles** for manus, montering, sceneeditor og bibliotek. Rekkefølge, synlighet, lyd, overganger og materiale er produksjonens egne.
  3. **Hovedfilmen beskyttes.** Endrer du en gjenbrukt scene i en avledet produksjon, får produksjonen automatisk sin egen versjon av scenen. Teksthistorikken, 2D-scenen, lyd- og tidskoblinger og grunnlaget for avvik følger med. Hovedfilmen endres ikke, og endringen kan angres i ett steg.
  4. **Gjelder også 2D-scenen.** En 2D-scene som deles med hovedfilmen, kan ikke endres i sceneeditoren før produksjonen har fått egen versjon («Lag egen versjon for …»). Lengde og ny 2D-scene i monteringen lager egen versjon automatisk. Avvik på en delt 2D-scene godkjennes i hovedfilmen.
- **Tolkninger (Claude):**
  - Kontinuitet (utseende) følger hovedfilmens historie (KI-110).
  - Ferdig film følger ikke med til produksjonen (KI-109).
  - I hovedfilmen kan en scene som også brukes i en spinoff, ikke deles eller slås sammen (KI-107). *Midlertidig antakelse – avklares med Mars.*
- **Teknisk:**
  - Kjerne: `src/core/production/index.ts` (`deriveProductionCommands`, `addScenesCommands`, `forkPlan`, `ownCopyCommands`, `compositionCopyCommands`, `isSharedIn`).
  - `ForkVariant` kopierer historikken og flytter forekomstens koblinger. `UndoForkVariant` sammenligner innhold.
  - `useCommands` lager egen versjon automatisk.
  - UI: `use-production.tsx` (`useActiveProduction`, `ProductionPicker`), `ProductionDialog.tsx`, `ProductionList.tsx`, og endringer i manus, sceneeditor og montering.
  - Ingen migrasjon.

## DEC-0058 – M7 del 2: engelsk språkversjon av manuset
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars: «Fortsett» etter at engelsk manus var foreslått som neste del, med innhold og migrasjon 0016)
- **Beslutning (mandat kap. 23, REQ-0329–0335, REQ-0339, REQ-0349, REQ-0351/0352):**
  1. **Engelsk er en tilknyttet språkversjon.** Hver norsk linje og hvert scenehode kan få en oversettelse som hører til samme replikk. Oversettelsen endrer aldri det norske manuset.
  2. **Endringer i norsk merkes.** Endres den norske teksten (eller scenehodet) etterpå, merkes oversettelsen «må gjennomgås». Endres teksten tilbake, forsvinner merket.
  3. **Import av ferdig oversatt manus (PDF/Word).** Programmet kobler scener og linjer automatisk etter rekkefølge, scenenummer, hvem som snakker, INT./EXT., tid på døgnet og oppbygging – ikke bare nummer eller tekst. Brukeren ser koblingene, kan velge en annen norsk scene og godkjenner. Ikke-godkjente koblinger lagres som usikre. Godkjente oversettelser overskrives bare av en godkjent kobling. Med referansemanuset ble alle 97 scener koblet sikkert, og 2192 av 2193 linjer.
  4. **Manusspråk velges i manuset** (Norsk/Engelsk). I engelsk visning vises oversettelsen; linjer som mangler, vises dempet på norsk, og usikre eller endrede er merket. I inspektøren redigeres oversettelsen med den norske teksten ved siden av. Eksport av manus bruker valgt språk.
  5. **Undertekster (.srt/.vtt)** på norsk eller engelsk fra monteringen, med tiden replikkene har i filmen. Språket velges uavhengig av manusets visningsspråk.
  6. **Oversettelsene følger med** når en spinoff får egen versjon av scenen (DEC-0057).
- **Tolkninger (Claude):**
  - Notater festes bare til den norske teksten.
  - Undertekster tar bare med replikker (ikke karakternavn eller handling).
  - Angring av manusimporten krever at oversettelsene fjernes først (ingen stille sletting).
- **Teknisk:**
  - Kjerne: `src/core/translation/index.ts` (`translatedState`, `translationStatus`, `needsReview`, `alignTranslation`/`alignLines`, `translationItems`, `subtitleCues`/`toSrt`/`toVtt`).
  - Kommandoene `AddTranslations`, `UpdateTranslations` og `SetTranslationsRemoved`. `ForkVariant` har fått `translationIdMap`.
  - Migrasjon 0016: tabellen `translations` med én gjeldende oversettelse per linje og språk og `on delete restrict`; `delete_project` og `purge_project_assets` er oppdatert.
  - UI: `TranslationPanel`, `TranslationImportDialog`, `SubtitleDialog`, språkvalg i `ScriptWorkspace`.

## DEC-0059 – M7 del 3: språkversjoner av filmen (lyd, bilder, timing og eksport)
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars: «Vi er ikke ferdig enda, kan du fortsette?» etter at lyd på flere språk var meldt som neste del av M7)
- **Beslutning (mandat 23.3–23.8 og 24.8, REQ-0336–0348, REQ-0350, REQ-0352, REQ-0371):**
  1. **Norsk og engelsk film er samme film.** Scener, 2D-scener, kamera, ressurser og klipp er felles, og scenelengder og replikktider er de samme i alle språk (de følger hovedfilmen). En språkversjon endrer aldri hovedfilmens timing.
  2. **Lyd per språk.** Hvert lydklipp hører til ett språk eller er felles. Dialog og forteller hører til norsk når ikke annet er valgt; musikk, atmosfære og effekter er felles. En replikk kan ha én lydfil per språk, koblet til samme replikk. Språket velges når lyden legges til eller tas opp (dialogspråket som er valgt) og kan endres i lydpanelet.
  3. **Bilde per språk.** Et lag kan vise en annen variant av samme ressurs i engelsk versjon (f.eks. et skilt med engelsk tekst). Norsk endres ikke.
  4. **Importert film med blandet lyd.** For hver importert film angis om lyden har norsk eller engelsk dialog blandet inn, eller bare musikk og effekter. Blandet dialog på et annet språk kan ikke fjernes: lyden spilles som den er, og det varsles (ikke lovet perfekt utskifting).
  5. **Språkversjon …** i monteringen viser scene for scene: oversatte replikker, dialoglyd i språket, materialtype (stillbilde, enkel 2D-animatic, redigerbare 2D-karakterer, AI-video, ferdig film) med råd om leppesynk, blandet filmlyd og timingkonflikter (engelsk replikk lengre enn tiden til neste replikk) med forslag: start tidligere (flytter bare den engelske lyden, «Flytt»), kort ned, la den gå inn i neste, forleng pausen. Ingenting lages på nytt automatisk.
  6. **Dialogspråk og undertekster velges uavhengig** øverst i monteringen (og i eksporten): f.eks. norsk dialog med engelske undertekster i bildet. Grensesnittet er norsk.
  7. **Eksport per språk:** video med valgt dialogspråk (og ev. innbrente undertekster), eller bare dialogsporet som WAV (dialog og forteller, uten musikk, effekter og filmlyd). Sceneeditoren spiller lyden i dialogspråket som er valgt i monteringen.
- **Tolkninger (Claude):**
  - Engelsk varighet uten lydfil beregnes fra den oversatte teksten (2,5 ord per sekund); konflikt når replikken går mer enn 0,2 s over tiden til neste replikk.
  - «Forleng pausen i språkversjonen» er bare et råd; egen klipping per språk er ikke laget.
  - Innbrente undertekster og dialogsporet bruker hovedfilmens tider.
- **Teknisk:**
  - Kjerne: `src/core/language/index.ts` (`languageState`, `clipMaterial`, `lipSyncAdvice`, `timingConflicts`, `languageReport`, `lineAudio`); språk i `src/core/audio` (`clipLanguage`, `playsIn`, `filmAudio(..., språk)`); `cueAt` for undertekster.
  - Kommandoen `SetTakeAudioLanguage`; `language` i lydklipp og `languageImages` i lag. Varianter og versjoner som brukes som bilde for et språk, kan ikke angres bort.
  - Migrasjon 0017: `audio_clips.language`, `composition_layers.language_images`, `takes.audio_language`.
  - UI: `use-film-language.tsx`, `LanguageVersionDialog`, språk og dialogspor i `ExportAnimaticDialog`, språk i `AudioClipPanel`/`AddAudioDialog`/`RecordAudioDialog`, filmlyd i `ClipPanel`, «Bilde i engelsk versjon» i `LayerInspector`; undertekster tegnes i bildet (`drawSubtitle`). Knappene i monteringens verktøylinje viser bare ikon under 1536 px bredde.

## DEC-0060 – M7 del 4: tilbakeføring fra spinoff, kontinuitet i spinoffer og utdrag
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars: «du rekker en stor og omfangsrik omgang til» etter at tilbakeføring, utdrag og varsler om hull i spinoffer var meldt som resten av M7)
- **Beslutning (mandat 10.8, 22, 24.6–24.7 og 25, REQ-0166/0167, REQ-0325, REQ-0367–0383, REQ-0500):**
  1. **Tilbakeføring skjer aldri automatisk.** «Tilbakefør …» (på prosjektoversikten og i manuset for en spinoff) viser scenene spinoffen har egen versjon av eller har skrevet selv, med hovedfilmens og spinoffens versjon side om side: manus linje for linje (endret, ny, fjernet, endret i begge, nyere i hovedfilmen), lag i 2D-scenen, kamera, lyd, timing og ferdig film/klipping.
  2. **Brukeren velger:** behold alt uendret, bare manusendringer, bestemte lag, kamera, lyd, timing, klipping – eller «hele spinoff-versjonen som ny versjon i hovedfilmen». En ny scene som bare finnes i spinoffen, kan overføres til hovedfilmen (egen kopi, valgt plass). Spinoffens versjon endres aldri.
  3. **Trygt standardvalg:** bare manuslinjer spinoffen har endret (linjenes historikk viser hvem som endret hva). Linjer endret i begge, og bilde, kamera, lyd, timing og film, krysses av av brukeren. Hovedfilmens lyd, tidskoblinger og film fjernes ikke fordi spinoffen mangler dem.
  4. **Godkjent materiale** (godkjent ferdig film i hovedfilmen) byttes bare ut etter en egen bekreftelse. Alt føres over med historikk og kan angres samlet; gamle versjoner tas vare på, og den nye versjonen peker til spinoffens (som peker til hovedfilmens gamle).
  5. **Kontinuitet per produksjon:** en spinoff arver hovedfilmens hendelser. En arvet hendelse kan slås av i spinoffen (f.eks. Maja klipper ikke håret), og spinoffen kan ha egne hendelser. Hovedfilmen endres ikke. Biblioteket, sceneeditoren (egen versjon) og «Generer scene» bruker produksjonens kontinuitet.
  6. **Varsler om hull i spinoffen:** kontinuitetsanalysen kan velges per produksjon og varsler når en karakter introduseres i en scene som ikke er med, en replikk viser til noe som bare vises i en utelatt scene, et utseende skyldes en hendelse i en utelatt scene, eller et tilbakeblikk viser til en scene som ikke er med – med «Ta med scenen» (på riktig plass) og «Slå av i …».
  7. **Utdrag og sammenbindende scener:** en spinoff kan bruke et utdrag av hovedfilmens ferdige film (klipping av samme versjon; filen endres aldri), skrive nye sammenbindende scener og ha egne overganger.
- **Tolkninger (Claude):** Linjer og lag kjennes igjen på plassen (rekkefølgenøkkelen) som kopien beholder; linjer uten felles historikk og lag med annet bilde regnes som nye. Hovedfilmens versjoner deles (eier null), så spinoffer kan gjenbruke en tilbakeført versjon.
- **Teknisk:** `src/core/production/promote.ts` (`promotionCandidates`, `comparePromotion`, `promotionCommands`, `defaultChoice`/`scriptOnlyChoice`/`KEEP_ALL`, `newMainVariantCommands`, `transferSceneCommands`, `includeSceneCommands`); `ForkVariant.sourceVariantId` (kopi fra en annen variant, angring på revisjon), kommandoene `TransferScene`/`UndoTransferScene` og `SetContinuityEventDisabled`; `ContinuityEvent.productionId`/`disabledIn`; `continuityFor`/`continuityForVariant` i `src/core/continuity`; funntypen `spinoff_gap`. Migrasjon 0018. UI: `PromotionDialog`, «Tilbakefør» i `ProductionList` og `ScriptWorkspace`, produksjon i `ContinuityPanel` og `ContinuityAnalysisPanel`.


## DEC-0061 – M8 del 1: plakater, karakterkart og relasjoner
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars: «fortsett med neste store» etter at M8 del 1 – plakater og karakterkart – var meldt som neste; stilharmonisering med AI venter på godkjent kostnad)
- **Beslutning (mandat kap. 26, REQ-0384–0399, REQ-0403/0404, REQ-0421, REQ-0501/0502):**
  1. **Ny arbeidsflate «Utgivelse»:** plakater per produksjon (hovedfilm og spinoffer), flere per produksjon, på norsk eller engelsk.
  2. **To typer:** kinopitch-plakat (få karakterer, stemning, tittel, logline) og karakter- og universkart (karakterkort, relasjonslinjer, steder og objekter). Standardformat 70 × 100 cm stående; også 50 × 70 cm, A1, A3 og eget format.
  3. **Førsteutkast fra prosjektet:** hovedkarakterer etter replikker og scener, steder og objekter etter bruk, godkjente relasjoner, komposisjon og fargepalett (stil) foreslås. Alt kan endres.
  4. **13 innholdsvalg som avkrysning** (bare bilder og navn, korte/utfyllende beskrivelser, relasjonslinjer, navngitte relasjoner, tekst om relasjonene, bilder/beskrivelser av objekter og steder, logline, sjanger og stemning, prosjektdata). Endres valgene, lages komposisjonen på nytt; det brukeren har endret selv (flyttet, skrevet, farget, flyttet fram/bak), står.
  5. **Plakaten er et strukturert dokument** med egne elementer i millimeter (tekst, bilde, flate, relasjonslinje), ikke ett bilde. Elementene kan velges, flyttes, endres i størrelse og redigeres; egne tekster, bilder og flater kan legges til.
  6. **Lesbarhet kontrolleres:** tekst under 12 pt (på 70 × 100 cm, skalert etter format) eller tekst som ikke får plass, gir varsel med forslag (kortere beskrivelser, færre karakterer, karakterkart i stedet). Manglende bilder og manglende engelsk tekst meldes.
  7. **Relasjoner:** forslag fra manuset (sammen i scener, ord som «mor», «krangler», «trøster») vises som forslag og lagres bare når de godkjennes; avviste foreslås ikke igjen. Relasjoner kan endres, fjernes og legges til selv. Typer: familie, vennskap, konflikt, omsorg, romantikk, mentor, skjult forbindelse, annen.
  8. **Eksport:** trykk-PDF med ekte tekst (PDF-standardskriftene), bilder i trykkoppløsning, 3 mm utfallende kant og skjæremerker; PNG for digital bruk (72–300 ppi, begrenset av nettleseren til ca. 16 Mpx).
- **Tolkninger (Claude):** Skriftene er Helvetica og Times (PDF-standard, ingen innebygging) med samme mål i forhåndsvisning, PNG og PDF, så linjebrytingen blir lik. Engelsk tekst som mangler, vises på norsk og meldes. Stilharmonisering med AI (REQ-0137–0145, REQ-0400–0402) er ikke laget.
- **Teknisk:** `src/core/presentation/` (`metrics`, `relations`, `poster`, `document`), modell `AssetRelation`, `Poster`, `PosterDocument`, `PosterElement` (med `overrides`); kommandoene `AddRelations`/`UndoAddRelations`/`UpdateRelations`/`SetRelationsRemoved`/`CreatePoster`/`UndoCreatePoster`/`UpdatePoster`/`SetPosterRemoved`; `src/engine/export/poster-pdf.ts` (egen PDF-skriver) og `poster-canvas.ts`; UI i `src/app/release/`, ruten `/prosjekt/$projectId/utgivelse`. Migrasjon 0019.

## DEC-0062 – Kamera og lag: «Bruk aktivt utsnitt», grupper med dra og slipp, justerbar lagliste
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars' ønsker 2026-10-11)
- **Beslutning (REQ-0584, REQ-0585):**
  1. Start- og sluttrammen i et kamerautsnitt har knappen **«Bruk aktivt utsnitt»**: den kopierer utsnittet kameraet har når scenen rett før slutter.
  2. Hvert lag i lagpanelet kan **fjernes fra scenen** (ressursen blir i biblioteket; kan angres).
  3. Et lag kan **dras inn på en gruppe** for å bli med i den, og **dras ut** igjen (slippes ved et lag utenfor gruppen, eller «Ta ut av gruppen»). Laget står stille i bildet.
  4. **Valgt gruppe lyser opp** lagene i den, i listen og i scenen.
  5. **Skillelinjen under laglisten** kan dras, så brukeren bestemmer hvor mange lag som vises (huskes).
- **Tolkninger (Claude):** «Aktivt utsnitt» = sluttrammen i det siste kamerautsnittet i forrige aktive scene (hele formatet hvis den ikke har kamerautsnitt), omregnet til scenens format.

## DEC-0063 – Endre rolle etter invitasjon, og «Tilbake» til forrige vindu
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars: «Det må være mulig å endre rolle etter at en person er invitert inn» og «en global funksjon som gjør at jeg kan trykke tilbake, og at jeg da kan hoppe tilbake til det vinduet jeg kom fra»)
- **Beslutning (REQ-0586, REQ-0587, REQ-0520/0521):**
  1. **Eieren endrer roller** på prosjektoversikten (eier, redaktør, kommentator, leser), også for seg selv. Prosjektet har alltid minst én eier; en eier kan gjøres til redaktør når det finnes en annen eier. Eiere kan godkjenne kostnader.
  2. **Ventende invitasjoner** vises for eieren med rolle som kan endres, og kan trekkes tilbake.
  3. **«Tilbake til …»** øverst til venstre i toppstripen, på alle sider: går til forrige arbeidsflate (manus, bibliotek, sceneeditor, montering, utgivelse, prosjektoversikt, prosjektlisten) med samme valg som da du forlot den. Valg inne i samme flate (annen scene, annen ressurs) gir ikke nye steg. Nettleserens egen tilbake-knapp virker fortsatt.
- **Tolkninger (Claude):** Bare eieren kan endre roller (samme som for invitasjoner). Når en eier gjør seg selv til noe annet, spørres det først. Fjerning av medlemmer (ikke bare rolleendring) er ikke laget.
- **Teknisk:** migrasjon `0020_member_roles.sql` (`set_member_role`, `set_invitation_role`, `revoke_invitation`, alle `security definer` med kontroll av eier; rolleendringer i et prosjekt serialiseres med `for no key update` på prosjektraden). UI: `src/app/projects/MembersSection.tsx`. Tilbake: `src/app/shell/back-stack.ts` (rene funksjoner) og `back-navigation.tsx` (`useTrackNavigation` i rotruten, `BackButton` i `AppHeader`; historikken i sessionStorage).

## DEC-0064 – Bilder i fullskjerm, nedlasting med prosjektnavn og opplasting igjen
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars' ønske 2026-10-11)
- **Beslutning (REQ-0588):**
  1. **Dobbeltklikk** på et bilde i biblioteket (versjonene til en karakter, et sted eller et objekt) åpner det i **fullskjerm**: zoom med rullehjul eller knapper, flytt ved å dra, bla mellom versjonene med piltastene, «Last ned».
  2. **Nedlastede bilder får prosjektets navn:** «Ressurs - Variant - vN.png», der N er versjonens løpenummer i prosjektet. Zip-nedlastingen bruker samme navn.
  3. **Lastes en fil med samme navn opp igjen** (i varianten, eller med «Last opp endrede bilder …» øverst i biblioteket, flere samtidig), spør programmet:
     - **Erstatt:** filen blir ny versjon som tar over overalt den gamle ble brukt – godkjenning, lag i 2D-scenene (også bildeskifter og bilder per språk) og plakater. Scenene og prosjektet er dermed oppdatert.
     - **Legg til:** filen blir ny versjon ved siden av, med eget løpenummer og merknad «Endret fra vN». Den får sitt eget navn ved neste nedlasting, så det ikke blir forveksling.
     - **Hopp over.**
- **Tolkninger (Claude):**
  - Også ved «Erstatt» får den nye filen neste løpenummer (f.eks. v4), og den gamle (v3) tas vare på i historikken. Prosjektet sletter eller overskriver aldri bilder (versjonene er uforanderlige), og erstatningen kan angres.
  - Filnavnet kjennes igjen også med annen filtype og med nettleserens tillegg ved dobbel nedlasting («… v3 (1).png»).
- **Teknisk:** `src/core/library/file-names.ts` (`versionFileBase`, `versionFileName`), `reupload.ts` (`versionFromFileName`, `replaceVersionCommands`, `versionUse`, `reuploadNote`). UI: `ImageViewer.tsx`, `ReuploadDialog.tsx`, endringer i `AssetDetail.tsx` og `LibraryWorkspace.tsx`. Ingen migrasjon.

## DEC-0065 – Filmens visuelle stil og bildebeskrivelser med sammenheng
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars: bildeteksten «må være mye mer intelligent … systemet vi bygger [må] komme opp med en god beskrivelse på kontekst, godkjente bilder i filmen og hvordan stilen er … generiske AI-instrukser for prosjektet … stil, fargepalett, utførelse og følelse … kanskje også lyssetting i en scene»; «kan du fortsette»)
- **Beslutning (REQ-0589, REQ-0147, REQ-0245, REQ-0246, REQ-0441):**
  1. **«Filmens visuelle stil»** på prosjektoversikten: hva filmen handler om, verden (sted, tid, årstid), publikum og tone, visuell stil, teknikk og materialer, fargepalett, lys, stemning, regler for figurer og for omgivelser, bildeutsnitt og kameraspråk, hva som skal unngås, egne AI-instrukser og forbildebilder (godkjente bilder som viser stilen). Programmet kan foreslå et utkast fra prosjektet (fyller bare tomme felt), og viser hvordan en beskrivelse blir.
  2. **Bildebeskrivelsen settes sammen av alt prosjektet vet** (seksjoner på engelsk):
     - FILM.
     - VISUAL STYLE.
     - THIS IMAGE – hva bildet er og hvordan det brukes: frilagt figur eller bakgrunn.
     - WHERE IT APPEARS – scenene: sted, inne/ute, tid på døgnet og årstid med lyset det gir, hvem andre som er der, et utdrag av handlingen og utseendet i scenen.
     - CONSISTENCY – godkjente figurer og steder i samme scener, filmens forbildebilder.
     - AVOID.
     - PROJECT INSTRUCTIONS.
     Fra sceneeditoren brukes scenen laget hører til.
  3. Stilen brukes også i beskrivelsene for video («Generer scene»).
  4. **Ikke laget ennå, venter på Mars' ja (koster penger):** (a) en språkmodell som skriver beskrivelsen om til god prosa ut fra alt dette, (b) å sende forbildebildene med til bildemodellen.
- **Tolkninger (Claude):** Feltene skrives helst på engelsk; tekst fra manus og bibliotek står på norsk og er merket slik i beskrivelsen. Lyset fra tid på døgnet er et forslag i beskrivelsen og kan overstyres av feltet «Lys» og ved å endre beskrivelsen.
- **Teknisk:** modell `StyleProfile`/`StyleGuide` (tabellen `style_profiles`, migrasjon 0021, høyst én standard per prosjekt), kommandoene `CreateStyleProfile`/`UndoCreateStyleProfile`/`UpdateStyleProfile`/`SetStyleProfileRemoved`; `src/core/generation/style.ts` og `image-prompt.ts` (`buildContextImagePrompt`, `suggestStyleGuide`, `hasStyleGuide`); UI `src/app/projects/StyleGuideSection.tsx`; `GenerateImagePanel` med `context` (fra `LayerImageDialog`); `buildScenePrompt` tar med stilen.

## DEC-0066 – AI skriver bildebeskrivelsen og ser filmens bilder; «Erstatt» gjelder også spinoffer
- **Dato:** 2026-10-11 · **Type:** Bekreftet av bruker (Mars: «Ja også for spinn off. Og ja trenger maksimal god beskrivelse, ja bilder kan sendes og brukes»)
- **Beslutning (REQ-0589, REQ-0246, REQ-0588):**
  1. **Kostnad godkjent for en språkmodell som skriver bildebeskrivelsen.** Knappen «Skriv beskrivelsen med AI» sender grunnlaget (beskrivelsen programmet har satt sammen, DEC-0065, eller brukerens endrede versjon) og bildene som skal sendes med, til en språkmodell i Lovable AI Gateway. Den skriver én presis beskrivelse på engelsk. Teksten vises og kan endres før et bilde genereres (genereringen bekreftes som før).
  2. **Bildene kan sendes med.** Til bildemodellen sendes, i rekkefølge: dagens bilde av ressursen (hvis «Bruk dagens bilde som forbilde» er valgt – utseendet beholdes), filmens forbildebilder fra den visuelle stilen og godkjente bilder av det som er i de samme scenene (for en figur: andre figurer og ting; for en bakgrunn: bare steder). Høyst 6 bilder. Beskrivelsen sier hva hvert bilde er, og at forbildene bare gjelder stilen. Valget «Send filmens godkjente bilder med som stilforbilder» kan slås av.
  3. **«Erstatt» ved opplasting igjen gjelder også spinoffer** som bruker bildet (KI-141 lukket; slik det allerede var bygd).
- **Tolkninger (Claude):** AI-skrevne beskrivelser logges i AI-jobbene, men teller ikke i prosjektets bildebudsjett (de koster en brøkdel av et bilde); egen grense på 60 per bruker per time. Språkmodell: Gemini 3.1 Pro (ser bilder, skriver godt), med reserve hvis Lovable ikke kjenner modellnavnet; kan overstyres med `ANIMATIC_TEXT_MODEL` i Lovable Cloud. Avviser bildetjenesten flere bilder, prøves den igjen med bare det første.
- **Teknisk:** `src/core/generation/prompt-writer.ts` (instruksen, brukermeldingen, rensing av svaret), `attachedImages`/`describeAttached` i `image-prompt.ts`, serverfunksjonen `src/adapters/ai/write-prompt.functions.ts` (`/chat/completions`), `generate-image.functions.ts` tar `referencePaths` (flere bilder, `image[]`), felles `gateway.ts`; migrasjon 0022 (`generation_jobs.kind` «prompt», `result_text`, `reference_paths`).

## DEC-0067 – Nattarbeid 12.10.2026: AI-bilder som ikke ble lagt inn, produksjonsstatus, planlagt lengde, fjerne medlem
- **Dato:** 2026-10-12 · **Type:** Teknisk anbefaling (Mars: «Legger meg nå for natten, kan du ta fem runder frem til i morgen?» – ingen nye produktkrav; alt bygger på mandatet og vedtatte krav)
- **Innhold:**
  1. **AI-bilder som ble laget, men ikke lagt inn** (REQ-0291/0504, del): genereringen kjører på serveren, men versjonen lages av nettleseren. Ble siden lukket underveis, viser AI-jobbene nå «Bildet er laget, men ikke lagt inn i biblioteket» med «Legg inn» (etter fem minutter, så siden som bestilte bildet får gjøre det selv). Ingen ny kostnad.
  2. **Varighet og produksjonsstatus** på prosjektoversikten (mandat 7.2–7.3 og 27.1–27.2; REQ-0112–0119, REQ-0405/0406, REQ-0494): forventet lengde nå (beste tall per scene: film → AI-video → 2D-animatic → plan → estimat, hver scene én gang), bekreftet, gjenstående, andel ferdig og estimert, status per scene (ferdig, film ikke godkjent, 2D-animatic, mangler produksjon, deaktivert), manusendringer, filter (status, karakter/objekt/sted, avvik, tekst) og lenker til manus, sceneeditor og montering.
  3. **Planlagt lengde per scene** (mandat 7.1–7.2 «brukerplanlagt varighet», REQ-0111/0113): settes i «Per scene → Plan», erstatter manusestimatet i oversikten, monteringen og sceneeditoren til 2D-scenen har satt lengde eller filmen er lagt inn. Angres som andre endringer.
  4. **Eieren kan fjerne et medlem** (REQ-0529): medlemskapet avsluttes; alt personen har laget og historikken står. Ventende invitasjoner personen har laget eller som gjelder personens e-post, trekkes tilbake.
  5. **Kravrevisjon:** 65 krav med utdatert status er gjennomgått mot koden og testene (31 Verifisert, 34 Implementert – ikke verifisert); resten er uendret og står som ikke bygd.
- **Tolkninger (Claude):** «Bekreftet» lengde er bare lengde fra laget materiale (2D-animatic med satt lengde eller film); en plan teller som gjenstående. Planen gjelder forekomsten i én produksjon og følger ikke med til spinoffer.
- **Teknisk:** `src/core/generation/cost.ts` (`unclaimedImageJobs`, `versionIdFromResultPath`, `CLAIM_GRACE_MS`), `mediaFromStoredFile`, `AiPanel`; `src/core/assembly/status.ts` (`productionStatus`, `filterStatusRows`, `parsePlannedDuration`), `DurationOverview.tsx`; `SceneOccurrence.plannedMs`, kommandoen `SetPlannedDuration`, `durationKind: "planned"` i `filmClips`, `compositionDuration`; migrasjon `0023_member_removal_planned.sql` (`remove_member`, `scene_occurrences.planned_ms`), `needsSchema23`, `MembersSection`.

## DEC-0068 – Nattarbeid 12.10.2026, runde 6–10: fortellingstid i manus, utvikling over tid, flere filter
- **Dato:** 2026-10-12 · **Type:** Teknisk anbefaling (Mars: «ville bare gi grønt lys til at du kjører fem runder til før jeg står opp» – ingen nye produktkrav; alt bygger på mandatet)
- **Innhold:**
  1. **Fortellingstid i manus** (mandat 10.7, REQ-0164): i inspektøren kan en scene merkes som tilbakeblikk, fremblikk, drøm eller tidshopp og plasseres før, samtidig med eller etter en annen scene. Kontinuiteten følger dette. Merket vises i scenelisten, ikke i selve manuset (REQ-0102). Endres i hovedfilmen (gjelder scenen i alle produksjoner).
  2. **Utvikling over tid** (mandat 7.4, REQ-0120): estimat og forventet lengde for hver lagret manusversjon og nå.
  3. **Flere filter** (mandat 4.5 og 27.2; REQ-0073, REQ-0406): manuset kan filtreres på objekt/rekvisitt/sted, produksjonsstatus og manusendringer; oversikten også på ressursendring og språk.
  4. **Planlagt lengde ved deling og sammenslåing**: planen fjernes (den gjaldt hele scenen) og settes tilbake ved angring (KI-146).
  5. **Rettinger etter kodegjennomgang:** ny scene med ugyldig fortellingstid avvises i kjernen; en scene som andre scener er plassert i forhold til, kan ikke angres bort; modultabellen i ARCHITECTURE.md er rettet (KI-148).
- **Tolkninger (Claude):** «Før» og «etter» er en halv scene fra ankeret i fortellingstiden; tilbakeblikk foreslår «før», fremblikk og tidshopp «etter», drøm «samtidig med».

## DEC-0069 – Egne AI-leverandører: veiledning, sikre nøkler, overordnet kostnadstak; bilde, video og lyd
- **Dato:** 2026-10-12 · **Type:** Bekreftet av bruker (Mars: «løsningen kan presentere en liste over de mest brukte ai leverandørene og velger brukeren en av disse eller setter opp fler eller alle vil de valgte bli tilgjengelige for å genere enkelt bilder i løsningen og videoer (og lyder?). Bruker bør få hjelp med å klikke på en leverandør og i en dialog få nødvendige lenker til å gå til tjenesten opprette et abo, og lenke til der en får api nøkkel og en dialog til å legge denne inn i løsningen, denne nøkkelen må sikres etter alle kunstens regler og det må være mulig å sette et tak på ai kost på overordnet nivå.»)
- **Beslutning (REQ-0590, REQ-0566, REQ-0270–0273, REQ-0413, REQ-0180, REQ-0282, REQ-0284):**
  1. **Leverandørliste** under «AI-leverandører …» på prosjektlisten: Lovable AI (innebygd), OpenAI (GPT Image, Sora), Google Gemini (Nano Banana, Veo), fal.ai (FLUX Kontext, Kling), Runway (Gen-4 Turbo) og ElevenLabs (lydeffekter). Brukeren kan koble til én, flere eller alle.
  2. **Veiledning per leverandør:** steg på norsk og lenker til konto, betaling/abonnement, API-nøkkel og priser; feltet for nøkkelen prøver den hos tjenesten før den lagres.
  3. **Nøkkelen sikres:** kryptert med AES-256-GCM på serveren, bundet til bruker, leverandør og rad; hovednøkkelen er en serverhemmelighet. Den krypterte nøkkelen kan ikke leses fra nettleseren (heller ikke av eieren), bare de fire siste tegnene vises, og fjerning sletter raden. Feiltekster renses for nøkler. Filer hentes bare fra vanlige https-adresser, og nøkkelen sendes aldri videre til en annen vert.
  4. **Overordnet kostnadstak** i USD per måned per bruker for alt som genereres med brukerens nøkler, i alle prosjekter; i tillegg gjelder prosjektets budsjett. Kontrolleres før og etter hver jobb; forbruk tas vare på når et prosjekt slettes for godt.
  5. **Bruk:** bilder (biblioteket og sceneeditoren, med valg av leverandør og modell), video per segment i «Generer scene» (legges inn som ny versjon av scenen og kan settes sammen til scenen; 2D-scenen erstattes aldri) og lyd for lydressurser i biblioteket (ny versjon). Kostnaden vises og bekreftes alltid først.
- **Endring av en stående regel:** «API-nøkler bare i Lovable-hemmeligheter» gjelder fortsatt for programmets egne nøkler. Brukernes egne nøkler lagres kryptert i databasen; hovednøkkelen er `ANIMATIC_KEY_ENCRYPTION_KEY` (32 byte, base64) i Lovable Cloud. Finnes den ikke, avledes en hovednøkkel fra serverens tjenestenøkkel (HKDF) – det virker, men en egen hemmelighet er sikrere og anbefales (se LOVABLE_SYNC).
- **Tolkninger (Claude):** Et prosjekt bruker nøklene til prosjektets eiere (den som ber om genereringen først, hvis hen er eier); redaktører kan generere med eierens nøkkel, alltid med bekreftelse og innenfor taket. Lesere og kommentatorer kan ikke generere. Prisene er anslag fra leverandørenes prislister; regningen kommer fra leverandøren. Lyd uten valgt lengde regnes som 30 sekunder i taket. En videostart som kan ha kostet uten at vi fikk svar, regnes med i taket.
- **Teknisk:** `src/core/generation/providers.ts` (katalog, priser, nøkkelkontroll), `video.ts`, `sound.ts`; `src/adapters/ai/key-vault.server.ts`, `providers.server.ts` (adaptere, trygg nedlasting, rensing), `provider-keys.functions.ts`, `ai-gate.server.ts`, `generate-image.functions.ts`, `video.functions.ts`, `sound.functions.ts`; UI `ProvidersDialog.tsx`, `SceneVideoSection.tsx`, `video-jobs.ts`, `GenerateSoundPanel.tsx`; migrasjon `0024_ai_providers.sql` (`ai_provider_keys`, `ai_account_limits`, `ai_spend`, nye kolonner i `generation_jobs`).

## DEC-0070 – Ti store bolker: bakgrunnskø, video for flere scener, innsatsnivå, modelltilpassede beskrivelser, sammenheng, sammenligning, hybrid sammensetting, oppdatering med AI, Fountain og lydkoblinger
- **Dato:** 2026-10-12 · **Type:** Teknisk anbefaling (Mars: «fortsett med de neste 10 store tingene!» – ingen nye produktkrav; alt bygger på mandatet kap. 13, 18–21 og 33 og DEC-0069)
- **Innhold:**
  1. **Bakgrunnskø** (REQ-0291/0293/0504): adressen `/api/cron/ai-jobs` (beskyttet med `LOVABLE_CRON_SECRET`) kalles på en fast plan av Lovable Cloud. Den henter inn ferdige videoer uten at noen har prosjektet åpent, sender ventende jobber og merker bilde-/lydjobber som ikke svarte på 15 minutter som «stoppet». Versjonen legges inn i scenen neste gang noen med redigeringstilgang åpner prosjektet (kan angres).
  2. **Video for flere scener og kø** (REQ-0289/0290/0295/0300/0301): velg scener i monteringen, se samlet anslått kostnad, bekreft – segmentene legges i kø og sendes høyst tre om gangen per nøkkel. AI-jobbene viser plass i køen og fremdrift (leverandørens tall, ellers et anslag som sier at det er et anslag), og ventende jobber kan få prioritet, settes først eller avbrytes uten kostnad.
  3. **Innsatsnivå** (mandat 19.3–19.4, REQ-0275–0278): «Rask / Økonomisk», «Balansert», «Høy / Premium» velger modell blant de tilkoblede og viser hvilke kvalitetsmekanismer modellen faktisk har. Programmet sier at høyere kostnad ikke garanterer bedre resultat.
  4. **Beskrivelser tilpasset modellen** (REQ-0246/0261/0274/0489): lengdegrense per modell (de minst viktige delene tas bort først), modeller uten lyd får replikkene som munnbevegelser, replikker kuttes aldri – får de ikke plass, stoppes sendingen. Det som sendes, vises før bekreftelse.
  5. **Sammenheng mellom segmenter** (REQ-0263): siste bilde i en AI-video lagres når videoen legges inn, og neste segment kan starte fra det.
  6. **Kandidater og sammenligning** (mandat 19.7, REQ-0254/0258/0285/0318): 1–4 kandidater for bilder og video; sammenlign side ved side (video kan spilles samtidig) og velg uten å slette de andre.
  7. **Sammensetting** (REQ-0264–0266, REQ-0214): scenen kan settes sammen av AI-video og 2D-animatic der video mangler eller er for kort; varsel når et segment har fått et nytt valg.
  8. **Oppdatering med AI ved avvik** (valg B, REQ-0133/0308–0310): bare segmentene endringen berører; notater/overganger gir ingen ny video; kostnad vises; nye videoer ved siden av de gamle.
  9. **Fountain** (REQ-0089): import og eksport (.fountain, .spmd, .txt) med samme valg som Word/PDF. Et manus helt uten scenenumre merkes ikke lenger som usikkert (bare når noen scener har nummer og andre ikke).
  10. **Lyd** (REQ-0203–0205): lyd kan kobles til karakterer/ressurser, replikker, scener, delsekvenser, hendelser og produksjoner; søket i biblioteket treffer koblingene, og lyd kan filtreres på kategori.
- **Tolkninger (Claude):** Køen er unntatt timegrensen per person (taket og budsjettet regner med jobbene i kø med en gang); høyst 300 i kø per prosjekt. Jobber i kø for et slettet prosjekt avbrytes uten kostnad. Overganger mellom segmenter er ikke laget (klippene settes rett etter hverandre). Fountain: dobbel dialog importeres som vanlig dialog (merket usikker).
- **Kodegjennomgang:** 10 funn, 9 rettet (tidsvinduer fra sending, statusvakter, kandidater, beskyttede replikker, koblinger til fjernede objekter, kø for slettede prosjekter, sjekk av lagret siste bilde, Fountain-escaping/tankestrek/UTF-16); det tiende (køen unntatt timegrensen) er bevisst.
- **Teknisk:** `src/routes/api/cron/ai-jobs.ts`, `src/adapters/ai/video-followup.server.ts`, `queue.functions.ts`; `src/core/generation/queue.ts`, `model-prompt.ts`, utvidet `providers.ts` (tier, extras, maxPromptChars, `effortChoice`, `qualityMechanisms`) og `video.ts` (`sceneVideoWork`, `chainStartPath`, `videoAttempts`, `chooseAttemptCommands`, `assembleSegments`, `assemblyUsesChosen`, `aiUpdatePlan`); UI `BatchVideoDialog`, `CompareTakesDialog`, `AiUpdateSection`, `EffortPicker`, `SentPrompts`, `ImageCompareDialog`, `SoundLinksSection`, `last-frame.ts`; `src/core/screenplay/fountain.ts`; kommandoen `SetSoundLinks`, `src/core/library/sound-links.ts`; migrasjon `0025_ai_queue.sql` (status «queued», `priority`, `queue_position`, `progress`, `started_at`, `assets.sound_links`).

## DEC-0071 – Ti store bolker: sammenheng i køen, myke overganger, kvalitetssjekkliste, betegnelser i kontekst, stilprofiler per bruk, masker, eksporttekst, manusdekning, AI-stemmer og kravgjennomgang
- **Dato:** 2026-10-12 · **Type:** Teknisk anbefaling (Mars: «I møte, kan du ta de neste 10 store bolkene?» – ingen nye produktkrav; alt bygger på mandatet kap. 8, 11, 18–21 og 33 og DEC-0069/0070)
- **Innhold:**
  1. **Sammenheng i køen** (REQ-0263): når flere segmenter legges i kø, kan hvert vente på segmentet før og starte fra dets siste bilde. Køen sender det først når siste bilde er lagret; feiler segmentet før, avbrytes det neste uten kostnad.
  2. **Myke overganger mellom deler** (REQ-0265): krysstoning 0,25–2 s mellom delene i en scene (velges per del i «Klipp», eller «Myk overgang mellom videoene» når scenen settes sammen av AI-video). Scenen blir ikke kortere; overgangen er aldri lengre enn nabodelene. Med i visning og eksport.
  3. **Kvalitetssjekkliste** (mandat 19.8, REQ-0287/0288): rådgivende liste per AI-video (manus, karakterreferanser, stil, kontinuitet, kamera, teknisk) i «Kontroller/Sammenlign», alltid med teksten om at den er støtte og ikke ser på bildene.
  4. **Betegnelser i bestemte linjer** (mandat 8.2, REQ-0127): «onkel» kan være Laurits i valgte replikker uten å bli et alternativt navn overalt.
  5. **Stilprofiler per bruk** (REQ-0148): egne profiler for plakater, steder, 2D-animatic, AI-video osv.; standardprofilen for resten.
  6. **Maske og blanding** (mandat 11.2, REQ-0175): rektangel, ellipse eller et annet lag som maske, og blandingsmodus per lag – også i eksport.
  7. **Eksporttekst** (REQ-0417/0418): eksportdialogen sier hvilken produksjon som eksporteres og at film, AI-video og 2D blandes slik monteringen viser.
  8. **Manusdekning** (REQ-0237): en importert film eller AI-video kan angi første og siste manuslinje den dekker; avvik flagges bare innenfor.
  9. **Dialog med AI-stemmer** (REQ-0203/0206): stemme per karakter (ElevenLabs), innlesing av replikkene i scenen etter kostnadsgodkjenning, lagt på dialogsporet. Opptak og importert dialog røres ikke.
  10. **Kravgjennomgang**: 24 krav kontrollert mot koden (13 verifisert, 11 implementert – ikke verifisert). Norske navn i grensesnittet er gjennomgått; navnene i REQ-0430 venter på Mars.
- **Tolkninger (Claude):** Myk overgang er på som standard når scenen settes sammen av AI-video (bare der to videoer møtes, 0,5 s), og skjules på databaser uten migrasjon 0026. En sammenhengende jobb venter høyst 30 minutter på siste bilde etter at videoen før er ferdig (bildet lagres av nettleseren); deretter feiler den uten kostnad. Angring av opprettelsen av en ressurs eller stilprofil avvises når andre senere har gitt den stemme, betegnelser, lydkoblinger eller bruk.
- **Kodegjennomgang:** 10 funn + 1 mindre, alle rettet unntatt nr. 8 (fjernede linjer utenfor dekningen flagges fortsatt, KI-170): egne videoelementer per plass i overganger, tidsgrense for siste bilde, kjede bare til segmentet før, grenser for overganger, myk overgang skjult før 0026, reserveprofil, angring, sjekkliste mot videoens eget utgangspunkt, eksport uten bilde over seg selv, vern mot dobbeltklikk ved innlesing.
- **Teknisk:** migrasjon `0026_masks_voices_styles.sql` (`composition_layers.mask/blend`, `clip_parts.transition_ms`, `assets.voice/context_names`, `style_profiles.applies_to`, `takes.coverage`); kommandoene `SetContextNames`, `SetAssetVoice`, `SetTakeCoverage`, `SetStyleAppliesTo`; `src/core/generation/quality.ts`, `speech.ts`, `style.ts`; `partBlendAt` i `src/core/assembly/film.ts`; `src/adapters/ai/speech.functions.ts`; UI `AiDialogueDialog`, `ContextNamesSection`, `LayerMaskSection`, overgang i `ClipParts`, dekning i `ClipPanel`.

## DEC-0072 – AI-generering bare når brukeren ber om det; arbeidsliste for oppdaterte ressurser; ti store bolker
- **Dato:** 2026-10-12
- **Bekreftet av bruker (Mars):**
  - «vi kjører ingen genereringer av video automatisk, dette skal alltid gjøres fra bruker og be om scene for scene eller hele eller deler..» → REQ-0592. Den planlagte bakgrunnsjobben (DEC-0070) settes ikke opp; jobber sendes og hentes mens prosjektet er åpent. Adressen finnes fortsatt (flyttet til `/api/public/cron/ai-jobs`, beskyttet med hemmeligheten), men ingen kaller den.
  - «om en assets er oppdatert kan en få opp en arbeidsliste for å gå igjennom hvike scener som er berørt og om scene for scene at den nye assetsen skal brukes i stedet for» → REQ-0591.
- **Teknisk anbefaling (Mars: «Tar du de neste 10?») – innhold:**
  1. **Stillbilder i monteringen** (REQ-0214/0418): et bilde fra biblioteket i valgt tid, som hele scenen eller ny del; i visning og eksport. Versjonen peker på bildefilen (ingen kopi). Bare PNG, JPEG og WebP.
  2. **Eksport av valgte scener** (REQ-0417, KI-169): vilkårlige scener settes etter hverandre; naboer beholder overgangen, ellers rent kutt; lyd og undertekster følger scenen.
  3. **Sporbarhet per generering** (REQ-0257): systeminstruks (nøkkel og kontrollsum), parametere, referanser med ressursversjon, manusversjon og linjerevisjoner lagres i jobben (innenfor 3000 tegn) og vises i AI-jobbene.
  4. **Replikkens koblinger** (REQ-0095/0099): dialogopptak, tidspunkt, 2D-hendelser og filmklipp vises samlet i manusets inspektør med lenker.
  5. **Teknisk visning** (REQ-0103): «Teknisk» i monteringen viser tidskoder, bildenummer, materiale og filinformasjon.
  6. **Lagring og eksportinnstillinger** (REQ-0415/0407): oversikt per lagringskategori; eksportinnstillingene huskes per produksjon (utenfor angrelisten).
  7. **Arbeidsliste for oppdaterte ressurser** (REQ-0591): se over.
  8. **Film i spinoffen** (KI-109): en delt scene uten eget valg viser hovedfilmens film og klipping; klipping eller valg i spinoffen gir eget materiale, og hovedfilmen endres aldri.
  9. **Masker** (KI-166, REQ-0175): animerbare med nøkkelbilder og med håndtak på lerretet (underagent).
  10. **Ende-til-ende-test uten AI** (REQ-0001/0004) og rettinger: KI-147 (AI-bilde legges i riktig variant), KI-170 (fjernede linjer utenfor manusdekning).
- **Tolkninger (Claude):**
  - «Behold» lagres som gjennomgått versjon på laget eller versjonen av scenen (migrasjon 0027). Scenen kommer tilbake på listen når en enda nyere versjon godkjennes.
  - AI-video kan ikke byttes ut; arbeidslisten viser den, og «Lag ny video …» åpner bare scenen.
  - Et arvet materiale i en spinoff står på hovedfilmens arbeidsliste, ikke spinoffens.
  - «Bruk animatic» i en spinoff som arver film, lagres som én egen del med 2D-scenen.
- **Kodegjennomgang:** 10 funn + 7 mindre. Rettet:
  - sporets størrelse;
  - arbeidslisten i spinoff;
  - animatic-valg i spinoff;
  - stillbilder som lyd;
  - bildetyper og feilmelding i eksport;
  - avvik for arvet materiale;
  - angring av bildeversjon;
  - eksportinnstillinger utenfor angrelisten;
  - ytelse i koblingspanelet;
  - prosjektfilter i sporoppslag.

  Resten står som KI-172 til KI-174.
- **Teknisk:**
  - migrasjon `0027_review_export.sql` (`composition_layers.reviewed_versions`, `takes.reviewed_versions`, `productions.export_settings`);
  - kommandoene `SetReviewedVersions` og `SetExportSettings`;
  - `EXPECTED_SCHEMA_VERSION` = 27;
  - kjernemoduler: `src/core/library/{worklist,storage}.ts`, `src/core/assembly/{block-links,technical}.ts`, `src/core/generation/trace.ts`;
  - serverfil: `src/adapters/ai/trace.server.ts`;
  - grensesnitt: `StillPickerDialog`, `TechnicalSection`, `BlockLinksSection`, `AssetWorklistDialog`, `WorklistNotice`, `StorageSection`, `TraceDetails`.

## DEC-0073 – AI-køen uten bakgrunnsjobb, kravverifisering og ti forbedringer
- **Dato:** 2026-10-12 · **Type:** Teknisk anbefaling (Mars: «Fortsett med neste store gruppe ting, er i møte» – ingen nye produktkrav; følger opp DEC-0072)
- **Innhold:**
  1. **AI-køen uten bakgrunnsjobb** (REQ-0592, KI-145). Fordi det ikke skal være noen planlagt jobb (DEC-0072), gjør nettleseren til en redaktør jobben mens prosjektet er åpent, uansett hvilken side som er åpen:
     - sender jobber brukeren har lagt i kø;
     - henter ferdige videoer og legger dem inn som versjon (det lagrer også siste bilde, så sammenhengen fortsetter);
     - merker jobber plattformen stoppet.
     
     Ingen ny generering startes. Svarer leverandøren «for mange forespørsler» (429), legges jobben tilbake i køen. Kostnadstaket sjekkes igjen før en jobb i køen sendes.
  2. **Valgte scener** (KI-172): lyd og undertekster kuttes der rekken av naboscener slutter.
  3. **Arbeidslisten** (KI-106, KI-173): tar med bildeskifter og språkbilder. Laget i sceneeditoren viser dem og kan bruke den nye versjonen.
  4. **«Fjern oversettelsene …»** (KI-114): alle oversettelser til et språk i én angrebar endring.
  5. **Dialogspor** (KI-120): lages i biter og settes sammen uten ekstra kopi, opptil 3 timer i én WAV-fil.
  6. **Plakat** (KI-132, KI-133): håndtak for rotasjon og størrelse også for roterte elementer. Ved typeskifte beholdes endringene på programmets elementer.
  7. **Roller** (KI-136): medlemslisten hentes på nytt ved fokus, hvert minutt og når serveren avviser på grunn av tilgang.
  8. **Planlagt lengde** (KI-150): en plan som ble satt på en del etter deling eller sammenslåing, blir ikke stående når delingen eller sammenslåingen angres.
  9. **Fountain** (KI-164):
     - dobbel dialog, sentrert tekst, sangtekst og notater bevares i rundtur (lagres i `sourceRef.fountain`, uten migrasjon);
     - linjemerkene brukes bare så lenge blokkens tekst er uendret.
  10. **Kravverifisering:** 32 krav ble gjennomgått, og 19 ble satt til Verifisert med nye eller eksisterende tester. To krav som underagenten foreslo, ble holdt tilbake fordi testene var for svake.
- **Funn som venter på Mars:**
  - **REQ-0146:** en variant uten godkjent versjon viser nyeste bilde, så et nytt bilde slår gjennom i alle scener.
  - **REQ-0482:** eksportdialogen har produksjonens nummerering forhåndsvalgt.
  - **REQ-0102:** røde margmerker for «endret etter materialet» vises i vanlig manusvisning.
  - **REQ-0275:** innsatsnivået lagres ikke med jobben.
  - **REQ-0269:** en ny leverandør krever kodeendring.
- **Tolkninger (Claude):**
  - En plan som ble fjernet ved angring (KI-150), kommer ikke tilbake ved «gjør om». Delen den gjaldt, finnes ikke lenger etter angringen.
  - Innlegging av ferdige videoer fra vaktkomponenten havner ikke i sidens angreliste. Den kan angres fra versjonslisten ved å velge en annen versjon.
- **Kodegjennomgang:** 13 funn og noen svake tester. Rettet: innlegging uten åpen dialog, 429, roller, Fountain på oversatt eller redigert tekst, ytelse og feilmelding i lagpanelet, ordlyden i fjerningsdialogen, grensen for dialogspor regnet i byte, plakat med eldre data og streker, kostnadstaket ved sending, unødvendig henting av medlemmer. Resten står som KI-175 og KI-176.

## DEC-0074 – Plakat i trykkoppløsning, scenenummer i spinoffer, språkfikser, tilgjengelighet og kravverifisering
- **Dato:** 2026-10-12 · **Type:** Teknisk anbefaling (Mars: «Fortsett med neste store gruppe ting, er i møte» – ingen nye produktkrav)
- **Innhold:**
  1. **Plakat som PNG i full trykkoppløsning** (KI-131): tegnes i striper og skrives som PNG uten 16 Mpx-grensen. 70 × 100 cm i 300 ppi gir 8268 × 11811 px. Valg av oppløsning med mål, anslått størrelse og fremdrift (underagent).
  2. **Scenenummer i spinoffer** (KI-108): gjenbrukte scener viser hovedfilmens nummer i manus, montering, oversikter og kontinuitet, og manuseksporten av spinoffen bruker det som utgangspunkt. Lagret nummerering endres ikke.
  3. **Lyd i delte scener** (KI-111): opptak og lyd kan legges inn i sceneeditoren også i en delt scene i spinoffen. Lyden hører til forekomsten; 2D-scenen er fortsatt låst.
  4. **«Start tidligere»** (KI-119): plassen regnes fra forrige lydklipp i språket, men aldri inn i tiden til en replikk uten lyd.
  5. **Godkjenning av ny versjon** (KI-118): konsekvenslisten tar med bilder for en språkversjon og kan oppdatere dem.
  6. **Fullskjermbilder** (KI-142): resten av siden er utilgjengelig (inert) mens bildet vises, også for skjermlesere.
  7. **Import av manus** (REQ-0053): brukeren får beskjed hvis originalfilen ikke kunne registreres med kontrollsum.
  8. **Ingen tekst under 11 px** (REQ-0425, designsystemet §3): 31 steder er rettet, og en test vokter grensen.
  9. **Nettlesertester** (`tests/visual/interactions-e2e.mjs`, underagent; 44 kontroller):
     - dra lag inn i og ut av grupper;
     - maskehåndtak;
     - plakathåndtak;
     - valgte scener i eksporten.
  10. **Kravverifisering runde 2:** 40 krav vurdert. 9 satt til Verifisert, blant annet REQ-0425. REQ-0050 ble holdt tilbake fordi testen trenger referansemanuset utenfor repoet.
- **Tolkning (Claude):** En spinoff som eksporteres med «bevar nummer», beholder hovedfilmens nummer for gjenbrukte scener. Mandatet sier ikke noe eget om dette.
- **Funn som venter på Mars:**
  - REQ-0291/0293/0504: krav om bakgrunnskø mot DEC-0072, der bakgrunnsjobben ikke settes opp.
  - REQ-0415: kategoriene lagres ikke atskilt.
  - REQ-0078: endringer i objekter mangler i manusversjonene.
  - REQ-0110: estimater merkes likt.
  - REQ-0489: beskrivelsen kan ikke endres i «Oppdater med AI».
- **Kodegjennomgang:** 9 funn, rettet:
  - like scenenumre på skjerm og i eksport;
  - ordlyden i importvarselet (ikke importer på nytt);
  - «start tidligere» med replikker uten lyd;
  - `inert` bare når bildet vises;
  - tekst på kameralerretet;
  - felles, mellomlagret oppslag av hovedfilmens nummer.

  Resten står som KI-177.

## DEC-0075 – Kravverifisering runde 3, kostnadsanslag, AI-ikon, versjonssammenligning og tidsmodell
- **Dato:** 2026-10-12 · **Type:** Teknisk anbefaling (Mars: «Da fortsetter du videre» – ingen nye produktkrav)
- **Innhold:**
  1. **Kravverifisering runde 3** (underagent): 33 krav vurdert, 23 satt til Verifisert. Nye tester `tests/unit/verifisering3-*` og nettlesersjekken `tests/visual/verifisering3-ui.mjs` (73 kontroller, alle bestått etter rettingene). Rapport: `docs/development/VISUAL_QA_DEC-0075.md`.
  2. **Rettet fra verifiseringen:**
     - Prosjektoversikten kunne rulles ut i tom skjerm (REQ-0424).
     - AI-generering har egen nøytral glyf i stedet for «gnister» og tryllestav (REQ-0426, DESIGN_SYSTEM §6).
     - Manusinspektøren har lenke til sceneeditoren, og hovedmenyen åpner sist valgte scene (REQ-0168).
     - Oversikten summerer API-kostnaden med egne nøkler i USD (REQ-0405).
     - Alle bekreftelser viser hva anslaget bygger på: modell, innsatsnivå, oppløsning, antall, lengde, ekstrarunder og sum (REQ-0280).
     - Leverandørkatalogen beskriver begrensninger strukturert (REQ-0273), og ARCHITECTURE.md nevner den (REQ-0443).
  3. **Sammenlign versjoner** (REQ-0318, underagent): alle versjoner av en scene side om side med felles avspillingshode.
  4. **Manusversjoner** (REQ-0078): endringer i karakterer og objekter, og byttet taler i en replikk.
  5. **Tidsmodell** (REQ-0105): omregning begge veier mellom film, scene, del og kilde; vises i den tekniske visningen.
  6. **Innsatsnivå lagres med jobben** (REQ-0275), **selektiv angring i kjernen** (REQ-0311), **«Prøv registreringen igjen»** ved import (REQ-0053), **beskrivelsene kan endres i «Oppdater med AI»** (REQ-0489).
  7. **Køen** (KI-175): telles på nytt etter at en jobb er tatt; flere faner kan ikke sende mer enn 3 samtidige videoer per nøkkel.
  8. **Plakateksport** (KI-177): lukkes dialogen, stopper eksporten og ingenting lastes ned.
- **Tolkning (Claude):** REQ-0489 og REQ-0078 sto som spørsmål til Mars (KI-178), men løsningen følger mandatets ordlyd uten å endre noe vedtatt, så de er gjort.
- **Funn som venter på Mars:**
  - **REQ-0528 (sikkerhet):** en redaktør uten kostnadsrett (`can_approve_costs`) kan starte betalte jobber, fordi serverfunksjonene bare sjekker redaktørrollen. Dette stemmer med DEC-0045 («redaktører og eiere kan generere»), men ikke med REQ-0528. Mars må velge regel (KI-179).
  - **REQ-0120:** tidligere estimater lagres ikke; det krever en databaseendring (KI-180).
- **Kodegjennomgang:** 10 funn, rettet:
  - byttet taler ble ikke oppdaget i manusversjoner;
  - lydlengde «NaN» kunne slippe forbi kostnadstaket (sikkerhet: avvises nå, og ugyldig anslag stopper jobben);
  - kostnadsanslag manglet i video for flere scener;
  - rettferdig fordeling når to faner tar jobb samtidig;
  - jobber i kø telles ikke som brukt;
  - endrede beskrivelser følger segmentet og nullstilles;
  - ny registrering sjekker først om den finnes, og svar etter lukking ignoreres;
  - PDF-eksporten stopper også;
  - inspektørens topplinje kortes ned i smal rute;
  - lydlengder leses fra katalogen.

## DEC-0076 – Kravverifisering runde 4, UX-gjennomgang mot de ni kvalitetene og rettinger
- **Dato:** 2026-10-12 · **Type:** Teknisk anbefaling (Mars: «Fortsett» – ingen nye produktkrav)
- **Innhold:**
  1. **Kravverifisering runde 4** (underagent): 34 krav vurdert. Nye tester `tests/unit/verifisering4-*` (48 tester) og nettlesersjekken `tests/visual/verifisering4-ui.mjs` (58 kontroller, alle bestått etter rettingene). Rapport: `docs/development/VISUAL_QA_DEC-0076.md`. De gyldne manustestene mot referansemanuset (utenfor repoet) og databasetestene er kjørt på nytt.
  2. **UX-gjennomgang mot de ni kvalitetene** (mandat 1.3, REQ-0011): kvalitetene er gjort til gjennomgangskriterier med kontroller (`UX_PRINCIPLES.md`, `DESIGN_SYSTEM.md` §1). Første gjennomgang: `docs/development/UX_REVIEW_DEC-0076.md` (15 funn).
  3. **Rettet fra verifiseringen og gjennomgangen:**
     - «Brukt denne måneden: ~$NaN» hos AI-leverandører. Ugyldige tall i forbruket blir aldri NaN, og et forbruk som ikke kan regnes ut, stopper jobben (sikkerhet: NaN ville sluppet forbi kostnadstaket).
     - Bekreftelsen for innebygd bildegenerering viser modellen serveren velger, med innsatsnivå og oppløsning; AI-stemmer har fått samme kostnadsanslag (REQ-0280/0491).
     - «Video for flere scener»: tittel og knapper står fast, bare innholdet ruller, og bekreftelsen rulles fram.
     - En lyd eller et bilde som ligger på et lydspor eller som lag i en 2D-scene, teller som brukt i biblioteket, selv om navnet ikke står i manuset (før: «0 scener»).
     - Manusets verktøylinje: notater, «Vis kun valgt scene» og låste sider er samlet under «Visning», så teksten ikke brytes.
     - «Beskrivelse for segment N» i «Oppdater med AI» har riktig etikett for skjermlesere.
     - Lydressurser har overskriften «Varianter av lyden».
  4. **Arkitektur:** ARCHITECTURE §3 viser hva som kjører hvor, hvorfor, og når en egen medietjeneste blir riktig (REQ-0010). Resource Library omfatter stilprofiler og mediefiler (REQ-0436). Plattformbindingene er begrunnet (REQ-0008), med kjent avvik KI-181.
- **Funn som venter (ikke retting nå):** monteringens verktøylinje med mange ikonknapper, «Lovable» som navn i grensesnittet, bildedialogens oppsett (UX_REVIEW funn 5–6); avvist tekst ved samtidig redigering kastes (KI-182).
- **Fortsatt hos Mars:** KI-179 (REQ-0528), KI-176, KI-178, globale ressurser, stilharmonisering (kostnad).

## DEC-0077 – Redaktører kan starte betalte AI-jobber (REQ-0528)
- **Dato:** 2026-10-12 · **Type:** Bekreftet av bruker
- **Spørsmål (KI-179):** i dag kan en redaktør uten kostnadsrett starte betalte AI-jobber, i tråd med DEC-0045, mens REQ-0528 krevde kostnadsrett. Skal redaktører fortsatt kunne det?
- **Mars' svar:** «Ja, til nr. 1» – redaktører skal fortsatt kunne starte betalte jobber uten egen kostnadsrett.
- **Beslutning:** eiere og redaktører kan starte betalte AI-genereringer innenfor prosjektets budsjett og kostnadstaket for nøkkelen. Kommentatorer og lesere kan ikke. Bare eieren endrer AI-budsjettet, og bare nøkkeleieren endrer kostnadstaket. REQ-0528 er endret tilsvarende og verifisert (`tests/unit/req0528-roller.test.ts`, `verifisering3-ai-server.test.ts`). Ingen kodeendring.
- **Samtidig:** den gamle adressen `src/routes/api/cron/ai-jobs.ts` er slettet av Lovable etter Mars' beskjed; bare `/api/public/cron/ai-jobs` finnes. Ingen planlagt jobb settes opp (DEC-0072), så `LOVABLE_CRON_SECRET` trengs ikke.

## DEC-0078 – Alt som kan gjøres uten Mars: migrasjon 0028, adapterlag, versjonsgjenoppretting og 30 kjente problemer
- **Dato:** 2026-10-13 · **Type:** Teknisk anbefaling (Mars: «fortsett med ALT du kan gjøre av det som gjenstår»)
- **Innhold:**
  1. **Migrasjon 0028** (`0028_duration_exports.sql`): antakelsene for varighetsestimat lagres per prosjekt (KI-28); lagrede estimater per manusversjon (REQ-0120) og eksportlogg (REQ-0037) i egne tabeller. Estimater og eksporter er uforanderlig historikk som skrives med egne databasefunksjoner (`save_duration_estimate`, `record_export`), som manusversjoner, ikke via `apply_changes`; de slettes med produksjonen.
  2. **Adapterlag i nettleseren** (KI-181, REQ-0008): all Supabase-bruk går via `src/adapters/browser/`; `src/app` og rutene importerer aldri klienten (arkitekturtest).
  3. **Gjør en tidligere manusversjon gjeldende** (KI-27, REQ-0077): forhåndsvisning, bekreftelse, én angring; det som ikke kan settes tilbake, vises før bekreftelse. Estimat lagres automatisk med hver ny versjon.
  4. **Bibliotek** (REQ-0121): stilprofiler i biblioteket, opphav per versjon med filter. **Innholdsmessig synk** (REQ-0022): ressursversjonene lagres i `produced_from.assetVersions` (jsonb, ingen migrasjon); scener flagges «Ressurs oppdatert» i bibliotek, montering og sceneeditor.
  5. **UX:** «Visning» og «Mer» i monteringen, hurtigtastoversikt («?», også i toppfeltet), verktøytips med taster, bildedialog med bedre plass, avvist tekst ved samtidig redigering går ikke tapt (KI-182).
  6. **Kjente problemer:** gjennomgang av alle 117 åpne punkter; 16 var allerede løst. Løst nå blant annet KI-20 (tittelsiden lagres), KI-33 (notater følger egen versjon), KI-42 (flere egenskapstester, bildebuffer med grense), KI-44, KI-48 (ny bildefrekvens regner om alt), KI-49, KI-56, KI-77, KI-85 (lyd i eksport av valgt scene), KI-86, KI-105.
- **Tekniske valg:** importert film får som ressursgrunnlag versjonene scenens 2D-scene viste da filmen ble lagt inn; notater kopieres til egen versjon som oversettelser (Mars kan overstyre); en produksjon med eksporter eller lagrede estimater kan ikke angres (KI-186).
- **Kodegjennomgang:** 10 funn rettet, blant annet at sikkerhetskopien mistet antakelsene, at gjenoppretting av versjon kunne melde suksess etter delvis utførelse, og at delt bildebuffer kunne kaste bilder som ble vist.
- **Fortsatt hos Mars:** KI-176, KI-178, globale ressurser, stilharmonisering (kostnad), «Lovable» som navn i grensesnittet, ekte AI-test (REQ-0565/0589/0590).

## DEC-0079 – Mars' testrunde 13.10.2026: 14 av 15 tester bestått, 19 funn rettet og bygget (migrasjon 0029)
- **Dato:** 2026-10-13 · **Type:** Bekreftet av bruker (Mars' funnliste og «ja, start og fiks alt sammen»); tekniske valg merket under
- **Testene:** Mars bekreftet migrasjon 0028 i Lovable, varighetshistorikk, tittelside og eksport, grønne tester på GitHub, eksport i Safari, to samtidige brukere, leserrollen, lydopptak, gjenoppretting, store filer, plakat i 300 ppi, Lovable-bildegenerering, AI-beskrivelse med forbilder og egen nøkkel (godtatt). ElevenLabs virket, men norsk ble lest som dansk.
- **Feil rettet:**
  1. fal.ai «405» etter betalt jobb: status og resultat spørres under app-ID-en (KI-188).
  2. Google Nano Banana Pro «Internal server error» etter fakturert jobb: mindre minnebruk (Buffer, JPEG, valgt størrelse, svaret slippes tidlig) og forståelig melding når forbindelsen brytes (KI-189, delvis – prøves igjen).
  3. Norsk tale ble dansk: Eleven v3 med språket satt til norsk (Flerspråklig v2 kan ikke norsk).
  4. Varsel om utdatert AI-tekst hindrer ikke lenger generering (REQ-0602).
  5. «Ja, generer» står alltid synlig (REQ-0605). 6. Lokasjon legges nederst (REQ-0604). 7. Filformater: MP4/M4V/MOV/WebM gjenkjennes og avspillbarhet sjekkes; TIFF blir PNG (REQ-0597).
- **Nytt (REQ-0593–0609):** 12 bilder i sekundet og «animer på toere» per 2D-scene; lydklipp kan dras i sceneeditoren, hastighet 25–400 % og masker for start og slutt; «I scenen»-merke og dobbeltklikk i «I denne scenen»; enkle symboler for alle ressurser (også tegnet for lag uten bilde); store bilder får nedskalert arbeidskopi med originalen som versjonen før, og forbilder kan sendes i full størrelse; zoomknapper og zoomnivåer; bildedialogen husker siste beskrivelse og har bildestørrelse; stor visning med zoom og beskrivelsen per bilde med «Sett inn denne beskrivelsen»; bildebeskrivelser bygger på manusets omtale; speilvending av lag og i frileggingen, og tegning med farge; «Slettede objekter» med hent inn igjen og slett for godt; dialog med AI-stemmer viser lydstatus, stemmebruk og spiller av.
- **Migrasjon 0029** (`0029_trash_speed_step.sql`): `assets.removed`, `asset_versions.removed` (bildeversjoner er ellers fortsatt uforanderlige), `audio_clips.speed`, `compositions.step` og `purge_removed_assets` (bare service_role). Ingen SQL mot lagringen; filene slettes av serverfunksjonen etterpå.
- **Tekniske valg (Teknisk anbefaling):** hastighet endrer tonehøyden (KI-190); arbeidskopien er to ganger filmformatets lengste side (minst 2048 px); «slett for godt» bare av eieren og bare når ingenting bruker objektet (unntak i INV-14 som DEC-0046); «animer på toere» per 2D-scene (ikke per prosjekt), så prosjektet ikke trengte endring i `apply_changes`; TIFF lagres som PNG (KI-191); symbolfargene følger rekkefølgen ressursene ble laget i. Eksempeltekstene fra «Jula på Dovre» i brukerflaten er byttet ut med nøytrale eksempler.
- **Fortsatt hos Mars:** prøve fal.ai, Nano Banana Pro (fire bilder) og norsk tale igjen; KI-176, KI-178, globale ressurser, stilharmonisering (kostnad), «Lovable» som navn i grensesnittet.

## DEC-0080 – Mars' ønsker 13.–14.10.2026: bildeverktøy, vinkler, promptmotor, stilanalyse, oppskalering og lesevisning (migrasjon 0030)
- **Dato:** 2026-10-14 · **Type:** Bekreftet av bruker (Mars' meldinger 13.–14.10 og «OK, da kan du gjennomføre alle oppdateringene»); tekniske valg merket under
- **Bekreftet:** Nano Banana Pro med fire bilder virker (KI-189 løst).
- **Del A (gratis, uten databaseendring):** dra i skillet ved lagnavnene (REQ-0610); lenke fra bildevalget til «Filmens visuelle stil», åpnet oppå, med vei tilbake (REQ-0611); «Tilpass» som standard og riktig i stor visning (REQ-0612); dobbeltklikk på bilder i bildevalget (REQ-0613); «Fjern luften rundt» etter frilegging og luft i forhåndsvisninger (REQ-0614); utsnitt med fri markering og «Del opp i ruter» (REQ-0615); advarsel ved forstørrelse over 1:1 (REQ-0616); «Nullstill format» ved bredde og høyde (REQ-0617); sidehåndtak for skvis og strekk (REQ-0618); frilegging fra stor visning og zoom i frileggingen (REQ-0619); speilvending «fra her», glidende eller brått (REQ-0620); lesevisning av valgt scene uten ark, med «Sort tekst på hvit bakgrunn» (REQ-0621).
- **Del D (promptmotor og stil):** én strukturert bestilling som skrives om per modellfamilie – fortellende for Nano Banana/GPT Image, kort med identiteten først og negativ beskrivelse for Seedream/Qwen/FLUX – uten filmtittel, replikker eller motsigende lys, med fargenavn, referanser med roller og norsk oppsummering (REQ-0624; REQ-0603 endret); stilanalyse av forbildebildene (REQ-0625); visuelt faktaark per ressurs (REQ-0626). Kildene: Google Cloud «Ultimate prompting guide for Nano Banana» og «… for Veo 3.1», Gemini API-dokumentasjonen, ByteDance/Seedream-materiale.
- **Del B (vinkler):** vinkel på bilder (REQ-0622); «Lag andre vinkler» som ark (standard, mest sammenheng) eller én per vinkel med kjedede referanser (REQ-0623); Seedream 4.5 og Qwen-Image-Edit via fal.ai (REQ-0627).
- **Del C (oppskalering):** SeedVR2 og Clarity via fal.ai, 2× eller 4×, med pris i megapiksler og bekreftelse (REQ-0628).
- **Avslått:** Midjourney via Wireflow eller andre «API»-er – Midjourney har ikke noe offisielt API, og tredjepartstjenestene bryter Midjourneys vilkår.
- **Migrasjon 0030** (`0030_views_visual_brief.sql`): `asset_versions.view` (vinkel; bildeversjonen er ellers uforanderlig – utløseren tillater bare `removed`, `view` og `revision`) og `assets.visual_brief` (≤ 4000 tegn). Ingen SQL mot lagringen.
- **Tekniske valg (Teknisk anbefaling):** «Sort tekst på hvit bakgrunn» gjelder lesevisningen for valgt scene (spørsmålet om også arkene er ubesvart; kan utvides); speilvending «fra her» snur fra forrige nøkkelbilde for laget, ellers over et halvt sekund; advarselsgrensen er 115 %; luften som beholdes er 1 % av lengste side (minst 2 px); figurdesign får nøytralt lys (scenelyset gjelder bakgrunner); stilanalysen og faktaarket bruker samme språkmodell, kostnadsport og logg som «Skriv beskrivelsen med AI» (DEC-0066); oppskalering krever fal.ai (den innebygde tjenesten har ingen oppskalerer); bilder lages i nye versjoner og originalen beholdes alltid.
- **Fortsatt hos Mars:** kjøre migrasjon 0030; prøve vinkler, Seedream/Qwen, oppskalering, stilanalyse og faktaark med ekte nøkler; si om «Sort tekst på hvit bakgrunn» også skal gjelde arkene.

## DEC-0081 – Tjenesten på norsk og engelsk, og alt nytt på begge språk
- **Dato:** 2026-10-14 · **Type:** Bekreftet av bruker (Mars 14.10.2026: «muligheten til å veksle mellom engelsk og norsk som språk i tjenesten på hovedsiden. Det gjelder alle tekster som er eksportert for brukeren også tooltip … all fremtidig utvikling også skal ha støtte for begge språk»)
- **Krav:** brukeren kan veksle mellom norsk og engelsk; valget gjøres på hovedsiden (prosjektlisten) og gjelder alle tekster brukeren ser – knapper, menyer, dialoger, meldinger, feilmeldinger, hjelpetekster, verktøytips (title) og skjermlesertekster (REQ-0629). Norsk er fortsatt standard.
- **Prosessregel (gjelder all videre utvikling):** ingen ny eller endret brukervendt tekst leveres bare på ett språk. Hver tekst skrives på norsk og engelsk samtidig, og en automatisk kontroll skal stoppe tekst som mangler engelsk (REQ-0630). Står også i `CLAUDE.md` og i skillene for UI og kode.
- **Ikke berørt:** innholdet brukeren selv skriver (manus, notater, navn) og manusets egne formatord (MORE, CONT'D, INT./EXT.) oversettes ikke; filmens språkversjoner (DEC-0058) er noe annet enn språket i tjenesten. Bildebeskrivelser til AI er fortsatt på engelsk (REQ-0015).
- **Midlertidig antakelse (Mars har ikke svart ennå):** faste tekster i eksporterte filer (overskrifter i notat-eksport, tittelkort, kolonnenavn, mappenavn i zip) følger språket i tjenesten. Manusets formatord og brukerens innhold følger aldri tjenestens språk.
- **Bygget 14.10.2026:** `src/core/i18n` (`L`, `localized`, `locale`, `collation`, `tm`), språkvalg på hovedsiden og i toppfeltet, hele grensesnittet oversatt (ord for ord, venter på språkvask – KI-198), kontrollen `scripts/i18n/check.mjs` i enhetstestene og engelsk nettlesergjennomgang (`tests/visual/i18n-en-pass.mjs`). Oversettelsen ble gjort av flere billige agenter etter `I18N_GUIDE.md`; kontrollert med tsc, alle tester og en ordboksjekk av gjenstående norsk.

## DEC-0082 – Prosjektlisten: én boks per prosjekt med eier, rolle og filmene i prosjektet
- **Dato:** 2026-10-14 · **Type:** Bekreftet av bruker (Mars 14.10.2026: «på hovedsiden over prosjektene at det synes tydelig at hvert prosjekt har spinofs og subprosjekter eller varianter. Mao en boks per prosjekt for vi kan ha roller der en bruker eier et prosjekt, men er redaktør eller kjører review på et tredje prosjekt. Da bør en kunne se tydelig på hovedrammen hvem som er eier av prosjektet. For hver variant av prosjektet bør også vises frem dato og notater brukeren har gitt prosjektet om hva det er»)
- **Krav:** REQ-0631 (boks per prosjekt: eier, din rolle, medlemmer, opprettet; hovedfilm med varianter rykket inn under den de er laget fra, med type, dato og notat) og REQ-0632 (notat per produksjon, høyst 2000 tegn, skrives når produksjonen lages og endres på prosjektoversikten).
- **Teknisk:** migrasjon 0031 (`productions.description`), kommandoen `SetProductionNote` (kan angres), `listProductionsFor` i nettleseradapteren. Egne prosjekter vises først, så dem du er invitert inn i. Et klikk på en variant åpner prosjektet med den valgt.
- **Tolkning:** «subprosjekter og varianter» er produksjonene i prosjektet (hovedfilm, spinoff, trailer, teaser …, DEC-0057). Datoen er når produksjonen ble laget.

## DEC-0083 – AI-video av scenen fra sceneeditoren (2D-scenen tegnes om, bare bildet erstattes)
- **Dato:** 2026-10-15 · **Type:** Bekreftet av bruker (Mars 15.10.2026: «en knapp i toppen av menyen når brukeren er i sceneeditor at brukeren kan sende sin 2d scene til ai generering slik at basert på globale instrukser, karakter beskrivelser og scenen instrukser at en ai kan generere en ai video som erstatter scenen som er i fokus, lyd skal ikke erstattes bare det visuelle … Brukeren kan selv velge å lage nye, ingen ting blir kastet, men brukeren kan velge hva som skal representere scenen». Planen med video-til-video, modellene og prisene ble godkjent med «Ok».)
- **Krav:** REQ-0633–REQ-0638.
- **Løsning:** knappen «AI-video …» i sceneeditoren åpner en dialog. 2D-scenen lages som MP4 i nettleseren (bare bilde, 720–1920 px), lastes opp til `<prosjekt>/ai-source/<bunt>/<bit>.mp4` og sendes til en video-til-video-modell: **Kling O3 Edit** via fal.ai (0,168 USD/s, 3–15 s per bit, inntil 4 figurer med referansebilde som `@Element1 …`, videoen er `@Video1`, `keep_audio: false`) eller **Aleph 2** via Runway (0,28 USD/s, 2–30 s per bit, bare tekst; `POST /v1/video_to_video`, `model: aleph2`). Lange scener deles i like lange biter; bitene settes sammen med `SetSceneEdit`. Resultatet legges inn som versjon uten lyd.
- **Beskrivelsen:** filmens visuelle stil (stilprofilen for AI-video), figurene i scenen (lagene først, så manusets figurer; faktaark og referansebilde), manusets handling og replikker i biten (bare for spill og munnbevegelser) og scenens egne instrukser. Den vises før sending og kortes etter viktighet til modellens grense; instruksene beholdes.
- **Data:** migrasjon 0032 (`scene_occurrences.video_instructions`, høyst 2000 tegn), kommandoen `SetSceneVideoInstructions` (kan angres). Jobbene bruker `generation_jobs` som før; `params` har `source: "scene2d"`, bunt, bit og stiene.
- **Valg av hva som viser scenen:** i samme dialog – 2D-scenen, AI-video fra 2D-scenen (bunt), annen AI-video, opplastet film eller stillbilde. Bruker `SetSceneEdit` som monteringen; alt kan angres og ingenting slettes.
- **Tolkninger (Claude):** «globale instrukser» = filmens visuelle stil (stilprofilen); «karakterbeskrivelser» = beskrivelse og visuelt faktaark per ressurs; «scenens instrukser» = nytt felt per scene. Nettlesere uten H.264 lager VP9 i MP4 (KI-205).

## DEC-0084 – Svar fra Mars 15.10.2026 på åpne spørsmål
- **Type:** Bekreftet av bruker (Mars 15.10.2026: «Ja til – Om ressurser skal kunne brukes på tvers av prosjekter. Ja, det godkjenner vi! Nei Lovable skal ikke stå i grensesnittet, det blir feil den dagen vi bare kjøre lokalt»).
- **Globale ressurser (REQ-0571):** skal bygges. Åpent: hvem som kan bruke en felles ressurs (eieren i egne prosjekter, alle i eierens prosjekter, eller et team/firma).
- **Stilharmonisering med AI (REQ-0137–0145, REQ-0400–0402):** kostnaden er godkjent; hver kjøring viser pris og må bekreftes som andre betalte kall.
- **«Lovable» i grensesnittet (REQ-0639):** skal bort; den innebygde AI-tjenesten og databaseoppdateringer omtales nøytralt. Ikke bygget ennå.
- **KI-176 og KI-178:** lagt fram for Mars med anbefalinger; venter på svar.


## DEC-0085 – AI-video av scenen, utvidet: referanser, samlet global beskrivelse, scenebeskrivelse, lyd, nedlasting og status
- **Dato:** 2026-10-15 · **Type:** Bekreftet av bruker (Mars 15.10.2026: «Jeg trenger at det generes en videofilm i scenens lengde identisk med slik den vises når den spilles av i avspillingsvinduet, og denne skal også være mulig å laste ned i ulike videoformater … husk at undertekstene ikke skal med på genereringen til ai api, men når brukeren laster ned. Eget valg i nedlastingsviduet! … karakterkortene, bakgrunnen og objektene som bilde referanser … den generelle beskrivelsen for hele prosjektet … default er på … scenebeskrivelse … en liten status … Lyd skal brukeren selv få velge …». Svar på spørsmål: «1. vi putter varsling på hold 2. … setter det sammen … globalt … så vi bare har en versjon 3. ja 4. ProRes/MOV som todo i en egen fil … prosjekt beskrivelsen og kravene og testene … med en les meg instruks 5. ja, dempet».)
- **Krav:** REQ-0640–REQ-0648.
- **Kilde for AI-videoen:** 2D-scenen, en tidligere AI-bunt eller en opplastet/annen versjon av scenen – samme bilde som avspillingen viser. Undertekster sendes aldri.
- **Referanser:** figurenes referansebilder, bakgrunnen og objektene sendes som bilder. Er det flere enn modellen tar (Kling: 4), settes de overskytende sammen til ett samleark med navn. Hver referanse kan tas med eller ikke.
- **Global beskrivelse:** filmens visuelle stil settes sammen til én tekst som vises i sin helhet og kan redigeres («Endres globalt for hele prosjektet»). Den redigerte teksten er den ene versjonen og brukes av all AI (bilder og video); «Tilbake til feltene» setter den sammen på nytt. I AI-video kan den krysses vekk (grået ut); standard er på.
- **Scenebeskrivelse:** fritekst laget fra manuset (sted, figurer, handling, replikker i rekkefølge, kamera, lys) i formen leverandørene anbefaler, med «Skriv med AI». Lagres per scene (feltet fra migrasjon 0032).
- **Lyd:** brukeren velger om scenens lyd sendes med. Lyd i en ferdig AI-video legges inn som eget, dempet lydspor på scenen som kan flyttes og justeres; selve videoen spilles uten lyd.
- **Nedlasting:** valg av format (MP4 eller WebM) og undertekster (brent inn, egen SRT/VTT-fil eller ingen) i nedlastingsvinduet. «Last ned scenen …» fra dialogen. ProRes/MOV står i `TODO.md`.
- **Status:** liten status øverst i toppfeltet med hva som lages, står i kø og nylig ble ferdig/feilet, med lenke til scenen.
- **Avspilling:** sceneeditoren kan vise versjonen som er valgt for scenen (AI-video eller opplastet film) i stedet for 2D-scenen. Valget av versjon og opplasting av video gjøres i «AI-video av scenen».
- **Varsling (SMS/e-post):** på vent (Mars). Står i `TODO.md`.
- **Dokumentasjon i repoet:** `README.md` (startside for mennesker og AI) og `TODO.md` (bestilt eller tenkt, ikke bygget).

## DEC-0086 – Brukerkontoer: adminside, min konto, sletting, låste prosjekter, personvern og kostnadsrapport; ferdige AI-videoer tapes ikke
- **Dato:** 2026-10-15 · **Type:** Bekreftet av bruker (Mars 15.10.2026: «en adminside som viser alle brukerne av systemet, når de laget brukeren sin, når de sist var aktive, og mulighet for å blokkere og slette brukere. Prosjektet vil ikke bli slettet, men … assignet til en annen bruker. Brukerne må selv kunne slette seg selv … en disclaimer for tjenesten etter eu regler, som forteller at vi ikke kommer til å selge data … Adminbrukeren er oystein@gutu.no». Svar på spørsmål: «1 ja 2. 30 dager … hun må skrive eposten sin … kan nå bare låses opp av admin 3. admin, de andre får beskjed om at det er låst 4. … en eier av et prosjekt som blir blokkert, da låses det for alle, roller under dette … kan fortsatt jobbe 5. … oystein@gutu.no skal aldri kunne nedgraderes 6. gjør det enkelt 7. admin må ikke kunne se inn i prosjektene … teller for kreditter … eksport til pdf, word, excel … prosjektnavn øverst … hva jeg har brukt som bruker på dette prosjektet og hva prosjektet som sådan har kostet totalt (bare eier)». Videre: «1. kun melding og hvem de skal kontakte 2. Ja 3. vi kan lage begge 4. … bare underlaget 5. … per kalender måned og hele prosjektet, ja utelat det 6. det holder 7. la admin ha felt for dette … ta med videresending til ai … lest er en god ide». «Ok, kjør på!» og ønske om en side ved klikk på brukernavnet med språk, forbrukte kreditter og passord.)
- **Krav:** REQ-0649–REQ-0655. **Migrasjon:** 0033. **Nye pakker:** jspdf, jspdf-autotable, docx, exceljs (eksport i nettleseren).
- **Administrator:** oystein@gutu.no er fast administrator, låst i `private.is_admin` (ikke i tabellen) og kan aldri blokkeres, slettes eller nedgraderes. Administrator kan gjøre andre til administrator (`app_admins`). Adminsiden viser brukerne (navn, e-post, laget, sist aktiv, status, prosjektnavn og rolle, AI-forbruk totalt og siste 30 dager), låste prosjekter med «Gi ny eier», alle prosjekter (bare navn og eier) og feltene i personvernerklæringen. Administrator ser aldri innholdet i prosjektene.
- **Blokkering:** innloggingen sperres (Supabase «ban») og kontoen merkes `blocked`. Er brukeren eier, låses prosjektet for alle (bare en melding om hvem man kan kontakte: eierens visningsnavn og administrator). Andre roller som blokkeres, påvirker ikke de andre. Kan oppheves.
- **Sletting:** brukeren skriver e-posten sin; kontoen låses i 30 dager (bare administrator kan låse opp), deretter anonymiseres den (e-post, navn, nøkler, innlogging og medlemskap fjernes; historikken står som «Slettet bruker»). Prosjekter brukeren eier, slettes ikke; de låses og administrator gir dem ny eier (tidligere eiere blir redaktører). Endelig sletting skjer når administrator åpner adminsiden (ingen bakgrunnsjobb, DEC-0072).
- **Sist aktiv:** oppdateres høyst én gang i timen når appen er i bruk.
- **Personvernerklæring (GDPR):** kan leses fra forsiden før innlogging og fra kontosiden. Vi selger ikke data, ingen reklame. Behandlingsansvarlig, org.nr., adresse, kontakt og lagringssted fylles ut av administrator; hver lagring er en ny versjon som brukerne må lese (avkrysning) ved neste innlogging. Ny konto krever avkrysning. AI-videresending er beskrevet som en risiko brukeren tar ansvar for ved egne nøkler (krypterte). Utkastet bør leses av en jurist.
- **Min konto:** profil (visningsnavn), språk (lagres på kontoen), passord, AI-forbruk med rapport, personvern, «Slett kontoen min».
- **Kostnadsrapport:** «Mitt forbruk i prosjektet» (alle med endringsrett), «Prosjektet totalt» (bare eier), og på kontoen alt brukeren har bestilt. Kalendermåned eller hele perioden; USD eller NOK etter Norges Banks kurs for dagen (siste kurs før helg). Sammendrag, per tjeneste/modell, per måned, per person og linjer med leverandørens jobb-ID; anslått pris, uten mva, uten påslag og uten AI-beskrivelsene. Eksport til PDF, Word og Excel med prosjektnavnet øverst.
- **AI-video ble tapt når prosjektet var lukket:** grensen på tre timer ble sjekket før leverandøren ble spurt. Nå spørres leverandøren alltid først, og en jobb merkes tapt først etter sju dager; «Hent videoen igjen» henter en tapt video med lagret jobb-ID uten ny kostnad.
- **Kilder for opplysninger:** Lovable Cloud lar regionen velges når Cloud slås på (kan ikke endres); databehandleravtale bare på Business/Enterprise (Lovable-dokumentasjonen 15.10.2026). Mars må sjekke region og plan.
- **Retting 15.10.2026 (Mars: «språkvelgeren over alt har hengt seg opp … klikk på brukeren min i menyen igjen lukker bruker siden og en knapp nederst på siden som sier "Lukk"»):** språket på kontoen ble satt tilbake hver gang språket ble byttet (språkbytte tegner appen på nytt og nullstilte flagget). Nå tas kontoens språk i bruk én gang per innlasting, og senere bytter lagres på kontoen. Klikk på brukernavnet når «Min konto» er åpen, lukker siden; «Lukk» nederst gjør det samme (tilbake dit man kom fra).

## DEC-0087 – Svar på KI-176 og KI-178; bakgrunnsjobben tillates
- **Dato:** 2026-10-15 · **Type:** Bekreftet av bruker (Mars 15.10.2026: «1. OK! 2. Husk forrige valg 3. Ja legg med et valg for å skjule 4. [spørsmål om adminknapp for AI-leverandører] 5. Jeg trekker tilbake mitt nei til bakgrunnsjobb (DEC-0072) og heller sier at det er ok 6. Bra valg, vi skiller 7. ja det er en god anbefaling den følger vi. Kjør på!»).
- **REQ-0146:** en variant uten godkjent versjon viser nyeste bilde i scenene; en godkjent versjon er låst. Godtatt slik.
- **REQ-0482:** nummereringen i manuseksporten huskes fra forrige eksport av prosjektet (første gang: produksjonsnummer).
- **REQ-0102:** «Vis endringsmerker» i manusets visningsvalg skjuler de røde margmerkene; de er aldri med i utskrift eller eksport.
- **REQ-0269:** spørsmål om en adminknapp for å legge til AI-leverandører – besvart i chatten, venter på Mars.
- **REQ-0291/0293/0504:** nei-et til bakgrunnsjobb i DEC-0072 er trukket tilbake. Lovable setter opp et planlagt kall til `/api/public/cron/ai-jobs` (med `LOVABLE_CRON_SECRET`). Jobben bestiller aldri noe nytt (REQ-0592 gjelder fortsatt): den sender jobber brukeren har lagt i køen, henter ferdige videoer og sletter kontoer som har stått låst i 30 dager. Versjonen legges inn i scenen når en redaktør åpner prosjektet.
- **REQ-0415:** nye filer legges i egen mappe per kategori: `<prosjekt>/source/…` (opplastet), `<prosjekt>/generated/…` (AI), `<prosjekt>/temp/ai-source/…` (2D-scenen til AI-video). Eldre filer flyttes ikke og leses som før.
- **REQ-0110:** scener med lite eller ingen dialog får «usikkert» estimat med spenn (0,6–1,8 × estimatet; montasje uten dialog 0,5–2,5 ×), og oversikten viser antall usikre scener og spennet for summen.
