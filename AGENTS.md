<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AGENTS.md – instruksjoner for KI-agenter i Animatic Studio

Fra fase 3 (oktober 2026) er arbeidsdelingen slik:
- Claude er dirigent. Claude lager spesifikasjonene, går gjennom koden, kjører testene og kjører databasemigrasjonene.
- Lovable skriver koden etter Claudes oppdrag.

Arbeidsreglene i detalj står i Lovable workspace-skills `animatic-*`: animatic-oppdrag, animatic-arkitektur-og-data, animatic-ui-designsystem, animatic-testing, animatic-i18n, animatic-ai-tekst og animatic-story-lab. Skillene og oppdraget går foran eldre tekst i dette repoet.

Kortversjonen:
1. Endre bare det oppdraget ber om. Spør hvis noe er uklart.
2. `docs/product/MASTER_SPECIFICATION.md` er den autoritative produktspesifikasjonen og skal aldri redigeres. `docs/`, `.claude/`, `scripts/kb/` og `CLAUDE.md` endres bare når oppdraget sier det.
3. Scenenummer er aldri identitet; bruk permanente ID-er. Manus og film deler samme struktur. Ingen destruktive automatiske endringer av ferdig materiale.
4. Hemmeligheter (API-nøkler) skal bare ligge i backend-hemmelighetslageret, aldri i klientkode, repo eller logger.
5. Migrasjoner skrives som `db/migrations/NNNN_navn.sql`. Lovable kjører dem aldri; Claude kjører dem etter at DB-testene er grønne. `src/integrations/supabase/` er autogenerert.
6. Ikke force-push, rebase eller squash på `main`.
7. Story Lab-visningene bygger de lagrede turene opp igjen med `src/core/storylab/replay.ts`.
8. Story Lab transfers are planned in the platform-neutral transfer helper and executed through the shared command stack; this preserves validation and grouped undo without direct project-data writes.
9. The script explorer reuses screenplay pagination, filtering, search and annotations; its local selection never changes the source workspace except through explicit navigation.
10. Active scenes travel over a source-window-scoped browser bus; pinned explorers never publish their own browsing selection.
11. Entity recognition extends librarySuggestions with pure lexical classification; optional AI reviews existing candidates only, and assets are created exclusively through the existing confirmed command flow.
