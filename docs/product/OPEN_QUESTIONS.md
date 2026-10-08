# Åpne spørsmål – Animatic Studio

Uklarheter funnet under kravuttrekket (60 stk., 2026-10-08) og senere arbeid.
- **Del A – Produktspørsmål til Mars/Trollfilm.** Bare Mars kan avgjøre disse. Claude bygger videre med den foreslåtte midlertidige løsningen og merker den. Ingen av dem stopper arbeidet nå.
- **Del B – Avklart teknisk av Claude** (DEC-0006/DEC-0015). Avklaringene endrer ingen produktkrav.

## A. Produktspørsmål (venter på Mars)

| ID | Spørsmål | Midlertidig løsning | Trengs før |
|---|---|---|---|
| Q-01 | Hvem eier API-nøklene og betaler for AI i et delt prosjekt? Hvem kan godkjenne kostnader? | Prosjekteier legger inn nøkler; bare medlemmer med kostnadsrett kan starte betalte jobber (DEC-0018, REQ-0528) | Fase 5 |
| Q-02 | Trengs lyst tema og/eller engelsk grensesnitt tidlig (f.eks. for internasjonale samarbeidspartnere)? | Mørkt tema; norsk UI med oversettbar struktur (DEC-0017) | Fase 2 |
| Q-03 | Hvor avansert skal karakteranimasjon i 2D-editoren være: flytting/skalering av hele figurbilder, utskiftbare poser/munnformer, eller riggede cut-out-figurer? (mandat 14.1, 23.7) | Hele figurbilder + utskiftbare bilder (poser) i fase 3; rigging vurderes senere | Fase 3 |
| Q-04 | Hvilke plakatformater i tillegg til 70 × 100 cm, og hvilke trykkverdier (DPI, utfallende, fargeprofil) bruker trykkeriet? | 300 dpi, 3 mm utfallende, PDF/X-4 | Fase 8 |
| Q-05 | Skal en spinoff kunne dele endringer med *andre spinoffer*, eller bare tilbakeføre til hovedfilmen? (mandat 24.5) | Bare tilbakeføring til hovedfilm (kap. 25) | Fase 7 |
| Q-06 | Er norsk alltid hovedmanus også i spinoffer, eller kan en spinoff ha engelsk hovedmanus? | Norsk er hovedmanus i alle produksjoner (INV-05) | Fase 7 |
| Q-07 | Sammenslåing av to scener: hvilken fortellingstid og hvilken aktiv versjon skal den sammenslåtte scenen få? | Første scenes verdier; brukeren bekrefter i dialog | Fase 2 |
| Q-08 | Hvordan skal deaktiverte scener se ut når de tas med i en manuseksport med fortløpende nummerering? | Bransjepraksis: «OMITTED» bare ved bevart nummerering; ved fortløpende nummerering utelates de | Fase 2 |
| Q-09 | Arbeidsflatene: passer fem hovedarbeidsflater (Prosjekt, Manus, Sceneeditor, Montering, Utgivelse) for Trollfilms måte å jobbe på? | Brukes som utgangspunkt (`ux-interaction-design/references/INFORMATION_ARCHITECTURE.md`) | Fase 2 |
| Q-10 | Skal manuset pagineres som Final Draft (US Letter) eller A4 som standard? | US Letter (referansemanuset), A4 som valg | Fase 2 |

## B. Avklart teknisk (Claude, Teknisk anbefaling)

| Tema | Avklaring | Hvor |
|---|---|---|
| Skjule vs. deaktivere | Skjul = bare visning; deaktiver = produksjon. «Skjulte scener» i 5.2/7.2 = deaktiverte | DEC-0015, DOMAIN_MODEL §0 |
| Delsekvens/segment | Én entitet `ProductionSegment` med årsakstype (gjelder også 10.6 og kap. 18) | DEC-0015 |
| «Aktiv filmversjon» | Peker per sceneforekomst, ikke status | DEC-0015 |
| Fortellingstid | `Scene.storyTime`, standard manusrekkefølge, manuell overstyring; i datamodellen fra fase 1 | DEC-0015 |
| Narrativ splitting | Første del beholder ID; ny del får ny ID med «avledet fra» | DEC-0015 |
| Bekreftet/faktisk spilletid | Beste ikke-estimerte varighet for aktiv take | DEC-0015 |
| «Gjeldende eksportnummer» (3.1) | Nummereringstabell lagres per eksportversjon; «gjeldende» = siste eksport | DOMAIN_MODEL |
| Historisk nummerering for nye scener | Mellomnummer-regelen (42A/42B) | screenplay-engineering |
| PDF-import | Støttes i fase 2 (referansemanuset er PDF) | DEC-0013 |
| Delmanus (start/slutt midt i scene) | Egen testfixture laget av utdrag | ADR-0007 |
| Ulik bildefrekvens på importerte klipp | Rasjonell fps per klipp; konvertering ved avspilling/eksport | ADR-0006 |
| Selektiv «Angre manusendringen» (21.2 C) | Kommandologg med inverse fra fase 1 | ADR-0005 |
| Ordrett norsk dialog i engelske prompter | Eget felt `verbatimDialogue` som aldri oversettes | API_INTEGRATIONS |
| Manuelle promptoverstyringer ved endret grunnlag | Beholdes og flagges med differanse | API_INTEGRATIONS |
| Overlappende budsjetter | Strengeste gjelder; retries teller | API_INTEGRATIONS |
| Flere språk | Modell for N språk; engelsk først | DOMAIN_MODEL |
| Undertekster | SRT og WebVTT som sidecar i MVP | ROADMAP fase 7 |
| Overganger | Kutt og krysstoning i MVP | ROADMAP fase 4 |
| Ufullstendig montering | Plassholder med scenetittel, manusutdrag og estimert varighet | ROADMAP fase 4 |
| Kamerarammer | Blå/rød per shot; 1 CSS-piksel; mellomliggende keyframes nøytrale | design-system-director |
| «Tilt» i 2D | Vertikal panorering; perspektiv senere | ROADMAP fase 3 |
| Kontinuitetsprinsipper før harmonisering | Eksplisitt publisering og ingen automatisk variantbytte gjelder fra fase 3; harmonisering i fase 8 | ROADMAP |
| Datamodell før UI | Sceneforekomst, variant, segment og fortellingstid etableres i fase 1 selv om UI kommer senere | ROADMAP |
| Prosjektbackup | ZIP med JSON + medieliste, med reimport-test, i fase 4 | ROADMAP |
| Lovable-binding mot portabilitet | Lovable-spesifikt bare i UI/adaptere | ADR-0003 |
