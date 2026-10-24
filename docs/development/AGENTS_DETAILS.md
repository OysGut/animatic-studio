# AGENTS.md – detaljer

Utfyllende tekst til reglene som er merket † i `AGENTS.md`. Reglene der gjelder fortsatt i sin helhet; her står
detaljene som ikke trengs i hver økt (flyttet hit i R7 for å holde `AGENTS.md` under størrelsesgrensen).

**18. Overføring mellom scener (GP3).** Carry-over between scenes is planned by the pure `planCarryOver` and run
as one undo group of existing commands; it never targets the source 2D scene, so it cannot mix with an open
Asset Studio draft.

**19. Filmdeling (GP5).** Film shares bind a hashed token to one exported film version uploaded as mp4; the
public `/se/$token` page resolves only through a server function that returns title, format, duration and a
short-lived signed URL.

**26. Replikklyd (DV).** Dialogue clips own placement/active choice; versions own file/edit, mirrored only by
`mirrorDialogueClips`. Character rows are projections; voice defaults never touch old audio.

**35. i18n.** All text uses `t()`/`tLocalized` with keyed catalogs and a frozen AST baseline (no text lost);
`check.mjs` rejects new `L()`/`localized()`; `authored.json` holds plural/select/date messages; `tm()` only for
old stored server messages. No remount on language switch; server error codes are additive. Builds stop unless
nb/en are complete; the script PDF stops on glyphs Courier lacks.

**57. Layer refit (full rule).** When a layer's shown image changes, including an UpdateSceneDraft save, applyCommand refits it from the final state in the same change (pure core/composition/refit: insert size for placeholders, kept centre and longest side for new proportions); the inverse is the inverse-only WithLayerRefit, checked server-side as its inner command, so every image path stays undistorted and undoes in one step.
