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

# AGENTS.md – instruksjoner for KI-agenter i From Pen to Glass

Claude specifies, reviews, tests and runs migrations; Lovable implements. Active animatic skills and assignments override older repo text.

Kortversjonen († = detaljer i `docs/development/AGENTS_DETAILS.md`):
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
12. Only recognition and translation alignment (B-047/B-048) bypass the text-AI entry point via server-only service AI (built-in model, no open proxy).
13. User quotas exclude these two service tasks; service quotas count only built-in service tasks. Visual suites share one schema constant.
14. RetimeScene uses pure plans and revision checks in one undo; word-gap previews reuse their in-memory audio in saves.
16. Workspaces (GP1) change only via security-definer functions; linking a project never grants access, so project RLS stays the only permission source.
17. The global library (GP2) is written via security-definer functions; using an asset copies its files once per global version, so projects never depend on workspace membership.
18. Carry-over (GP3): pure planCarryOver, one undo group, never the source 2D scene.†
19. Film shares (GP5): a token binds one exported mp4; new tokens derive from a DB-only pepper and are stored only as a peppered digest (film_share_lookup, service role), so /se/$token resolves only via a server function.†
20. src/core/typography, src/core/animation and src/app/asset-studio have their own AGENTS.md; read it first.
21. Asset versions sort via compareVersionCreation.
23. Invitations bind to the invited email: acceptance compares it with the signed-in email, so leaked links grant nobody access.

24. Note resolution is reversible; audio edits persist projected alignment without changing sources.
25. MP3 encoding is client-only; owner-confirmed AI-source cleanup rechecks references server-side to protect used media.
26. Dialogue clips own placement/active choice; versions own file/edit, mirrored only by mirrorDialogueClips.†
27. Batches keep leased receipts so paid calls never replay. Drift is computed; bookmarks are private RPC rows; note flags are commands.
28. Alpha exports share drawFilmFrame; adapters finalize first.

29. Quality profiles use immutable per-result snapshots; a generation_jobs trigger serializes budget reservations under the project lock.
30. Film/alpha exports share a root-mounted browser queue; navigation keeps work, tab closure cannot resume it.

31. Line links use scene-scoped block/translation IDs and reversible commands; backup remaps both, so Norwegian sources never change. ML3: one language version per project+tag; old rows derive from project+language (no backfill).
32. ProRes: own worker encoder, append-only MOV (moov last), so exports stream to OPFS without GPL code.
33. Harmonization (P8): one image runner; "only here" is an archived variant; batches keep receipts so billed work never replays.
34. M6: additive updates, computed forecasts.
35. i18n: new/changed text ships all registered languages, source hashes and machine-review markers. Missing/stale translations fail checks. Only t()/tLocalized, never new L()/localized().†
36. New file-path tables/columns join ORPHAN_REFERENCE_TABLES in the same change, with a test, so cleanup keeps used files.
37. R3: global publish undo/redo is a group-bound history effect (withdraw/republish via security-definer RPC); global rows/files never change.
38. Locked pages use document SHA-256 and import order; blocks without documentId form one legacy document.
39. Rig printing previews a pure mm layout plan; PDF rendering is separate and never writes project data.
40. Product name «From Pen to Glass»; b104-product-name.test.ts bans the old name in user text (explicit exceptions); IDs/keys/formats unchanged.
41. Manifest UI locales use adapter-injected split loading and request-local SSR; core and script/data Lang stay portable.
42. Image ingestion separates pure size/file-selection policy in core from browser decoding/encoding in adapters, preserving immutable source bytes.
43. Print jobs (R5) are project data via apply_changes; copies are one row per physical copy, written only by security-definer RPCs with their own pepper, so keys never leave the QR and lookup returns only project/scene/frame/layer/copy number.
44. Production exchange derives names and timing only in core/interchange; immutable per-shot export-log reservations serialize under the project lock so concurrent exports never reuse versions.
45. All scene choices use `SceneSelect`/`SceneMark`; never use native `<select>` for scenes, so accessibility and scene-mark alignment stay consistent.
46. Dragonframe import keeps EDL/name/time policy in core/interchange and decoding/encoding in the browser; it adds an inactive existing Take so import never replaces finished scene material.
47. Editorial serializers and reel allocation live in core/interchange; browser exports render isolated shot media with handles, so editor transitions are not baked twice.
48. PTG4 mouth sets and tracks use reversible project commands; immutable source receipts compute drift, while core/interchange owns pronunciation, exposure rounding and exports to keep all deliverables aligned.
49. Login globe (B-117): public globe_points returns only server-offset lat/lon and active, never identity; city/last_seen_at follow column-level grants, so new profile/status columns stay unreadable directly.
50. Runtime initialization uses explicitly called exports, never bare imports: sideEffects:false can remove registration code; error capture initializes idempotently before the server handler loads, and the UI catalog loader is initialized by the router. side-effect-imports.test.ts allows no exceptions besides styles and test setup.
51. Nuke/Fusion graph serialization and physical camera mapping live in core/interchange; the browser only streams media and ZIP files, keeping exports aligned with the shared shot model.
52. Showcase media uses database-authorized source reservations before server copying and service-only finalization; public DTOs never carry internal paths, and script snapshots derive only from registered dialogue IDs.
53. Global versions are stored via reserve → upload/copy → server file check → commit RPC; failures delete only unreferenced files and release the reservation, and stale reservations are swept in orphan-cleanup, so no version exists without its file.
54. Server-applied background results reach the local undo list only through adoptServerHistory into a workspace stack opted in with serverHistory=true, deduplicated per command and inverted from change_log, so undo stays an ordinary runCommand without provider calls.
55. Google Fonts licenses come from a generated table of google/fonts METADATA.pb (scripts/fonts/build-font-licenses.mjs), so the app never guesses from name lists or fetches licenses at runtime.
56. The scene editor's current frame lives in a small store (usePlaybackStore); only parts that show the frame subscribe via useFrame/FrameValue, and callbacks read playback.frame from the store, so playback ticks never re-render the workspace; verifisering4-ui caps renders per frame.
57. When a layer's shown image changes, including an UpdateSceneDraft save, applyCommand refits it from the final state in the same change (pure core/composition/refit: insert size for placeholders, kept centre and longest side for new proportions); the inverse is the inverse-only WithLayerRefit, checked server-side as its inner command, so every image path stays undistorted and undoes in one step.
58. Every image thumbnail or small preview renders through src/app/shared/Thumbnail (object-contain over a checker background); thumbnail-architecture.test.ts bans raw <img>, object-cover/fill and bg-cover outside a justified exception list, so thumbnails never crop or stretch.
59. Image-description text versions live on the asset (SetAssetBriefVersions, pure core/assets/brief-versions); edits append and never overwrite, and generated image versions store only briefVersionId, never the server prompt, so text is never lost and results stay traceable.
60. New results are revealed via src/app/shared/reveal (useRevealNew scrolls and flashes new or linked versions); version strips wrap instead of hiding items past an edge, so results never land off-screen.
61. AI image text for an asset always builds on its visual fact sheet: the server studies the script and saves the sheet first when missing (src/adapters/storage/fact-sheet.server, autoAt-stamped SetAssetVisualBrief), and core/generation/fact-sheet adds it to prompt-writer and image calls, so no text or image ignores the script.
62. Images sent to an image model come from pure attachedImageRows (core) with the user's session-only AttachedChoice; the per-model cap is ProviderModel.maxInputImages (fallback MAX_ATTACHED_IMAGES), and the server recomputes the list and legend from the same choice and rejects versions outside the project, so text and images always match.
63. Large dialogs use src/app/shared/ResizableDialogContent (pure limits in dialog-size.ts) with a per-type sizeKey stored via useUiPref (local + profiles.ui_prefs), so resizing, limits and reset behave the same everywhere; small confirmations keep plain DialogContent and content inside uses fluid grid/flex instead of fixed widths.
64. G-1: project source_language is the source of truth through sourceLanguageOf/isSourceLanguage; SOURCE_TEXT_KEY is a language-free source marker, and all source-sensitive audio, translation, serialization and restore paths use project context, so any supported language can be source or target without collisions.
65. Script explorer window, pane widths and notes visibility use pure rules in src/app/script-explorer/window-geometry.ts and are stored via useUiPref (panel, popup and panes keyed separately); "Open in" targets come from projectUrls and open in window.opener from the popup, so the explorer only navigates and never writes.
66. Every window (dialog, popup, sheet, floating panel, page) shows its fixed ID from src/app/ui-ids.ts via UiId or the uiId prop on shared contents; new windows get the next free number with `node scripts/ui-ids/ui-ids.mjs --assign`, numbers are never reused (removed ones stay as «fjernet»), and tests/architecture/ui-ids.test.ts fails on missing, duplicate or unregistered IDs.
67. Punkter under SPERRET i TODO.md skal ikke implementeres eller forberedes, verken helt eller delvis, før Øystein uttrykkelig ber om det.
68. En migrasjonsfil er låst så snart Claude har meldt den kjørt i Cloud, eller den er eldre enn gjeldende EXPECTED_SCHEMA_VERSION i siste publiserte versjon. Endringer skal da alltid i en ny fil (neste nummer), aldri i den gamle. Er du i tvil, lag ny fil.
    Locked migration bytes are guarded by MD5 entries in `tests/fixtures/migration-hashes.json` and `tests/architecture/migration-hashes.test.ts`, so applied history cannot silently drift; Claude updates the hash list after each Cloud run, never to approve edits to a locked file.

