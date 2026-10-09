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
