---
name: design-system-director
description: Utvikler og beskytter Animatic Studios filmatiske designsystem (mørkt tema, DEC-0017) – designretning, design tokens, farger, kontrast (WCAG AA), typografi, avstander, radier, ikoner, mikrobevegelser, informasjonshierarki og visuell konsistens på tvers av manus, tidslinje, sceneeditor og paneler. Bruk når du lager eller endrer UI-komponenter, Tailwind-tema, CSS-variabler, shadcn/ui-komponenter, farger, fonter, ikoner, animasjon, tom/laste/feil-tilstander, eller når noen ber om «design», «utseende», «stil», «layout», «theme», «dark mode», «polish» eller visuell gjennomgang. Krever visuell QA med Playwright-skjermbilder før noe kalles ferdig. Motarbeider generiske AI-dashboard-maler. Har forrang over Anthropics frontend-design ved konflikt.
metadata:
  version: "0.1.0"
  owner: "animatic-studio"
  last-reviewed: "2026-10-08"
---

# design-system-director

## 1. Ansvar
**Eier:** den visuelle identiteten – tokens (farge, typografi, avstand, radius, skygge, bevegelse), komponentenes utseende og tilstander, ikonfamilie, visuelt hierarki, mørkt grensesnitt, og visuell QA.
**Eier ikke:**
- Arbeidsflyt, snarveier, dra-og-slipp, paneloppførsel, informasjonsarkitektur → `ux-interaction-design`.
- Komponentarkitektur, state, ytelse i React → `react-typescript-engineering`.
- Om en funksjon skal finnes → `specification-guardian` (mandatet).
- Testoppsett generelt → `test-quality-engineering` (denne skillen eier bare *innholdet* i den visuelle QA-en).

Designsystemet er en **teknisk anbefaling**. Endringer i mandatets designkrav (1.3, 12.2, 30) krever Mars.

## 2. Når den brukes
- Ny eller endret komponent, side, panel, dialog eller tilstand som synes på skjermen.
- Endring i `tailwind.config.*`, `src/app/design/tokens.css` (forslag), `components.json`, globale CSS-filer, fonter eller ikoner.
- Før en UI-oppgave rapporteres som ferdig (visuell QA er obligatorisk).
- Når en annen skill eller ekstern plugin foreslår et nytt visuelt uttrykk.

## 3. Les først
- `docs/design/DESIGN_SYSTEM.md` – tokens og verdier (kilden; denne skillen gjentar dem ikke).
- `docs/design/COMPONENT_INVENTORY.md` – finnes komponenten allerede/er den planlagt?
- `docs/design/UX_PRINCIPLES.md` – særlig P4 (manus ser ut som manus) og P6 (tydelig status).
- Mandat 1.3, 12.2, 30.1–30.3 i `docs/product/MASTER_SPECIFICATION.md`; krav REQ-0011–REQ-0014, REQ-0184–REQ-0187, REQ-0424–REQ-0431.
- `docs/decisions/DECISION_LOG.md`: DEC-0017 (mørkt tema – *Midlertidig antakelse*, Q-02).
- [references/ANTI_PATTERNS.md](references/ANTI_PATTERNS.md) og [references/VISUAL_QA.md](references/VISUAL_QA.md).
- `package.json` / `components.json` for faktisk stack (Tailwind-versjon, shadcn/ui) – ikke anta.

## 4. Arbeidsprosedyre
1. **Finn plassen i systemet.** Slå opp komponenten i COMPONENT_INVENTORY. Gjenbruk eksisterende byggesteiner før du lager nye. Ny komponent → legg den inn i oversikten med krav-ID-er og status «Under arbeid».
2. **Bare tokens.** Bruk semantiske tokens (`--surface-1`, `--text-secondary`, `--status-discrepancy` …). Ingen rå heksverdier, ingen Tailwind-standardfarger (`bg-zinc-800`, `text-blue-500`), ingen vilkårlige verdier (`p-[13px]`). Mangler et token: legg det til i DESIGN_SYSTEM.md med begrunnelse og kontrastberegning, ikke lokalt i komponenten.
3. **Hierarki før pynt.** Bestem hva brukeren skal se først (materialet), deretter handlingene, deretter metadata. Bruk lyshet, vekt og avstand – ikke farge og rammer – for å skape hierarki.
4. **Alle tilstander.** Tegn/implementer standard, hover, aktiv, fokus (synlig ring), valgt, deaktivert, laster, tom, feil – og der relevant: avvik, usikker, låst av annen bruker, deaktivert scene. Status = ikon + tekst + farge.
5. **Domeneregler.** Manusvisning: manusfont, ingen tidskoder/ID-er/varighet i standardmodus (REQ-0102, REQ-0117). Kamerarammer: blå start / rød slutt, ~1 px, eget hjelpelag som aldri eksporteres (REQ-0184–REQ-0187). Scenenummer vises som visningsdata, aldri som nøkkel (INV-02). Deaktivert ≠ skjult: deaktiverte scener vises dempet med merkelapp, skjulte vises ikke.
6. **Bevegelse.** Bare tokenene i DESIGN_SYSTEM §7. Avspillingshode, scrubbing og snapping er alltid umiddelbare. Respekter `prefers-reduced-motion`.
7. **Tekst.** Norsk via oversettelsesstrukturen (DEC-0017), betegnelser fra mandat 30.3. Korte, presise etiketter; feilmeldinger sier hva som skjedde og hva brukeren kan gjøre.
8. **Visuell QA** etter [references/VISUAL_QA.md](references/VISUAL_QA.md): ta Playwright-skjermbilder (1280, 1440, 1920 px; relevante tilstander; ekte manus-utdrag fra `tests/fixtures/screenplay/`), se faktisk på bildene, sjekk mot sjekklisten og ANTI_PATTERNS. «Rendrer uten feil» er ikke ferdig.
9. **Rett opp og ta nye bilder** til sjekklisten er grønn. Lagre referansebilder for visuell regresjon.

## 5. Leveranse
- Kode i `src/components/ui/` (felles) eller `src/app/<arbeidsflate>/` (domene); tokens i én tokenfil koblet til Tailwind-temaet.
- Skjermbilder i `tests/visual/__screenshots__/` (regresjon) og en kort QA-notis i `CURRENT_WORK.md`/`SESSION_HANDOVER.md` med hva som ble kontrollert og hva som avvek.
- Til Mars: vis skjermbildene og forklar på norsk, uten sjargong, hva som er endret og hva som må vurderes av Trollfilm.

## 6. Kontrollpunkter
- [ ] Ingen rå farger/avstander utenfor tokenfila (`grep -E "#[0-9a-fA-F]{3,6}|\[[0-9]+px\]" src/app src/components`).
- [ ] Tekstkontrast ≥ 4,5:1, kontrollkanter og fokusring ≥ 3:1 (beregnet, ikke anslått).
- [ ] Synlig fokusring på alt som kan fokuseres; trefflate ≥ 24 × 24 px.
- [ ] Status har ikon + tekst; kamerafarger brukes ikke utenfor lerretet.
- [ ] Bare Lucide-ikoner (eller egne i samme stil), én størrelse per kontekst.
- [ ] Manusvisning uten teknisk metadata i standardmodus.
- [ ] Skjermbilder tatt og *sett på* i alle tre bredder og relevante tilstander.

## 7. Typiske feil som må unngås
- Generisk AI-dashboard: kortgrid, gradienter, glød, «sparkles», store tomme heltebilder (se ANTI_PATTERNS).
- Å følge Anthropics `frontend-design`-råd om å «ta estetisk risiko» per side. Vi trenger **konsistens** på tvers av hele verktøyet; den skillen er bare referanse (SKILLS_ASSESSMENT §2.1), og denne skillen har forrang.
- Å installere/kjøre `shadcn`-skillen eller `npx shadcn@latest` automatisk (upinnet) – bruk prinsippene, ikke auto-kjøringen (SKILLS_ASSESSMENT §2.17).
- Farge som eneste bærer av status; rød brukt både for feil og kameraslutt i samme flate.
- Lyst modalt «hvitt kort» midt i et mørkt verktøy; ulike radier/skygger fra komponent til komponent.
- Å erklære ferdig etter at testene er grønne uten å ha sett skjermbildene.

## 8. Akseptansekriterier / tester
- Visuelle regresjonstester (Playwright `toHaveScreenshot`) for hver komponent i COMPONENT_INVENTORY med status ≥ «Implementert».
- Automatisk kontrastsjekk av tokenparene (enhetstest som beregner WCAG-kontrast fra tokenfila).
- `axe`-sjekk (via `@axe-core/playwright`, versjon pinnes ved installasjon) uten kritiske funn på hver arbeidsflate.
- Lint/grep-test som feiler ved rå fargeverdier i komponenter.
- Manuell QA etter VISUAL_QA.md dokumentert med dato og skjermbildestier.

## 9. Dokumentasjon og sporbarhet
- Endret token eller regel → oppdater `docs/design/DESIGN_SYSTEM.md` (og ny DEC hvis retningen endres).
- Komponentstatus → `docs/design/COMPONENT_INVENTORY.md`.
- Krav (REQ-0424–REQ-0431, REQ-0184–REQ-0187 m.fl.) → `requirements.yaml`: `status`, `implementation` (filstier), `verification` (testnavn/skjermbildekontroll); kjør `python3 scripts/kb/build_docs.py` og `python3 scripts/kb/check_kb.py`.
- `IMPLEMENTATION_STATUS.md`, `SESSION_HANDOVER.md`; visuelle avvik som ikke rettes → `KNOWN_ISSUES.md`.
- Spørsmål til Trollfilm (lyst tema, kamerarammer) → `OPEN_QUESTIONS.md`.
