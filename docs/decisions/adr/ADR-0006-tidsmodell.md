# ADR-0006 – Tidsmodell
- **Status:** Gjeldende · **Dato:** 2026-10-08 · **Beslutning:** DEC-0012 · **Type:** Teknisk anbefaling
- **Berørte krav:** kap. 6.4, 15, 16.2, 23.6 · **Moduler:** TIMELINE, AUDIO, COMPOSE, CAMERA

## Beslutning
- Bildefrekvens som rasjonelt tall `{num, den}` per produksjon. All tid som heltall bilder.
- Fire tidsrom (mandat 6.4): lokal scenetid, segmenttid, kildeklipptid, absolutt filmtid. Bare de tre første lagres; absolutt tid beregnes fra aktiv rekkefølge (flytt av scene → tidskoder beregnes på nytt, interne koblinger uendret).
- Kildeklipp med annen bildefrekvens beholder sin egen rate; konvertering skjer ved avspilling/eksport (nærmeste bilde, dokumentert avrunding).
- Lyd i samples med egen samplerate.
- Tidskoblinger (manusblokk ↔ tidsintervall) refererer til `{owner_id, owner_kind, start_frame, end_frame}` i lokal tid for eieren.
## Verifisering
Enhetstester for konvertering og avrunding; invarianttest: flytting endrer ikke lokale koblinger.
