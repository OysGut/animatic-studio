# Visuell kontroll – DEC-0080 (Mars' ønsker 13.–14.10.2026)

Kjørt i Chromium mot dev-serveren med mockede Supabase-svar og serverfunksjoner (`tests/visual/funn-0080-ui.mjs`,
fikstur fra `tests/visual/make-fixture.ts`). AI-svarene (stilanalyse og faktaark) er faste eksempler; ingenting
betales. Skjermbildene lagres utenfor repoet.

| Bilde | Hva som kontrolleres | Krav | Resultat |
|---|---|---|---|
| g01-lagnavn-bredere | Skillet mellom lagnavn og tidslinje dras 160 px bredere; spor og avspillingshode følger | REQ-0610 | OK |
| g02/g02b | Lenken i hintet åpner «Filmens visuelle stil» oppå bildevalget; «Avbryt» gir bildevalget tilbake | REQ-0611 | OK |
| g03-stor-visning-tilpass | Stor visning åpner tilpasset (44 % for 1200 × 1600), med bildeverktøy og vinkelvalg | REQ-0612, REQ-0622 | OK |
| g04-dobbeltklikk-flis | Dobbeltklikk på et bilde i bildevalget åpner stor visning | REQ-0613 | OK |
| g05-utsnitt | Fri markering tegnes; navn, «Lagres i» (eksisterende/nytt objekt), «Fjern luften rundt» | REQ-0615 | OK |
| g06-del-opp-i-ruter | 3 × 2 ruter vises over bildet med nummer; valg av mål | REQ-0615 | OK |
| g07/g07b | «Lag andre vinkler»: modell, ark eller én per vinkel, vinkler, størrelse, beskrivelsen som sendes, pris og bekreftelse | REQ-0623, REQ-0624 | OK |
| g08-oppskaler | SeedVR2/Clarity, 2×/4× med resultatstørrelse, anslag i megapiksler og bekreftelse | REQ-0628 | OK |
| g09-frilegg-zoom | Frileggingen zoomet til 73 % med skarpe piksler, «Tilpass», 100 %, hint om flytting | REQ-0619 | OK |
| g10-skvist-og-forstoerret | Skalering 300 × 220 %: «Nullstill format» aktiv ved begge verdier, advarsel «vises i 300 %» med «Oppskaler bildet …» | REQ-0616, REQ-0617 | OK |
| g11-speilvend-fra-her | «Fra her – glidende snu» med forklaring | REQ-0620 | OK |
| g12-sidehaandtak | Håndtak midt på sidene i tillegg til hjørnene | REQ-0618 | OK |
| g13/g13b | «Vis kun valgt scene»: uten ark, toppjustert; «Sort tekst på hvit bakgrunn» | REQ-0621 | OK |
| g14-stilanalyse | Analysen per del (norsk og engelsk), avkrysning, fargepalett, «Bruk det valgte i stilen» | REQ-0625 | OK |
| g15-faktaark | Utkast fra manuset med AI i biblioteket; «Lagre faktaarket» | REQ-0626 | OK |
| g16-bestillingen-kort | Norsk oppsummering over beskrivelsen og lenke til faktaarket | REQ-0624, REQ-0626 | OK |
| g17-bibliotek-bildeverktoy | «Bildeverktøy …» i biblioteket åpner stor visning med verktøyene | REQ-0615, REQ-0622 | OK |

Regresjon: `verifisering3-ui.mjs` 73/73, `verifisering4-ui.mjs` 58/58, `interactions-e2e.mjs` 44/44 og
`funn-0079-ui.mjs` f01–f14 bestått etter endringene (mockene svarer skjemaversjon 30).

Ikke kontrollert her (krever ekte nøkler): faktisk generering av vinkler, Seedream/Qwen og oppskalering hos
fal.ai, og stilanalyse/faktaark hos Lovable AI. Kravene står derfor som «Implementert – ikke verifisert» til
Mars har prøvd dem.
