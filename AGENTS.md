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

Arbeidsreglene står i workspace-skills `animatic-*`; skillene og oppdraget går foran eldre repotekst.

Kortversjonen:
1. Endre bare det oppdraget ber om. Spør hvis noe er uklart.
2. `docs/product/MASTER_SPECIFICATION.md` er den autoritative produktspesifikasjonen og skal aldri redigeres. `docs/`, `.claude/`, `scripts/kb/` og `CLAUDE.md` endres bare når oppdraget sier det.
3. Scenenummer er aldri identitet; bruk permanente ID-er. Manus og film deler samme struktur. Ingen destruktive automatiske endringer av ferdig materiale.
4. Hemmeligheter (API-nøkler) skal bare ligge i backend-hemmelighetslageret, aldri i klientkode, repo eller logger.
5. Migrasjoner skrives som `db/migrations/NNNN_navn.sql`. Lovable kjører dem aldri; Claude kjører dem etter at DB-testene er grønne. `src/integrations/supabase/` er autogenerert.
6. Ikke force-push, rebase eller squash på `main`.
7. Story Lab views rebuild saved turns via `src/core/storylab/replay.ts`; transfers use pure plans and shared commands for validation and grouped undo.
9. Script explorer reuses pagination, filtering, search and notes; only explicit navigation changes its source.
10. Active scenes use a source-window bus; pinned explorers never publish their browsing selection.
11. Recognition classifies librarySuggestions; AI reviews candidates only, and confirmed commands create assets.
12. Only recognition and translation alignment (B-047/B-048) bypass the text-AI entry point: server-only service AI forces the built-in model and builds prompts, never an open proxy.
13. User quotas exclude these two service tasks; service quotas count only built-in service tasks. Visual suites share one schema-version constant.
14. RetimeScene uses pure plans and revision checks in one undo; word-gap previews reuse their in-memory audio in saves.
16. Workspaces (GP1) change only via security-definer functions; linking a project never grants access, so project RLS stays the only permission source.
17. The global library (GP2) is written via security-definer functions; using an asset copies its files once per global version, so projects never depend on workspace membership.
18. Carry-over between scenes (GP3) is planned by the pure planCarryOver and run as one undo group of existing commands; it never targets the source 2D scene, so it cannot mix with an open Asset Studio draft.
19. Film shares (GP5) bind a hashed token to one exported film version uploaded as mp4; the public /se/$token page resolves only through a server function that returns title, format, duration and a short-lived signed URL.
20. Subdirectories have their own AGENTS.md (src/core/typography, src/core/animation, src/app/asset-studio); read it before changing files there.
21. Asset-version order uses compareVersionCreation so same-millisecond recordings stay deterministic.
23. Invitations bind to the invited email: acceptance functions compare it with the signed-in auth email, so a leaked invitation link never grants access to someone else.

24. Note resolution is reversible, not removal; audio edits persist projected alignment without changing sources.
25. MP3 encoding is client-only; owner-confirmed AI-source cleanup rechecks references server-side to protect used media.
26. Dialogue clips own placement/active choice; versions own file/edit, mirrored only by mirrorDialogueClips. Character rows are projections; voice defaults never touch old audio.
27. Batches keep leased receipts so paid calls never replay. Drift is computed; bookmarks are private RPC rows; note flags are commands.
28. Alpha exports share drawFilmFrame; adapters finalize first.

29. Quality profiles use immutable per-result snapshots; a generation_jobs trigger serializes budget reservations under the project lock.
30. Film/alpha exports share a root-mounted browser queue; navigation keeps work, tab closure cannot resume it.

31. Line links use scene-scoped block/translation IDs and reversible commands; backup remaps both, so Norwegian sources never change. ML3: one language version per project+tag; old rows derive from project+language (no backfill).
32. ProRes: own worker encoder, append-only MOV (moov last), so exports stream to OPFS without GPL code.
33. Harmonization (P8): one image runner; "only here" is an archived variant; batches keep receipts so billed work never replays.
34. M6: additive updates and computed forecasts.
35. i18n: all text uses t()/tLocalized with keyed catalogs and a frozen AST baseline (no text lost); check.mjs rejects new L()/localized(); authored.json holds plural/select/date messages; tm() only for old stored server messages. No remount on language switch; server error codes additive. Builds stop unless nb/en are complete; script PDF stops on glyphs Courier lacks.
36. New file-path tables/columns join ORPHAN_REFERENCE_TABLES in the same change, with a test, so cleanup never deletes used files.
