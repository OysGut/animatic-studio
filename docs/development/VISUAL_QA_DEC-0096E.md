# Visuell kontroll – DEC-0096 (fase 2, bolk E: pauser, romlyd, overganger og automatisk avspilling)

Skript: `tests/visual/dec0096-pauses-ui.mjs` (samme mocking som dec0095; analysen svarer med ord hvert 300 ms der det tredje ordet mangler). Resultat 17.10.2026: **31/31**.

| Skudd | Kontroll |
|---|---|
| p01a-tidsredigering | Vanlig markering av ord endrer ikke lyden (§33). «Tidsredigering» er en egen modus; mellomrommene mellom ord med tid vises (4 av 6, ordet uten tid har ingen). |
| p01b-lengre-pause | P1: et mellomrom dras 60 px og pausen blir 300 ms lengre (50 → 350 ms); replikken blir 0,3 s lengre; avstanden viser pausen (§35); det endrede området spilles automatisk (E2/P8); pausen fylles med romlyd fra opptaket (P6). Tallfelt (P5), digital stillhet (P7), naturlig romlyd igjen, kortere pause ned til 0 og aldri negativ. Angre tilbake til start. |
| p01c-fordelt | P3/P4: tre markerte ord trekkes fra hverandre med 600 ms = 300 + 300; uten avkrysning spilles ingenting (E3); å dra et markert ord fordeler også tiden likt. Vanlig visning av replikken er uendret (REQ-0707). |
| (p02/p03) | Valget «Spill av automatisk etter endring» huskes. |
| p04-overgang | Ingen overgang med ett opptak; etter «Sett inn etter» med et annet take vises skjøten (REQ-0709). Toning, romlyd under skjøten (én del), valg av opptak romlyden hentes fra – et opptak uten stille partier gir en tydelig melding – og forhåndslytting. Romlyden kan slås av igjen. |
| p05-en | Tidsredigeringen på engelsk. |

Også kjørt 17.10: dec0095 16/16, dec0094 20/20. dec0093 25/28 – de tre feilene finnes også uten bolk E (KI-249). Vitest 156 filer / 1294 tester, DB 65/65.
