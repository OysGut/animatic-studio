# ADR-0002 – Plattform: GitHub-repo opprettet av Lovable, Lovable Cloud som backend
- **Status:** Gjeldende (må testes ved første leveranse) · **Dato:** 2026-10-08 · **Beslutning:** DEC-0005, DEC-0008 · **Type:** Bekreftet av bruker (arbeidsform) + Teknisk anbefaling (backend)
- **Berørte krav:** REQ-0002-familien, prosesskrav kap. 33/35, sikkerhetskrav kap. 28 · **Moduler:** SECURITY, CORE, PROCESS

## Kontekst
Mars vil ikke skrive funksjonsprompter i Lovable. Claude skal bygge alt i GitHub, og Lovable skal kjøre løsningen. Verifisert i Lovables dokumentasjon (se `docs/references/technical/LOVABLE_PLATFORM_NOTES.md`):
- Lovable kan ikke importere et eksisterende repo, bare opprette et nytt (privat som standard). Toveis synk på én gren (`main`).
- Nye prosjekter (fra 13.05.2026) bruker TanStack Start (SSR, Vite, Nitro, server functions som Cloudflare Worker). Rammeverk og database kan ikke velges.
- Lovable kjører ikke migrasjoner og deployer ikke funksjoner som kommer via Git.
- Filer over 10 MB kan ikke lagres av Lovable; GitHub avviser over 100 MB.
- Lovable leser `AGENTS.md`/`CLAUDE.md` i repoet.
## Beslutning
1. Mars oppretter Lovable-prosjektet og kobler GitHub. Claude bygger i det genererte repoet og følger stacken Lovable genererer (verifiseres fra `package.json` ved første klone).
2. Backend: Lovable Cloud. Skjema, RLS og funksjoner skrives som filer i repoet (`supabase/migrations/`, `supabase/functions/` eller server functions). Etter hver leveranse sender Mars én fast melding i Lovable (`docs/development/LOVABLE_SYNC.md`).
3. Mediefiler lagres i Storage, aldri i repoet.
4. `AGENTS.md` instruerer Lovables agent om hva den ikke skal endre.
## Alternativer
- Eget Supabase-prosjekt: full CLI/dashboard-kontroll, men ekstra konto og manuell SQL for Mars; Supabase-API-et er ikke nåbart fra Claudes miljø. Kan velges senere ved eksport (skjemaet ligger i repoet).
- Ikke bruke Lovable i det hele tatt (f.eks. Vercel + Supabase): i strid med mandat 1.2.
## Konsekvenser
+ Mars trenger bare GitHub Desktop og Lovable. − Avhengig av at Lovable utfører synkmeldingen korrekt; må testes. SSR krever at nettleserspesifikke biblioteker (canvas, WebCodecs, Web Audio) bare lastes på klienten.
## Verifisering
Første leveranse: (a) `docs/` og `.claude/` overlever en Lovable-runde uendret, (b) migrasjon kjøres via synkmeldingen, (c) RLS-test bestås mot Cloud.
