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
8. Story Lab transfers use pure planning and shared commands for validation and grouped undo.
9. Script explorer reuses pagination, filtering, search and notes; only explicit navigation changes its source.
10. Active scenes use a source-window bus; pinned explorers never publish their browsing selection.
11. Recognition classifies librarySuggestions; AI reviews candidates only, and confirmed commands create assets.
12. Automatic recognition and translation alignment (B-047/B-048) are the only exception to the single text-AI entry point: they run through the server-only service-AI path that forces the built-in AI and builds its prompts on the server, so it can never act as an open AI proxy.
13. User text quotas exclude the two internal service tasks, while service quotas select only built-in service tasks; this keeps user-triggered fallback calls in the user quota. Visual suites updated from schema 40 onward share a schema-version constant to avoid repeated migration edits.
14. RetimeScene uses pure plans and revision checks in one undo; word-gap previews reuse their in-memory audio in saves.
15. Asset Studio stores scene draft steps as field-level changes and saves them in one UpdateSceneDraft with current base revisions; rebasing preserves unrelated fields, and own-write receipts identify exact affected rows, fields and revisions so concurrent edits cannot be silently overwritten.
16. Workspaces (GP1) are read-only to clients and changed only through security-definer functions in the database; linking a project to a workspace never grants project access, so project RLS stays the single source of project permissions.
17. The global library (GP2) is owned by workspaces and written only through security-definer functions; using a global asset copies its files into the project once per global version and keeps the link only as metadata, so projects and backups never depend on workspace membership.
18. Carry-over between scenes (GP3) is planned by the pure planCarryOver and run as one undo group of existing commands; it never targets the source 2D scene, so it cannot mix with an open Asset Studio draft.
19. Film shares (GP5) bind a hashed token to one exported film version uploaded as mp4; the public /se/$token page resolves only through a server function that returns title, format, duration and a short-lived signed URL.
20. Text-layer fonts come only from the licensed catalog in src/core/typography/fonts.ts, load lazily (incl. real italics) via src/engine/typography, and export awaits fontsReady; this keeps startup light and preview/export text identical.
21. Asset-version creation ordering uses compareVersionCreation (timestamp, persisted version number, variant and version IDs); numeric version lists retain number-first ordering, so same-millisecond recordings never depend on random UUID order within a variant.
22. Character Animation reuses composition layers, image segments, selected audio, segment helpers, scene clock and command stack to keep preview/export consistent. Immutable variant rigs are scene-pinned; marking uses one UpdateSceneDraft, preserves frames, and disabling retains setup. Rig-part image imports use a rig-only UpdateSceneDraft; triggers commit approval receipts, which backups omit to preserve ordinary Asset Studio imports and portable restoration.
23. Invitations bind to the invited email: acceptance functions compare it with the signed-in auth email, so a leaked invitation link never grants access to someone else.

24. Note resolution is reversible, not removal; audio edits persist projected alignment without changing sources.
25. MP3 encoding is client-only; owner-confirmed AI-source cleanup rechecks references server-side to protect used media.
26. Dialogue audio versions (DV2): audio_clips own scene placement and the active version; dialogue_versions own file and edit, and the clip's legacy fields are only a mirror written by mirrorDialogueClips, so older readers stay correct while no version edit can be lost.
