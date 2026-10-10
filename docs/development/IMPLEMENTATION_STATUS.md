# Implementeringsstatus – Animatic Studio

Oppdatert: 2026-10-09 (økt 4). Detaljert status per krav: `docs/product/TRACEABILITY_MATRIX.md` (generert).

## Sammendrag
- **M0 Fundament:** ferdig.
- **M1 Skjelett og kjerne:** ferdig og kjørt i Lovable (migrasjon 0001, innlogging, prosjekt).
- **M2 Manus del 1:** levert og testet av Mars i Lovable (import, visning, redigering, eksport – også i Safari).
- **M2 Manus del 2:** levert og testet av Mars (versjoner, sammenligning, historisk nummerering, søk/filter, «Vis kun valgt scene», varighet, tilstedeværelse). Migrasjon 0003 kjørt.
- **Mars' ønsker etter M2 (DEC-0029, DEC-0031):** rekkefølge/synlighet bare i redigeringsmodus, flyttede scener markert til ny versjon, fyldigere sammenligning (linje for linje), notater i manus (på ord og som nål, stempel, sletting med advarsel, vis/skjul, søk, eksport/import som Word-kommentarer og PDF-merknader), søketreff markert, scenelisten følger manuset, valgt scene øverst. Kode og tester ferdig.
- **M3 del 1 Ressursbibliotek (DEC-0030):** karakterer, objekter, lokasjoner, dyr, miljøer; alternative navn; visuelle varianter med bildeversjoner og godkjenning; «brukt i scener»; forslag fra manuset; karakterfilter med alle navn. Kode og tester ferdig. Venter på push og migrasjon 0004.
- **M3 del 2 Sceneeditor og M4 Montering og lyd (DEC-0035–0045):** 2D-scener med lag, nøkkelbilder og kamera; filmtidslinje og eksport av animatic; lydspor, lyd over flere scener, lydprofil med volumpunkter. Se `SESSION_HANDOVER.md`.
- **M5 del 1 AI-bilder (DEC-0045):** generering av ressursbilder via Lovable AI Gateway med synlig prompt, bekreftelse, grenser og logg. Ikke prøvd mot ekte gateway ennå (KI-61).
- **Prosjektliste (DEC-0046):** slett prosjekt (eier), forlat prosjekt, ressurser fra slettede prosjekter, zip-nedlasting per kategori. **M4 del 3 (DEC-0047):** importert ferdig film, «Bruk denne», overganger, replikk → avspillingshode.
- **Krav:** 172 verifisert, 13 implementert – ikke verifisert, 48 under arbeid, 338 ikke startet (av 571).

## Tester (alle grønne 2026-10-09)
| Testsett | Antall | Kjøres med |
|---|---|---|
| Enhet, scenarier, kontrakt, eksport, nummerering, versjoner, filter, varighet, bibliotek, notater (inkl. Word/PDF-rundtur), regresjoner (`tests/unit`, + 1 Lovable-test) | 105 | `bun run test` |
| Egenskapsbaserte invarianttester (`tests/invariants`) – 150 tilfeldige sekvenser × 40 kommandoer, 18 kommandogrupper (også bibliotek og notater) | 9 | `bun run test` |
| Gyldne tester mot referansemanuset (`tests/golden`) – hoppes over uten manusfilene | 6 | `bun run test` (lokalt hos Claude) |
| Arkitektur (`tests/architecture`) | 1 | `bun run test` |
| Database (`tests/db`) – RLS, revisjon, atomisitet, invitasjoner, uforanderlighet, import, profiler, unik plass, versjoner, bibliotek, notater | 22 | `bun tests/db/run-db-tests.ts` |
| Visuell QA (`tests/visual`) – 27 skjermbilder med mockede data, pluss import av ekte PDF i nettleseren | manuell vurdering | `node tests/visual/screens.mjs` |
| GitHub Actions | `knowledge-base.yml`, `tests.yml` (ny: typekontroll, Vitest, databasetester) | automatisk ved push |

## Målinger mot «Jula på Dovre» (norsk PDF, 106 sider)
- Import: 97 scener (96 nummererte, 1 unummerert), 2 193 blokker, 0 usikre elementer; engelsk DOCX gir samme struktur.
- Låste sider: 105 manussider og alle 97 scenestarter på samme side som originalen. Fri sidebryting: alle innen ±1 side, 63 eksakt.
- Eksportert PDF leses inn igjen med identiske scener, numre, tekst og sider. DOCX åpnet i LibreOffice: 105 sider manusformat.

## Moduler
| Modul | Status | Hva finnes |
|---|---|---|
| CORE | Under arbeid | Kommandoer med invers (40 typer), invarianter, visninger, endringssett, notater |
| SCRIPT | Under arbeid | Tolkning PDF/DOCX, import, sidebryting, låste sider, nummerering, arbeidsflaten «Manus» |
| EXPORT | Under arbeid | Manus til PDF (sidetro) og DOCX (redigerbar); animatic-video (MP4/WebM) i nettleseren uten lyd (DEC-0043) |
| VERSION | Under arbeid | Blokkrevisjoner, kommandologg, angre/gjør om per bruker, `outdatedTakes`, manusversjoner med sammenligning linje for linje |
| LIBRARY | Under arbeid | Ressursbibliotek med alternative navn, varianter, bildeversjoner, godkjenning, bruk i manus, forslag (DEC-0030) |
| COLLAB | Under arbeid | Medlemskap, roller, invitasjoner, profiler, sanntid, revisjonskontroll |
| SECURITY | Under arbeid | RLS, `apply_changes` bare for service_role, inverskommandoer bare fra egen historikk, privat bøtte for originaler |
| TIMELINE / CONTINUITY | Under arbeid | Tidsmodell, fortellingstid; filmtidslinjen «Montering» med flytting, lengder, avspilling av hele filmen (DEC-0043) |
| UI | Under arbeid | Prosjekt, manus (navigator, sider, inspektør, import, eksport, versjoner, notater, søketreff), ressursbibliotek |
| AUDIO | Under arbeid | Lydfiler i biblioteket, lydspor i monteringen (dialog, forteller, effekter, atmosfære, musikk), Web Audio-avspilling og miksing i eksporten (DEC-0044); lyd som løper over flere scener, lydprofil med volumpunkter, lyd i scenene rundt og bølgeformer i sceneeditoren (DEC-0045) |
| Øvrige moduler | Ikke startet | – |
