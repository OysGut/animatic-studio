# Visuell kontroll – DEC-0079 (Mars' testrunde 13.10.2026)

Kjørt i Chromium mot dev-serveren med mockede Supabase-svar og serverfunksjoner (`tests/visual/funn-0079-ui.mjs`,
fikstur fra `tests/visual/make-fixture.ts`). Skjermbildene lagres utenfor repoet.

| Bilde | Hva som kontrolleres | Krav | Resultat |
|---|---|---|---|
| f01-scene | «I scenen»-merke på ressursene i 2D-scenen, symboler for ressurser uten bilde (også på lerretet), zoomknapper og zoomnivå, «Bevegelse» i 2D-scenens egenskaper | REQ-0595, REQ-0596, REQ-0599, REQ-0593 | OK |
| f02-zoomvalg | Zoom inn går til neste faste nivå | REQ-0599 | OK |
| f03-dobbeltklikk-i-scenen | Dobbeltklikk i «I denne scenen» åpner bildevalget for laget | REQ-0595 | OK |
| f04-bildevalg-bekreft | Siste beskrivelse er satt inn og merket; «IN THE SCREENPLAY» i den automatiske; «Ja, generer» synlig uten å rulle | REQ-0600, REQ-0603, REQ-0605 | OK |
| f05-stor-visning | Stor visning med zoom, beskrivelsen fra AI-jobben, «Sett inn denne beskrivelsen» og «Kopier» | REQ-0601 | OK |
| f06-slett-bilde | Sletting av et bilde med forklaring (Slettede objekter, lag som bruker det) | REQ-0607 | OK |
| f07/f08 | «Animer» (hvert bilde, toere …) og «Speilvend» vannrett/loddrett på laget | REQ-0593, REQ-0606 | OK |
| f09-lydprofil | Hastighet 25–400 % (glidebryter, tall, faste steg) og masker for start og slutt med ny varighet | REQ-0594 | OK |
| f10-ai-stemmer | «Har lyd»/«Mangler lyd» per replikk, oppsummering, stemme per karakter, prøve og avspilling | REQ-0608 | OK |
| f11-bibliotek-slettede | «Slettede objekter» i verktøylinjen og advarsel ved sletting av ressurs | REQ-0607 | OK |
| f12-frilegg-tegn | «Tegn» med farge og «Speilvend» i frileggingen | REQ-0606 | OK |
| f13-format-12 | 12 bilder i sekundet (stop motion) kan velges | REQ-0593 | OK |
| f14-scene-lyd-dra | Lydklipp i sceneeditorens tidslinje kan dras | REQ-0594 | OK |

Regresjon: `verifisering3-ui.mjs` 73/73, `verifisering4-ui.mjs` 58/58 og `interactions-e2e.mjs` 44/44 bestått etter endringene.
