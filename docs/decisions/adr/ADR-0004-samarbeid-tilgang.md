# ADR-0004 – Samarbeid og tilgangskontroll
- **Status:** Gjeldende, presisert av DEC-0020 (skrivevei via `apply_command`, hjelpefunksjoner i skjemaet `private`) · **Dato:** 2026-10-08 · **Beslutning:** DEC-0003, DEC-0010 · **Type:** Bekreftet av bruker (behov) + Teknisk anbefaling (løsning)
- **Berørte krav:** REQ-0520–REQ-0529, kap. 28.3 · **Moduler:** COLLAB, SECURITY, CORE, VERSION

## Beslutning
- Tabeller: `project_members(project_id, user_id, role, invited_by, joined_at)`, `project_invitations(id, project_id, email, role, token_hash, expires_at, accepted_at, revoked_at)`.
- Roller (anbefaling): `owner`, `editor`, `commenter`, `viewer`, pluss flagg `can_approve_costs`.
- RLS på ALLE prosjekttabeller: `using (private.is_project_member(project_id))` for lesing; skriving bare via RPC-en `apply_command`, som krever rolle via `private.has_project_role(project_id, 'editor')`. Hjelpefunksjonene er `security definer` med `search_path = ''` (unngår rekursjon). Storage-policyer bruker prosjekt-ID i filstien.
- Samtidighet: hvert redigerbart objekt har `revision`. Alle skrivinger går gjennom RPC-er som krever forventet revisjon og avviser ved mismatch (ingen stille overskriving). Klienten henter ny versjon og viser konflikt/fletting.
- Varsler og tilstedeværelse: Realtime (Postgres Changes for endringer, Presence for hvem som er hvor).
- Angre er per bruker: angre lager en kompenserende kommando for brukerens egen endring (ADR-0005).
## Alternativer
CRDT/Yjs for manusredigering i sanntid: bedre opplevelse ved samtidig skriving i samme blokk, men kompleks persistens og samspill med kommandologg. Vurderes etter MVP.
## Verifisering
`tests/rls/` kjører rollematrise mot database (lokalt/CI med Supabase CLI når tilgjengelig, ellers manuelt sjekkskript). Invarianttest for revisjonskonflikt i core.
