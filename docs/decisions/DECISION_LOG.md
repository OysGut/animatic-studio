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
