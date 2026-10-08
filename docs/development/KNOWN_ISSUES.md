# Kjente problemer og risikoer – Animatic Studio

| ID | Dato | Beskrivelse | Konsekvens | Tiltak | Status |
|---|---|---|---|---|---|
| KI-01 | 2026-10-08 | Mandatet har mange dupliserte linjer og en tom kodeblokk (l. 173–176) | Ingen funksjonell; kan forvirre | Bevart uendret; dokumentert i SPEC_MANIFEST. Ryddes i ev. v15 av Mars | Åpen (kosmetisk) |
| KI-02 | 2026-10-08 | Referansemanus: filnavn sier «Draft 9.2», tittelsiden «Draft 9.3» | Feil versjonsmerking i tester | Bruk tittelsidens «Draft 9.3» som versjon | Åpen |
| KI-03 | 2026-10-08 | Lovables genererte stack var ikke verifisert | Skills/arkitektur kunne måtte justeres | Verifisert 2026-10-08 fra `package.json`: TanStack Start 1.168 (SSR, Nitro), React 19, Vite 8, Tailwind 4, shadcn/ui (new-york, Radix), TanStack Query, Vitest 4, bun.lock. Ingen backend aktivert ennå | Lukket |
| KI-04 | 2026-10-08 | Lovable kjører ikke migrasjoner og deployer ikke funksjoner fra Git | Database kan være utdatert i Lovable | Fast synkmelding (LOVABLE_SYNC.md B); `schema_version`-sjekk i appen | Åpen – testes M1 |
| KI-05 | 2026-10-08 | Supabase-API (api.supabase.com) er ikke nåbart fra Claudes miljøer | Claude kan ikke kjøre migrasjoner eller RLS-tester mot Cloud selv | RLS-tester kjøres lokalt med pg (Docker/pglite) der mulig; ellers via Lovable | Åpen |
| KI-06 | 2026-10-08 | Commit-SHA-er for eksterne skills kunne ikke verifiseres (GitHub-API blokkert) | Eksterne skills kan ikke pinnes ennå | Ingen eksterne skills installert (EXTERNAL_SKILLS_POLICY) | Åpen |
| KI-07 | 2026-10-08 | Det er uverifisert at `docs/`, `.claude/` og `.github/` overlever Lovable-runder uendret | Fundamentet kan bli endret av Lovables agent | AGENTS.md + CI-kontroll; test ved første synk | Åpen – M1 |
| KI-08 | 2026-10-08 | Paginering lik Final Draft er ikke garantert | Sideskift kan avvike fra originalen | Gyldne tester mot referansemanus; original-PDF vises ved siden av | Åpen – M2 |
| KI-09 | 2026-10-08 | Engelsk DOCX bruker mellomrom for layout, ikke ekte manusformatering | Importen må tolke mellomromsmønstre | Egen klassifisering for DOCX med fast bredde (ADR-0007) | Åpen – M2 |
| KI-10 | 2026-10-08 | Lovable Cloud er ikke aktivert i prosjektet ennå (ingen `supabase/`-mappe) | Database/innlogging kan ikke bygges før aktivering | Mars aktiverer Lovable Cloud (LOVABLE_SYNC.md A2) | Åpen – før M1 |
| KI-11 | 2026-10-08 | `vitest.config.ts` tar bare med `src/**`-tester | Tester i `tests/` kjøres ikke | Utvides i M1 | Åpen – M1 |
