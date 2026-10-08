---
name: lovable-development
description: Holder Animatic Studio kompatibel med Lovable og styrer samspillet GitHub ↔ Lovable (DEC-0005 – Claude skriver all kode i repoet; Lovable brukes til kjøring, Lovable Cloud backend, hemmeligheter, forhåndsvisning og publisering). Dekker Lovables genererte stack (les package.json; TanStack Start/SSR fra mai 2026), filer Lovable eier, synkdisiplin på main (ingen force-push/rebase/squash, lovable-sync-gren ved konflikt), at Lovable ikke kjører migrasjoner eller deployer funksjoner fra Git (synkmelding), .env med VITE_-variabler, filstørrelsesgrenser, AGENTS.md, og presise Lovable-meldinger (mandat 33.3) for oppsett, hemmeligheter, migrasjoner og deploy. Bruk ved push/synk, nye migrasjoner i db/migrations (ikke drizzle/), server-/edge-funksjoner, nye avhengigheter, endringer i package.json, vite/tanstack-konfig, .env, AGENTS.md, eller når noen nevner Lovable, preview, publish, Cloud, secrets eller «sync».
metadata:
  version: "0.1.1"
  owner: "animatic-studio"
  last-reviewed: "2026-10-08"
---

# lovable-development

## 1. Ansvar
**Eier:** kompatibilitet med Lovables genererte prosjekt, synkdisiplin mellom repo og Lovable, leveransesteget (hva Mars må gjøre i Lovable etter en push), og formuleringen av de få meldingene som skal sendes til Lovable.
**Eier ikke:**
- Hvordan funksjoner bygges → Claude bygger alt i repoet (DEC-0005); arkitektur → `architecture-guardian`.
- Skjema/RLS-innhold → `database-domain-modeling` og `secure-development`.
- Git-arbeidsflyt generelt (commit-format) → `git-version-control` når den finnes; denne skillen eier Lovable-reglene for `main`.

**Ikke:** skrive funksjonsprompter til Lovable («lag tidslinjen»). Mars skriver ikke funksjonsprompter (DEC-0005).

## 2. Når den brukes
- Før første kodeendring i et nytt klonet repo (stackverifisering).
- Ved hver leveranse som skal testes i Lovable (push til `main`).
- Ved ny/endret fil i `db/migrations/`, `supabase/functions/`, server functions (`createServerFn`, f.eks. `src/adapters/storage/commands.functions.ts`), `package.json`, `vite.config.*`, `.env`, `AGENTS.md`.
- Når Lovable-preview feiler, synken henger («GitHub ahead»), eller en `lovable-sync`-gren dukker opp.
- Når en plattformspesifikk anbefaling (grenser, funksjoner, priser) skal gis.

## 3. Les først
- `docs/decisions/adr/ADR-0002-plattform-lovable-github.md`, DEC-0005, DEC-0008 i `DECISION_LOG.md`.
- [references/PLATFORM_CONSTRAINTS.md](references/PLATFORM_CONSTRAINTS.md) – plattformfakta med verifiseringsstatus (kilde: `docs/references/technical/LOVABLE_PLATFORM_NOTES.md`).
- [references/SYNC_PROCEDURE.md](references/SYNC_PROCEDURE.md) – leveranse- og konfliktprosedyre.
- [references/LOVABLE_MESSAGE_TEMPLATES.md](references/LOVABLE_MESSAGE_TEMPLATES.md) – maler.
- `docs/development/LOVABLE_SYNC.md` (fast synkmelding; opprettes ved første leveranse hvis den ikke finnes), `AGENTS.md`, `package.json`.
- Krav: REQ-0466–REQ-0473 (mandat 33.3–33.4), REQ-0009 (lagdeling).

## 4. Arbeidsprosedyre
1. **Sjekk gjeldende dokumentasjon** før du påstår noe plattformspesifikt: hent `https://docs.lovable.dev/llms.txt` og relevante sider som `.md`-varianter (f.eks. `…/integrations/github.md`). Står det ikke der, merk påstanden **[UVERIFISERT]** og foreslå en test (mandat 33.4, REQ-0469–REQ-0473). Oppdater PLATFORM_CONSTRAINTS ved endringer.
2. **Verifiser stacken fra repoet**, ikke fra hukommelsen: les `package.json` (`@tanstack/react-start`? `@lovable.dev/vite-tanstack-config`? Tailwind-versjon?), `components.json`, `vite.config.*`, rutemappe (`src/routes/`). Avvik fra ARCHITECTURE.md §1 → `KNOWN_ISSUES.md` + oppdater arkitekturen.
3. **Hold koden SSR-sikker:** Canvas, WebGL, WebCodecs, Web Audio, pdf.js og `window`/`document` lastes bare på klient (dynamisk import i klient-effekt eller klient-only-komponent). `src/engine/` importeres aldri på servernivå. Bygg (`npm run build`) skal passere uten nettleser-API-er.
4. **Respekter filer Lovable eier/bruker** (PLATFORM_CONSTRAINTS §3): ikke flytt eller gi nytt navn til genererte konfigfiler, `src/integrations/supabase/*` (hvis generert), `.lovable/`, `.env`, `drizzle/` (eies av Lovable – rør ikke). Legg egen kode i `src/core`, `src/engine`, `src/adapters`, `src/app`.
5. **Avhengigheter:** legg til bare det som trengs, eksakt versjon i lockfila, og sjekk at Lovables avhengighetsrevisjon ikke avviser den (se `secure-development`). Ingen native-binærer som krever byggesteg Lovable ikke har.
6. **Commit og push** etter SYNC_PROCEDURE: små commits med krav-ID, aldri force-push/rebase/squash på `main`, aldri filer > 10 MB, aldri mediefiler/manus/hemmeligheter.
7. **Avgjør om Lovable må gjøre noe:** ny migrasjon → Mars ber Lovable kjøre SQL-filen `db/migrations/NNNN_navn.sql` uendret (DEC-0022, `docs/development/LOVABLE_SYNC.md`); endret funksjon → «deploy funksjoner»; ny hemmelighet → Mars legger den inn via «Add secret»-skjemaet (aldri i chat). Lag meldingen fra LOVABLE_MESSAGE_TEMPLATES. Ingen endring i disse → ingen melding.
8. **Gi Mars en kort norsk sjekkliste:** «1) Trykk Push i GitHub Desktop. 2) Lim inn denne meldingen i Lovable. 3) Sjekk at forhåndsvisningen viser X.» Ingen sjargong.
9. **Verifiser etterpå** (når Mars har kjørt den): skjemaversjonen appen forventer = databasens (`schema_version`-tabell, ARCHITECTURE §7); `docs/` og `.claude/` er uendret i neste Lovable-commit (`git diff`).

## 5. Leveranse
- Kode/migrasjoner i repoet; ferdig utfylt Lovable-melding (kodeblokk Mars kan kopiere) og norsk sjekkliste i svaret.
- Logg i `SESSION_HANDOVER.md`: hvilke migrasjoner/funksjoner som venter på å bli kjørt i Lovable.

## 6. Kontrollpunkter
- [ ] Plattformpåstander er sjekket mot docs.lovable.dev eller merket [UVERIFISERT].
- [ ] `npm run build` passerer; ingen nettleser-API på serversiden.
- [ ] Ingen hemmeligheter i repo; `.env` inneholder bare offentlige `VITE_`-verdier og er committet.
- [ ] Ingen fil > 10 MB; ingen medier/manus i repo.
- [ ] Migrasjoner er idempotente nok til å tåle å bli kjørt i Lovable (navngitt med tidsstempel, aldri endret etter at de er kjørt).
- [ ] Lovable-melding følger mal: kort, avgrenset, testbar, med «ikke endre»-rekkverk.
- [ ] Den offisielle Lovable-pluginen (MCP) er ikke installert/brukt uten Mars' godkjenning.

## 7. Typiske feil som må unngås
- Å tro at en push kjører migrasjoner eller deployer funksjoner (det gjør den ikke – verifisert).
- Force-push/rebase/squash på `main` → divergens og `lovable-sync`-gren.
- Å gitignore `.env` (knekker preview/publisering) – eller å legge hemmeligheter i den.
- Å be Lovable «fikse» eller «forbedre» kode: Lovables agent kan da endre `src/core/`, `docs/` eller `.claude/` (AGENTS.md forbyr det, men test).
- Store prompter som ber Lovable bygge funksjoner (strider mot DEC-0005 og 33.3 «ikke alt i ett steg»).
- Å installere Lovable-pluginen (MCP): `create_project`/`send_message` bruker kreditter, `deploy_project` publiserer offentlig URL, `query_database` kjører SQL direkte (SKILLS_ASSESSMENT §2.11). Krever Mars' godkjenning (kostnad/publisering, DEC-0006).
- Å påstå tidsgrenser/minne for Cloud-funksjoner som fakta (ikke dokumentert av Lovable).

## 8. Akseptansekriterier / tester
- CI (GitHub Actions): `npm ci && npm run build && npm test` + `python3 scripts/kb/check_kb.py` grønt på `main`.
- Test at `src/core` ikke importerer forbudte moduler (`tests/architecture/core-purity.test.ts`, ADR-0003).
- Første leveranse (ADR-0002 §Verifisering): (a) `docs/` og `.claude/` overlever en Lovable-runde uendret, (b) migrasjon kjørt via synkmelding, (c) RLS-test bestått mot Cloud. Resultatet dokumenteres i PLATFORM_CONSTRAINTS (status fra [UVERIFISERT] til [TESTET]).
- Skjemaversjonssjekk i appen viser tydelig melding hvis migrasjoner ikke er kjørt.

## 9. Dokumentasjon og sporbarhet
- Plattformfunn → `references/PLATFORM_CONSTRAINTS.md` og `docs/references/technical/LOVABLE_PLATFORM_NOTES.md` (med dato og kilde).
- Synkmelding → `docs/development/LOVABLE_SYNC.md`. Ventende Lovable-steg → `SESSION_HANDOVER.md`.
- Prosesskrav REQ-0466–REQ-0473 → `requirements.yaml` (`verification` = dokumentert kontroll), `build_docs.py`, `check_kb.py`.
- Stackavvik, synkproblemer → `KNOWN_ISSUES.md`; vesentlige plattformvalg → ny DEC/ADR (f.eks. bytte fra Cloud til egen Supabase krever Mars – kostnad og «decide early»).
