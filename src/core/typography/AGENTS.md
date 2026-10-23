# AGENTS.md – typography

- Tekstlag bruker den faste katalogen pluss prosjektets fontressurser (`kind = 'font'`). Begge lastes lat, og eksporten venter på `fontsReady`. (Endret i B-098.)
- PDF text outside WinAnsi uses lazily loaded Noto fonts chosen per script by pure core/typography/pdf-scripts (screenplay via jsPDF, posters as print-resolution text images), and poster texts are BCP-47 language maps, so no export assumes Norwegian or Latin script.
