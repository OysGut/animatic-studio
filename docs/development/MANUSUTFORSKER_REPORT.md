# Manusutforskeren – stålkontroll (Øystein 23.10.2026)

Oppdraget er delt i to leveranser. Denne rapporten dekker **leveranse 1 (punkt 1–3)**. Punkt 4 (avansert navigasjon) kommer som leveranse 2 med egen rapportdel.
Bare navigasjon og visning. Ingen nye data, ingen migrasjon, ingen betalte kall, ikke publisert.

## 1. Størrelse og vindu
- Alle fire kanter og alle fire hjørner kan dras. Kant- og hjørnegrepene lyser opp ved hover og har riktig markør (ns/ew/nesw/nwse). Hjørnet nede til høyre er alltid synlig, større (24 px) og kan også styres med piltastene.
- Dobbeltklikk på tittellinjen maksimerer og gjenoppretter. Nye knapper i tittellinjen: «Fest til venstre halvdel», «Fest til høyre halvdel» og «Maksimer / Gjenopprett størrelsen».
- Plass, størrelse og oppsett huskes per bruker med samme mekanisme som dialogstørrelsen (`useUiPref`: nettleseren med én gang, kontoen litt etter). Under dra brukes en midlertidig verdi; lagringen skjer når brukeren slipper.
- Popup-vinduet husker sin egen størrelse og plass på skjermen (lagres når brukeren slutter å endre størrelse og når vinduet lukkes) og åpnes med dem neste gang.
- Treffene til venstre og sidepanelet til høyre har dra-skiller (også piltaster). Bredden huskes.
- Rene regler: `src/app/script-explorer/window-geometry.ts` (minst 320 × 240, aldri utenfor vinduet, motsatt kant står stille).

## 2. Notater
- Notatpanelet vises bare når scenen har notater, eller når en blokk eller tekst er valgt å skrive notat på.
- Knappen «Notater (n)» i verktøylinjen lukker og åpner panelet. Valget huskes. Klikk på et notatmerke i teksten åpner panelet igjen.
- Bryteren «Notatmerker i teksten» slår markeringene av og på (huskes).

## 3. «Åpne i …»
- Knapperad under statuslinjen: Manus (scene og blokk), Montering (avspillingshodet på scenen/blokken), Sceneeditor, Replikk og lyd (sceneeditoren med `line=`; inaktiv med forklaring til en replikk er valgt) og Story Lab (scenen som tidspunkt; Story Lab godtar alle scener).
- Brikker for karakterer, rekvisitter og steder i scenen, ut fra ressursbruken (`assetUsage`, regnet én gang per tilstand). Hver brikke har en meny: «Åpne i biblioteket», «Filtrer utforskeren på denne», «Neste opptreden», «Forrige opptreden», «Første opptreden» og «Alle scener med …» (liste med scenene).
- Klikk på talernavnet i manusteksten, eller på et karakternavn i handlingen (der nettleseren kan si hvilket ord som ble klikket), gir samme meny.
- Fra popup-vinduet åpnes alle mål i hovedvinduet (`window.opener`), som før.
- Tastatur og skjermleser: menyen har `role="menu"`, piltaster/Home/End, Esc lukker; brikkene har `aria-haspopup`/`aria-expanded`; alle merkelapper via i18n.

## Tester
- Ny: `tests/unit/script-explorer-control.test.tsx` (18): geometri for alle kanter/hjørner, grenser, maksimer/fest, popup-egenskaper; panelet husker plass etter dra og etter maksimering; piltast på hjørnegrepet; notater skjules/vises og huskes; merkebryteren; panelbredde; alle «Åpne i»-mål; navigasjon i hovedvinduet og via `window.opener` fra popup; brikkemeny (neste, første, alle scener, filtrer, bibliotek, Esc, piltaster); klikk på talernavn; engelsk visning.
- Eksisterende: testoppsettet i `script-explorer-focus` og `script-explorer-flow` fikk et minnelager for visningsvalg. I `flow` venter testen nå på notatpanelet etter at blokken er valgt, fordi oppdraget sier at panelet skal være skjult før det. Ingen forventninger ble svekket.
- Resultat: tsc 0. Hele Vitest grønn (2595 bestått, 10 hoppet over) etter oppdatert tekstoversikt. i18n-sjekken grønn. Script-explorer-suitene på nb og en: 37/37.
- `tests/visual/script-explorer-ui.mjs` er ikke kjørt (krever innlogget økt).

## Skjermbilder
Ikke tatt ennå: forhåndsvisningen har ingen innlogget økt, og det finnes ingen konto som matcher e-posten din. Skjermbildene legges inn her når jeg vet hvilken konto jeg skal teste med.

## Nye tekster (script-explorer2.*)
window.snap-left, window.snap-right, window.maximize, window.restore, open.group, open.script, open.assembly, open.assembly-aria, open.scene, open.scene-aria, open.dialogue, open.dialogue-aria, open.dialogue-none, open.storylab, open.storylab-aria, chips.label, chip.menu, menu.library, menu.filter, menu.next, menu.prev, menu.first, menu.all, menu.scene, notes.toggle, notes.marks, panes.hits, panes.side.
nb og en er skrevet selv. de, es, fr, it, ja, ko, pt-BR og ru er maskinoversatt og merket for gjennomlesing.

## Leveranse 2 (punkt 4)
Ikke startet: sceneoversikt med statusfilter, hurtigtaster med «?»-hjelp, historikk og smulespor, hopp til neste/forrige, søkefiltre, minikart, «Kopier lenke», side om side med kildespråket (og fjerning av kommentaren om «norsk kilde»), bokmerker.
