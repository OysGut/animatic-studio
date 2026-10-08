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

# AGENTS.md – instruksjoner for alle KI-agenter (Lovable, Claude Code m.fl.)

Dette repoet er **Animatic Studio**. Hovedutviklingen skjer med Claude Code; Lovable brukes til kjøring, hosting, backend (Lovable Cloud), hemmeligheter og testing.

Les `CLAUDE.md` før du gjør endringer. Kort fortalt:

1. **Ikke endre** disse uten eksplisitt beskjed fra Mars: `docs/`, `.claude/`, `scripts/kb/`, `CLAUDE.md`, `AGENTS.md`, `src/core/` (plattformnøytral domenekjerne) og `tests/invariants/`.
2. `docs/product/MASTER_SPECIFICATION.md` er den autoritative produktspesifikasjonen og skal aldri redigeres.
3. Scenenummer er aldri identitet; bruk permanente ID-er. Manus og film deler samme struktur. Ingen destruktive automatiske endringer av ferdig materiale.
4. Hemmeligheter (API-nøkler) skal bare ligge i backend-hemmelighetslageret, aldri i klientkode, repo eller logger.
5. Databasemigrasjoner ligger i `supabase/migrations/`. Når Mars ber om det: kjør ventende migrasjoner og deploy edge/server-funksjoner uten å endre innholdet i dem.
6. Ikke force-push, rebase eller squash på `main`.
