/**
 * AVVIKLET (R5, 21.10.2026). Den gamle M1-skjermbildesuiten tok 139 skjermbilder uten automatiske kontroller og
 * fant knapper på norsk tekst; etter B-049 (t()-katalogene) og senere omdøpinger stoppet den med tidsavbrudd.
 * Det den dekket, er nå dekket av suiter med kontroller på norsk og engelsk:
 *   - skjermene og tilstandene: tests/visual/u5-screens.mjs
 *   - plakateksport PDF/PNG (60–66): tests/visual/r5-poster-export.mjs; plakatredigering: interactions-e2e.mjs, p8
 *   - montering, eksport og manus: export-e2e.mjs, p7-prores.mjs, ml3-script-languages.mjs, verifisering3/4-ui.mjs
 * Skriptet finnes på eldre commits i git-historikken. Eldre verifiseringsnotater i requirements.yaml som viser hit,
 * er historiske (manuelle kontroller på den datoen).
 */
console.log("tests/visual/screens.mjs er avviklet (R5). Bruk u5-screens.mjs og r5-poster-export.mjs.");
console.log("RESULTAT 0 bestått, 0 feilet (avviklet)");
